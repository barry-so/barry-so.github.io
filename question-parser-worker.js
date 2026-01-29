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

  // NOTE: We intentionally do NOT convert generic URLs (without an image
  // extension) into images. This mirrors the main-thread parser and prevents
  // non-image links like "https://barry-so.github.io/" from being treated as
  // images, which was causing handleImageError() noise when the proxy failed
  // to load them as images.

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

