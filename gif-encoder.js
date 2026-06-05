/**
 * gif-encoder.js — Self-contained GIF89a animated encoder
 * No dependencies. Designed for Chrome extension MV3 offscreen documents.
 *
 * Public API:
 *   buildPalette(frames)           → [[r,g,b], ...] (256 entries)
 *   buildLUT(palette)              → Uint8Array[32768]
 *   quantizeFrame(frame, lut)      → Uint8Array of palette indices
 *   lzwCompress(indices, minSize)  → number[] of bytes
 *   encodeGIF(frames, w, h, delay) → Uint8Array
 */

// ---------------------------------------------------------------------------
// ByteArray helper
// ---------------------------------------------------------------------------
class ByteArray {
    constructor() {
        this._buf = [];
    }

    writeByte(b) {
        this._buf.push(b & 0xFF);
    }

    /** Little-endian 16-bit unsigned short */
    writeShort(v) {
        this._buf.push(v & 0xFF, (v >> 8) & 0xFF);
    }

    writeString(s) {
        for (let i = 0; i < s.length; i++) {
            this._buf.push(s.charCodeAt(i) & 0xFF);
        }
    }

    writeBytes(arr) {
        for (let i = 0; i < arr.length; i++) {
            this._buf.push(arr[i] & 0xFF);
        }
    }

    toUint8Array() {
        return new Uint8Array(this._buf);
    }
}

// ---------------------------------------------------------------------------
// buildPalette
// ---------------------------------------------------------------------------
/**
 * Sample up to the first 5 frames, count quantized colors at 5 bits/channel
 * (32 levels per channel), and return the top 256 as [[r,g,b], ...].
 * The array is always padded to exactly 256 entries.
 *
 * @param {ImageData[]} frames
 * @returns {number[][]} palette — 256 [r, g, b] triples
 */
function buildPalette(frames) {
    // Count occurrences of each 15-bit quantized color
    const counts = new Uint32Array(32768); // 32^3
    const sampleCount = Math.min(5, frames.length);

    for (let fi = 0; fi < sampleCount; fi++) {
        const data = frames[fi].data;
        const len = data.length;
        for (let i = 0; i < len; i += 4) {
            const r = data[i]     >> 3;
            const g = data[i + 1] >> 3;
            const b = data[i + 2] >> 3;
            const key = (r << 10) | (g << 5) | b;
            counts[key]++;
        }
    }

    // Collect all non-zero entries and sort by frequency descending
    const entries = [];
    for (let key = 0; key < 32768; key++) {
        if (counts[key] > 0) {
            entries.push({ key, count: counts[key] });
        }
    }
    entries.sort((a, b) => b.count - a.count);

    // Build palette: take top 255 colors (index 0 reserved for transparency/
    // background in some cases, but GIF doesn't require it — we use all 256).
    const palette = [];
    const take = Math.min(256, entries.length);
    for (let i = 0; i < take; i++) {
        const key = entries[i].key;
        const r5 = (key >> 10) & 0x1F;
        const g5 = (key >>  5) & 0x1F;
        const b5 =  key        & 0x1F;
        // Scale 5-bit value back to 8-bit: multiply by 255/31 ≈ 8.226
        // Use (v << 3) | (v >> 2) for a lossless round-trip approximation
        palette.push([
            (r5 << 3) | (r5 >> 2),
            (g5 << 3) | (g5 >> 2),
            (b5 << 3) | (b5 >> 2)
        ]);
    }

    // Pad to exactly 256 entries with [0,0,0]
    while (palette.length < 256) {
        palette.push([0, 0, 0]);
    }

    return palette;
}

// ---------------------------------------------------------------------------
// buildLUT
// ---------------------------------------------------------------------------
/**
 * Build a Uint8Array[32768] lookup table mapping every possible 15-bit
 * quantized color key to the nearest palette index.
 *
 * Key encoding: (r>>3 << 10) | (g>>3 << 5) | (b>>3)
 *
 * @param {number[][]} palette  — 256 [r,g,b] entries
 * @returns {Uint8Array}
 */
function buildLUT(palette) {
    const lut = new Uint8Array(32768);

    for (let key = 0; key < 32768; key++) {
        // Decode 5-bit channels from key
        const r = ((key >> 10) & 0x1F) << 3;
        const g = ((key >>  5) & 0x1F) << 3;
        const b = ( key        & 0x1F) << 3;

        let bestIdx = 0;
        let bestDist = Infinity;

        for (let pi = 0; pi < palette.length; pi++) {
            const pr = palette[pi][0];
            const pg = palette[pi][1];
            const pb = palette[pi][2];
            const dr = r - pr;
            const dg = g - pg;
            const db = b - pb;
            // Weighted euclidean — human eye is most sensitive to green
            const dist = dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;
            if (dist < bestDist) {
                bestDist = dist;
                bestIdx = pi;
                if (dist === 0) break;
            }
        }

        lut[key] = bestIdx;
    }

    return lut;
}

