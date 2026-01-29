// Question Parser Worker
// Handles regex operations for parsing images in questions

self.onmessage = function(e) {
  const { questionText, questionNum, task } = e.data;
  
  try {
    if (task === 'parseImages') {
      const result = parseImagesInQuestion(questionText, questionNum);
      self.postMessage({ result, task });
    } else if (task === 'parseBatch') {
      // Process multiple questions in parallel
      const questions = e.data.questions;
      const results = questions.map((q, idx) => ({
        index: idx,
        processed: parseImagesInQuestion(q.question, q.num)
      }));
      self.postMessage({ result: results, task });
    } else {
      self.postMessage({ error: `Unknown task: ${task}` });
    }
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};

function parseImagesInQuestion(questionText, questionNum) {
  const dataUriPattern = /(data:image\/[^;]+;base64,[^\s<>"']+)/gi;
  const urlPatternWithExt = /(https?:\/\/[^\s<>"']+\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?[^\s<>"']*)?)/gi;
  
  if (!questionText || typeof questionText !== 'string') {
    return questionText || '';
  }
  
  const hasImgTags = /<img[^>]*>/i.test(questionText);
  if (hasImgTags) {
    return questionText;
  }
  
  let processedText = questionText;
  let imageCounter = 0;
  
  // Process base64 images
  processedText = processedText.replace(dataUriPattern, (match) => {
    imageCounter++;
    const imageId = `img-${questionNum}-${Date.now()}-${imageCounter}`;
    return createImageHTML(match, imageId, questionNum, true);
  });
  
  // Process URL images with extensions
  processedText = processedText.replace(urlPatternWithExt, (match) => {
    imageCounter++;
    const imageId = `img-${questionNum}-${Date.now()}-${imageCounter}`;
    return createImageHTML(match, imageId, questionNum, false);
  });
  
  // Fallback: treat certain standalone URLs as images, but avoid known non-image
  // URLs (HTML pages, site root, local index, etc.) to prevent noisy errors.
  if (imageCounter === 0) {
    const urlPatternPermissive = /(https?:\/\/[^\s<>"']+)/gi;

    processedText = processedText.replace(urlPatternPermissive, (urlMatch) => {
      const trimmedUrl = urlMatch.trim();

      // Split trailing punctuation so we don't treat "index.html)" as a different URL
      const urlPartsMatch = trimmedUrl.match(/^(https?:\/\/[^\s<>"']+?)([)\].,;!?]+)?$/i);
      const urlCore = (urlPartsMatch?.[1] || trimmedUrl).trim();
      const trailingPunctuation = urlPartsMatch?.[2] || '';

      // Skip known non-image pages (site root / local dev index)
      try {
        const parsed = new URL(urlCore);
        const isProdHost = parsed.hostname === 'barry-so.github.io';
        const isLocalDev = (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') && parsed.port === '5500';
        const isRootOrIndex = parsed.pathname === '/' || parsed.pathname === '/index.html';

        if ((isProdHost && isRootOrIndex) || (isLocalDev && isRootOrIndex)) {
          return urlMatch;
        }
      } catch {
        // If URL parsing fails, fall through to checks below.
      }

      // If URL has a file extension that is clearly non-image (e.g. .html),
      // don't treat it as an image.
      try {
        const parsed = new URL(urlCore);
        const pathname = parsed.pathname || '';
        const lastDot = pathname.lastIndexOf('.');
        if (lastDot !== -1) {
          const ext = pathname.slice(lastDot + 1).toLowerCase();
          const nonImageExts = ['html', 'htm', 'php', 'asp', 'aspx', 'jsp'];
          if (nonImageExts.includes(ext)) {
            return urlMatch;
          }
        }
      } catch {
        // If URL parsing fails, fall through to ratio checks below.
      }

      const urlLength = urlCore.length;
      const textLength = questionText.length;
      const urlRatio = textLength ? (urlLength / textLength) : 0;
      
      const trimmedText = questionText.trim();
      const isStandaloneUrl = trimmedText === urlCore || 
                             new RegExp(`^\\s*${urlCore.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*$`, 'i').test(questionText);
      const isLargeUrl = urlRatio >= 0.8;
      
      if (isStandaloneUrl || isLargeUrl) {
        imageCounter++;
        const imageId = `img-${questionNum}-${Date.now()}-${imageCounter}`;
        return createImageHTML(urlCore, imageId, questionNum, false) + trailingPunctuation;
      }
      return urlMatch;
    });
  }
  
  return processedText;
}

function createImageHTML(imageUrl, imageId, questionNum, isDataUri) {
  const errorMsg = isDataUri 
    ? 'The image data may be invalid or corrupted.' 
    : 'The image may be blocked by CORS restrictions, unavailable, or the URL may be invalid.';
  
  if (isDataUri) {
    return `
      <div class="question-image-container" id="${imageId}" data-image-url="${imageUrl}" data-is-data-uri="true">
        <img class="question-image" 
             src="${imageUrl}"
             alt="Question ${questionNum} image" 
             loading="eager"
             style="display: none;"
             onload="handleImageLoad(this)"
             onerror="handleImageError(this)">
        <div class="image-loading">Loading image...</div>
        <div class="image-error" style="display: none;">Failed to load image. ${errorMsg}</div>
      </div>`;
  } else {
    return `
      <div class="question-image-container" id="${imageId}" data-image-url="${imageUrl}" data-is-data-uri="false">
        <img class="question-image lazy-image" 
             data-src="proxy:${imageUrl}"
             alt="Question ${questionNum} image" 
             style="display: none;"
             onload="handleImageLoad(this)"
             onerror="handleImageError(this)">
        <div class="image-loading">Loading image...</div>
        <div class="image-error" style="display: none;">Failed to load image. ${errorMsg}</div>
      </div>`;
  }
}

