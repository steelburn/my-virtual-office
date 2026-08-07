(() => {
  'use strict';
  const state = { providers: [], selectedId: '', connectionLists: new Map() };
  const $ = id => document.getElementById(id);

  function setStatus(text, kind = '') {
    const el = $('ps-status');
    el.textContent = text || '';
    el.className = 'ps-status' + (kind ? ' ' + kind : '');
  }

  function element(tag, attrs = {}, text = '') {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'className') el.className = value;
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key in el) el[key] = value;
      else el.setAttribute(key, value);
    });
    if (text !== '') el.textContent = text;
    return el;
  }

  function currentProvider() { return state.providers.find(provider => provider.id === state.selectedId); }
  function sections(provider) { return provider?.settingsSchema?.sections || []; }

  function renderProviderList() {
    const list = $('ps-provider-list');
    list.replaceChildren(...state.providers.map(provider => {
      const button = element('button', { type:'button', className:'ps-provider-tab' + (provider.id === state.selectedId ? ' active' : '') });
      button.append(element('span', {}, provider.icon || '🤖'), element('span', {}, provider.name || provider.id));
      button.append(element('span', { className:'dot' + (provider.health?.ok ? ' ok' : ''), title:provider.health?.ok ? 'Connected' : 'Needs attention' }));
      button.addEventListener('click', () => { state.selectedId = provider.id; renderProviderList(); renderProvider(); });
      return button;
    }));
  }

  function scalarValue(provider, field) {
    const raw = provider.values?.[field.key];
    if (field.type === 'secret' && raw && typeof raw === 'object') return raw;
    return raw ?? field.default ?? (field.type === 'boolean' ? false : '');
  }

  function makeInput(provider, field, value, prefix = '') {
    const id = `ps-${provider.id}-${prefix}${field.key}`;
    if (field.type === 'boolean') {
      const wrap = element('label', { className:'ps-check' });
      const input = element('input', { id, type:'checkbox', checked:!!value, dataset:{ settingKey:field.key } });
      wrap.append(input, element('span', {}, field.label || field.key));
      return { root:wrap, input };
    }
    if (field.type === 'select') {
      const select = element('select', { id, dataset:{ settingKey:field.key } });
      (field.options || []).forEach(option => select.append(element('option', { value:String(option.value), selected:String(option.value) === String(value) }, option.label || option.value)));
      return { root:select, input:select };
    }
    const secretMeta = field.type === 'secret' && value && typeof value === 'object' ? value : null;
    const inputValue = secretMeta ? '' : value;
    const input = element('input', {
      id,
      type:field.type === 'secret' ? 'password' : (field.type === 'number' ? 'number' : 'text'),
      value:inputValue ?? '',
      placeholder:secretMeta?.configured ? 'Configured — leave blank to keep' : (field.placeholder || ''),
      required:!!field.required,
      dataset:{ settingKey:field.key }
    });
    ['min','max','step'].forEach(key => { if (field[key] != null) input[key] = field[key]; });
    return { root:input, input };
  }

  function renderConnectionList(provider, field, value) {
    const root = element('div', { className:'ps-connection-list', dataset:{ connectionKey:field.key } });
    const rows = Array.isArray(value) ? value.map(row => ({ ...row })) : [];
    state.connectionLists.set(field.key, { rows, field, root });
    const renderRows = () => {
      const cards = rows.map((row, index) => {
        const card = element('div', { className:'ps-connection' });
        const head = element('div', { className:'ps-connection-head' });
        head.append(element('strong', {}, `${field.itemLabel || 'Connection'} ${index + 1}`));
        const remove = element('button', { type:'button', className:'ps-button danger' }, 'Remove');
        remove.addEventListener('click', () => { rows.splice(index, 1); renderRows(); });
        head.append(remove);
        const grid = element('div', { className:'ps-connection-grid' });
        (field.itemFields || []).forEach(child => {
          const label = element('label');
          label.append(element('span', {}, child.label || child.key));
          const current = child.type === 'secret'
            ? { value:'', configured:!!row[`${child.key}Configured`] }
            : (row[child.key] ?? child.default ?? (child.type === 'boolean' ? false : ''));
          const control = makeInput(provider, child, current, `${field.key}-${index}-`);
          control.input.dataset.connectionIndex = String(index);
          control.input.dataset.connectionField = child.key;
          delete control.input.dataset.settingKey;
          label.append(control.root);
          grid.append(label);
        });
        card.append(head, grid);
        return card;
      });
      const add = element('button', { type:'button', className:'ps-button secondary' }, '＋ Add connection');
      add.addEventListener('click', () => {
        const next = {};
        (field.itemFields || []).forEach(child => { next[child.key] = child.default ?? (child.type === 'boolean' ? true : ''); });
        rows.push(next); renderRows();
      });
      root.replaceChildren(...cards, add);
    };
    renderRows();
    return root;
  }

  function integrationTag(text, kind = '') {
    return element('span', { className:'ps-integration-tag' + (kind ? ' ' + kind : '') }, text);
  }

  function renderIntegrationSection(provider) {
    const resources = provider.resourceSchema || [];
    const skillRoots = provider.skillSchema || [];
    const card = element('section', { className:'ps-section ps-integration-section' });
    card.append(element('h3', {}, 'Native files & skills'));
    card.append(element('p', { className:'ps-section-description' }, 'These manifest rules control exactly what Agent Workspace can display or edit. Files outside these rules remain hidden.'));

    const resourceList = element('div', { className:'ps-integration-list' });
    resources.forEach(resource => {
      const row = element('div', { className:'ps-integration-row' });
      const title = element('div', { className:'ps-integration-title' }, resource.label || resource.id || 'Native resource');
      const tags = element('div', { className:'ps-integration-tags' });
      if (resource.readable === false) tags.append(integrationTag('hidden', 'danger'));
      else tags.append(integrationTag(resource.runtimeActive ? 'runtime active' : 'office only', resource.runtimeActive ? 'ok' : ''));
      if (resource.readable !== false) tags.append(integrationTag(resource.writable ? 'editable' : 'read only', resource.writable ? 'ok' : ''));
      if (resource.generated) tags.append(integrationTag('managed'));
      const paths = element('div', { className:'ps-integration-paths' }, (resource.paths || []).join(' · '));
      row.append(title, tags, paths);
      if (resource.description) row.append(element('div', { className:'ps-help' }, resource.description));
      resourceList.append(row);
    });
    if (!resources.length) resourceList.append(element('div', { className:'ps-empty' }, 'This provider exposes no workspace files.'));
    card.append(resourceList);

    const skillsTitle = element('h4', { className:'ps-integration-subtitle' }, 'Skill roots');
    const skillList = element('div', { className:'ps-integration-list' });
    skillRoots.forEach(root => {
      const row = element('div', { className:'ps-integration-row' });
      const tags = element('div', { className:'ps-integration-tags' });
      tags.append(integrationTag(root.runtimeActive ? 'runtime active' : 'stored only', root.runtimeActive ? 'ok' : ''));
      tags.append(integrationTag(root.writable ? 'install/edit' : 'read only', root.writable ? 'ok' : ''));
      row.append(
        element('div', { className:'ps-integration-title' }, root.label || root.id || 'Agent skills'),
        tags,
        element('div', { className:'ps-integration-paths' }, root.path || '')
      );
      if ((root.sharedRoots || []).length) row.append(element('div', { className:'ps-help' }, 'Also detected natively: ' + root.sharedRoots.join(' · ')));
      skillList.append(row);
    });
    if (!skillRoots.length) skillList.append(element('div', { className:'ps-empty' }, 'This provider connection does not expose installable agent skills.'));
    card.append(skillsTitle, skillList);
    return card;
  }

  function renderProvider() {
    const provider = currentProvider();
    $('ps-loading').hidden = true;
    $('ps-provider').hidden = !provider;
    if (!provider) return;
    state.connectionLists.clear();
    $('ps-icon').textContent = provider.icon || '🤖';
    $('ps-name').textContent = provider.name || provider.id;
    $('ps-description').textContent = provider.description || '';
    const health = $('ps-health');
    health.textContent = provider.health?.ok ? 'Connected' : 'Needs attention';
    health.className = 'ps-health' + (provider.health?.ok ? ' ok' : '');
    const caps = Object.entries(provider.capabilities || {}).filter(([, enabled]) => enabled).map(([name]) => element('span', { className:'ps-capability' }, name));
    $('ps-capabilities').replaceChildren(...caps);
    setStatus(provider.health?.ok ? 'Runtime health check passed.' : (provider.health?.error || 'This provider is not currently ready.'), provider.health?.ok ? 'ok' : 'error');

    const cards = sections(provider).map(section => {
      const card = element('section', { className:'ps-section' });
      card.append(element('h3', {}, section.label || section.id));
      if (section.description) card.append(element('p', { className:'ps-section-description' }, section.description));
      (section.fields || []).forEach(field => {
        if (field.type === 'link') {
          const row = element('div', { className:'ps-field' });
          row.append(element('div', { className:'ps-label' }, field.label || field.key));
          row.append(element('a', { className:'ps-link', href:field.href || '#'}, field.actionLabel || 'Open'));
          card.append(row); return;
        }
        const row = element('div', { className:'ps-field' });
        const labelBox = element('div');
        labelBox.append(element('div', { className:'ps-label' }, field.label || field.key));
        if (field.help) labelBox.append(element('div', { className:'ps-help' }, field.help));
        const control = element('div', { className:'ps-control' });
        const value = scalarValue(provider, field);
        if (field.type === 'connection-list') control.append(renderConnectionList(provider, field, value));
        else control.append(makeInput(provider, field, value).root);
        row.append(labelBox, control); card.append(row);
      });
      return card;
    });
    cards.push(renderIntegrationSection(provider));
    $('ps-form').replaceChildren(...cards);
  }

  function collectValues() {
    const provider = currentProvider();
    const values = {};
    sections(provider).forEach(section => (section.fields || []).forEach(field => {
      if (field.type === 'link') return;
      if (field.type === 'connection-list') {
        const list = state.connectionLists.get(field.key);
        values[field.key] = [...list.root.querySelectorAll('.ps-connection')].map(card => {
          const row = {};
          card.querySelectorAll('[data-connection-field]').forEach(input => {
            row[input.dataset.connectionField] = input.type === 'checkbox' ? input.checked : (input.type === 'number' ? Number(input.value) : input.value);
          });
          return row;
        });
        return;
      }
      const input = $('ps-form').querySelector(`[data-setting-key="${CSS.escape(field.key)}"]`);
      if (!input) return;
      values[field.key] = input.type === 'checkbox' ? input.checked : (input.type === 'number' ? Number(input.value) : input.value);
    }));
    return values;
  }

  async function load(preferredId = state.selectedId) {
    $('ps-refresh').disabled = true;
    try {
      const response = await fetch('/api/provider-settings', { cache:'no-store' });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || response.statusText);
      state.providers = data.providers || [];
      state.selectedId = state.providers.some(provider => provider.id === preferredId) ? preferredId : (state.providers[0]?.id || '');
      renderProviderList(); renderProvider();
    } catch (error) {
      $('ps-loading').hidden = false;
      $('ps-loading').textContent = 'Provider settings failed to load: ' + error.message;
    } finally { $('ps-refresh').disabled = false; }
  }

  async function save() {
    const provider = currentProvider(); if (!provider) return;
    $('ps-save').disabled = true; setStatus('Validating and applying settings…');
    try {
      const response = await fetch('/api/provider-settings/save', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ providerId:provider.id, values:collectValues() }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || response.statusText);
      await load(provider.id);
      setStatus('Settings saved. Provider registry and agent discovery refreshed.', 'ok');
    } catch (error) { setStatus(error.message, 'error'); }
    finally { $('ps-save').disabled = false; }
  }

  async function test() {
    const provider = currentProvider(); if (!provider) return;
    $('ps-test').disabled = true; setStatus('Testing the active connection…');
    try {
      const response = await fetch('/api/provider-test', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ providerId:provider.id }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Connection test failed');
      await load(provider.id); setStatus('Connection test passed.', 'ok');
    } catch (error) { setStatus(error.message, 'error'); }
    finally { $('ps-test').disabled = false; }
  }

  $('ps-refresh').addEventListener('click', () => load());
  $('ps-save').addEventListener('click', save);
  $('ps-test').addEventListener('click', test);
  load(new URLSearchParams(location.search).get('provider') || location.hash.slice(1));
})();
