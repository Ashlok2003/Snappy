/**
 * Snappy Pro — Popup Logic
 */

const statusEl = document.getElementById('status');
let timerDelay = 3;
let recInterval = null;

function setStatus(msg, type = '') {
    statusEl.textContent = msg;
    statusEl.className = type;
}

// --- Tab switching ---
document.getElementById('tabScreenshot').addEventListener('click', () => switchTab('screenshot'));
document.getElementById('tabRecord').addEventListener('click', () => switchTab('record'));

function switchTab(which) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab' + capitalize(which)).classList.add('active');
    document.getElementById('panel' + capitalize(which)).classList.add('active');
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// --- Timer options ---
document.querySelectorAll('.timer-opt').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.timer-opt').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        timerDelay = Number(e.currentTarget.dataset.delay);
    });
});

// --- Settings & History ---
document.getElementById('btnSettings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});
document.getElementById('btnHistory').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
});

// --- Load saved timer delay ---
chrome.storage.sync.get({ timerDelay: 3 }, (prefs) => {
    timerDelay = prefs.timerDelay;
    document.querySelectorAll('.timer-opt').forEach(btn => {
        const isActive = Number(btn.dataset.delay) === timerDelay;
        btn.classList.toggle('active', isActive);
    });
});

// --- Inject helper ---
async function inject(tabId) {
    try {
        await chrome.scripting.insertCSS({ target: { tabId }, files: ['styles.css'] });
        await chrome.scripting.executeScript({ target: { tabId }, files: ['image-adjust.js'] });
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    } catch (e) {
        // Script may already be loaded
    }
}

// --- Capture handlers ---
async function handleCapture(mode) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || tab.url.startsWith('chrome')) {
            setStatus('Cannot capture this page', 'error');
            return;
        }

        setStatus('Preparing...');
        await inject(tab.id);
        await new Promise(r => setTimeout(r, 150));

        if (mode === 'visible') {
            const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
            await chrome.tabs.sendMessage(tab.id, { action: 'startCrop', screenshot: dataUrl });
            window.close();
        } else if (mode === 'region') {
            const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
            await chrome.tabs.sendMessage(tab.id, { action: 'startRegion', screenshot: dataUrl });
            window.close();
        } else if (mode === 'element') {
            await chrome.tabs.sendMessage(tab.id, { action: 'startElementPicker' });
            window.close();
        } else if (mode === 'timer') {
            chrome.tabs.sendMessage(tab.id, { action: 'startTimer', delay: timerDelay });
            window.close();
        } else if (mode === 'full') {
            setStatus('Capturing full page...');
            chrome.runtime.sendMessage({ action: 'initFullPage', tabId: tab.id });
            window.close();
        }
    } catch (e) {
        setStatus('Error: ' + e.message, 'error');
    }
}

document.getElementById('btnVisible').addEventListener('click', () => handleCapture('visible'));
document.getElementById('btnFull').addEventListener('click', () => handleCapture('full'));
document.getElementById('btnElement').addEventListener('click', () => handleCapture('element'));
document.getElementById('btnRegion').addEventListener('click', () => handleCapture('region'));
document.getElementById('btnTimer').addEventListener('click', () => handleCapture('timer'));

// --- Recording ---
let recStartTime = 0;

function updateRecTimer() {
    const elapsed = Math.floor((Date.now() - recStartTime) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    document.getElementById('recTimerDisplay').textContent = `${mm}:${ss}`;
}

function setRecordingUI(active) {
    document.getElementById('recIdle').style.display = active ? 'none' : 'block';
    document.getElementById('recActive').style.display = active ? 'block' : 'none';
    if (active) {
        recStartTime = Date.now();
        recInterval = setInterval(updateRecTimer, 1000);
    } else {
        clearInterval(recInterval);
    }
}

// Check if already recording on open
try {
    chrome.storage.session.get({ recording: false, recStart: 0 }, (s) => {
        if (s && s.recording) {
            recStartTime = s.recStart;
            setRecordingUI(true);
        }
    });
} catch (_) {}

document.getElementById('btnRecordGIF').addEventListener('click', async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || tab.url.startsWith('chrome')) { setStatus('Cannot record this page', 'error'); return; }
        setStatus('Starting GIF recording...');
        const result = await chrome.runtime.sendMessage({ action: 'startGIFRecording', tabId: tab.id });
        if (result?.success) {
            setRecordingUI(true);
            try { chrome.storage.session.set({ recording: 'gif', recStart: recStartTime }); } catch (_) {}
            setStatus('Recording GIF (max 15s)');
        } else {
            setStatus('Failed: ' + (result?.error || 'unknown'), 'error');
        }
    } catch (e) { setStatus('Error: ' + e.message, 'error'); }
});

document.getElementById('btnRecord').addEventListener('click', async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || tab.url.startsWith('chrome')) {
            setStatus('Cannot record this page', 'error');
            return;
        }
        setStatus('Starting recording...');
        const result = await chrome.runtime.sendMessage({ action: 'startTabRecording', tabId: tab.id });
        if (result && result.success) {
            setRecordingUI(true);
            try { chrome.storage.session.set({ recording: true, recStart: recStartTime }); } catch (_) {}
            setStatus('');
        } else {
            setStatus('Failed to start: ' + (result?.error || 'unknown'), 'error');
        }
    } catch (e) {
        setStatus('Error: ' + e.message, 'error');
    }
});

document.getElementById('btnStop').addEventListener('click', async () => {
    setStatus('Saving...');
    let recType = 'webm';
    try { const s = await chrome.storage.session.get({ recording: 'webm' }); recType = s.recording; } catch (_) {}
    const stopAction = recType === 'gif' ? 'stopGIFRecording' : 'stopTabRecording';
    try {
        const result = await chrome.runtime.sendMessage({ action: stopAction });
        setRecordingUI(false);
        try { chrome.storage.session.set({ recording: false }); } catch (_) {}
        if (result && result.success) {
            setStatus('Saved!', 'success');
            setTimeout(() => setStatus(''), 2000);
        } else {
            setStatus('Save error', 'error');
        }
    } catch (e) {
        setStatus('Error: ' + e.message, 'error');
    }
});