// ---------------------------------------------------------------------------
// quantizeFrame
// ---------------------------------------------------------------------------
/**
 * Convert an ImageData frame into a Uint8Array of palette indices using the
 * pre-built LUT.
 *
 * @param {ImageData} frame
 * @param {Uint8Array} lut  — result of buildLUT()
 * @returns {Uint8Array}
 */
function quantizeFrame(frame, lut) {
    const data = frame.data;
    const pixelCount = frame.width * frame.height;
    const indices = new Uint8Array(pixelCount);

    for (let i = 0; i < pixelCount; i++) {
        const base = i * 4;
        const r = data[base]     >> 3;
        const g = data[base + 1] >> 3;
        const b = data[base + 2] >> 3;
        indices[i] = lut[(r << 10) | (g << 5) | b];
    }

    return indices;
}

// ---------------------------------------------------------------------------
// lzwCompress
// ---------------------------------------------------------------------------
/**
 * GIF LZW compression.
 *
 * - Uses Map-based code table.
 * - Resets at 4096 codes (12-bit maximum).
 * - Handles CLEAR (code = 2^minCodeSize) and EOI (CLEAR+1).
 * - Packs variable-width codes LSB-first into a byte stream.
 *
 * @param {Uint8Array|number[]} indices   — palette index per pixel
 * @param {number}              minCodeSize — typically Math.max(2, colorDepth)
 * @returns {number[]}  raw LZW-compressed bytes (before sub-block framing)
 */
function lzwCompress(indices, minCodeSize) {
    const clearCode = 1 << minCodeSize;     // e.g. 256 for 8-bit palette
    const eoiCode   = clearCode + 1;
    const initTableSize = clearCode + 2;    // clearCode + EOI

    // Output bit packer
    const output = [];
    let bitBuffer = 0;
    let bitCount  = 0;

    function emitCode(code, width) {
        bitBuffer |= code << bitCount;
        bitCount  += width;
        while (bitCount >= 8) {
            output.push(bitBuffer & 0xFF);
            bitBuffer >>= 8;
            bitCount  -= 8;
        }
    }

    function flushBits() {
        if (bitCount > 0) {
            output.push(bitBuffer & 0xFF);
            bitBuffer = 0;
            bitCount  = 0;
        }
    }

    // Initialize code table
    function initTable() {
        const table = new Map();
        // Single-symbol codes 0..clearCode-1 map to themselves
        for (let i = 0; i < clearCode; i++) {
            table.set(String.fromCharCode(i), i);
        }
        return table;
    }

    let codeTable  = initTable();
    let nextCode   = initTableSize;
    let codeWidth  = minCodeSize + 1;

    // Emit initial CLEAR code
    emitCode(clearCode, codeWidth);

    if (indices.length === 0) {
        emitCode(eoiCode, codeWidth);
        flushBits();
        return output;
    }

    let indexBuffer = String.fromCharCode(indices[0]);

    for (let i = 1; i < indices.length; i++) {
        const k = String.fromCharCode(indices[i]);
        const combined = indexBuffer + k;

        if (codeTable.has(combined)) {
            indexBuffer = combined;
        } else {
            // Emit code for indexBuffer
            emitCode(codeTable.get(indexBuffer), codeWidth);

            if (nextCode <= 4095) {
                // Add combined to table
                codeTable.set(combined, nextCode++);

                // After adding a code, check if codeWidth needs to increase.
                // We increase width when nextCode exceeds 2^codeWidth.
                if (nextCode > (1 << codeWidth) && codeWidth < 12) {
                    codeWidth++;
                }
            } else {
                // Table full — emit CLEAR and reset
                emitCode(clearCode, codeWidth);
                codeTable = initTable();
                nextCode  = initTableSize;
                codeWidth = minCodeSize + 1;
            }

            indexBuffer = k;
        }
    }

    // Emit code for remaining indexBuffer
    emitCode(codeTable.get(indexBuffer), codeWidth);

    // Emit EOI
    emitCode(eoiCode, codeWidth);
    flushBits();

    return output;
}

// ---------------------------------------------------------------------------
// encodeGIF
// ---------------------------------------------------------------------------
/**
 * Encode an array of ImageData frames into a valid GIF89a animated file.
 *
 * Structure:
 *   - GIF89a header (6 bytes)
 *   - Logical Screen Descriptor (7 bytes)
 *   - Global Color Table (256 × 3 bytes = 768 bytes)
 *   - Netscape Application Extension (19 bytes) — infinite loop
 *   - Per frame:
 *       • Graphic Control Extension (8 bytes)
 *       • Image Descriptor (10 bytes)
 *       • LZW Minimum Code Size (1 byte)
 *       • Image sub-blocks (variable, max 255 bytes each)
 *       • Block terminator (1 byte, value 0)
 *   - Trailer (1 byte, value 0x3B)
 *
 * @param {ImageData[]} frames   — array of same-size ImageData objects
 * @param {number}      width    — frame width in pixels
 * @param {number}      height   — frame height in pixels
 * @param {number}      delayMs  — inter-frame delay in milliseconds
 * @returns {Uint8Array}
 */
