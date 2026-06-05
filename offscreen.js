/**
 * Snappy Pro — Offscreen Recording Document (MV3)
 * Handles MediaRecorder for WebM tab capture and canvas-based GIF recording.
 * gif-encoder.js must be loaded before this script.
 */

// ---------------------------------------------------------------------------
// WebM recording state
// ---------------------------------------------------------------------------
let recorder = null;
let chunks   = [];

// ---------------------------------------------------------------------------
// GIF recording state
// ---------------------------------------------------------------------------
let gifStream      = null;
let gifVideoEl     = null;
let gifCanvas      = null;
let gifCtx         = null;
let gifInterval    = null;
let gifFrames      = [];      // Stores quantized Uint8Array indices per frame
let gifWidth       = 0;
let gifHeight      = 0;
let gifLut         = null;    // Built after first 10 raw frames collected
let gifRawFrames   = [];      // Temporary raw ImageData until LUT is ready
let gifLutReady    = false;
const GIF_FPS      = 8;       // Frames per second
const GIF_INTERVAL = Math.round(1000 / GIF_FPS); // ~125 ms
const GIF_MAX_FRAMES = 120;

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg.target !== 'offscreen') return;

    // --- WebM recording ---
    if (msg.action === 'startRecording') {
        startRecording(msg.streamId)
            .then(() => respond({ success: true }))
            .catch(e => respond({ success: false, error: e.message }));
        return true;
    }

    if (msg.action === 'stopRecording') {
        stopRecording()
            .then(() => respond({ success: true }))
            .catch(e => respond({ success: false, error: e.message }));
        return true;
    }

    // --- GIF recording ---
    if (msg.action === 'startGIFRecording') {
        startGIFRecording(msg.streamId)
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

// ---------------------------------------------------------------------------
// WebM recording
// ---------------------------------------------------------------------------
async function startRecording(streamId) {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            mandatory: {
                chromeMediaSource:   'tab',
                chromeMediaSourceId: streamId,
                maxWidth:            1920,
                maxHeight:           1080
            }
        },
        audio: {
            mandatory: {
                chromeMediaSource:   'tab',
                chromeMediaSourceId: streamId
            }
        }
    });

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';

    chunks   = [];
    recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.start(500);
}

function stopRecording() {
    return new Promise((resolve, reject) => {
        if (!recorder) { reject(new Error('No active recording')); return; }

        recorder.onstop = () => {
            const blob     = new Blob(chunks, { type: 'video/webm' });
            const url      = URL.createObjectURL(blob);
            const filename = `snappy-rec-${Date.now()}.webm`;

            if (chrome.downloads) {
                chrome.downloads.download({ url, filename, saveAs: false }, () => {
                    setTimeout(() => URL.revokeObjectURL(url), 30000);
                    resolve();
                });
            } else {
                const a = document.createElement('a');
                a.href     = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    resolve();
                }, 2000);
            }
        };

        recorder.stop();
        recorder.stream.getTracks().forEach(t => t.stop());
        recorder = null;
    });
}

// ---------------------------------------------------------------------------
// GIF recording
// ---------------------------------------------------------------------------

/**
 * Start capturing a tab stream and sampling frames for GIF encoding.
 *
 * @param {string} streamId — chrome tab capture stream ID
 */
async function startGIFRecording(streamId) {
    // Reset all GIF state
    gifFrames    = [];
    gifRawFrames = [];
    gifLut       = null;
    gifLutReady  = false;

    // Acquire tab capture stream (video only — GIF has no audio)
    gifStream = await navigator.mediaDevices.getUserMedia({
        video: {
            mandatory: {
                chromeMediaSource:   'tab',
                chromeMediaSourceId: streamId
            }
        },
        audio: false
    });

    // Create off-screen video element to receive the stream
    gifVideoEl    = document.createElement('video');
    gifVideoEl.srcObject = gifStream;
    gifVideoEl.muted     = true;
    gifVideoEl.autoplay  = true;

    // Wait for video metadata so we know native dimensions
    await new Promise((resolve, reject) => {
        gifVideoEl.onloadedmetadata = resolve;
        gifVideoEl.onerror          = reject;
    });

    // Scale to max 640px wide, preserving aspect ratio, ensuring even dims
    const nativeW  = gifVideoEl.videoWidth  || 640;
    const nativeH  = gifVideoEl.videoHeight || 480;
    const scale    = nativeW > 640 ? 640 / nativeW : 1;
    gifWidth       = Math.floor(nativeW * scale / 2) * 2;  // ensure even
    gifHeight      = Math.floor(nativeH * scale / 2) * 2;  // ensure even

    // Prepare canvas for frame sampling
    gifCanvas      = document.createElement('canvas');
    gifCanvas.width  = gifWidth;
    gifCanvas.height = gifHeight;
    gifCtx         = gifCanvas.getContext('2d', { willReadFrequently: true });

    // Start frame capture interval
    gifInterval = setInterval(() => {
        _captureGIFFrame();
    }, GIF_INTERVAL);
}

