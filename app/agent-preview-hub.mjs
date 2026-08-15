import { createBrowserWindowController } from './browser-window-controller.mjs?v=20260814-vo-preview-r1';
import { buildBrowserViewerUrl } from './browser-viewer-url.mjs?v=20260814-vo-preview-r1';
import {
  getChatBubbleDisplayScale,
  normalizeChatBubbleDisplaySettings,
} from './chat-bubble-layout.mjs?v=20260814-vo-preview-r1';

const PATH_KEYS = Object.freeze([
  'path', 'file_path', 'filePath', 'file', 'filename', 'output_path', 'outputPath',
  'output_file', 'outputFile', 'artifact_path', 'artifactPath', 'target_path', 'targetPath',
]);
const WORKDIR_KEYS = Object.freeze(['workdir', 'work_dir', 'cwd', 'directory']);
const URL_KEYS = Object.freeze(['url', 'uri', 'href', 'target_url', 'targetUrl']);
const FILE_TOOL_PATTERN = /(^|[._-])(read|write|edit|patch|view[_-]?image|open[_-]?preview|read[_-]?preview|imagegen|image[_-]?gen|video|audio|tts|pdf|artifact)([._-]|$)/i;
const BROWSER_TOOL_PATTERN = /(^|[._-])(browser|agent[_-]?browser|playwright|puppeteer)([._-]|$)/i;
const WEB_TOOL_PATTERN = /(^|[._-])(web[_-]?fetch|fetch[_-]?url|open[_-]?url)([._-]|$)/i;
const MAX_TARGETS = 12;
const PREVIEW_POLL_MS = 2200;
const FILE_VERSION_POLL_MS = 2500;
const PREVIEW_CONTENT_ZOOM_MIN = 50;
const PREVIEW_CONTENT_ZOOM_MAX = 200;
const PREVIEW_BUBBLE_COLLISION_GAP = 10;
const PREVIEW_CLIENT_STATE_STORAGE_KEY = 'vo-agent-preview-state-v1';
const PREVIEW_DISMISSAL_LIMIT = 200;

const KIND_ICONS = Object.freeze({
  browser: '🌐', url: '🔗', html: '🧩', image: '🖼️', pdf: '📕',
  video: '🎬', audio: '🎵', markdown: '📝', code: '⌨️', text: '📄', file: '📄',
});

