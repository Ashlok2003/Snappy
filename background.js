/**
 * Background Service
 * Handles Downloads and Advanced Capture orchestration
 */

// State for full page capture
let captureJob = {
    tabId: null,
    captures: [],
    y: 0,
    totalHeight: 0,
    viewportHeight: 0,
    devicePixelRatio: 1
};

// Listen for messages
chrome.runtime.onMessage.addListener((msg, sender, res) => {

    // --- Downloads ---
    if (msg.action === 'downloadImage') {
        chrome.downloads.download({
            url: msg.dataUrl,
            filename: msg.filename,
            saveAs: false
        }, (id) => res({ success: !chrome.runtime.lastError, downloadId: id }));
        return true;
    }

    // --- Timer Trigger ---
    if (msg.action === 'captureNow') {
        chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
            chrome.tabs.sendMessage(sender.tab.id, {
                action: 'startCrop',
                screenshot: dataUrl
            });
        });
    }

    // --- Full Page Trigger ---
    if (msg.action === 'initFullPage') {
        // Start the Orchestration
        const tabId = msg.tabId;
        captureJob = { tabId, captures: [], y: 0 };

        // 1. Get Page Metrics from Content Script
        chrome.tabs.sendMessage(tabId, { action: 'getPageMetrics' }, (metrics) => {
            if (chrome.runtime.lastError || !metrics) {
                console.error('Failed to get metrics');
                return;
            }

            captureJob.totalHeight = metrics.totalHeight;
            captureJob.viewportHeight = metrics.viewportHeight;
            captureJob.devicePixelRatio = metrics.devicePixelRatio;

            loopCapture();
        });
    }
});

function loopCapture() {
    const { tabId, y, totalHeight, viewportHeight } = captureJob;

    // Check if done
    if (y >= totalHeight) {
        finishCapture();
        return;
    }

    // 1. Scroll
    chrome.tabs.sendMessage(tabId, { action: 'scrollTo', y: y }, () => {
        // 2. Wait for render (essential for sticky headers/lazy load)
        setTimeout(() => {
            // 3. Capture
            chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
                if (chrome.runtime.lastError || !dataUrl) {
                    // Fallback or abort? Let's finish what we have.
                    finishCapture();
                    return;
                }

                captureJob.captures.push({ y, dataUrl });

                // 4. Next Step
                captureJob.y += viewportHeight;
                loopCapture();
            });
        }, 500); // 500ms delay to be safe
    });
}

function finishCapture() {
    // Send all chunks to content script for stitching
    chrome.tabs.sendMessage(captureJob.tabId, {
        action: 'stitchAndOpen',
        captures: captureJob.captures,
        totalHeight: captureJob.totalHeight,
        viewportHeight: captureJob.viewportHeight,
        devicePixelRatio: captureJob.devicePixelRatio
    });
}