function encodeGIF(frames, width, height, delayMs) {
    const ba = new ByteArray();

    // -----------------------------------------------------------------------
    // 1. Build global palette once from first 5 frames
    // -----------------------------------------------------------------------
    const palette = buildPalette(frames);
    const lut     = buildLUT(palette);

    // -----------------------------------------------------------------------
    // 2. GIF Header
    // -----------------------------------------------------------------------
    ba.writeString('GIF89a');

    // -----------------------------------------------------------------------
    // 3. Logical Screen Descriptor
    //    Packed byte: Global Color Table Flag = 1, Color Resolution = 7 (8-bit),
    //    Sort Flag = 0, Global Color Table Size = 7 (2^(7+1) = 256 entries)
    // -----------------------------------------------------------------------
    ba.writeShort(width);          // Logical screen width
    ba.writeShort(height);         // Logical screen height
    ba.writeByte(0xF7);            // Packed: GCT present (1), color res 111, sort 0, GCT size 111 → 256 colors
    ba.writeByte(0);               // Background color index
    ba.writeByte(0);               // Pixel aspect ratio (0 = no info)

    // -----------------------------------------------------------------------
    // 4. Global Color Table (256 × 3 = 768 bytes)
    // -----------------------------------------------------------------------
    for (let i = 0; i < 256; i++) {
        ba.writeByte(palette[i][0]);
        ba.writeByte(palette[i][1]);
        ba.writeByte(palette[i][2]);
    }

    // -----------------------------------------------------------------------
    // 5. Netscape 2.0 Application Extension (infinite loop)
    //    Extension Introducer:     0x21
    //    Application Extension Label: 0xFF
    //    Block size:               11
    //    Application Identifier:   "NETSCAPE" (8 chars)
    //    Application Auth Code:    "2.0" (3 chars)
    //    Sub-block:                0x03 0x01 <loop count LE 16-bit>
    //    Block terminator:         0x00
    // -----------------------------------------------------------------------
    ba.writeByte(0x21);  // Extension introducer
    ba.writeByte(0xFF);  // Application extension label
    ba.writeByte(11);    // Block size (always 11 for NETSCAPE)
    ba.writeString('NETSCAPE');
    ba.writeString('2.0');
    ba.writeByte(3);     // Sub-block size
    ba.writeByte(1);     // Sub-block ID (loop block)
    ba.writeShort(0);    // Loop count 0 = infinite
    ba.writeByte(0);     // Block terminator

    // -----------------------------------------------------------------------
    // 6. GIF LZW minimum code size for a 256-color palette
    // -----------------------------------------------------------------------
    const minCodeSize = 8; // log2(256) = 8

    // Delay in GIF units (centiseconds, 1 cs = 10 ms)
    const delayCS = Math.max(1, Math.round(delayMs / 10));

    // -----------------------------------------------------------------------
    // 7. Encode each frame
    // -----------------------------------------------------------------------
    for (let fi = 0; fi < frames.length; fi++) {
        const indices = quantizeFrame(frames[fi], lut);

        // --- Graphic Control Extension ---
        // Extension Introducer: 0x21
        // Graphic Control Label: 0xF9
        // Block size: 4
        // Packed: Reserved(3 bits)=0, Disposal Method(3 bits)=0 (no disposal),
        //         User Input Flag=0, Transparent Color Flag=0
        // Delay time: delayCS (centiseconds, little-endian)
        // Transparent Color Index: 0 (unused)
        // Block terminator: 0
        ba.writeByte(0x21);
        ba.writeByte(0xF9);
        ba.writeByte(4);        // Block size
        ba.writeByte(0x00);     // Packed: disposal=0, no user input, no transparency
        ba.writeShort(delayCS); // Delay in centiseconds
        ba.writeByte(0);        // Transparent color index (unused)
        ba.writeByte(0);        // Block terminator

        // --- Image Descriptor ---
        // Image Separator: 0x2C
        // Left, Top: 0, 0
        // Width, Height
        // Packed: Local Color Table Flag=0, Interlace=0, Sort=0,
        //         Reserved=0, Local Color Table Size=0
        ba.writeByte(0x2C);     // Image separator
        ba.writeShort(0);       // Left
        ba.writeShort(0);       // Top
        ba.writeShort(width);
        ba.writeShort(height);
        ba.writeByte(0x00);     // Packed: no local color table, not interlaced

        // --- LZW Minimum Code Size ---
        ba.writeByte(minCodeSize);

        // --- Compressed image data ---
        const compressed = lzwCompress(indices, minCodeSize);

        // Pack into 255-byte sub-blocks
        let offset = 0;
        while (offset < compressed.length) {
            const chunkSize = Math.min(255, compressed.length - offset);
            ba.writeByte(chunkSize); // Sub-block size
            for (let j = 0; j < chunkSize; j++) {
                ba.writeByte(compressed[offset + j]);
            }
            offset += chunkSize;
        }

        // Block terminator
        ba.writeByte(0);
    }

    // -----------------------------------------------------------------------
    // 8. GIF Trailer
    // -----------------------------------------------------------------------
    ba.writeByte(0x3B);

    return ba.toUint8Array();
}
