/**
 * Popup Logic
 * Handles 3 modes: Visible, Full Page, Timer
 */

const btnVisible = document.getElementById('btnVisible');
const btnFull = document.getElementById('btnFull');
const btnTimer = document.getElementById('btnTimer');
const statusEl = document.getElementById('status');

function setStatus(msg, type = '') {
    statusEl.textContent = msg;
    statusEl.className = type;
}

async function inject(tabId) {
    setStatus('Injecting scripts...');
    try {
        await chrome.scripting.insertCSS({ target: { tabId }, files: ['styles.css'] });
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    } catch (e) {
        console.error(e); // Keep for dev debugging in popup console
    }
}

async function handleCapture(mode) {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || tab.url.startsWith('chrome')) {
            setStatus('Cannot capture this page', 'error');
            return;
        }

        // 1. Inject
        await inject(tab.id);

        await new Promise(r => setTimeout(r, 100));

        // 2. Dispatch Mode
        if (mode === 'visible') {
            const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
            await chrome.tabs.sendMessage(tab.id, { action: 'startCrop', screenshot: dataUrl });
            window.close();
        }
        else if (mode === 'timer') {
            // Tell content script to show countdown (fire and forget)
            chrome.tabs.sendMessage(tab.id, { action: 'startTimer' });
            window.close();
        }
        else if (mode === 'full') {
            setStatus('Scrolling & Capturing...', '');
            chrome.runtime.sendMessage({ action: 'initFullPage', tabId: tab.id });
            window.close();
        }

    } catch (e) {
        setStatus('Error: ' + e.message, 'error');
    }
}

btnVisible.onclick = () => handleCapture('visible');
btnTimer.onclick = () => handleCapture('timer');
btnFull.onclick = () => handleCapture('full');
