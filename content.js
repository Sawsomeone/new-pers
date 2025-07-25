function extractText() {
  console.log("NewsPerspective: Revamping article extraction...");

  // Remove common noise elements to clean up the page
  const selectorsToRemove = 'header, footer, nav, .nav, .navbar, .sidebar, .ad, .advert, .comment, .comments, .share, .social, .related, .author, .meta, script, style, aside, [role="navigation"], [role="complementary"], [role="banner"], [role="contentinfo"]';
  document.querySelectorAll(selectorsToRemove).forEach(el => el.remove());

  const allElements = document.body.getElementsByTagName('*');
  let bestElement = null;
  let maxScore = -1;

  for (let i = 0; i < allElements.length; i++) {
    const element = allElements[i];
    
    // Skip invisible elements
    if (element.offsetParent === null) {
      continue;
    }

    const text = element.innerText || '';
    const textLength = text.length;

    // Ignore elements with very little text
    if (textLength < 250) {
      continue;
    }

    let childTextLength = 0;
    const children = element.children;
    for (let j = 0; j < children.length; j++) {
      childTextLength += children[j].innerText?.length || 0;
    }

    // The score is the length of the text directly in this element,
    // which is a good indicator of it being the main content container.
    const score = textLength - childTextLength;

    if (score > maxScore) {
      maxScore = score;
      bestElement = element;
    }
  }

  if (bestElement) {
    console.log(`NewsPerspective: Found best element with score: ${maxScore}.`);
    return bestElement.innerText;
  }

  console.log("NewsPerspective: Heuristic search failed. Falling back to paragraph joining.");
  // Fallback to combining all paragraphs if the scoring method fails
  const paragraphs = Array.from(document.querySelectorAll('p'));
  const articleText = paragraphs.map(p => p.innerText).join('\n\n');
  
  if (articleText.length > 250) {
    console.log("NewsPerspective: Extracted text from combined paragraphs.");
    return articleText;
  }

  console.log("NewsPerspective: All extraction methods failed. Returning empty string.");
  return ""; // Return empty string if no suitable content is found
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getArticleText") {
    const text = extractText();
    sendResponse({ article: text });
  }
});
