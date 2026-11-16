/**
 * PIXFORGE // Core Pixel-Art Image Processing Pipeline
 * 100% Client-Side Deterministic Engine
 */
(function (global) {
  "use strict";

  const {
    clampByte,
    rgbToHex,
    hexToRgb,
    colorDistSq,
    deriveAdaptiveOutlineColor,
    quantizeSprite
  } = global.PixPalettes;

  /**
   * Automatically detects the peripheral background color by sampling corners
   * and outer perimeter pixels of the source image.
   */
  function detectPeripheralBackgroundColor(imageData) {
    const { width, height, data } = imageData;
    const samples = [];

    const addSample = (x, y, weight = 1) => {
      const idx = (y * width + x) * 4;
      const a = data[idx + 3];
      if (a < 64) {
        samples.push({ r: 0, g: 0, b: 0, a: 0, weight: weight * 2 });
      } else {
        samples.push({
          r: data[idx],
          g: data[idx + 1],
          b: data[idx + 2],
          a: 255,
          weight
        });
      }
    };

    // High-weight corner patches (2x2 at each corner)
    const corners = [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1]
    ];
    for (const [cx, cy] of corners) {
      addSample(cx, cy, 6);
    }

    // Perimeter samples along top, bottom, left, right edges
    const stepX = Math.max(1, Math.floor(width / 24));
    const stepY = Math.max(1, Math.floor(height / 24));
    for (let x = 0; x < width; x += stepX) {
      addSample(x, 0, 1);
      addSample(x, height - 1, 1);
    }
    for (let y = 0; y < height; y += stepY) {
      addSample(0, y, 1);
      addSample(width - 1, y, 1);
    }

    // Check if image is already transparent on the outside
    let transparentWeight = 0;
    let totalWeight = 0;
    for (const s of samples) {
      totalWeight += s.weight;
      if (s.a === 0) transparentWeight += s.weight;
    }

    if (transparentWeight > totalWeight * 0.45) {
      return { r: 0, g: 0, b: 0, alreadyTransparent: true, hex: "#000000" };
    }

    // Cluster perimeter colors into coarse buckets (quantized by 16) to find dominant background color
    const buckets = new Map();
    for (const s of samples) {
      if (s.a === 0) continue;
      const key = ((s.r >> 4) << 8) | ((s.g >> 4) << 4) | (s.b >> 4);
      let b = buckets.get(key);
      if (!b) {
        b = { rSum: 0, gSum: 0, bSum: 0, weight: 0 };
        buckets.set(key, b);
      }
      b.rSum += s.r * s.weight;
      b.gSum += s.g * s.weight;
      b.bSum += s.b * s.weight;
      b.weight += s.weight;
    }

    let bestBucket = null;
    for (const b of buckets.values()) {
      if (!bestBucket || b.weight > bestBucket.weight) {
        bestBucket = b;
      }
    }

    if (!bestBucket || bestBucket.weight === 0) {
      return { r: 255, g: 255, b: 255, alreadyTransparent: false, hex: "#FFFFFF" };
    }

    const r = Math.round(bestBucket.rSum / bestBucket.weight);
    const g = Math.round(bestBucket.gSum / bestBucket.weight);
    const b = Math.round(bestBucket.bSum / bestBucket.weight);
    return {
      r,
      g,
      b,
      alreadyTransparent: false,
      hex: rgbToHex(r, g, b)
    };
  }

  /**
   * Creates a foreground/background mask on the source image before cell downsampling
   * so background pixels never bleed into edge sprite cells (eliminating AA halos).
   */
  function buildSourceForegroundMask(sourceImageData, bgConfig) {
    const { width, height, data } = sourceImageData;
    const total = width * height;
    const isBg = new Uint8Array(total);

    if (!bgConfig.enabled) {
      // Only mark genuinely transparent source pixels as background
      for (let i = 0; i < total; i++) {
        if (data[i * 4 + 3] < 64) isBg[i] = 1;
      }
      return isBg;
    }

    const { r: bgR, g: bgG, b: bgB, alreadyTransparent } = bgConfig.targetColor;
    // Map tolerance (0..100) to perceptual Redmean squared threshold
    const tol = bgConfig.tolerance;
    const maxDistSq = Math.pow(tol * 3.8, 2);

    const matchesBg = (idx4) => {
      const a = data[idx4 + 3];
      if (a < 96) return true;
      if (alreadyTransparent && !bgConfig.useCustomColor) return false;
      const dSq = colorDistSq(data[idx4], data[idx4 + 1], data[idx4 + 2], bgR, bgG, bgB);
      return dSq <= maxDistSq;
    };

    if (bgConfig.mode === "global") {
      for (let i = 0; i < total; i++) {
        if (matchesBg(i * 4)) isBg[i] = 1;
      }
      return isBg;
    }

    // Flood Fill (8-connected BFS) from all outer perimeter pixels
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;

    const trySeed = (x, y) => {
      const pos = y * width + x;
      if (isBg[pos]) return;
      if (matchesBg(pos * 4)) {
        isBg[pos] = 1;
        queue[tail++] = pos;
      }
    };

    for (let x = 0; x < width; x++) {
      trySeed(x, 0);
      trySeed(x, height - 1);
    }
    for (let y = 1; y < height - 1; y++) {
      trySeed(0, y);
      trySeed(width - 1, y);
    }

    while (head < tail) {
      const curr = queue[head++];
      const cx = curr % width;
      const cy = (curr / width) | 0;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = cy + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          if (nx < 0 || nx >= width) continue;
          const nPos = ny * width + nx;
          if (isBg[nPos]) continue;
          if (matchesBg(nPos * 4)) {
            isBg[nPos] = 1;
            queue[tail++] = nPos;
          }
        }
      }
    }

    return isBg;
  }

  /**
   * Anti-Mixel & Anti-AA Downsampling Engine
   * Maps high-res source ImageData strictly to discrete target grid cells (e.g. 32x32)
   * without bilinear blending or mixel scale inconsistencies.
   */
  function downsampleToGrid(sourceImageData, sourceBgMask, options) {
    const {
      gridSize = 32,          // 16, 32, 48, 64, 128
      samplingMode = "dominant", // "dominant" (Anti-AA Mode), "median", "center", "sharp-avg"
      fitMode = "contain",    // "contain", "cover", "stretch"
      reserveOutlineMargin = true,
      contrastBoost = 10,     // 0..50
      bgConfig
    } = options;

    const srcW = sourceImageData.width;
    const srcH = sourceImageData.height;
    const srcData = sourceImageData.data;

    const out = new ImageData(gridSize, gridSize);
    const outData = out.data;

    // Leave 1px margin on each side if outline is active so 1px exterior outline never clips at canvas edges
    const margin = reserveOutlineMargin ? 1 : 0;
    const availW = Math.max(1, gridSize - margin * 2);
    const availH = Math.max(1, gridSize - margin * 2);

    let destW = availW;
    let destH = availH;
    let offsetX = margin;
    let offsetY = margin;

    if (fitMode === "contain") {
      const aspect = srcW / srcH;
      if (aspect >= 1) {
        destW = availW;
        destH = Math.max(1, Math.round(availW / aspect));
        offsetY = margin + Math.floor((availH - destH) / 2);
      } else {
        destH = availH;
        destW = Math.max(1, Math.round(availH * aspect));
        offsetX = margin + Math.floor((availW - destW) / 2);
      }
    }

    // Contrast factor for sharpening soft AI lighting
    const contrastFactor =
      contrastBoost > 0
        ? (259 * (contrastBoost * 1.6 + 255)) / (255 * (259 - contrastBoost * 1.6))
        : 1;

    const applyContrast = (v) => {
      if (contrastBoost <= 0) return v;
      return clampByte(Math.round(contrastFactor * (v - 128) + 128));
    };

    const bgColor = bgConfig.targetColor;
    const defringeStrength = (bgConfig.defringe || 0) / 100; // 0..1

    for (let gy = 0; gy < destH; gy++) {
      const targetY = offsetY + gy;
      if (targetY < 0 || targetY >= gridSize) continue;

      let sy0, sy1;
      if (fitMode === "cover") {
        const scale = Math.max(destW / srcW, destH / srcH);
        const cropH = destH / scale;
        const startY = (srcH - cropH) / 2;
        sy0 = Math.floor(startY + (gy / destH) * cropH);
        sy1 = Math.ceil(startY + ((gy + 1) / destH) * cropH);
      } else {
        sy0 = Math.floor((gy / destH) * srcH);
        sy1 = Math.ceil(((gy + 1) / destH) * srcH);
      }
      sy0 = Math.max(0, Math.min(srcH - 1, sy0));
      sy1 = Math.max(sy0 + 1, Math.min(srcH, sy1));

      for (let gx = 0; gx < destW; gx++) {
        const targetX = offsetX + gx;
        if (targetX < 0 || targetX >= gridSize) continue;

        let sx0, sx1;
        if (fitMode === "cover") {
          const scale = Math.max(destW / srcW, destH / srcH);
          const cropW = destW / scale;
          const startX = (srcW - cropW) / 2;
          sx0 = Math.floor(startX + (gx / destW) * cropW);
          sx1 = Math.ceil(startX + ((gx + 1) / destW) * cropW);
        } else {
          sx0 = Math.floor((gx / destW) * srcW);
          sx1 = Math.ceil(((gx + 1) / destW) * srcW);
        }
        sx0 = Math.max(0, Math.min(srcW - 1, sx0));
        sx1 = Math.max(sx0 + 1, Math.min(srcW, sx1));

        const outIdx = (targetY * gridSize + targetX) * 4;

        // Center point sampling mode
        if (samplingMode === "center") {
          const cx = Math.min(srcW - 1, (sx0 + sx1) >> 1);
          const cy = Math.min(srcH - 1, (sy0 + sy1) >> 1);
          const pos = cy * srcW + cx;
          if (sourceBgMask[pos] || srcData[pos * 4 + 3] < 128) {
            outData[outIdx + 3] = 0;
          } else {
            outData[outIdx] = applyContrast(srcData[pos * 4]);
            outData[outIdx + 1] = applyContrast(srcData[pos * 4 + 1]);
            outData[outIdx + 2] = applyContrast(srcData[pos * 4 + 2]);
            outData[outIdx + 3] = 255;
          }
          continue;
        }

        // Gather subpixels inside cell [sx0..sx1) x [sy0..sy1)
        const cellW = sx1 - sx0;
        const cellH = sy1 - sy0;
        const totalSubpixels = cellW * cellH;
        // Stride for large cells (e.g. 2048px -> 16px) so processing stays < 5ms
        const step = totalSubpixels > 64 ? Math.max(1, Math.floor(Math.sqrt(totalSubpixels / 36))) : 1;

        let fgCount = 0;
        let sampleTotal = 0;
        const fgPixels = [];
        const centerX = (sx0 + sx1 - 1) * 0.5;
        const centerY = (sy0 + sy1 - 1) * 0.5;
        const maxRadiusSq = Math.max(1, (cellW * cellW + cellH * cellH) * 0.25);

        for (let sy = sy0; sy < sy1; sy += step) {
          for (let sx = sx0; sx < sx1; sx += step) {
            sampleTotal++;
            const pos = sy * srcW + sx;
            if (sourceBgMask[pos]) continue;
            const sIdx = pos * 4;
            const a = srcData[sIdx + 3];
            if (a < 128) continue;

            const r = srcData[sIdx];
            const g = srcData[sIdx + 1];
            const b = srcData[sIdx + 2];

            // Edge defringing: if bg removal is active, penalize boundary subpixels that are close to background color
            let bgPenalty = 1.0;
            if (bgConfig.enabled && !bgColor.alreadyTransparent && defringeStrength > 0) {
              const dBg = colorDistSq(r, g, b, bgColor.r, bgColor.g, bgColor.b);
              const fringeThresh = Math.pow((bgConfig.tolerance + 25 * defringeStrength) * 4.0, 2);
              if (dBg < fringeThresh) {
                bgPenalty = 0.15;
              }
            }

            const dx = sx - centerX;
            const dy = sy - centerY;
            const centerWeight = 1.4 - 0.6 * ((dx * dx + dy * dy) / maxRadiusSq);

            fgCount++;
            fgPixels.push({
              r,
              g,
              b,
              w: Math.max(0.1, centerWeight * bgPenalty)
            });
          }
        }

        // Determine if cell is opaque sprite or transparent background
        // Higher threshold when defringe is high to shave off blurry anti-aliased silhouettes
        const occupancyThreshold = bgConfig.enabled
          ? 0.28 + defringeStrength * 0.34
          : 0.2;

        if (fgCount === 0 || fgCount / sampleTotal < occupancyThreshold) {
          outData[outIdx + 3] = 0;
          continue;
        }

        let finalR = 0, finalG = 0, finalB = 0;

        if (samplingMode === "dominant") {
          // Modal cluster quantization (bins of 24 units) to reject anti-aliasing transition ramps
          const bins = new Map();
          for (let i = 0; i < fgPixels.length; i++) {
            const p = fgPixels[i];
            const key =
              (((p.r / 24) | 0) << 8) |
              (((p.g / 24) | 0) << 4) |
              ((p.b / 24) | 0);
            let bin = bins.get(key);
            if (!bin) {
              bin = { rSum: 0, gSum: 0, bSum: 0, wSum: 0 };
              bins.set(key, bin);
            }
            bin.rSum += p.r * p.w;
            bin.gSum += p.g * p.w;
            bin.bSum += p.b * p.w;
            bin.wSum += p.w;
          }

          let bestBin = null;
          for (const bin of bins.values()) {
            if (!bestBin || bin.wSum > bestBin.wSum) {
              bestBin = bin;
            }
          }

          finalR = Math.round(bestBin.rSum / bestBin.wSum);
          finalG = Math.round(bestBin.gSum / bestBin.wSum);
          finalB = Math.round(bestBin.bSum / bestBin.wSum);
        } else if (samplingMode === "median") {
          // Sort foreground subpixels by perceptual luminance and pick median pixel
          fgPixels.sort(
            (a, b) =>
              0.299 * a.r + 0.587 * a.g + 0.114 * a.b -
              (0.299 * b.r + 0.587 * b.g + 0.114 * b.b)
          );
          const mid = fgPixels[fgPixels.length >> 1];
          finalR = mid.r;
          finalG = mid.g;
          finalB = mid.b;
        } else {
          // Weighted sharp average
          let rSum = 0, gSum = 0, bSum = 0, wSum = 0;
          for (let i = 0; i < fgPixels.length; i++) {
            const p = fgPixels[i];
            rSum += p.r * p.w;
            gSum += p.g * p.w;
            bSum += p.b * p.w;
            wSum += p.w;
          }
          finalR = Math.round(rSum / wSum);
          finalG = Math.round(gSum / wSum);
          finalB = Math.round(bSum / wSum);
        }

        outData[outIdx] = applyContrast(finalR);
        outData[outIdx + 1] = applyContrast(finalG);
        outData[outIdx + 2] = applyContrast(finalB);
        outData[outIdx + 3] = 255;
      }
    }

    return out;
  }

  /**
   * Grid-level Background Flood Fill & Defringe pass
   * Ensures any remaining border background cells or edge halo cells on the discrete grid are transparent.
   */
  function removeGridBackground(gridImageData, bgConfig) {
    if (!bgConfig.enabled) return gridImageData;

    const { width, height, data } = gridImageData;
    const { r: bgR, g: bgG, b: bgB, alreadyTransparent } = bgConfig.targetColor;
    if (alreadyTransparent && !bgConfig.useCustomColor) return gridImageData;

    const tol = bgConfig.tolerance;
    const maxDistSq = Math.pow(tol * 3.8, 2);
    const total = width * height;
    const visited = new Uint8Array(total);

    const matchesBg = (idx4) => {
      if (data[idx4 + 3] === 0) return true;
      const dSq = colorDistSq(data[idx4], data[idx4 + 1], data[idx4 + 2], bgR, bgG, bgB);
      return dSq <= maxDistSq;
    };

    if (bgConfig.mode === "global") {
      for (let i = 0; i < total; i++) {
        if (matchesBg(i * 4)) {
          data[i * 4 + 3] = 0;
        }
      }
      return gridImageData;
    }

    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;

    const seed = (x, y) => {
      const pos = y * width + x;
      if (visited[pos]) return;
      if (matchesBg(pos * 4)) {
        visited[pos] = 1;
        data[pos * 4 + 3] = 0;
        queue[tail++] = pos;
      }
    };

    for (let x = 0; x < width; x++) {
      seed(x, 0);
      seed(x, height - 1);
    }
    for (let y = 0; y < height; y++) {
      seed(0, y);
      seed(width - 1, y);
    }

    while (head < tail) {
      const curr = queue[head++];
      const cx = curr % width;
      const cy = (curr / width) | 0;

      const neighbors = [
        [cx - 1, cy],
        [cx + 1, cy],
        [cx, cy - 1],
        [cx, cy + 1],
        [cx - 1, cy - 1],
        [cx + 1, cy - 1],
        [cx - 1, cy + 1],
        [cx + 1, cy + 1]
      ];

      for (let i = 0; i < neighbors.length; i++) {
        const nx = neighbors[i][0];
        const ny = neighbors[i][1];
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nPos = ny * width + nx;
        if (visited[nPos]) continue;
        if (matchesBg(nPos * 4)) {
          visited[nPos] = 1;
          data[nPos * 4 + 3] = 0;
          queue[tail++] = nPos;
        }
      }
    }

    return gridImageData;
  }

  /**
   * Pixel Art Topology Cleanup:
   * 1. Removes orphan stray pixels (isolated 1px opaque noise disconnected from the sprite).
   * 2. Fills isolated 1px pinholes completely surrounded orthogonally by sprite pixels.
   * 3. Optional silhouette jaggie/burr shaving before outlining.
   */
  function cleanSpriteTopology(imageData, options) {
    const { removeOrphans = true, cleanLCorners = true } = options;
    const { width, height, data } = imageData;
    const total = width * height;

    const getOpaqueMask = () => {
      const m = new Uint8Array(total);
      for (let i = 0; i < total; i++) {
        if (data[i * 4 + 3] >= 128) m[i] = 1;
      }
      return m;
    };

    if (removeOrphans) {
      const mask = getOpaqueMask();
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const pos = y * width + x;
          const idx = pos * 4;

          let orthoCount = 0;
          let diagCount = 0;
          let rSum = 0, gSum = 0, bSum = 0;

          const ortho = [
            [x - 1, y],
            [x + 1, y],
            [x, y - 1],
            [x, y + 1]
          ];
          const diag = [
            [x - 1, y - 1],
            [x + 1, y - 1],
            [x - 1, y + 1],
            [x + 1, y + 1]
          ];

          for (const [nx, ny] of ortho) {
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nPos = ny * width + nx;
              if (mask[nPos]) {
                orthoCount++;
                rSum += data[nPos * 4];
                gSum += data[nPos * 4 + 1];
                bSum += data[nPos * 4 + 2];
              }
            }
          }
          for (const [nx, ny] of diag) {
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              if (mask[ny * width + nx]) diagCount++;
            }
          }

          // Remove isolated 1px stray noise
          if (mask[pos] && orthoCount === 0 && diagCount <= 1) {
            data[idx + 3] = 0;
          }
          // Fill isolated 1px pinhole inside solid sprite area
          else if (!mask[pos] && orthoCount === 4) {
            data[idx] = (rSum / 4) | 0;
            data[idx + 1] = (gSum / 4) | 0;
            data[idx + 2] = (bSum / 4) | 0;
            data[idx + 3] = 255;
          }
        }
      }
    }

    // If L-corner / jaggie cleanup is active, shave single-pixel external burrs on flat edges
    if (cleanLCorners) {
      const mask = getOpaqueMask();
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const pos = y * width + x;
          if (!mask[pos]) continue;

          const n = mask[(y - 1) * width + x];
          const s = mask[(y + 1) * width + x];
          const w = mask[y * width + (x - 1)];
          const e = mask[y * width + (x + 1)];
          const orthoSum = n + s + w + e;

          const nw = mask[(y - 1) * width + (x - 1)];
          const ne = mask[(y - 1) * width + (x + 1)];
          const sw = mask[(y + 1) * width + (x - 1)];
          const se = mask[(y + 1) * width + (x + 1)];
          const diagSum = nw + ne + sw + se;

          // A single-pixel pimple protruding orthogonally from a flat edge (ortho=1, diag<=1)
          // creates a 3-pixel wart when outlined; shaving it yields a clean pixel-art line.
          if (orthoSum === 1 && diagSum === 0) {
            data[pos * 4 + 3] = 0;
          }
        }
      }
    }

    return imageData;
  }

  /**
   * Pixel-Perfect 1px Orthogonal Outline Engine
   * - Traces a 1px orthogonal perimeter around opaque sprite pixels.
   * - Eliminates redundant L-corners (miter cleanup) so diagonal transitions stay 1px thick.
   * - Removes orphan outline pixels.
   * - Supports Fixed Color (#000000 or custom) and Adaptive Darkened Neighbor Color.
   */
  function applyPixelOutline(imageData, outlineConfig) {
    if (!outlineConfig.enabled) return imageData;

    const {
      mode = "fixed",           // "fixed" | "adaptive"
      fixedColor = "#000000",
      darkness = 0.68,          // 0.3..0.9 for adaptive mode
      cleanLCorners = true,
      removeOrphans = true
    } = outlineConfig;

    const { width, height, data } = imageData;
    const total = width * height;

    // 1. Build sprite body mask S(x,y)
    const spriteMask = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
      if (data[i * 4 + 3] >= 128) spriteMask[i] = 1;
    }

    // 2. Generate 1px strict orthogonal outline candidates O(x,y)
    const outlineMask = new Uint8Array(total);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pos = y * width + x;
        if (spriteMask[pos]) continue;

        const hasN = y > 0 && spriteMask[(y - 1) * width + x];
        const hasS = y < height - 1 && spriteMask[(y + 1) * width + x];
        const hasW = x > 0 && spriteMask[y * width + (x - 1)];
        const hasE = x < width - 1 && spriteMask[y * width + (x + 1)];

        if (hasN || hasS || hasW || hasE) {
          outlineMask[pos] = 1;
        }
      }
    }

    // 3. Clean redundant L-corners on the outline so diagonals don't double up
    if (cleanLCorners) {
      const toRemove = new Uint8Array(total);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const pos = y * width + x;
          if (!outlineMask[pos]) continue;

          const oN = y > 0 ? outlineMask[(y - 1) * width + x] : 0;
          const oS = y < height - 1 ? outlineMask[(y + 1) * width + x] : 0;
          const oW = x > 0 ? outlineMask[y * width + (x - 1)] : 0;
          const oE = x < width - 1 ? outlineMask[y * width + (x + 1)] : 0;

          const sN = y > 0 ? spriteMask[(y - 1) * width + x] : 0;
          const sS = y < height - 1 ? spriteMask[(y + 1) * width + x] : 0;
          const sW = x > 0 ? spriteMask[y * width + (x - 1)] : 0;
          const sE = x < width - 1 ? spriteMask[y * width + (x + 1)] : 0;

          const sTouchingCount = sN + sS + sW + sE;
          const oTouchingCount = oN + oS + oW + oE;

          // Case A: Outer L-Corner Miter
          // An outline pixel touches exactly 1 sprite pixel orthogonally (which is itself a 90-deg corner of the sprite)
          // and forms a sharp 90-degree L-elbow with another outline pixel perpendicular to that sprite contact,
          // where removing the tip converts a blocky 90-deg double corner into a clean pixel-art bevel/diagonal.
          if (sTouchingCount === 1 && oTouchingCount === 2) {
            const isCornerEL =
              (oN && oE && !oS && !oW) ||
              (oN && oW && !oS && !oE) ||
              (oS && oE && !oN && !oW) ||
              (oS && oW && !oN && !oE);

            if (isCornerEL) {
              // Verify the single adjacent sprite pixel has at least 2 orthogonal sprite neighbors
              // (so we never expose an isolated 1px thin tip of the sprite)
              let adjX = x, adjY = y;
              if (sN) adjY = y - 1;
              else if (sS) adjY = y + 1;
              else if (sW) adjX = x - 1;
              else if (sE) adjX = x + 1;

              const aN = adjY > 0 ? spriteMask[(adjY - 1) * width + adjX] : 0;
              const aS = adjY < height - 1 ? spriteMask[(adjY + 1) * width + adjX] : 0;
              const aW = adjX > 0 ? spriteMask[adjY * width + (adjX - 1)] : 0;
              const aE = adjX < width - 1 ? spriteMask[adjY * width + (adjX + 1)] : 0;

              // Only miter when the sprite corner is a stair-step elbow (exactly 2 perpendicular sprite neighbors)
              // and the diagonal between the two outline neighbors is occupied by the sprite
              if (aN + aS + aW + aE === 2) {
                const diagMatch =
                  (oN && oE && y > 0 && x < width - 1 && spriteMask[(y - 1) * width + (x + 1)]) ||
                  (oN && oW && y > 0 && x > 0 && spriteMask[(y - 1) * width + (x - 1)]) ||
                  (oS && oE && y < height - 1 && x < width - 1 && spriteMask[(y + 1) * width + (x + 1)]) ||
                  (oS && oW && y < height - 1 && x > 0 && spriteMask[(y + 1) * width + (x - 1)]);

                if (diagMatch) {
                  toRemove[pos] = 1;
                }
              }
            }
          }
        }
      }

      for (let i = 0; i < total; i++) {
        if (toRemove[i]) outlineMask[i] = 0;
      }
    }

    // 4. Clean any orphan outline pixels
    if (removeOrphans) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const pos = y * width + x;
          if (!outlineMask[pos]) continue;
          let neighbors = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx;
              const ny = y + dy;
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nPos = ny * width + nx;
                if (outlineMask[nPos] || spriteMask[nPos]) neighbors++;
              }
            }
          }
          if (neighbors <= 1) {
            outlineMask[pos] = 0;
          }
        }
      }
    }

    // 5. Render outline pixels onto the output ImageData
    const [fixedR, fixedG, fixedB] = hexToRgb(fixedColor);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pos = y * width + x;
        if (!outlineMask[pos]) continue;

        const outIdx = pos * 4;
        if (mode === "fixed") {
          data[outIdx] = fixedR;
          data[outIdx + 1] = fixedG;
          data[outIdx + 2] = fixedB;
          data[outIdx + 3] = 255;
        } else {
          // Adaptive selective outline: average orthogonal sprite neighbors and darken harmoniously
          let rSum = 0, gSum = 0, bSum = 0, count = 0;
          const ortho = [
            [x - 1, y],
            [x + 1, y],
            [x, y - 1],
            [x, y + 1]
          ];
          for (let i = 0; i < 4; i++) {
            const nx = ortho[i][0];
            const ny = ortho[i][1];
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nPos = ny * width + nx;
              if (spriteMask[nPos]) {
                rSum += data[nPos * 4];
                gSum += data[nPos * 4 + 1];
                bSum += data[nPos * 4 + 2];
                count++;
              }
            }
          }
          if (count > 0) {
            const [ar, ag, ab] = deriveAdaptiveOutlineColor(
              Math.round(rSum / count),
              Math.round(gSum / count),
              Math.round(bSum / count),
              darkness
            );
            data[outIdx] = ar;
            data[outIdx + 1] = ag;
            data[outIdx + 2] = ab;
            data[outIdx + 3] = 255;
          } else {
            data[outIdx] = fixedR;
            data[outIdx + 1] = fixedG;
            data[outIdx + 2] = fixedB;
            data[outIdx + 3] = 255;
          }
        }
      }
    }

    return imageData;
  }

  /**
   * Executes the full Pixel Art conversion pipeline from high-res source ImageData.
   */
  function runFullPipeline(sourceImageData, state) {
    const t0 = performance.now();

    // 1. Determine background color (auto-detected peripheral or custom user override)
    const autoBg = detectPeripheralBackgroundColor(sourceImageData);
    const targetBgColor = state.bg.useCustomColor
      ? (() => {
          const [r, g, b] = hexToRgb(state.bg.customColor);
          return { r, g, b, alreadyTransparent: false, hex: state.bg.customColor.toUpperCase() };
        })()
      : autoBg;

    const bgConfig = {
      enabled: state.bg.enabled,
      mode: state.bg.mode,
      tolerance: state.bg.tolerance,
      defringe: state.bg.defringe,
      useCustomColor: state.bg.useCustomColor,
      targetColor: targetBgColor
    };

    // 2. Build source-level foreground mask so background never bleeds into edge grid cells
    const sourceBgMask = buildSourceForegroundMask(sourceImageData, bgConfig);

    // 3. Downsample onto discrete grid (16x16..128x128) eliminating mixels & anti-aliasing
    let spriteData = downsampleToGrid(sourceImageData, sourceBgMask, {
      gridSize: state.grid.size,
      samplingMode: state.grid.samplingMode,
      fitMode: state.grid.fitMode,
      reserveOutlineMargin: state.outline.enabled || state.grid.padBorder,
      contrastBoost: state.grid.contrastBoost,
      bgConfig
    });

    // 4. Clean remaining peripheral background on the discrete grid
    spriteData = removeGridBackground(spriteData, bgConfig);

    // 5. Clean orphan pixels, pinholes, and single-pixel silhouette burrs
    spriteData = cleanSpriteTopology(spriteData, {
      removeOrphans: state.outline.removeOrphans,
      cleanLCorners: state.outline.cleanLCorners
    });

    // 6. Quantize color palette (Median Cut + K-Means or Retro Hardware Palette)
    const quantResult = quantizeSprite(spriteData, {
      paletteSize: state.palette.size,
      palettePreset: state.palette.preset,
      ditherMode: state.palette.ditherMode,
      ditherStrength: state.palette.ditherStrength,
      colorOverrides: state.palette.colorOverrides
    });
    spriteData = quantResult.imageData;

    // 7. Apply 1px orthogonal Pixel Outline with L-corner miter cleanup
    if (state.outline.enabled) {
      spriteData = applyPixelOutline(spriteData, {
        enabled: true,
        mode: state.outline.mode,
        fixedColor: state.outline.fixedColor,
        darkness: state.outline.darkness / 100,
        cleanLCorners: state.outline.cleanLCorners,
        removeOrphans: state.outline.removeOrphans
      });
    }

    // 8. Re-collect final palette stats (including outline colors if added)
    const finalSwatchesMap = new Map();
    let opaqueCount = 0;
    const d = spriteData.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) {
        d[i + 3] = 0;
        continue;
      }
      d[i + 3] = 255;
      opaqueCount++;
      const hex = rgbToHex(d[i], d[i + 1], d[i + 2]);
      const existing = finalSwatchesMap.get(hex);
      if (existing) {
        existing.count++;
      } else {
        finalSwatchesMap.set(hex, {
          hex,
          rgb: [d[i], d[i + 1], d[i + 2]],
          count: 1
        });
      }
    }

    const finalSwatches = Array.from(finalSwatchesMap.values()).sort((a, b) => {
      const lumA = 0.299 * a.rgb[0] + 0.587 * a.rgb[1] + 0.114 * a.rgb[2];
      const lumB = 0.299 * b.rgb[0] + 0.587 * b.rgb[1] + 0.114 * b.rgb[2];
      return lumA - lumB;
    });

    const elapsedMs = Math.max(0.1, +(performance.now() - t0).toFixed(1));

    return {
      imageData: spriteData,
      swatches: finalSwatches,
      detectedBgHex: targetBgColor.hex,
      alreadyTransparent: targetBgColor.alreadyTransparent,
      opaqueCount,
      elapsedMs
    };
  }

  /**
   * Exact Integer Nearest-Neighbor Upscaler for PNG Export (1x, 2x, 4x, 8x, 16x)
   * Copies each source pixel into an exact (scale x scale) pixel block in the output buffer,
   * guaranteeing zero browser interpolation blur across all engines.
   */
  function createNearestNeighborCanvas(spriteImageData, scaleFactor = 1) {
    const scale = Math.max(1, Math.round(scaleFactor));
    const srcW = spriteImageData.width;
    const srcH = spriteImageData.height;
    const dstW = srcW * scale;
    const dstH = srcH * scale;

    const canvas = document.createElement("canvas");
    canvas.width = dstW;
    canvas.height = dstH;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    if (scale === 1) {
      ctx.putImageData(spriteImageData, 0, 0);
      return canvas;
    }

    const dstImageData = ctx.createImageData(dstW, dstH);
    const srcBuf32 = new Uint32Array(spriteImageData.data.buffer);
    const dstBuf32 = new Uint32Array(dstImageData.data.buffer);

    for (let y = 0; y < srcH; y++) {
      const srcRowOffset = y * srcW;
      const dstBaseY = y * scale;
      for (let x = 0; x < srcW; x++) {
        const pixel32 = srcBuf32[srcRowOffset + x];
        const dstBaseX = x * scale;
        for (let dy = 0; dy < scale; dy++) {
          const dstRowOffset = (dstBaseY + dy) * dstW + dstBaseX;
          for (let dx = 0; dx < scale; dx++) {
            dstBuf32[dstRowOffset + dx] = pixel32;
          }
        }
      }
    }

    ctx.putImageData(dstImageData, 0, 0);
    return canvas;
  }

  global.PixPipeline = {
    detectPeripheralBackgroundColor,
    downsampleToGrid,
    removeGridBackground,
    cleanSpriteTopology,
    applyPixelOutline,
    runFullPipeline,
    createNearestNeighborCanvas
  };
})(window);
