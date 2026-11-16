/**
 * PIXFORGE // Color Quantization, Perceptual Spaces & Retro Palettes Engine
 */
(function (global) {
  "use strict";

  const RETRO_PALETTES = {
    gameboy: [
      [15, 56, 15],
      [48, 98, 48],
      [139, 172, 15],
      [155, 188, 15]
    ],
    pico8: [
      [0, 0, 0], [29, 43, 83], [126, 37, 83], [0, 135, 81],
      [171, 82, 54], [95, 87, 79], [194, 195, 199], [255, 241, 232],
      [255, 0, 77], [255, 163, 0], [255, 236, 39], [0, 228, 54],
      [41, 173, 255], [131, 118, 156], [255, 119, 168], [255, 204, 170]
    ],
    sweetie16: [
      [26, 28, 44], [93, 39, 93], [177, 62, 83], [239, 125, 87],
      [255, 205, 117], [167, 240, 112], [56, 183, 100], [37, 113, 121],
      [41, 54, 111], [59, 93, 201], [65, 166, 246], [115, 239, 247],
      [244, 244, 244], [148, 176, 194], [86, 108, 134], [51, 60, 87]
    ],
    endesga16: [
      [228, 166, 114], [184, 111, 80], [116, 63, 57], [63, 40, 50],
      [158, 40, 53], [229, 59, 68], [251, 146, 43], [255, 231, 98],
      [99, 198, 77], [50, 115, 69], [25, 61, 63], [79, 103, 129],
      [175, 191, 210], [255, 255, 255], [44, 232, 244], [4, 132, 209]
    ],
    endesga32: [
      [190, 74, 47], [215, 118, 67], [234, 212, 170], [228, 166, 114],
      [184, 111, 80], [115, 62, 57], [62, 39, 49], [162, 38, 51],
      [228, 59, 68], [247, 118, 34], [254, 174, 52], [254, 231, 97],
      [99, 199, 77], [62, 137, 72], [38, 92, 66], [25, 60, 62],
      [18, 78, 137], [0, 153, 219], [44, 232, 245], [255, 255, 255],
      [192, 203, 220], [139, 155, 180], [90, 105, 136], [58, 68, 102],
      [38, 43, 68], [24, 20, 37], [255, 0, 68], [104, 56, 108],
      [181, 80, 136], [246, 117, 122], [232, 183, 150], [194, 133, 105]
    ]
  };

  // Ordered Bayer Matrices normalized to [-0.5, 0.5]
  const BAYER_2X2 = [
    [-0.375, 0.125],
    [0.375, -0.125]
  ];

  const BAYER_4X4 = [
    [-0.46875, 0.03125, -0.34375, 0.15625],
    [0.28125, -0.21875, 0.40625, -0.09375],
    [-0.28125, 0.21875, -0.40625, 0.09375],
    [0.46875, -0.03125, 0.34375, -0.15625]
  ];

  function clampByte(v) {
    return v < 0 ? 0 : v > 255 ? 255 : v | 0;
  }

  function rgbToHex(r, g, b) {
    return (
      "#" +
      ((1 << 24) | ((r & 255) << 16) | ((g & 255) << 8) | (b & 255))
        .toString(16)
        .slice(1)
        .toUpperCase()
    );
  }

  function hexToRgb(hex) {
    const clean = hex.replace("#", "").trim();
    if (clean.length === 3) {
      return [
        parseInt(clean[0] + clean[0], 16),
        parseInt(clean[1] + clean[1], 16),
        parseInt(clean[2] + clean[2], 16)
      ];
    }
    const num = parseInt(clean, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }

  /**
   * Fast Perceptual Redmean Color Distance (squared)
   * Provides human-eye accurate color matching without expensive XYZ/LAB cube roots.
   */
  function colorDistSq(r1, g1, b1, r2, g2, b2) {
    const rmean = (r1 + r2) * 0.5;
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    return (
      (2 + rmean / 256) * dr * dr +
      4 * dg * dg +
      (2 + (255 - rmean) / 256) * db * db
    );
  }

  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h /= 6;
    }
    return [h, s, l];
  }

  function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return [
      clampByte(Math.round(r * 255)),
      clampByte(Math.round(g * 255)),
      clampByte(Math.round(b * 255))
    ];
  }

  /**
   * Derives a harmonious dark pixel-art outline color from an adjacent sprite color.
   * Uses Hue-Shifting toward cooler shadow tones (indigo/violet ~0.68) and controlled saturation boost.
   */
  function deriveAdaptiveOutlineColor(r, g, b, darknessFactor = 0.65) {
    let [h, s, l] = rgbToHsl(r, g, b);
    // Subtle hue shift towards cool shadow (245 deg = 0.68) for authentic pixel-art selective outlining
    const targetShadowHue = 0.68;
    let hueDiff = targetShadowHue - h;
    if (hueDiff > 0.5) hueDiff -= 1;
    if (hueDiff < -0.5) hueDiff += 1;
    h = (h + hueDiff * 0.18 + 1) % 1;

    // Boost saturation slightly if color is mid-toned so shadows aren't muddy gray
    if (s > 0.08) {
      s = Math.min(1, s * 1.18 + 0.05);
    }
    // Reduce lightness strongly according to darknessFactor (0.3 to 0.9)
    l = Math.max(0.04, l * (1 - darknessFactor));
    return hslToRgb(h, s, l);
  }

  /**
   * Builds a color box for Median Cut from a list of histogram entries: {r, g, b, count}
   */
  function createColorBox(entries) {
    let rMin = 255, rMax = 0;
    let gMin = 255, gMax = 0;
    let bMin = 255, bMax = 0;
    let totalCount = 0;
    let rSum = 0, gSum = 0, bSum = 0;

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const c = e.count;
      if (e.r < rMin) rMin = e.r;
      if (e.r > rMax) rMax = e.r;
      if (e.g < gMin) gMin = e.g;
      if (e.g > gMax) gMax = e.g;
      if (e.b < bMin) bMin = e.b;
      if (e.b > bMax) bMax = e.b;
      totalCount += c;
      rSum += e.r * c;
      gSum += e.g * c;
      bSum += e.b * c;
    }

    const rRange = (rMax - rMin) * 0.85;
    const gRange = (gMax - gMin) * 1.0;
    const bRange = (bMax - bMin) * 0.7;
    const maxRange = Math.max(rRange, gRange, bRange);
    let splitAxis = "g";
    if (maxRange === rRange) splitAxis = "r";
    else if (maxRange === bRange) splitAxis = "b";

    // Priority combines perceptual range and log population so both large regions and distinct accent colors get splits
    const priority = maxRange * Math.pow(totalCount, 0.28);

    return {
      entries,
      totalCount,
      rRange,
      gRange,
      bRange,
      splitAxis,
      priority,
      avg: totalCount > 0
        ? [
            Math.round(rSum / totalCount),
            Math.round(gSum / totalCount),
            Math.round(bSum / totalCount)
          ]
        : [0, 0, 0]
    };
  }

  /**
   * Deterministic Perceptual Median Cut + Weighted K-Means Refinement
   */
  function extractPaletteMedianCut(imageData, targetColors) {
    const data = imageData.data;
    const histMap = new Map();

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue; // Ignore transparent background pixels
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const key = (r << 16) | (g << 8) | b;
      histMap.set(key, (histMap.get(key) || 0) + 1);
    }

    if (histMap.size === 0) {
      return [[0, 0, 0]];
    }

    const entries = [];
    histMap.forEach((count, key) => {
      entries.push({
        r: (key >> 16) & 255,
        g: (key >> 8) & 255,
        b: key & 255,
        // Compress extreme frequency dominance with square root weighting so small sprite details (eyes, gems) survive quantization
        count: Math.max(1, Math.round(Math.pow(count, 0.65) * 10))
      });
    });

    if (entries.length <= targetColors) {
      return entries.map((e) => [e.r, e.g, e.b]);
    }

    const boxes = [createColorBox(entries)];

    while (boxes.length < targetColors) {
      // Find splittable box with highest priority
      let bestIdx = -1;
      let bestPriority = -1;
      for (let i = 0; i < boxes.length; i++) {
        if (boxes[i].entries.length > 1 && boxes[i].priority > bestPriority) {
          bestPriority = boxes[i].priority;
          bestIdx = i;
        }
      }

      if (bestIdx === -1) break;

      const box = boxes.splice(bestIdx, 1)[0];
      const axis = box.splitAxis;
      box.entries.sort((a, b) => a[axis] - b[axis]);

      // Find weighted median split point
      const halfCount = box.totalCount / 2;
      let acc = 0;
      let splitPos = 1;
      for (let i = 0; i < box.entries.length - 1; i++) {
        acc += box.entries[i].count;
        if (acc >= halfCount) {
          splitPos = i + 1;
          break;
        }
      }

      const leftEntries = box.entries.slice(0, splitPos);
      const rightEntries = box.entries.slice(splitPos);
      boxes.push(createColorBox(leftEntries), createColorBox(rightEntries));
    }

    let centroids = boxes.map((b) => b.avg);

    // Deterministic Weighted K-Means refinement (4 iterations)
    for (let iter = 0; iter < 4; iter++) {
      const sums = centroids.map(() => [0, 0, 0, 0]);
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        let bestK = 0;
        let minDist = Infinity;
        for (let k = 0; k < centroids.length; k++) {
          const c = centroids[k];
          const d = colorDistSq(e.r, e.g, e.b, c[0], c[1], c[2]);
          if (d < minDist) {
            minDist = d;
            bestK = k;
          }
        }
        sums[bestK][0] += e.r * e.count;
        sums[bestK][1] += e.g * e.count;
        sums[bestK][2] += e.b * e.count;
        sums[bestK][3] += e.count;
      }

      for (let k = 0; k < centroids.length; k++) {
        if (sums[k][3] > 0) {
          centroids[k] = [
            Math.round(sums[k][0] / sums[k][3]),
            Math.round(sums[k][1] / sums[k][3]),
            Math.round(sums[k][2] / sums[k][3])
          ];
        }
      }
    }

    return centroids;
  }

  /**
   * Quantizes ImageData to the chosen palette size or hardware preset,
   * supporting optional ordered Bayer dithering and user color overrides.
   */
  function quantizeSprite(imageData, options) {
    const {
      paletteSize = 16,      // 2, 4, 8, 16, 32, or "free"
      palettePreset = "auto",// "auto", "gameboy", "pico8", "sweetie16", "endesga16", "endesga32"
      ditherMode = "none",   // "none", "bayer2", "bayer4"
      ditherStrength = 18,   // 0..50
      colorOverrides = {}    // Map of originalHex -> replacementHex
    } = options;

    const width = imageData.width;
    const height = imageData.height;
    const out = new ImageData(new Uint8ClampedArray(imageData.data), width, height);
    const data = out.data;

    let targetPalette = null;
    if (palettePreset !== "auto" && RETRO_PALETTES[palettePreset]) {
      targetPalette = RETRO_PALETTES[palettePreset].map((c) => [...c]);
      if (paletteSize !== "free" && targetPalette.length > Number(paletteSize)) {
        targetPalette = targetPalette.slice(0, Number(paletteSize));
      }
    } else if (paletteSize !== "free") {
      targetPalette = extractPaletteMedianCut(out, Number(paletteSize));
    }

    // Apply quantization if a target palette is active
    if (targetPalette && targetPalette.length > 0) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          if (data[idx + 3] < 128) {
            data[idx + 3] = 0;
            continue;
          }

          let r = data[idx];
          let g = data[idx + 1];
          let b = data[idx + 2];

          if (ditherMode !== "none") {
            const bayerVal =
              ditherMode === "bayer2"
                ? BAYER_2X2[y & 1][x & 1]
                : BAYER_4X4[y & 3][x & 3];
            const offset = bayerVal * ditherStrength;
            r = clampByte(r + offset);
            g = clampByte(g + offset);
            b = clampByte(b + offset);
          }

          let bestColor = targetPalette[0];
          let minDist = Infinity;
          for (let k = 0; k < targetPalette.length; k++) {
            const c = targetPalette[k];
            const d = colorDistSq(r, g, b, c[0], c[1], c[2]);
            if (d < minDist) {
              minDist = d;
              bestColor = c;
            }
          }

          data[idx] = bestColor[0];
          data[idx + 1] = bestColor[1];
          data[idx + 2] = bestColor[2];
          data[idx + 3] = 255;
        }
      }
    }

    // Collect final palette & apply any interactive swatch overrides
    const usageMap = new Map();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      let hex = rgbToHex(data[i], data[i + 1], data[i + 2]);
      const overrideHex = colorOverrides[hex];
      if (overrideHex) {
        const [or, og, ob] = hexToRgb(overrideHex);
        data[i] = or;
        data[i + 1] = og;
        data[i + 2] = ob;
      }
      const entry = usageMap.get(hex);
      if (entry) {
        entry.count++;
      } else {
        usageMap.set(hex, {
          originalHex: hex,
          displayHex: overrideHex ? overrideHex.toUpperCase() : hex,
          rgb: overrideHex ? hexToRgb(overrideHex) : [data[i], data[i + 1], data[i + 2]],
          count: 1
        });
      }
    }

    // Sort swatches by luminance (dark to light) for a clean studio palette view
    const swatches = Array.from(usageMap.values()).sort((a, b) => {
      const lumA = 0.299 * a.rgb[0] + 0.587 * a.rgb[1] + 0.114 * a.rgb[2];
      const lumB = 0.299 * b.rgb[0] + 0.587 * b.rgb[1] + 0.114 * b.rgb[2];
      return lumA - lumB;
    });

    return {
      imageData: out,
      swatches
    };
  }

  global.PixPalettes = {
    RETRO_PALETTES,
    clampByte,
    rgbToHex,
    hexToRgb,
    colorDistSq,
    rgbToHsl,
    hslToRgb,
    deriveAdaptiveOutlineColor,
    extractPaletteMedianCut,
    quantizeSprite
  };
})(window);