function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.length > 200000) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function firstString(source, keys) {
  if (!source || typeof source !== 'object') return '';
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function basename(value) {
  const clean = String(value || '').replace(/[?#].*$/, '').replace(/\\/g, '/').replace(/\/+$/, '');
  return clean.split('/').pop() || clean || 'Preview';
}

function safeHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}

function extractPatchPath(value) {
  const text = typeof value === 'string' ? value : '';
  const match = text.match(/^\*\*\* (?:Add|Update) File:\s*(.+)$/m);
  return match ? match[1].trim() : '';
}

function extractResultPath(value) {
  const object = asObject(value);
  const direct = firstString(object, PATH_KEYS);
  if (direct) return direct;
  const text = typeof value === 'string' ? value : '';
  const labeled = text.match(/(?:generated(?:\s+and\s+saved)?|saved|created|written|output)(?:\s+(?:to|at))?[:\s]+([^\n\r]+\.(?:html?|md|txt|json|ya?ml|toml|csv|js|mjs|cjs|ts|tsx|jsx|py|go|rs|java|css|svg|png|jpe?g|gif|webp|pdf|mp4|webm|mov|mp3|wav|ogg))\b/i);
  return labeled ? labeled[1].trim().replace(/^['"`]|['"`]$/g, '') : '';
}

export function normalizePreviewTarget(raw = {}) {
  const agentId = String(raw.agentId || raw.agent || '').trim();
  const requestedKind = String(raw.kind || raw.type || '').trim().toLowerCase();
  const path = String(raw.path || raw.file || '').trim();
  const url = safeHttpUrl(raw.url || (requestedKind === 'url' ? raw.target : ''));
  const kind = requestedKind === 'browser'
    ? 'browser'
    : (url ? 'url' : (path ? 'file' : requestedKind));
  if (!agentId || !['browser', 'url', 'file'].includes(kind)) return null;
  if ((kind === 'url' && !url) || (kind === 'file' && !path)) return null;
  const workdir = String(raw.workdir || raw.cwd || '').trim();
  const title = String(raw.title || raw.label || (kind === 'browser' ? 'Live Agent Browser' : basename(path || url))).trim();
  const normalized = {
    id: String(raw.id || '').trim(),
    agentId,
    kind,
    path: kind === 'file' ? path : '',
    workdir: kind === 'file' ? workdir : '',
    url: kind === 'url' ? url : '',
    title: title || 'Preview',
    source: String(raw.source || 'agent').trim(),
    createdAt: raw.createdAt || new Date().toISOString(),
  };
  const publicationSerial = Number(raw.publicationSerial || raw.serial || 0);
  if (Number.isSafeInteger(publicationSerial) && publicationSerial > 0) normalized.publicationSerial = publicationSerial;
  const runId = String(raw.runId || '').trim();
  const sessionKey = String(raw.sessionKey || '').trim();
  if (runId) normalized.runId = runId;
  if (sessionKey) normalized.sessionKey = sessionKey;
  return normalized;
}

export function previewTargetKey(target) {
  if (!target) return '';
  if (target.kind === 'browser') return `${target.agentId}:browser`;
  if (target.kind === 'url') return `${target.agentId}:url:${target.url}`;
  return `${target.agentId}:file:${target.workdir || ''}:${target.path}`;
}

export function previewTargetsForAgent(targets = [], agentId = '') {
  const normalizedAgentId = String(agentId || '');
  return targets.filter(target => String(target?.agentId || '') === normalizedAgentId);
}

export function resolveAgentPreviewTarget(targets = [], agentId = '', preferredKey = '') {
  const agentTargets = previewTargetsForAgent(targets, agentId);
  if (!agentTargets.length) return null;
  return agentTargets.find(target => previewTargetKey(target) === preferredKey) || agentTargets[agentTargets.length - 1];
}

export function normalizePreviewClientState(value = {}) {
  const source = asObject(value);
  const hiddenBubbleAgents = Array.from(new Set(
    (Array.isArray(source.hiddenBubbleAgents) ? source.hiddenBubbleAgents : [])
      .map(agentId => String(agentId || '').trim())
      .filter(Boolean),
  )).slice(0, 100);
  const dismissals = source.dismissedPublications && typeof source.dismissedPublications === 'object'
    ? source.dismissedPublications
    : {};
  const dismissedPublications = {};
  for (const [key, value] of Object.entries(dismissals).slice(-PREVIEW_DISMISSAL_LIMIT)) {
    const serial = Number(value);
    if (key && Number.isSafeInteger(serial) && serial > 0) dismissedPublications[key] = serial;
  }
  return { hiddenBubbleAgents, dismissedPublications };
}

export function shouldReplayPublishedPreview(record = {}, dismissedPublications = {}) {
  const serial = Number(record.serial || 0);
  const target = normalizePreviewTarget({
    ...(record.target && typeof record.target === 'object' ? record.target : record),
    publicationSerial: serial,
    createdAt: record.createdAt || record.target?.createdAt,
  });
  if (!target) return false;
  return !Number.isSafeInteger(serial)
    || serial <= 0
    || serial > Number(dismissedPublications?.[previewTargetKey(target)] || 0);
}

export function normalizePreviewBubbleSettings(value = {}) {
  const display = normalizeChatBubbleDisplaySettings(value);
  const rawZoom = value?.contentZoom === null || value?.contentZoom === ''
    ? Number.NaN
    : Number(value?.contentZoom);
  const contentZoom = Number.isFinite(rawZoom)
    ? Math.max(PREVIEW_CONTENT_ZOOM_MIN, Math.min(PREVIEW_CONTENT_ZOOM_MAX, Math.round(rawZoom)))
    : 100;
  return {
    displayMode: display.displayMode,
    size: display.size,
    contentZoom,
  };
}

export function getPreviewBubbleDisplayScale(value = {}, cameraDistance = 40) {
  const settings = normalizePreviewBubbleSettings(value);
  const display = getChatBubbleDisplayScale(settings, cameraDistance);
  return {
    ...settings,
    baseScale: display.baseScale,
    zoomScale: display.zoomScale,
    transformScale: settings.displayMode === 'world' ? display.effectiveScale : 1,
    effectiveScale: display.effectiveScale,
  };
}

function previewRectsOverlap(first, second, gap = 0) {
  return first.left < second.left + second.width + gap
    && first.left + first.width + gap > second.left
    && first.top < second.top + second.height + gap
    && first.top + first.height + gap > second.top;
}

function previewRectContainsPoint(rect, point, padding = 0) {
  return point.x >= rect.left - padding
    && point.x <= rect.left + rect.width + padding
    && point.y >= rect.top - padding
    && point.y <= rect.top + rect.height + padding;
}

function previewOverlapArea(first, second, gap = 0) {
  const width = Math.max(0, Math.min(first.left + first.width, second.left + second.width + gap) - Math.max(first.left, second.left - gap));
  const height = Math.max(0, Math.min(first.top + first.height, second.top + second.height + gap) - Math.max(first.top, second.top - gap));
  return width * height;
}

/**
 * Deterministically keeps live Preview Bubbles apart without moving their desk
 * anchors. Earlier bubbles keep their preferred position; later bubbles try the
 * other anchor sides and then the nearest free viewport slot.
 */
export function resolvePreviewBubbleCollisionLayout(entries = [], bounds = {}, options = {}) {
  const gap = Math.max(0, Number(options.gap) || PREVIEW_BUBBLE_COLLISION_GAP);
  const padding = Math.max(0, Number(options.padding) || 8);
  const leftBound = Number(bounds.left) || 0;
  const topBound = Number(bounds.top) || 0;
  const rightBound = Math.max(leftBound, Number(bounds.right) || leftBound);
  const bottomBound = Math.max(topBound, Number(bounds.bottom) || topBound);
  const controls = entries.map(entry => ({
    x: Number.isFinite(Number(entry.controlX)) ? Number(entry.controlX) : Number(entry.anchorX) || 0,
    y: Number.isFinite(Number(entry.controlY)) ? Number(entry.controlY) : Number(entry.anchorY) || 0,
  }));
  const occupied = [];

  return entries.map(entry => {
    const width = Math.max(1, Number(entry.width) || 1);
    const height = Math.max(1, Number(entry.height) || 1);
    const anchorX = Number(entry.anchorX) || 0;
    const anchorY = Number(entry.anchorY) || 0;
    const controlX = Number.isFinite(Number(entry.controlX)) ? Number(entry.controlX) : anchorX;
    const controlY = Number.isFinite(Number(entry.controlY)) ? Number(entry.controlY) : anchorY;
    const minLeft = leftBound + padding;
    const maxLeft = Math.max(minLeft, rightBound - width - padding);
    const minTop = topBound + padding;
    const maxTop = Math.max(minTop, bottomBound - height - 32);
    const baseCandidates = [
      { placement: 'above', left: anchorX - width / 2, top: anchorY - height - 24 },
      { placement: 'right', left: controlX + 28, top: anchorY - height / 2 },
      { placement: 'left', left: controlX - width - 28, top: anchorY - height / 2 },
      { placement: 'below', left: anchorX - width / 2, top: controlY + 28 },
    ];
    const candidates = [];
    const seen = new Set();
    const append = candidate => {
      const left = Math.max(minLeft, Math.min(maxLeft, candidate.left));
      const top = Math.max(minTop, Math.min(maxTop, candidate.top));
      const signature = `${Math.round(left)}:${Math.round(top)}`;
      if (seen.has(signature)) return;
      seen.add(signature);
      candidates.push({ ...candidate, left, top, width, height });
    };

    // Preserve the established above/right/left/below behavior first.
    baseCandidates.forEach(append);
    // When desks are close together, fan bubbles along the edge that still
    // points back toward their assigned monitor.
    for (let step = 1; step <= Math.max(2, entries.length); step++) {
      for (const candidate of baseCandidates) {
        const horizontal = candidate.placement === 'above' || candidate.placement === 'below';
        const distance = (horizontal ? width : height) + gap;
        for (const direction of [-1, 1]) {
          append({
            ...candidate,
            left: candidate.left + (horizontal ? direction * distance * step : 0),
            top: candidate.top + (horizontal ? 0 : direction * distance * step),
          });
        }
      }
    }

    // Dense scenes get a bounded grid fallback, ordered by distance to the
    // assigned desk so bubbles do not jump to an arbitrary corner.
    const grid = [];
    const stepX = width + gap;
    const stepY = height + gap;
    for (let top = minTop; top <= maxTop + 0.5; top += stepY) {
      for (let left = minLeft; left <= maxLeft + 0.5; left += stepX) {
        grid.push({
          placement: left + width / 2 < controlX ? 'left' : 'right',
          left,
          top,
          distance: Math.hypot(left + width / 2 - anchorX, top + height / 2 - anchorY),
        });
      }
    }
    grid.sort((first, second) => first.distance - second.distance).forEach(append);

    const isClear = candidate => !occupied.some(rect => previewRectsOverlap(candidate, rect, gap))
      && !controls.some(point => previewRectContainsPoint(candidate, point, 8));
    let selected = candidates.find(isClear);
    if (!selected) {
      selected = candidates.reduce((best, candidate) => {
        const overlap = occupied.reduce((sum, rect) => sum + previewOverlapArea(candidate, rect, gap), 0);
        const blockedControl = controls.some(point => previewRectContainsPoint(candidate, point, 8)) ? width * height : 0;
        const score = overlap + blockedControl + Math.hypot(candidate.left + width / 2 - anchorX, candidate.top + height / 2 - anchorY) * 0.01;
        return !best || score < best.score ? { ...candidate, score } : best;
      }, null) || { ...baseCandidates[0], width, height };
    }
    const resolved = {
      id: entry.id,
      placement: selected.placement,
      left: selected.left,
      top: selected.top,
      width,
      height,
    };
    occupied.push(resolved);
    return resolved;
  });
}

export function classifyPreviewToolEvent(detail = {}) {
  const agentId = String(detail.agentId || '').trim();
  const tool = detail.tool && typeof detail.tool === 'object' ? detail.tool : {};
  const name = String(tool.name || detail.name || '').replace(/^functions\./, '').trim();
  const args = asObject(tool.arguments || tool.args || detail.arguments || {});
  const result = tool.result ?? detail.result ?? '';
  const phase = String(detail.phase || '').toLowerCase();
  const eventContext = {
    runId: String(detail.runId || '').trim(),
    sessionKey: String(detail.sessionKey || '').trim(),
  };
  if (!agentId || !name || tool.error || detail.error) return null;

  if (BROWSER_TOOL_PATTERN.test(name)) {
    return normalizePreviewTarget({
      agentId,
      kind: 'browser',
      title: 'Live Agent Browser',
      source: `tool:${name}`,
      ...eventContext,
    });
  }

  const argUrl = safeHttpUrl(firstString(args, URL_KEYS));
  if (argUrl && (WEB_TOOL_PATTERN.test(name) || /preview|open/i.test(name))) {
    return normalizePreviewTarget({ agentId, kind: 'url', url: argUrl, title: basename(argUrl), source: `tool:${name}` });
  }

  if (!FILE_TOOL_PATTERN.test(name)) return null;
  let path = firstString(args, PATH_KEYS);
  if (!path) path = extractPatchPath(args.patch || args.input || args.value || '');
  if (!path && ['result', 'done', 'completed', 'complete'].includes(phase)) path = extractResultPath(result);
  if (!path) return null;
  if (safeHttpUrl(path)) {
    return normalizePreviewTarget({ agentId, kind: 'url', url: path, title: basename(path), source: `tool:${name}` });
  }
  return normalizePreviewTarget({
    agentId,
    kind: 'file',
    path,
    workdir: firstString(args, WORKDIR_KEYS),
    title: basename(path),
    source: `tool:${name}`,
  });
}

function previewViewportBounds() {
  const canvas = document.getElementById('officeCanvas');
  const rect = canvas?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  }
  return {
    left: Math.max(0, rect.left),
    top: Math.max(0, rect.top),
    right: Math.min(innerWidth, rect.right),
    bottom: Math.min(innerHeight, rect.bottom),
  };
}

function previewWindowBounds() {
  return { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function sanitizeHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(html || ''), 'text/html');
  doc.querySelectorAll('script, iframe, object, embed, base, meta[http-equiv], link[rel="preload"], link[rel="modulepreload"]').forEach(node => node.remove());
  for (const element of doc.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on') || name === 'srcdoc' || /^(?:javascript|data:text\/html):/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob: http: https:; media-src data: blob:; style-src 'unsafe-inline'; font-src data:;">`;
  return `<!doctype html><html><head>${policy}${doc.head.innerHTML}</head><body>${doc.body.innerHTML}</body></html>`;
}

async function responseText(response) {
  if (!response.ok) {
    let message = `Preview request failed (${response.status})`;
    try {
      const payload = await response.json();
      message = payload?.error?.message || payload?.error || payload?.message || message;
    } catch { /* keep status */ }
    throw new Error(message);
  }
  return response.text();
}

function makeEmptyState(message, icon = '🖥️') {
  const empty = document.createElement('div');
  empty.className = 'agent-preview-empty';
  empty.innerHTML = `<span>${icon}</span><strong>${escapeHtml(message)}</strong>`;
  return empty;
}

function contentUrl(target) {
  if (!target?.descriptor) return '';
  const params = new URLSearchParams({
    agentId: target.agentId,
    path: target.path,
    workdir: target.workdir || '',
    v: target.descriptor.version || '',
  });
  return `/api/previews/content?${params}`;
}

export function createAgentPreviewHub({ resolveAnchor, fetchImpl = globalThis.fetch?.bind(globalThis), storage = null } = {}) {
  const panel = document.getElementById('agentPreviewPanel');
  const bubbleContainer = document.getElementById('previewBubbleContainer');
  if (!panel || !bubbleContainer || typeof resolveAnchor !== 'function' || typeof fetchImpl !== 'function') return null;

  const stage = panel.querySelector('.agent-preview-stage');
  const tabs = panel.querySelector('.agent-preview-tabs');
  const title = panel.querySelector('#agentPreviewPanelTitle');
  const meta = panel.querySelector('.agent-preview-meta');
  const refreshButton = panel.querySelector('[data-preview-action="refresh"]');
  const openButton = panel.querySelector('[data-preview-action="open"]');
  const maximizeButton = panel.querySelector('[data-preview-action="maximize"]');
  const snapLeftButton = panel.querySelector('[data-preview-action="snap-left"]');
  const snapRightButton = panel.querySelector('[data-preview-action="snap-right"]');
  const closeButton = panel.querySelector('[data-preview-action="close"]');
  const panelSurface = document.createElement('div');
  panelSurface.className = 'agent-preview-render-surface';
  stage.replaceChildren(panelSurface);
  let clientStorage = storage;
  if (!clientStorage) {
    try { clientStorage = globalThis.localStorage; } catch { clientStorage = null; }
  }
  let restoredClientState = normalizePreviewClientState();
  try {
    restoredClientState = normalizePreviewClientState(clientStorage?.getItem(PREVIEW_CLIENT_STATE_STORAGE_KEY) || '');
  } catch {
    // Private browsing and locked-down embedded browsers can reject storage.
  }
  const targets = [];
  const bubbles = new Map();
  const bubbleActiveKeys = new Map();
  const hiddenBubbleAgents = new Set(restoredClientState.hiddenBubbleAgents);
  const dismissedPublications = new Map(Object.entries(restoredClientState.dismissedPublications));
  // Virtual Office is dependency-free in the browser. PDF previews use the
  // browser's native renderer, while these maps keep the shared lifecycle
  // cleanup paths compatible with the Virtual World implementation.
  const expandedPdfViews = new Map();
  const pdfDocumentCache = new Map();
  let previewBubbleSettings = normalizePreviewBubbleSettings();
  let activeKey = '';
  let explicitCursor = 0;
  let destroyed = false;

  function persistClientState() {
    const dismissedEntries = Array.from(dismissedPublications.entries()).slice(-PREVIEW_DISMISSAL_LIMIT);
    try {
      clientStorage?.setItem(PREVIEW_CLIENT_STATE_STORAGE_KEY, JSON.stringify({
        hiddenBubbleAgents: Array.from(hiddenBubbleAgents),
        dismissedPublications: Object.fromEntries(dismissedEntries),
      }));
    } catch {
      // Previewing must continue even when browser storage is unavailable.
    }
  }

  function rememberPublicationDismissal(target) {
    const serial = Number(target?.publicationSerial || 0);
    if (!target || !Number.isSafeInteger(serial) || serial <= 0) return;
    const key = previewTargetKey(target);
    const previous = Number(dismissedPublications.get(key) || 0);
    dismissedPublications.delete(key);
    dismissedPublications.set(key, Math.max(serial, previous));
    while (dismissedPublications.size > PREVIEW_DISMISSAL_LIMIT) {
      dismissedPublications.delete(dismissedPublications.keys().next().value);
    }
    persistClientState();
  }

  const controller = createBrowserWindowController({
    panel,
    dragHandle: panel.querySelector('.agent-preview-panel-header'),
    frame: stage,
    maximizeButton,
    resizeHandles: panel.querySelectorAll('[data-resize]'),
    getBounds: previewWindowBounds,
    minimumSize: { width: 520, height: 380 },
    isCompactLayout: () => matchMedia('(max-width: 640px)').matches,
    windowLabel: 'Agent Preview',
    bodyInteractionClass: 'preview-window-interacting',
  });

  function activeTarget() {
    return targets.find(item => previewTargetKey(item) === activeKey) || targets[targets.length - 1] || null;
  }

  function applyPreviewBubbleSettings(value) {
    previewBubbleSettings = normalizePreviewBubbleSettings(value);
    updatePositions();
    return previewBubbleSettings;
  }

  async function loadPreviewBubbleSettings() {
    try {
      const response = await fetchImpl('/vo-config', { cache: 'no-store' });
      if (!response.ok) return;
      const config = await response.json();
      applyPreviewBubbleSettings(config?.office?.previewBubbles);
    } catch {
      // Keep backwards-compatible Consistent / Large / 100% defaults.
    }
  }

  function handleSettingsSaved(event) {
    applyPreviewBubbleSettings(event.detail?.config?.office?.previewBubbles);
  }

  function setSnapButtons(mode = null) {
    snapLeftButton?.setAttribute('aria-pressed', String(mode === 'left'));
    snapRightButton?.setAttribute('aria-pressed', String(mode === 'right'));
  }

  function browserFrame(viewerUrl, compact) {
    const frame = document.createElement('iframe');
    frame.className = compact ? 'agent-preview-browser agent-preview-compact-frame' : 'agent-preview-browser';
    frame.title = 'Live Agent Browser preview';
    frame.allow = 'autoplay; clipboard-read; clipboard-write; pointer-lock; keyboard-map';
    frame.src = buildBrowserViewerUrl(viewerUrl, location.href);
    frame.tabIndex = compact ? -1 : 0;
    return frame;
  }

  async function renderBrowser(container, compact) {
    container.replaceChildren(makeEmptyState('Connecting to Agent Browser…', '🌐'));
    try {
      const response = await fetchImpl('/browser-status', { cache: 'no-store' });
      const status = await response.json();
      if (!status.enabled || !status.viewerUrl) {
        container.replaceChildren(makeEmptyState(status.locked ? 'Agent Browser is locked' : 'Agent Browser is not configured', '🌐'));
        return;
      }
      container.replaceChildren(browserFrame(status.viewerUrl, compact));
    } catch (error) {
      container.replaceChildren(makeEmptyState(error.message || 'Agent Browser unavailable', '⚠️'));
    }
  }

  function disposePdfDocument(key) {
    pdfDocumentCache.delete(key);
  }

  async function renderFile(container, target, compact) {
    const descriptor = target.descriptor;
    if (!descriptor) {
      container.replaceChildren(makeEmptyState(target.error || 'Preparing file preview…', target.error ? '⚠️' : '⏳'));
      return;
    }
    const url = contentUrl(target);
    if (descriptor.kind === 'image') {
      const image = document.createElement('img');
      image.className = 'agent-preview-image';
      image.alt = target.title;
      image.src = url;
      if (compact) {
        const scrollSurface = document.createElement('div');
        scrollSurface.className = 'agent-preview-compact-media-scroll';
        scrollSurface.appendChild(image);
        container.replaceChildren(scrollSurface);
      } else {
        container.replaceChildren(image);
      }
      return;
    }
    if (descriptor.kind === 'pdf') {
      const frame = document.createElement('iframe');
      frame.className = compact
        ? 'agent-preview-document agent-preview-pdf-frame agent-preview-compact-frame'
        : 'agent-preview-document agent-preview-pdf-frame';
      frame.title = `${target.title} PDF preview`;
      frame.src = url;
      frame.tabIndex = compact ? -1 : 0;
      container.replaceChildren(frame);
      return;
    }
    if (descriptor.kind === 'video') {
      const video = document.createElement('video');
      video.className = 'agent-preview-video';
      video.controls = !compact;
      video.muted = compact;
      video.autoplay = compact;
      video.loop = compact;
      video.playsInline = true;
      video.src = url;
      if (compact) {
        const scrollSurface = document.createElement('div');
        scrollSurface.className = 'agent-preview-compact-media-scroll';
        scrollSurface.appendChild(video);
        container.replaceChildren(scrollSurface);
      } else {
        container.replaceChildren(video);
      }
      return;
    }
    if (descriptor.kind === 'audio') {
      if (compact) {
        container.replaceChildren(makeEmptyState(target.title, '🎵'));
      } else {
        const audio = document.createElement('audio');
        audio.className = 'agent-preview-audio';
        audio.controls = true;
        audio.src = url;
        container.replaceChildren(audio);
      }
      return;
    }

    try {
      const source = await responseText(await fetchImpl(url, { cache: 'no-store' }));
      if (descriptor.kind === 'html') {
        const frame = document.createElement('iframe');
        frame.className = compact ? 'agent-preview-document agent-preview-compact-frame' : 'agent-preview-document';
        frame.title = target.title;
        frame.setAttribute('sandbox', '');
        frame.srcdoc = sanitizeHtml(source);
        frame.tabIndex = compact ? -1 : 0;
        container.replaceChildren(frame);
        return;
      }
      if (descriptor.kind === 'markdown' && globalThis.marked?.parse) {
        const rendered = document.createElement('iframe');
        rendered.className = compact ? 'agent-preview-document agent-preview-compact-frame' : 'agent-preview-document';
        rendered.title = target.title;
        rendered.setAttribute('sandbox', '');
        rendered.srcdoc = sanitizeHtml(`<article class="markdown-body">${globalThis.marked.parse(source)}</article>`);
        rendered.tabIndex = compact ? -1 : 0;
        container.replaceChildren(rendered);
        return;
      }
      const pre = document.createElement('pre');
      pre.className = `agent-preview-source language-${descriptor.language || 'text'}`;
      pre.textContent = compact && source.length > 3500 ? `${source.slice(0, 3500)}\n…` : source;
      container.replaceChildren(pre);
    } catch (error) {
      container.replaceChildren(makeEmptyState(error.message || 'Could not load file', '⚠️'));
    }
  }

  async function renderTarget(container, target, compact = false) {
    container._agentPreviewCleanup?.();
    container._agentPreviewCleanup = null;
    container.dataset.previewKind = target?.descriptor?.kind || target?.kind || '';
    if (!target) {
      container.replaceChildren(makeEmptyState('Agent work will appear here'));
      return;
    }
    if (target.kind === 'browser') return renderBrowser(container, compact);
    if (target.kind === 'url') {
      const frame = document.createElement('iframe');
      frame.className = compact ? 'agent-preview-document agent-preview-compact-frame' : 'agent-preview-document';
      frame.title = target.title;
      frame.referrerPolicy = 'no-referrer';
      frame.setAttribute('sandbox', 'allow-forms allow-popups');
      frame.src = target.url;
      frame.tabIndex = compact ? -1 : 0;
      container.replaceChildren(frame);
      return;
    }
    return renderFile(container, target, compact);
  }

  async function hydrateFileTarget(target) {
    if (target.kind !== 'file') return target;
    const params = new URLSearchParams({ agentId: target.agentId, path: target.path, workdir: target.workdir || '' });
    try {
      const response = await fetchImpl(`/api/previews/descriptor?${params}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data?.error?.message || data?.error || data?.message || `Preview request failed (${response.status})`);
      }
      target.descriptor = data.preview;
      target.title = target.title || data.preview.name;
      target.error = '';
    } catch (error) {
      target.error = error.message || 'File preview unavailable';
    }
    return target;
  }

  function bubbleTarget(agentId) {
    const target = resolveAgentPreviewTarget(targets, agentId, bubbleActiveKeys.get(agentId) || '');
    if (target) bubbleActiveKeys.set(agentId, previewTargetKey(target));
    else bubbleActiveKeys.delete(agentId);
    return target;
  }

  function renderBubbleTabs(state, agentId, selectedTarget) {
    const tabList = state.el.querySelector('.agent-preview-bubble-tabs');
    if (!tabList) return;
    tabList.replaceChildren();
    for (const target of previewTargetsForAgent(targets, agentId)) {
      const key = previewTargetKey(target);
      const item = document.createElement('div');
      item.className = 'agent-preview-bubble-tab-item';
      item.dataset.active = String(key === previewTargetKey(selectedTarget));
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'agent-preview-bubble-tab';
      tab.dataset.active = item.dataset.active;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(key === previewTargetKey(selectedTarget)));
      tab.title = target.title;
      tab.innerHTML = `<span aria-hidden="true">${KIND_ICONS[target.descriptor?.kind || target.kind] || '📄'}</span><strong>${escapeHtml(target.title)}</strong>`;
      tab.addEventListener('click', event => {
        event.stopPropagation();
        bubbleActiveKeys.set(agentId, key);
        activeKey = key;
        renderBubble(agentId);
        if (panel.style.display !== 'none') renderPanel();
      });
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'agent-preview-bubble-tab-close';
      close.textContent = '×';
      close.title = `Close ${target.title}`;
      close.setAttribute('aria-label', `Close ${target.title} preview`);
      close.addEventListener('click', event => {
        event.stopPropagation();
        closeTarget(key);
      });
      item.append(tab, close);
      tabList.appendChild(item);
    }
  }

  function renderBubble(agentId) {
    const target = bubbleTarget(agentId);
    if (!target) {
      const staleState = bubbles.get(agentId);
      staleState?.el.querySelector('.agent-preview-bubble-stage')?._agentPreviewCleanup?.();
      staleState?.el.remove();
      bubbles.delete(agentId);
      bubbleActiveKeys.delete(agentId);
      return;
    }
    let state = bubbles.get(agentId);
    if (!state) {
      const el = document.createElement('div');
      el.className = 'agent-preview-bubble';
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.innerHTML = `
        <div class="agent-preview-bubble-head"><span class="agent-preview-live-dot"></span><strong></strong><span class="agent-preview-count"></span><button class="agent-preview-bubble-hide" type="button" aria-label="Hide preview bubble" title="Hide preview bubble">×</button></div>
        <div class="agent-preview-bubble-tabs" role="tablist" aria-label="Open previews"></div>
        <div class="agent-preview-bubble-stage"></div>
        <div class="agent-preview-bubble-tail"></div>`;
      const open = event => {
        if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
        if (event.target.closest('button')) return;
        event.preventDefault();
        openWindow(previewTargetKey(bubbleTarget(agentId)));
      };
      el.addEventListener('click', open);
      el.addEventListener('keydown', open);
      el.querySelector('.agent-preview-bubble-hide').addEventListener('click', event => {
        event.stopPropagation();
        hideBubble(agentId);
      });
      const bubbleStage = el.querySelector('.agent-preview-bubble-stage');
      bubbleStage.addEventListener('click', event => {
        event.stopPropagation();
        openWindow(previewTargetKey(bubbleTarget(agentId)));
      });
      bubbleStage.addEventListener('pointerdown', event => event.stopPropagation());
      bubbleStage.addEventListener('wheel', event => event.stopPropagation(), { passive: true });
      bubbleContainer.appendChild(el);
      state = { el, renderedKey: '', renderedVersion: '', renderGeneration: 0 };
      bubbles.set(agentId, state);
    }
    const agentCount = previewTargetsForAgent(targets, agentId).length;
    state.el.setAttribute('aria-label', `Open ${agentId} preview window`);
    state.el.querySelector('strong').textContent = `${KIND_ICONS[target.descriptor?.kind || target.kind] || '🖥️'} ${target.title}`;
    state.el.querySelector('.agent-preview-count').textContent = agentCount > 1 ? `${agentCount}` : 'LIVE';
    renderBubbleTabs(state, agentId, target);
    const renderKey = previewTargetKey(target);
    const version = target.descriptor?.version || target.error || '';
    if (state.renderedKey !== renderKey || state.renderedVersion !== version) {
      state.renderedKey = renderKey;
      state.renderedVersion = version;
      const renderGeneration = ++state.renderGeneration;
      Promise.resolve(renderTarget(state.el.querySelector('.agent-preview-bubble-stage'), target, true)).then(() => {
        if (state.renderGeneration === renderGeneration) return;
        state.renderedKey = '';
        renderBubble(agentId);
      });
    }
  }

  function setBubbleVisibility(agentId, visible) {
    const agentTargets = previewTargetsForAgent(targets, agentId);
    if (!agentTargets.length) return { agentId, visible: false, count: 0, reason: 'empty' };
    if (visible) hiddenBubbleAgents.delete(agentId);
    else hiddenBubbleAgents.add(agentId);
    persistClientState();
    renderBubble(agentId);
    const state = bubbles.get(agentId);
    if (!visible && state) state.el.style.display = 'none';
    if (visible) updatePositions();
    return { agentId, visible, count: agentTargets.length, reason: visible ? 'shown' : 'hidden' };
  }

  function showBubble(agentId) {
    return setBubbleVisibility(String(agentId || ''), true);
  }

  function hideBubble(agentId) {
    return setBubbleVisibility(String(agentId || ''), false);
  }

  function toggleBubble(agentId) {
    const normalizedAgentId = String(agentId || '');
    return setBubbleVisibility(normalizedAgentId, hiddenBubbleAgents.has(normalizedAgentId));
  }

  function renderTabs() {
    tabs.replaceChildren();
    for (const target of targets) {
      const key = previewTargetKey(target);
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'agent-preview-tab';
      tab.dataset.active = String(key === activeKey);
      tab.title = target.path || target.url || target.title;
      tab.innerHTML = `<span>${KIND_ICONS[target.descriptor?.kind || target.kind] || '📄'} ${escapeHtml(target.title)}</span><span class="agent-preview-tab-close" aria-label="Close preview">×</span>`;
      tab.addEventListener('click', event => {
        if (event.target.closest('.agent-preview-tab-close')) {
          closeTarget(key);
          return;
        }
        activeKey = key;
        renderPanel();
      });
      tabs.appendChild(tab);
    }
  }

  function renderPanel() {
    const target = activeTarget();
    if (target) activeKey = previewTargetKey(target);
    title.textContent = target ? `${KIND_ICONS[target.descriptor?.kind || target.kind] || '🖥️'} ${target.title}` : '🖥️ Agent Preview';
    meta.textContent = target ? [target.agentId, target.path || target.url || (target.kind === 'browser' ? 'Live desktop' : '')].filter(Boolean).join(' · ') : 'Waiting for agent work';
    openButton.disabled = !target;
    refreshButton.disabled = !target;
    renderTabs();
    panelSurface.hidden = false;
    renderTarget(panelSurface, target, false);
  }

  function renderAll() {
    const liveAgents = new Set(targets.map(item => item.agentId));
    for (const agentId of bubbles.keys()) if (!liveAgents.has(agentId)) renderBubble(agentId);
    for (const agentId of liveAgents) renderBubble(agentId);
    if (panel.style.display !== 'none') renderPanel();
  }

  function closeTarget(key, { rememberDismissal = true, render = true } = {}) {
    const index = targets.findIndex(item => previewTargetKey(item) === key);
    if (index < 0) return;
    const [removed] = targets.splice(index, 1);
    if (rememberDismissal) rememberPublicationDismissal(removed);
    expandedPdfViews.get(key)?.destroy();
    expandedPdfViews.delete(key);
    disposePdfDocument(key);
    if (activeKey === key) activeKey = previewTargetKey(targets[Math.min(index, targets.length - 1)] || null);
    if (bubbleActiveKeys.get(removed.agentId) === key) {
      const replacement = resolveAgentPreviewTarget(targets, removed.agentId);
      if (replacement) bubbleActiveKeys.set(removed.agentId, previewTargetKey(replacement));
      else bubbleActiveKeys.delete(removed.agentId);
    }
    if (!render) return removed;
    renderBubble(removed.agentId);
    if (!targets.length) closeWindow();
    else renderAll();
    return removed;
  }

  function closeWindow() {
    panel.style.display = 'none';
    expandedPdfViews.forEach(view => view.deactivate());
    controller.setMaximized(false);
    controller.snap(null);
    setSnapButtons(null);
  }

  function openWindow(key = '') {
    if (key) activeKey = key;
    panel.style.display = 'flex';
    renderPanel();
    requestAnimationFrame(() => controller.constrain());
  }

  async function openTarget(raw, { showWindow = false } = {}) {
    const normalized = normalizePreviewTarget(raw);
    if (!normalized) return null;
    if (normalized.kind === 'browser') {
      const staleBrowserKeys = targets
        .filter(item => item.kind === 'browser' && item.agentId !== normalized.agentId)
        .map(previewTargetKey);
      for (const staleKey of staleBrowserKeys) {
        // The configured Agent Browser is a shared live viewer. Transfer that
        // single live preview to the agent whose tool event activated it.
        closeTarget(staleKey, { rememberDismissal: true, render: false });
      }
    }
    const key = previewTargetKey(normalized);
    let target = targets.find(item => previewTargetKey(item) === key);
    if (target) {
      Object.assign(target, normalized, { updatedAt: new Date().toISOString() });
      targets.splice(targets.indexOf(target), 1);
      targets.push(target);
    } else {
      target = { ...normalized, updatedAt: new Date().toISOString() };
      targets.push(target);
      while (targets.length > MAX_TARGETS) {
        const removed = targets.shift();
        if (removed) {
          const removedKey = previewTargetKey(removed);
          expandedPdfViews.get(removedKey)?.destroy();
          expandedPdfViews.delete(removedKey);
          disposePdfDocument(removedKey);
          if (removedKey === activeKey) activeKey = '';
        }
      }
    }
    if (target.kind === 'file') await hydrateFileTarget(target);
    bubbleActiveKeys.set(target.agentId, key);
    activeKey = showWindow ? key : (activeKey || key);
    renderAll();
    if (showWindow) openWindow(key);
    return target;
  }

  async function refreshTarget(target = activeTarget()) {
    if (!target) return;
    if (target.kind === 'file') await hydrateFileTarget(target);
    renderAll();
  }

  async function pollExplicitTargets() {
    if (destroyed || document.visibilityState === 'hidden') return;
    try {
      const response = await fetchImpl(`/api/previews?after=${explicitCursor}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.ok) return;
      for (const record of (data.previews || [])) {
        const serial = Number(record.serial) || 0;
        explicitCursor = Math.max(explicitCursor, serial);
        const dismissed = Object.fromEntries(dismissedPublications);
        if (!shouldReplayPublishedPreview(record, dismissed)) continue;
        await openTarget({
          ...(record.target || record),
          id: record.id || record.target?.id,
          createdAt: record.createdAt || record.target?.createdAt,
          publicationSerial: serial,
        });
      }
      explicitCursor = Math.max(explicitCursor, Number(data.cursor) || 0);
    } catch { /* explicit preview publishing is optional */ }
  }

  async function pollFileVersions() {
    if (destroyed || document.visibilityState === 'hidden') return;
    const fileTargets = targets.filter(item => item.kind === 'file');
    for (const target of fileTargets) {
      const previous = target.descriptor?.version || '';
      await hydrateFileTarget(target);
      if ((target.descriptor?.version || '') !== previous) renderAll();
    }
  }

  function updatePositions() {
    const layouts = [];
    const bounds = previewViewportBounds();
    for (const [agentId, state] of bubbles) {
      if (hiddenBubbleAgents.has(agentId)) {
        state.el.style.display = 'none';
        continue;
      }
      const anchor = resolveAnchor(agentId);
      if (!anchor?.visible) {
        state.el.style.display = 'none';
        continue;
      }
      state.el.style.setProperty('--agent-preview-accent', anchor.color || '#ffd600');
      const display = getPreviewBubbleDisplayScale(previewBubbleSettings, anchor.cameraDistance);
      const compactLayout = matchMedia('(max-width: 640px)').matches;
      const baseWidth = compactLayout ? Math.min(220, Math.max(120, innerWidth - 20)) : Math.max(210, Math.min(innerWidth * 0.18, 270));
      const baseHeight = compactLayout ? 166 : Math.max(168, Math.min(innerWidth * 0.17, 210));
      const rigidWorldBubble = display.displayMode === 'world';
      const intrinsicWidth = Math.max(1, Math.round(baseWidth * (rigidWorldBubble ? 1 : display.baseScale)));
      const intrinsicHeight = Math.max(1, Math.round(baseHeight * (rigidWorldBubble ? 1 : display.baseScale)));
      const transformScale = Math.max(0.05, Number(display.transformScale) || 1);
      const contentZoom = display.contentZoom / 100;
      state.el.style.width = `${intrinsicWidth}px`;
      state.el.style.height = `${intrinsicHeight}px`;
      state.el.style.transformOrigin = 'top left';
      state.el.style.transform = transformScale === 1 ? '' : `scale(${transformScale})`;
      state.el.style.setProperty('--agent-preview-content-zoom', contentZoom.toFixed(3));
      const frameScale = Math.max(0.1, 0.6 * contentZoom);
      state.el.style.setProperty('--agent-preview-frame-scale', frameScale.toFixed(3));
      state.el.style.setProperty('--agent-preview-frame-size', `${(100 / frameScale).toFixed(3)}%`);
      state.el.dataset.displayMode = display.displayMode;
      state.el.dataset.displaySize = display.size;
      state.el.dataset.contentZoom = String(display.contentZoom);
      state.el.dataset.transformScale = transformScale.toFixed(4);
      const width = intrinsicWidth * transformScale;
      const height = intrinsicHeight * transformScale;
      const controlX = Number.isFinite(Number(anchor.controlX)) ? Number(anchor.controlX) : Number(anchor.x);
      const controlY = Number.isFinite(Number(anchor.controlY)) ? Number(anchor.controlY) : Number(anchor.y);
      layouts.push({
        id: agentId,
        state,
        width,
        height,
        anchorX: Number(anchor.x),
        anchorY: Number(anchor.y),
        controlX,
        controlY,
      });
    }

    const positions = resolvePreviewBubbleCollisionLayout(layouts, bounds);
    for (const position of positions) {
      const layout = layouts.find(item => item.id === position.id);
      const state = layout?.state;
      if (!state) continue;
      state.el.dataset.anchorPlacement = position.placement;
      state.el.style.left = `${Math.round(position.left)}px`;
      state.el.style.top = `${Math.round(position.top)}px`;
      state.el.style.display = 'flex';
    }
  }

  function handleToolPreview(event) {
    const target = classifyPreviewToolEvent(event.detail || {});
    if (target) openTarget(target);
  }

  function handleExplicitPreview(event) {
    openTarget(event.detail || {}, { showWindow: Boolean(event.detail?.showWindow) });
  }

  refreshButton?.addEventListener('click', () => refreshTarget());
  openButton?.addEventListener('click', () => {
    const target = activeTarget();
    if (!target) return;
    if (target.kind === 'browser') {
      document.getElementById('browser-toggle')?.click();
      return;
    }
    const url = target.kind === 'url' ? target.url : contentUrl(target);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  });
  snapLeftButton?.addEventListener('click', () => setSnapButtons(controller.snap('left')));
  snapRightButton?.addEventListener('click', () => setSnapButtons(controller.snap('right')));
  closeButton?.addEventListener('click', closeWindow);
  window.addEventListener('vo:agent-tool-preview', handleToolPreview);
  window.addEventListener('vo:open-agent-preview', handleExplicitPreview);
  window.addEventListener('vo:settings-saved', handleSettingsSaved);

  const explicitTimer = setInterval(pollExplicitTargets, PREVIEW_POLL_MS);
  const versionTimer = setInterval(pollFileVersions, FILE_VERSION_POLL_MS);
  loadPreviewBubbleSettings();
  pollExplicitTargets();

  const api = {
    open: (target, options) => openTarget(target, options),
    close: closeTarget,
    openWindow,
    showBubble,
    hideBubble,
    toggleBubble,
    isBubbleVisible: agentId => previewTargetsForAgent(targets, agentId).length > 0 && !hiddenBubbleAgents.has(String(agentId || '')),
    getVisibleBubbleRects: () => Array.from(bubbles.entries()).flatMap(([agentId, state]) => {
      if (hiddenBubbleAgents.has(agentId) || state.el.style.display === 'none') return [];
      const rect = state.el.getBoundingClientRect();
      if (!rect.width || !rect.height) return [];
      return [{ agentId, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }];
    }),
    applySettings: applyPreviewBubbleSettings,
    getSettings: () => ({ ...previewBubbleSettings }),
    updatePositions,
    getTargets: () => targets.map(item => ({ ...item })),
    destroy() {
      destroyed = true;
      clearInterval(explicitTimer);
      clearInterval(versionTimer);
      controller.destroy();
      window.removeEventListener('vo:agent-tool-preview', handleToolPreview);
      window.removeEventListener('vo:open-agent-preview', handleExplicitPreview);
      window.removeEventListener('vo:settings-saved', handleSettingsSaved);
      bubbles.forEach(state => {
        state.el.querySelector('.agent-preview-bubble-stage')?._agentPreviewCleanup?.();
        state.el.remove();
      });
      panelSurface._agentPreviewCleanup?.();
      expandedPdfViews.forEach(view => view.destroy());
      pdfDocumentCache.forEach((_entry, key) => disposePdfDocument(key));
      bubbles.clear();
      bubbleActiveKeys.clear();
      hiddenBubbleAgents.clear();
      expandedPdfViews.clear();
      pdfDocumentCache.clear();
    },
  };
  globalThis.VirtualOfficePreviews = api;
  globalThis.openAgentPreview = (target, options) => api.open(target, options);
  renderPanel();
  return api;
}
