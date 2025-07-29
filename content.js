function extractText() {
    console.log("NewsPerspective: Starting article extraction...");

    return new Promise((resolve) => {
        fetchRawHtml().then((text) => {
            if (text.length > 250 && !isPrivacyNotice(text)) {
                console.log("NewsPerspective: Extracted text via raw HTML fetch.");
                resolve(text);
                return;
            }

            waitForContent(20000).then(() => {
                if (isToSOrPrivacyPage()) {
                    console.log("NewsPerspective: ToS or privacy page detected, attempting bypass...");
                    attemptToSBypass().then((bypassedText) => {
                        if (bypassedText.length > 250 && !isPrivacyNotice(bypassedText)) {
                            resolve(bypassedText);
                        } else {
                            chrome.runtime.sendMessage({ action: "tosDetected" });
                            resolve("");
                        }
                    }).catch(() => {
                        chrome.runtime.sendMessage({ action: "tosDetected" });
                        resolve("");
                    });
                    return;
                }

                let articleText = extractByHeuristic();
                if (articleText.length > 250 && !isPrivacyNotice(articleText)) {
                    console.log("NewsPerspective: Extracted text via heuristic.");
                    resolve(articleText);
                    return;
                }

                articleText = extractBySchemaOrMeta();
                if (articleText.length > 250 && !isPrivacyNotice(articleText)) {
                    console.log("NewsPerspective: Extracted text via schema.org or meta tags.");
                    resolve(articleText);
                    return;
                }

                articleText = extractByParagraphs();
                if (articleText.length > 250 && !isPrivacyNotice(articleText)) {
                    console.log("NewsPerspective: Extracted text from combined paragraphs.");
                    resolve(articleText);
                    return;
                }

                articleText = extractFromShadowDom();
                if (articleText.length > 250 && !isPrivacyNotice(articleText)) {
                    console.log("NewsPerspective: Extracted text from shadow DOM.");
                    resolve(articleText);
                    return;
                }

                console.log("NewsPerspective: All extraction methods failed.");
                resolve("");
            });
        });
    });
}

function isToSOrPrivacyPage() {
    const indicators = [
        document.body.innerText.toLowerCase().includes("terms of service"),
        document.body.innerText.toLowerCase().includes("usage policy"),
        document.body.innerText.toLowerCase().includes("user agreement"),
        document.body.innerText.toLowerCase().includes("privacy"),
        document.body.innerText.toLowerCase().includes("data collection"),
        document.body.innerText.toLowerCase().includes("cookies"),
        document.body.innerText.toLowerCase().includes("advertising"),
        document.body.innerText.toLowerCase().includes("opt-out"),
        document.URL.toLowerCase().includes("/terms"),
        document.URL.toLowerCase().includes("/policy"),
        document.URL.toLowerCase().includes("/privacy"),
        document.querySelector('meta[name="tos"], meta[name="policy"], meta[name="privacy"]') !== null,
        document.querySelector('.tos-container, .terms-of-service, .policy-page, .privacy-notice, .consent-modal, .gdpr-consent, .cookie-consent') !== null
    ];
    return indicators.some(indicator => indicator);
}

function isPrivacyNotice(text) {
    const privacyKeywords = ["privacy", "cookies", "data collection", "advertising", "opt-out", "personal information", "tracking technologies", "third parties"];
    return privacyKeywords.some(keyword => text.toLowerCase().includes(keyword));
}

async function attemptToSBypass() {
    const currentUrl = document.URL;
    const urlPatterns = ['/news', '/story', '/health', '/article', '/content'];
    for (const pattern of urlPatterns) {
        if (currentUrl.includes("/terms") || currentUrl.includes("/policy") || currentUrl.includes("/privacy")) {
            const baseUrl = currentUrl.replace(/\/(terms|policy|privacy).*/, '');
            try {
                const response = await fetch(baseUrl + pattern, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Referer': 'https://www.google.com/'
                    }
                });
                if (response.ok) {
                    const html = await response.text();
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(html, 'text/html');
                    const text = extractFromDoc(doc);
                    if (text.length > 250 && !isPrivacyNotice(text)) {
                        return text;
                    }
                }
            } catch (err) {
                console.error(`NewsPerspective: URL manipulation with ${pattern} failed:`, err);
            }
        }
    }

    try {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(currentUrl + " news")}`;
        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        if (response.ok) {
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const link = doc.querySelector(`a[href*="${currentUrl.split('/')[2]}"][href*="/news"], a[href*="${currentUrl.split('/')[2]}"][href*="/story"]`);
            if (link && link.href) {
                const articleResponse = await fetch(link.href, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Referer': 'https://www.google.com/'
                    }
                });
                if (articleResponse.ok) {
                    const articleHtml = await articleResponse.text();
                    const articleDoc = parser.parseFromString(articleHtml, 'text/html');
                    const text = extractFromDoc(articleDoc);
                    if (text.length > 250 && !isPrivacyNotice(text)) {
                        console.log("NewsPerspective: Extracted text via search engine referral.");
                        return text;
                    }
                }
            }
        }
    } catch (err) {
        console.error("NewsPerspective: Search engine referral failed:", err);
    }

    try {
        const archiveUrl = `https://web.archive.org/web/*/${document.URL}`;
        const response = await fetch(archiveUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        if (response.ok) {
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const text = extractFromDoc(doc);
            if (text.length > 250 && !isPrivacyNotice(text)) {
                console.log("NewsPerspective: Extracted text from archived content.");
                return text;
            }
        }
    } catch (err) {
        console.error("NewsPerspective: Archive fetch failed:", err);
    }

    return "";
}

