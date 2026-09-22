(() => {
  'use strict';

  const STORAGE = {
    theme: 'baselQr.theme',
    defaultEcc: 'baselQr.defaultEcc',
    defaultMargin: 'baselQr.defaultMargin',
    filename: 'baselQr.filename'
  };

  const defaults = {
    theme: localStorage.getItem(STORAGE.theme) || 'system',
    defaultEcc: localStorage.getItem(STORAGE.defaultEcc) || 'M',
    defaultMargin: clampNumber(localStorage.getItem(STORAGE.defaultMargin), 0, 16, 4),
    filename: sanitizeFilename(localStorage.getItem(STORAGE.filename) || 'basel-qr-code')
  };

  const els = {
    brandButton: byId('brandButton'),
    newButton: byId('newButton'),
    settingsButton: byId('settingsButton'),
    closeSettingsButton: byId('closeSettingsButton'),
    settingsBackdrop: byId('settingsBackdrop'),
    appearanceControl: byId('appearanceControl'),
    defaultEccControl: byId('defaultEccControl'),
    filenameInput: byId('filenameInput'),
    defaultMarginInput: byId('defaultMarginInput'),
    settingsStatus: byId('settingsStatus'),

    contentInput: byId('contentInput'),
    characterCount: byId('characterCount'),
    eccSelect: byId('eccSelect'),
    marginInput: byId('marginInput'),
    foregroundColor: byId('foregroundColor'),
    foregroundText: byId('foregroundText'),
    backgroundColor: byId('backgroundColor'),
    backgroundText: byId('backgroundText'),
    transparentToggle: byId('transparentToggle'),
    generateButton: byId('generateButton'),
    statusLine: byId('statusLine'),

    previewStage: byId('previewStage'),
    emptyPreview: byId('emptyPreview'),
    qrPreview: byId('qrPreview'),
    moduleBadge: byId('moduleBadge'),
    contrastValue: byId('contrastValue'),
    readinessHint: byId('readinessHint'),
    copyButton: byId('copyButton'),
    downloadButton: byId('downloadButton'),
    clipboardFallback: byId('clipboardFallback')
  };

  let currentSvg = '';
  let lastFocus = null;
  let generateTimer = null;

  // qrcode-generator 1.x uses a single-byte encoder by default. Override it
  // so normal browser text input is encoded as UTF-8 bytes.
  if (window.qrcode && window.TextEncoder) {
    window.qrcode.stringToBytes = value => Array.from(new TextEncoder().encode(value));
  }

  initialize();

  function initialize() {
    els.eccSelect.value = defaults.defaultEcc;
    els.marginInput.value = String(defaults.defaultMargin);
    els.defaultMarginInput.value = String(defaults.defaultMargin);
    els.filenameInput.value = defaults.filename;
    setActiveThemeChoice(defaults.theme);
    setActiveEccChoice(defaults.defaultEcc);
    applyTheme(defaults.theme);
    bindEvents();
    updateCharacterCount();
    updateColorState();
  }

  function bindEvents() {
    els.brandButton.addEventListener('click', resetWorkspace);
    els.newButton.addEventListener('click', resetWorkspace);
    els.generateButton.addEventListener('click', generateQr);
    els.copyButton.addEventListener('click', copySvg);
    els.downloadButton.addEventListener('click', downloadSvg);

    els.settingsButton.addEventListener('click', openSettings);
    els.closeSettingsButton.addEventListener('click', closeSettings);
    els.settingsBackdrop.addEventListener('mousedown', event => {
      if (event.target === els.settingsBackdrop) closeSettings();
    });

    els.contentInput.addEventListener('input', () => {
      updateCharacterCount();
      scheduleGenerate();
    });
    els.contentInput.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        generateQr();
      }
    });

    els.eccSelect.addEventListener('change', generateIfContent);
    els.marginInput.addEventListener('input', generateIfContent);
    els.transparentToggle.addEventListener('change', generateIfContent);

    bindColorPair(els.foregroundColor, els.foregroundText);
    bindColorPair(els.backgroundColor, els.backgroundText);

    els.appearanceControl.addEventListener('click', event => {
      const button = event.target.closest('[data-theme-choice]');
      if (!button) return;
      const choice = button.dataset.themeChoice;
      defaults.theme = choice;
      localStorage.setItem(STORAGE.theme, choice);
      setActiveThemeChoice(choice);
      applyTheme(choice);
      showSettingsStatus('Appearance saved.');
    });

    els.defaultEccControl.addEventListener('click', event => {
      const button = event.target.closest('[data-default-ecc]');
      if (!button) return;
      const value = button.dataset.defaultEcc;
      defaults.defaultEcc = value;
      localStorage.setItem(STORAGE.defaultEcc, value);
      setActiveEccChoice(value);
      showSettingsStatus('Default error correction saved.');
    });

    els.defaultMarginInput.addEventListener('change', () => {
      const value = clampNumber(els.defaultMarginInput.value, 0, 16, 4);
      els.defaultMarginInput.value = String(value);
      defaults.defaultMargin = value;
      localStorage.setItem(STORAGE.defaultMargin, String(value));
      showSettingsStatus('Default quiet zone saved.');
    });

    els.filenameInput.addEventListener('change', () => {
      const clean = sanitizeFilename(els.filenameInput.value || 'basel-qr-code');
      els.filenameInput.value = clean;
      defaults.filename = clean;
      localStorage.setItem(STORAGE.filename, clean);
      showSettingsStatus('Export name saved.');
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !els.settingsBackdrop.hidden) closeSettings();
    });

    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (defaults.theme === 'system') applyTheme('system');
    });
  }

  function bindColorPair(picker, text) {
    picker.addEventListener('input', () => {
      text.value = picker.value.toUpperCase();
      updateColorState();
      generateIfContent();
    });

    text.addEventListener('input', () => {
      const normalized = normalizeHex(text.value);
      if (normalized) {
        picker.value = normalized;
        text.classList.remove('invalid');
        updateColorState();
        generateIfContent();
      }
    });

    text.addEventListener('blur', () => {
      const normalized = normalizeHex(text.value);
      if (normalized) {
        text.value = normalized.toUpperCase();
        picker.value = normalized;
      } else {
        text.value = picker.value.toUpperCase();
      }
      updateColorState();
    });
  }

  function resetWorkspace() {
    clearTimeout(generateTimer);
    els.contentInput.value = '';
    els.eccSelect.value = defaults.defaultEcc;
    els.marginInput.value = String(defaults.defaultMargin);
    els.foregroundColor.value = '#000000';
    els.foregroundText.value = '#000000';
    els.backgroundColor.value = '#ffffff';
    els.backgroundText.value = '#FFFFFF';
    els.transparentToggle.checked = false;
    currentSvg = '';
    els.qrPreview.innerHTML = '';
    els.qrPreview.hidden = true;
    els.emptyPreview.hidden = false;
    els.moduleBadge.hidden = true;
    els.copyButton.disabled = true;
    els.downloadButton.disabled = true;
    els.previewStage.classList.remove('transparent-preview');
    els.readinessHint.textContent = 'Generate a QR code to enable export.';
    setStatus('');
    updateCharacterCount();
    updateColorState();
    els.contentInput.focus();
  }

  function scheduleGenerate() {
    clearTimeout(generateTimer);
    if (!els.contentInput.value.trim()) {
      clearGeneratedOutput();
      return;
    }
    generateTimer = setTimeout(generateQr, 220);
  }

  function generateIfContent() {
    if (els.contentInput.value.trim()) generateQr();
    updateColorState();
  }

  function generateQr() {
    clearTimeout(generateTimer);
    const value = els.contentInput.value;
    if (!value.trim()) {
      clearGeneratedOutput();
      setStatus('Enter content first.', 'error');
      els.contentInput.focus();
      return;
    }

    if (!window.qrcode) {
      setStatus('The QR library could not load. Check your internet connection and reload the page.', 'error');
      return;
    }

    const foreground = normalizeHex(els.foregroundText.value) || els.foregroundColor.value;
    const background = normalizeHex(els.backgroundText.value) || els.backgroundColor.value;
    const margin = clampNumber(els.marginInput.value, 0, 16, defaults.defaultMargin);
    els.marginInput.value = String(margin);

    try {
      const qr = window.qrcode(0, els.eccSelect.value);
      qr.addData(value, 'Byte');
      qr.make();

      currentSvg = buildSvg(qr, {
        margin,
        foreground,
        background,
        transparent: els.transparentToggle.checked
      });

      els.qrPreview.innerHTML = stripXmlDeclaration(currentSvg);
      els.qrPreview.hidden = false;
      els.emptyPreview.hidden = true;
      els.moduleBadge.textContent = `${qr.getModuleCount()} × ${qr.getModuleCount()}`;
      els.moduleBadge.hidden = false;
      els.copyButton.disabled = false;
      els.downloadButton.disabled = false;
      els.readinessHint.textContent = 'SVG ready. It can be scaled without losing sharpness.';
      els.previewStage.classList.toggle('transparent-preview', els.transparentToggle.checked);

      const ratio = contrastRatio(foreground, background);
      els.contrastValue.textContent = els.transparentToggle.checked
        ? 'Depends on placement'
        : ratio >= 7 ? 'High' : ratio >= 4.5 ? 'Good' : ratio >= 3 ? 'Low' : 'Very low';

      const warning = !els.transparentToggle.checked && ratio < 4.5
        ? ' Low foreground/background contrast may reduce scan reliability.'
        : '';
      setStatus(`QR generated. ${qr.getModuleCount()} modules per side.${warning}`, warning ? 'error' : 'success');
    } catch (error) {
      clearGeneratedOutput(false);
      setStatus('Could not generate this QR code. The content may be too long for the selected error-correction level.', 'error');
    }
  }

  function buildSvg(qr, options) {
    const moduleCount = qr.getModuleCount();
    const size = moduleCount + options.margin * 2;
    let path = '';

    for (let row = 0; row < moduleCount; row += 1) {
      let runStart = -1;
      for (let col = 0; col <= moduleCount; col += 1) {
        const dark = col < moduleCount && qr.isDark(row, col);
        if (dark && runStart < 0) runStart = col;
        if ((!dark || col === moduleCount) && runStart >= 0) {
          const width = col - runStart;
          path += `M${runStart + options.margin} ${row + options.margin}h${width}v1h-${width}z`;
          runStart = -1;
        }
      }
    }

    const backgroundRect = options.transparent
      ? ''
      : `<rect width="${size}" height="${size}" fill="${escapeXml(options.background)}"/>`;

    return `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code">` +
      backgroundRect +
      `<path d="${path}" fill="${escapeXml(options.foreground)}"/>` +
      `</svg>`;
  }

  async function copySvg() {
    if (!currentSvg) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(currentSvg);
      } else {
        els.clipboardFallback.value = currentSvg;
        els.clipboardFallback.focus();
        els.clipboardFallback.select();
        const copied = document.execCommand('copy');
        els.clipboardFallback.value = '';
        if (!copied) throw new Error('Copy command failed');
      }
      setStatus('SVG markup copied.', 'success');
    } catch {
      setStatus('Clipboard access was blocked by the browser.', 'error');
    }
  }

  function downloadSvg() {
    if (!currentSvg) return;
    const blob = new Blob([currentSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizeFilename(defaults.filename || 'basel-qr-code')}.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus('SVG download started.', 'success');
  }

  function clearGeneratedOutput(clearStatus = true) {
    currentSvg = '';
    els.qrPreview.innerHTML = '';
    els.qrPreview.hidden = true;
    els.emptyPreview.hidden = false;
    els.moduleBadge.hidden = true;
    els.copyButton.disabled = true;
    els.downloadButton.disabled = true;
    els.previewStage.classList.remove('transparent-preview');
    els.readinessHint.textContent = 'Generate a QR code to enable export.';
    if (clearStatus) setStatus('');
  }

  function openSettings() {
    lastFocus = document.activeElement;
    els.settingsBackdrop.hidden = false;
    document.body.classList.add('modal-open');
    els.settingsStatus.textContent = '';
    setTimeout(() => els.closeSettingsButton.focus(), 0);
  }

  function closeSettings() {
    if (els.settingsBackdrop.hidden) return;
    els.settingsBackdrop.hidden = true;
    document.body.classList.remove('modal-open');
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  function applyTheme(choice) {
    const dark = choice === 'dark' || (choice === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]').content = dark ? '#000000' : '#ffffff';
  }

  function setActiveThemeChoice(choice) {
    els.appearanceControl.querySelectorAll('[data-theme-choice]').forEach(button => {
      const active = button.dataset.themeChoice === choice;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function setActiveEccChoice(value) {
    els.defaultEccControl.querySelectorAll('[data-default-ecc]').forEach(button => {
      const active = button.dataset.defaultEcc === value;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function updateCharacterCount() {
    const count = Array.from(els.contentInput.value).length;
    els.characterCount.textContent = `${count.toLocaleString()} ${count === 1 ? 'character' : 'characters'}`;
  }

  function updateColorState() {
    const fg = normalizeHex(els.foregroundText.value) || els.foregroundColor.value;
    const bg = normalizeHex(els.backgroundText.value) || els.backgroundColor.value;
    const ratio = contrastRatio(fg, bg);
    els.contrastValue.textContent = els.transparentToggle.checked
      ? 'Depends on placement'
      : ratio >= 7 ? 'High' : ratio >= 4.5 ? 'Good' : ratio >= 3 ? 'Low' : 'Very low';
  }

  function showSettingsStatus(message) {
    els.settingsStatus.className = 'status-line success';
    els.settingsStatus.textContent = message;
    clearTimeout(showSettingsStatus.timer);
    showSettingsStatus.timer = setTimeout(() => {
      els.settingsStatus.textContent = '';
      els.settingsStatus.className = 'status-line';
    }, 1800);
  }

  function setStatus(message, type = '') {
    els.statusLine.className = `status-line${type ? ` ${type}` : ''}`;
    els.statusLine.textContent = message;
  }

  function normalizeHex(value) {
    const match = String(value || '').trim().match(/^#?([0-9a-f]{6})$/i);
    return match ? `#${match[1].toLowerCase()}` : null;
  }

  function contrastRatio(foreground, background) {
    const l1 = relativeLuminance(foreground);
    const l2 = relativeLuminance(background);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function relativeLuminance(hex) {
    const clean = (normalizeHex(hex) || '#000000').slice(1);
    const channels = [0, 2, 4].map(index => parseInt(clean.slice(index, index + 2), 16) / 255);
    const linear = channels.map(channel => channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4));
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  function sanitizeFilename(value) {
    const clean = String(value || '')
      .trim()
      .replace(/\.svg$/i, '')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
    return clean || 'basel-qr-code';
  }

  function escapeXml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function stripXmlDeclaration(svg) {
    return svg.replace(/^<\?xml[^>]*>\s*/, '');
  }

  function byId(id) {
    return document.getElementById(id);
  }
})();
