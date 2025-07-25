document.getElementById("summarizeBtn").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      files: ["content.js"]
    }, () => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
        document.getElementById("output").innerText = "Error: Could not inject script into the page. Try reloading the page.";
        return;
      }

      chrome.tabs.sendMessage(tabs[0].id, { action: "getArticleText" }, async (response) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError.message);
          document.getElementById("output").innerText = "Error: Could not communicate with the content script.";
          return;
        }
        
        const article = response.article;

        if (!article || article.length < 200) {
          console.error("Extracted text is too short or empty:", article);
          document.getElementById("output").innerText = "Error: Could not find the main article text on this page. Please try a different article or website.";
          return;
        }

        const prompt = `
Summarize this article in 3 ways:
1. Neutral Summary
2. Liberal Perspective
3. Conservative Perspective

Article:
${article}
`;

        const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${config.API_KEY}`;

        const result = await fetch(GEMINI_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: prompt
              }]
            }]
          })
        });

        const data = await result.json();

        if (data.candidates && data.candidates.length > 0) {
          const answer = data.candidates[0].content.parts[0].text;
          document.getElementById("output").innerText = answer;
        } else {
          console.error("API Error:", JSON.stringify(data, null, 2));
          document.getElementById("output").innerText = "Error summarizing article. See console for details.";
        }
      });
    });
  });
});
