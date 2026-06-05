const grid = document.getElementById('grid');
const emptyState = document.getElementById('emptyState');
const countEl = document.getElementById('countEl');

function timeAgo(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ago`;
    if (h > 0) return `${h}h ago`;
    if (m > 0) return `${m}m ago`;
    return 'Just now';
}

function render(history) {
    grid.innerHTML = '';
    countEl.textContent = `${history.length} capture${history.length !== 1 ? 's' : ''}`;
    emptyState.style.display = history.length === 0 ? 'block' : 'none';
    grid.style.display = history.length === 0 ? 'none' : 'grid';

    history.forEach((entry) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="thumb"><img src="${entry.thumbnail}" alt="" loading="lazy"></div>
            <div class="card-body">
                <div class="card-name" title="${entry.filename}">${entry.filename}</div>
                <div class="card-time">${timeAgo(entry.ts)}${entry.pageUrl ? ' · ' + new URL(entry.pageUrl).hostname : ''}</div>
            </div>
            <div class="card-actions">
                <button class="act-btn copy-btn" title="Copy to clipboard">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                    </svg>
                </button>
                <button class="act-btn del del-btn" title="Delete">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/>
                    </svg>
                </button>
            </div>
        `;

        card.addEventListener('click', (e) => {
            if (e.target.closest('.act-btn')) return;
            openLightbox(entry.thumbnail);
        });

        card.querySelector('.copy-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                const res = await fetch(entry.thumbnail);
                const blob = await res.blob();
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                showFlash(card, 'Copied!');
            } catch {
                showFlash(card, 'Copy failed', true);
            }
        });

        card.querySelector('.del-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteEntry(entry.id);
        });

        grid.appendChild(card);
    });
}

function openLightbox(src) {
    document.getElementById('lbImg').src = src;
    document.getElementById('lightbox').classList.add('open');
}

document.getElementById('lbClose').addEventListener('click', () => {
    document.getElementById('lightbox').classList.remove('open');
    document.getElementById('lbImg').src = '';
});
document.getElementById('lightbox').addEventListener('click', (e) => {
    if (e.target === document.getElementById('lightbox')) {
        document.getElementById('lightbox').classList.remove('open');
    }
});

function deleteEntry(id) {
    chrome.storage.local.get({ history: [] }, ({ history }) => {
        const updated = history.filter(e => e.id !== id);
        chrome.storage.local.set({ history: updated }, () => render(updated));
    });
}

document.getElementById('clearBtn').addEventListener('click', () => {
    if (confirm('Clear all screenshot history?')) {
        chrome.storage.local.set({ history: [] }, () => render([]));
    }
});

function showFlash(card, msg, isError) {
    const el = document.createElement('div');
    Object.assign(el.style, {
        position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)',
        background: isError ? '#ef4444' : '#22c55e', color: 'white',
        padding: '3px 10px', borderRadius: '5px', fontSize: '11px',
        fontWeight: '600', whiteSpace: 'nowrap', zIndex: '10'
    });
    el.textContent = msg;
    card.style.position = 'relative';
    card.appendChild(el);
    setTimeout(() => el.remove(), 1800);
}

// Load on open
chrome.storage.local.get({ history: [] }, ({ history }) => render(history));

// Live update if new screenshots come in
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.history) {
        render(changes.history.newValue || []);
    }
});