/**
 * Internal: capture a single video frame into the GIF buffer.
 * Builds LUT after first 10 raw frames, then quantizes from that point on.
 * Auto-stops at GIF_MAX_FRAMES.
 */
function _captureGIFFrame() {
    if (!gifVideoEl || gifVideoEl.readyState < 2) return; // HAVE_CURRENT_DATA

    gifCtx.drawImage(gifVideoEl, 0, 0, gifWidth, gifHeight);
    const imageData = gifCtx.getImageData(0, 0, gifWidth, gifHeight);

    if (!gifLutReady) {
        // Accumulate raw frames until we have enough to build a good palette
        gifRawFrames.push(imageData);

        if (gifRawFrames.length >= 10) {
            // Build palette + LUT from first 10 frames
            const palette = buildPalette(gifRawFrames);
            gifLut        = buildLUT(palette);
            gifLutReady   = true;

            // Quantize all accumulated raw frames
            for (const rawFrame of gifRawFrames) {
                gifFrames.push(quantizeFrame(rawFrame, gifLut));
            }
            gifRawFrames = []; // free memory
        }
    } else {
        // LUT ready — quantize immediately
        gifFrames.push(quantizeFrame(imageData, gifLut));
    }

    // Auto-stop at cap
    if ((gifFrames.length + gifRawFrames.length) >= GIF_MAX_FRAMES) {
        stopGIFRecording().catch(console.error);
    }
}

/**
 * Stop GIF capture, encode all frames, and trigger download.
 *
 * @returns {Promise<void>}
 */
