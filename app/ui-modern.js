(function () {
    'use strict';

    var uiSettingsDirty = false;
    var uiSettingsHydrating = false;
    var uiSettingsCategory = 'general';
    var uiOfficeBaseline = null;
    var uiAgentBaseline = null;
    var uiAgentTab = 'identity';
    var uiBypassCloseGuard = false;
    var uiScrim = null;

    function make(tag, className, text) {
        var el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }

    function safeJson(value, fallback) {
        try { return JSON.parse(value); } catch (e) { return fallback; }
    }

    function getEditMode() {
        return !!window.editMode;
    }

    function currentTheme() {
        return document.documentElement.dataset.uiTheme === 'light' ? 'light' : 'dark';
    }

    function syncThemeControls() {
        var theme = currentTheme();
        var button = document.getElementById('btn-ui-theme');
        if (button) {
            var next = theme === 'dark' ? 'light' : 'dark';
            button.textContent = next === 'light' ? '☀️ Light' : '🌙 Dark';
            button.dataset.mobileLabel = button.textContent;
            button.title = 'Switch to ' + next + ' theme';
            button.setAttribute('aria-label', button.title);
            button.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
        }
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', theme === 'light' ? '#eef3f8' : '#070b13');
    }

    function applyTheme(theme, persist) {
        var normalized = theme === 'light' ? 'light' : 'dark';
        document.documentElement.dataset.uiTheme = normalized;
        if (persist) {
            try { localStorage.setItem('vo-ui-theme', normalized); } catch (e) { /* Storage may be unavailable. */ }
        }
        syncThemeControls();
    }

    function toggleTheme() {
        applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
    }

    function ensureScrim() {
        if (uiScrim) return uiScrim;
        uiScrim = make('div', 'ui-panel-scrim');
        uiScrim.setAttribute('aria-hidden', 'true');
        uiScrim.addEventListener('click', function () {
            var settings = document.getElementById('main-menu-panel');
            var agentsPanel = document.getElementById('agent-creator-panel');
            if (settings && settings.classList.contains('open') && typeof window.toggleMainMenu === 'function') {
                window.toggleMainMenu();
            } else if (agentsPanel && agentsPanel.classList.contains('visible') && typeof window.toggleAgentPanel === 'function') {
                window.toggleAgentPanel();
            }
        });
        document.body.appendChild(uiScrim);
        return uiScrim;
    }

    function syncScrim() {
        var settings = document.getElementById('main-menu-panel');
        var agentsPanel = document.getElementById('agent-creator-panel');
        var settingsOpen = !!(settings && settings.classList.contains('open'));
        var agentsOpen = !!(agentsPanel && agentsPanel.classList.contains('visible'));
        var visible = settingsOpen || agentsOpen;
        if (settings) settings.setAttribute('aria-hidden', settingsOpen ? 'false' : 'true');
        if (agentsPanel) agentsPanel.setAttribute('aria-hidden', agentsOpen ? 'false' : 'true');
        ensureScrim().classList.toggle('visible', visible);
        ensureScrim().setAttribute('aria-hidden', visible ? 'false' : 'true');
    }

    function enhanceToolbar() {
        var toolbar = document.querySelector('.toolbar');
        if (!toolbar || toolbar.dataset.modernized) return;
        toolbar.dataset.modernized = 'true';

        var settingsBtn = document.getElementById('btn-main-menu');
        var editBtn = document.getElementById('btn-edit-office');
        var agentBtn = document.getElementById('btn-agent-settings');
        var saveBtn = document.getElementById('btn-save-edits');
        var undoBtn = document.getElementById('btn-undo-edit');
        var projectBtn = toolbar.querySelector('button[onclick*="openProjectsManager"]');
        var resetBtn = toolbar.querySelector('button[onclick*="resetCamera"]');
        var expandBtn = document.getElementById('btn-expand-all');
        var minimizeBtn = document.getElementById('btn-minimize-all');
        var smsBtn = document.getElementById('sms-toggle');
        var browserBtn = document.getElementById('browser-toggle');
        var links = toolbar.querySelectorAll(':scope > a');
        var modelsLink = links.length > 0 ? links[0] : null;
        var cronLink = links.length > 1 ? links[1] : null;

        if (settingsBtn) settingsBtn.textContent = '⚙️ Settings';
        if (editBtn) editBtn.textContent = '✏️ Edit Office';
        if (agentBtn) agentBtn.textContent = '👥 Agents';
        if (projectBtn) projectBtn.textContent = '📋 Projects';
        if (expandBtn) expandBtn.textContent = '💬 Expand';
        if (minimizeBtn) minimizeBtn.textContent = '🗨️ Minimize';
        if (resetBtn) resetBtn.textContent = '🔍 Reset View';
        if (smsBtn) smsBtn.textContent = '📞 SMS';
        if (browserBtn) browserBtn.textContent = '🌐 Browser';
        if (modelsLink && modelsLink.querySelector('button')) modelsLink.querySelector('button').textContent = '⚙️ Models';
        if (cronLink && cronLink.querySelector('button')) cronLink.querySelector('button').textContent = '⏰ Cron';

        [
            [settingsBtn, '⚙️ Settings'],
            [editBtn, '✏️ Edit'],
            [agentBtn, '👥 Agents'],
            [projectBtn, '📋 Projects'],
            [modelsLink && modelsLink.querySelector('button'), '⚙️ Models'],
            [cronLink && cronLink.querySelector('button'), '⏰ Cron'],
            [browserBtn, '🌐 Browser'],
            [smsBtn, '📞 SMS'],
            [expandBtn, '💬 Expand'],
            [minimizeBtn, '🗨️ Minimize'],
            [resetBtn, '🔍 Reset']
        ].forEach(function (entry) {
            if (!entry[0]) return;
            entry[0].dataset.mobileLabel = entry[1];
            entry[0].setAttribute('aria-label', entry[0].textContent.trim());
            if (entry[0].parentElement && entry[0].parentElement.tagName === 'A') {
                entry[0].parentElement.setAttribute('aria-label', entry[0].textContent.trim());
            }
        });

        var editTools = make('div', 'ui-edit-toolbar');
        editTools.setAttribute('aria-label', 'Office editing tools');
        if (undoBtn) {
            undoBtn.textContent = '↶ Undo';
            undoBtn.style.display = '';
            editTools.appendChild(undoBtn);
        }
        if (saveBtn) {
            saveBtn.textContent = 'Save changes';
            saveBtn.style.display = '';
            saveBtn.classList.add('ui-primary-action');
            editTools.appendChild(saveBtn);
        }
        var resetView = make('button', '', '⌖ Reset view');
        resetView.type = 'button';
        resetView.addEventListener('click', function () {
            if (typeof window.resetCamera === 'function') window.resetCamera();
        });
        editTools.appendChild(resetView);
        var cancelEdit = make('button', 'ui-danger-action', 'Cancel');
        cancelEdit.type = 'button';
        cancelEdit.addEventListener('click', cancelOfficeEdit);
        editTools.appendChild(cancelEdit);
        var doneEdit = make('button', 'ui-primary-action', 'Done');
        doneEdit.type = 'button';
        doneEdit.addEventListener('click', function () {
            if (typeof window.toggleEditMode === 'function') window.toggleEditMode();
        });
        editTools.appendChild(doneEdit);
        document.body.appendChild(editTools);

        var primary = make('div', 'toolbar-primary');
        var themeBtn = make('button', 'toolbar-theme-btn');
        themeBtn.id = 'btn-ui-theme';
        themeBtn.type = 'button';
        themeBtn.addEventListener('click', toggleTheme);
        [settingsBtn, editBtn, agentBtn, projectBtn, modelsLink, cronLink, browserBtn, smsBtn, expandBtn, minimizeBtn, resetBtn, themeBtn].forEach(function (el) {
            if (el) primary.appendChild(el);
        });

        toolbar.querySelectorAll('.toolbar-divider').forEach(function (el) { el.remove(); });
        toolbar.appendChild(primary);
        syncThemeControls();
    }

    function updateSettingsDirty(dirty) {
        uiSettingsDirty = dirty;
        var indicator = document.querySelector('#main-menu-panel .ui-unsaved-indicator');
        if (indicator) indicator.classList.toggle('visible', dirty);
    }

    function showSettingsCategory(category) {
        uiSettingsCategory = category;
        document.querySelectorAll('#main-menu-panel .settings-nav button').forEach(function (btn) {
            var active = btn.dataset.category === category;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        document.querySelectorAll('#main-menu-panel .mm-section').forEach(function (section) {
            section.classList.toggle('ui-settings-active', section.dataset.category === category);
        });
        var body = document.querySelector('#main-menu-panel .main-menu-body');
        if (body) body.scrollTop = 0;
    }

    function enhanceSettings() {
        var panel = document.getElementById('main-menu-panel');
        if (!panel || panel.dataset.modernized) return;
        panel.dataset.modernized = 'true';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-label', 'Virtual Office settings');

        var header = panel.querySelector('.main-menu-header');
        var oldTitle = header ? header.querySelector('span') : null;
        if (header && oldTitle) {
            var titleWrap = make('div', 'main-menu-title-wrap');
            titleWrap.appendChild(make('span', 'main-menu-title', 'SETTINGS'));
            titleWrap.appendChild(make('span', 'main-menu-subtitle', 'Office, themes, connections, integrations, and data'));
            oldTitle.replaceWith(titleWrap);
            var dirty = make('span', 'ui-unsaved-indicator', 'Unsaved changes');
            dirty.setAttribute('aria-live', 'polite');
            header.insertBefore(dirty, header.lastElementChild);
        }

        var body = panel.querySelector('.main-menu-body');
        if (!body) return;
        var sections = Array.prototype.slice.call(body.querySelectorAll(':scope > .mm-section'));
        var themesSection = make('section', 'mm-section ui-theme-suite');
        themesSection.id = 'ui-theme-suite';
        themesSection.dataset.category = 'themes';
        themesSection.setAttribute('aria-label', 'Theme studio');
        body.appendChild(themesSection);
        var categories = [
            { id: 'general', label: 'General', indices: [2, 3, 7] },
            { id: 'themes', label: 'Themes', indices: [] },
            { id: 'connections', label: 'Connections', indices: [0, 1] },
            { id: 'performance', label: 'Usage & Performance', indices: [4, 5] },
            { id: 'integrations', label: 'Browser & Integrations', indices: [6] },
            { id: 'data', label: 'Data & Reset', indices: [8] },
            { id: 'help', label: 'Help', indices: [9] }
        ];
        categories.forEach(function (category) {
            category.indices.forEach(function (index) {
                if (sections[index]) sections[index].dataset.category = category.id;
            });
        });

        var shell = make('div', 'settings-shell');
        var nav = make('nav', 'settings-nav');
        nav.setAttribute('aria-label', 'Settings categories');
        nav.setAttribute('role', 'tablist');
        categories.forEach(function (category) {
            var btn = make('button', '', category.label);
            btn.type = 'button';
            btn.dataset.category = category.id;
            btn.setAttribute('role', 'tab');
            btn.addEventListener('click', function () { showSettingsCategory(category.id); });
            nav.appendChild(btn);
        });
        var content = make('div', 'settings-content');
        body.parentNode.insertBefore(shell, body);
        content.appendChild(body);
        shell.appendChild(nav);
        shell.appendChild(content);

        var footer = make('div', 'settings-footer');
        var cancel = make('button', 'ui-settings-cancel', 'Discard');
        cancel.type = 'button';
        cancel.addEventListener('click', function () {
            updateSettingsDirty(false);
            uiBypassCloseGuard = true;
            if (typeof window.toggleMainMenu === 'function') window.toggleMainMenu();
            uiBypassCloseGuard = false;
        });
        var save = body.querySelector('.mm-save-all');
        if (save) {
            save.textContent = 'Save settings';
            footer.appendChild(cancel);
            footer.appendChild(save);
        }
        panel.appendChild(footer);

        var token = document.getElementById('mm-gateway-token');
        if (token && !token.parentElement.classList.contains('settings-secret-field')) {
            token.type = 'password';
            token.autocomplete = 'off';
            var secretWrap = make('div', 'settings-secret-field');
            token.parentNode.insertBefore(secretWrap, token);
            secretWrap.appendChild(token);
            var reveal = make('button', 'settings-secret-toggle', 'Show');
            reveal.type = 'button';
            reveal.setAttribute('aria-label', 'Show gateway token');
            reveal.addEventListener('click', function () {
                var showing = token.type === 'text';
                token.type = showing ? 'password' : 'text';
                reveal.textContent = showing ? 'Show' : 'Hide';
                reveal.setAttribute('aria-label', showing ? 'Show gateway token' : 'Hide gateway token');
            });
            secretWrap.appendChild(reveal);
        }

        body.addEventListener('input', function (event) {
            if (event.target.closest && event.target.closest('.ui-theme-suite')) return;
            if (!uiSettingsHydrating) updateSettingsDirty(true);
        });
        body.addEventListener('change', function (event) {
            if (event.target.closest && event.target.closest('.ui-theme-suite')) return;
            if (!uiSettingsHydrating) updateSettingsDirty(true);
        });
        showSettingsCategory('general');
        enhanceHermesRows();
    }

    function enhanceHermesRows() {
        var rows = document.querySelectorAll('#mm-hermes-connections .mm-hermes-connection');
        rows.forEach(function (row, index) {
            if (row.dataset.modernized) return;
            row.dataset.modernized = 'true';
            var originalChildren = Array.prototype.slice.call(row.children);
            var head = make('button', 'ui-hermes-card-head');
            head.type = 'button';
            head.setAttribute('aria-expanded', index === 0 ? 'true' : 'false');
            var summary = make('span', 'ui-hermes-summary');
            var state = make('span', 'ui-hermes-state', 'Configured');
            var chevron = make('span', 'ui-hermes-chevron', index === 0 ? '▾' : '▸');
            head.appendChild(summary);
            head.appendChild(state);
            head.appendChild(chevron);
            var body = make('div', 'ui-hermes-body');
            body.hidden = index !== 0;
            originalChildren.forEach(function (child) { body.appendChild(child); });
            row.appendChild(head);
            row.appendChild(body);

            var idInput = row.querySelector('.hermes-connection-id');
            var nameInput = row.querySelector('.hermes-connection-name');
            var keyInput = row.querySelector('.hermes-connection-key');
            function updateSummary() {
                summary.textContent = (nameInput && nameInput.value.trim()) ||
                    (idInput && idInput.value.trim()) || 'Hermes connection';
                var configured = keyInput && (keyInput.value || keyInput.placeholder.indexOf('Configured') >= 0);
                state.textContent = configured ? 'Key configured' : 'Needs key';
                state.style.color = configured ? '' : 'var(--ui-danger)';
            }
            [idInput, nameInput, keyInput].forEach(function (input) {
                if (input) input.addEventListener('input', updateSummary);
            });
            head.addEventListener('click', function () {
                body.hidden = !body.hidden;
                head.setAttribute('aria-expanded', body.hidden ? 'false' : 'true');
                chevron.textContent = body.hidden ? '▸' : '▾';
            });
            var remove = Array.prototype.slice.call(row.querySelectorAll('.mm-btn')).find(function (button) {
                return button.textContent.trim() === 'Remove';
            });
            if (remove) {
                remove.removeAttribute('onclick');
                remove.addEventListener('click', function () {
                    row.remove();
                    updateSettingsDirty(true);
                });
            }
            updateSummary();
        });
    }

    function wrapSettingsFunctions() {
        if (typeof window.toggleMainMenu === 'function' && !window.toggleMainMenu._uiWrapped) {
            var originalToggle = window.toggleMainMenu;
            var wrappedToggle = function () {
                var panel = document.getElementById('main-menu-panel');
                var closing = panel && panel.classList.contains('open');
                if (closing && uiSettingsDirty && !uiBypassCloseGuard) {
                    if (!window.confirm('Discard unsaved settings changes?')) return;
                    updateSettingsDirty(false);
                }
                if (!closing) {
                    uiSettingsHydrating = true;
                    updateSettingsDirty(false);
                }
                originalToggle.apply(window, arguments);
                syncScrim();
                if (!closing) {
                    showSettingsCategory(uiSettingsCategory || 'general');
                    window.setTimeout(function () {
                        uiSettingsHydrating = false;
                        updateSettingsDirty(false);
                    }, 700);
                }
            };
            wrappedToggle._uiWrapped = true;
            window.toggleMainMenu = wrappedToggle;
        }

        if (typeof window.mmSaveSettings === 'function' && !window.mmSaveSettings._uiWrapped) {
            var originalSave = window.mmSaveSettings;
            var wrappedSave = function () {
                var result = originalSave.apply(window, arguments);
                window.setTimeout(function () { updateSettingsDirty(false); }, 500);
                return result;
            };
            wrappedSave._uiWrapped = true;
            window.mmSaveSettings = wrappedSave;
        }
    }

    function captureOfficeBaseline() {
        if (window.officeConfig) uiOfficeBaseline = JSON.stringify(window.officeConfig);
    }

    function restoreOfficeBaseline() {
        if (!uiOfficeBaseline || !window.officeConfig) return;
        var restored = safeJson(uiOfficeBaseline, null);
        if (!restored) return;
        Object.keys(window.officeConfig).forEach(function (key) { delete window.officeConfig[key]; });
        Object.assign(window.officeConfig, restored);
        if (typeof window.saveOfficeConfig === 'function') window.saveOfficeConfig();
        if (typeof window.buildCollisionGrid === 'function') window.buildCollisionGrid();
        if (typeof window.getInteractionSpots === 'function') window.getInteractionSpots();
        if (typeof window._syncAllDeskAssignments === 'function') window._syncAllDeskAssignments();
        if (typeof window.resizeCanvas === 'function') window.resizeCanvas(true);
    }

    function cancelOfficeEdit() {
        if (!getEditMode()) return;
        if (!window.confirm('Discard the office changes made in this editing session?')) return;
        restoreOfficeBaseline();
        if (typeof window._hasUnsavedChanges !== 'undefined') window._hasUnsavedChanges = false;
        uiBypassCloseGuard = true;
        if (typeof window.toggleEditMode === 'function') window.toggleEditMode();
        uiBypassCloseGuard = false;
        if (typeof window._acpShowToast === 'function') window._acpShowToast('Office changes discarded');
    }

    function wrapOfficeEditor() {
        if (typeof window.toggleEditMode === 'function' && !window.toggleEditMode._uiWrapped) {
            var originalToggle = window.toggleEditMode;
            var wrappedToggle = function () {
                var entering = !getEditMode();
                if (entering) captureOfficeBaseline();
                var result = originalToggle.apply(window, arguments);
                document.body.classList.toggle('ui-office-editing', getEditMode());
                if (getEditMode()) window.setTimeout(enhanceCatalog, 0);
                return result;
            };
            wrappedToggle._uiWrapped = true;
            window.toggleEditMode = wrappedToggle;
        }

        if (typeof window.saveEdits === 'function' && !window.saveEdits._uiWrapped) {
            var originalSave = window.saveEdits;
            var wrappedSave = function () {
                var result = originalSave.apply(window, arguments);
                captureOfficeBaseline();
                return result;
            };
            wrappedSave._uiWrapped = true;
            window.saveEdits = wrappedSave;
        }

        if (typeof window._selectCatalogItem === 'function' && !window._selectCatalogItem._uiWrapped) {
            var originalSelect = window._selectCatalogItem;
            var wrappedSelect = function (type) {
                rememberRecentFurniture(type);
                var result = originalSelect.apply(window, arguments);
                renderCatalogQuickLinks();
                return result;
            };
            wrappedSelect._uiWrapped = true;
            window._selectCatalogItem = wrappedSelect;
        }
    }

    function getFurniturePrefs(key) {
        return safeJson(localStorage.getItem(key) || '[]', []);
    }

    function setFurniturePrefs(key, value) {
        localStorage.setItem(key, JSON.stringify(value.slice(0, 12)));
    }

    function rememberRecentFurniture(type) {
        var recent = getFurniturePrefs('vo-ui-recent-furniture').filter(function (item) { return item !== type; });
        recent.unshift(type);
        setFurniturePrefs('vo-ui-recent-furniture', recent);
    }

    function toggleFurnitureFavorite(type) {
        var favorites = getFurniturePrefs('vo-ui-favorite-furniture');
        var index = favorites.indexOf(type);
        if (index >= 0) favorites.splice(index, 1);
        else favorites.unshift(type);
        setFurniturePrefs('vo-ui-favorite-furniture', favorites);
        decorateCatalogItems();
        renderCatalogQuickLinks();
    }

    function furnitureInfo(type) {
        var item = null;
        if (typeof CATALOG_CATEGORIES !== 'undefined') {
            CATALOG_CATEGORIES.some(function (category) {
                item = (category.items || []).find(function (candidate) { return candidate.type === type; });
                return !!item;
            });
        }
        return item;
    }

    function decorateCatalogItems() {
        var panel = document.getElementById('furniture-catalog');
        if (!panel) return;
        var favorites = getFurniturePrefs('vo-ui-favorite-furniture');
        panel.querySelectorAll('.catalog-item').forEach(function (item) {
            var type = item.dataset.type;
            item.setAttribute('role', 'button');
            item.setAttribute('tabindex', '0');
            item.setAttribute('aria-label', 'Place ' + ((item.querySelector('.catalog-label') || {}).textContent || type));
            item.addEventListener('keydown', function (event) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    if (typeof window._selectCatalogItem === 'function') window._selectCatalogItem(type);
                }
            });
            if (!item.querySelector('.catalog-item-meta')) {
                var bounds = typeof FURNITURE_BOUNDS !== 'undefined' && FURNITURE_BOUNDS[type];
                var meta = make('span', 'catalog-item-meta', bounds ? Math.round(bounds.w) + ' × ' + Math.round(bounds.h) + ' px' : 'Office object');
                item.appendChild(meta);
            }
            var favorite = item.querySelector('.catalog-fav');
            if (!favorite) {
                favorite = make('button', 'catalog-fav', '★');
                favorite.type = 'button';
                favorite.title = 'Add or remove favorite';
                favorite.addEventListener('click', function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleFurnitureFavorite(type);
                });
                item.appendChild(favorite);
            }
            favorite.classList.toggle('active', favorites.indexOf(type) >= 0);
        });
    }

    function renderCatalogQuickLinks() {
        var panel = document.getElementById('furniture-catalog');
        var body = panel && panel.querySelector('.catalog-body');
        if (!body) return;
        var existing = body.querySelector('.catalog-quick');
        if (existing) existing.remove();
        var favorites = getFurniturePrefs('vo-ui-favorite-furniture');
        var recent = getFurniturePrefs('vo-ui-recent-furniture');
        if (!favorites.length && !recent.length) return;
        var quick = make('div', 'catalog-quick');
        function addGroup(label, values) {
            if (!values.length) return;
            quick.appendChild(make('div', 'catalog-quick-title', label));
            var grid = make('div', 'catalog-quick-grid');
            values.slice(0, 4).forEach(function (type) {
                var info = furnitureInfo(type);
                if (!info) return;
                var item = make('div', 'catalog-quick-item');
                item.setAttribute('role', 'button');
                item.setAttribute('tabindex', '0');
                item.innerHTML = '<span class="catalog-icon"></span><span class="catalog-label"></span>';
                item.querySelector('.catalog-icon').textContent = info.icon;
                item.querySelector('.catalog-label').textContent = info.label;
                function choose() {
                    if (typeof window._selectCatalogItem === 'function') window._selectCatalogItem(type);
                }
                item.addEventListener('click', choose);
                item.addEventListener('keydown', function (event) {
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); }
                });
                grid.appendChild(item);
            });
            quick.appendChild(grid);
        }
        addGroup('Favorites', favorites);
        addGroup('Recently used', recent);
        body.insertBefore(quick, body.firstChild);
    }

    function showCatalogPane(name) {
        var panel = document.getElementById('furniture-catalog');
        if (!panel) return;
        panel.querySelectorAll('.catalog-tabs button').forEach(function (button) {
            button.classList.toggle('active', button.dataset.pane === name);
        });
        panel.querySelectorAll('[data-catalog-pane]').forEach(function (pane) {
            pane.hidden = pane.dataset.catalogPane !== name;
        });
        var objectsView = document.getElementById('office-editor-objects-view');
        var layoutsView = document.getElementById('office-editor-layouts-view');
        if (objectsView) objectsView.classList.toggle('active', name !== 'layouts');
        if (layoutsView) layoutsView.classList.toggle('active', name === 'layouts');
        if (name === 'layouts' && window.OfficeLayouts) window.OfficeLayouts.open();
    }

    function enhanceCatalog() {
        var panel = document.getElementById('furniture-catalog');
        if (!panel || panel.dataset.modernized) return;
        panel.dataset.modernized = 'true';
        panel.setAttribute('aria-label', 'Office editor library');
        var header = panel.querySelector('.catalog-header');
        var title = header && header.querySelector('span');
        if (title) {
            title.classList.add('catalog-title');
            title.textContent = 'OFFICE EDITOR';
        }

        var tools = make('div', 'catalog-tools');
        var search = make('input', 'catalog-search');
        search.type = 'search';
        search.placeholder = 'Search furniture';
        search.setAttribute('aria-label', 'Search furniture');
        var tabs = make('div', 'catalog-tabs');
        [
            { id: 'objects', label: 'Objects' },
            { id: 'layouts', label: 'Layouts' },
            { id: 'floor', label: 'Floor' },
            { id: 'zones', label: 'Snap' },
            { id: 'pet', label: 'Pet' }
        ].forEach(function (tab) {
            var button = make('button', '', tab.label);
            button.type = 'button';
            button.dataset.pane = tab.id;
            button.addEventListener('click', function () { showCatalogPane(tab.id); });
            tabs.appendChild(button);
        });
        tools.appendChild(search);
        tools.appendChild(tabs);
        header.parentNode.insertBefore(tools, header.nextSibling);

        var body = panel.querySelector('.catalog-body');
        var supplemental = Array.prototype.slice.call(panel.querySelectorAll('#office-editor-objects-view > .catalog-snap-section'));
        var layoutsPane = panel.querySelector('#office-editor-layouts-view');
        if (body) body.dataset.catalogPane = 'objects';
        if (supplemental[0]) supplemental[0].dataset.catalogPane = 'zones';
        if (supplemental[1]) supplemental[1].dataset.catalogPane = 'floor';
        if (supplemental[2]) supplemental[2].dataset.catalogPane = 'pet';
        if (layoutsPane) layoutsPane.dataset.catalogPane = 'layouts';

        search.addEventListener('input', function () {
            var query = search.value.trim().toLowerCase();
            panel.querySelectorAll('.catalog-section').forEach(function (section) {
                var visible = 0;
                section.querySelectorAll('.catalog-item').forEach(function (item) {
                    var match = !query || item.textContent.toLowerCase().indexOf(query) >= 0 ||
                        (item.dataset.type || '').toLowerCase().indexOf(query) >= 0;
                    item.style.display = match ? '' : 'none';
                    if (match) visible += 1;
                });
                section.style.display = visible ? '' : 'none';
            });
        });

        decorateCatalogItems();
        renderCatalogQuickLinks();
        showCatalogPane('objects');
    }

    function currentAgentObject() {
        if (!window.agents || !window._agentPanelSelectedId) return null;
        return window.agents.find(function (agent) { return agent.id === window._agentPanelSelectedId; }) || null;
    }

    function captureAgentBaseline(agent) {
        if (!agent || !window._agentPanelEditState) return;
        var cfgIndex = (window.officeConfig.agents || []).findIndex(function (entry) { return entry.id === agent.id; });
        uiAgentBaseline = {
            id: agent.id,
            editState: JSON.parse(JSON.stringify(window._agentPanelEditState)),
            configIndex: cfgIndex,
            configEntry: cfgIndex >= 0 ? JSON.parse(JSON.stringify(window.officeConfig.agents[cfgIndex])) : null
        };
    }

    function discardAgentChanges(rebuild) {
        if (!uiAgentBaseline || !window.agents) return;
        var baseline = JSON.parse(JSON.stringify(uiAgentBaseline.editState));
        var agent = window.agents.find(function (entry) { return entry.id === uiAgentBaseline.id; });
        if (agent) {
            ['name', 'role', 'emoji', 'color', 'gender', 'branch', 'statusKey'].forEach(function (key) {
                if (baseline[key] !== undefined) agent[key] = baseline[key];
            });
            agent.appearance = JSON.parse(JSON.stringify(baseline.appearance || {}));
        }
        if (!window.officeConfig.agents) window.officeConfig.agents = [];
        var currentIndex = window.officeConfig.agents.findIndex(function (entry) { return entry.id === uiAgentBaseline.id; });
        if (uiAgentBaseline.configEntry) {
            if (currentIndex >= 0) window.officeConfig.agents[currentIndex] = JSON.parse(JSON.stringify(uiAgentBaseline.configEntry));
            else window.officeConfig.agents.push(JSON.parse(JSON.stringify(uiAgentBaseline.configEntry)));
        } else if (currentIndex >= 0) {
            window.officeConfig.agents.splice(currentIndex, 1);
        }
        window._acpUnsaved = false;
        if (rebuild !== false && typeof window._acpSelectAgent === 'function') {
            window._acpSelectAgent(uiAgentBaseline.id);
        }
    }

    function requestAgentSelection(agentId) {
        if (agentId === window._agentPanelSelectedId) return;
        if (window._acpUnsaved) {
            if (window.confirm('Save changes to the current agent before switching?')) {
                if (typeof window._acpSave === 'function') window._acpSave();
                window._acpUnsaved = false;
            } else if (window.confirm('Discard the current agent changes?')) {
                discardAgentChanges(false);
            } else {
                refreshMobileAgentPicker();
                return;
            }
        }
        if (typeof window._acpSelectAgent === 'function') window._acpSelectAgent(agentId);
    }

    function enhanceAgentList() {
        var panel = document.getElementById('agent-creator-panel');
        var list = document.getElementById('acp-agent-list');
        if (!panel || !list || !window.agents) return;
        var cards = Array.prototype.slice.call(list.querySelectorAll('.agent-card'));
        cards.forEach(function (card, index) {
            var agent = window.agents[index];
            if (!agent) return;
            card.dataset.agentId = agent.id;
            card.dataset.branch = agent.branch || 'UNASSIGNED';
            card.onclick = function () { requestAgentSelection(agent.id); };
            var badge = card.querySelector('.agent-card-branch');
            if (!badge) {
                badge = make('span', 'agent-card-branch');
                card.appendChild(badge);
            }
            badge.textContent = typeof window.getBranchDisplayName === 'function'
                ? window.getBranchDisplayName(agent.branch || 'UNASSIGNED')
                : (agent.branch || 'Unassigned');
        });
        applyAgentFilters();
        refreshMobileAgentPicker();
    }

    function applyAgentFilters() {
        var panel = document.getElementById('agent-creator-panel');
        if (!panel) return;
        var queryEl = panel.querySelector('#ui-agent-search');
        var branchEl = panel.querySelector('#ui-agent-branch-filter');
        var query = queryEl ? queryEl.value.trim().toLowerCase() : '';
        var branch = branchEl ? branchEl.value : '';
        panel.querySelectorAll('.agent-card').forEach(function (card) {
            var text = card.textContent.toLowerCase();
            var visible = (!query || text.indexOf(query) >= 0) && (!branch || card.dataset.branch === branch);
            card.style.display = visible ? '' : 'none';
        });
    }

    function refreshMobileAgentPicker() {
        var picker = document.getElementById('ui-agent-mobile-select');
        if (!picker || !window.agents) return;
        var selected = window._agentPanelSelectedId;
        picker.innerHTML = '';
        window.agents.forEach(function (agent) {
            var option = document.createElement('option');
            option.value = agent.id;
            option.textContent = agent.emoji + ' ' + agent.name + ' — ' + (agent.branch || 'Unassigned');
            if (agent.id === selected) option.selected = true;
            picker.appendChild(option);
        });
    }

    function enhanceAgentPanel() {
        var panel = document.getElementById('agent-creator-panel');
        if (!panel || panel.dataset.modernized) return;
        panel.dataset.modernized = 'true';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-label', 'Agent Studio');
        var title = panel.querySelector('.agent-panel-title');
        if (title) title.textContent = 'AGENT STUDIO';

        var body = panel.querySelector('.agent-panel-body');
        var add = panel.querySelector('.agent-add-btn');
        var list = document.getElementById('acp-agent-list');
        if (!body || !add || !list) return;
        var filters = make('div', 'ui-agent-filters');
        var search = make('input', '');
        search.id = 'ui-agent-search';
        search.type = 'search';
        search.placeholder = 'Search agents';
        search.setAttribute('aria-label', 'Search agents');
        var branch = make('select', '');
        branch.id = 'ui-agent-branch-filter';
        branch.setAttribute('aria-label', 'Filter agents by branch');
        var all = document.createElement('option');
        all.value = '';
        all.textContent = 'All branches';
        branch.appendChild(all);
        var branchNames = {};
        (window.agents || []).forEach(function (agent) { branchNames[agent.branch || 'UNASSIGNED'] = true; });
        Object.keys(branchNames).sort().forEach(function (name) {
            var option = document.createElement('option');
            option.value = name;
            option.textContent = name === 'UNASSIGNED' ? 'Unassigned' : name;
            branch.appendChild(option);
        });
        search.addEventListener('input', applyAgentFilters);
        branch.addEventListener('change', applyAgentFilters);
        filters.appendChild(search);
        filters.appendChild(branch);
        body.insertBefore(filters, list);

        var mobile = make('div', 'ui-agent-mobile-picker');
        var mobileSelect = make('select', '');
        mobileSelect.id = 'ui-agent-mobile-select';
        mobileSelect.setAttribute('aria-label', 'Choose agent');
        mobileSelect.addEventListener('change', function () { requestAgentSelection(mobileSelect.value); });
        var mobileAdd = make('button', '', '+ New');
        mobileAdd.type = 'button';
        mobileAdd.addEventListener('click', function () { add.click(); });
        mobile.appendChild(mobileSelect);
        mobile.appendChild(mobileAdd);
        body.insertBefore(mobile, body.firstChild);
        enhanceAgentList();
    }

    function sectionName(section) {
        var title = section.querySelector('.agent-section-header');
        return title ? title.textContent.replace(/─/g, '').trim().toLowerCase() : '';
    }

    function showAgentTab(tab) {
        uiAgentTab = tab;
        var editor = document.getElementById('acp-editor');
        if (!editor) return;
        editor.querySelectorAll('.agent-editor-tabs button').forEach(function (button) {
            button.classList.toggle('active', button.dataset.tab === tab);
        });
        editor.querySelectorAll('.agent-edit-section').forEach(function (section) {
            var name = sectionName(section);
            var sectionTab = name === 'identity' ? 'identity' :
                (name === 'assignment' ? 'assignment' : 'appearance');
            section.hidden = sectionTab !== tab;
        });
        var advanced = editor.querySelector('.ui-agent-advanced');
        if (advanced) advanced.hidden = tab !== 'advanced';
        var deleteWrap = editor.querySelector('.agent-delete-wrap');
        if (deleteWrap) deleteWrap.style.display = tab === 'advanced' ? '' : 'none';
        var sections = editor.querySelector('.agent-sections-wrap');
        if (sections) sections.scrollTop = 0;
    }

    function enhanceAgentEditor(agent) {
        var editor = document.getElementById('acp-editor');
        if (!editor) return;
        var editBar = document.getElementById('acp-save-btn');
        editBar = editBar && editBar.parentElement;
        if (editBar) {
            editBar.classList.add('agent-edit-bar');
            if (!document.getElementById('acp-discard-btn')) {
                var discard = make('button', '', 'Discard');
                discard.id = 'acp-discard-btn';
                discard.type = 'button';
                discard.addEventListener('click', function () {
                    if (!window._acpUnsaved || window.confirm('Discard unsaved changes for this agent?')) {
                        discardAgentChanges(true);
                    }
                });
                editBar.insertBefore(discard, editBar.firstChild);
            }
        }

        var sections = editor.querySelector('.agent-sections-wrap');
        if (sections && !sections.querySelector('.agent-editor-tabs')) {
            var tabs = make('div', 'agent-editor-tabs');
            [
                { id: 'identity', label: 'Identity' },
                { id: 'appearance', label: 'Appearance' },
                { id: 'assignment', label: 'Assignment' },
                { id: 'advanced', label: 'Advanced' }
            ].forEach(function (tab) {
                var button = make('button', '', tab.label);
                button.type = 'button';
                button.dataset.tab = tab.id;
                button.addEventListener('click', function () { showAgentTab(tab.id); });
                tabs.appendChild(button);
            });
            sections.insertBefore(tabs, sections.firstChild);

            var advanced = make('section', 'ui-agent-advanced');
            advanced.hidden = true;
            var current = agent || currentAgentObject() || {};
            advanced.innerHTML = '<dl>' +
                '<dt>Virtual Office ID</dt><dd></dd>' +
                '<dt>Provider</dt><dd></dd>' +
                '<dt>Runtime key</dt><dd></dd>' +
                '</dl>';
            var values = advanced.querySelectorAll('dd');
            values[0].textContent = current.id || '—';
            values[1].textContent = current.providerKind || current.providerType || 'OpenClaw';
            values[2].textContent = current.statusKey || 'Not assigned';
            sections.appendChild(advanced);
        }

        var previewBranch = editor.querySelector('#acp-preview-branch');
        if (previewBranch) previewBranch.classList.add('agent-preview-branch');
        editor.querySelectorAll('.swatch').forEach(function (swatch) {
            swatch.setAttribute('role', 'button');
            swatch.setAttribute('tabindex', '0');
            swatch.setAttribute('aria-label', 'Choose color ' + (swatch.title || swatch.style.background));
            swatch.addEventListener('keydown', function (event) {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); swatch.click(); }
            });
        });
        captureAgentBaseline(agent || currentAgentObject());
        showAgentTab(uiAgentTab || 'identity');
        refreshMobileAgentPicker();
    }

    function wrapAgentEditor() {
        if (typeof window._buildAgentPanel === 'function' && !window._buildAgentPanel._uiWrapped) {
            var originalBuild = window._buildAgentPanel;
            var wrappedBuild = function () {
                var result = originalBuild.apply(window, arguments);
                enhanceAgentPanel();
                return result;
            };
            wrappedBuild._uiWrapped = true;
            window._buildAgentPanel = wrappedBuild;
        }

        if (typeof window._acpRefreshList === 'function' && !window._acpRefreshList._uiWrapped) {
            var originalRefresh = window._acpRefreshList;
            var wrappedRefresh = function () {
                var result = originalRefresh.apply(window, arguments);
                enhanceAgentList();
                return result;
            };
            wrappedRefresh._uiWrapped = true;
            window._acpRefreshList = wrappedRefresh;
        }

        if (typeof window._acpBuildEditor === 'function' && !window._acpBuildEditor._uiWrapped) {
            var originalEditor = window._acpBuildEditor;
            var wrappedEditor = function (agent) {
                var result = originalEditor.apply(window, arguments);
                enhanceAgentEditor(agent);
                return result;
            };
            wrappedEditor._uiWrapped = true;
            window._acpBuildEditor = wrappedEditor;
        }

        if (typeof window._acpSave === 'function' && !window._acpSave._uiWrapped) {
            var originalSave = window._acpSave;
            var wrappedSave = function () {
                var result = originalSave.apply(window, arguments);
                window._acpUnsaved = false;
                captureAgentBaseline(currentAgentObject());
                return result;
            };
            wrappedSave._uiWrapped = true;
            window._acpSave = wrappedSave;
        }

        if (typeof window.toggleAgentPanel === 'function' && !window.toggleAgentPanel._uiWrapped) {
            var originalToggle = window.toggleAgentPanel;
            var wrappedToggle = function () {
                var panel = document.getElementById('agent-creator-panel');
                var closing = panel && panel.classList.contains('visible');
                if (closing && window._acpUnsaved && !uiBypassCloseGuard) {
                    if (window.confirm('Save changes to this agent before closing?')) {
                        if (typeof window._acpSave === 'function') window._acpSave();
                    } else if (window.confirm('Discard the unsaved agent changes?')) {
                        discardAgentChanges(false);
                    } else {
                        return;
                    }
                }
                var result = originalToggle.apply(window, arguments);
                enhanceAgentPanel();
                enhanceAgentList();
                syncScrim();
                return result;
            };
            wrappedToggle._uiWrapped = true;
            window.toggleAgentPanel = wrappedToggle;
        }
    }

    function normalizeWindowAccessibility() {
        document.querySelectorAll('.modal').forEach(function (modal) {
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
        });
        document.querySelectorAll('.close-btn, .catalog-close-btn').forEach(function (button) {
            if (!button.getAttribute('aria-label')) button.setAttribute('aria-label', 'Close');
        });
    }

    function installObservers() {
        var observer = new MutationObserver(function (records) {
            var shouldSync = false;
            records.forEach(function (record) {
                if (record.type === 'childList') {
                    record.addedNodes.forEach(function (node) {
                        if (!(node instanceof HTMLElement)) return;
                        if (node.id === 'furniture-catalog' || node.querySelector('#furniture-catalog')) enhanceCatalog();
                        if (node.id === 'agent-creator-panel' || node.querySelector('#agent-creator-panel')) enhanceAgentPanel();
                        if (node.id === 'acp-editor' || node.querySelector('#acp-editor')) enhanceAgentEditor(currentAgentObject());
                    });
                    enhanceHermesRows();
                }
                if (record.type === 'attributes') shouldSync = true;
            });
            if (shouldSync) syncScrim();
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }

    function init() {
        applyTheme(currentTheme(), false);
        ensureScrim();
        enhanceSettings();
        enhanceToolbar();
        wrapSettingsFunctions();
        wrapOfficeEditor();
        wrapAgentEditor();
        enhanceCatalog();
        enhanceAgentPanel();
        normalizeWindowAccessibility();
        installObservers();
        document.body.classList.toggle('ui-office-editing', getEditMode());

    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
