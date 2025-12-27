/**
 * Snappy Pro V4 - Vector Object Engine
 * Features: Undo, Move, Realistic Shapes, Scrollbar Hiding, Overlap Stitching
 */

(function () {
    'use strict';
    if (window.snappyLoaded) return;
    window.snappyLoaded = true;

    // --- State ---
    const state = {
        mode: 'idle',
        tool: 'select',
        color: '#facc15',
        lineWidth: 4,
        dpr: window.devicePixelRatio || 1,

        container: null,
        toolbar: null,
        canvasOrig: null,
        canvasDraw: null,

        objects: [],
        history: [],
        activeObj: null,
        isDragging: false,
        dragStart: { x: 0, y: 0 },
        currentShape: null,

        cropRect: { x: 0, y: 0, w: 0, h: 0 },
        textInput: null
    };

    // --- Assets ---
    const ICONS = {
        select: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>`,
        move: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>`,
        pen: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>`,
        arrow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>`,
        rect: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" stroke-width="2"/></svg>`,
        circle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>`,
        text: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16m-7 6h7" /></svg>`,
        undo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>`,
        download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>`,
        close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>`
    };

    const COLORS = ['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#ffffff'];

    // --- Init ---
    function init(url) {
        if (state.container) cleanup();
        state.screenshotDataUrl = url;
        state.mode = 'selecting';
        state.objects = [];
        createDOM();
        loadImage(url);
        bindEvents();
    }

    // --- Setup ---
    function createDOM() {
        const root = document.createElement('div');
        root.id = 'snappy-container';
        document.body.appendChild(root);
        state.container = root;

        const ol = document.createElement('div');
        ol.id = 'snappy-overlay';
        root.appendChild(ol);
        state.overlay = ol;

        ['snappy-original-canvas', 'snappy-drawing-canvas'].forEach(id => {
            const c = document.createElement('canvas');
            c.id = id;
            c.className = 'snappy-canvas-layer';
            root.appendChild(c);
        });
        state.canvasOrig = document.getElementById('snappy-original-canvas');
        state.canvasDraw = document.getElementById('snappy-drawing-canvas');

        const sel = document.createElement('div');
        sel.id = 'snappy-selection';
        root.appendChild(sel);
        state.selection = sel;

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

    // --- Rendering Engine ---
    function render() {
        const ctx = state.canvasDraw.getContext('2d');
        const dpr = state.dpr;
        ctx.clearRect(0, 0, state.canvasDraw.width / dpr, state.canvasDraw.height / dpr);
        state.objects.forEach(obj => drawObject(ctx, obj));
        if (state.currentShape) drawObject(ctx, state.currentShape);
    }

    function drawObject(ctx, obj) {
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = obj.color;
        ctx.fillStyle = obj.color;
        ctx.lineWidth = obj.lineWidth || 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;

        if (obj.type === 'pen') {
            if (obj.points.length < 2) return;
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.moveTo(obj.points[0].x, obj.points[0].y);
            for (let i = 1; i < obj.points.length; i++) ctx.lineTo(obj.points[i].x, obj.points[i].y);
            ctx.stroke();
        }
        else if (obj.type === 'rect') ctx.strokeRect(obj.x, obj.y, obj.w, obj.h);
        else if (obj.type === 'circle') {
            ctx.beginPath();
            const r = Math.sqrt(obj.w * obj.w + obj.h * obj.h);
            ctx.arc(obj.x, obj.y, r, 0, 2 * Math.PI);
            ctx.stroke();
        }
        else if (obj.type === 'arrow') drawArrow(ctx, obj.x, obj.y, obj.x + obj.w, obj.y + obj.h);
        else if (obj.type === 'text') {
            ctx.shadowBlur = 0;
            ctx.font = 'bold 16px Inter, sans-serif';
            ctx.textBaseline = 'top';
            ctx.fillText(obj.text, obj.x, obj.y);
        }
        ctx.restore();
    }

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

    // --- Interaction ---
    function onDown(e) {
        if (e.target.closest('#snappy-toolbar')) return;
        state.isDragging = true;
        state.dragStart = { x: e.clientX, y: e.clientY };

        if (!state.toolbar && state.tool !== 'select') return;

        if (state.tool === 'move') {
            const x = e.clientX, y = e.clientY;
            state.activeObj = null;
            for (let i = state.objects.length - 1; i >= 0; i--) {
                const o = state.objects[i];
                const bx = o.x, by = o.y, bw = o.w || 100, bh = o.h || 20;
                // Simple bbox check
                if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
                    state.activeObj = o;
                    state.dragStart = { x: x - o.x, y: y - o.y };
                    break;
                }
            }
            return;
        }

        if (['rect', 'circle', 'arrow'].includes(state.tool)) {
            state.currentShape = { type: state.tool, x: e.clientX, y: e.clientY, w: 0, h: 0, color: state.color };
        } else if (state.tool === 'pen') {
            state.currentShape = { type: 'pen', points: [{ x: e.clientX, y: e.clientY }], color: state.color };
        } else if (state.tool === 'select') {
            state.selection.style.display = 'block';
        }
    }

    function onMove(e) {
        if (!state.isDragging) return;
        const x = e.clientX, y = e.clientY;

        if (state.tool === 'move' && state.activeObj) {
            state.activeObj.x = x - state.dragStart.x;
            state.activeObj.y = y - state.dragStart.y;
            render();
            return;
        }

        if (state.tool === 'select') {
            const sx = state.dragStart.x, sy = state.dragStart.y;
            const rx = Math.min(sx, x), ry = Math.min(sy, y);
            const rw = Math.abs(x - sx), rh = Math.abs(y - sy);
            state.cropRect = { x: rx, y: ry, w: rw, h: rh };
            Object.assign(state.selection.style, { left: rx + 'px', top: ry + 'px', width: rw + 'px', height: rh + 'px' });
        }
        else if (state.currentShape) {
            if (state.tool === 'pen') state.currentShape.points.push({ x, y });
            else {
                state.currentShape.w = x - state.currentShape.x;
                state.currentShape.h = y - state.currentShape.y;
            }
            render();
        }
    }

    function onUp(e) {
        if (!state.isDragging) return;
        state.isDragging = false;

        if (state.tool === 'select') {
            if (state.cropRect.w > 10) createToolbar();
            else {
                state.selection.style.display = 'none';
                if (state.toolbar) state.toolbar.remove(); state.toolbar = null;
            }
        }
        else if (state.currentShape) {
            state.objects.push(state.currentShape);
            state.currentShape = null;
            render();
        }
        else if (state.tool === 'text') spawnText(e.clientX, e.clientY);
    }

    function undo() {
        if (state.objects.length > 0) {
            state.objects.pop();
            render();
        }
    }

    function spawnText(x, y) {
        const inp = state.textInput;
        inp.innerText = '';
        Object.assign(inp.style, { display: 'block', left: x + 'px', top: y + 'px', color: state.color });
        inp.focus();
        function commit() {
            if (inp.innerText.trim()) {
                state.objects.push({ type: 'text', text: inp.innerText, x: x, y: y, color: state.color, w: 100, h: 20 });
                render();
            }
            inp.style.display = 'none';
        }
        inp.onblur = commit;
        inp.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); inp.blur(); } };
    }

    // --- Toolbar ---
    function createToolbar() {
        if (state.toolbar) return;
        const tb = document.createElement('div');
        tb.id = 'snappy-toolbar';

        const tools = [
            { id: 'move', icon: ICONS.move, label: 'Move' },
            { id: 'pen', icon: ICONS.pen, label: 'Pen' },
            { id: 'arrow', icon: ICONS.arrow, label: 'Arrow' },
            { id: 'rect', icon: ICONS.rect, label: 'Box' },
            { id: 'circle', icon: ICONS.circle, label: 'Circle' },
            { id: 'text', icon: ICONS.text, label: 'Text' }
        ];

        tools.forEach(t => {
            const b = document.createElement('button');
            b.className = `snappy-btn`;
            b.innerHTML = `${t.icon}<span id='snappy-tooltip-label'>${t.label}</span>`;
            b.onclick = () => setTool(t.id, b);
            tb.appendChild(b);
        });
        tb.appendChild(mkDiv());
        const ub = document.createElement('button');
        ub.className = 'snappy-btn';
        ub.innerHTML = `${ICONS.undo}<span id='snappy-tooltip-label'>Undo</span>`;
        ub.onclick = undo;
        tb.appendChild(ub);
        tb.appendChild(mkDiv());
        COLORS.forEach(c => {
            const d = document.createElement('div');
            d.className = `snappy-color ${c === state.color ? 'active' : ''}`;
            d.style.background = c;
            d.onclick = () => setColor(c, d);
            tb.appendChild(d);
        });
        tb.appendChild(mkDiv());
        const dl = document.createElement('button');
        dl.className = 'snappy-btn snappy-btn-primary';
        dl.innerHTML = ICONS.download;
        dl.onclick = download;
        tb.appendChild(dl);
        const cl = document.createElement('button');
        cl.className = 'snappy-btn';
        cl.innerHTML = ICONS.close;
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

    function setTool(id, btn) {
        state.tool = id;
        state.toolbar.querySelectorAll('.snappy-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        const isMove = id === 'move';
        state.canvasDraw.style.pointerEvents = 'auto';
        state.selection.style.pointerEvents = 'none';
        state.overlay.style.pointerEvents = 'none';
    }

    function setColor(c, el) {
        state.color = c;
        state.toolbar.querySelectorAll('.snappy-color').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
    }

    function updateToolbar() {
        const r = state.cropRect;
        if (!state.toolbar) return;
        state.toolbar.style.top = (r.y + r.h + 16) + 'px';
        state.toolbar.style.left = (r.x) + 'px';
    }

    function download() {
        const r = state.cropRect;
        const d = state.dpr;
        const cvs = document.createElement('canvas');
        cvs.width = r.w * d; cvs.height = r.h * d;
        const ctx = cvs.getContext('2d');
        ctx.drawImage(state.canvasOrig, r.x * d, r.y * d, r.w * d, r.h * d, 0, 0, r.w * d, r.h * d);
        ctx.translate(-r.x * d, -r.y * d);
        ctx.scale(d, d);
        state.objects.forEach(obj => drawObject(ctx, obj));

        const url = cvs.toDataURL('image/png');
        chrome.runtime.sendMessage({ action: 'downloadImage', dataUrl: url, filename: `snappy-pro-${Date.now()}.png` });
        cleanup();
    }

    function cleanup() {
        if (state.container) state.container.remove();
        state.container = null;
    }

    function bindEvents() {
        const d = document;
        d.addEventListener('mousedown', onDown);
        d.addEventListener('mousemove', onMove);
        d.addEventListener('mouseup', onUp);
        d.addEventListener('keydown', e => e.key === 'Escape' && cleanup());
        d.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') undo();
        });
    }

    // --- Messages ---
    chrome.runtime.onMessage.addListener((m, s, r) => {
        if (m.action === 'startCrop') init(m.screenshot);
        if (m.action === 'startTimer') startTimer();

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

        if (m.action === 'prepareFullPage') {
            const css = `html::-webkit-scrollbar{display:none!important}body::-webkit-scrollbar{display:none!important}html,body{scrollbar-width:none!important;overflow:visible!important}`;
            let style = document.getElementById('snappy-scroll-style');
            if (!style) {
                style = document.createElement('style');
                style.id = 'snappy-scroll-style';
                document.head.appendChild(style);
            }
            style.textContent = css;
            setTimeout(() => r({ success: true }), 100);
            return true;
        }

        if (m.action === 'scrollNext') {
            const startY = window.scrollY;
            // Styles already injected by prepareFullPage
            // We do aggressive unlock in case it was reset
            document.documentElement.style.overflow = 'visible';
            document.body.style.overflow = 'visible';

            window.scrollBy({ left: 0, top: window.innerHeight, behavior: 'smooth' });

            setTimeout(() => {
                const endY = window.scrollY;
                const moved = Math.abs(endY - startY) > 1; // Any move is good
                if (moved) {
                    // Hide for capture
                    document.documentElement.style.overflow = 'hidden';
                    document.body.style.overflow = 'hidden';
                }
                r({ moved, y: endY });
            }, 800);
            return true;
        }

        if (m.action === 'stitchAndDownload') {
            const style = document.getElementById('snappy-scroll-style');
            if (style) style.remove();
            // restore overflow
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';

            stitchImages(m.captures, m.totalHeight, m.viewportHeight, m.devicePixelRatio);
        }
    });

    async function stitchImages(captures, totalH, viewH, dpr) {
        captures.sort((a, b) => a.y - b.y);
        const load = (src) => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = src; });
        const images = [];
        for (const c of captures) images.push(await load(c.dataUrl));
        if (images.length === 0) return;

        const canvas = document.createElement('canvas');
        canvas.width = images[0].width;
        canvas.height = totalH * dpr * 1.5;
        const ctx = canvas.getContext('2d');

        ctx.drawImage(images[0], 0, 0);
        let currentY = images[0].height;

        for (let i = 1; i < images.length; i++) {
            const prev = images[i - 1];
            const curr = images[i];

            const w = canvas.width;
            const searchH = Math.min(prev.height, 800 * dpr);
            // Get bottom of MAIN canvas
            const prevData = ctx.getImageData(0, currentY - searchH, w, searchH);

            const tmpC = document.createElement('canvas');
            tmpC.width = curr.width; tmpC.height = curr.height;
            const tmpCtx = tmpC.getContext('2d');
            tmpCtx.drawImage(curr, 0, 0);
            const currData = tmpCtx.getImageData(0, 0, w, searchH);

            let foundOverlap = 0;
            const stride = 4;

            // Check rows from bottom of prev up
            for (let y = 0; y < searchH - 10; y++) {
                if (compareRows(prevData, y, currData, 0, w, stride)) {
                    // Match found at offset y in search area
                    // Overlap amount is searchH - y
                    foundOverlap = searchH - y;
                    break;
                }
            }

            if (foundOverlap > 0) {
                const cropH = curr.height - foundOverlap;
                ctx.drawImage(curr, 0, foundOverlap, curr.width, cropH, 0, currentY, curr.width, cropH);
                currentY += cropH;
            } else {
                ctx.drawImage(curr, 0, currentY);
                currentY += curr.height;
            }
        }

        const finalC = document.createElement('canvas');
        finalC.width = canvas.width;
        finalC.height = currentY;
        finalC.getContext('2d').drawImage(canvas, 0, 0);

        const url = finalC.toDataURL('image/png');
        chrome.runtime.sendMessage({ action: 'downloadImage', dataUrl: url, filename: `snappy-full-${Date.now()}.png` });
    }

    function compareRows(d1, y1, d2, y2, w, stride) {
        const off1 = y1 * w * 4;
        const off2 = y2 * w * 4;
        const limit = w * 4;
        const start = Math.floor(limit * 0.1);
        const end = Math.floor(limit * 0.9);
        for (let i = start; i < end; i += (4 * stride)) {
            if (Math.abs(d1.data[off1 + i] - d2.data[off2 + i]) > 5) return false;
            if (Math.abs(d1.data[off1 + i + 1] - d2.data[off2 + i + 1]) > 5) return false;
            if (Math.abs(d1.data[off1 + i + 2] - d2.data[off2 + i + 2]) > 5) return false;
        }
        return true;
    }

    function startTimer() {
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
            if (count > 0) cd.textContent = count;
            else { clearInterval(int); cd.remove(); chrome.runtime.sendMessage({ action: 'captureNow' }); }
        }, 1000);
    }
})();
