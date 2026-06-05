/**
 * image-adjust.js — Snappy image processing engine
 * Self-contained, no imports, browser page context (not a module).
 * Exposes global: SnappyAdjust
 */

(function (global) {
  'use strict';

  // ─── Pure helpers ────────────────────────────────────────────────────────────

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function clamp255(v) {
    v = Math.round(v);
    return v < 0 ? 0 : v > 255 ? 255 : v;
  }

  function smoothstep(edge0, edge1, x) {
    var t = (x - edge0) / (edge1 - edge0);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  }

  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  function rgbToHsl(r, g, b) {
    var max = r > g ? (r > b ? r : b) : (g > b ? g : b);
    var min = r < g ? (r < b ? r : b) : (g < b ? g : b);
    var h, s;
    var l = (max + min) * 0.5;
    var d = max - min;
    if (d === 0) {
      h = 0;
      s = 0;
    } else {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) {
        h = (g - b) / d + (g < b ? 6 : 0);
      } else if (max === g) {
        h = (b - r) / d + 2;
      } else {
        h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return [h, s, l];
  }

  function hslToRgb(h, s, l) {
    var r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return [r, g, b];
  }

  // ─── Monotonic cubic spline (Fritsch-Carlson) LUT builder ────────────────────

  function buildCurveLUT(controlPoints) {
    var lut = new Uint8Array(256);

    // Sort and deduplicate control points by x
    var pts = controlPoints.slice().sort(function (a, b) { return a[0] - b[0]; });
    var unique = [];
    for (var i = 0; i < pts.length; i++) {
      if (unique.length === 0 || pts[i][0] !== unique[unique.length - 1][0]) {
        unique.push([pts[i][0], pts[i][1]]);
      }
    }
    pts = unique;

    var n = pts.length;

    // Identity if fewer than 2 points
    if (n < 2) {
      for (var x = 0; x < 256; x++) lut[x] = x;
      return lut;
    }

    // Extract xs and ys
    var xs = new Float64Array(n);
    var ys = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      xs[i] = pts[i][0];
      ys[i] = pts[i][1];
    }

    // Compute secant slopes
    var delta = new Float64Array(n - 1);
    var m = new Float64Array(n);
    for (var i = 0; i < n - 1; i++) {
      delta[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
    }

    // Initialize tangents using secants
    m[0] = delta[0];
    m[n - 1] = delta[n - 2];
    for (var i = 1; i < n - 1; i++) {
      m[i] = (delta[i - 1] + delta[i]) * 0.5;
    }

    // Fritsch-Carlson monotonicity fix
    for (var i = 0; i < n - 1; i++) {
      if (delta[i] === 0) {
        m[i] = 0;
        m[i + 1] = 0;
      } else {
        var alpha = m[i] / delta[i];
        var beta = m[i + 1] / delta[i];
        var h = alpha * alpha + beta * beta;
        if (h > 9) {
          var tau = 3 / Math.sqrt(h);
          m[i] = tau * alpha * delta[i];
          m[i + 1] = tau * beta * delta[i];
        }
      }
    }

    // Hermite interpolation — evaluate at each integer x in [0,255]
    for (var x = 0; x < 256; x++) {
      var y;
      if (x <= xs[0]) {
        // Extrapolate left
        var dx = x - xs[0];
        y = ys[0] + m[0] * dx;
      } else if (x >= xs[n - 1]) {
        // Extrapolate right
        var dx = x - xs[n - 1];
        y = ys[n - 1] + m[n - 1] * dx;
      } else {
        // Find segment via binary search
        var lo = 0;
        var hi = n - 2;
        while (lo < hi) {
          var mid = (lo + hi) >> 1;
          if (xs[mid + 1] < x) lo = mid + 1;
          else hi = mid;
        }
        var seg = lo;
        var h0 = xs[seg + 1] - xs[seg];
        var t = (x - xs[seg]) / h0;
        var t2 = t * t;
        var t3 = t2 * t;
        // Hermite basis
        var h00 = 2 * t3 - 3 * t2 + 1;
        var h10 = t3 - 2 * t2 + t;
        var h01 = -2 * t3 + 3 * t2;
        var h11 = t3 - t2;
        y = h00 * ys[seg] + h10 * h0 * m[seg] + h01 * ys[seg + 1] + h11 * h0 * m[seg + 1];
      }
      lut[x] = y < 0 ? 0 : y > 255 ? 255 : Math.round(y);
    }

    return lut;
  }

  // ─── Static curve application ─────────────────────────────────────────────────

  function applyCurveToImageData(imageData, masterPts, rPts, gPts, bPts) {
    var masterLUT = masterPts && masterPts.length >= 2 ? buildCurveLUT(masterPts) : null;
    var rLUT = rPts && rPts.length >= 2 ? buildCurveLUT(rPts) : null;
    var gLUT = gPts && gPts.length >= 2 ? buildCurveLUT(gPts) : null;
    var bLUT = bPts && bPts.length >= 2 ? buildCurveLUT(bPts) : null;

    var src = imageData.data;
    var w = imageData.width;
    var h = imageData.height;
    var out = new ImageData(w, h);
    var dst = out.data;
    var len = src.length;

    for (var i = 0; i < len; i += 4) {
      var r = src[i];
      var g = src[i + 1];
      var b = src[i + 2];

      if (masterLUT) {
        r = masterLUT[r];
        g = masterLUT[g];
        b = masterLUT[b];
      }
      dst[i]     = rLUT ? rLUT[r] : r;
      dst[i + 1] = gLUT ? gLUT[g] : g;
      dst[i + 2] = bLUT ? bLUT[b] : b;
      dst[i + 3] = src[i + 3];
    }

    return out;
  }

  // ─── SnappyAdjust class ───────────────────────────────────────────────────────

  function SnappyAdjust() {
    this._original = null;
    this._width = 0;
    this._height = 0;
  }

  SnappyAdjust.prototype.load = function (imageData) {
    this._width = imageData.width;
    this._height = imageData.height;
    // Deep copy of pixel data
    this._original = new Uint8ClampedArray(imageData.data);
    return this;
  };

  SnappyAdjust.prototype.getDefaults = function () {
    return {
      exposure:    0,
      contrast:    0,
      highlights:  0,
      shadows:     0,
      whites:      0,
      blacks:      0,
      temperature: 0,
      tint:        0,
      vibrance:    0,
      saturation:  0,
      hue:         0,
      clarity:     0,
      sharpness:   0,
      vignette:    0,
      grain:       0,
      fade:        0
    };
  };

  SnappyAdjust.prototype.reset = function () {
    if (!this._original) return null;
    var out = new ImageData(new Uint8ClampedArray(this._original), this._width, this._height);
    return out;
  };

  SnappyAdjust.prototype.process = function (params) {
    if (!this._original) return null;

    var p = params || {};
    var exposure    = p.exposure    !== undefined ? p.exposure    : 0;
    var contrast    = p.contrast    !== undefined ? p.contrast    : 0;
    var highlights  = p.highlights  !== undefined ? p.highlights  : 0;
    var shadows     = p.shadows     !== undefined ? p.shadows     : 0;
    var whites      = p.whites      !== undefined ? p.whites      : 0;
    var blacks      = p.blacks      !== undefined ? p.blacks      : 0;
    var temperature = p.temperature !== undefined ? p.temperature : 0;
    var tint        = p.tint        !== undefined ? p.tint        : 0;
    var vibrance    = p.vibrance    !== undefined ? p.vibrance    : 0;
    var saturation  = p.saturation  !== undefined ? p.saturation  : 0;
    var hue         = p.hue         !== undefined ? p.hue         : 0;
    var clarity     = p.clarity     !== undefined ? p.clarity     : 0;
    var sharpness   = p.sharpness   !== undefined ? p.sharpness   : 0;
    var vignette    = p.vignette    !== undefined ? p.vignette    : 0;
    var grain       = p.grain       !== undefined ? p.grain       : 0;
    var fade        = p.fade        !== undefined ? p.fade        : 0;

    var w = this._width;
    var h = this._height;
    var src = this._original;
    var dst = new Uint8ClampedArray(src.length);

    // Pre-compute scalar values used in hot loop
    var exposureMul = Math.pow(2, exposure);
    var contrastC = contrast / 100;
    var hlBoost = highlights / 100;
    var shBoost = shadows / 100;
    var wBoost = whites / 100;
    var bCut = blacks / 100;
    var temp = temperature / 100;
    var tnt = tint / 100;
    var sat = saturation / 100;
    var vib = vibrance / 100;
    var hueShift = hue / 360;
    var clarityK = clarity / 100;
    var fadeK = fade / 100;

    var doExposure    = exposure    !== 0;
    var doHighlights  = highlights  !== 0;
    var doShadows     = shadows     !== 0;
    var doWhites      = whites      !== 0;
    var doBlacks      = blacks      !== 0;
    var doContrast    = contrast    !== 0;
    var doTemperature = temperature !== 0;
    var doTint        = tint        !== 0;
    var doHue         = hue         !== 0;
    var doSaturation  = saturation  !== 0;
    var doVibrance    = vibrance    !== 0;
    var doClarity     = clarity     !== 0;
    var doFade        = fade        !== 0;
    var doHSL         = doHue || doSaturation || doVibrance || doClarity;

    var INV255 = 1 / 255;
    var len = src.length;

    // ── Per-pixel loop ──────────────────────────────────────────────────────────
    for (var i = 0; i < len; i += 4) {
      var r = src[i]     * INV255;
      var g = src[i + 1] * INV255;
      var b = src[i + 2] * INV255;

      // a. Exposure
      if (doExposure) {
        r *= exposureMul;
        g *= exposureMul;
        b *= exposureMul;
      }

      // Luminance used for tonal adjustments
      var lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      // b. Highlights
      if (doHighlights) {
        var hlFactor = hlBoost * smoothstep(0.5, 1.0, lum);
        r += hlFactor;
        g += hlFactor;
        b += hlFactor;
      }

      // c. Shadows
      if (doShadows) {
        var shFactor = shBoost * smoothstep(0.5, 0.0, lum);
        r += shFactor;
        g += shFactor;
        b += shFactor;
      }

      // d. Whites
      if (doWhites) {
        var lum4 = lum * lum * lum * lum;
        var wFactor = wBoost * lum4;
        r += wFactor;
        g += wFactor;
        b += wFactor;
      }

      // e. Blacks
      if (doBlacks) {
        var oneMlum = 1 - lum;
        var bFactor = bCut * (oneMlum * oneMlum * oneMlum * oneMlum);
        r -= bFactor;
        g -= bFactor;
        b -= bFactor;
      }

      // f. Contrast — S-curve per channel
      if (doContrast) {
        var cExp = 1 + contrastC;
        r = r < 0.5
          ? 0.5 * Math.pow(2 * r, cExp)
          : 1 - 0.5 * Math.pow(2 * (1 - r), cExp);
        g = g < 0.5
          ? 0.5 * Math.pow(2 * g, cExp)
          : 1 - 0.5 * Math.pow(2 * (1 - g), cExp);
        b = b < 0.5
          ? 0.5 * Math.pow(2 * b, cExp)
          : 1 - 0.5 * Math.pow(2 * (1 - b), cExp);
      }

      // g. Temperature
      if (doTemperature) {
        r += temp * 0.12;
        b -= temp * 0.12;
      }

      // h. Tint
      if (doTint) {
        g += tnt * 0.08;
        r -= tnt * 0.04;
        b -= tnt * 0.04;
      }

      // HSL adjustments
      if (doHSL) {
        // Clamp before HSL conversion to keep values meaningful
        r = r < 0 ? 0 : r > 1 ? 1 : r;
        g = g < 0 ? 0 : g > 1 ? 1 : g;
        b = b < 0 ? 0 : b > 1 ? 1 : b;

        // rgbToHsl inline
        var maxC = r > g ? (r > b ? r : b) : (g > b ? g : b);
        var minC = r < g ? (r < b ? r : b) : (g < b ? g : b);
        var hh, ss, ll;
        ll = (maxC + minC) * 0.5;
        var dC = maxC - minC;
        if (dC === 0) {
          hh = 0;
          ss = 0;
        } else {
          ss = ll > 0.5 ? dC / (2 - maxC - minC) : dC / (maxC + minC);
          if (maxC === r) {
            hh = (g - b) / dC + (g < b ? 6 : 0);
          } else if (maxC === g) {
            hh = (b - r) / dC + 2;
          } else {
            hh = (r - g) / dC + 4;
          }
          hh /= 6;
        }

        // i-j. Hue rotation
        if (doHue) {
          hh = hh + hueShift;
          if (hh < 0) hh += 1;
          if (hh >= 1) hh -= 1;
        }

        // k. Saturation
        if (doSaturation) {
          ss = ss + sat * ss * (1 - ss) * 4;
          ss = ss < 0 ? 0 : ss > 1 ? 1 : ss;
        }

        // l. Vibrance — boosts low-saturation pixels more
        if (doVibrance) {
          var vibFactor = (1 - ss) * (1 - ss) * vib;
          ss += vibFactor * (1 - ss);
          ss = ss < 0 ? 0 : ss > 1 ? 1 : ss;
        }

        // m. Clarity — midtone luminance contrast
        if (doClarity) {
          var twoLm1 = 2 * ll - 1;
          var midTone = 1 - twoLm1 * twoLm1 * twoLm1 * twoLm1;
          ll = ll + clarityK * midTone * (ll - 0.5) * 0.25;
          ll = ll < 0 ? 0 : ll > 1 ? 1 : ll;
        }

        // n. hslToRgb inline
        if (ss === 0) {
          r = g = b = ll;
        } else {
          var qq = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
          var pp = 2 * ll - qq;
          r = hue2rgb(pp, qq, hh + 1 / 3);
          g = hue2rgb(pp, qq, hh);
          b = hue2rgb(pp, qq, hh - 1 / 3);
        }
      }

      // o. Fade — lift blacks, slightly compress highlights
      if (doFade) {
        r += fadeK * (0.12 - r * 0.25);
        g += fadeK * (0.12 - g * 0.25);
        b += fadeK * (0.12 - b * 0.25);
      }

      // p. Clamp and write
      dst[i]     = r < 0 ? 0 : r > 1 ? 255 : Math.round(r * 255);
      dst[i + 1] = g < 0 ? 0 : g > 1 ? 255 : Math.round(g * 255);
      dst[i + 2] = b < 0 ? 0 : b > 1 ? 255 : Math.round(b * 255);
      dst[i + 3] = src[i + 3];
    }

    // ── Post-process convolution passes ─────────────────────────────────────────

    // Sharpness — unsharp mask via 3×3 Laplacian-enhanced kernel
    if (sharpness > 0) {
      var strength = sharpness / 100;
      var sharpened = new Uint8ClampedArray(dst.length);
      // Center weight: 5 + strength*3, surrounding: -1 each (8 neighbours)
      // Normalized: divide by (center - 8) to preserve brightness if > 0
      var center = 5 + strength * 3;
      var surrounding = -1;
      var kernelSum = center + 8 * surrounding; // may be negative — keep as unsharp mask
      // Unsharp mask: out = clamp(orig + (orig - blurred) * amount)
      // We compute Laplacian = orig*center + neighbors*(-1), then blend
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var base = (y * w + x) * 4;

          for (var c = 0; c < 3; c++) {
            // Gather 3x3 neighbourhood (clamp to border)
            var acc = 0;
            for (var ky = -1; ky <= 1; ky++) {
              for (var kx = -1; kx <= 1; kx++) {
                var ny = y + ky;
                var nx = x + kx;
                if (ny < 0) ny = 0;
                else if (ny >= h) ny = h - 1;
                if (nx < 0) nx = 0;
                else if (nx >= w) nx = w - 1;
                var k = ky === 0 && kx === 0 ? center : surrounding;
                acc += dst[(ny * w + nx) * 4 + c] * k;
              }
            }
            // Blend: strength blend between original and sharpened output
            var orig = dst[base + c];
            var sharp = orig + (acc - orig * kernelSum) * strength * 0.2;
            sharpened[base + c] = sharp < 0 ? 0 : sharp > 255 ? 255 : Math.round(sharp);
          }
          sharpened[base + 3] = dst[base + 3];
        }
      }
      dst = sharpened;
    }

    // Grain — per-pixel random noise
    if (grain > 0) {
      var grainAmp = (grain / 100) * 30;
      for (var i = 0; i < len; i += 4) {
        var noise = (Math.random() * 2 - 1) * grainAmp;
        var rv = dst[i]     + noise;
        var gv = dst[i + 1] + noise;
        var bv = dst[i + 2] + noise;
        dst[i]     = rv < 0 ? 0 : rv > 255 ? 255 : Math.round(rv);
        dst[i + 1] = gv < 0 ? 0 : gv > 255 ? 255 : Math.round(gv);
        dst[i + 2] = bv < 0 ? 0 : bv > 255 ? 255 : Math.round(bv);
      }
    }

    // Vignette
    if (vignette !== 0) {
      var vigK = vignette / 100;
      var vigAbs = vigK < 0 ? -vigK : vigK;
      var vigDarken = vignette < 0;
      var INV_DIAG = 1 / 0.7071;
      for (var y = 0; y < h; y++) {
        var dy = y / h - 0.5;
        for (var x = 0; x < w; x++) {
          var dx = x / w - 0.5;
          var dist = Math.sqrt(dx * dx + dy * dy) * INV_DIAG;
          var vFactor = 1 - dist * dist * vigAbs * 2;
          var base = (y * w + x) * 4;
          var scale;
          if (vigDarken) {
            // Darken edges: multiply by vFactor (clamped min 0)
            scale = vFactor < 0 ? 0 : vFactor;
          } else {
            // Lighten edges: multiply by 1 + (1-vFactor)*0.3
            scale = 1 + (1 - vFactor) * 0.3;
          }
          var rv = dst[base]     * scale;
          var gv = dst[base + 1] * scale;
          var bv = dst[base + 2] * scale;
          dst[base]     = rv < 0 ? 0 : rv > 255 ? 255 : Math.round(rv);
          dst[base + 1] = gv < 0 ? 0 : gv > 255 ? 255 : Math.round(gv);
          dst[base + 2] = bv < 0 ? 0 : bv > 255 ? 255 : Math.round(bv);
        }
      }
    }

    return new ImageData(dst, w, h);
  };

  // ─── Static methods ───────────────────────────────────────────────────────────

  SnappyAdjust.applyCurveToImageData = applyCurveToImageData;

  // ─── Presets ──────────────────────────────────────────────────────────────────

  SnappyAdjust.PRESETS = {
    Vivid: {
      contrast: 25,
      saturation: 20,
      vibrance: 30,
      clarity: 15,
      sharpness: 20
    },
    Dramatic: {
      contrast: 45,
      highlights: -20,
      shadows: 10,
      saturation: -10,
      clarity: 30,
      vignette: -30
    },
    BW: {
      saturation: -100,
      contrast: 20,
      clarity: 10
    },
    Warm: {
      temperature: 40,
      tint: 10,
      vibrance: 20
    },
    Cool: {
      temperature: -35,
      tint: -5,
      saturation: 10
    },
    Vintage: {
      temperature: 20,
      fade: 25,
      saturation: -15,
      vignette: -25,
      grain: 20
    },
    Matte: {
      fade: 30,
      contrast: -10,
      highlights: -20,
      saturation: -10
    },
    Film: {
      grain: 35,
      fade: 15,
      contrast: 15,
      temperature: 10,
      vignette: -20
    },
    Cinematic: {
      contrast: 30,
      highlights: -30,
      shadows: 20,
      saturation: -20,
      temperature: 15,
      vignette: -40
    },
    Cross: {
      tint: 30,
      temperature: -20,
      contrast: 20,
      saturation: 30
    },
    Chrome: {
      contrast: 35,
      highlights: -20,
      saturation: 20,
      sharpness: 30
    },
    Natural: {
      clarity: 10,
      vibrance: 15,
      sharpness: 10
    }
  };

  // ─── Export ───────────────────────────────────────────────────────────────────

  global.SnappyAdjust = SnappyAdjust;

}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
