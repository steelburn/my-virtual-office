(function () {
  'use strict';

  var root = document.documentElement;
  var PRESET_KEY = 'vo-ui-preset';
  var CUSTOM_KEY = 'vo-ui-custom-theme';
  var MODE_KEY = 'vo-ui-theme';
  var validPresets = ['classic', 'retro', 'cyberpunk', 'gameboy', 'custom'];
  var colorKeys = [
    ['bg0', 'Page background'],
    ['bg1', 'Window background'],
    ['bg2', 'Card background'],
    ['bg3', 'Control background'],
    ['text1', 'Primary text'],
    ['text2', 'Secondary text'],
    ['text3', 'Muted text'],
    ['accent', 'Primary accent'],
    ['accent2', 'Secondary accent'],
    ['borderSoft', 'Soft border'],
    ['borderStrong', 'Strong border'],
    ['info', 'Info'],
    ['success', 'Success'],
    ['danger', 'Danger']
  ];

  var palettes = {
    classic: {
      dark: {
        bg0:'#070b13', bg1:'#0d1422', bg2:'#141d2d', bg3:'#1b273b',
        text1:'#f5f7fb', text2:'#b9c4d5', text3:'#7f8da4',
        accent:'#f5c84c', accent2:'#60a5fa', borderSoft:'#26364e',
        borderStrong:'#3a4d69', info:'#60a5fa', success:'#4ade80',
        danger:'#fb7185', accentContrast:'#172012'
      },
      light: {
        bg0:'#e8edf4', bg1:'#f8fafc', bg2:'#ffffff', bg3:'#eef3f8',
        text1:'#0f172a', text2:'#111827', text3:'#1f2937',
        accent:'#a96c00', accent2:'#2563eb', borderSoft:'#94a3b8',
        borderStrong:'#64748b', info:'#2563eb', success:'#15803d',
        danger:'#be123c', accentContrast:'#ffffff'
      }
    },
    retro: {
      dark: {
        bg0:'#160d20', bg1:'#241435', bg2:'#321b46', bg3:'#43245a',
        text1:'#fff4d6', text2:'#f5d0fe', text3:'#c39ad4',
        accent:'#ffb000', accent2:'#2de2e6', borderSoft:'#69417d',
        borderStrong:'#9864ad', info:'#2de2e6', success:'#63f58a',
        danger:'#ff5470', accentContrast:'#211128'
      },
      light: {
        bg0:'#ead8b5', bg1:'#fff4d8', bg2:'#fffaf0', bg3:'#e8cfaa',
        text1:'#2b1734', text2:'#45244c', text3:'#65406a',
        accent:'#9a4400', accent2:'#006e78', borderSoft:'#9a7059',
        borderStrong:'#694057', info:'#006e78', success:'#2c6a32',
        danger:'#a9203e', accentContrast:'#fff8e8'
      }
    },
    cyberpunk: {
      dark: {
        bg0:'#05020d', bg1:'#0c0920', bg2:'#15102c', bg3:'#21133a',
        text1:'#f9f7ff', text2:'#d9ccff', text3:'#aa96c8',
        accent:'#00f5ff', accent2:'#ff2bd6', borderSoft:'#513074',
        borderStrong:'#00bfc8', info:'#00f5ff', success:'#64ff72',
        danger:'#ff3f7f', accentContrast:'#031116'
      },
      light: {
        bg0:'#eae5f5', bg1:'#faf8ff', bg2:'#ffffff', bg3:'#eee8fa',
        text1:'#180d2d', text2:'#2f1748', text3:'#523c68',
        accent:'#007c86', accent2:'#b00091', borderSoft:'#a995c2',
        borderStrong:'#59357d', info:'#007c86', success:'#16703b',
        danger:'#b40c4c', accentContrast:'#ffffff'
      }
    },
    gameboy: {
      dark: {
        bg0:'#0f1a0f', bg1:'#172617', bg2:'#233323', bg3:'#304530',
        text1:'#d2e5a3', text2:'#b8cf86', text3:'#91aa67',
        accent:'#9bbc0f', accent2:'#6f9a22', borderSoft:'#304f2d',
        borderStrong:'#5f7f38', info:'#a8c93a', success:'#b7d84b',
        danger:'#e07a5f', accentContrast:'#0f380f'
      },
      light: {
        bg0:'#8bac0f', bg1:'#9bbc0f', bg2:'#cadc9f', bg3:'#b6cc7c',
        text1:'#0f380f', text2:'#1f4d1d', text3:'#306230',
        accent:'#0f380f', accent2:'#306230', borderSoft:'#4f6d2f',
        borderStrong:'#274f27', info:'#214f27', success:'#1d5b28',
        danger:'#6b2f24', accentContrast:'#d8e9ae'
      }
    }
  };

  var presetMeta = {
    classic: {
      name:'Classic', icon:'✨',
      description:'The polished Virtual Office style you already know.',
      swatches:['#f5c84c','#0d1422','#60a5fa']
    },
    retro: {
      name:'Retro Pixel', icon:'👾',
      description:'Arcade typography, hard edges, and warm 8-bit color.',
      swatches:['#ffb000','#321b46','#2de2e6']
    },
    cyberpunk: {
      name:'Cyberpunk Neon', icon:'🌃',
      description:'Electric cyan, hot magenta, dark glass, and neon glow.',
      swatches:['#00f5ff','#15102c','#ff2bd6']
    },
    gameboy: {
      name:'Gameboy Classic', icon:'🎮',
      description:'Four-shade gray-green nostalgia with crisp pixel controls.',
      swatches:['#9bbc0f','#0f380f','#cadc9f']
    },
    custom: {
      name:'Custom Theme', icon:'🎨',
      description:'Build your own palette, type, corners, shadows, and density.',
      swatches:['#f472b6','#22d3ee','#a3e635']
    }
  };

  var shapeOptions = {
    square:{sm:'0px', md:'0px', lg:'0px'},
    pixel:{sm:'2px', md:'4px', lg:'6px'},
    rounded:{sm:'10px', md:'14px', lg:'20px'},
    pill:{sm:'18px', md:'24px', lg:'30px'}
  };
  var fontOptions = {
    modern:{
      ui:'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      display:'"Press Start 2P", monospace'
    },
    pixel:{
      ui:'"Press Start 2P", monospace',
      display:'"Press Start 2P", monospace'
    },
    mono:{
      ui:'"SFMono-Regular", Consolas, "Liberation Mono", monospace',
      display:'"SFMono-Regular", Consolas, "Liberation Mono", monospace'
    }
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function validColor(value, fallback) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  }

  function readableAccentText(color) {
    var value = validColor(color, '#000000').slice(1);
    var channels = [0, 2, 4].map(function (index) {
      var channel = parseInt(value.slice(index, index + 2), 16) / 255;
      return channel <= .03928 ? channel / 12.92 : Math.pow((channel + .055) / 1.055, 2.4);
    });
    var luminance = .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
    return luminance > .36 ? '#111111' : '#ffffff';
  }

  function baseStyle(name) {
    if (name === 'retro') return {font:'pixel', shape:'pixel', shadow:'flat', density:'compact'};
    if (name === 'cyberpunk') return {font:'modern', shape:'pixel', shadow:'glow', density:'comfortable'};
    if (name === 'gameboy') return {font:'pixel', shape:'pixel', shadow:'flat', density:'compact'};
    return {font:'modern', shape:'rounded', shadow:'soft', density:'comfortable'};
  }

  function customFromBase(base) {
    var normalized = palettes[base] ? base : 'classic';
    var style = baseStyle(normalized);
    return {
      version:1,
      name:'My Custom Theme',
      base:normalized,
      font:style.font,
      shape:style.shape,
      shadow:style.shadow,
      density:style.density,
      modes:clone(palettes[normalized])
    };
  }

  function normalizeCustom(candidate) {
    var fallback = customFromBase(candidate && candidate.base);
    if (!candidate || typeof candidate !== 'object') return fallback;
    fallback.name = typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name.trim().slice(0, 40) : fallback.name;
    fallback.font = fontOptions[candidate.font] ? candidate.font : fallback.font;
    fallback.shape = shapeOptions[candidate.shape] ? candidate.shape : fallback.shape;
    fallback.shadow = ['flat','soft','glow'].indexOf(candidate.shadow) >= 0 ? candidate.shadow : fallback.shadow;
    fallback.density = ['compact','comfortable'].indexOf(candidate.density) >= 0 ? candidate.density : fallback.density;
    ['dark','light'].forEach(function (mode) {
      var incoming = candidate.modes && candidate.modes[mode] || {};
      Object.keys(fallback.modes[mode]).forEach(function (key) {
        fallback.modes[mode][key] = validColor(incoming[key], fallback.modes[mode][key]);
      });
    });
    return fallback;
  }

  function loadCustom() {
    try {
      return normalizeCustom(JSON.parse(localStorage.getItem(CUSTOM_KEY) || 'null'));
    } catch (e) {
      return customFromBase('classic');
    }
  }

  function currentPreset() {
    return validPresets.indexOf(root.dataset.uiPreset) >= 0 ? root.dataset.uiPreset : 'classic';
  }

  function currentMode() {
    return root.dataset.uiTheme === 'light' ? 'light' : 'dark';
  }

  function clearCustomProperties() {
    [
      'bg-0','bg-1','bg-2','bg-3','text-1','text-2','text-3','accent','accent-2',
      'border-soft','border-strong','info','success','danger','accent-contrast',
      'font-ui','font-display','radius-sm','radius-md','radius-lg','shadow',
      'shadow-hard','control-height','space-scale'
    ].forEach(function (name) {
      root.style.removeProperty('--theme-' + name);
    });
  }

  function applyCustomVariables(custom) {
    var theme = normalizeCustom(custom);
    root.dataset.uiFontStyle = theme.font;
    var colors = theme.modes[currentMode()];
    var map = {
      bg0:'bg-0', bg1:'bg-1', bg2:'bg-2', bg3:'bg-3',
      text1:'text-1', text2:'text-2', text3:'text-3',
      accent:'accent', accent2:'accent-2', borderSoft:'border-soft',
      borderStrong:'border-strong', info:'info', success:'success',
      danger:'danger', accentContrast:'accent-contrast'
    };
    Object.keys(map).forEach(function (key) {
      root.style.setProperty('--theme-' + map[key], colors[key]);
    });
    var fonts = fontOptions[theme.font];
    var shape = shapeOptions[theme.shape];
    root.style.setProperty('--theme-font-ui', fonts.ui);
    root.style.setProperty('--theme-font-display', fonts.display);
    root.style.setProperty('--theme-radius-sm', shape.sm);
    root.style.setProperty('--theme-radius-md', shape.md);
    root.style.setProperty('--theme-radius-lg', shape.lg);
    root.style.setProperty('--theme-control-height', theme.density === 'compact' ? '36px' : '42px');
    root.style.setProperty('--theme-space-scale', theme.density === 'compact' ? '.86' : '1');
    if (theme.shadow === 'flat') {
      root.style.setProperty('--theme-shadow', '4px 4px 0 color-mix(in srgb, var(--theme-border-strong) 82%, #000)');
      root.style.setProperty('--theme-shadow-hard', '3px 3px 0 var(--theme-border-strong)');
    } else if (theme.shadow === 'glow') {
      root.style.setProperty('--theme-shadow', '0 18px 60px color-mix(in srgb, var(--theme-accent) 19%, transparent), 0 0 24px color-mix(in srgb, var(--theme-accent-2) 12%, transparent)');
      root.style.setProperty('--theme-shadow-hard', '0 0 15px color-mix(in srgb, var(--theme-accent) 45%, transparent)');
    } else {
      root.style.setProperty('--theme-shadow', '0 24px 70px color-mix(in srgb, var(--theme-bg-0) 78%, transparent)');
      root.style.setProperty('--theme-shadow-hard', '0 8px 24px color-mix(in srgb, var(--theme-bg-0) 42%, transparent)');
    }
  }

  function syncModeButtons() {
    var mode = currentMode();
    document.querySelectorAll('[data-theme-mode]').forEach(function (button) {
      var active = button.dataset.themeMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    var dockButton = document.getElementById('btn-ui-theme');
    if (dockButton) {
      var next = mode === 'dark' ? 'light' : 'dark';
      dockButton.textContent = next === 'light' ? '☀️ Light' : '🌙 Dark';
      dockButton.dataset.mobileLabel = dockButton.textContent;
    }
    document.querySelectorAll('[data-ui-theme-toggle]').forEach(function (button) {
      var next = mode === 'dark' ? 'light' : 'dark';
      button.textContent = next === 'light' ? '☀️ Light' : '🌙 Dark';
    });
  }

  function syncPresetCards() {
    var preset = currentPreset();
    document.querySelectorAll('.theme-preset-card').forEach(function (card) {
      var active = card.dataset.preset === preset;
      card.classList.toggle('active', active);
      card.setAttribute('aria-pressed', active ? 'true' : 'false');
      var state = card.querySelector('.theme-card-state');
      if (state) state.textContent = active ? 'Applied' : 'Apply';
    });
    var label = document.querySelector('.theme-current-name');
    if (label) label.textContent = preset === 'custom' ? loadCustom().name : presetMeta[preset].name;
  }

  function updateMetaColor() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    var preset = currentPreset();
    var color;
    if (preset === 'custom') color = loadCustom().modes[currentMode()].bg0;
    else color = palettes[preset][currentMode()].bg0;
    meta.setAttribute('content', color);
  }

  function announce(message) {
    var status = document.querySelector('.theme-save-status');
    if (!status) return;
    status.textContent = message;
    status.classList.add('visible');
    window.clearTimeout(announce.timer);
    announce.timer = window.setTimeout(function () { status.classList.remove('visible'); }, 1800);
  }

  function refreshStudio() {
    syncPresetCards();
    syncModeButtons();
    var custom = loadCustom();
    var suite = document.getElementById('ui-theme-suite');
    if (!suite) return;
    var name = suite.querySelector('[data-custom-field="name"]');
    var base = suite.querySelector('[data-custom-field="base"]');
    var font = suite.querySelector('[data-custom-field="font"]');
    var shape = suite.querySelector('[data-custom-field="shape"]');
    var shadow = suite.querySelector('[data-custom-field="shadow"]');
    var density = suite.querySelector('[data-custom-field="density"]');
    if (name && document.activeElement !== name) name.value = custom.name;
    if (base) base.value = custom.base;
    if (font) font.value = custom.font;
    if (shape) shape.value = custom.shape;
    if (shadow) shadow.value = custom.shadow;
    if (density) density.value = custom.density;
    colorKeys.forEach(function (entry) {
      var input = suite.querySelector('[data-color-key="' + entry[0] + '"]');
      if (input) input.value = custom.modes[currentMode()][entry[0]];
      var value = suite.querySelector('[data-color-value="' + entry[0] + '"]');
      if (value) value.textContent = custom.modes[currentMode()][entry[0]].toUpperCase();
    });
    var editingLabel = suite.querySelector('.theme-mode-editing');
    if (editingLabel) editingLabel.textContent = currentMode() === 'dark' ? 'Editing dark palette' : 'Editing light palette';
  }

  function emitChange() {
    updateMetaColor();
    syncModeButtons();
    syncPresetCards();
    window.dispatchEvent(new CustomEvent('vo-theme-change', {
      detail:{preset:currentPreset(), mode:currentMode()}
    }));
  }

  function applyPreset(preset, persist) {
    var normalized = validPresets.indexOf(preset) >= 0 ? preset : 'classic';
    clearCustomProperties();
    root.dataset.uiPreset = normalized;
    root.dataset.uiFontStyle = baseStyle(normalized).font;
    if (normalized === 'custom') applyCustomVariables(loadCustom());
    if (persist) {
      try { localStorage.setItem(PRESET_KEY, normalized); } catch (e) { /* Ignore storage errors. */ }
    }
    emitChange();
    refreshStudio();
  }

  function setMode(mode, persist) {
    root.dataset.uiTheme = mode === 'light' ? 'light' : 'dark';
    if (persist) {
      try { localStorage.setItem(MODE_KEY, currentMode()); } catch (e) { /* Ignore storage errors. */ }
    }
    if (currentPreset() === 'custom') {
      clearCustomProperties();
      applyCustomVariables(loadCustom());
    }
    emitChange();
    refreshStudio();
  }

  function saveCustom(custom, message) {
    var normalized = normalizeCustom(custom);
    try {
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(normalized));
      localStorage.setItem(PRESET_KEY, 'custom');
    } catch (e) { /* Theme still applies for this page. */ }
    clearCustomProperties();
    root.dataset.uiPreset = 'custom';
    applyCustomVariables(normalized);
    emitChange();
    refreshStudio();
    announce(message || 'Custom theme saved');
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function syncIconOnlyButton(button) {
    if (!button || button.tagName !== 'BUTTON') return;
    var label = (button.textContent || '').replace(/\s+/g, ' ').trim();
    var iconOnly = !!label && Array.from(label).length <= 12 && !/[\p{L}\p{N}]/u.test(label);
    button.classList.toggle('ui-icon-only', iconOnly);
  }

  function syncIconOnlyButtons(scope) {
    if (!scope) return;
    if (scope.nodeType === 1 && scope.matches('button')) syncIconOnlyButton(scope);
    if (scope.querySelectorAll) scope.querySelectorAll('button').forEach(syncIconOnlyButton);
  }

  function watchIconOnlyButtons() {
    syncIconOnlyButtons(document);
    if (!document.body) return;
    var observer = new MutationObserver(function (records) {
      records.forEach(function (record) {
        var target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        var targetButton = target && target.closest ? target.closest('button') : null;
        if (targetButton) syncIconOnlyButton(targetButton);
        record.addedNodes.forEach(function (node) {
          if (node.nodeType === 1) syncIconOnlyButtons(node);
        });
      });
    });
    observer.observe(document.body, {subtree:true, childList:true, characterData:true});
  }

  function labeledSelect(labelText, field, choices) {
    var label = element('label', 'theme-field');
    label.appendChild(element('span', 'theme-field-label', labelText));
    var select = element('select', 'theme-select');
    select.dataset.customField = field;
    choices.forEach(function (choice) {
      var option = element('option', '', choice[1]);
      option.value = choice[0];
      select.appendChild(option);
    });
    label.appendChild(select);
    return label;
  }

  function buildThemeStudio() {
    var suite = document.getElementById('ui-theme-suite');
    if (!suite || suite.dataset.ready) return;
    suite.dataset.ready = 'true';

    var hero = element('div', 'theme-studio-hero');
    var heroCopy = element('div');
    heroCopy.appendChild(element('div', 'mm-section-title', '🎨 Theme Studio'));
    heroCopy.appendChild(element('p', 'theme-studio-copy', 'Choose a complete interface style, then switch between its dark and light palettes. Your selection follows you across Office, Chat, SMS, Cron, and Models.'));
    hero.appendChild(heroCopy);
    var current = element('div', 'theme-current-pill');
    current.appendChild(element('span', '', 'Current'));
    current.appendChild(element('strong', 'theme-current-name', 'Classic'));
    hero.appendChild(current);
    suite.appendChild(hero);

    var modeBar = element('div', 'theme-mode-bar');
    modeBar.appendChild(element('span', 'theme-mode-label', 'Appearance'));
    var modeGroup = element('div', 'theme-segmented');
    [['dark','🌙 Dark'],['light','☀️ Light']].forEach(function (choice) {
      var button = element('button', '', choice[1]);
      button.type = 'button';
      button.dataset.themeMode = choice[0];
      button.addEventListener('click', function () {
        setMode(choice[0], true);
        announce((choice[0] === 'dark' ? 'Dark' : 'Light') + ' palette applied');
      });
      modeGroup.appendChild(button);
    });
    modeBar.appendChild(modeGroup);
    suite.appendChild(modeBar);

    var heading = element('div', 'theme-subheading', 'Theme presets');
    suite.appendChild(heading);
    var grid = element('div', 'theme-preset-grid');
    validPresets.forEach(function (id) {
      var meta = presetMeta[id];
      var card = element('button', 'theme-preset-card');
      card.type = 'button';
      card.dataset.preset = id;
      card.setAttribute('aria-label', 'Apply ' + meta.name + ' theme');
      var preview = element('span', 'theme-card-preview theme-card-preview-' + id);
      var dots = element('span', 'theme-card-swatches');
      meta.swatches.forEach(function (color) {
        var dot = element('i');
        dot.style.backgroundColor = color;
        dots.appendChild(dot);
      });
      preview.appendChild(element('span', 'theme-card-mini-window', meta.icon));
      preview.appendChild(dots);
      card.appendChild(preview);
      var copy = element('span', 'theme-card-copy');
      copy.appendChild(element('strong', '', meta.name));
      copy.appendChild(element('small', '', meta.description));
      card.appendChild(copy);
      card.appendChild(element('span', 'theme-card-state', 'Apply'));
      card.addEventListener('click', function () {
        applyPreset(id, true);
        announce(meta.name + ' applied');
        if (id === 'custom') {
          var editor = suite.querySelector('.theme-custom-editor');
          if (editor) editor.scrollIntoView({behavior:'smooth', block:'start'});
        }
      });
      grid.appendChild(card);
    });
    suite.appendChild(grid);

    var editor = element('div', 'theme-custom-editor');
    var editorHead = element('div', 'theme-custom-head');
    var editorCopy = element('div');
    editorCopy.appendChild(element('div', 'theme-subheading', 'Custom theme builder'));
    editorCopy.appendChild(element('p', 'theme-studio-copy', 'Start from any preset and tune both its dark and light palettes. Changes preview and save automatically.'));
    editorHead.appendChild(editorCopy);
    var saveState = element('span', 'theme-save-status', 'Saved');
    saveState.setAttribute('aria-live', 'polite');
    editorHead.appendChild(saveState);
    editor.appendChild(editorHead);

    var controls = element('div', 'theme-custom-controls');
    var nameLabel = element('label', 'theme-field theme-field-wide');
    nameLabel.appendChild(element('span', 'theme-field-label', 'Theme name'));
    var nameInput = element('input', 'theme-text-input');
    nameInput.type = 'text';
    nameInput.maxLength = 40;
    nameInput.dataset.customField = 'name';
    nameLabel.appendChild(nameInput);
    controls.appendChild(nameLabel);
    controls.appendChild(labeledSelect('Start from', 'base', [
      ['classic','Classic'],['retro','Retro Pixel'],['cyberpunk','Cyberpunk Neon'],['gameboy','Gameboy Classic']
    ]));
    controls.appendChild(labeledSelect('Typography', 'font', [
      ['modern','Modern + pixel titles'],['pixel','Pixel everywhere'],['mono','Monospace']
    ]));
    controls.appendChild(labeledSelect('Border shape', 'shape', [
      ['square','Square'],['pixel','Pixel cut'],['rounded','Rounded'],['pill','Extra rounded']
    ]));
    controls.appendChild(labeledSelect('Effects', 'shadow', [
      ['flat','Flat / hard shadow'],['soft','Soft depth'],['glow','Neon glow']
    ]));
    controls.appendChild(labeledSelect('Density', 'density', [
      ['compact','Compact'],['comfortable','Comfortable']
    ]));
    editor.appendChild(controls);

    var paletteHead = element('div', 'theme-palette-head');
    paletteHead.appendChild(element('div', 'theme-subheading', 'Color palette'));
    paletteHead.appendChild(element('span', 'theme-mode-editing', 'Editing dark palette'));
    editor.appendChild(paletteHead);
    var colors = element('div', 'theme-color-grid');
    colorKeys.forEach(function (entry) {
      var label = element('label', 'theme-color-field');
      var input = element('input', 'theme-color-input');
      input.type = 'color';
      input.dataset.colorKey = entry[0];
      label.appendChild(input);
      var colorCopy = element('span');
      colorCopy.appendChild(element('strong', '', entry[1]));
      var value = element('small', '', '#000000');
      value.dataset.colorValue = entry[0];
      colorCopy.appendChild(value);
      label.appendChild(colorCopy);
      colors.appendChild(label);
    });
    editor.appendChild(colors);

    var sample = element('div', 'theme-live-preview');
    var sampleTop = element('div', 'theme-preview-title');
    sampleTop.appendChild(element('span', '', 'LIVE PREVIEW'));
    sampleTop.appendChild(element('span', 'theme-preview-status', '● Online'));
    sample.appendChild(sampleTop);
    var sampleBody = element('div', 'theme-preview-body');
    sampleBody.appendChild(element('strong', '', 'Your custom interface'));
    sampleBody.appendChild(element('p', '', 'Text, surfaces, borders, accents, spacing, and controls update together.'));
    var sampleInput = element('input');
    sampleInput.value = 'Preview field';
    sampleInput.setAttribute('aria-label', 'Theme preview input');
    sampleBody.appendChild(sampleInput);
    var sampleButtons = element('div', 'theme-preview-actions');
    sampleButtons.appendChild(element('button', 'theme-preview-primary', 'Primary action'));
    sampleButtons.appendChild(element('button', '', 'Secondary'));
    sampleBody.appendChild(sampleButtons);
    sample.appendChild(sampleBody);
    editor.appendChild(sample);

    var actions = element('div', 'theme-custom-actions');
    var reset = element('button', 'theme-reset-button', '↺ Reset from base');
    reset.type = 'button';
    reset.addEventListener('click', function () {
      var custom = loadCustom();
      custom = customFromBase(custom.base);
      saveCustom(custom, 'Custom theme reset');
    });
    var duplicate = element('button', 'theme-apply-button', '🎨 Customize active preset');
    duplicate.type = 'button';
    duplicate.addEventListener('click', function () {
      var active = currentPreset();
      if (active === 'custom') active = loadCustom().base;
      saveCustom(customFromBase(active), presetMeta[active].name + ' copied to Custom');
    });
    actions.appendChild(reset);
    actions.appendChild(duplicate);
    editor.appendChild(actions);
    suite.appendChild(editor);

    controls.addEventListener('input', function (event) {
      var field = event.target.dataset.customField;
      if (!field || field === 'base') return;
      var custom = loadCustom();
      custom[field] = event.target.value;
      saveCustom(custom, 'Custom theme updated');
    });
    controls.addEventListener('change', function (event) {
      var field = event.target.dataset.customField;
      if (!field) return;
      if (field === 'base') {
        saveCustom(customFromBase(event.target.value), presetMeta[event.target.value].name + ' loaded');
        return;
      }
      var custom = loadCustom();
      custom[field] = event.target.value;
      saveCustom(custom, 'Custom theme updated');
    });
    colors.addEventListener('input', function (event) {
      var key = event.target.dataset.colorKey;
      if (!key) return;
      var custom = loadCustom();
      custom.modes[currentMode()][key] = event.target.value;
      if (key === 'accent') custom.modes[currentMode()].accentContrast = readableAccentText(event.target.value);
      saveCustom(custom, 'Color updated');
    });
  }

  function init() {
    var storedPreset = 'classic';
    try {
      storedPreset = localStorage.getItem(PRESET_KEY) || root.dataset.uiPreset || 'classic';
    } catch (e) {
      storedPreset = root.dataset.uiPreset || 'classic';
    }
    if (validPresets.indexOf(storedPreset) < 0) storedPreset = 'classic';
    applyPreset(storedPreset, false);
    buildThemeStudio();
    watchIconOnlyButtons();
    refreshStudio();

    var observer = new MutationObserver(function (records) {
      var modeChanged = records.some(function (record) {
        return record.attributeName === 'data-ui-theme';
      });
      if (!modeChanged) return;
      if (currentPreset() === 'custom') {
        clearCustomProperties();
        applyCustomVariables(loadCustom());
      }
      emitChange();
      refreshStudio();
    });
    observer.observe(root, {attributes:true, attributeFilter:['data-ui-theme']});

    window.addEventListener('storage', function (event) {
      if ([PRESET_KEY, CUSTOM_KEY, MODE_KEY].indexOf(event.key) < 0) return;
      var preset = localStorage.getItem(PRESET_KEY) || 'classic';
      root.dataset.uiTheme = localStorage.getItem(MODE_KEY) === 'light' ? 'light' : 'dark';
      applyPreset(preset, false);
    });
  }

  window.VOThemeSuite = {
    applyPreset:applyPreset,
    setMode:setMode,
    getPreset:currentPreset,
    getMode:currentMode,
    getCustom:loadCustom
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
