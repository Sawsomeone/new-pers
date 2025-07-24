document.getElementById("summarizeBtn").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "getArticleText" }, async (response) => {
      const article = response.article;

      const prompt = `
Summarize this article in 3 ways:
1. Neutral Summary
2. Liberal Perspective
3. Conservative Perspective

Article:
${article}
`;

      const result = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer YOUR_API_KEY",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7
        })
      });

      const data = await result.json();
      const answer = data.choices[0].message.content;
      document.getElementById("output").innerText = answer;
    });
  });
});
