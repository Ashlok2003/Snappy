/**
 * Snappy Pro — Background Service Worker
 */

let captureJob = null;

// ─── Message listener ────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, respond) => {

    if (msg.action === 'downloadImage') {
        chrome.downloads.download(
            { url: msg.dataUrl, filename: msg.filename, saveAs: false },
            (id) => {
                if (!chrome.runtime.lastError && msg.thumbnail) {
                    saveToHistory(msg.thumbnail, msg.filename, msg.pageUrl);
                }
                respond({ success: !chrome.runtime.lastError, downloadId: id });
            }
        );
        return true;
    }

    if (msg.action === 'captureNow') {
        chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
            if (chrome.runtime.lastError || !dataUrl) return;
            chrome.tabs.sendMessage(sender.tab.id, { action: 'startCrop', screenshot: dataUrl });
        });
    }

    if (msg.action === 'elementCaptured') {
        const tabId = sender.tab.id;
        chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
            if (chrome.runtime.lastError || !dataUrl) return;
            chrome.tabs.sendMessage(tabId, { action: 'startCropElement', screenshot: dataUrl, rect: msg.rect });
        });
    }

    if (msg.action === 'initFullPage') {
        const tabId = msg.tabId;
        captureJob = { tabId, captures: [] };
        chrome.tabs.sendMessage(tabId, { action: 'getPageMetrics' }, (metrics) => {
            if (chrome.runtime.lastError || !metrics) return;
            captureJob = { tabId, captures: [], ...metrics };
            chrome.tabs.sendMessage(tabId, { action: 'prepareFullPage' }, () => {
                setTimeout(() => {
                    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
                        if (chrome.runtime.lastError || !dataUrl) return;
                        captureJob.captures.push({ y: 0, dataUrl });
                        loopCapture();
                    });
                }, 150);
            });
        });
    }

    if (msg.action === 'startTabRecording') {
        startTabRecording(msg.tabId)
            .then(() => respond({ success: true }))
            .catch(e => respond({ success: false, error: e.message }));
        return true;
    }

    if (msg.action === 'stopTabRecording') {
        stopTabRecording()
            .then(() => respond({ success: true }))
            .catch(e => respond({ success: false, error: e.message }));
        return true;
    }

    if (msg.action === 'startGIFRecording') {
        startGIFRecording(msg.tabId)
            .then(() => respond({ success: true }))
            .catch(e => respond({ success: false, error: e.message }));
        return true;
    }

    if (msg.action === 'stopGIFRecording') {
        stopGIFRecording()
            .then(() => respond({ success: true }))
            .catch(e => respond({ success: false, error: e.message }));
        return true;
    }
});

// ─── Global hotkeys ──────────────────────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || tab.url.startsWith('chrome')) return;

        await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['styles.css'] });
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        await new Promise(r => setTimeout(r, 150));

        if (command === 'capture-visible') {
            const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
            chrome.tabs.sendMessage(tab.id, { action: 'startCrop', screenshot: dataUrl });
        } else if (command === 'capture-region') {
            const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
            chrome.tabs.sendMessage(tab.id, { action: 'startRegion', screenshot: dataUrl });
        } else if (command === 'capture-full') {
            chrome.runtime.sendMessage({ action: 'initFullPage', tabId: tab.id });
        }
    } catch (e) {
        console.error('Snappy hotkey error:', e);
    }
});

// ─── Full page capture ────────────────────────────────────────────────────────
function loopCapture() {
    const { tabId } = captureJob;
    chrome.tabs.sendMessage(tabId, { action: 'scrollNext' }, (res) => {
        if (!res || (!res.moved && captureJob.captures.length > 0)) { finishCapture(); return; }
        setTimeout(() => {
            chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
                if (chrome.runtime.lastError || !dataUrl) { finishCapture(); return; }
                captureJob.captures.push({ y: res.y, dataUrl });
                loopCapture();
            });
        }, 800);
    });
}

function finishCapture() {
    chrome.tabs.sendMessage(captureJob.tabId, {
        action: 'stitchAndDownload',
        captures: captureJob.captures,
        totalHeight: captureJob.totalHeight,
        viewportHeight: captureJob.viewportHeight,
        devicePixelRatio: captureJob.devicePixelRatio
    });
    captureJob = null;
}

// ─── Offscreen management ─────────────────────────────────────────────────────
async function ensureOffscreen() {
    const existing = await chrome.offscreen.hasDocument().catch(() => false);
    if (!existing) {
        await chrome.offscreen.createDocument({
            url: chrome.runtime.getURL('offscreen.html'),
            reasons: ['USER_MEDIA'],
            justification: 'Record tab video/audio stream'
        });
    }
}

// ─── WebM recording ───────────────────────────────────────────────────────────
async function startTabRecording(tabId) {
    await ensureOffscreen();
    const streamId = await getStreamId(tabId);
    return sendToOffscreen('startRecording', { streamId });
}

async function stopTabRecording() {
    return sendToOffscreen('stopRecording', {});
}

// ─── GIF recording ────────────────────────────────────────────────────────────
async function startGIFRecording(tabId) {
    await ensureOffscreen();
    const streamId = await getStreamId(tabId);
    return sendToOffscreen('startGIFRecording', { streamId });
}

async function stopGIFRecording() {
    return sendToOffscreen('stopGIFRecording', {});
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getStreamId(tabId) {
    return new Promise((resolve, reject) => {
        chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(id);
        });
    });
}

function sendToOffscreen(action, payload) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            { target: 'offscreen', action, ...payload },
            (res) => {
                if (res?.success) resolve();
                else reject(new Error(res?.error || `${action} failed`));
            }
        );
    });
}

// ─── Screenshot history ───────────────────────────────────────────────────────
function saveToHistory(thumbnail, filename, pageUrl) {
    chrome.storage.local.get({ history: [] }, ({ history }) => {
        history.unshift({
            id: Date.now(),
            thumbnail,
            filename,
            pageUrl: pageUrl || '',
            ts: Date.now()
        });
        chrome.storage.local.set({ history: history.slice(0, 20) });
    });
}
