/* Lineup guides: every competitive map's minimap, an agent picker, video search
   links and a marker editor. Maps and agents come from valorant-api.com at
   runtime. Lineups are saved in this browser only. */
(() => {
  const $ = (id) => document.getElementById(id);
  const mapSelect = $('lineupMap');
  if (!mapSelect) return;
  const agentSelect = $('lineupAgent'), board = $('lineupBoard'), image = $('lineupMapImage'), layer = $('lineupLayer');
  const status = $('lineupStatus'), list = $('lineupList'), form = $('lineupForm'), addButton = $('lineupAdd');
  const KEY = 'kixot_lineups_v1', PICK = 'kixot_lineup_pick_v1', SVG = 'http://www.w3.org/2000/svg';
  let maps = [], agents = [], lineups = [], selected = null, draft = null;

  const say = (text) => { status.textContent = text; };
  const getJson = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  const point = (value) => Array.isArray(value) && value.length === 2 && value.every((n) => Number.isFinite(n) && n >= 0 && n <= 100);
  const videoUrl = (value) => {
    try {
      const url = new URL(String(value).trim());
      return url.protocol === 'https:' && /^(www\.|m\.)?(youtube\.com|youtu\.be)$/.test(url.hostname) ? url.href : '';
    } catch { return ''; }
  };
  const clean = (item) => {
    if (!item || typeof item !== 'object' || !point(item.from) || !point(item.to)) return null;
    if (typeof item.map !== 'string' || typeof item.agent !== 'string' || typeof item.name !== 'string' || !item.name.trim()) return null;
    return {
      id: typeof item.id === 'string' ? item.id.slice(0, 64) : String(Date.now()) + Math.random().toString(16).slice(2),
      map: item.map.slice(0, 64), agent: item.agent.slice(0, 64), name: item.name.trim().slice(0, 80),
      ability: typeof item.ability === 'string' ? item.ability.slice(0, 60) : '',
      video: videoUrl(item.video || ''), from: item.from.map(Number), to: item.to.map(Number)
    };
  };
  const read = () => { try { const saved = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(saved) ? saved.map(clean).filter(Boolean) : []; } catch { return []; } };
  const write = () => { try { localStorage.setItem(KEY, JSON.stringify(lineups)); return true; } catch { say('Could not save in this browser. Export your lineups to keep them.'); return false; } };

  const currentMap = () => maps.find((item) => item.uuid === mapSelect.value);
  const currentAgent = () => agents.find((item) => item.uuid === agentSelect.value);
  const visible = () => lineups.filter((item) => item.map === mapSelect.value && item.agent === agentSelect.value);

  const shape = (name, attrs) => { const node = document.createElementNS(SVG, name); Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value)); return node; };
  const drawOne = (item, active, index) => {
    const group = shape('g', { class: 'lineup-mark' + (active ? ' is-active' : '') });
    group.append(
      shape('line', { x1: item.from[0], y1: item.from[1], x2: item.to[0], y2: item.to[1] }),
      shape('circle', { cx: item.from[0], cy: item.from[1], r: 1.5, class: 'lineup-from' }),
      shape('circle', { cx: item.to[0], cy: item.to[1], r: 1.9, class: 'lineup-to' })
    );
    if (index) { const label = shape('text', { x: item.from[0] + 2.2, y: item.from[1] - 1.6 }); label.textContent = String(index); group.appendChild(label); }
    return group;
  };
  const draw = () => {
    layer.replaceChildren();
    visible().forEach((item, index) => layer.appendChild(drawOne(item, item.id === selected, index + 1)));
    if (draft && draft.from) {
      if (draft.to) layer.appendChild(drawOne(draft, true, 0));
      else layer.appendChild(shape('circle', { cx: draft.from[0], cy: draft.from[1], r: 1.5, class: 'lineup-from lineup-draft' }));
    }
  };

  const button = (text, action) => { const node = document.createElement('button'); node.type = 'button'; node.className = 'rbtn vod-mini'; node.textContent = text; node.addEventListener('click', action); return node; };
  const renderList = () => {
    list.replaceChildren();
    const items = visible();
    $('lineupEmpty').hidden = items.length > 0;
    items.forEach((item, index) => {
      const row = document.createElement('li');
      if (item.id === selected) row.className = 'is-active';
      const title = document.createElement('span');
      title.textContent = (index + 1) + '. ' + item.name + (item.ability ? ' (' + item.ability + ')' : '');
      const actions = document.createElement('div'); actions.className = 'vod-actions';
      actions.appendChild(button('Show', () => { selected = item.id; draw(); renderList(); board.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }));
      if (item.video) { const link = document.createElement('a'); link.className = 'rbtn vod-mini'; link.href = item.video; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Watch'; actions.appendChild(link); }
      actions.appendChild(button('Delete', () => { if (!window.confirm('Delete this lineup?')) return; lineups = lineups.filter((other) => other.id !== item.id); if (selected === item.id) selected = null; write(); refresh(); }));
      row.append(title, actions); list.appendChild(row);
    });
  };

  const stopDraft = () => { draft = null; form.hidden = true; board.classList.remove('is-placing'); addButton.textContent = 'Add a lineup'; };
  const refresh = () => {
    const map = currentMap(), agent = currentAgent();
    if (!map || !agent) return;
    if (image.dataset.map !== map.uuid) { image.dataset.map = map.uuid; image.src = map.displayIcon; image.alt = map.displayName + ' minimap'; }
    $('lineupAgentIcon').src = agent.displayIconSmall || agent.displayIcon || ''; $('lineupAgentIcon').alt = agent.displayName; $('lineupAgentIcon').hidden = false;
    const query = encodeURIComponent('valorant ' + agent.displayName + ' ' + map.displayName + ' lineups');
    $('lineupYoutube').href = 'https://www.youtube.com/results?search_query=' + query;
    $('lineupGoogle').href = 'https://www.google.com/search?q=' + query;
    $('lineupLinks').hidden = false;
    const abilities = $('lineupAbility'); abilities.replaceChildren();
    const none = document.createElement('option'); none.value = ''; none.textContent = 'Any ability'; abilities.appendChild(none);
    (agent.abilities || []).filter((ability) => ability.displayName && ability.slot !== 'Passive').forEach((ability) => { const option = document.createElement('option'); option.value = ability.displayName; option.textContent = ability.displayName; abilities.appendChild(option); });
    try { localStorage.setItem(PICK, JSON.stringify([map.uuid, agent.uuid])); } catch {}
    draw(); renderList();
  };

  mapSelect.addEventListener('change', () => { selected = null; stopDraft(); say(''); refresh(); });
  agentSelect.addEventListener('change', () => { selected = null; stopDraft(); say(''); refresh(); });
  addButton.addEventListener('click', () => {
    if (draft) { stopDraft(); say(''); draw(); return; }
    draft = {}; selected = null; board.classList.add('is-placing'); addButton.textContent = 'Cancel';
    say('Click the map where you stand.'); draw(); renderList();
  });
  board.addEventListener('click', (event) => {
    if (!draft || draft.to) return;
    const box = image.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const spot = [Math.round((event.clientX - box.left) / box.width * 1000) / 10, Math.round((event.clientY - box.top) / box.height * 1000) / 10];
    if (!point(spot)) return;
    if (!draft.from) { draft.from = spot; say('Now click where it lands.'); }
    else { draft.to = spot; form.hidden = false; board.classList.remove('is-placing'); say('Name it and save.'); $('lineupName').focus(); }
    draw();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!draft || !draft.to) return;
    const raw = $('lineupVideo').value.trim(), video = raw ? videoUrl(raw) : '';
    if (raw && !video) { say('Use a YouTube link, or leave the video empty.'); return; }
    const item = clean({ map: mapSelect.value, agent: agentSelect.value, name: $('lineupName').value, ability: $('lineupAbility').value, video, from: draft.from, to: draft.to });
    if (!item) { say('Give the lineup a name.'); return; }
    if (lineups.length >= 2000) { say('Lineup limit reached. Delete some first.'); return; }
    lineups.push(item); selected = item.id; form.reset(); stopDraft();
    if (write()) say('Lineup saved in this browser.');
    refresh();
  });
  $('lineupCancel').addEventListener('click', () => { form.reset(); stopDraft(); say(''); draw(); });
  $('lineupExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ version: 1, lineups }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'kixot-lineups.json';
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
  $('lineupImportButton').addEventListener('click', () => $('lineupImport').click());
  $('lineupImport').addEventListener('change', async () => {
    const file = $('lineupImport').files[0]; $('lineupImport').value = '';
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('too large');
      const parsed = JSON.parse(await file.text());
      const incoming = (Array.isArray(parsed) ? parsed : parsed.lineups || []).map(clean).filter(Boolean);
      const known = new Set(lineups.map((item) => item.id));
      const fresh = incoming.filter((item) => !known.has(item.id)).slice(0, 2000 - lineups.length);
      lineups = lineups.concat(fresh); write(); refresh();
      say(fresh.length + ' lineup' + (fresh.length === 1 ? '' : 's') + ' imported.');
    } catch { say('That file is not a Kixot lineup export.'); }
  });

  const fill = (select, items) => {
    select.replaceChildren();
    items.forEach((item) => { const option = document.createElement('option'); option.value = item.uuid; option.textContent = item.displayName; select.appendChild(option); });
    select.disabled = false;
  };
  const load = async () => {
    say('Loading maps and agents.');
    try {
      const [mapData, agentData] = await Promise.all([
        getJson('https://valorant-api.com/v1/maps'),
        getJson('https://valorant-api.com/v1/agents?isPlayableCharacter=true')
      ]);
      maps = mapData.data.filter((item) => item.displayIcon && item.tacticalDescription).sort((a, b) => a.displayName.localeCompare(b.displayName));
      agents = agentData.data.sort((a, b) => a.displayName.localeCompare(b.displayName));
      if (!maps.length || !agents.length) throw new Error('empty');
      lineups = read(); fill(mapSelect, maps); fill(agentSelect, agents);
      try { const [map, agent] = JSON.parse(localStorage.getItem(PICK) || '[]'); if (maps.some((item) => item.uuid === map)) mapSelect.value = map; if (agents.some((item) => item.uuid === agent)) agentSelect.value = agent; } catch {}
      addButton.disabled = false; say(''); refresh();
    } catch { say('Maps could not load. Check your connection and reload.'); }
  };
  let started = false;
  const start = () => { if (!started) { started = true; load(); } };
  if ('IntersectionObserver' in window) {
    const watcher = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { watcher.disconnect(); start(); } }, { rootMargin: '400px' });
    watcher.observe($('lineups'));
  } else start();
})();
