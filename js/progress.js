(() => {
  'use strict';
  const KEY = 'kixot_drill_progress_v1';
  const VERSION = 1;
  const MAX_RUNS = 10000;
  const modes = { flick: 'Flick', precision: 'Precision', track: 'Tracking' };
  const difficulties = ['rookie', 'ranked', 'ascendant', 'radiant'];
  let runs = [], writable = true, message = '';
  const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const validate = payload => {
    if (!payload || payload.version !== VERSION || !Array.isArray(payload.runs) || payload.runs.length > MAX_RUNS) throw new Error('Use a version 1 Kixot progress file with up to 10,000 runs.');
    const ids = new Set();
    return payload.runs.map(run => {
      if (!run || typeof run.id !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(run.id) || ids.has(run.id)
        || typeof run.date !== 'string' || run.date.length > 40 || !Number.isFinite(Date.parse(run.date))
        || !Object.hasOwn(modes, run.mode) || !difficulties.includes(run.difficulty)
        || !finite(run.sens, 0.001, 10) || !finite(run.dpi, 50, 64000)
        || !finite(run.score, 0, 1e9) || !Number.isInteger(run.score) || !finite(run.accuracy, 0, 100)) throw new Error('This file contains an invalid drill result. Nothing was imported.');
      ids.add(run.id);
      return { id: run.id, date: new Date(run.date).toISOString(), mode: run.mode, difficulty: run.difficulty,
        sens: run.sens, dpi: run.dpi, score: run.score, accuracy: run.accuracy };
    });
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) runs = validate(JSON.parse(raw));
  } catch {
    writable = false;
    message = 'Saved progress could not be read. New runs stay in this visit until you export or clear progress.';
  }
  const persist = () => {
    if (!writable) return false;
    try {
      if (runs.length > MAX_RUNS) throw new Error('Full');
      const raw = localStorage.getItem(KEY);
      const saved = raw ? validate(JSON.parse(raw)) : [];
      const merged = new Map(saved.map(run => [run.id, run]));
      runs.forEach(run => merged.set(run.id, run));
      if (merged.size > MAX_RUNS) throw new Error('Full');
      runs = [...merged.values()];
      localStorage.setItem(KEY, JSON.stringify({ version: VERSION, runs }));
      return true;
    } catch {
      message = 'Progress storage is unavailable or full. Your runs stay in this visit. Export to keep them.';
      return false;
    }
  };
  const status = document.getElementById('progressStatus');
  const modePicker = document.getElementById('progressMode');
  const table = document.getElementById('progressRows');
  const chart = document.getElementById('progressChart');
  const svgNS = 'http://www.w3.org/2000/svg';
  const svgElement = (name, attributes) => {
    const node = document.createElementNS(svgNS, name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  };
  const render = () => {
    if (!table || !chart || !modePicker) return;
    status.textContent = message;
    const selected = runs.filter(run => run.mode === modePicker.value).sort((a,b) => Date.parse(a.date) - Date.parse(b.date));
    const best = selected.reduce((record, run) => !record || run.score > record.score ? run : record, null);
    document.getElementById('progressBest').textContent = best ? `${best.score.toLocaleString()} / ${best.difficulty}` : '-';
    document.getElementById('progressCount').textContent = String(selected.length);
    table.replaceChildren();
    selected.slice(-10).reverse().forEach(run => {
      const row = document.createElement('tr');
      const date = new Date(run.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
      [date, modes[run.mode], run.difficulty, String(run.sens), run.score.toLocaleString(), `${run.accuracy}%`].forEach(value => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      });
      table.appendChild(row);
    });
    document.getElementById('progressEmpty').hidden = selected.length > 0;
    chart.replaceChildren();
    const recent = selected.slice(-20);
    chart.style.display = recent.length ? '' : 'none';
    chart.setAttribute('aria-label', `${modes[modePicker.value]} scores, latest ${recent.length} runs. The recent runs table follows.`);
    if (!recent.length) return;
    const max = Math.max(1, ...recent.map(run => run.score));
    chart.appendChild(svgElement('path', { d: 'M40 16V144H590', stroke: '#666', fill: 'none' }));
    const points = recent.map((run, index) => [recent.length === 1 ? 315 : 40 + index * 550 / (recent.length - 1), 144 - run.score / max * 118]);
    chart.appendChild(svgElement('polyline', { points: points.map(point => point.join(',')).join(' '), stroke: '#fff', 'stroke-width': 2, fill: 'none' }));
    points.forEach(([x, y], index) => {
      const dot = svgElement('circle', { cx: x, cy: y, r: 3, fill: '#fff' });
      const title = svgElement('title', {});
      title.textContent = `${new Date(recent[index].date).toLocaleDateString()}: ${recent[index].score}`;
      dot.appendChild(title);
      chart.appendChild(dot);
    });
    for (const [x,y,value] of [[8,29,String(max)], [21,148,'0'], [40,172,'Oldest'], [546,172,'Latest']]) {
      const text = svgElement('text', { x, y, fill: '#aaa', 'font-size': 12 });
      text.textContent = value;
      chart.appendChild(text);
    }
  };
  const addRun = result => {
    const record = { id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`, date: new Date().toISOString(),
      mode: result.mode, difficulty: result.diff, sens: result.sens, dpi: result.dpi, score: result.score, accuracy: result.acc };
    try {
      validate({ version: VERSION, runs: [record] });
      runs.push(record);
      if (persist()) message = 'Run saved.';
      render();
    } catch { message = 'The result could not be saved. Existing progress is unchanged.'; render(); }
  };
  modePicker?.addEventListener('change', render);
  document.getElementById('exportProgress')?.addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: VERSION, runs }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `kixot-progress-${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const importer = document.getElementById('importProgress');
  document.getElementById('importProgressButton')?.addEventListener('click', () => importer.click());
  importer?.addEventListener('change', async () => {
    const file = importer.files?.[0];
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Choose a progress file smaller than 2 MB.');
      const incoming = validate(JSON.parse(await file.text()));
      const merged = new Map(runs.map(run => [run.id, run]));
      incoming.forEach(run => { if (!merged.has(run.id)) merged.set(run.id, run); });
      if (merged.size > MAX_RUNS) throw new Error('The import exceeds 10,000 runs. Nothing was imported.');
      const added = merged.size - runs.length;
      runs = [...merged.values()];
      message = persist() ? `Imported ${added} runs. Existing runs kept.` : 'Imported for this visit. Export to keep these runs.';
    } catch (error) { message = error instanceof SyntaxError ? 'This file is not valid JSON. Nothing was imported.' : error.message; }
    importer.value = '';
    render();
  });
  document.getElementById('clearProgress')?.addEventListener('click', () => {
    if (!confirm('Clear all saved drill progress? Export first if you want to keep a copy.')) return;
    try {
      localStorage.removeItem(KEY);
      writable = true;
      runs = [];
      message = 'Progress cleared.';
    } catch { message = 'Saved progress could not be cleared. Your runs are still here.'; }
    render();
  });
  window.addEventListener('storage', event => {
    if (event.key !== KEY || !writable) return;
    try { runs = event.newValue ? validate(JSON.parse(event.newValue)) : []; render(); }
    catch { message = 'Another tab saved unreadable progress. This tab keeps its current runs.'; render(); }
  });
  window.KixotProgress = Object.freeze({ addRun });
  render();
})();
