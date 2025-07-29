document.addEventListener('DOMContentLoaded', function () {
    // --- Element References ---
    const mainView = document.getElementById('mainView');
    const settingsView = document.getElementById('settingsView');
    const settingsBtn = document.getElementById('settingsBtn');
    const backBtn = document.getElementById('backBtn');
    const resultContainer = document.getElementById('resultContainer');
    const loader = document.getElementById('loader');
    const errorContainer = document.getElementById('error');
    const errorMessage = document.getElementById('errorMessage');
    const biasAnalysisContainer = document.getElementById('bias-analysis');
    const leftBiasCount = document.getElementById('left-bias-count');
    const rightBiasCount = document.getElementById('right-bias-count');
    const leftBiases = document.getElementById('left-biases');
    const rightBiases = document.getElementById('right-biases');
    const factualStatementsCount = document.getElementById('factual-statements-count');
    const factualStatements = document.getElementById('factual-statements');
    const articleLinkContainer = document.getElementById('articleLinkContainer');
    const articleLink = document.getElementById('articleLink');
    const customPrompt = document.getElementById('customPrompt');
    const customAnalyzeBtn = document.getElementById('customAnalyzeBtn');
    const biasSliderContainer = document.getElementById('biasSliderContainer');
    const sliderThumb = document.getElementById('slider-thumb');
    const showExtractedTextBtn = document.getElementById('showExtractedTextBtn');
    const extractedTextContainer = document.getElementById('extractedText');

    let extractedArticleText = '';

    // --- Event Listeners ---
    settingsBtn.addEventListener('click', () => showView(true));
    backBtn.addEventListener('click', () => showView(false));
    customAnalyzeBtn.addEventListener('click', () => startAnalysis(true));
    showExtractedTextBtn.addEventListener('click', () => {
        if (extractedTextContainer.classList.contains('hidden')) {
            extractedTextContainer.textContent = extractedArticleText;
            extractedTextContainer.classList.remove('hidden');
            showExtractedTextBtn.textContent = 'Hide Extracted Text';
        } else {
            extractedTextContainer.classList.add('hidden');
            showExtractedTextBtn.textContent = 'Show Extracted Text';
        }
    });

    biasAnalysisContainer.addEventListener('click', (event) => {
        const toggleButton = event.target.closest('.bias-dropdown-toggle');
        if (toggleButton) {
            const targetId = toggleButton.dataset.target;
            const targetContent = document.getElementById(targetId);
            if (targetContent) {
                targetContent.classList.toggle('hidden');
            }
        }
    });

    // --- Core Functions ---
    async function startAnalysis(isCustom = false) {
        if (isCustom) {
            showView(false); // Switch back to main view to show results
        }
        setLoadingState(true, isCustom);
        hideError();
        articleLinkContainer.classList.add('hidden');
        biasSliderContainer.classList.add('hidden');
        biasAnalysisContainer.classList.add('hidden');
        showExtractedTextBtn.classList.add('hidden');
        extractedTextContainer.classList.add('hidden');

        try {
            const { article, url } = await getContentFromActiveTab();
            extractedArticleText = article; // Store the extracted text

            if (article) {
                let prompt;
                if (isCustom) {
                    const customText = customPrompt.value.trim();
                    if (!customText) {
                        showError("Please enter a custom prompt.");
                        setLoadingState(false, isCustom);
                        return;
                    }
                    prompt = createPrompt(article, customText);
                } else {
                    prompt = createPrompt(article);
                }
                
                const response = await getAiSummary(prompt);
                // Add this line for debugging to see the raw response from the API
                console.log("Raw Gemini Response:", response); 

                const { bias, left, right, factual } = parseAiResponse(response);

                updateBiasDropdowns(left, right, factual);
                biasAnalysisContainer.classList.remove('hidden');

                updateBiasSlider(bias);
                biasSliderContainer.classList.remove('hidden');

                articleLink.href = url;
                articleLinkContainer.classList.remove('hidden');
                showExtractedTextBtn.classList.remove('hidden');
            } else {
                showError('Could not retrieve content from the page. The page might be protected or empty.');
            }
        } catch (err) {
            console.error('Analysis Error:', err);
            showError(err.message || 'An unknown error occurred. Please check the console for details.');
        } finally {
            setLoadingState(false, isCustom);
        }
    }

    function createPrompt(content, customText = null) {
        if (customText) {
            return `${customText}\n\nContent to analyze:\n\n${content}`;
        }
        return `Analyze the following content for political biases. Provide your analysis in three sections: "Left-Wing Biases", "Right-Wing Biases", and "Factual Statements". Under each heading, provide a bulleted list of specific points or statements from the article that support your analysis. At the end of your response, include a political bias score on a scale of 0 (far left) to 100 (far right) in the format "BIAS_SCORE: [score]". Do not include any other text or summary. Content to analyze:\n\n${content}`;
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
                        // Refresh the page to restore its original state
                        chrome.tabs.reload(activeTab.id);
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
    function setLoadingState(isLoading, isCustom) {
        if (isCustom) {
            customAnalyzeBtn.disabled = isLoading;
        }
        loader.classList.toggle('hidden', !isLoading);
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorContainer.classList.remove('hidden');
        loader.classList.add('hidden');
    }

    function hideError() {
        errorContainer.classList.add('hidden');
    }

    function showView(isSettings) {
        mainView.classList.toggle('hidden', isSettings);
        settingsView.classList.toggle('hidden', !isSettings);
    }

    function parseAiResponse(response) {
        // Add debugging to see the raw response
        console.log("Full AI Response for parsing:", response);
        
        // Extract bias score - handle both formats
        const biasMatch = response.match(/bias_score:\s*(\d+)/i);
        const bias = biasMatch ? parseInt(biasMatch[1], 10) : 50;

        // Updated regex patterns to handle markdown bold headers (**Header**) and various formats
        const leftMatch = response.match(/\*\*\s*left-?(?:wing)?\s*biases?\s*\*\*([\s\S]*?)(?:\*\*\s*right-?(?:wing)?\s*biases?|\*\*\s*factual\s*statements?|bias_score:|$)/i);
        const rightMatch = response.match(/\*\*\s*right-?(?:wing)?\s*biases?\s*\*\*([\s\S]*?)(?:\*\*\s*factual\s*statements?|bias_score:|$)/i);
        const factualMatch = response.match(/\*\*\s*factual\s*statements?\s*\*\*([\s\S]*?)(?:bias_score:|$)/i);

        // Debug the matches
        console.log("Left match:", leftMatch);
        console.log("Right match:", rightMatch);
        console.log("Factual match:", factualMatch);

        const parseBullets = (text) => {
            if (!text) return []; // If the section is empty, return an empty array.
            console.log("Parsing bullets from text:", text);
            // Use regex to find all lines that start with a bullet (*, •, or -).
            const matches = text.trim().matchAll(/^\s*[*•-]\s*(.*)$/gm);
            // Return an array of the captured text for each bullet point.
            const result = Array.from(matches, match => match[1].trim());
            console.log("Parsed bullets result:", result);
            return result;
        };

        const leftBiases = parseBullets(leftMatch ? leftMatch[1] : '');
        const rightBiases = parseBullets(rightMatch ? rightMatch[1] : '');
        const factualStatements = parseBullets(factualMatch ? factualMatch[1] : '');

        console.log("Final parsed results:", { bias, left: leftBiases, right: rightBiases, factual: factualStatements });
        return { bias, left: leftBiases, right: rightBiases, factual: factualStatements };
    }

    function updateBiasSlider(bias) {
        const percentage = Math.max(0, Math.min(100, bias));
        sliderThumb.style.left = `${percentage}%`;
    }

    function updateBiasDropdowns(left, right, factual) {
        leftBiasCount.textContent = left.length;
        rightBiasCount.textContent = right.length;
        factualStatementsCount.textContent = factual.length;

        // Function to create a bulleted list from an array of items.
        const createList = (items) => {
            if (items.length === 0) return '<p>No items found.</p>'; // Show a message if empty.
            return '<ul>' + items.map(item => `<li>${item}</li>`).join('') + '</ul>';
        };

        leftBiases.innerHTML = createList(left);
        rightBiases.innerHTML = createList(right);
        factualStatements.innerHTML = createList(factual);
    }

    // --- Initial Load ---
    startAnalysis();
});