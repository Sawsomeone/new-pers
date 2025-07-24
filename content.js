function extractText() {
  const article = document.querySelector("article");
  return article ? article.innerText : document.body.innerText.slice(0, 3000);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getArticleText") {
    const text = extractText();
    sendResponse({ article: text });
  }
});
