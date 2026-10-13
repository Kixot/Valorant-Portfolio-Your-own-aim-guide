(() => {
  'use strict';
  const $ = id => document.getElementById(id), api = window.KixotHudAnalysis;
  const canvas = $('hudPreview'), ctx = canvas.getContext('2d'), video = $('localPlayer');
  let boxes = structuredClone(api.defaults), key = '', drag = null;
  const fields = { x: 'hudX', y: 'hudY', width: 'hudWidth', height: 'hudHeight' };
  const sync = () => { for (const [name, id] of Object.entries(fields)) $(id).value = +(boxes[$('hudRegion').value][name] * 100).toFixed(2); };
  const save = () => { try { localStorage.setItem('kixot_hud_v1:' + key, JSON.stringify({ version: 1, boxes })); } catch {} };
  const draw = () => {
    if (!video.videoWidth || !$('hudOptions').open) return;
    // Show the upper 18% enlarged so the HUD is usable on a phone.
    canvas.width = Math.min(1200, video.videoWidth); canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth * .18);
    ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight * .18, 0, 0, canvas.width, canvas.height);
    for (const [name, box] of Object.entries(boxes)) {
      const active = name === $('hudRegion').value; ctx.strokeStyle = active ? '#fff' : '#888'; ctx.lineWidth = active ? 3 : 1;
      ctx.setLineDash(active ? [] : [4, 4]); ctx.strokeRect(box.x * canvas.width, box.y / .18 * canvas.height, box.width * canvas.width, box.height / .18 * canvas.height);
    }
    ctx.setLineDash([]);
  };
  $('hudRegion').addEventListener('change', () => { sync(); draw(); });
  for (const id of Object.values(fields)) $(id).addEventListener('input', () => {
    const next = structuredClone(boxes), region = next[$('hudRegion').value];
    for (const [name, field] of Object.entries(fields)) region[name] = $(field).valueAsNumber / 100;
    try { boxes = api.regions(next); $('hudStatus').textContent = ''; save(); draw(); }
    catch (error) { $('hudStatus').textContent = error.message; }
  });
  const point = event => { const rect = canvas.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(.18, (event.clientY - rect.top) / rect.height * .18)) }; };
  canvas.addEventListener('pointerdown', event => { if (event.button !== 0) return; event.preventDefault(); drag = { id: event.pointerId, start: point(event) }; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    const end = point(event), start = drag.start, width = Math.abs(end.x - start.x), height = Math.abs(end.y - start.y);
    if (width < .005 || height < .005) return;
    boxes[$('hudRegion').value] = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width, height }; sync(); draw();
  });
  canvas.addEventListener('pointerup', () => { drag = null; save(); });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  $('resetHud').addEventListener('click', () => { boxes = structuredClone(api.defaults); sync(); save(); draw(); });
  $('hudOptions').addEventListener('toggle', draw); video.addEventListener('seeked', draw); video.addEventListener('loadeddata', draw);
  window.KixotHudSettings = Object.freeze({
    select(value) { key = value; boxes = structuredClone(api.defaults); try { const saved = JSON.parse(localStorage.getItem('kixot_hud_v1:' + key)); if (saved?.version === 1) boxes = api.regions(saved.boxes); } catch {} sync(); draw(); },
    getBoxes() { return api.regions(boxes); }
  });
  sync();
})();
