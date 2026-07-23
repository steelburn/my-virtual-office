(function () {
    'use strict';

    var root = null;
    var layouts = [];
    var placingAsset = null;
    var placementMessage = '';
    var lastPlacementState = null;
    var LAYOUT_OBJECT_CLEARANCE = 2;
    var LAYOUT_WALL_HALF_THICKNESS = 5;

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function request(url, options) {
        var response = await fetch(url, options || {});
        var data;
        try { data = await response.json(); }
        catch (e) { data = { ok: false, error: 'Invalid server response' }; }
        if (!response.ok || data.ok === false) throw new Error(data.error || ('Request failed (' + response.status + ')'));
        return data;
    }

    function setStatus(message, kind) {
        placementMessage = message || '';
        var status = root && root.querySelector('[data-layout-status]');
        if (!status) return;
        status.textContent = placementMessage;
        status.dataset.kind = kind || '';
    }

    function selectedIds() {
        var furnitureIds = _multiSelected.slice();
        if (!furnitureIds.length && selectedItemId) furnitureIds.push(selectedItemId);
        var wallIndexes = _multiSelectedWalls.slice();
        if (!wallIndexes.length && selectedWallIdx !== null) wallIndexes.push(selectedWallIdx);
        return { furniture: furnitureIds, walls: wallIndexes };
    }

    function refreshSelection() {
        if (!root) return;
        var selected = selectedIds();
        var count = selected.furniture.length + selected.walls.length;
        var label = root.querySelector('[data-layout-selection]');
        var saveButton = root.querySelector('[data-layout-save-selection]');
        if (label) {
            label.textContent = count
                ? selected.furniture.length + ' object' + (selected.furniture.length === 1 ? '' : 's') + ' + ' + selected.walls.length + ' wall' + (selected.walls.length === 1 ? '' : 's') + ' selected'
                : 'Nothing selected yet';
            label.classList.toggle('has-selection', count > 0);
        }
        if (saveButton) saveButton.disabled = count === 0;
    }

    function metadata() {
        var name = root.querySelector('[data-layout-name]').value.trim();
        var description = root.querySelector('[data-layout-description]').value.trim();
        var author = root.querySelector('[data-layout-author]').value.trim();
        if (!name) throw new Error('Give this layout a name first.');
        try { localStorage.setItem('vo-layout-author', author); } catch (e) {}
        return { name: name, description: description, author: author };
    }

    function stripFurniture(item) {
        var result = clone(item);
        delete result.id;
        delete result.assignedTo;
        return result;
    }

    function captureSelection() {
        var meta = metadata();
        var selected = selectedIds();
        if (!selected.furniture.length && !selected.walls.length) throw new Error('Select furniture, labels, and/or walls first.');

        var selectedFurniture = selected.furniture.map(function (id) {
            return officeConfig.furniture.find(function (item) { return item.id === id; });
        }).filter(Boolean);
        var selectedWalls = selected.walls.map(function (index) {
            return (officeConfig.walls.interior || [])[index];
        }).filter(Boolean);
        if (!selectedFurniture.length && !selectedWalls.length) {
            throw new Error('That selection is no longer available. Select the area again.');
        }

        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        selectedFurniture.forEach(function (item) {
            var rect = _getItemWorldRect(item);
            minX = Math.min(minX, rect.x);
            minY = Math.min(minY, rect.y);
            maxX = Math.max(maxX, rect.x + rect.w);
            maxY = Math.max(maxY, rect.y + rect.h);
        });
        selectedWalls.forEach(function (wall) {
            minX = Math.min(minX, wall.x1 * TILE, wall.x2 * TILE);
            minY = Math.min(minY, wall.y1 * TILE, wall.y2 * TILE);
            maxX = Math.max(maxX, wall.x1 * TILE, wall.x2 * TILE);
            maxY = Math.max(maxY, wall.y1 * TILE, wall.y2 * TILE);
        });
        var originX = Math.floor(minX / TILE) * TILE;
        var originY = Math.floor(minY / TILE) * TILE;
        var width = Math.max(TILE, Math.ceil((maxX - originX) / TILE) * TILE);
        var height = Math.max(TILE, Math.ceil((maxY - originY) / TILE) * TILE);

        return {
            format: 'my-virtual-office-layout',
            version: 1,
            name: meta.name,
            description: meta.description,
            author: meta.author,
            kind: 'selection',
            bounds: { width: width, height: height },
            objects: {
                furniture: selectedFurniture.map(function (item) {
                    var result = stripFurniture(item);
                    result.x -= originX;
                    result.y -= originY;
                    return result;
                }),
                walls: selectedWalls.map(function (wall) {
                    var result = clone(wall);
                    result.x1 -= originX / TILE;
                    result.x2 -= originX / TILE;
                    result.y1 -= originY / TILE;
                    result.y2 -= originY / TILE;
                    return result;
                })
            }
        };
    }

    async function saveAsset(asset) {
        setStatus('Saving layout…');
        await request('/api/layouts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(asset)
        });
        root.querySelector('[data-layout-name]').value = '';
        root.querySelector('[data-layout-description]').value = '';
        setStatus('Layout saved to My Layouts.', 'success');
        await loadLayouts();
    }

    function renderLayouts() {
        if (!root) return;
        var list = root.querySelector('[data-layout-list]');
        if (!list) return;
        if (!layouts.length) {
            list.innerHTML = '<div class="layout-empty">No layouts available.</div>';
            return;
        }
        list.innerHTML = layouts.map(function (layout) {
            var counts = layout.counts || {};
            var primaryAction = '<button class="layout-btn primary" data-layout-place="' + escapeHtml(layout.id) + '">Place Layout</button>';
            var deleteAction = layout.readOnly ? '' : '<button class="layout-icon-btn danger" title="Delete" data-layout-delete="' + escapeHtml(layout.id) + '">🗑️</button>';
            return '<article class="layout-card' + (layout.readOnly ? ' bundled' : '') + '">' +
                '<div class="layout-card-heading"><span class="layout-card-icon">' + (layout.readOnly ? '🏢' : '🧩') + '</span>' +
                    '<div><strong>' + escapeHtml(layout.name) + '</strong><span>' + escapeHtml(layout.readOnly ? 'Built in' : (layout.author || 'Local layout')) + '</span></div></div>' +
                '<p>' + escapeHtml(layout.description || 'Reusable office layout asset.') + '</p>' +
                '<div class="layout-card-meta">' + (counts.furniture || 0) + ' objects · ' + (counts.walls || 0) + ' walls · ' + Math.round((layout.bounds || {}).width || 0) + '×' + Math.round((layout.bounds || {}).height || 0) + '</div>' +
                '<div class="layout-card-actions">' + primaryAction +
                    '<button class="layout-icon-btn" title="Download JSON" data-layout-download="' + escapeHtml(layout.id) + '">⬇️</button>' + deleteAction + '</div>' +
                '</article>';
        }).join('');
    }

    async function loadLayouts() {
        if (!root) return;
        root.querySelector('[data-layout-list]').innerHTML = '<div class="layout-empty">Loading layouts…</div>';
        try {
            var data = await request('/api/layouts');
            layouts = data.layouts || [];
            renderLayouts();
        } catch (error) {
            root.querySelector('[data-layout-list]').innerHTML = '<div class="layout-empty error">' + escapeHtml(error.message) + '</div>';
        }
    }

    async function getAsset(layoutId) {
        return await request('/api/layouts/' + encodeURIComponent(layoutId));
    }

    async function startPlacement(layoutId) {
        try {
            placingAsset = await getAsset(layoutId);
            lastPlacementState = null;
            placingType = null;
            selectedItemId = null;
            selectedWallIdx = null;
            _multiSelected = [];
            _multiSelectedWalls = [];
            if (_catalogPanel) _catalogPanel.classList.remove('visible');
            canvas.style.cursor = 'copy';
            canvas.dataset.layoutPlacementState = 'pending';
            delete canvas.dataset.layoutPlacementReason;
            setStatus('Move over the office and click a tile to place “' + placingAsset.name + '”. Esc cancels.', 'active');
            refreshSelection();
        } catch (error) {
            setStatus(error.message, 'error');
        }
    }

    function cancelPlacement() {
        if (!placingAsset) return;
        placingAsset = null;
        lastPlacementState = null;
        canvas.style.cursor = '';
        delete canvas.dataset.layoutPlacementState;
        delete canvas.dataset.layoutPlacementReason;
        if (_catalogPanel && editMode) _catalogPanel.classList.add('visible');
        setStatus('Layout placement cancelled.');
    }

    function isPlacing() {
        return !!placingAsset;
    }

    function placementOrigin(worldX, worldY) {
        return {
            x: Math.floor(worldX / TILE) * TILE,
            y: Math.floor(worldY / TILE) * TILE
        };
    }

    function rectsOverlap(a, b, clearance) {
        var gap = clearance || 0;
        return a.x - gap < b.x + b.w && a.x + a.w + gap > b.x &&
            a.y - gap < b.y + b.h && a.y + a.h + gap > b.y;
    }

    function rectInsideCanvas(rect) {
        return rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= W && rect.y + rect.h <= H;
    }

    function placedItem(raw, origin) {
        var item = clone(raw);
        item.x += origin.x;
        item.y += origin.y;
        return item;
    }

    function wallRect(raw, origin) {
        var x1 = origin.x + raw.x1 * TILE;
        var y1 = origin.y + raw.y1 * TILE;
        var x2 = origin.x + raw.x2 * TILE;
        var y2 = origin.y + raw.y2 * TILE;
        var half = LAYOUT_WALL_HALF_THICKNESS;
        return {
            x: Math.min(x1, x2) - half,
            y: Math.min(y1, y2) - half,
            w: Math.max(1, Math.abs(x2 - x1)) + half * 2,
            h: Math.max(1, Math.abs(y2 - y1)) + half * 2
        };
    }

    function wallEndpointsInsideCanvas(raw, origin) {
        var x1 = origin.x + raw.x1 * TILE;
        var y1 = origin.y + raw.y1 * TILE;
        var x2 = origin.x + raw.x2 * TILE;
        var y2 = origin.y + raw.y2 * TILE;
        return x1 >= 0 && x1 <= W && y1 >= 0 && y1 <= H &&
            x2 >= 0 && x2 <= W && y2 >= 0 && y2 <= H;
    }

    function invalidPlacement(code, reason, origin) {
        return { valid: false, code: code, reason: reason, origin: origin };
    }

    function placementCheck(asset, origin) {
        var bounds = asset.bounds || {};
        if (origin.x < 0 || origin.y < 0 ||
            origin.x + Number(bounds.width || 0) > W ||
            origin.y + Number(bounds.height || 0) > H) {
            return invalidPlacement('outside', 'Not enough canvas space. Move the layout inward or expand the office.', origin);
        }

        var incomingItems = (asset.objects.furniture || []).map(function (raw) {
            var item = placedItem(raw, origin);
            return { item: item, rect: _getItemWorldRect(item) };
        });
        var incomingWalls = (asset.objects.walls || []).map(function (raw) {
            return { wall: raw, rect: wallRect(raw, origin) };
        });
        var existingItems = (officeConfig.furniture || []).map(function (item) {
            return { item: item, rect: _getItemWorldRect(item) };
        });
        var existingWalls = ((officeConfig.walls && officeConfig.walls.interior) || []).map(function (wall) {
            return { wall: wall, rect: wallRect(wall, { x: 0, y: 0 }) };
        });

        for (var i = 0; i < incomingItems.length; i++) {
            if (!rectInsideCanvas(incomingItems[i].rect)) {
                return invalidPlacement('outside', 'Part of this layout would be outside the canvas.', origin);
            }
        }
        for (var w = 0; w < incomingWalls.length; w++) {
            if (!wallEndpointsInsideCanvas(incomingWalls[w].wall, origin)) {
                return invalidPlacement('outside', 'Part of this layout would be outside the canvas.', origin);
            }
        }

        for (var ii = 0; ii < incomingItems.length; ii++) {
            for (var ei = 0; ei < existingItems.length; ei++) {
                if (rectsOverlap(incomingItems[ii].rect, existingItems[ei].rect, LAYOUT_OBJECT_CLEARANCE)) {
                    return invalidPlacement('object', 'Blocked by an existing object. Move the layout to a clear area.', origin);
                }
            }
            for (var ew = 0; ew < existingWalls.length; ew++) {
                if (rectsOverlap(incomingItems[ii].rect, existingWalls[ew].rect, LAYOUT_OBJECT_CLEARANCE)) {
                    return invalidPlacement('wall', 'Blocked by an existing wall. Move the layout to a clear area.', origin);
                }
            }
        }

        for (var iw = 0; iw < incomingWalls.length; iw++) {
            for (var existingItemIndex = 0; existingItemIndex < existingItems.length; existingItemIndex++) {
                if (rectsOverlap(incomingWalls[iw].rect, existingItems[existingItemIndex].rect, LAYOUT_OBJECT_CLEARANCE)) {
                    return invalidPlacement('object', 'A layout wall would intersect an existing object.', origin);
                }
            }
            for (var existingWallIndex = 0; existingWallIndex < existingWalls.length; existingWallIndex++) {
                if (rectsOverlap(incomingWalls[iw].rect, existingWalls[existingWallIndex].rect, 0)) {
                    return invalidPlacement('wall', 'A layout wall would intersect an existing wall.', origin);
                }
            }
        }

        return { valid: true, code: 'clear', reason: 'Clear to place.', origin: origin };
    }

    function updateCanvasPlacementState(check) {
        lastPlacementState = check;
        canvas.dataset.layoutPlacementState = check.valid ? 'valid' : 'invalid';
        canvas.dataset.layoutPlacementReason = check.code;
        canvas.style.cursor = check.valid ? 'copy' : 'not-allowed';
    }

    function inspectPlacementAt(worldX, worldY) {
        if (!placingAsset) return null;
        return placementCheck(placingAsset, placementOrigin(worldX, worldY));
    }

    function placeAt(worldX, worldY) {
        if (!placingAsset) return false;
        var asset = placingAsset;
        var origin = placementOrigin(worldX, worldY);
        var check = placementCheck(asset, origin);
        updateCanvasPlacementState(check);
        if (!check.valid) {
            setStatus(check.reason + ' Keep moving the preview, then click a green location.', 'error');
            return true;
        }

        _pushUndo();
        var firstWall = (officeConfig.walls.interior || []).length;
        if (!officeConfig.walls.interior) officeConfig.walls.interior = [];
        var newIds = [];
        (asset.objects.furniture || []).forEach(function (raw) {
            var item = clone(raw);
            item.id = _generateFurnitureId();
            item.x += origin.x;
            item.y += origin.y;
            delete item.assignedTo;
            officeConfig.furniture.push(item);
            newIds.push(item.id);
        });
        (asset.objects.walls || []).forEach(function (raw) {
            var wall = clone(raw);
            wall.x1 += origin.x / TILE;
            wall.x2 += origin.x / TILE;
            wall.y1 += origin.y / TILE;
            wall.y2 += origin.y / TILE;
            officeConfig.walls.interior.push(wall);
        });
        _multiSelected = newIds;
        _multiSelectedWalls = (asset.objects.walls || []).map(function (_, index) { return firstWall + index; });
        selectedItemId = null;
        selectedWallIdx = null;
        placingAsset = null;
        lastPlacementState = null;
        canvas.style.cursor = '';
        delete canvas.dataset.layoutPlacementState;
        delete canvas.dataset.layoutPlacementReason;
        if (_catalogPanel && editMode) _catalogPanel.classList.add('visible');
        getInteractionSpots();
        buildCollisionGrid();
        _syncAllDeskAssignments();
        refreshSelection();
        setStatus('Layout placed as one selected group. Click Save when you are happy with it.', 'success');
        return true;
    }

    function drawPlacementPreview(renderContext) {
        if (!placingAsset || !editHoverTile) return;
        var origin = { x: editHoverTile.tx * TILE, y: editHoverTile.ty * TILE };
        var check = placementCheck(placingAsset, origin);
        var valid = check.valid;
        updateCanvasPlacementState(check);
        renderContext.save();
        renderContext.fillStyle = valid ? 'rgba(0, 230, 118, 0.08)' : 'rgba(244, 67, 54, 0.12)';
        renderContext.fillRect(origin.x, origin.y, placingAsset.bounds.width, placingAsset.bounds.height);
        renderContext.globalAlpha = valid ? 0.46 : 0.24;
        (placingAsset.objects.walls || []).forEach(function (wall) {
            renderContext.strokeStyle = valid ? '#00e5ff' : '#f44336';
            renderContext.lineWidth = 7;
            renderContext.beginPath();
            renderContext.moveTo(origin.x + wall.x1 * TILE, origin.y + wall.y1 * TILE);
            renderContext.lineTo(origin.x + wall.x2 * TILE, origin.y + wall.y2 * TILE);
            renderContext.stroke();
        });
        (placingAsset.objects.furniture || []).forEach(function (raw) {
            var item = clone(raw);
            item.x += origin.x;
            item.y += origin.y;
            drawFurnitureItem(item);
        });
        renderContext.globalAlpha = 1;
        renderContext.shadowColor = valid ? '#00e676' : '#f44336';
        renderContext.shadowBlur = 12;
        renderContext.setLineDash([10, 5]);
        renderContext.strokeStyle = valid ? '#00e676' : '#f44336';
        renderContext.lineWidth = 4;
        renderContext.strokeRect(origin.x + 2, origin.y + 2, Math.max(0, placingAsset.bounds.width - 4), Math.max(0, placingAsset.bounds.height - 4));
        renderContext.shadowBlur = 0;
        renderContext.setLineDash([]);

        var badgeText = valid ? '✓ CLEAR — CLICK TO PLACE' :
            (check.code === 'outside' ? '✕ NOT ENOUGH SPACE' :
                (check.code === 'wall' ? '✕ BLOCKED BY WALL' : '✕ BLOCKED BY OBJECT'));
        renderContext.font = 'bold 12px Arial';
        var badgeWidth = Math.min(W, Math.max(150, renderContext.measureText(badgeText).width + 20));
        var badgeX = Math.max(0, Math.min(W - badgeWidth, origin.x));
        var badgeY = origin.y >= 30 ? origin.y - 28 : Math.min(H - 24, origin.y + 8);
        renderContext.fillStyle = 'rgba(8, 12, 18, 0.88)';
        renderContext.fillRect(badgeX, badgeY, badgeWidth, 22);
        renderContext.fillStyle = valid ? '#70f3ab' : '#ff8a80';
        renderContext.textAlign = 'left';
        renderContext.textBaseline = 'middle';
        var clippedBadgeText = badgeText;
        while (clippedBadgeText.length > 10 && renderContext.measureText(clippedBadgeText).width > badgeWidth - 14) {
            clippedBadgeText = clippedBadgeText.slice(0, -2);
        }
        if (clippedBadgeText !== badgeText) clippedBadgeText += '…';
        renderContext.fillText(clippedBadgeText, badgeX + 8, badgeY + 11);
        renderContext.restore();
    }

    async function deleteLayout(layoutId) {
        var layout = layouts.find(function (item) { return item.id === layoutId; });
        if (!layout || layout.readOnly) return;
        if (!confirm('Delete “' + layout.name + '” from My Layouts?')) return;
        try {
            await request('/api/layouts/' + encodeURIComponent(layoutId), { method: 'DELETE' });
            setStatus('Layout deleted.');
            await loadLayouts();
        } catch (error) {
            setStatus(error.message, 'error');
        }
    }

    async function uploadFile(file) {
        if (!file) return;
        if (file.size > 1500000) {
            setStatus('Layout files must be 1.5 MB or smaller.', 'error');
            return;
        }
        try {
            var parsed = JSON.parse(await file.text());
            await saveAsset(parsed);
            setStatus('Layout uploaded to My Layouts.', 'success');
        } catch (error) {
            setStatus(error.message, 'error');
        }
    }

    function beginAreaSelection() {
        cancelPlacement();
        placingType = null;
        selectedItemId = null;
        selectedWallIdx = null;
        _multiSelected = [];
        _multiSelectedWalls = [];
        _marqueeMode = true;
        _marqueeStart = null;
        _marqueeEnd = null;
        canvas.style.cursor = 'crosshair';
        refreshSelection();
        setStatus('Drag a box over furniture, labels, and walls on the canvas.', 'active');
    }

    function mount(element) {
        root = element;
        if (!canvas.dataset.layoutPlacementLeaveBound) {
            canvas.dataset.layoutPlacementLeaveBound = '1';
            canvas.addEventListener('mouseleave', function () {
                if (!placingAsset) return;
                editHoverTile = null;
                lastPlacementState = null;
                canvas.dataset.layoutPlacementState = 'pending';
                delete canvas.dataset.layoutPlacementReason;
                canvas.style.cursor = 'copy';
            });
        }
        var savedAuthor = '';
        try { savedAuthor = localStorage.getItem('vo-layout-author') || ''; } catch (e) {}
        root.innerHTML =
            '<div class="layout-view-scroll">' +
                '<section class="layout-create-panel">' +
                    '<div class="layout-section-heading"><span>CREATE A LAYOUT</span><button class="layout-link-btn" data-layout-select-area>Select area</button></div>' +
                    '<div class="layout-selection-status" data-layout-selection>Nothing selected yet</div>' +
                    '<input class="layout-input" maxlength="80" placeholder="Layout name" data-layout-name>' +
                    '<textarea class="layout-input" maxlength="500" rows="2" placeholder="Short description" data-layout-description></textarea>' +
                    '<input class="layout-input" maxlength="80" placeholder="Creator name (optional)" value="' + escapeHtml(savedAuthor) + '" data-layout-author>' +
                    '<div class="layout-create-actions"><button class="layout-btn primary" data-layout-save-selection disabled>Save Selected Group</button></div>' +
                '</section>' +
                '<section class="layout-marketplace-panel">' +
                    '<div class="layout-section-heading"><span>LAYOUT MARKETPLACE</span><button class="layout-link-btn" data-layout-refresh>Refresh</button></div>' +
                    '<p class="layout-marketplace-copy">Layouts are reusable groups. Place them without replacing your current office. Upload or download a layout file to share it.</p>' +
                    '<label class="layout-upload-btn">⬆️ Upload Layout<input type="file" accept=".json,.mvo-layout.json,application/json" data-layout-upload></label>' +
                    '<div class="layout-list" data-layout-list></div>' +
                '</section>' +
            '</div>' +
            '<div class="layout-status" data-layout-status></div>';

        root.addEventListener('click', function (event) {
            var button = event.target.closest('button,[data-layout-download]');
            if (!button) return;
            if (button.hasAttribute('data-layout-select-area')) beginAreaSelection();
            else if (button.hasAttribute('data-layout-save-selection')) {
                try { saveAsset(captureSelection()).catch(function (error) { setStatus(error.message, 'error'); }); }
                catch (error) { setStatus(error.message, 'error'); }
            } else if (button.hasAttribute('data-layout-refresh')) loadLayouts();
            else if (button.hasAttribute('data-layout-place')) startPlacement(button.getAttribute('data-layout-place'));
            else if (button.hasAttribute('data-layout-delete')) deleteLayout(button.getAttribute('data-layout-delete'));
            else if (button.hasAttribute('data-layout-download')) {
                window.location.href = '/api/layouts/' + encodeURIComponent(button.getAttribute('data-layout-download')) + '?download=1';
            }
        });
        root.querySelector('[data-layout-upload]').addEventListener('change', function () {
            var file = this.files && this.files[0];
            uploadFile(file);
            this.value = '';
        });
        refreshSelection();
        loadLayouts();
    }

    function open() {
        refreshSelection();
        loadLayouts();
    }

    function notifyUndo() {
        setStatus('Last office edit undone.', 'success');
    }

    window.OfficeLayouts = {
        mount: mount,
        open: open,
        refreshSelection: refreshSelection,
        notifyUndo: notifyUndo,
        isPlacing: isPlacing,
        placeAt: placeAt,
        cancelPlacement: cancelPlacement,
        drawPlacementPreview: drawPlacementPreview,
        inspectPlacementAt: inspectPlacementAt,
        inspectAssetPlacement: function (asset, worldX, worldY) {
            return placementCheck(asset, placementOrigin(worldX, worldY));
        },
        getPlacementState: function () { return lastPlacementState ? clone(lastPlacementState) : null; }
    };
})();
