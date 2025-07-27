document.addEventListener('DOMContentLoaded', function () {
    // --- Element References ---
    const analyzeBtn = document.getElementById('analyzeBtn');
    const resultContainer = document.getElementById('resultContainer');
    const loader = document.getElementById('loader');
    const errorContainer = document.getElementById('error');
    const errorMessage = document.getElementById('errorMessage');
    const summaryContainer = document.getElementById('summary');
    const articleLinkContainer = document.getElementById('articleLinkContainer');
    const articleLink = document.getElementById('articleLink');

    // --- Event Listeners ---
    analyzeBtn.addEventListener('click', startAnalysis);

    // --- Core Functions ---
    async function startAnalysis() {
        setLoadingState(true);
        hideError();
        summaryContainer.innerHTML = '';
        articleLinkContainer.classList.add('hidden');
        resultContainer.classList.remove('hidden');

        try {
            const { article, url } = await getContentFromActiveTab();

            if (article) {
                const prompt = createPrompt(article);
                const summary = await getAiSummary(prompt);
                summaryContainer.innerHTML = markdownToHtml(summary);
                
                // Show the article link
                articleLink.href = url;
                articleLinkContainer.classList.remove('hidden');
            } else {
                showError('Could not retrieve content from the page. The page might be protected or empty.');
            }
        } catch (err) {
            console.error('Analysis Error:', err);
            showError(err.message || 'An unknown error occurred. Please check the console for details.');
        } finally {
            setLoadingState(false);
        }
    }

    function createPrompt(content) {
        return `Analyze the following content and provide a summary in Markdown. Include a main idea, key points as a bulleted list, and the overall tone. Content to analyze:\n\n${content}`;
    }

    async function getContentFromActiveTab() {
        return new Promise((resolve, reject) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length === 0) {
                    return reject(new Error("No active tab found."));
                }
                const activeTab = tabs[0];
                if (activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('about:')) {
                    return reject(new Error("Cannot analyze system pages."));
                }

                chrome.scripting.executeScript({
                    target: { tabId: activeTab.id },
                    files: ['content.js']
                }, () => {
                    if (chrome.runtime.lastError) {
                        return reject(new Error("Failed to inject content script: " + chrome.runtime.lastError.message));
                    }
                    chrome.tabs.sendMessage(activeTab.id, { action: "getArticleText" }, (response) => {
                        if (chrome.runtime.lastError) {
                            return reject(new Error("Failed to communicate with content script: " + chrome.runtime.lastError.message));
                        }
                        if (response && response.article) {
                            resolve({ article: response.article, url: activeTab.url });
                        } else {
                            resolve({ article: '', url: activeTab.url });
                        }
                    });
                });
            });
        });
    }

    async function getAiSummary(prompt) {
        const apiKey = typeof API_KEY !== 'undefined' ? API_KEY : '';
        if (!apiKey) {
            throw new Error("API key is not set. Please add it to config.js.");
        }
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }]
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}.`);
        }
        
        const result = await response.json();

        if (result.candidates && result.candidates[0]?.content?.parts[0]?.text) {
            return result.candidates[0].content.parts[0].text;
        } else {
            const blockReason = result.promptFeedback?.blockReason;
            if (blockReason) {
                throw new Error(`Content blocked: ${blockReason}.`);
            }
            throw new Error('The API returned an empty or invalid response.');
        }
    }

function markdownToHtml(text) {
        // Bold
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Italics
        text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
        // Bullets
        text = text.replace(/^\s*[\*-]\s(.*)/gm, '<li>$1</li>');
        text = text.replace(/<\/li><li>/g, '</li>\n<li>'); // Add newlines between list items for the next replace
        text = text.replace(/(<li>.*<\/li>)/gs, '<ul>$&</ul>');
        // Newlines
        return text.replace(/\n/g, '<br>');
    }
    // --- UI Helper Functions ---
    function setLoadingState(isLoading) {
        analyzeBtn.disabled = isLoading;
        loader.classList.toggle('hidden', !isLoading);
        summaryContainer.classList.toggle('hidden', isLoading);
        analyzeBtn.classList.toggle('opacity-50', isLoading);
        analyzeBtn.classList.toggle('cursor-not-allowed', isLoading);
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorContainer.classList.remove('hidden');
        resultContainer.classList.remove('hidden');
        summaryContainer.classList.add('hidden');
    }

    function hideError() {
        errorContainer.classList.add('hidden');
    }
});
