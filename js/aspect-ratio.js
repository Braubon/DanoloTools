/**
 * DanoloTools - Aspect Ratio Calculator
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
    // Matching exact format from screenshot: "9:16 (0.56:1)"
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
