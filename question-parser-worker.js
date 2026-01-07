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
  const urlPatternPermissive = /(https?:\/\/[^\s<>"']+)/gi;
  
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
  
  // Check for URLs without extensions (only if no images found yet)
  if (imageCounter === 0) {
    processedText = processedText.replace(urlPatternPermissive, (urlMatch) => {
      const urlLength = urlMatch.length;
      const textLength = questionText.length;
      const urlRatio = urlLength / textLength;
      
      const trimmedUrl = urlMatch.trim();
      const trimmedText = questionText.trim();
      const isStandaloneUrl = trimmedText === trimmedUrl || 
                             new RegExp(`^\\s*${trimmedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i').test(questionText);
      const isLargeUrl = urlRatio >= 0.8;
      
      if (isStandaloneUrl || isLargeUrl) {
        imageCounter++;
        const imageId = `img-${questionNum}-${Date.now()}-${imageCounter}`;
        return createImageHTML(urlMatch, imageId, questionNum, false);
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

