/**
 * PIXFORGE // Studio Application Controller & Interactive Viewport Engine
 */
(function () {
  "use strict";

  const { rgbToHex, hexToRgb } = window.PixPalettes;
  const { runFullPipeline, createNearestNeighborCanvas } = window.PixPipeline;
  const { generateSample } = window.PixDemos;

  // Application State
  const state = {
    sourceImageData: null,
    sourceName: "cyber_knight",
    activeSample: "knight",

    grid: {
      size: 32,                 // 16, 32, 48, 64, 128
      samplingMode: "dominant", // "dominant", "median", "center", "sharp-avg"
      fitMode: "contain",       // "contain", "cover", "stretch"
      contrastBoost: 12,
      padBorder: true
    },

    bg: {
      enabled: true,
      mode: "flood",            // "flood" | "global"
      tolerance: 22,            // 0..100
      defringe: 45,             // 0..100
      useCustomColor: false,
      customColor: "#F1F5F9"
    },

    palette: {
      size: 16,                 // 2, 4, 8, 16, 32, "free"
      preset: "auto",           // "auto", "gameboy", "pico8", "sweetie16", "endesga16", "endesga32"
      ditherMode: "none",       // "none", "bayer2", "bayer4"
      ditherStrength: 18,
      colorOverrides: {}        // originalHex -> customHex
    },

    outline: {
      enabled: true,
      mode: "adaptive",         // "fixed" | "adaptive"
      fixedColor: "#000000",
      darkness: 68,             // 30..90 (%)
      cleanLCorners: true,
      removeOrphans: true
    },

    viewport: {
      zoom: 12,                 // Screen pixels per sprite pixel
      panX: 0,
      panY: 0,
      showGrid: true,
      compareMode: false,
      splitRatio: 0.5,
      backdrop: "checker-dark",
      activeTool: "pan",        // "pan" | "pencil" | "eraser" | "picker"
      drawColor: "#000000",
      hoverX: -1,
      hoverY: -1
    },

    exportScale: 8,             // 2, 4, 8, 16

    // Manual pixel overrides applied on top of pipeline output: key "x,y" -> [r,g,b,a]
    manualEdits: new Map(),

    // Latest processed output
    outputImageData: null,
    swatches: [],
    detectedBgHex: "#F1F5F9",
    opaqueCount: 0,
    elapsedMs: 0
  };

  // Offscreen canvases for fast rendering
  const spriteOffscreen = document.createElement("canvas");
  const sourceOffscreen = document.createElement("canvas");

  // DOM Elements cache
  const dom = {};

  function cacheDom() {
    const ids = [
      "dropzone", "fileInput", "headerUploadBtn", "resetBtn", "presetQuickSelect",
      "samplingModeSelect", "fitModeSelect", "contrastRange", "contrastVal",
      "bgToggle", "bgSubpanel", "bgModeSelect", "bgToleranceRange", "bgToleranceVal",
      "bgDefringeRange", "bgDefringeVal", "bgColorInput", "bgColorHex", "bgAutoResetBtn",
      "palPresetSelect", "ditherModeSelect",
      "outlineToggle", "outlineSubpanel", "outlineFixedRow", "outlineAdaptiveRow",
      "outlineColorInput", "outlineColorHex", "outlineDarknessRange", "outlineDarknessVal",
      "cleanLCornersCheck", "removeOrphansCheck",
      "drawColorInput", "clearEditsBtn",
      "zoomOutBtn", "zoomReadout", "zoomInBtn", "zoomFitBtn",
      "gridOverlayBtn", "compareSplitBtn", "backdropSelect",
      "canvasStage", "viewportCanvas",
      "hudCoords", "hudSwatch", "hudHex", "hudResolution", "hudOpaqueCount", "hudPerf",
      "origPreviewCanvas", "actualSizeCanvas",
      "paletteCountBadge", "resetSwatchesBtn", "paletteSwatchesGrid", "copyPaletteHexBtn",
      "nativeDimBadge", "exportNativeBtn", "scaledDimBadge", "exportScaledBtn",
      "toast"
    ];
    ids.forEach((id) => {
      dom[id] = document.getElementById(id);
    });
  }

  let toastTimer = null;
  function showToast(msg) {
    if (!dom.toast) return;
    dom.toast.textContent = msg;
    dom.toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      dom.toast.classList.remove("visible");
    }, 2200);
  }

  /**
   * Loads an ImageData object as the new source artwork and triggers full pipeline
   */
  function setSourceArtwork(imageData, name = "sprite") {
    state.sourceImageData = imageData;
    state.sourceName = name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_") || "sprite";
    state.palette.colorOverrides = {};
    state.manualEdits.clear();
    state.bg.useCustomColor = false;

    // Render source into offscreen canvas & mini original preview
    sourceOffscreen.width = imageData.width;
    sourceOffscreen.height = imageData.height;
    sourceOffscreen.getContext("2d").putImageData(imageData, 0, 0);

    const origCanvas = dom.origPreviewCanvas;
    origCanvas.width = imageData.width;
    origCanvas.height = imageData.height;
    const oCtx = origCanvas.getContext("2d");
    oCtx.putImageData(imageData, 0, 0);

    processPipeline(true);
  }

  /**
   * Loads an uploaded File or Blob into ImageData
   */
  function loadFileImage(file) {
    if (!file || !file.type.startsWith("image/")) {
      showToast("Formato no válido. Usa PNG, JPG o WebP.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        // Cap internal processing buffer to max 1024px on longest side for instant real-time speed
        const maxDim = 1024;
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (w > maxDim || h > maxDim) {
          if (w >= h) {
            h = Math.max(1, Math.round((h * maxDim) / w));
            w = maxDim;
          } else {
            w = Math.max(1, Math.round((w * maxDim) / h));
            h = maxDim;
          }
        }
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tCtx = tempCanvas.getContext("2d");
        tCtx.drawImage(img, 0, 0, w, h);
        const imgData = tCtx.getImageData(0, 0, w, h);

        state.activeSample = null;
        document.querySelectorAll(".sample-btn").forEach((b) => b.classList.remove("active"));
        setSourceArtwork(imgData, file.name);
        showToast(`Imagen cargada: ${img.naturalWidth}×${img.naturalHeight} px`);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  /**
   * Runs the full Pixel Art conversion pipeline and updates UI & Viewport
   */
  function processPipeline(autoFit = false) {
    if (!state.sourceImageData) return;

    const result = runFullPipeline(state.sourceImageData, state);
    const outData = result.imageData;

    // Apply any manual pixel touch-ups on top of pipeline output
    if (state.manualEdits.size > 0) {
      const w = outData.width;
      const h = outData.height;
      const d = outData.data;
      state.manualEdits.forEach((rgba, key) => {
        const [xStr, yStr] = key.split(",");
        const x = Number(xStr);
        const y = Number(yStr);
        if (x >= 0 && x < w && y >= 0 && y < h) {
          const idx = (y * w + x) * 4;
          d[idx] = rgba[0];
          d[idx + 1] = rgba[1];
          d[idx + 2] = rgba[2];
          d[idx + 3] = rgba[3];
        }
      });
    }

    state.outputImageData = outData;
    state.swatches = result.swatches;
    state.detectedBgHex = result.detectedBgHex;
    state.opaqueCount = result.opaqueCount;
    state.elapsedMs = result.elapsedMs;

    // Update offscreen sprite canvas
    spriteOffscreen.width = outData.width;
    spriteOffscreen.height = outData.height;
    const sCtx = spriteOffscreen.getContext("2d");
    sCtx.imageSmoothingEnabled = false;
    sCtx.putImageData(outData, 0, 0);

    // Update 1:1 / mini preview canvas
    const actualCanvas = dom.actualSizeCanvas;
    actualCanvas.width = outData.width;
    actualCanvas.height = outData.height;
    const aCtx = actualCanvas.getContext("2d");
    aCtx.imageSmoothingEnabled = false;
    aCtx.putImageData(outData, 0, 0);

    // Update detected background color UI
    if (!state.bg.useCustomColor) {
      dom.bgColorInput.value = result.detectedBgHex;
      dom.bgColorHex.textContent = result.alreadyTransparent ? "ALFA 0" : result.detectedBgHex;
    } else {
      dom.bgColorHex.textContent = state.bg.customColor.toUpperCase();
    }

    updateHudAndBadges();
    renderPaletteSwatches();

    if (autoFit) {
      fitCanvasToStage();
    } else {
      renderViewport();
    }
  }

  /**
   * Computes optimal integer zoom level to fit the sprite cleanly inside the stage
   */
  function fitCanvasToStage() {
    const stageRect = dom.canvasStage.getBoundingClientRect();
    const gridSize = state.grid.size;
    const avail = Math.min(stageRect.width, stageRect.height) - 64;
    const idealZoom = Math.max(2, Math.min(36, Math.floor(avail / gridSize)));
    state.viewport.zoom = idealZoom;
    state.viewport.panX = 0;
    state.viewport.panY = 0;
    updateZoomReadout();
    renderViewport();
  }

  function updateZoomReadout() {
    const pct = Math.round(state.viewport.zoom * 100);
    dom.zoomReadout.textContent = `${state.viewport.zoom}x (${pct}%)`;
  }

  /**
   * Renders the interactive center canvas with crisp Nearest-Neighbor scaling,
   * optional split comparison with the original artwork, 1px screen-space pixel grid,
   * and hover pixel cursor box.
   */
  function renderViewport() {
    const canvas = dom.viewportCanvas;
    const stageRect = dom.canvasStage.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const viewW = Math.max(100, Math.floor(stageRect.width));
    const viewH = Math.max(100, Math.floor(stageRect.height));

    if (canvas.width !== viewW * dpr || canvas.height !== viewH * dpr) {
      canvas.width = viewW * dpr;
      canvas.height = viewH * dpr;
      canvas.style.width = `${viewW}px`;
      canvas.style.height = `${viewH}px`;
    }

    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, viewW, viewH);

    if (!state.outputImageData) {
      ctx.restore();
      return;
    }

    const gridSize = state.grid.size;
    const zoom = state.viewport.zoom;
    const drawW = gridSize * zoom;
    const drawH = gridSize * zoom;

    const originX = Math.floor((viewW - drawW) / 2 + state.viewport.panX);
    const originY = Math.floor((viewH - drawH) / 2 + state.viewport.panY);

    // Draw subtle outer bounding frame around sprite canvas
    ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(originX - 0.5, originY - 0.5, drawW + 1, drawH + 1);

    // Render crisp Pixel Art Sprite
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(spriteOffscreen, originX, originY, drawW, drawH);

    // Optional Split Comparison Overlay (Left side shows original source image)
    if (state.viewport.compareMode) {
      const splitX = originX + Math.floor(drawW * state.viewport.splitRatio);
      ctx.save();
      ctx.beginPath();
      ctx.rect(originX, originY, splitX - originX, drawH);
      ctx.clip();

      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(sourceOffscreen, originX, originY, drawW, drawH);
      ctx.restore();

      // Draw split divider line & handle
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(splitX, originY - 8);
      ctx.lineTo(splitX, originY + drawH + 8);
      ctx.stroke();

      ctx.fillStyle = "#0d0f14";
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(splitX, originY + drawH / 2, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("↔", splitX, originY + drawH / 2);
    }

    // Render crisp 1px screen-space Pixel Grid Overlay when enabled and zoom >= 4
    if (state.viewport.showGrid && zoom >= 4) {
      ctx.beginPath();
      ctx.strokeStyle =
        zoom >= 8 ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1;

      for (let x = 1; x < gridSize; x++) {
        const px = originX + x * zoom + 0.5;
        ctx.moveTo(px, originY);
        ctx.lineTo(px, originY + drawH);
      }
      for (let y = 1; y < gridSize; y++) {
        const py = originY + y * zoom + 0.5;
        ctx.moveTo(originX, py);
        ctx.lineTo(originX + drawW, py);
      }
      ctx.stroke();

      // Center quadrant guide lines (subtle cyan)
      ctx.beginPath();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.22)";
      const midX = originX + (gridSize >> 1) * zoom + 0.5;
      const midY = originY + (gridSize >> 1) * zoom + 0.5;
      ctx.moveTo(midX, originY);
      ctx.lineTo(midX, originY + drawH);
      ctx.moveTo(originX, midY);
      ctx.lineTo(originX + drawW, midY);
      ctx.stroke();
    }

    // Highlight hovered cell
    const hx = state.viewport.hoverX;
    const hy = state.viewport.hoverY;
    if (hx >= 0 && hx < gridSize && hy >= 0 && hy < gridSize) {
      const cellX = originX + hx * zoom;
      const cellY = originY + hy * zoom;
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cellX + 0.5, cellY + 0.5, zoom - 1, zoom - 1);
    }

    ctx.restore();
  }

  /**
   * Converts mouse client coordinates to sprite grid coordinates (gx, gy)
   */
  function clientToGridCoords(clientX, clientY) {
    const rect = dom.viewportCanvas.getBoundingClientRect();
    const viewW = rect.width;
    const viewH = rect.height;
    const gridSize = state.grid.size;
    const zoom = state.viewport.zoom;
    const drawW = gridSize * zoom;
    const drawH = gridSize * zoom;

    const originX = Math.floor((viewW - drawW) / 2 + state.viewport.panX);
    const originY = Math.floor((viewH - drawH) / 2 + state.viewport.panY);

    const relX = clientX - rect.left - originX;
    const relY = clientY - rect.top - originY;

    const gx = Math.floor(relX / zoom);
    const gy = Math.floor(relY / zoom);

    return {
      gx,
      gy,
      inBounds: gx >= 0 && gx < gridSize && gy >= 0 && gy < gridSize,
      normX: Math.max(0.05, Math.min(0.95, relX / drawW))
    };
  }

  /**
   * Renders the interactive color swatches in the Right Sidebar
   */
  function renderPaletteSwatches() {
    const container = dom.paletteSwatchesGrid;
    container.innerHTML = "";
    const swatches = state.swatches;

    dom.paletteCountBadge.textContent = `${swatches.length} ${
      swatches.length === 1 ? "color" : "colores"
    }`;

    const hasOverrides = Object.keys(state.palette.colorOverrides).length > 0;
    dom.resetSwatchesBtn.style.display = hasOverrides ? "inline-flex" : "none";

    swatches.forEach((s) => {
      const item = document.createElement("div");
      item.className = "swatch-item";
      item.style.backgroundColor = s.hex;
      item.title = `${s.hex} (${s.count} px) — Clic para editar color en vivo`;

      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.value = s.hex;
      colorInput.addEventListener("input", (e) => {
        const newHex = e.target.value.toUpperCase();
        state.palette.colorOverrides[s.hex] = newHex;
        state.viewport.drawColor = newHex;
        dom.drawColorInput.value = newHex;
        processPipeline(false);
      });

      const tag = document.createElement("span");
      tag.className = "swatch-hex-tag";
      tag.textContent = s.hex.slice(1);

      item.appendChild(colorInput);
      item.appendChild(tag);
      container.appendChild(item);
    });
  }

  /**
   * Updates HUD metrics and Export resolution badges
   */
  function updateHudAndBadges() {
    const g = state.grid.size;
    dom.hudResolution.textContent = `${g} × ${g} px`;
    dom.hudOpaqueCount.textContent = `${state.opaqueCount} px opacos`;
    dom.hudPerf.textContent = `${state.elapsedMs} ms`;

    dom.nativeDimBadge.textContent = `${g} × ${g} px`;
    const scaled = g * state.exportScale;
    dom.scaledDimBadge.textContent = `${scaled} × ${scaled} px`;

    dom.clearEditsBtn.style.display =
      state.manualEdits.size > 0 ? "inline-flex" : "none";
  }

  /**
   * Applies a manual pixel edit (Pencil, Eraser, or Eyedropper) at (gx, gy)
   */
  function applyToolAtGrid(gx, gy) {
    if (!state.outputImageData) return;
    const g = state.grid.size;
    if (gx < 0 || gx >= g || gy < 0 || gy >= g) return;

    const tool = state.viewport.activeTool;
    const key = `${gx},${gy}`;

    if (tool === "pencil") {
      const [r, gCol, b] = hexToRgb(state.viewport.drawColor);
      state.manualEdits.set(key, [r, gCol, b, 255]);
      processPipeline(false);
    } else if (tool === "eraser") {
      state.manualEdits.set(key, [0, 0, 0, 0]);
      processPipeline(false);
    } else if (tool === "picker") {
      const idx = (gy * g + gx) * 4;
      const d = state.outputImageData.data;
      if (d[idx + 3] > 0) {
        const pickedHex = rgbToHex(d[idx], d[idx + 1], d[idx + 2]);
        state.viewport.drawColor = pickedHex;
        dom.drawColorInput.value = pickedHex;
        showToast(`Color capturado: ${pickedHex}`);
      }
    }
  }

  /**
   * Triggers browser download of a canvas as a PNG file
   */
  function downloadCanvasAsPng(canvas, filename) {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  }

  /**
   * Applies Quick Studio Preset Configurations
   */
  function applyQuickPreset(presetKey) {
    state.palette.colorOverrides = {};
    switch (presetKey) {
      case "nes":
        state.grid.size = 32;
        state.palette.size = 4;
        state.palette.preset = "auto";
        state.palette.ditherMode = "none";
        state.outline.enabled = true;
        state.outline.mode = "fixed";
        state.outline.fixedColor = "#000000";
        break;
      case "gameboy":
        state.grid.size = 32;
        state.palette.size = 4;
        state.palette.preset = "gameboy";
        state.palette.ditherMode = "bayer2";
        state.outline.enabled = true;
        state.outline.mode = "adaptive";
        state.outline.darkness = 75;
        break;
      case "pico8":
        state.grid.size = 16;
        state.palette.size = 16;
        state.palette.preset = "pico8";
        state.palette.ditherMode = "none";
        state.outline.enabled = true;
        state.outline.mode = "fixed";
        state.outline.fixedColor = "#000000";
        break;
      case "hdsprite":
        state.grid.size = 64;
        state.palette.size = 32;
        state.palette.preset = "auto";
        state.palette.ditherMode = "none";
        state.outline.enabled = true;
        state.outline.mode = "adaptive";
        state.outline.darkness = 65;
        break;
      case "snes16":
      default:
        state.grid.size = 32;
        state.palette.size = 16;
        state.palette.preset = "auto";
        state.palette.ditherMode = "none";
        state.outline.enabled = true;
        state.outline.mode = "adaptive";
        state.outline.darkness = 68;
        break;
    }

    syncUiFromState();
    processPipeline(true);
  }

  /**
   * Synchronizes all DOM inputs and active button states with `state`
   */
  function syncUiFromState() {
    // Grid size buttons
    document.querySelectorAll(".grid-size-btn").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.size) === state.grid.size);
    });
    dom.samplingModeSelect.value = state.grid.samplingMode;
    dom.fitModeSelect.value = state.grid.fitMode;
    dom.contrastRange.value = state.grid.contrastBoost;
    dom.contrastVal.textContent = `${state.grid.contrastBoost}%`;

    // Background removal
    dom.bgToggle.checked = state.bg.enabled;
    dom.bgSubpanel.classList.toggle("disabled", !state.bg.enabled);
    dom.bgModeSelect.value = state.bg.mode;
    dom.bgToleranceRange.value = state.bg.tolerance;
    dom.bgToleranceVal.textContent = state.bg.tolerance;
    dom.bgDefringeRange.value = state.bg.defringe;
    dom.bgDefringeVal.textContent = `${state.bg.defringe}%`;

    // Palette
    document.querySelectorAll(".pal-size-btn").forEach((btn) => {
      const val = btn.dataset.colors === "free" ? "free" : Number(btn.dataset.colors);
      btn.classList.toggle("active", val === state.palette.size);
    });
    dom.palPresetSelect.value = state.palette.preset;
    dom.ditherModeSelect.value = state.palette.ditherMode;

    // Outline
    dom.outlineToggle.checked = state.outline.enabled;
    dom.outlineSubpanel.classList.toggle("disabled", !state.outline.enabled);
    document.querySelectorAll(".outline-mode-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === state.outline.mode);
    });
    dom.outlineFixedRow.style.display = state.outline.mode === "fixed" ? "flex" : "none";
    dom.outlineAdaptiveRow.style.display = state.outline.mode === "adaptive" ? "flex" : "none";
    dom.outlineColorInput.value = state.outline.fixedColor;
    dom.outlineColorHex.textContent = state.outline.fixedColor.toUpperCase();
    dom.outlineDarknessRange.value = state.outline.darkness;
    dom.outlineDarknessVal.textContent = `${state.outline.darkness}%`;
    dom.cleanLCornersCheck.checked = state.outline.cleanLCorners;
    dom.removeOrphansCheck.checked = state.outline.removeOrphans;

    // Viewport toolbar
    dom.gridOverlayBtn.classList.toggle("active", state.viewport.showGrid);
    dom.compareSplitBtn.classList.toggle("active", state.viewport.compareMode);
    dom.backdropSelect.value = state.viewport.backdrop;

    // Export scale buttons
    document.querySelectorAll(".export-scale-btn").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.scale) === state.exportScale);
    });
  }

  /**
   * Binds all DOM Event Listeners
   */
  function bindEvents() {
    // 1. File Upload & Drag-and-Drop
    dom.dropzone.addEventListener("click", () => dom.fileInput.click());
    dom.headerUploadBtn.addEventListener("click", () => dom.fileInput.click());

    dom.fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        loadFileImage(e.target.files[0]);
        e.target.value = "";
      }
    });

    const preventDefaults = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    ["dragenter", "dragover"].forEach((evName) => {
      window.addEventListener(evName, (e) => {
        preventDefaults(e);
        dom.dropzone.classList.add("drag-over");
      });
    });

    ["dragleave", "drop"].forEach((evName) => {
      window.addEventListener(evName, (e) => {
        preventDefaults(e);
        dom.dropzone.classList.remove("drag-over");
      });
    });

    window.addEventListener("drop", (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files[0]) {
        loadFileImage(dt.files[0]);
      }
    });

    // Global Clipboard Paste Support (Ctrl+V / Cmd+V)
    window.addEventListener("paste", (e) => {
      const items = (e.clipboardData || window.clipboardData).items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          loadFileImage(file);
          break;
        }
      }
    });

    // Sample Artwork Selector Pills
    document.querySelectorAll(".sample-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".sample-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const sampleKey = btn.dataset.sample;
        state.activeSample = sampleKey;
        const sampleData = generateSample(sampleKey);
        setSourceArtwork(sampleData, `sample_${sampleKey}`);
      });
    });

    // Quick Studio Presets
    dom.presetQuickSelect.addEventListener("change", (e) => {
      applyQuickPreset(e.target.value);
    });

    // Reset Pipeline Button
    dom.resetBtn.addEventListener("click", () => {
      state.bg.enabled = true;
      state.bg.mode = "flood";
      state.bg.tolerance = 22;
      state.bg.defringe = 45;
      state.bg.useCustomColor = false;
      state.grid.samplingMode = "dominant";
      state.grid.fitMode = "contain";
      state.grid.contrastBoost = 12;
      state.palette.colorOverrides = {};
      state.manualEdits.clear();
      dom.presetQuickSelect.value = "snes16";
      applyQuickPreset("snes16");
      showToast("Parámetros restaurados a valores óptimos.");
    });

    // 2. Grid Resolution & Sampling Controls
    document.querySelectorAll(".grid-size-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.grid.size = Number(btn.dataset.size);
        state.manualEdits.clear();
        syncUiFromState();
        processPipeline(true);
      });
    });

    dom.samplingModeSelect.addEventListener("change", (e) => {
      state.grid.samplingMode = e.target.value;
      processPipeline(false);
    });

    dom.fitModeSelect.addEventListener("change", (e) => {
      state.grid.fitMode = e.target.value;
      state.manualEdits.clear();
      processPipeline(false);
    });

    dom.contrastRange.addEventListener("input", (e) => {
      state.grid.contrastBoost = Number(e.target.value);
      dom.contrastVal.textContent = `${state.grid.contrastBoost}%`;
      processPipeline(false);
    });

    // 3. Background Transparency Controls
    dom.bgToggle.addEventListener("change", (e) => {
      state.bg.enabled = e.target.checked;
      dom.bgSubpanel.classList.toggle("disabled", !state.bg.enabled);
      processPipeline(false);
    });

    dom.bgModeSelect.addEventListener("change", (e) => {
      state.bg.mode = e.target.value;
      processPipeline(false);
    });

    dom.bgToleranceRange.addEventListener("input", (e) => {
      state.bg.tolerance = Number(e.target.value);
      dom.bgToleranceVal.textContent = state.bg.tolerance;
      processPipeline(false);
    });

    dom.bgDefringeRange.addEventListener("input", (e) => {
      state.bg.defringe = Number(e.target.value);
      dom.bgDefringeVal.textContent = `${state.bg.defringe}%`;
      processPipeline(false);
    });

    dom.bgColorInput.addEventListener("input", (e) => {
      state.bg.useCustomColor = true;
      state.bg.customColor = e.target.value.toUpperCase();
      dom.bgColorHex.textContent = state.bg.customColor;
      processPipeline(false);
    });

    dom.bgAutoResetBtn.addEventListener("click", () => {
      state.bg.useCustomColor = false;
      processPipeline(false);
      showToast("Fondo periférico autodetectado.");
    });

    // 4. Palette & Quantization Controls
    document.querySelectorAll(".pal-size-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const raw = btn.dataset.colors;
        state.palette.size = raw === "free" ? "free" : Number(raw);
        state.palette.colorOverrides = {};
        syncUiFromState();
        processPipeline(false);
      });
    });

    dom.palPresetSelect.addEventListener("change", (e) => {
      state.palette.preset = e.target.value;
      state.palette.colorOverrides = {};
      processPipeline(false);
    });

    dom.ditherModeSelect.addEventListener("change", (e) => {
      state.palette.ditherMode = e.target.value;
      processPipeline(false);
    });

    dom.resetSwatchesBtn.addEventListener("click", () => {
      state.palette.colorOverrides = {};
      processPipeline(false);
      showToast("Colores de paleta restaurados.");
    });

    dom.copyPaletteHexBtn.addEventListener("click", () => {
      const hexList = state.swatches.map((s) => s.hex).join(", ");
      if (navigator.clipboard && hexList) {
        navigator.clipboard.writeText(hexList);
        showToast(`Paleta copiada (${state.swatches.length} colores HEX)`);
      }
    });

    // 5. Pixel Outline Controls
    dom.outlineToggle.addEventListener("change", (e) => {
      state.outline.enabled = e.target.checked;
      dom.outlineSubpanel.classList.toggle("disabled", !state.outline.enabled);
      processPipeline(false);
    });

    document.querySelectorAll(".outline-mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.outline.mode = btn.dataset.mode;
        syncUiFromState();
        processPipeline(false);
      });
    });

    dom.outlineColorInput.addEventListener("input", (e) => {
      state.outline.fixedColor = e.target.value.toUpperCase();
      dom.outlineColorHex.textContent = state.outline.fixedColor;
      processPipeline(false);
    });

    dom.outlineDarknessRange.addEventListener("input", (e) => {
      state.outline.darkness = Number(e.target.value);
      dom.outlineDarknessVal.textContent = `${state.outline.darkness}%`;
      processPipeline(false);
    });

    dom.cleanLCornersCheck.addEventListener("change", (e) => {
      state.outline.cleanLCorners = e.target.checked;
      processPipeline(false);
    });

    dom.removeOrphansCheck.addEventListener("change", (e) => {
      state.outline.removeOrphans = e.target.checked;
      processPipeline(false);
    });

    // 6. Viewport Toolbar & Interactive Canvas Controls
    document.querySelectorAll(".canvas-tool-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".canvas-tool-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.viewport.activeTool = btn.dataset.tool;
        dom.canvasStage.classList.toggle("tool-draw", state.viewport.activeTool !== "pan");
      });
    });

    dom.drawColorInput.addEventListener("input", (e) => {
      state.viewport.drawColor = e.target.value.toUpperCase();
    });

    dom.clearEditsBtn.addEventListener("click", () => {
      state.manualEdits.clear();
      processPipeline(false);
      showToast("Retoques manuales descartados.");
    });

    dom.zoomInBtn.addEventListener("click", () => {
      state.viewport.zoom = Math.min(48, state.viewport.zoom + Math.max(1, Math.floor(state.viewport.zoom * 0.25)));
      updateZoomReadout();
      renderViewport();
    });

    dom.zoomOutBtn.addEventListener("click", () => {
      state.viewport.zoom = Math.max(1, state.viewport.zoom - Math.max(1, Math.floor(state.viewport.zoom * 0.25)));
      updateZoomReadout();
      renderViewport();
    });

    dom.zoomFitBtn.addEventListener("click", () => {
      fitCanvasToStage();
    });

    dom.gridOverlayBtn.addEventListener("click", () => {
      state.viewport.showGrid = !state.viewport.showGrid;
      dom.gridOverlayBtn.classList.toggle("active", state.viewport.showGrid);
      renderViewport();
    });

    dom.compareSplitBtn.addEventListener("click", () => {
      state.viewport.compareMode = !state.viewport.compareMode;
      dom.compareSplitBtn.classList.toggle("active", state.viewport.compareMode);
      renderViewport();
    });

    dom.backdropSelect.addEventListener("change", (e) => {
      const val = e.target.value;
      state.viewport.backdrop = val;
      dom.canvasStage.className = `canvas-stage backdrop-${val}`;
      if (state.viewport.activeTool !== "pan") {
        dom.canvasStage.classList.add("tool-draw");
      }
    });

    // Interactive Canvas Mouse Pan / Zoom / Split Drag / Pixel Edit
    let isDragging = false;
    let isDraggingSplit = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let startPanX = 0;
    let startPanY = 0;

    dom.canvasStage.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 1 : -1;
        const step = Math.max(1, Math.floor(state.viewport.zoom * 0.15));
        const nextZoom = Math.max(1, Math.min(48, state.viewport.zoom + delta * step));
        if (nextZoom !== state.viewport.zoom) {
          state.viewport.zoom = nextZoom;
          updateZoomReadout();
          renderViewport();
        }
      },
      { passive: false }
    );

    dom.canvasStage.addEventListener("mousedown", (e) => {
      const coords = clientToGridCoords(e.clientX, e.clientY);

      // Check if grabbing the split-view divider handle
      if (state.viewport.compareMode && Math.abs(coords.normX - state.viewport.splitRatio) < 0.06) {
        isDraggingSplit = true;
        return;
      }

      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      startPanX = state.viewport.panX;
      startPanY = state.viewport.panY;

      if (state.viewport.activeTool !== "pan" && e.button === 0) {
        applyToolAtGrid(coords.gx, coords.gy);
      }
    });

    window.addEventListener("mousemove", (e) => {
      const coords = clientToGridCoords(e.clientX, e.clientY);

      if (isDraggingSplit) {
        state.viewport.splitRatio = coords.normX;
        renderViewport();
        return;
      }

      if (isDragging) {
        if (state.viewport.activeTool === "pan" || e.buttons === 4) {
          state.viewport.panX = startPanX + (e.clientX - dragStartX);
          state.viewport.panY = startPanY + (e.clientY - dragStartY);
          renderViewport();
        } else if (coords.inBounds) {
          applyToolAtGrid(coords.gx, coords.gy);
        }
      }

      // Update hover coordinates & pixel inspector HUD
      if (coords.inBounds && state.outputImageData) {
        if (state.viewport.hoverX !== coords.gx || state.viewport.hoverY !== coords.gy) {
          state.viewport.hoverX = coords.gx;
          state.viewport.hoverY = coords.gy;
          renderViewport();
        }
        dom.hudCoords.textContent = `X: ${coords.gx}, Y: ${coords.gy}`;
        const idx = (coords.gy * state.grid.size + coords.gx) * 4;
        const d = state.outputImageData.data;
        if (d[idx + 3] === 0) {
          dom.hudSwatch.style.background = "transparent";
          dom.hudHex.textContent = "TRANSPARENTE";
        } else {
          const hex = rgbToHex(d[idx], d[idx + 1], d[idx + 2]);
          dom.hudSwatch.style.background = hex;
          dom.hudHex.textContent = hex;
        }
      } else if (state.viewport.hoverX !== -1) {
        state.viewport.hoverX = -1;
        state.viewport.hoverY = -1;
        dom.hudCoords.textContent = "X: --, Y: --";
        renderViewport();
      }
    });

    window.addEventListener("mouseup", () => {
      isDragging = false;
      isDraggingSplit = false;
    });

    window.addEventListener("resize", () => {
      renderViewport();
    });

    // 7. PNG Export Controls (1x Native & Integer Scaled Nearest-Neighbor)
    dom.exportNativeBtn.addEventListener("click", () => {
      if (!state.outputImageData) return;
      const g = state.grid.size;
      const canvas = createNearestNeighborCanvas(state.outputImageData, 1);
      const filename = `${state.sourceName}_${g}x${g}_1x.png`;
      downloadCanvasAsPng(canvas, filename);
      showToast(`Exportado: ${filename} (${g}×${g} px)`);
    });

    document.querySelectorAll(".export-scale-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.exportScale = Number(btn.dataset.scale);
        syncUiFromState();
        updateHudAndBadges();
      });
    });

    dom.exportScaledBtn.addEventListener("click", () => {
      if (!state.outputImageData) return;
      const scale = state.exportScale;
      const g = state.grid.size;
      const dim = g * scale;
      const canvas = createNearestNeighborCanvas(state.outputImageData, scale);
      const filename = `${state.sourceName}_${dim}x${dim}_${scale}x.png`;
      downloadCanvasAsPng(canvas, filename);
      showToast(`Exportado: ${filename} (${dim}×${dim} px Nearest-Neighbor)`);
    });
  }

  // Initialize Application on DOM Ready
  function init() {
    cacheDom();
    bindEvents();
    syncUiFromState();

    // Load default procedural high-res artwork so the user sees immediate live results
    const initialArtwork = generateSample("knight");
    setSourceArtwork(initialArtwork, "cyber_knight");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
