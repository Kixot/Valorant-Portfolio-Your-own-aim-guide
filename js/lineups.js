/* Lineups board. Pick a map, an agent and an ability; landing spots show on the
   minimap. Click a landing spot to see where to throw it from, then click a
   standing spot to open its video. Maps, agents and ability icons come from
   valorant-api.com at runtime. Lineups are saved in this browser only. */
(() => {
  const $ = (id) => document.getElementById(id);
  const stage = $('luStage');
  if (!stage) return;
  const canvas = $('luCanvas'), image = $('luMapImage'), lines = $('luLines'), marks = $('luMarks'), detail = $('luDetail'), form = $('luForm');
  const KEY = 'kixot_lineups_v1', PICK = 'kixot_lineup_pick_v2', SVG = 'http://www.w3.org/2000/svg';
  let maps = [], agents = [], lineups = [];
  const pick = { map: '', agent: '', ability: '', side: '' };
  let openGroup = null, openLineup = null, draft = null;
  const view = { scale: 1, x: 0, y: 0 };

  const say = (text) => { $('luStatus').textContent = text; };
  const getJson = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; };
  const point = (value) => Array.isArray(value) && value.length === 2 && value.every((n) => Number.isFinite(n) && n >= 0 && n <= 100);
  const videoUrl = (value) => {
    try {
      const url = new URL(String(value).trim());
      return url.protocol === 'https:' && /^(www\.|m\.)?(youtube\.com|youtu\.be)$/.test(url.hostname) ? url.href : '';
    } catch { return ''; }
  };
  const videoId = (value) => {
    try {
      const url = new URL(value);
      const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.pathname === '/watch' ? url.searchParams.get('v') : (/^\/(?:shorts|embed|live)\/([^/]+)/.exec(url.pathname) || [])[1];
      if (!/^[\w-]{11}$/.test(id || '')) return null;
      const start = parseInt(url.searchParams.get('t') || url.searchParams.get('start') || '0', 10);
      return { id, start: Number.isFinite(start) && start > 0 ? start : 0 };
    } catch { return null; }
  };
  const clean = (item) => {
    if (!item || typeof item !== 'object' || !point(item.from) || !point(item.to)) return null;
    if (typeof item.map !== 'string' || typeof item.agent !== 'string' || typeof item.name !== 'string' || !item.name.trim()) return null;
    return {
      id: typeof item.id === 'string' ? item.id.slice(0, 64) : String(Date.now()) + Math.random().toString(16).slice(2),
      map: item.map.slice(0, 64), agent: item.agent.slice(0, 64), name: item.name.trim().slice(0, 80),
      ability: typeof item.ability === 'string' ? item.ability.slice(0, 60) : '',
      side: item.side === 'attack' || item.side === 'defense' ? item.side : '',
      desc: typeof item.desc === 'string' ? item.desc.trim().slice(0, 600) : '',
      video: videoUrl(item.video || ''), from: item.from.map(Number), to: item.to.map(Number)
    };
  };
  const read = () => { try { const saved = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(saved) ? saved.map(clean).filter(Boolean) : []; } catch { return []; } };
  const write = () => { try { localStorage.setItem(KEY, JSON.stringify(lineups)); return true; } catch { say('Could not save in this browser. Storage may be full or blocked.'); return false; } };

  const agent = () => agents.find((item) => item.uuid === pick.agent);
  const agentOf = (id) => agents.find((item) => item.uuid === id);
  const faceOf = (id) => { const found = agentOf(id); return found && (found.displayIconSmall || found.displayIcon); };
  const abilityIcon = (name, agentId) => { const found = ((agentOf(agentId || pick.agent) || {}).abilities || []).find((ability) => ability.displayName === name); return found && found.displayIcon; };
  // Show all: every lineup saved on this map, whatever the agent, ability or side filters say.
  let showAll = false;
  const visible = () => lineups.filter((item) => item.map === pick.map && (showAll || (item.agent === pick.agent && (!pick.ability || item.ability === pick.ability) && (!pick.side || !item.side || item.side === pick.side))));
  // Lineups that land on the same spot with the same ability share one landing marker.
  const groups = () => {
    const out = [];
    visible().forEach((item) => {
      const group = out.find((other) => other.agent === item.agent && other.ability === item.ability && Math.hypot(other.to[0] - item.to[0], other.to[1] - item.to[1]) < 2.5);
      if (group) group.items.push(item); else out.push({ key: item.id, agent: item.agent, ability: item.ability, to: item.to, items: [item] });
    });
    return out;
  };

  /* ---------- zoom and pan ---------- */
  const applyView = () => {
    const limit = (stage.clientWidth * (view.scale - 1)) / 2 + stage.clientWidth * 0.35;
    view.x = Math.max(-limit, Math.min(limit, view.x)); view.y = Math.max(-limit, Math.min(limit, view.y));
    canvas.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.scale + ')';
    canvas.style.setProperty('--inv', String(1 / view.scale));
  };
  const zoomAt = (factor, clientX, clientY) => {
    const box = stage.getBoundingClientRect();
    const cx = clientX - box.left - box.width / 2, cy = clientY - box.top - box.height / 2;
    const next = Math.max(1, Math.min(5, view.scale * factor)), ratio = next / view.scale;
    view.x = cx - (cx - view.x) * ratio; view.y = cy - (cy - view.y) * ratio; view.scale = next;
    if (next === 1) { view.x = 0; view.y = 0; }
    applyView();
  };
  const centerZoom = (factor) => { const box = stage.getBoundingClientRect(); zoomAt(factor, box.left + box.width / 2, box.top + box.height / 2); };
  stage.addEventListener('wheel', (event) => { event.preventDefault(); zoomAt(event.deltaY < 0 ? 1.18 : 1 / 1.18, event.clientX, event.clientY); }, { passive: false });
  let drag = null, dragged = false;
  stage.addEventListener('pointerdown', (event) => { if (event.button !== 0 || event.target.closest('.lu-zoom')) return; drag = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y }; dragged = false; });
  window.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!dragged && Math.hypot(dx, dy) < 5) return;
    dragged = true; stage.classList.add('is-dragging'); view.x = drag.vx + dx; view.y = drag.vy + dy; applyView();
  });
  window.addEventListener('pointerup', () => { drag = null; stage.classList.remove('is-dragging'); });
  $('luZoomIn').addEventListener('click', () => centerZoom(1.4));
  $('luZoomOut').addEventListener('click', () => centerZoom(1 / 1.4));
  $('luZoomReset').addEventListener('click', () => { view.scale = 1; view.x = 0; view.y = 0; applyView(); });

  /* ---------- drawing ---------- */
  const line = (from, to, className, action) => {
    const node = document.createElementNS(SVG, 'line'); node.setAttribute('x1', from[0]); node.setAttribute('y1', from[1]); node.setAttribute('x2', to[0]); node.setAttribute('y2', to[1]); node.setAttribute('class', className + (action ? ' is-link' : ''));
    if (action) node.addEventListener('click', (event) => { event.stopPropagation(); if (!dragged) action(); });
    lines.appendChild(node);
  };
  const marker = (spot, className, icon, label, action) => {
    const node = make('button', 'lu-mark ' + className); node.type = 'button'; node.style.left = spot[0] + '%'; node.style.top = spot[1] + '%';
    node.setAttribute('aria-label', label); node.title = label;
    if (icon) { const img = make('img'); img.src = icon; img.alt = ''; img.draggable = false; node.appendChild(img); }
    if (action) node.addEventListener('click', (event) => { event.stopPropagation(); if (!dragged) action(); });
    marks.appendChild(node); return node;
  };
  const draw = () => {
    lines.replaceChildren(); marks.replaceChildren();
    const current = agent();
    if (!current) return;
    const face = current.displayIconSmall || current.displayIcon;
    const all = groups();
    if (openGroup && !all.some((group) => group.key === openGroup)) openGroup = null;
    stage.classList.toggle('has-open', !!openGroup);
    all.forEach((group) => {
      // Every lineup for the chosen ability is drawn straight away. Clicking a landing spot
      // narrows the map to that one; clicking it again brings the rest back.
      const focused = openGroup === group.key, open = !openGroup || focused;
      const node = marker(group.to, 'lu-land' + (focused ? ' is-open' : '') + (abilityIcon(group.ability, group.agent) ? '' : ' lu-dot'), abilityIcon(group.ability, group.agent), (group.ability || 'Lineup') + ', ' + group.items.length + ' spot' + (group.items.length === 1 ? '' : 's'), () => {
        openGroup = focused ? null : group.key; openLineup = null; showDetail(null); draw();
      });
      if (group.items.length > 1) node.appendChild(make('span', 'lu-count', String(group.items.length)));
      if (!open) return;
      group.items.forEach((item) => {
        // The line goes straight to the video. The standing spot opens the panel for a saved lineup.
        const watch = () => window.open(item.url || item.video, '_blank', 'noopener');
        const panel = () => { openLineup = item.id; showDetail(item); draw(); };
        line(item.from, item.to, 'lu-line' + (openLineup === item.id ? ' is-active' : ''), item.url || item.video ? watch : panel);
        marker(item.from, 'lu-stand' + (openLineup === item.id ? ' is-active' : ''), faceOf(item.agent) || face, item.name, panel);
      });
    });
    if (draft) {
      // The agent stands at the first click; the ability lands at the second.
      if (draft.from && draft.to) line(draft.from, draft.to, 'lu-line is-active');
      if (draft.from) marker(draft.from, 'lu-stand is-active', face, 'Standing spot');
      if (draft.to) { const chosen = form.hidden ? pick.ability : $('luFormAbility').value; marker(draft.to, 'lu-land is-open' + (abilityIcon(chosen) ? '' : ' lu-dot'), abilityIcon(chosen), 'Landing spot'); }
    }
    $('luEmpty').hidden = all.length > 0 || !!draft;
  };

  /* ---------- detail panel ---------- */
  const showDetail = (item) => {
    const body = $('luDetailBody'); body.replaceChildren();
    if (!item) { if (!draft || !draft.to) detail.hidden = true; return; }
    form.hidden = true; detail.hidden = false; body.hidden = false;
    const head = make('div', 'lu-head'); const icon = abilityIcon(item.ability, item.agent);
    if (icon) { const img = make('img'); img.src = icon; img.alt = item.ability; head.appendChild(img); }
    head.appendChild(make('h3', '', item.name)); body.appendChild(head);
    body.appendChild(make('p', 'lu-meta', [item.ability, item.side === 'attack' ? 'Attack' : item.side === 'defense' ? 'Defense' : ''].filter(Boolean).join(' · ')));
    const video = item.video ? videoId(item.video) : null;
    if (video) {
      const holder = make('div', 'lu-video'), frame = make('iframe');
      frame.title = item.name + ' lineup video'; frame.allow = 'autoplay; encrypted-media; picture-in-picture'; frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.src = 'https://www.youtube-nocookie.com/embed/' + video.id + '?' + new URLSearchParams({ rel: '0', playsinline: '1', autoplay: '1', mute: '1', start: String(video.start) });
      holder.appendChild(frame); body.appendChild(holder);
    } else body.appendChild(make('p', 'vod-empty', 'No video saved for this lineup.'));
    if (item.desc) body.appendChild(make('p', 'lu-desc', item.desc));
    const actions = make('div', 'vod-actions');
    if (item.video) { const link = make('a', 'rbtn vod-mini', 'Open on YouTube'); link.href = item.video; link.target = '_blank'; link.rel = 'noopener noreferrer'; actions.appendChild(link); }
    const remove = make('button', 'rbtn vod-mini', 'Delete'); remove.type = 'button';
    remove.addEventListener('click', () => { if (!window.confirm('Delete this lineup?')) return; lineups = lineups.filter((other) => other.id !== item.id); openLineup = null; write(); showDetail(null); if (!groups().some((group) => group.key === openGroup)) openGroup = null; draw(); });
    const close = make('button', 'rbtn vod-mini', 'Close'); close.type = 'button';
    close.addEventListener('click', () => { openLineup = null; showDetail(null); draw(); });
    actions.append(remove, close); body.appendChild(actions);
  };

  /* ---------- adding a lineup ---------- */
  const stopDraft = () => { draft = null; form.hidden = true; form.reset(); stage.classList.remove('is-placing'); $('luAdd').textContent = 'Add a lineup'; if (!openLineup) detail.hidden = true; };
  $('luAdd').addEventListener('click', () => {
    if (draft) { stopDraft(); say(''); draw(); return; }
    openGroup = null; openLineup = null; showDetail(null);
    draft = {}; stage.classList.add('is-placing'); $('luAdd').textContent = 'Cancel';
    say('Click the map where you stand.'); draw();
  });
  stage.addEventListener('click', (event) => {
    if (dragged || event.target.closest('.lu-zoom')) return;
    if (!draft) { if (openGroup || openLineup) { openGroup = null; openLineup = null; showDetail(null); draw(); } return; }
    if (draft.to) return;
    const box = image.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const spot = [Math.round((event.clientX - box.left) / box.width * 1000) / 10, Math.round((event.clientY - box.top) / box.height * 1000) / 10];
    if (!point(spot)) return;
    if (!draft.from) { draft.from = spot; say('Now click where it lands.'); }
    else {
      draft.to = spot; stage.classList.remove('is-placing'); say('Fill in the details and save.');
      $('luDetailBody').hidden = true; detail.hidden = false; form.hidden = false;
      $('luFormAbility').value = pick.ability; $('luFormSide').value = pick.side; $('luFormName').focus();
    }
    draw();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!draft || !draft.to) return;
    const raw = $('luFormVideo').value.trim(), video = raw ? videoUrl(raw) : '';
    if (raw && !video) { say('Use a YouTube link, or leave the video empty.'); return; }
    const item = clean({ map: pick.map, agent: pick.agent, name: $('luFormName').value, ability: $('luFormAbility').value, side: $('luFormSide').value, desc: $('luFormDesc').value, video, from: draft.from, to: draft.to });
    if (!item) { say('Give the lineup a name.'); return; }
    if (lineups.length >= 2000) { say('Lineup limit reached. Delete some first.'); return; }
    lineups.push(item); stopDraft();
    if (write()) say('Lineup saved in this browser.');
    if (item.ability && pick.ability !== item.ability) { pick.ability = item.ability; renderAbilities(); }
    const group = groups().find((other) => other.items.includes(item));
    openGroup = group ? group.key : null; openLineup = item.id; showDetail(item); draw();
  });
  $('luFormAbility').addEventListener('change', () => { if (draft) draw(); });
  $('luFormCancel').addEventListener('click', () => { stopDraft(); say(''); draw(); });

  /* ---------- pickers ---------- */
  const choice = (host, label, icon, active, action, className) => {
    const node = make('button', 'lu-choice' + (className ? ' ' + className : '') + (active ? ' is-active' : '')); node.type = 'button';
    node.setAttribute('aria-pressed', String(active)); node.title = label;
    if (icon) { const img = make('img'); img.src = icon; img.alt = ''; img.loading = 'lazy'; node.appendChild(img); node.setAttribute('aria-label', label); }
    else node.textContent = label;
    node.addEventListener('click', action); host.appendChild(node);
  };
  const remember = () => { try { localStorage.setItem(PICK, JSON.stringify(pick)); } catch {} };
  const reset = () => { openGroup = null; openLineup = null; if (draft) stopDraft(); showDetail(null); say(''); remember(); };
  const leaveShowAll = () => { if (showAll) { showAll = false; syncShowAll(); } };
  const renderMaps = () => { const host = $('luMaps'); host.replaceChildren(); maps.forEach((map) => choice(host, map.displayName, null, map.uuid === pick.map, () => { pick.map = map.uuid; reset(); syncShowAll(); view.scale = 1; view.x = 0; view.y = 0; applyView(); renderMaps(); refresh(); })); };
  const renderAgents = () => { const host = $('luAgents'); host.replaceChildren(); agents.forEach((item) => choice(host, item.displayName, item.displayIconSmall || item.displayIcon, item.uuid === pick.agent, () => { pick.agent = item.uuid; pick.ability = ''; reset(); leaveShowAll(); renderAgents(); renderAbilities(); refresh(); }, 'lu-icon')); };
  const renderAbilities = () => {
    const host = $('luAbilities'); host.replaceChildren();
    const list = ((agent() || {}).abilities || []).filter((ability) => ability.displayName && ability.slot !== 'Passive');
    if (pick.ability && !list.some((ability) => ability.displayName === pick.ability)) pick.ability = '';
    choice(host, 'All', null, !pick.ability, () => { pick.ability = ''; reset(); leaveShowAll(); renderAbilities(); draw(); });
    list.forEach((ability) => choice(host, ability.displayName, ability.displayIcon, pick.ability === ability.displayName, () => { pick.ability = ability.displayName; reset(); leaveShowAll(); renderAbilities(); draw(); }, 'lu-icon'));
    const select = $('luFormAbility'); select.replaceChildren();
    const none = make('option', '', 'No ability'); none.value = ''; select.appendChild(none);
        list.forEach((ability) => { const option = make('option', '', ability.displayName); option.value = ability.displayName; select.appendChild(option); });
  };
  const renderSides = () => { const host = $('luSides'); host.replaceChildren(); [['', 'All'], ['attack', 'Attack'], ['defense', 'Defense']].forEach(([value, label]) => choice(host, label, null, pick.side === value, () => { pick.side = value; reset(); leaveShowAll(); renderSides(); draw(); })); };
  const refresh = () => {
    const map = maps.find((item) => item.uuid === pick.map), current = agent();
    if (!map || !current) return;
    if (image.dataset.map !== map.uuid) { image.dataset.map = map.uuid; image.src = map.displayIcon; image.alt = map.displayName + ' minimap'; }
    const query = encodeURIComponent('valorant ' + current.displayName + ' ' + map.displayName + ' lineups');
    $('luYoutube').href = 'https://www.youtube.com/results?search_query=' + query;
    $('luGoogle').href = 'https://www.google.com/search?q=' + query;
    $('luTitle').textContent = current.displayName + ' on ' + map.displayName;
    draw();
  };

  /* ---------- show all saved lineups ---------- */
  const syncShowAll = () => {
    const button = $('luShowAll');
    button.textContent = showAll ? 'Back to filters' : 'Show all saved lineups';
    button.classList.toggle('rbtn--solid', showAll);
    $('luApp').classList.toggle('is-show-all', showAll);
    if (!showAll) return;
    const here = lineups.filter((item) => item.map === pick.map).length, elsewhere = lineups.length - here;
    say(here + ' saved lineup' + (here === 1 ? '' : 's') + ' on this map' + (elsewhere ? ', ' + elsewhere + ' on other maps. Pick a map to see them.' : '.'));
  };
  $('luShowAll').addEventListener('click', () => { showAll = !showAll; openGroup = null; openLineup = null; if (draft) stopDraft(); showDetail(null); if (!showAll) say(''); syncShowAll(); draw(); });
  document.addEventListener('keydown', (event) => { if (event.key !== 'Escape') return; if (draft) { stopDraft(); say(''); draw(); } else if (openLineup || openGroup) { openGroup = null; openLineup = null; showDetail(null); draw(); } });

  (async () => {
    say('Loading maps and agents.');
    try {
      const [mapData, agentData] = await Promise.all([
        getJson('https://valorant-api.com/v1/maps'),
        getJson('https://valorant-api.com/v1/agents?isPlayableCharacter=true')
      ]);
      maps = mapData.data.filter((item) => item.displayIcon && item.tacticalDescription).sort((a, b) => a.displayName.localeCompare(b.displayName));
      agents = agentData.data.sort((a, b) => a.displayName.localeCompare(b.displayName));
      if (!maps.length || !agents.length) throw new Error('empty');
      lineups = read();
      try { const saved = JSON.parse(localStorage.getItem(PICK) || '{}'); if (maps.some((item) => item.uuid === saved.map)) pick.map = saved.map; if (agents.some((item) => item.uuid === saved.agent)) pick.agent = saved.agent; } catch {}
      pick.map = pick.map || maps[0].uuid; pick.agent = pick.agent || agents[0].uuid;
      renderMaps(); renderAgents(); renderAbilities(); renderSides(); applyView();
      $('luAdd').disabled = false; say(''); refresh();
    } catch { say('Maps could not load. Check your connection and reload.'); }
  })();
})();
