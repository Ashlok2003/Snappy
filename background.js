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

            captureJob = {
                tabId,
                captures: [],
                totalHeight: metrics.totalHeight,
                viewportHeight: metrics.viewportHeight,
                devicePixelRatio: metrics.devicePixelRatio || 1,
                nextStitch: 'stitchAndDownload'  // Use new action
            };

            // 1. Prepare (Hide Scrollbars)
            chrome.tabs.sendMessage(tabId, { action: 'prepareFullPage' }, () => {
                // Give it a moment to paint (150ms)
                setTimeout(() => {
                    // 2. Capture Y=0 Start
                    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
                        if (chrome.runtime.lastError || !dataUrl) {
                            // Fallback to current visible capture if full page fails
                            chrome.tabs.captureVisibleTab(null, { format: 'png' }, (fallbackDataUrl) => {
                                if (chrome.runtime.lastError || !fallbackDataUrl) return;
                                chrome.tabs.sendMessage(tabId, {
                                    action: 'startCrop',
                                    screenshot: fallbackDataUrl
                                });
                            });
                            return;
                        }
                        captureJob.captures.push({ y: 0, dataUrl });
                        console.log('Starting scroll loop...');
                        loopCapture();
                    });
                }, 150);
            });
        });
    }
});

function loopCapture() {
    const { tabId } = captureJob;

    // 1. Tell Content to Scroll Down
    chrome.tabs.sendMessage(tabId, { action: 'scrollNext' }, (res) => {
        if (!res) {
            finishCapture();
            return;
        }

        const { moved, y } = res;

        // If didn't move, we are done
        if (!moved && captureJob.captures.length > 0) {
            finishCapture();
            return;
        }

        // 2. Wait for Smooth Scroll & Render
        setTimeout(() => {
            // 3. Capture
            chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
                if (chrome.runtime.lastError || !dataUrl) {
                    finishCapture(); // Save what we have
                    return;
                }

                // Save this chunk at the CURRENT accurate Y
                captureJob.captures.push({ y, dataUrl });

                // 4. Continue
                loopCapture();
            });
        }, 800); // 800ms for smooth scroll animation + network
    });
}

function finishCapture() {
    // Send all chunks to content script for stitching
    chrome.tabs.sendMessage(captureJob.tabId, {
        action: 'stitchAndDownload',
        captures: captureJob.captures,
        totalHeight: captureJob.totalHeight,
        viewportHeight: captureJob.viewportHeight,
        devicePixelRatio: captureJob.devicePixelRatio
    });
}