function stopGIFRecording() {
    return new Promise((resolve, reject) => {
        // Stop the capture interval
        if (gifInterval) {
            clearInterval(gifInterval);
            gifInterval = null;
        }

        // Stop stream tracks
        if (gifStream) {
            gifStream.getTracks().forEach(t => t.stop());
            gifStream = null;
        }

        // Flush any remaining raw frames if LUT was not yet built
        if (!gifLutReady && gifRawFrames.length > 0) {
            const palette = buildPalette(gifRawFrames);
            gifLut        = buildLUT(palette);
            gifLutReady   = true;
            for (const rawFrame of gifRawFrames) {
                gifFrames.push(quantizeFrame(rawFrame, gifLut));
            }
            gifRawFrames = [];
        }

        if (gifFrames.length === 0) {
            reject(new Error('No GIF frames captured'));
            return;
        }

        // encodeGIF expects ImageData-like objects, but we stored indices.
        // We need to reconstruct ImageData-compatible wrappers that encodeGIF
        // can pass through quantizeFrame — however since we already quantized,
        // we pass a lightweight shim and override the encode path.
        // Instead, we call the encoder with a custom approach:
        // encodeGIF accepts ImageData[], so we need to build a palette-only path.
        // Since we already have indices[], we bypass encodeGIF and call the
        // internal helpers directly.
        try {
            const gifBytes = _encodeGIFFromIndices(
                gifFrames, gifWidth, gifHeight, GIF_INTERVAL
            );

            const blob     = new Blob([gifBytes], { type: 'image/gif' });
            const url      = URL.createObjectURL(blob);
            const filename = `snappy-gif-${Date.now()}.gif`;

            if (chrome.downloads) {
                chrome.downloads.download({ url, filename, saveAs: false }, () => {
                    setTimeout(() => URL.revokeObjectURL(url), 30000);
                    resolve();
                });
            } else {
                // Fallback: anchor click
                const a = document.createElement('a');
                a.href     = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    resolve();
                }, 2000);
            }
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Internal: encode pre-quantized index arrays into GIF89a bytes.
 * This mirrors encodeGIF() but accepts Uint8Array[] of indices rather than
 * ImageData[], so we skip re-quantization.
 *
 * @param {Uint8Array[]} frameIndices — palette index per pixel, per frame
 * @param {number}       width
 * @param {number}       height
 * @param {number}       delayMs
 * @returns {Uint8Array}
 */
function _encodeGIFFromIndices(frameIndices, width, height, delayMs) {
    // We still need the palette. Re-derive it from gifLut by inverting: for
    // each of the 256 palette slots, find its representative color.
    // Simpler: just call buildPalette on a dummy set — but we don't have
    // ImageData anymore. Instead, we'll re-use the global gifLut to infer
    // the palette by scanning all keys.
    //
    // Best approach: store palette alongside LUT. We rebuild it cheaply
    // by sampling the LUT inverse.
    const palette = _paletteFromLUT(gifLut);

    const ba         = new ByteArray();
    const minCodeSize = 8;
    const delayCS    = Math.max(1, Math.round(delayMs / 10));

    // GIF89a header
    ba.writeString('GIF89a');

    // Logical Screen Descriptor
    ba.writeShort(width);
    ba.writeShort(height);
    ba.writeByte(0xF7);   // GCT present, 256 colors
    ba.writeByte(0);      // Background color index
    ba.writeByte(0);      // Pixel aspect ratio

    // Global Color Table
    for (let i = 0; i < 256; i++) {
        ba.writeByte(palette[i][0]);
        ba.writeByte(palette[i][1]);
        ba.writeByte(palette[i][2]);
    }

    // Netscape loop extension (infinite)
    ba.writeByte(0x21);
    ba.writeByte(0xFF);
    ba.writeByte(11);
    ba.writeString('NETSCAPE');
    ba.writeString('2.0');
    ba.writeByte(3);
    ba.writeByte(1);
    ba.writeShort(0);   // loop count 0 = infinite
    ba.writeByte(0);

    // Per-frame data
    for (let fi = 0; fi < frameIndices.length; fi++) {
        const indices = frameIndices[fi];

        // Graphic Control Extension
        ba.writeByte(0x21);
        ba.writeByte(0xF9);
        ba.writeByte(4);
        ba.writeByte(0x00);
        ba.writeShort(delayCS);
        ba.writeByte(0);
        ba.writeByte(0);

        // Image Descriptor
        ba.writeByte(0x2C);
        ba.writeShort(0);
        ba.writeShort(0);
        ba.writeShort(width);
        ba.writeShort(height);
        ba.writeByte(0x00);

        // LZW minimum code size
        ba.writeByte(minCodeSize);

        // Compressed data in 255-byte sub-blocks
        const compressed = lzwCompress(indices, minCodeSize);
        let offset = 0;
        while (offset < compressed.length) {
            const chunkSize = Math.min(255, compressed.length - offset);
            ba.writeByte(chunkSize);
            for (let j = 0; j < chunkSize; j++) {
                ba.writeByte(compressed[offset + j]);
            }
            offset += chunkSize;
        }
        ba.writeByte(0); // block terminator
    }

    // GIF trailer
    ba.writeByte(0x3B);

    return ba.toUint8Array();
}

/**
 * Reconstruct a 256-entry palette from the LUT by mapping each palette index
 * back to a representative 5-bit RGB color, then scaling to 8-bit.
 *
 * @param {Uint8Array} lut — 32768-entry LUT from buildLUT()
 * @returns {number[][]}  256 [r,g,b] entries
 */
function _paletteFromLUT(lut) {
    // For each palette index, find the first LUT key that maps to it.
    const palette = new Array(256).fill(null);

    for (let key = 0; key < 32768; key++) {
        const idx = lut[key];
        if (palette[idx] === null) {
            const r5 = (key >> 10) & 0x1F;
            const g5 = (key >>  5) & 0x1F;
            const b5 =  key        & 0x1F;
            palette[idx] = [
                (r5 << 3) | (r5 >> 2),
                (g5 << 3) | (g5 >> 2),
                (b5 << 3) | (b5 >> 2)
            ];
        }
    }

    // Fill any unassigned indices (shouldn't happen for a well-built LUT)
    for (let i = 0; i < 256; i++) {
        if (palette[i] === null) palette[i] = [0, 0, 0];
    }

    return palette;
}
