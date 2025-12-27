/**
 * Snappy Professional Content Script v3.0
 * Features: Layers, Shapes, Timer, Premium UI
 */

(function () {
    'use strict';
    if (window.snappyLoaded) return;
    window.snappyLoaded = true;

    // --- State ---
    const state = {
        mode: 'idle',
        tool: 'select',
        isDragging: false,
        startX: 0, startY: 0,
        color: '#facc15',
        lineWidth: 4,
        dpr: window.devicePixelRatio || 1,
        // DOM
        container: null,
        toolbar: null,
        textInput: null,
        // Data
        screenshotDataUrl: null,
        cropRect: { x: 0, y: 0, w: 0, h: 0 },

        // Timer
        timerInterval: null
    };

    // --- Assets ---
    const icons = {
        select: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>`,
        pen: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>`,
        arrow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>`,
        text: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16m-7 6h7" /></svg>`,
        rect: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" stroke-width="2"/></svg>`,
        circle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>`,
        download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>`,
        close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>`,
    };

    // Tools Config
    const TOOLS = [
        { id: 'select', icon: icons.select, label: 'Select' },
        { id: 'pen', icon: icons.pen, label: 'Pen' },
        { id: 'arrow', icon: icons.arrow, label: 'Arrow' },
        { id: 'rect', icon: icons.rect, label: 'Box' },
        { id: 'circle', icon: icons.circle, label: 'Circle' },
        { id: 'text', icon: icons.text, label: 'Text' }
    ];

    const COLORS = ['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#ffffff'];

    // --- Init ---
    function init(url) {
        if (state.container) cleanup();
        state.screenshotDataUrl = url;
        state.dpr = window.devicePixelRatio || 1;
        state.mode = 'selecting';
        state.tool = 'select';
        createDOM();
        loadImage(url);
        bindEvents();
    }

    // --- DOM Creation --- 
    function createDOM() {
        const root = document.createElement('div');
        root.id = 'snappy-container';
        document.body.appendChild(root);
        state.container = root;

        // Overlay
        const ol = document.createElement('div');
        ol.id = 'snappy-overlay';
        root.appendChild(ol);
        state.overlay = ol;

        // Canvases
        ['snappy-original-canvas', 'snappy-drawing-canvas'].forEach(id => {
            const c = document.createElement('canvas');
            c.id = id;
            c.className = 'snappy-canvas-layer';
            root.appendChild(c);
        });
        state.canvasOrig = document.getElementById('snappy-original-canvas');
        state.canvasDraw = document.getElementById('snappy-drawing-canvas');

        // Selection
        const sel = document.createElement('div');
        sel.id = 'snappy-selection';
        root.appendChild(sel);
        state.selection = sel;

        // Text Input
        const inp = document.createElement('div');
        inp.id = 'snappy-text-input';
        inp.contentEditable = true;
        inp.style.display = 'none';
        root.appendChild(inp);
        state.textInput = inp;
    }

    function loadImage(url) {
        const img = new Image();
        img.onload = () => {
            const w = img.width;
            const h = img.height;
            const dw = w / state.dpr;
            const dh = h / state.dpr;

            [state.canvasOrig, state.canvasDraw].forEach(c => {
                c.width = w; c.height = h;
                c.style.width = dw + 'px'; c.style.height = dh + 'px';
                c.getContext('2d').scale(state.dpr, state.dpr);
            });
            state.canvasOrig.getContext('2d').drawImage(img, 0, 0, dw, dh);
        };
        img.src = url;
    }

    // --- Toolbar ---
    function createToolbar() {
        if (state.toolbar) return;
        const tb = document.createElement('div');
        tb.id = 'snappy-toolbar';

        // Tools
        TOOLS.forEach(t => {
            const b = document.createElement('button');
            b.className = `snappy-btn ${t.id === state.tool ? 'active' : ''}`;
            b.innerHTML = `${t.icon}<span id='snappy-tooltip-label'>${t.label}</span>`;
            b.onclick = () => setTool(t.id, b);
            tb.appendChild(b);
        });

        // Div
        tb.appendChild(mkDiv());

        // Colors
        const cBox = document.createElement('div');
        cBox.className = 'snappy-colors';
        COLORS.forEach(c => {
            const d = document.createElement('div');
            d.className = `snappy-color ${c === state.color ? 'active' : ''}`;
            d.style.background = c;
            d.onclick = () => setColor(c, d);
            cBox.appendChild(d);
        });
        tb.appendChild(cBox);

        // Div
        tb.appendChild(mkDiv());

        // Actions
        const dl = document.createElement('button');
        dl.className = 'snappy-btn snappy-btn-primary';
        dl.innerHTML = `${icons.download} Save`;
        dl.onclick = download;
        tb.appendChild(dl);

        const cl = document.createElement('button');
        cl.className = 'snappy-btn';
        cl.innerHTML = icons.close;
        cl.onclick = cleanup;
        tb.appendChild(cl);

        state.container.appendChild(tb);
        state.toolbar = tb;
        updateToolbar();
        requestAnimationFrame(() => tb.classList.add('visible'));
    }

    function mkDiv() {
        const d = document.createElement('div');
        d.className = 'snappy-divider';
        return d;
    }

    function updateToolbar() {
        if (!state.toolbar) return;
        const r = state.cropRect;
        const t = state.toolbar.getBoundingClientRect();

        let top = r.y + r.h + 16;
        let left = r.x + (r.w / 2) - (t.width / 2);

        if (top + t.height > window.innerHeight) top = r.y - t.height - 16;
        if (left < 16) left = 16;
        if (left + t.width > window.innerWidth) left = window.innerWidth - t.width - 16;

        state.toolbar.style.top = top + 'px';
        state.toolbar.style.left = left + 'px';
    }

    function setTool(id, btn) {
        state.tool = id;
        state.toolbar.querySelectorAll('.snappy-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        const isSel = id === 'select';
        state.canvasDraw.style.pointerEvents = isSel ? 'none' : 'auto';
        state.overlay.style.pointerEvents = isSel ? 'auto' : 'none';
    }

    function setColor(c, el) {
        state.color = c;
        state.toolbar.querySelectorAll('.snappy-color').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
    }

    // --- Interaction ---
    function onDown(e) {
        if (e.target.closest('#snappy-toolbar')) return;
        state.isDragging = true;
        state.startX = e.clientX;
        state.startY = e.clientY;

        const ctx = state.canvasDraw.getContext('2d');
        ctx.strokeStyle = state.color;
        ctx.fillStyle = state.color;
        ctx.lineWidth = state.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (state.tool === 'select') {
            state.selection.style.display = 'block';
            state.selection.style.w = 0;
        } else if (state.tool === 'pen') {
            ctx.beginPath();
            ctx.moveTo(e.clientX, e.clientY);
        } else if (state.tool === 'text') {
            spawnText(e.clientX, e.clientY);
            state.isDragging = false;
        }
    }

    function onMove(e) {
        if (!state.isDragging) return;
        const x = e.clientX, y = e.clientY;

        if (state.tool === 'select') {
            const rx = Math.min(state.startX, x), ry = Math.min(state.startY, y);
            const rw = Math.abs(x - state.startX), rh = Math.abs(y - state.startY);
            state.cropRect = { x: rx, y: ry, w: rw, h: rh };
            Object.assign(state.selection.style, { left: rx + 'px', top: ry + 'px', width: rw + 'px', height: rh + 'px' });
        } else if (state.tool === 'pen') {
            const ctx = state.canvasDraw.getContext('2d');
            ctx.lineTo(x, y);
            ctx.stroke();
        }
        // Note: For shapes (Rect/Circle/Arrow) we ideally want a "preview" layer.
        // For this version (without adding another canvas), we draw only on Up.
        // Or we could implement XOR clearing but that's complex with colors.
        // Pro move: We wait for Up to draw shape.
    }

    function onUp(e) {
        if (!state.isDragging) return;
        state.isDragging = false;

        const x = e.clientX, y = e.clientY;
        const ctx = state.canvasDraw.getContext('2d');

        if (state.tool === 'select') {
            if (state.cropRect.w > 10) createToolbar();
            else {
                state.selection.style.display = 'none';
                if (state.toolbar) state.toolbar.remove(); state.toolbar = null;
            }
        } else if (state.tool === 'arrow') {
            drawArrow(ctx, state.startX, state.startY, x, y);
        } else if (state.tool === 'rect') {
            const w = x - state.startX;
            const h = y - state.startY;
            ctx.strokeRect(state.startX, state.startY, w, h);
        } else if (state.tool === 'circle') {
            ctx.beginPath();
            const r = Math.sqrt(Math.pow(x - state.startX, 2) + Math.pow(y - state.startY, 2));
            ctx.arc(state.startX, state.startY, r, 0, 2 * Math.PI);
            ctx.stroke();
        }
    }

    // --- Drawing Primitives ---
    function drawArrow(ctx, x1, y1, x2, y2) {
        const head = 12;
        const dx = x2 - x1, dy = y2 - y1;
        const angle = Math.atan2(dy, dx);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
        ctx.lineTo(x2, y2);
        ctx.fill();
    }

    function spawnText(x, y) {
        const inp = state.textInput;
        inp.innerText = '';
        Object.assign(inp.style, { display: 'block', left: x + 'px', top: y + 'px', color: state.color });
        inp.focus();

        function commit() {
            if (inp.innerText.trim()) {
                const ctx = state.canvasDraw.getContext('2d');
                ctx.fillStyle = state.color;
                ctx.font = 'bold 16px Inter, sans-serif';
                ctx.fillText(inp.innerText, x + 4, y + 20);
            }
            inp.style.display = 'none';
        }
        inp.onblur = commit;
        inp.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); inp.blur(); } };
    }

    // --- Timer UI ---
    function startTimer() {
        // Create Countdown overlay
        const cd = document.createElement('div');
        Object.assign(cd.style, {
            position: 'fixed', inset: 0, zIndex: 999999,
            background: 'rgba(0,0,0,0.3)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: '120px', color: 'white', fontWeight: 'bold',
            fontFamily: 'Inter, sans-serif'
        });
        document.body.appendChild(cd);

        let count = 3;
        cd.textContent = count;

        const int = setInterval(() => {
            count--;
            if (count > 0) {
                cd.textContent = count;
            } else {
                clearInterval(int);
                cd.remove();
                // Trigger capture
                chrome.runtime.sendMessage({ action: 'captureNow' });
            }
        }, 1000);
    }

    // --- Download ---
    function download() {
        const r = state.cropRect;
        const d = state.dpr;
        const cvs = document.createElement('canvas');
        cvs.width = r.w * d; cvs.height = r.h * d;
        const ctx = cvs.getContext('2d');

        [state.canvasOrig, state.canvasDraw].forEach(c => {
            ctx.drawImage(c, r.x * d, r.y * d, r.w * d, r.h * d, 0, 0, r.w * d, r.h * d);
        });

        const url = cvs.toDataURL('image/png');
        const name = `snappy-${Date.now()}.png`;

        chrome.runtime.sendMessage({ action: 'downloadImage', dataUrl: url, filename: name }, (res) => {
            if (!res || !res.success) {
                const a = document.createElement('a');
                a.href = url; a.download = name; a.click();
            }
            cleanup();
        });
    }

    function bindEvents() {
        const d = document;
        d.addEventListener('mousedown', onDown);
        d.addEventListener('mousemove', onMove);
        d.addEventListener('mouseup', onUp);
        d.addEventListener('keydown', e => e.key === 'Escape' && cleanup());
    }

    function cleanup() {
        if (state.container) state.container.remove();
        state.container = null;
        state.toolbar = null;
        // remove listeners if bound named functions, 
        // keeping it simple as page refresh/re-inject clears anyway usually.
    }

    // --- Msg Listener ---
    chrome.runtime.onMessage.addListener((m, s, r) => {
        if (m.action === 'startCrop') init(m.screenshot);
        if (m.action === 'startTimer') startTimer();

        // Full Page Handlers
        if (m.action === 'getPageMetrics') {
            const h = Math.max(
                document.documentElement.scrollHeight,
                document.body.scrollHeight,
                document.documentElement.offsetHeight
            );
            r({
                totalHeight: h,
                viewportHeight: window.innerHeight,
                devicePixelRatio: window.devicePixelRatio || 1
            });
            return true;
        }

        if (m.action === 'scrollTo') {
            window.scrollTo(0, m.y);
            // Hide scrollbars to avoid ugly stitching artifacts
            document.documentElement.style.overflow = 'hidden';
            r({ success: true });
        }

        if (m.action === 'stitchAndOpen') {
            // Restore scroll
            document.documentElement.style.overflow = '';

            // Stitch
            stitchImages(m.captures, m.totalHeight, m.viewportHeight, m.devicePixelRatio);
        }

        return true;
    });

    async function stitchImages(captures, totalH, viewH, dpr) {
        // Create huge canvas
        const canvas = document.createElement('canvas');
        canvas.width = window.innerWidth * dpr;
        canvas.height = totalH * dpr;
        const ctx = canvas.getContext('2d');

        // Draw each chunk
        let imagesLoaded = 0;

        // Sort by y pos to be safe
        captures.sort((a, b) => a.y - b.y);

        // We need to wait for all images to load
        // Helper to load image
        const load = (src) => new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.src = src;
        });

        for (const chunk of captures) {
            const img = await load(chunk.dataUrl);
            // Clip the bottom of the last image if needed?
            // Usually captureVisibleTab returns full viewport height.
            // If we are at the bottom, we might overlap.
            // Simple stitch: just draw at Y.
            // If (y + viewH > totalH), we are capturing the bottom "scrolled up" bit.
            // But our loop does explicit Ys.
            // Logic check: if we scroll to Y, chrome captures viewport starting at Y.
            // So we draw at Y * dpr.
            ctx.drawImage(img, 0, chunk.y * dpr);
        }

        // Get final data URL
        const finalUrl = canvas.toDataURL('image/png');

        // Open Editor
        init(finalUrl);
    }

})();
