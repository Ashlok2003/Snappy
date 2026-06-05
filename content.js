/**
 * Snappy Pro v2 — Content Script
 * Crop → Professional Image Editor
 */

(function () {
    'use strict';
    if (window.snappyLoaded) return;
    window.snappyLoaded = true;

    const state = {
        mode: 'idle',
        dpr: window.devicePixelRatio || 1,
        container: null,
        overlay: null,
        canvasOrig: null,
        selection: null,
        handles: {},
        resizingHandle: null,
        resizeOrigin: null,
        isDragging: false,
        dragStart: { x: 0, y: 0 },
        cropRect: { x: 0, y: 0, w: 0, h: 0 },
        screenshotDataUrl: null,
        elemHighlight: null,

        // Editor state
        ed: {
            root: null,
            displayCanvas: null,
            annotCanvas: null,
            adjuster: null,
            adjParams: null,
            curves: null,
            objects: [],
            redo: [],
            tool: 'pen',
            color: '#facc15',
            lineWidth: 4,
            opacity: 1.0,
            fill: false,
            stepCounter: 1,
            currentShape: null,
            isDragging: false,
            dragStart: { x: 0, y: 0 },
            activeObj: null,
            zoom: 1,
            panX: 0,
            panY: 0,
            panning: false,
            panStart: null,
            panOrigin: null,
            panelMode: 'annotate',
            rotateAngle: 0,
            flipH: false,
            flipV: false,
            cropAspect: null,
            targetW: 0,
            targetH: 0,
            activePreset: null,
            curveChannel: 'master',
            curveDragIdx: -1,
            adjTimer: null,
            exportFormat: 'png',
            jpegQuality: 0.9
        }
    };

    const IC = {
        select:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M5 3l14 9-7 2-4 7L5 3z"/></svg>`,
        move:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M12 3v18M3 12h18"/></svg>`,
        pen:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>`,
        highlight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 3l6 6-9 9H6v-6l9-9z"/><line x1="3" y1="21" x2="9" y2="21" stroke-linecap="round"/></svg>`,
        line:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="5" y1="19" x2="19" y2="5" stroke-linecap="round" stroke-width="2"/></svg>`,
        arrow:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M17 8l4 4-4 4M3 12h18"/></svg>`,
        rect:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" stroke-width="2"/></svg>`,
        circle:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9" stroke-width="2"/></svg>`,
        text:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h8m-8 6h16"/></svg>`,
        blur:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9" stroke-width="2" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="4" stroke-width="2"/></svg>`,
        eraser:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20 20H7L3 16l10-10 7 7-3.5 3.5M6.5 17.5l4-4"/></svg>`,
        number:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9" stroke-width="2"/><text x="12" y="16" text-anchor="middle" font-size="10" fill="currentColor" stroke="none" font-weight="bold">1</text></svg>`,
        undo:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6M3 10l6-6"/></svg>`,
        redo:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6"/></svg>`,
        rotate:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>`,
        copy:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="9" y="9" width="13" height="13" rx="2" stroke-width="2"/><path stroke-linecap="round" stroke-linejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`,
        download:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>`,
        close:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`,
        fill:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 20h18M3 20l5-14 4 7 3-4 3 6 2 5"/></svg>`,
        ocr:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/><path stroke-linecap="round" stroke-linejoin="round" d="M7 8h10M7 12h6M7 16h8"/></svg>`,
        flipH:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v18M5 7l-2 5 2 5M19 7l2 5-2 5M3 12h4M17 12h4"/></svg>`,
        flipV:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12h18M7 5l5-2 5 2M7 19l5 2 5-2M12 3v4M12 17v4"/></svg>`,
        crop:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 2v14h14M2 6h14"/></svg>`,
        zoomIn:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35M11 8v6M8 11h6"/></svg>`,
        zoomOut:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35M8 11h6"/></svg>`,
        settings:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path stroke-linecap="round" stroke-linejoin="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`,
        sidebar:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" stroke-width="2"/><path d="M16 3v18"/></svg>`
    };

    const COLORS = ['#ef4444','#f97316','#facc15','#22c55e','#3b82f6','#a855f7','#ffffff','#000000'];

    chrome.storage.sync.get({ lineWidth: 4, exportFormat: 'png', jpegQuality: 90 }, (p) => {
        state.ed.lineWidth = p.lineWidth;
        state.ed.exportFormat = p.exportFormat;
        state.ed.jpegQuality = p.jpegQuality / 100;
    });

    // ─── Crop Phase ───────────────────────────────────────────────────────────────

    function init(url, presetRect) {
        if (state.container) cleanup();
        state.screenshotDataUrl = url;
        state.mode = 'selecting';
        createDOM();
        loadScreenshot(url);
        bindCropEvents();
        if (presetRect) {
            state.cropRect = presetRect;
            state.selection.style.display = 'block';
            Object.assign(state.selection.style, {
                left: presetRect.x + 'px', top: presetRect.y + 'px',
                width: presetRect.w + 'px', height: presetRect.h + 'px'
            });
            setTimeout(openEditor, 100);
        }
    }

    function cleanup() {
        if (state.elemHighlight) { state.elemHighlight.remove(); state.elemHighlight = null; }
        if (state.container) { state.container.remove(); state.container = null; }
        if (state.ed.root) { state.ed.root.remove(); state.ed.root = null; }
        document.removeEventListener('mousedown', cropOnDown);
        document.removeEventListener('mousemove', cropOnMove);
        document.removeEventListener('mouseup', cropOnUp);
        document.removeEventListener('keydown', cropOnKey);
        window.snappyLoaded = false;
    }

    function createDOM() {
        const root = document.createElement('div');
        root.id = 'snappy-container';
        document.body.appendChild(root);
        state.container = root;

        const ol = document.createElement('div');
        ol.id = 'snappy-overlay';
        root.appendChild(ol);
        state.overlay = ol;

        const co = document.createElement('canvas');
        co.id = 'snappy-original-canvas';
        co.className = 'snappy-canvas-layer';
        root.appendChild(co);
        state.canvasOrig = co;

        const sel = document.createElement('div');
        sel.id = 'snappy-selection';
        root.appendChild(sel);
        state.selection = sel;

        const toast = document.createElement('div');
        toast.id = 'snappy-toast';
        root.appendChild(toast);

        ['nw','n','ne','e','se','s','sw','w'].forEach(pos => {
            const h = document.createElement('div');
            h.className = 'snappy-handle';
            h.dataset.pos = pos;
            h.style.display = 'none';
            root.appendChild(h);
            state.handles[pos] = h;
        });
    }

    function loadScreenshot(url) {
        const img = new Image();
        img.onload = () => {
            const w = img.width, h = img.height;
            const dw = w / state.dpr, dh = h / state.dpr;
            state.canvasOrig.width = w; state.canvasOrig.height = h;
            state.canvasOrig.style.width = dw + 'px'; state.canvasOrig.style.height = dh + 'px';
            const ctx = state.canvasOrig.getContext('2d');
            ctx.scale(state.dpr, state.dpr);
            ctx.drawImage(img, 0, 0, dw, dh);
        };
        img.src = url;
    }

    function updateHandles() {
        const r = state.cropRect;
        const mx = r.x + r.w / 2, my = r.y + r.h / 2;
        const pos = { nw:[r.x,r.y], n:[mx,r.y], ne:[r.x+r.w,r.y], e:[r.x+r.w,my], se:[r.x+r.w,r.y+r.h], s:[mx,r.y+r.h], sw:[r.x,r.y+r.h], w:[r.x,my] };
        Object.entries(pos).forEach(([k,[x,y]]) => {
            const el = state.handles[k];
            if (el) { el.style.display = 'block'; el.style.left = x + 'px'; el.style.top = y + 'px'; }
        });
    }

    function hideHandles() {
        Object.values(state.handles).forEach(h => h && (h.style.display = 'none'));
    }

    function resizeCropWith(x, y) {
        const o = state.resizeOrigin;
        let {x:rx, y:ry, w:rw, h:rh} = o;
        const dx = x - o.mx, dy = y - o.my;
        switch (state.resizingHandle) {
            case 'nw': rx+=dx; ry+=dy; rw-=dx; rh-=dy; break;
            case 'n':           ry+=dy; rh-=dy; break;
            case 'ne':          ry+=dy; rw+=dx; rh-=dy; break;
            case 'e':                   rw+=dx; break;
            case 'se':                  rw+=dx; rh+=dy; break;
            case 's':                           rh+=dy; break;
            case 'sw': rx+=dx; rw-=dx;          rh+=dy; break;
            case 'w':  rx+=dx; rw-=dx;          break;
        }
        if (rw < 20) { if (['nw','w','sw'].includes(state.resizingHandle)) rx = o.x + o.w - 20; rw = 20; }
        if (rh < 20) { if (['nw','n','ne'].includes(state.resizingHandle)) ry = o.y + o.h - 20; rh = 20; }
        state.cropRect = {x:rx, y:ry, w:rw, h:rh};
        Object.assign(state.selection.style, {left:rx+'px',top:ry+'px',width:rw+'px',height:rh+'px'});
        updateHandles();
    }

    function bindCropEvents() {
        document.addEventListener('mousedown', cropOnDown);
        document.addEventListener('mousemove', cropOnMove);
        document.addEventListener('mouseup', cropOnUp);
        document.addEventListener('keydown', cropOnKey);
    }

    function cropOnDown(e) {
        if (e.button !== 0) return;
        if (e.target.dataset && e.target.dataset.pos && e.target.classList.contains('snappy-handle')) {
            state.resizingHandle = e.target.dataset.pos;
            state.resizeOrigin = {...state.cropRect, mx: e.clientX, my: e.clientY};
            state.isDragging = true;
            e.stopPropagation();
            return;
        }
        state.isDragging = true;
        state.dragStart = {x: e.clientX, y: e.clientY};
        state.selection.style.display = 'block';
        hideHandles();
    }

    function cropOnMove(e) {
        if (!state.isDragging) return;
        if (state.resizingHandle) { resizeCropWith(e.clientX, e.clientY); return; }
        const sx = state.dragStart.x, sy = state.dragStart.y;
        const rx = Math.min(sx, e.clientX), ry = Math.min(sy, e.clientY);
        const rw = Math.abs(e.clientX - sx), rh = Math.abs(e.clientY - sy);
        state.cropRect = {x:rx, y:ry, w:rw, h:rh};
        Object.assign(state.selection.style, {left:rx+'px',top:ry+'px',width:rw+'px',height:rh+'px'});
    }

    function cropOnUp(e) {
        if (!state.isDragging) return;
        state.isDragging = false;
        if (state.resizingHandle) { state.resizingHandle = null; state.resizeOrigin = null; return; }
        const {w, h} = state.cropRect;
        if (w > 10 && h > 10) {
            updateHandles();
            openEditor();
        } else {
            state.selection.style.display = 'none';
            hideHandles();
        }
    }

    function cropOnKey(e) {
        if (e.key === 'Escape') cleanup();
    }

    // ─── Editor Phase ─────────────────────────────────────────────────────────────

    function openEditor() {
        document.removeEventListener('mousedown', cropOnDown);
        document.removeEventListener('mousemove', cropOnMove);
        document.removeEventListener('mouseup', cropOnUp);
        document.removeEventListener('keydown', cropOnKey);

        hideHandles();
        state.selection.style.display = 'none';
        state.overlay.style.display = 'none';

        const ed = state.ed;
        ed.objects = [];
        ed.redo = [];
        ed.stepCounter = 1;
        ed.zoom = 1;
        ed.panX = 0;
        ed.panY = 0;
        ed.rotateAngle = 0;
        ed.flipH = false;
        ed.flipV = false;
        ed.cropAspect = null;
        ed.activePreset = null;
        ed.panelMode = 'annotate';

        const adjuster = (typeof SnappyAdjust !== 'undefined') ? new SnappyAdjust() : null;
        ed.adjuster = adjuster;
        ed.adjParams = adjuster ? adjuster.getDefaults() : {};
        ed.curves = {
            master: [[0,0],[255,255]],
            r: [[0,0],[255,255]],
            g: [[0,0],[255,255]],
            b: [[0,0],[255,255]]
        };

        const r = state.cropRect;
        const d = state.dpr;

        const origCanvas = document.createElement('canvas');
        origCanvas.width = Math.round(r.w * d);
        origCanvas.height = Math.round(r.h * d);
        origCanvas.getContext('2d').drawImage(state.canvasOrig, r.x*d, r.y*d, r.w*d, r.h*d, 0, 0, r.w*d, r.h*d);

        ed.targetW = Math.round(r.w * d);
        ed.targetH = Math.round(r.h * d);

        ed.origCanvas = origCanvas;

        if (adjuster) {
            const imgData = origCanvas.getContext('2d').getImageData(0, 0, origCanvas.width, origCanvas.height);
            adjuster.load(imgData);
        }

        buildEditorDOM(origCanvas);
        renderEditorDisplay();
    }

    function buildEditorDOM(origCanvas) {
        if (state.ed.root) state.ed.root.remove();

        const root = document.createElement('div');
        root.id = 'snappy-editor';
        document.body.appendChild(root);
        state.ed.root = root;

        // ── Top bar ──
        const topbar = document.createElement('div');
        topbar.id = 'sned-topbar';
        topbar.innerHTML = `
            <div class="sned-tb-left">
                <button class="sned-btn" id="sned-close" title="Close (Esc)">${IC.close}</button>
                <div class="sned-tb-divider"></div>
                <div class="sned-logo-row">
                    <img src="${chrome.runtime.getURL('icons/icon128.png')}" class="sned-logo-img" alt="Snappy">
                    <span class="sned-logo">Snappy Pro</span>
                </div>
            </div>
            <div class="sned-tb-mid">
                <button class="sned-btn sned-icon-btn" id="sned-undo" title="Undo (Ctrl+Z)">${IC.undo}</button>
                <button class="sned-btn sned-icon-btn" id="sned-redo" title="Redo (Ctrl+Y)">${IC.redo}</button>
            </div>
            <div class="sned-tb-right">
                <button class="sned-btn" id="sned-toggle-sidebar" title="Toggle Sidebar">${IC.sidebar}</button>
                <div class="sned-tb-divider"></div>
                <button class="sned-btn" id="sned-copy" title="Copy to clipboard">${IC.copy}<span class="sned-tb-label">Copy</span></button>
                <select class="sned-fmt-sel" id="sned-fmt">
                    <option value="png">PNG</option>
                    <option value="jpeg">JPEG</option>
                    <option value="webp">WebP</option>
                </select>
                <button class="sned-btn sned-btn-primary" id="sned-save" title="Save (Ctrl+S)">${IC.download}<span class="sned-tb-label">Save</span></button>
            </div>
        `;
        root.appendChild(topbar);

        // ── Body ──
        const body = document.createElement('div');
        body.id = 'sned-body';
        root.appendChild(body);

        // Left tools
        const tools = document.createElement('div');
        tools.id = 'sned-tools';
        body.appendChild(tools);
        buildToolsPanel(tools);

        // Center canvas area
        const center = document.createElement('div');
        center.id = 'sned-center';
        body.appendChild(center);

        const scrollArea = document.createElement('div');
        scrollArea.id = 'sned-scroll-area';
        center.appendChild(scrollArea);

        const wrap = document.createElement('div');
        wrap.id = 'sned-canvas-wrap';
        scrollArea.appendChild(wrap);
        state.ed.wrap = wrap;

        const W = origCanvas.width, H = origCanvas.height;
        const dpr = state.dpr;
        const cssW = Math.round(W / dpr), cssH = Math.round(H / dpr);

        const dispCanvas = document.createElement('canvas');
        dispCanvas.id = 'sned-display';
        dispCanvas.width = W; dispCanvas.height = H;
        dispCanvas.style.width = cssW + 'px'; dispCanvas.style.height = cssH + 'px';
        wrap.appendChild(dispCanvas);
        state.ed.displayCanvas = dispCanvas;

        const annotCanvas = document.createElement('canvas');
        annotCanvas.id = 'sned-annot';
        annotCanvas.width = W; annotCanvas.height = H;
        annotCanvas.style.width = cssW + 'px'; annotCanvas.style.height = cssH + 'px';
        wrap.appendChild(annotCanvas);
        state.ed.annotCanvas = annotCanvas;

        wrap.style.width = cssW + 'px';
        wrap.style.height = cssH + 'px';

        // Zoom bar — lives outside scroll area (fixed at bottom of center)
        const zoomBar = document.createElement('div');
        zoomBar.id = 'sned-zoom-bar';
        zoomBar.innerHTML = `
            <button class="sned-btn sned-icon-btn" id="sned-zoom-out" title="Zoom out">${IC.zoomOut}</button>
            <span id="sned-zoom-label">100%</span>
            <button class="sned-btn sned-icon-btn" id="sned-zoom-in" title="Zoom in">${IC.zoomIn}</button>
            <div class="sned-zoom-sep"></div>
            <button class="sned-btn" id="sned-zoom-fit" title="Fit to window" style="font-size:11px;padding:0 10px;width:auto">Fit</button>
        `;
        center.appendChild(zoomBar);

        // Right panel
        const panel = document.createElement('div');
        panel.id = 'sned-panel';
        body.appendChild(panel);

        const accordion = document.createElement('div');
        accordion.id = 'sned-accordion';
        accordion.className = 'sned-accordion';
        panel.appendChild(accordion);

        const items = [
            { id: 'annotate',  label: 'Annotate',  icon: IC.pen },
            { id: 'adjust',    label: 'Adjust',    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m0 2v6m-6-6V4m0 8a2 2 0 100 4m0-4a2 2 0 110 4m0 2v2m12-8V4m0 4a2 2 0 100 4m0-4a2 2 0 110 4m0 6v2"/></svg>` },
            { id: 'filters',   label: 'Filters',   icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 21l-.813-5.096L3.096 15 8 14.187 8.813 9.096 9.813 14.19 14.904 15zM19.006 5.006L18.5 8l-.506-2.994L15.006 4.5l2.988-.506L18.5 1l.506 2.994 2.994.506zM18.006 17.006l-.5 3-.506-2.994-2.994-.506 2.994-.506.506-2.994.506 2.994 2.994.506z"/></svg>` },
            { id: 'transform', label: 'Transform', icon: IC.crop },
            { id: 'curves',    label: 'Curves',    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 19c4-2 6-12 12-14s4 12 9 14"/></svg>` }
        ];

        const chevronIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>`;

        items.forEach(item => {
            const accItem = document.createElement('div');
            accItem.className = 'sned-accordion-item' + (item.id === 'annotate' ? ' active' : '');
            accItem.id = `sned-acc-item-${item.id}`;

            const header = document.createElement('button');
            header.className = 'sned-accordion-header';
            header.innerHTML = `
                <span class="sned-accordion-title-wrap">
                    <span class="sned-accordion-icon">${item.icon}</span>
                    <span class="sned-accordion-label">${item.label}</span>
                </span>
                <span class="sned-accordion-chevron">${chevronIcon}</span>
            `;
            accItem.appendChild(header);

            const content = document.createElement('div');
            content.className = 'sned-accordion-content';

            const contentInner = document.createElement('div');
            contentInner.className = 'sned-accordion-content-inner';
            contentInner.id = `sned-panel-body-${item.id}`;
            content.appendChild(contentInner);
            accItem.appendChild(content);

            accordion.appendChild(accItem);

            header.onclick = () => {
                const isActive = accItem.classList.contains('active');
                if (isActive) return;

                const activeItem = accordion.querySelector('.sned-accordion-item.active');
                if (activeItem) {
                    activeItem.classList.remove('active');
                }

                accItem.classList.add('active');
                state.ed.panelMode = item.id;
                state.ed.panelBody = contentInner;

                if (item.id === 'curves') {
                    setTimeout(renderCurveCanvas, 0);
                }
            };
        });

        // Build all panels initially
        items.forEach(item => {
            state.ed.panelBody = accordion.querySelector(`#sned-panel-body-${item.id}`);
            switch (item.id) {
                case 'annotate':  buildAnnotatePanel(); break;
                case 'adjust':    buildAdjustPanel(); break;
                case 'filters':   buildFiltersPanel(); break;
                case 'transform': buildTransformPanel(); break;
                case 'curves':    buildCurvesPanel(); break;
            }
        });

        // Set the active panelBody to annotate initially
        state.ed.panelBody = accordion.querySelector('#sned-panel-body-annotate');

        bindEditorEvents();

        document.addEventListener('keydown', edOnKey);

        // Wire top bar buttons
        document.getElementById('sned-close').onclick = () => cleanup();
        document.getElementById('sned-undo').onclick = edUndo;
        document.getElementById('sned-redo').onclick = edRedo;
        document.getElementById('sned-copy').onclick = edCopy;
        document.getElementById('sned-save').onclick = edDownload;
        document.getElementById('sned-fmt').value = state.ed.exportFormat;
        document.getElementById('sned-fmt').onchange = e => { state.ed.exportFormat = e.target.value; };
        const sidebarToggle = document.getElementById('sned-toggle-sidebar');
        sidebarToggle.classList.add('active');
        sidebarToggle.onclick = () => {
            root.classList.toggle('sidebar-collapsed');
            const isOpen = !root.classList.contains('sidebar-collapsed');
            sidebarToggle.classList.toggle('active', isOpen);
            setTimeout(fitZoom, 150);
        };
        document.getElementById('sned-zoom-in').onclick = () => setZoom(state.ed.zoom * 1.25);
        document.getElementById('sned-zoom-out').onclick = () => setZoom(state.ed.zoom / 1.25);
        document.getElementById('sned-zoom-fit').onclick = fitZoom;

        setTimeout(fitZoom, 50);
    }

    function buildToolsPanel(container) {
        container.innerHTML = '';

        const groups = [
            {
                id: 'draw',
                tools: [
                    {id:'pen',   label:'Pen'},
                    {id:'highlight', label:'Highlight'},
                    {id:'eraser',label:'Eraser'}
                ]
            },
            {
                id: 'shapes',
                tools: [
                    {id:'line',  label:'Line'},
                    {id:'arrow', label:'Arrow'},
                    {id:'rect',  label:'Rectangle'},
                    {id:'circle',label:'Circle'},
                    {id:'text',  label:'Text'}
                ]
            },
            {
                id: 'utils',
                tools: [
                    {id:'blur',  label:'Blur/Redact'},
                    {id:'number',label:'Step Number'},
                    {id:'move',  label:'Move Object'}
                ]
            }
        ];

        groups.forEach((g, idx) => {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'sned-tool-group';
            g.tools.forEach(t => {
                const btn = document.createElement('button');
                btn.className = 'sned-tool-btn' + (t.id === state.ed.tool ? ' active' : '');
                btn.dataset.tool = t.id;
                btn.title = t.label;
                btn.innerHTML = IC[t.id];
                btn.onclick = () => {
                    container.querySelectorAll('.sned-tool-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    state.ed.tool = t.id;
                };
                groupDiv.appendChild(btn);
            });
            container.appendChild(groupDiv);

            if (idx < groups.length - 1) {
                const sep = document.createElement('div');
                sep.className = 'sned-tool-sep';
                container.appendChild(sep);
            }
        });

        // Divider before colors
        const sepColor = document.createElement('div');
        sepColor.className = 'sned-tool-sep';
        container.appendChild(sepColor);

        // Color swatches section
        const colorContainer = document.createElement('div');
        colorContainer.className = 'sned-color-container';

        const colorGrid = document.createElement('div');
        colorGrid.className = 'sned-color-grid';
        colorContainer.appendChild(colorGrid);

        COLORS.forEach(c => {
            const sw = document.createElement('div');
            sw.className = 'sned-color-swatch' + (c === state.ed.color ? ' active' : '');
            sw.style.background = c;
            sw.title = c;
            sw.onclick = () => {
                container.querySelectorAll('.sned-color-swatch').forEach(x => x.classList.remove('active'));
                sw.classList.add('active');
                state.ed.color = c;
                cp.value = c;
            };
            colorGrid.appendChild(sw);
        });

        const cp = document.createElement('input');
        cp.type = 'color'; cp.className = 'sned-color-picker'; cp.value = state.ed.color;
        cp.oninput = e => {
            state.ed.color = e.target.value;
            container.querySelectorAll('.sned-color-swatch').forEach(x => x.classList.remove('active'));
        };
        colorContainer.appendChild(cp);
        container.appendChild(colorContainer);
    }

    // ─── Editor Rendering ─────────────────────────────────────────────────────────

    function renderEditorDisplay() {
        const ed = state.ed;
        const c = ed.displayCanvas;
        if (!c) return;
        const ctx = c.getContext('2d');

        if (ed.adjuster && typeof SnappyAdjust !== 'undefined') {
            const imgData = ed.adjuster.process(ed.adjParams);
            if (imgData) {
                const withCurves = SnappyAdjust.applyCurveToImageData(
                    imgData,
                    ed.curves.master,
                    ed.curves.r,
                    ed.curves.g,
                    ed.curves.b
                );
                ctx.putImageData(withCurves, 0, 0);
            }
        } else if (ed.origCanvas) {
            ctx.drawImage(ed.origCanvas, 0, 0);
        }
        renderEditorAnnot();
    }

    function renderEditorAnnot() {
        const ed = state.ed;
        const c = ed.annotCanvas;
        if (!c) return;
        const ctx = c.getContext('2d');
        const dpr = state.dpr;
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.save();
        ctx.scale(dpr, dpr);
        ed.objects.forEach(obj => drawEditorObject(ctx, obj));
        if (ed.currentShape) drawEditorObject(ctx, ed.currentShape);
        ctx.restore();
    }

    function drawEditorObject(ctx, obj) {
        ctx.save();
        ctx.strokeStyle = obj.color;
        ctx.fillStyle = obj.color;
        ctx.lineWidth = obj.lineWidth || 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = obj.opacity !== undefined ? obj.opacity : 1;

        if (obj.type === 'pen') {
            if (obj.points.length < 2) { ctx.restore(); return; }
            ctx.beginPath();
            ctx.moveTo(obj.points[0].x, obj.points[0].y);
            for (let i = 1; i < obj.points.length; i++) ctx.lineTo(obj.points[i].x, obj.points[i].y);
            ctx.stroke();
        } else if (obj.type === 'highlight') {
            ctx.globalAlpha = 0.38;
            ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
        } else if (obj.type === 'blur') {
            ctx.beginPath(); ctx.rect(obj.x, obj.y, obj.w, obj.h); ctx.clip();
            ctx.filter = `blur(${obj.radius || 12}px)`;
            const d = state.dpr, pad = 20;
            const sx = Math.max(0,(obj.x-pad)*d), sy = Math.max(0,(obj.y-pad)*d);
            const sw = Math.min(state.ed.displayCanvas.width,(obj.w+pad*2)*d);
            const sh = Math.min(state.ed.displayCanvas.height,(obj.h+pad*2)*d);
            ctx.drawImage(state.ed.displayCanvas, sx, sy, sw, sh, obj.x-pad, obj.y-pad, obj.w+pad*2, obj.h+pad*2);
        } else if (obj.type === 'line') {
            ctx.beginPath(); ctx.moveTo(obj.x, obj.y); ctx.lineTo(obj.x+obj.w, obj.y+obj.h); ctx.stroke();
        } else if (obj.type === 'arrow') {
            drawArrowUtil(ctx, obj.x, obj.y, obj.x+obj.w, obj.y+obj.h);
        } else if (obj.type === 'rect') {
            if (obj.fill) ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
            else ctx.strokeRect(obj.x, obj.y, obj.w, obj.h);
        } else if (obj.type === 'circle') {
            const r = Math.sqrt(obj.w*obj.w + obj.h*obj.h);
            ctx.beginPath(); ctx.arc(obj.x, obj.y, r, 0, 2*Math.PI);
            if (obj.fill) ctx.fill(); else ctx.stroke();
        } else if (obj.type === 'text') {
            ctx.font = `bold ${obj.fontSize||18}px Inter, sans-serif`;
            ctx.textBaseline = 'top';
            ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 3;
            ctx.fillText(obj.text, obj.x, obj.y);
        } else if (obj.type === 'number') {
            ctx.beginPath(); ctx.arc(obj.x, obj.y, 13, 0, 2*Math.PI); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px Inter, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(String(obj.n), obj.x, obj.y);
            ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        }
        ctx.restore();
    }

    function drawArrowUtil(ctx, x1, y1, x2, y2) {
        const head = 14, dx = x2-x1, dy = y2-y1, angle = Math.atan2(dy, dx);
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x2,y2);
        ctx.lineTo(x2-head*Math.cos(angle-Math.PI/6), y2-head*Math.sin(angle-Math.PI/6));
        ctx.lineTo(x2-head*Math.cos(angle+Math.PI/6), y2-head*Math.sin(angle+Math.PI/6));
        ctx.closePath(); ctx.fill();
    }

    // ─── Editor Events ────────────────────────────────────────────────────────────

    function bindEditorEvents() {
        const ac = state.ed.annotCanvas;
        ac.addEventListener('mousedown', edOnDown);
        ac.addEventListener('mousemove', edOnMove);
        ac.addEventListener('mouseup', edOnUp);
        ac.addEventListener('wheel', edOnWheel, {passive: false});
        ac.addEventListener('contextmenu', e => e.preventDefault());

        // Text input
        const inp = document.createElement('div');
        inp.id = 'sned-text-input';
        inp.contentEditable = true;
        inp.style.display = 'none';
        state.ed.root.appendChild(inp);
        state.ed.textInput = inp;
    }

    function canvasCoords(e) {
        const ac = state.ed.annotCanvas;
        const rect = ac.getBoundingClientRect();
        const dpr = state.dpr;
        return {
            x: (e.clientX - rect.left) * dpr * (ac.width / (rect.width * dpr)),
            y: (e.clientY - rect.top) * dpr * (ac.height / (rect.height * dpr))
        };
    }

    function cssCoords(e) {
        const ac = state.ed.annotCanvas;
        const rect = ac.getBoundingClientRect();
        const origCssW = ac.width / state.dpr;
        const origCssH = ac.height / state.dpr;
        return {
            x: (e.clientX - rect.left) * origCssW / rect.width,
            y: (e.clientY - rect.top) * origCssH / rect.height
        };
    }

    function edOnDown(e) {
        if (e.button !== 0) return;
        const ed = state.ed;
        const pos = cssCoords(e);
        ed.isDragging = true;
        ed.dragStart = pos;

        if (ed.tool === 'move') {
            ed.activeObj = null;
            for (let i = ed.objects.length - 1; i >= 0; i--) {
                const o = ed.objects[i];
                if (edHitTest(o, pos.x, pos.y)) { ed.activeObj = o; ed.dragStart = {x: pos.x - (o.x||0), y: pos.y - (o.y||0)}; break; }
            }
            return;
        }

        if (['rect','circle','arrow','line','highlight','blur'].includes(ed.tool)) {
            ed.currentShape = {type: ed.tool, x: pos.x, y: pos.y, w: 0, h: 0, color: ed.color, lineWidth: ed.lineWidth, opacity: ed.tool==='highlight'?0.38:ed.opacity, fill: ed.fill, radius: 12};
        } else if (ed.tool === 'pen') {
            ed.currentShape = {type: 'pen', points: [{x:pos.x,y:pos.y}], color: ed.color, lineWidth: ed.lineWidth};
        } else if (ed.tool === 'eraser') {
            edEraseAt(pos.x, pos.y);
        }
    }

    function edOnMove(e) {
        if (!state.ed.isDragging) return;
        const ed = state.ed;
        const pos = cssCoords(e);

        if (ed.tool === 'move' && ed.activeObj) {
            const o = ed.activeObj;
            if (o.type === 'pen') {
                const dx = pos.x - ed.dragStart.x, dy = pos.y - ed.dragStart.y;
                o.points = o.points.map(p => ({x:p.x+dx, y:p.y+dy}));
                ed.dragStart = pos;
            } else { o.x = pos.x - ed.dragStart.x; o.y = pos.y - ed.dragStart.y; }
            renderEditorAnnot(); return;
        }

        if (ed.tool === 'eraser') { edEraseAt(pos.x, pos.y); return; }

        if (ed.currentShape) {
            if (ed.tool === 'pen') { ed.currentShape.points.push(pos); }
            else { ed.currentShape.w = pos.x - ed.currentShape.x; ed.currentShape.h = pos.y - ed.currentShape.y; }
            renderEditorAnnot();
        }
    }

    function edOnUp(e) {
        const ed = state.ed;
        if (!ed.isDragging) return;
        ed.isDragging = false;
        const pos = cssCoords(e);

        if (ed.tool === 'text') { edSpawnText(pos.x, pos.y); return; }
        if (ed.tool === 'number') {
            ed.objects.push({type:'number',x:pos.x,y:pos.y,n:ed.stepCounter++,color:ed.color,lineWidth:ed.lineWidth});
            ed.redo = []; renderEditorAnnot(); return;
        }
        if (ed.currentShape) {
            const s = ed.currentShape;
            if ((ed.tool==='pen' && s.points.length>1) || (ed.tool!=='pen' && (Math.abs(s.w)>2||Math.abs(s.h)>2))) {
                ed.objects.push(s); ed.redo = [];
            }
            ed.currentShape = null; renderEditorAnnot();
        }
    }

    function edOnWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom(state.ed.zoom * delta);
    }

    function edHitTest(obj, x, y) {
        const pad = 10;
        const bx = obj.x||0, by = obj.y||0;
        const bw = Math.abs(obj.w||50), bh = Math.abs(obj.h||20);
        return x>=bx-pad && x<=bx+bw+pad && y>=by-pad && y<=by+bh+pad;
    }

    function edEraseAt(x, y) {
        const pad = 16;
        const before = state.ed.objects.length;
        state.ed.objects = state.ed.objects.filter(o => {
            if (o.type==='pen') return !o.points.some(p => Math.hypot(p.x-x,p.y-y)<pad);
            return !edHitTest(o,x,y);
        });
        if (state.ed.objects.length !== before) renderEditorAnnot();
    }

    function edUndo() {
        const ed = state.ed;
        if (ed.objects.length > 0) { ed.redo.push(ed.objects.pop()); renderEditorAnnot(); }
    }

    function edRedo() {
        const ed = state.ed;
        if (ed.redo.length > 0) { ed.objects.push(ed.redo.pop()); renderEditorAnnot(); }
    }

    function edSpawnText(x, y) {
        const ed = state.ed;
        const inp = ed.textInput;
        inp.innerText = '';
        const fontSize = ed.lineWidth * 4 + 10;

        const ac = ed.annotCanvas;
        const rect = ac.getBoundingClientRect();
        const zoom = rect.width / (ac.width / state.dpr);

        Object.assign(inp.style, {
            display: 'block',
            left: (rect.left + x * zoom) + 'px',
            top: (rect.top + y * zoom) + 'px',
            color: ed.color,
            fontSize: (fontSize * zoom) + 'px'
        });
        inp.focus();
        const commit = () => {
            if (inp.innerText.trim()) {
                ed.objects.push({type:'text',text:inp.innerText,x,y,color:ed.color,fontSize,lineWidth:ed.lineWidth});
                ed.redo = [];
                renderEditorAnnot();
            }
            inp.style.display = 'none';
        };
        inp.onblur = commit;
        inp.onkeydown = e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); inp.blur(); } };
    }

    function edOnKey(e) {
        if (e.key === 'Escape') cleanup();
        if ((e.ctrlKey||e.metaKey) && e.key==='z') { e.preventDefault(); edUndo(); }
        if ((e.ctrlKey||e.metaKey) && (e.key==='y'||(e.shiftKey&&e.key==='z'))) { e.preventDefault(); edRedo(); }
        if ((e.ctrlKey||e.metaKey) && e.key==='c') edCopy();
        if ((e.ctrlKey||e.metaKey) && e.key==='s') { e.preventDefault(); edDownload(); }
    }

    // ─── Zoom/Pan ─────────────────────────────────────────────────────────────────

    function setZoom(z) {
        const ed = state.ed;
        ed.zoom = Math.max(0.1, Math.min(8, z));
        const cssW = ed.displayCanvas.width / state.dpr;
        const cssH = ed.displayCanvas.height / state.dpr;
        // Keep canvas at original CSS size; scale via wrapper to avoid blurry browser resizing
        [ed.displayCanvas, ed.annotCanvas].forEach(c => {
            c.style.width = cssW + 'px';
            c.style.height = cssH + 'px';
        });
        const wrap = ed.wrap;
        wrap.style.width = cssW + 'px';
        wrap.style.height = cssH + 'px';
        wrap.style.transform = `scale(${ed.zoom})`;
        wrap.style.transformOrigin = 'top left';
        // Inflate scroll container so the scaled wrap is scrollable
        const scrollArea = document.getElementById('sned-scroll-area');
        if (scrollArea) {
            const margin = 60;
            scrollArea.style.minWidth  = Math.round(cssW * ed.zoom + margin) + 'px';
            scrollArea.style.minHeight = Math.round(cssH * ed.zoom + margin) + 'px';
        }
        const label = document.getElementById('sned-zoom-label');
        if (label) label.textContent = Math.round(ed.zoom * 100) + '%';
    }

    function fitZoom() {
        const center = document.getElementById('sned-center');
        if (!center || !state.ed.displayCanvas) return;
        const pad = 60;
        const cw = center.clientWidth - pad, ch = center.clientHeight - pad;
        const iw = state.ed.displayCanvas.width / state.dpr;
        const ih = state.ed.displayCanvas.height / state.dpr;
        setZoom(Math.min(cw / iw, ch / ih, 2));
    }

    // ─── Panels ───────────────────────────────────────────────────────────────────

    function buildAnnotatePanel() {
        const pb = state.ed.panelBody;
        pb.innerHTML = '';

        const section = (title) => {
            const g = document.createElement('div'); g.className = 'sned-section';
            const h = document.createElement('div'); h.className = 'sned-section-title'; h.textContent = title;
            g.appendChild(h); pb.appendChild(g); return g;
        };

        const g1 = section('Stroke');

        // Line width
        const row1 = mkAdjRow('Size', state.ed.lineWidth, 1, 20, 1, v => { state.ed.lineWidth = v; });
        g1.appendChild(row1);

        // Opacity
        const row2 = mkAdjRow('Opacity', Math.round(state.ed.opacity*100), 10, 100, 1, v => { state.ed.opacity = v/100; });
        g1.appendChild(row2);

        // Fill toggle
        const fillRow = document.createElement('div');
        fillRow.className = 'sned-adj-row';
        fillRow.innerHTML = `<span class="sned-adj-label">Fill</span>`;
        const fillToggle = document.createElement('div');
        fillToggle.className = 'sned-toggle' + (state.ed.fill ? ' on' : '');
        fillToggle.onclick = () => { state.ed.fill = !state.ed.fill; fillToggle.classList.toggle('on', state.ed.fill); };
        fillRow.appendChild(fillToggle);
        g1.appendChild(fillRow);
    }

    function buildAdjustPanel() {
        const pb = state.ed.panelBody;
        pb.innerHTML = '';

        const ed = state.ed;
        const p = ed.adjParams;

        const groups = [
            { title: 'Light', sliders: [
                {key:'exposure',    label:'Exposure',    min:-3,  max:3,    step:0.1},
                {key:'contrast',    label:'Contrast',    min:-100,max:100,  step:1},
                {key:'highlights',  label:'Highlights',  min:-100,max:100,  step:1},
                {key:'shadows',     label:'Shadows',     min:-100,max:100,  step:1},
                {key:'whites',      label:'Whites',      min:-100,max:100,  step:1},
                {key:'blacks',      label:'Blacks',      min:-100,max:100,  step:1},
            ]},
            { title: 'Color', sliders: [
                {key:'temperature', label:'Temp',        min:-100,max:100,  step:1},
                {key:'tint',        label:'Tint',        min:-100,max:100,  step:1},
                {key:'vibrance',    label:'Vibrance',    min:-100,max:100,  step:1},
                {key:'saturation',  label:'Saturation',  min:-100,max:100,  step:1},
                {key:'hue',         label:'Hue',         min:-180,max:180,  step:1},
            ]},
            { title: 'Detail', sliders: [
                {key:'clarity',     label:'Clarity',     min:-100,max:100,  step:1},
                {key:'sharpness',   label:'Sharpness',   min:0,   max:100,  step:1},
            ]},
            { title: 'Effects', sliders: [
                {key:'vignette',    label:'Vignette',    min:-100,max:100,  step:1},
                {key:'grain',       label:'Grain',       min:0,   max:100,  step:1},
                {key:'fade',        label:'Fade',        min:0,   max:100,  step:1},
            ]},
        ];

        groups.forEach(g => {
            const sec = document.createElement('div'); sec.className = 'sned-section';
            const h = document.createElement('div'); h.className = 'sned-section-title'; h.textContent = g.title;
            sec.appendChild(h);
            g.sliders.forEach(({key, label, min, max, step}) => {
                const val = p[key] !== undefined ? p[key] : 0;
                const row = mkAdjRow(label, val, min, max, step, v => {
                    ed.adjParams[key] = parseFloat(v);
                    scheduleAdjUpdate();
                }, true);
                sec.appendChild(row);
            });
            pb.appendChild(sec);
        });

        // Reset button
        const resetBtn = document.createElement('button');
        resetBtn.className = 'sned-wide-btn';
        resetBtn.textContent = 'Reset All';
        resetBtn.onclick = () => {
            ed.adjParams = ed.adjuster ? ed.adjuster.getDefaults() : {};
            buildAdjustPanel();
            scheduleAdjUpdate();
        };
        pb.appendChild(resetBtn);
    }

    function scheduleAdjUpdate() {
        const ed = state.ed;
        clearTimeout(ed.adjTimer);
        ed.adjTimer = setTimeout(() => renderEditorDisplay(), 50);
    }

    function buildFiltersPanel() {
        const pb = state.ed.panelBody;
        pb.innerHTML = '';

        const ed = state.ed;
        const presets = SnappyAdjust ? SnappyAdjust.PRESETS : {};

        const h = document.createElement('div'); h.className = 'sned-section-title'; h.textContent = 'Presets'; pb.appendChild(h);

        // Natural / None first
        const grid = document.createElement('div'); grid.className = 'sned-preset-grid'; pb.appendChild(grid);

        const noneBtn = mkPresetThumb('Original', null, ed.activePreset === null);
        noneBtn.onclick = () => {
            ed.activePreset = null;
            ed.adjParams = ed.adjuster ? ed.adjuster.getDefaults() : {};
            grid.querySelectorAll('.sned-preset-card').forEach(c => c.classList.remove('active'));
            noneBtn.classList.add('active');
            renderEditorDisplay();
        };
        grid.appendChild(noneBtn);

        Object.entries(presets).forEach(([name, params]) => {
            const card = mkPresetThumb(name, params, ed.activePreset === name);
            card.onclick = () => {
                ed.activePreset = name;
                const defaults = ed.adjuster ? ed.adjuster.getDefaults() : {};
                ed.adjParams = Object.assign({}, defaults, params);
                grid.querySelectorAll('.sned-preset-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                renderEditorDisplay();
            };
            grid.appendChild(card);
        });
    }

    function mkPresetThumb(name, params, active) {
        const card = document.createElement('div');
        card.className = 'sned-preset-card' + (active ? ' active' : '');

        // Generate preview thumbnail
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 60; thumbCanvas.height = 60;
        const ed = state.ed;

        if (ed.adjuster && ed.displayCanvas) {
            // Sample a 60x60 patch from center
            const dw = ed.displayCanvas.width, dh = ed.displayCanvas.height;
            const sx = Math.round((dw-60)/2), sy = Math.round((dh-60)/2);
            const small = document.createElement('canvas'); small.width=60; small.height=60;
            small.getContext('2d').drawImage(ed.displayCanvas, Math.max(0,sx), Math.max(0,sy), Math.min(60,dw), Math.min(60,dh), 0, 0, 60, 60);

            if (params) {
                const smallAdj = new SnappyAdjust();
                const sdata = small.getContext('2d').getImageData(0,0,60,60);
                smallAdj.load(sdata);
                const defaults = ed.adjuster.getDefaults();
                const pAdj = Object.assign({}, defaults, params);
                const result = smallAdj.process(pAdj);
                if (result) small.getContext('2d').putImageData(result, 0, 0);
            }
            thumbCanvas.getContext('2d').drawImage(small, 0, 0);
        }

        card.appendChild(thumbCanvas);
        const lbl = document.createElement('div'); lbl.className = 'sned-preset-label'; lbl.textContent = name;
        card.appendChild(lbl);
        return card;
    }

    function buildTransformPanel() {
        const pb = state.ed.panelBody;
        pb.innerHTML = '';
        const ed = state.ed;

        const sec = (t) => {
            const s = document.createElement('div'); s.className = 'sned-section';
            const h = document.createElement('div'); h.className = 'sned-section-title'; h.textContent = t;
            s.appendChild(h); pb.appendChild(s); return s;
        };

        // Rotate
        const rotSec = sec('Rotate');
        const rotRow = mkAdjRow('Angle', ed.rotateAngle, -45, 45, 1, v => {
            ed.rotateAngle = parseFloat(v);
            applyTransformCSS();
        });
        rotSec.appendChild(rotRow);

        // Flip
        const flipSec = sec('Flip');
        const flipRow = document.createElement('div'); flipRow.className = 'sned-adj-row'; flipRow.style.gap = '8px';
        const flipHBtn = document.createElement('button'); flipHBtn.className = 'sned-wide-btn'; flipHBtn.style.flex='1'; flipHBtn.innerHTML = `${IC.flipH} H`;
        const flipVBtn = document.createElement('button'); flipVBtn.className = 'sned-wide-btn'; flipVBtn.style.flex='1'; flipVBtn.innerHTML = `${IC.flipV} V`;
        flipHBtn.onclick = () => { ed.flipH = !ed.flipH; applyTransformCSS(); };
        flipVBtn.onclick = () => { ed.flipV = !ed.flipV; applyTransformCSS(); };
        flipRow.appendChild(flipHBtn); flipRow.appendChild(flipVBtn);
        flipSec.appendChild(flipRow);

        // Crop aspect ratio
        const cropSec = sec('Crop Ratio');
        const ratios = [['Free',null],['1:1',1],['4:3',4/3],['3:2',3/2],['16:9',16/9],['2:1',2/1],['9:16',9/16]];
        const ratioGrid = document.createElement('div'); ratioGrid.className = 'sned-ratio-grid';
        ratios.forEach(([label, val]) => {
            const btn = document.createElement('button');
            btn.className = 'sned-ratio-btn' + (ed.cropAspect===val?' active':'');
            btn.textContent = label;
            btn.onclick = () => {
                ratioGrid.querySelectorAll('.sned-ratio-btn').forEach(b=>b.classList.remove('active'));
                btn.classList.add('active');
                ed.cropAspect = val;
            };
            ratioGrid.appendChild(btn);
        });
        cropSec.appendChild(ratioGrid);

        // Resize
        const resSec = sec('Resize');
        const w = ed.displayCanvas ? Math.round(ed.displayCanvas.width) : ed.targetW;
        const h = ed.displayCanvas ? Math.round(ed.displayCanvas.height) : ed.targetH;
        ed.targetW = w; ed.targetH = h;

        const resRow = document.createElement('div'); resRow.className = 'sned-adj-row'; resRow.style.flexWrap='wrap'; resRow.style.gap='6px';
        resRow.innerHTML = `
            <label class="sned-adj-label" style="width:100%">Width × Height (px)</label>
            <input class="sned-num-input" id="sned-rw" type="number" value="${w}" min="1" style="flex:1">
            <span style="color:#666;align-self:center">×</span>
            <input class="sned-num-input" id="sned-rh" type="number" value="${h}" min="1" style="flex:1">
        `;
        resSec.appendChild(resRow);

        let lockRatio = true;
        const lockRow = document.createElement('div'); lockRow.className = 'sned-adj-row';
        lockRow.innerHTML = `<span class="sned-adj-label">Lock ratio</span>`;
        const lockToggle = document.createElement('div'); lockToggle.className='sned-toggle on';
        lockToggle.onclick = () => { lockRatio = !lockRatio; lockToggle.classList.toggle('on', lockRatio); };
        lockRow.appendChild(lockToggle);
        resSec.appendChild(lockRow);

        setTimeout(() => {
            const rwEl = document.getElementById('sned-rw'), rhEl = document.getElementById('sned-rh');
            if (!rwEl || !rhEl) return;
            rwEl.oninput = () => {
                const nw = parseInt(rwEl.value)||1;
                ed.targetW = nw;
                if (lockRatio) { const nh = Math.round(nw * h / w); ed.targetH = nh; rhEl.value = nh; }
            };
            rhEl.oninput = () => {
                const nh = parseInt(rhEl.value)||1;
                ed.targetH = nh;
                if (lockRatio) { const nw = Math.round(nh * w / h); ed.targetW = nw; rwEl.value = nw; }
            };
        }, 0);

        const applyResBtn = document.createElement('button'); applyResBtn.className='sned-wide-btn'; applyResBtn.textContent='Apply Resize';
        applyResBtn.onclick = () => {
            showEditorToast('Resize applied to export');
        };
        resSec.appendChild(applyResBtn);
    }

    function applyTransformCSS() {
        const ed = state.ed;
        const parts = [];
        if (ed.rotateAngle) parts.push(`rotate(${ed.rotateAngle}deg)`);
        if (ed.flipH) parts.push('scaleX(-1)');
        if (ed.flipV) parts.push('scaleY(-1)');
        const t = parts.join(' ');
        [ed.displayCanvas, ed.annotCanvas].forEach(c => { if(c) c.style.transform = t; });
    }

    function buildCurvesPanel() {
        const pb = state.ed.panelBody;
        pb.innerHTML = '';

        const ed = state.ed;

        const h = document.createElement('div'); h.className = 'sned-section-title'; h.textContent = 'Tone Curves'; pb.appendChild(h);

        // Channel selector
        const chRow = document.createElement('div'); chRow.className = 'sned-channel-row'; pb.appendChild(chRow);
        ['master','r','g','b'].forEach(ch => {
            const btn = document.createElement('button');
            btn.className = 'sned-ch-btn' + (ed.curveChannel===ch?' active':'');
            btn.dataset.ch = ch;
            btn.textContent = ch==='master'?'M':ch.toUpperCase();
            btn.style.color = ch==='r'?'#ef4444':ch==='g'?'#22c55e':ch==='b'?'#3b82f6':'#e5e5e5';
            btn.onclick = () => {
                ed.curveChannel = ch;
                chRow.querySelectorAll('.sned-ch-btn').forEach(b=>b.classList.remove('active'));
                btn.classList.add('active');
                renderCurveCanvas();
            };
            chRow.appendChild(btn);
        });

        // Curve canvas
        const curveWrap = document.createElement('div'); curveWrap.className='sned-curve-wrap'; pb.appendChild(curveWrap);
        const cc = document.createElement('canvas'); cc.id = 'sned-curve-canvas'; cc.width=220; cc.height=220;
        curveWrap.appendChild(cc);
        state.ed.curveCanvas = cc;

        // Reset curve button
        const resetBtn = document.createElement('button'); resetBtn.className='sned-wide-btn'; resetBtn.textContent='Reset Channel';
        resetBtn.onclick = () => {
            ed.curves[ed.curveChannel] = [[0,0],[255,255]];
            renderCurveCanvas();
            scheduleAdjUpdate();
        };
        pb.appendChild(resetBtn);

        const resetAllBtn = document.createElement('button'); resetAllBtn.className='sned-wide-btn'; resetAllBtn.style.marginTop='4px'; resetAllBtn.textContent='Reset All Curves';
        resetAllBtn.onclick = () => {
            ['master','r','g','b'].forEach(ch => { ed.curves[ch] = [[0,0],[255,255]]; });
            renderCurveCanvas();
            scheduleAdjUpdate();
        };
        pb.appendChild(resetAllBtn);

        renderCurveCanvas();
        bindCurveEvents(cc);
    }

    function renderCurveCanvas() {
        const ed = state.ed;
        const cc = ed.curveCanvas;
        if (!cc) return;
        const ctx = cc.getContext('2d');
        const S = 220;
        ctx.clearRect(0,0,S,S);

        // Background
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0,0,S,S);

        // Grid
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
            const x = i*S/4, y = i*S/4;
            ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,S); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(S,y); ctx.stroke();
        }

        // Identity diagonal
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0,S); ctx.lineTo(S,0); ctx.stroke();

        const ch = ed.curveChannel;
        const pts = ed.curves[ch];
        const color = ch==='r'?'#ef4444':ch==='g'?'#22c55e':ch==='b'?'#3b82f6':'#3b82f6';

        if (pts.length < 2) return;

        // Draw curve using LUT
        const lut = buildCurveLUTLocal(pts);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = 0; x < 256; x++) {
            const cx = x/255*S, cy = (1-lut[x]/255)*S;
            if (x===0) ctx.moveTo(cx,cy); else ctx.lineTo(cx,cy);
        }
        ctx.stroke();

        // Control points
        pts.forEach(([px,py], i) => {
            const cx = px/255*S, cy = (1-py/255)*S;
            ctx.fillStyle = i===ed.curveDragIdx ? '#fff' : color;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(cx,cy,5,0,2*Math.PI);
            ctx.fill(); ctx.stroke();
        });
    }

    function buildCurveLUTLocal(pts) {
        if (typeof SnappyAdjust !== 'undefined') {
            return SnappyAdjust.applyCurveToImageData ? buildLUTFallback(pts) : buildLUTFallback(pts);
        }
        return buildLUTFallback(pts);
    }

    function buildLUTFallback(pts) {
        const sorted = pts.slice().sort((a,b)=>a[0]-b[0]);
        const lut = new Uint8Array(256);
        for (let x=0;x<256;x++) {
            let lo=0, hi=sorted.length-1;
            if (x <= sorted[0][0]) { lut[x] = Math.max(0,Math.min(255,sorted[0][1])); continue; }
            if (x >= sorted[hi][0]) { lut[x] = Math.max(0,Math.min(255,sorted[hi][1])); continue; }
            for (let i=0;i<sorted.length-1;i++) { if (sorted[i][0]<=x && sorted[i+1][0]>=x){lo=i;hi=i+1;break;} }
            const t = (x-sorted[lo][0])/(sorted[hi][0]-sorted[lo][0]);
            lut[x] = Math.max(0,Math.min(255,Math.round(sorted[lo][1]*(1-t)+sorted[hi][1]*t)));
        }
        return lut;
    }

    function bindCurveEvents(cc) {
        const S = 220;
        const ed = state.ed;

        function ptAt(e) {
            const rect = cc.getBoundingClientRect();
            const x = Math.round((e.clientX - rect.left) / rect.width * 255);
            const y = Math.round((1 - (e.clientY - rect.top) / rect.height) * 255);
            return [Math.max(0,Math.min(255,x)), Math.max(0,Math.min(255,y))];
        }

        function nearestPt(e) {
            const [mx,my] = ptAt(e);
            const pts = ed.curves[ed.curveChannel];
            let best = -1, bestD = 15;
            pts.forEach(([px,py], i) => {
                const d = Math.hypot(px-mx, py-my);
                if (d < bestD) { bestD=d; best=i; }
            });
            return best;
        }

        cc.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            const idx = nearestPt(e);
            if (idx >= 0) {
                ed.curveDragIdx = idx;
            } else {
                const newPt = ptAt(e);
                const pts = ed.curves[ed.curveChannel];
                pts.push(newPt);
                pts.sort((a,b)=>a[0]-b[0]);
                ed.curveDragIdx = pts.findIndex(p=>p[0]===newPt[0]&&p[1]===newPt[1]);
            }
            renderCurveCanvas();
            e.stopPropagation();
        });

        cc.addEventListener('mousemove', e => {
            if (ed.curveDragIdx < 0) return;
            const pts = ed.curves[ed.curveChannel];
            const [nx,ny] = ptAt(e);
            pts[ed.curveDragIdx] = [nx,ny];
            pts.sort((a,b)=>a[0]-b[0]);
            renderCurveCanvas();
            scheduleAdjUpdate();
        });

        cc.addEventListener('mouseup', () => { ed.curveDragIdx = -1; renderCurveCanvas(); });

        cc.addEventListener('contextmenu', e => {
            e.preventDefault();
            const idx = nearestPt(e);
            if (idx >= 0) {
                const pts = ed.curves[ed.curveChannel];
                if (pts.length > 2) { pts.splice(idx,1); renderCurveCanvas(); scheduleAdjUpdate(); }
            }
        });
    }

    // ─── Helper: adj row ──────────────────────────────────────────────────────────

    function mkAdjRow(label, value, min, max, step, onChange, centered) {
        const row = document.createElement('div'); row.className = 'sned-adj-row';
        const lbl = document.createElement('span'); lbl.className = 'sned-adj-label'; lbl.textContent = label;
        const slider = document.createElement('input'); slider.type='range'; slider.min=min; slider.max=max; slider.step=step; slider.value=value; slider.className='sned-adj-slider';
        const valEl = document.createElement('span'); valEl.className='sned-adj-value'; valEl.textContent = value;

        const updatePct = (v) => {
            const pct = (v - min) / (max - min) * 100;
            slider.style.setProperty('--pct', pct + '%');
        };

        updatePct(value);

        slider.oninput = e => {
            const v = parseFloat(e.target.value);
            valEl.textContent = Number.isInteger(step) ? v : v.toFixed(1);
            updatePct(v);
            onChange(v);
        };
        row.appendChild(lbl); row.appendChild(slider); row.appendChild(valEl);
        return row;
    }

    // ─── Editor Export ────────────────────────────────────────────────────────────

    function buildFinalEditorCanvas() {
        const ed = state.ed;
        const dpr = state.dpr;

        const srcW = ed.displayCanvas.width, srcH = ed.displayCanvas.height;
        const targetW = ed.targetW || srcW;
        const targetH = ed.targetH || srcH;

        const angle = ed.rotateAngle * Math.PI / 180;
        const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
        const rotW = Math.round(srcW * cos + srcH * sin);
        const rotH = Math.round(srcW * sin + srcH * cos);

        const out = document.createElement('canvas');
        out.width = rotW; out.height = rotH;
        const ctx = out.getContext('2d');
        ctx.translate(rotW/2, rotH/2);
        ctx.rotate(angle);
        if (ed.flipH) ctx.scale(-1,1);
        if (ed.flipV) ctx.scale(1,-1);
        ctx.translate(-srcW/2, -srcH/2);

        // Draw adjusted display
        ctx.drawImage(ed.displayCanvas, 0, 0);

        // Draw annotations (from annot canvas, same coords)
        ctx.drawImage(ed.annotCanvas, 0, 0);

        if (targetW !== rotW || targetH !== rotH) {
            const resized = document.createElement('canvas');
            resized.width = targetW; resized.height = targetH;
            resized.getContext('2d').drawImage(out, 0, 0, targetW, targetH);
            return resized;
        }
        return out;
    }

    function edDownload() {
        const ed = state.ed;
        const cvs = buildFinalEditorCanvas();
        const fmt = ed.exportFormat;
        const mime = fmt==='jpeg'?'image/jpeg':fmt==='webp'?'image/webp':'image/png';
        const q = fmt==='jpeg'||fmt==='webp' ? ed.jpegQuality : undefined;
        const url = cvs.toDataURL(mime, q);

        const thumbW = Math.min(300, cvs.width);
        const thumbH = Math.round(cvs.height * thumbW / cvs.width);
        const tc = document.createElement('canvas'); tc.width=thumbW; tc.height=thumbH;
        tc.getContext('2d').drawImage(cvs, 0, 0, thumbW, thumbH);
        const thumbnail = tc.toDataURL('image/jpeg', 0.5);

        chrome.runtime.sendMessage({
            action: 'downloadImage',
            dataUrl: url,
            filename: `snappy-${Date.now()}.${fmt==='jpeg'?'jpg':fmt}`,
            thumbnail,
            pageUrl: location.href
        });
        cleanup();
    }

    async function edCopy() {
        try {
            const cvs = buildFinalEditorCanvas();
            cvs.toBlob(async blob => {
                try {
                    await navigator.clipboard.write([new ClipboardItem({'image/png': blob})]);
                    showEditorToast('Copied to clipboard!');
                } catch {
                    showEditorToast('Copy failed', true);
                }
            }, 'image/png');
        } catch { showEditorToast('Copy failed', true); }
    }

    function showEditorToast(msg, isError) {
        let t = document.getElementById('sned-toast');
        if (!t) {
            t = document.createElement('div'); t.id = 'sned-toast';
            if (state.ed.root) state.ed.root.appendChild(t);
            else document.body.appendChild(t);
        }
        t.textContent = msg;
        t.className = 'sned-toast' + (isError?' error':'');
        t.classList.add('show');
        clearTimeout(t._tm);
        t._tm = setTimeout(() => t.classList.remove('show'), 2200);
    }

    // ─── Element Picker ───────────────────────────────────────────────────────────

    function startElementPicker() {
        const hl = document.createElement('div');
        hl.id = 'snappy-elem-hl';
        document.body.appendChild(hl);
        state.elemHighlight = hl;
        let target = null;

        const onMove = (e) => {
            const el = document.elementFromPoint(e.clientX, e.clientY);
            if (!el || el===hl) return;
            target = el;
            const r = el.getBoundingClientRect();
            Object.assign(hl.style, {left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
        };
        const onClick = (e) => {
            e.preventDefault(); e.stopPropagation();
            document.removeEventListener('mousemove', onMove, true);
            hl.remove(); state.elemHighlight = null;
            const el = document.elementFromPoint(e.clientX, e.clientY);
            const r = (el||target).getBoundingClientRect();
            chrome.runtime.sendMessage({ action:'elementCaptured', rect:{x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)} });
        };
        document.addEventListener('mousemove', onMove, true);
        document.addEventListener('click', onClick, {capture:true, once:true});
    }

    // ─── Timer ────────────────────────────────────────────────────────────────────

    function startTimer(delay) {
        const overlay = document.createElement('div');
        overlay.id = 'snappy-countdown';
        document.body.appendChild(overlay);
        let count = delay || 3;
        overlay.textContent = count;
        const tick = setInterval(() => {
            count--;
            if (count > 0) overlay.textContent = count;
            else { clearInterval(tick); overlay.remove(); chrome.runtime.sendMessage({action:'captureNow'}); }
        }, 1000);
    }

    // ─── Full Page Stitch ─────────────────────────────────────────────────────────

    async function stitchImages(captures, totalH, viewH, dpr) {
        captures.sort((a,b)=>a.y-b.y);
        const load = src => new Promise(res => { const i=new Image(); i.onload=()=>res(i); i.src=src; });
        const images = [];
        for (const c of captures) images.push(await load(c.dataUrl));
        if (!images.length) return;

        const canvas = document.createElement('canvas');
        canvas.width = images[0].width; canvas.height = totalH*dpr*1.5;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(images[0], 0, 0);
        let currentY = images[0].height;

        for (let i=1;i<images.length;i++) {
            const curr = images[i];
            const w = canvas.width;
            const searchH = Math.min(images[i-1].height, 800*dpr);
            const prevData = ctx.getImageData(0, currentY-searchH, w, searchH);
            const tmpC = document.createElement('canvas'); tmpC.width=curr.width; tmpC.height=curr.height;
            const tmpCtx = tmpC.getContext('2d'); tmpCtx.drawImage(curr,0,0);
            const currData = tmpCtx.getImageData(0,0,w,searchH);
            let foundOverlap = 0;
            for (let y=0;y<searchH-10;y++) {
                if (compareRows(prevData,y,currData,0,w,4)){foundOverlap=searchH-y;break;}
            }
            if (foundOverlap>0) {
                const cropH = curr.height-foundOverlap;
                ctx.drawImage(curr,0,foundOverlap,curr.width,cropH,0,currentY,curr.width,cropH);
                currentY+=cropH;
            } else {
                ctx.drawImage(curr,0,currentY); currentY+=curr.height;
            }
        }
        const finalC = document.createElement('canvas'); finalC.width=canvas.width; finalC.height=currentY;
        finalC.getContext('2d').drawImage(canvas,0,0);
        const url = finalC.toDataURL('image/png');
        chrome.runtime.sendMessage({action:'downloadImage',dataUrl:url,filename:`snappy-full-${Date.now()}.png`});
    }

    function compareRows(d1,y1,d2,y2,w,stride) {
        const off1=y1*w*4, off2=y2*w*4, limit=w*4, start=Math.floor(limit*0.1), end=Math.floor(limit*0.9);
        for (let i=start;i<end;i+=4*stride) {
            if (Math.abs(d1.data[off1+i]-d2.data[off2+i])>5) return false;
            if (Math.abs(d1.data[off1+i+1]-d2.data[off2+i+1])>5) return false;
            if (Math.abs(d1.data[off1+i+2]-d2.data[off2+i+2])>5) return false;
        }
        return true;
    }

    // ─── Messages ─────────────────────────────────────────────────────────────────

    chrome.runtime.onMessage.addListener((m, _s, r) => {
        if (m.action==='startCrop'||m.action==='startRegion') init(m.screenshot);
        if (m.action==='startCropElement') init(m.screenshot, m.rect);
        if (m.action==='startTimer') startTimer(m.delay);
        if (m.action==='startElementPicker') startElementPicker();

        if (m.action==='getPageMetrics') {
            r({ totalHeight:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight), viewportHeight:window.innerHeight, devicePixelRatio:window.devicePixelRatio||1 });
            return true;
        }
        if (m.action==='prepareFullPage') {
            let style = document.getElementById('snappy-scroll-style');
            if (!style) { style=document.createElement('style'); style.id='snappy-scroll-style'; document.head.appendChild(style); }
            style.textContent=`html::-webkit-scrollbar,body::-webkit-scrollbar{display:none!important}html,body{scrollbar-width:none!important;overflow:visible!important}`;
            setTimeout(()=>r({success:true}),100); return true;
        }
        if (m.action==='scrollNext') {
            const startY = window.scrollY;
            document.documentElement.style.overflow='visible'; document.body.style.overflow='visible';
            window.scrollBy({top:window.innerHeight,behavior:'smooth'});
            setTimeout(()=>{
                const endY=window.scrollY, moved=Math.abs(endY-startY)>1;
                if(moved){document.documentElement.style.overflow='hidden';document.body.style.overflow='hidden';}
                r({moved,y:endY});
            }, 800);
            return true;
        }
        if (m.action==='stitchAndDownload') {
            const style=document.getElementById('snappy-scroll-style');
            if(style)style.remove();
            document.documentElement.style.overflow=''; document.body.style.overflow='';
            stitchImages(m.captures,m.totalHeight,m.viewportHeight,m.devicePixelRatio);
        }
    });

})();
