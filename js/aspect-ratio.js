/**
 * DanoloTools - Aspect Ratio Calculator & Image Analyzer
 */

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const presetSelect = document.getElementById('presetSelect');
  const ratioWidthInput = document.getElementById('ratioWidth');
  const ratioHeightInput = document.getElementById('ratioHeight');
  const pixelWidthInput = document.getElementById('pixelWidth');
  const pixelHeightInput = document.getElementById('pixelHeight');
  const btnSwap = document.getElementById('btnSwap');
  const btnRoundEven = document.getElementById('btnRoundEven');
  const visualizerStage = document.getElementById('visualizerStage');
  const shapeBox = document.getElementById('shapeBox');
  const shapeRatioText = document.getElementById('shapeRatioText');
  const shapePxText = document.getElementById('shapePxText');

  // Metric readouts
  const metricRatio = document.getElementById('metricRatio');
  const metricDecimal = document.getElementById('metricDecimal');
  const metricOrientation = document.getElementById('metricOrientation');
  const metricMegapixels = document.getElementById('metricMegapixels');

  // Copy buttons
  const btnCopyDimensions = document.getElementById('btnCopyDimensions');
  const btnCopyCSS = document.getElementById('btnCopyCSS');

  // Image Upload & Analyzer Elements
  const imageDropzone = document.getElementById('imageDropzone');
  const imageInput = document.getElementById('imageInput');
  const dropzonePrompt = document.getElementById('dropzonePrompt');
  const dropzonePreview = document.getElementById('dropzonePreview');
  const previewImg = document.getElementById('previewImg');
  const previewFileName = document.getElementById('previewFileName');
  const previewBadgeRatio = document.getElementById('previewBadgeRatio');
  const previewDim = document.getElementById('previewDim');
  const btnRemoveImage = document.getElementById('btnRemoveImage');

  // Active object URL for loaded image
  let currentImageObjectUrl = null;

  // Standard aspect ratio presets for smart detection
  const STANDARD_PRESETS = [
    { w: 1, h: 1, label: '1:1' },
    { w: 16, h: 9, label: '16:9' },
    { w: 9, h: 16, label: '9:16' },
    { w: 4, h: 5, label: '4:5' },
    { w: 5, h: 4, label: '5:4' },
    { w: 4, h: 3, label: '4:3' },
    { w: 3, h: 4, label: '3:4' },
    { w: 3, h: 2, label: '3:2' },
    { w: 2, h: 3, label: '2:3' },
    { w: 21, h: 9, label: '21:9' },
    { w: 9, h: 21, label: '9:21' },
    { w: 16, h: 10, label: '16:10' },
    { w: 10, h: 16, label: '10:16' },
    { w: 5, h: 3, label: '5:3' },
    { w: 3, h: 5, label: '3:5' },
    { w: 18, h: 9, label: '18:9' },
    { w: 9, h: 18, label: '9:18' }
  ];

  // GCD helper for simplifying ratios
  function getGcd(a, b) {
    a = Math.abs(Math.round(a));
    b = Math.abs(Math.round(b));
    while (b) {
      const temp = b;
      b = a % b;
      a = temp;
    }
    return a;
  }

  // Fraction approximation for ratios without clean whole-number GCDs
  function approximateFraction(w, h, maxDenom = 64) {
    const target = w / h;
    let bestW = Math.round(target);
    let bestH = 1;
    let bestErr = Math.abs(target - bestW / bestH);

    for (let denom = 1; denom <= maxDenom; denom++) {
      const numer = Math.round(target * denom);
      const err = Math.abs(target - numer / denom);
      if (err < bestErr) {
        bestErr = err;
        bestW = numer;
        bestH = denom;
        if (err < 0.0001) break;
      }
    }
    const g = getGcd(bestW, bestH);
    return { w: bestW / g, h: bestH / g };
  }

  // Intelligent Aspect Ratio Analysis
  function analyzeAspectRatio(w, h) {
    const gcd = getGcd(w, h);
    const simpW = w / gcd;
    const simpH = h / gcd;
    const factor = w / h;

    // Check closest standard preset
    let closestPreset = null;
    let minDiff = Infinity;

    for (const preset of STANDARD_PRESETS) {
      const presetFactor = preset.w / preset.h;
      const diff = Math.abs(factor - presetFactor) / factor;
      if (diff < minDiff) {
        minDiff = diff;
        closestPreset = preset;
      }
    }

    const isClose = closestPreset && (minDiff < 0.008); // < 0.8% variance
    let displayW = simpW;
    let displayH = simpH;
    let matchLabel = `${simpW}:${simpH}`;

    if (simpW <= 64 && simpH <= 64) {
      displayW = simpW;
      displayH = simpH;
      matchLabel = `${simpW}:${simpH}`;
    } else if (isClose) {
      displayW = closestPreset.w;
      displayH = closestPreset.h;
      matchLabel = closestPreset.label;
    } else {
      const approx = approximateFraction(w, h, 64);
      displayW = approx.w;
      displayH = approx.h;
      matchLabel = `${approx.w}:${approx.h}`;
    }

    return {
      w,
      h,
      gcd,
      simpW,
      simpH,
      displayRatioW: displayW,
      displayRatioH: displayH,
      matchLabel,
      closestPreset: closestPreset ? closestPreset.label : null,
      factor
    };
  }

  // Calculate and update everything
  function updateCalculator(triggerSource = 'none') {
    let rW = parseFloat(ratioWidthInput.value) || 1;
    let rH = parseFloat(ratioHeightInput.value) || 1;
    let pW = parseFloat(pixelWidthInput.value) || 0;
    let pH = parseFloat(pixelHeightInput.value) || 0;

    // Prevent divide by 0
    if (rW <= 0) rW = 1;
    if (rH <= 0) rH = 1;

    // Recalculate pixels if needed
    if (triggerSource === 'ratio' || triggerSource === 'pixelWidth' || triggerSource === 'preset' || triggerSource === 'swap') {
      if (pW > 0) {
        pH = Math.round((pW * (rH / rW)) * 100) / 100;
        pixelHeightInput.value = formatNumber(pH);
      }
    } else if (triggerSource === 'pixelHeight') {
      if (pH > 0) {
        pW = Math.round((pH * (rW / rH)) * 100) / 100;
        pixelWidthInput.value = formatNumber(pW);
      }
    }

    // Check matching preset
    syncPresetDropdown(rW, rH);

    // Update Live Shape Visualizer
    updateVisualizer(rW, rH, pW, pH);

    // Update Summary Metrics
    updateMetrics(rW, rH, pW, pH);
  }

  // Format decimal number for input display
  function formatNumber(num) {
    if (Number.isInteger(num)) return num;
    return parseFloat(num.toFixed(2));
  }

  // Sync preset dropdown
  function syncPresetDropdown(w, h) {
    const currentVal = `${w}:${h}`;
    let matched = false;
    for (let i = 0; i < presetSelect.options.length; i++) {
      if (presetSelect.options[i].value === currentVal) {
        presetSelect.selectedIndex = i;
        matched = true;
        break;
      }
    }
    if (!matched) {
      presetSelect.value = 'custom';
    }
  }

  // Visualizer sizing & text
  function updateVisualizer(rW, rH, pW, pH) {
    if (!visualizerStage || !shapeBox) return;

    const stageRect = visualizerStage.getBoundingClientRect();
    const pad = 48; // padding inside stage
    const maxW = Math.max(stageRect.width - pad, 120);
    const maxH = Math.max(stageRect.height - pad, 120);

    const ratio = rW / rH;
    let targetW, targetH;

    if (maxW / maxH > ratio) {
      // Height is the limiting factor
      targetH = maxH;
      targetW = maxH * ratio;
    } else {
      // Width is the limiting factor
      targetW = maxW;
      targetH = maxW / ratio;
    }

    // Apply dimensions to visualizer box
    shapeBox.style.width = `${Math.round(targetW)}px`;
    shapeBox.style.height = `${Math.round(targetH)}px`;

    // Decimal ratio: (w/h : 1)
    const decimal = (rW / rH).toFixed(2);
    shapeRatioText.textContent = `${rW}:${rH} (${decimal}:1)`;

    // Pixel dimensions readout
    const displayW = Math.round(pW);
    const displayH = Math.round(pH);
    shapePxText.textContent = `${displayW} × ${displayH} px`;
  }

  // Metrics readout
  function updateMetrics(rW, rH, pW, pH) {
    if (metricRatio) {
      metricRatio.textContent = `${rW}:${rH}`;
    }
    if (metricDecimal) {
      metricDecimal.textContent = `${(rW / rH).toFixed(3)}:1`;
    }
    if (metricOrientation) {
      if (rW > rH) {
        metricOrientation.textContent = 'Horizontal (Landscape)';
      } else if (rH > rW) {
        metricOrientation.textContent = 'Vertical (Portrait)';
      } else {
        metricOrientation.textContent = 'Cuadrado (1:1)';
      }
    }
    if (metricMegapixels) {
      const mp = ((pW * pH) / 1000000).toFixed(2);
      metricMegapixels.textContent = `${mp} MP`;
    }
  }

  // Process and analyze an image file
  function processImageFile(file) {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Selecciona un archivo de imagen válido');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;

      if (!width || !height) {
        showToast('No se pudieron leer las dimensiones de la imagen');
        URL.revokeObjectURL(objectUrl);
        return;
      }

      // Cleanup prior URL if exists
      if (currentImageObjectUrl) {
        URL.revokeObjectURL(currentImageObjectUrl);
      }
      currentImageObjectUrl = objectUrl;

      // Analyze aspect ratio
      const analysis = analyzeAspectRatio(width, height);

      // Populate input values
      pixelWidthInput.value = width;
      pixelHeightInput.value = height;
      ratioWidthInput.value = analysis.displayRatioW;
      ratioHeightInput.value = analysis.displayRatioH;

      // Update dropzone UI
      if (previewImg) previewImg.src = objectUrl;
      if (previewFileName) previewFileName.textContent = file.name || 'imagen_analizada.png';
      if (previewBadgeRatio) previewBadgeRatio.textContent = analysis.matchLabel;
      if (previewDim) previewDim.textContent = `${width} × ${height} px`;

      if (dropzonePrompt) dropzonePrompt.style.display = 'none';
      if (dropzonePreview) dropzonePreview.style.display = 'flex';

      // Update Shape Visualizer with uploaded image background
      shapeBox.classList.add('has-image');
      shapeBox.style.backgroundImage = `url("${objectUrl}")`;

      // Recalculate
      updateCalculator('image');

      showToast(`Imagen analizada: ${width}×${height} (${analysis.matchLabel})`);
    };

    img.onerror = () => {
      showToast('Error al cargar la imagen');
      URL.revokeObjectURL(objectUrl);
    };

    img.src = objectUrl;
  }

  // Clear loaded image and reset state
  function clearImage() {
    if (currentImageObjectUrl) {
      URL.revokeObjectURL(currentImageObjectUrl);
      currentImageObjectUrl = null;
    }

    if (imageInput) imageInput.value = '';
    if (previewImg) previewImg.src = '';
    if (dropzonePrompt) dropzonePrompt.style.display = 'flex';
    if (dropzonePreview) dropzonePreview.style.display = 'none';

    if (shapeBox) {
      shapeBox.classList.remove('has-image');
      shapeBox.style.backgroundImage = '';
    }

    showToast('Imagen quitada');
  }

  // Dropzone Click & Keyboard handling
  if (imageDropzone && imageInput) {
    imageDropzone.addEventListener('click', (e) => {
      // Prevent opening file picker if clicking remove button
      if (e.target.closest('#btnRemoveImage')) return;
      imageInput.click();
    });

    imageDropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        imageInput.click();
      }
    });

    imageInput.addEventListener('change', () => {
      if (imageInput.files && imageInput.files[0]) {
        processImageFile(imageInput.files[0]);
      }
    });
  }

  // Remove image button
  if (btnRemoveImage) {
    btnRemoveImage.addEventListener('click', (e) => {
      e.stopPropagation();
      clearImage();
    });
  }

  // Drag and drop setup for Dropzone and Visualizer Stage
  const dragTargets = [imageDropzone, visualizerStage].filter(Boolean);

  dragTargets.forEach((target) => {
    ['dragenter', 'dragover'].forEach((eventName) => {
      target.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        target.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      target.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        target.classList.remove('drag-over');
      });
    });

    target.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length > 0) {
        processImageFile(dt.files[0]);
      }
    });
  });

  // Global Paste (Ctrl+V / Cmd+V) to analyze copied images immediately
  document.addEventListener('paste', (e) => {
    // Avoid intercepting paste inside input fields
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      return;
    }

    if (e.clipboardData && e.clipboardData.items) {
      for (let i = 0; i < e.clipboardData.items.length; i++) {
        const item = e.clipboardData.items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            processImageFile(file);
            break;
          }
        }
      }
    }
  });

  // Event Listeners: Preset change
  presetSelect.addEventListener('change', () => {
    const val = presetSelect.value;
    if (val && val !== 'custom') {
      const parts = val.split(':');
      if (parts.length === 2) {
        ratioWidthInput.value = parts[0];
        ratioHeightInput.value = parts[1];
        updateCalculator('preset');
      }
    }
  });

  // Ratio inputs
  ratioWidthInput.addEventListener('input', () => updateCalculator('ratio'));
  ratioHeightInput.addEventListener('input', () => updateCalculator('ratio'));

  // Pixel inputs
  pixelWidthInput.addEventListener('input', () => updateCalculator('pixelWidth'));
  pixelHeightInput.addEventListener('input', () => updateCalculator('pixelHeight'));

  // Middle Swap Button: Invert Horizontal <-> Vertical
  btnSwap.addEventListener('click', () => {
    const currentRW = ratioWidthInput.value;
    const currentRH = ratioHeightInput.value;
    const currentPW = pixelWidthInput.value;
    const currentPH = pixelHeightInput.value;

    // Swap Ratio
    ratioWidthInput.value = currentRH;
    ratioHeightInput.value = currentRW;

    // Swap Pixels
    pixelWidthInput.value = currentPH;
    pixelHeightInput.value = currentPW;

    // Animate Swap Button
    btnSwap.classList.toggle('rotated');

    updateCalculator('swap');
    showToast(`Orientación cambiada a ${ratioWidthInput.value}:${ratioHeightInput.value}`);
  });

  // Quick Preset Chips (Resolutions)
  const chips = document.querySelectorAll('.chip-resolution');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const w = chip.getAttribute('data-w');
      const h = chip.getAttribute('data-h');
      const rw = chip.getAttribute('data-rw');
      const rh = chip.getAttribute('data-rh');

      if (rw && rh) {
        ratioWidthInput.value = rw;
        ratioHeightInput.value = rh;
      }
      if (w && h) {
        pixelWidthInput.value = w;
        pixelHeightInput.value = h;
      }
      updateCalculator('preset');
      showToast(`Preset aplicado: ${w}×${h}`);
    });
  });

  // Round to nearest even number button (critical for encoders)
  if (btnRoundEven) {
    btnRoundEven.addEventListener('click', () => {
      let pW = parseFloat(pixelWidthInput.value) || 0;
      let pH = parseFloat(pixelHeightInput.value) || 0;

      let evenW = Math.round(pW / 2) * 2;
      let evenH = Math.round(pH / 2) * 2;

      pixelWidthInput.value = evenW;
      pixelHeightInput.value = evenH;

      updateCalculator('pixelWidth');
      showToast(`Dimensiones ajustadas a pares: ${evenW}×${evenH}`);
    });
  }

  // Copy Buttons
  if (btnCopyDimensions) {
    btnCopyDimensions.addEventListener('click', () => {
      const pW = Math.round(parseFloat(pixelWidthInput.value) || 0);
      const pH = Math.round(parseFloat(pixelHeightInput.value) || 0);
      copyText(`${pW}x${pH}`, `Dimensiones copiadas: ${pW}×${pH}px`);
    });
  }

  if (btnCopyCSS) {
    btnCopyCSS.addEventListener('click', () => {
      const rW = ratioWidthInput.value;
      const rH = ratioHeightInput.value;
      const cssString = `aspect-ratio: ${rW} / ${rH};`;
      copyText(cssString, `CSS copiado: ${cssString}`);
    });
  }

  // Window resize observer to resize visualizer smoothly
  window.addEventListener('resize', () => {
    const rW = parseFloat(ratioWidthInput.value) || 1;
    const rH = parseFloat(ratioHeightInput.value) || 1;
    const pW = parseFloat(pixelWidthInput.value) || 0;
    const pH = parseFloat(pixelHeightInput.value) || 0;
    updateVisualizer(rW, rH, pW, pH);
  });

  // Initial Calculation (Default: Vertical Video 9:16 matching screenshot)
  updateCalculator('preset');
});