async function fetchRawHtml() {
    try {
        const response = await fetch(document.URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.google.com/'
            }
        });
        if (response.ok) {
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            return extractFromDoc(doc);
        }
    } catch (err) {
        console.error("NewsPerspective: Raw HTML fetch failed:", err);
    }
    return "";
}

function extractFromDoc(doc) {
    let articleText = extractByHeuristic(doc);
    if (articleText.length > 250 && !isPrivacyNotice(articleText)) return articleText;

    articleText = extractBySchemaOrMeta(doc);
    if (articleText.length > 250 && !isPrivacyNotice(articleText)) return articleText;

    articleText = extractByParagraphs(doc);
    if (articleText.length > 250 && !isPrivacyNotice(articleText)) return articleText;

    articleText = extractFromShadowDom(doc);
    return articleText;
}

function extractByHeuristic(doc = document) {
    const selectorsToRemove = 'header, footer, nav, .nav, .navbar, .sidebar, .ad, .advert, .comment, .comments, .share, .social, .related, .author, .meta, script, style, aside, [role="navigation"], [role="complementary"], [role="banner"], [role="contentinfo"], .privacy-notice, .consent-modal, .gdpr-consent, .cookie-consent';
    doc.querySelectorAll(selectorsToRemove).forEach(el => el.remove());

    const allElements = doc.body.getElementsByTagName('*');
    let bestElement = null;
    let maxScore = -1;

    for (let i = 0; i < allElements.length; i++) {
        const element = allElements[i];
        if (element.offsetParent === null) continue;
        const text = element.innerText || '';
        const textLength = text.length;
        if (textLength < 250 || isPrivacyNotice(text)) continue;

        let childTextLength = 0;
        const children = element.children;
        for (let j = 0; j < children.length; j++) {
            childTextLength += children[j].innerText?.length || 0;
        }

        const score = textLength - childTextLength;
        if (score > maxScore) {
            maxScore = score;
            bestElement = element;
        }
    }

    return bestElement ? bestElement.innerText : "";
}

function extractBySchemaOrMeta(doc = document) {
    const articleBody = doc.querySelector('[itemprop="articleBody"], [itemtype*="NewsArticle"] p, article p, .article-content p, .story-body p, .story-content p, .post-content p');
    if (articleBody && !isPrivacyNotice(articleBody.innerText)) {
        return articleBody.innerText || "";
    }

    const metaDescription = doc.querySelector('meta[name="description"], meta[property="og:description"]');
    if (metaDescription && metaDescription.content.length > 250 && !isPrivacyNotice(metaDescription.content)) {
        return metaDescription.content;
    }

    return "";
}

function extractByParagraphs(doc = document) {
    const paragraphs = Array.from(doc.querySelectorAll('p, .content p, article p, .article-content p, .story-body p, .story-content p, .post-content p'));
    const filteredParagraphs = paragraphs.filter(p => !isPrivacyNotice(p.innerText));
    return filteredParagraphs.map(p => p.innerText).join('\n\n');
}

function extractFromShadowDom(doc = document) {
    const shadowHosts = doc.querySelectorAll('*');
    let text = "";
    for (let host of shadowHosts) {
        if (host.shadowRoot) {
            const shadowText = extractByParagraphs(host.shadowRoot);
            if (shadowText.length > 250 && !isPrivacyNotice(shadowText)) {
                text += shadowText + '\n\n';
            }
            const nestedHosts = host.shadowRoot.querySelectorAll('*');
            for (let nestedHost of nestedHosts) {
                if (nestedHost.shadowRoot) {
                    const nestedText = extractByParagraphs(nestedHost.shadowRoot);
                    if (nestedText.length > 250 && !isPrivacyNotice(nestedText)) {
                        text += nestedText + '\n\n';
                    }
                }
            }
        }
    }
    return text.trim();
}

function waitForContent(timeout = 20000) {
    return new Promise((resolve) => {
        if (document.body.innerText.length > 250 && !isToSOrPrivacyPage()) {
            resolve();
            return;
        }

        const observer = new MutationObserver(() => {
            if (document.body.innerText.length > 250 && !isToSOrPrivacyPage()) {
                observer.disconnect();
                resolve();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        const interactionEvents = ['click', 'scroll', 'resize'];
        interactionEvents.forEach(event => {
            window.addEventListener(event, () => {
                if (document.body.innerText.length > 250 && !isToSOrPrivacyPage()) {
                    observer.disconnect();
                    resolve();
                }
            }, { once: true });
        });

        setTimeout(() => {
            observer.disconnect();
            resolve();
        }, timeout);
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getArticleText") {
        extractText().then(text => {
            sendResponse({ article: text });
        });
        return true;
    }
});