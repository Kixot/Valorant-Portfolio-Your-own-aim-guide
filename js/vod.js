(() => {
  'use strict';
  const core = window.KixotVodCore;
  const $ = id => document.getElementById(id);
  const prefix = 'kixot_vod_v1:';
  const reviews = new Map(), files = new Map(), damaged = new Set();
  let current = null, token = 0, objectUrl = null, youtube = null, loaded = false, apiPromise = null, playerTimer = null;
  const local = $('localPlayer');
  const message = text => { $('vodStatus').textContent = text; };
  const warning = text => { $('vodStorageStatus').textContent = text; };
  const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  const button = (text, action) => { const node = element('button', text, 'rbtn vod-mini'); node.type = 'button'; node.addEventListener('click', action); return node; };
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const name = review => review.source.type === 'youtube' ? 'YouTube ' + review.source.videoId : review.source.name;
  const analytics = (event, params = {}) => window.KixotAnalytics?.track(event, { video_source: current?.source.type, ...params });
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const storageKey = localStorage.key(index);
      if (!storageKey?.startsWith(prefix)) continue;
      try {
        const review = core.validateReview(JSON.parse(localStorage.getItem(storageKey)));
        if (storageKey !== prefix + review.key) throw new Error();
        reviews.set(review.key, review);
      } catch { damaged.add(storageKey.slice(prefix.length)); warning('An unreadable save was preserved. Export new work before leaving.'); }
    }
  } catch { warning('Browser storage is unavailable. Reviews stay in this visit. Export before leaving.'); }
  const persist = review => {
    reviews.set(review.key, review);
    try {
      if (damaged.has(review.key)) throw new Error();
      localStorage.setItem(prefix + review.key, JSON.stringify(review));
      return true;
    } catch { warning('This review is kept in this visit. Export before leaving; browser storage could not save it.'); return false; }
  };
  const save = () => { current.updated = new Date().toISOString(); persist(current); render(); };
  const newReview = source => ({ version: 1, key: core.key(source), source, updated: new Date().toISOString(), nextRound: 1, rounds: [], mistakes: [], roundTiming: { first: 0, interval: 130, duration: 0 } });
  const adapter = {
    duration() { try { return current?.source.type === 'file' ? local.duration : youtube?.getDuration?.(); } catch { return 0; } },
    currentTime() {
      if (!loaded || !current) return null;
      try { const value = current.source.type === 'file' ? local.currentTime : youtube.getCurrentTime(); return core.time(value); } catch { return null; }
    },
    seek(value) {
      if (!loaded || core.time(value) === null) { message('Load the matching video before seeking.'); return false; }
      try {
        const duration = current.source.type === 'file' ? local.duration : youtube.getDuration();
        if (Number.isFinite(duration) && duration > 0 && value > duration) { message('That timestamp is outside this video.'); return false; }
        if (current.source.type === 'file') local.currentTime = value; else youtube.seekTo(value, true);
        message('Seek: ' + core.stamp(value)); return true;
      } catch { message('Could not seek. Try loading the video again.'); return false; }
    },
    pause() { try { local.pause(); youtube?.pauseVideo?.(); } catch {} }
  };
  const loadApi = () => {
    if (window.YT?.Player) return Promise.resolve();
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      let script, timer;
      const fail = () => { clearTimeout(timer); script?.remove(); apiPromise = null; reject(new Error('YouTube could not load. Check your connection or try a local file.')); };
      // The official callback exists before the API script is inserted.
      window.onYouTubeIframeAPIReady = () => { clearTimeout(timer); resolve(); };
      script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api'; script.async = true;
      script.onerror = fail; timer = setTimeout(fail, 20000); document.head.appendChild(script);
    });
    return apiPromise;
  };
  const friendly = {
    2: 'YouTube could not read this video ID. Check the link.',
    5: 'YouTube could not play this video in this browser. Try another browser or a local file.',
    100: 'This video is unavailable, private or deleted.',
    101: 'The owner does not allow this video to play on other sites.',
    150: 'The owner does not allow this video to play on other sites.',
    153: 'YouTube did not receive this page\'s referrer. Reload the page; if it persists, open this site in Chrome or Edge, or use a local file.'
  };
  const syncControls = () => {
    $('markRound').disabled = !loaded; $('tagMistake').disabled = !loaded;
    ['exportReviewText', 'exportReviewJson', 'shareReview', 'deleteReview'].forEach(id => { $(id).disabled = !current; });
    $('activeVideo').textContent = current ? name(current) : 'Choose a video';
  };
  const success = expected => {
    if (expected !== token || loaded || !current) return;
    loaded = true; $('playerEmpty').hidden = true;
    clearTimeout(playerTimer);
    updateDuration(); persist(current); render(); message('Video ready.'); analytics('video_loaded');
  };
  const cleanPlayer = () => {
    clearTimeout(playerTimer);
    loaded = false; adapter.pause();
    local.removeAttribute('src'); local.load(); local.hidden = true;
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    if (youtube) { try { youtube.destroy(); } catch {} youtube = null; }
    $('youtubeHost').replaceChildren(); $('youtubeHost').hidden = true; $('playerEmpty').hidden = false;
  };
  const select = async (source, file) => {
    if (!reviews.has(core.key(source)) && reviews.size >= 200) { message('Saved review limit reached. Export and delete a review first.'); return; }
    const expected = ++token; cleanPlayer();
    current = reviews.get(core.key(source)) || newReview(source);
    $('mistakeForm').hidden = true; $('manualShare').hidden = true;
    try { sessionStorage.setItem('kixot_vod_active_v1', current.key); } catch {}
    persist(current); render();
    if (source.type === 'file') {
      const selected = file || files.get(current.key);
      if (!selected) { message('Choose the matching local file to play. Saved tags are restored.'); return; }
      files.set(current.key, selected); local.hidden = false;
      local.onloadeddata = () => success(expected);
      local.onloadedmetadata = () => success(expected);
      local.onerror = () => { if (expected === token) { loaded = false; syncControls(); message('This file could not play. Try an MP4 or WebM supported by your browser.'); } };
      try { objectUrl = URL.createObjectURL(selected); local.src = objectUrl; }
      catch { local.hidden = true; message('This browser could not open the local file. Choose it again or try another browser.'); return; }
      message('Loading local video.'); return;
    }
    $('youtubeUrl').value = 'https://www.youtube.com/watch?v=' + source.videoId;
    message('Loading YouTube.');
    try {
      await loadApi(); if (expected !== token) return;
      $('youtubeHost').hidden = false;
      const mount = element('iframe'); mount.id = 'youtubePlayer';
      mount.title = 'YouTube VOD player'; mount.referrerPolicy = 'strict-origin-when-cross-origin';
      mount.allow = 'encrypted-media; picture-in-picture'; mount.allowFullscreen = true;
      mount.src = 'https://www.youtube.com/embed/' + source.videoId + '?' + new URLSearchParams({ enablejsapi: '1', origin: location.origin, autoplay: '0', playsinline: '1', rel: '0' });
      $('youtubeHost').appendChild(mount);
      youtube = new YT.Player(mount, { videoId: source.videoId, width: '100%', height: '100%', playerVars: { origin: location.origin, autoplay: 0, playsinline: 1, rel: 0 },
        events: {
          onReady(event) {
            if (expected !== token) return;
            event.target.getIframe().setAttribute('title', 'YouTube VOD player');
            event.target.getIframe().referrerPolicy = 'strict-origin-when-cross-origin';
            event.target.cueVideoById(source.videoId);
          },
          onStateChange(event) {
            if (expected !== token) return;
            if ([1, 2, 5].includes(event.data) && event.target.getVideoData().video_id === source.videoId) success(expected);
          },
          onError(event) { if (expected === token) { clearTimeout(playerTimer); loaded = false; syncControls(); message((friendly[event.data] || 'YouTube could not play this video. Try a local file.') + ' (code ' + event.data + ')'); } }
        }
      });
      playerTimer = setTimeout(() => { if (expected === token && !loaded) message('YouTube has not finished loading. Reload this page or try Chrome, Edge or a local file.'); }, 20000);
    } catch (error) { if (expected === token) message(error.message); }
  };
  const editRow = (item, kind, row) => {
    const form = element('form', undefined, 'vod-edit');
    const timestampLabel = element('label', 'Time'); const timestamp = element('input'); timestamp.value = String(Number(item.time.toFixed(3))); timestamp.required = true; timestamp.inputMode = 'decimal'; timestampLabel.appendChild(timestamp);
    form.appendChild(timestampLabel);
    let label, type, note;
    if (kind === 'round') {
      const field = element('label', 'Round'); label = element('input'); label.value = item.label; label.required = true; label.maxLength = 60; field.appendChild(label); form.appendChild(field);
    } else {
      const field = element('label', 'Type'); type = element('select'); core.TYPES.forEach(value => type.appendChild(new Option(value, value))); type.value = item.type; field.appendChild(type);
      const noteLabel = element('label', 'Note'); note = element('textarea'); note.value = item.note; note.maxLength = 1000; noteLabel.appendChild(note); form.append(field, noteLabel);
    }
    const saveButton = element('button', 'Save', 'rbtn vod-mini'); saveButton.type = 'submit';
    form.append(saveButton, button('Cancel', render));
    form.addEventListener('submit', event => {
      event.preventDefault(); const value = core.time(timestamp.value);
      if (value === null) { message('Use seconds or mm:ss, up to 24 hours.'); return; }
      item.time = value;
      if (kind === 'round') { if (!label.value.trim()) return; item.label = label.value.trim(); } else { item.type = type.value; item.note = note.value; }
      save(); message('Updated.');
    });
    row.replaceChildren(form); timestamp.focus();
  };
  const renderEntries = (host, items, kind) => {
    host.replaceChildren();
    if (!items.length) { host.appendChild(element('p', kind === 'round' ? 'No custom points yet.' : 'No mistakes tagged yet.', 'vod-empty')); return; }
    [...items].sort((a, b) => a.time - b.time).forEach(item => {
      const row = element('li', undefined, 'vod-entry');
      const heading = element('div', undefined, 'vod-entry-head');
      const seek = button(core.stamp(item.time) + ' ' + (kind === 'round' ? item.label : item.type), () => adapter.seek(item.time)); seek.classList.add('vod-seek');
      const actions = element('div', undefined, 'vod-row-actions');
      actions.append(button('Edit', () => editRow(item, kind, row)), button('Delete', () => { const index = items.indexOf(item); if (index >= 0) items.splice(index, 1); save(); message('Deleted.'); }));
      heading.append(seek, actions); row.appendChild(heading);
      if (kind === 'mistake' && item.note) row.appendChild(element('p', item.note, 'vod-note'));
      host.appendChild(row);
    });
  };
  const render = () => {
    syncControls();
    $('reviewWorkspace').hidden = !current;
    $('savedReviews').replaceChildren();
    [...reviews.values()].sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated)).forEach(review => {
      const row = element('li', undefined, 'vod-saved-row');
      row.append(button(name(review), () => select(review.source)), element('span', new Date(review.updated).toLocaleDateString(), 'vod-saved-date'), button('Delete', () => deleteSaved(review)));
      $('savedReviews').appendChild(row);
    });
    $('savedEmpty').hidden = reviews.size > 0; $('exportAllReviews').disabled = !reviews.size;
    if (!current) return;
    $('roundFirst').value = current.roundTiming.first;
    $('roundInterval').value = current.roundTiming.interval;
    renderAutoRounds();
    renderEntries($('roundList'), current.rounds, 'round'); renderEntries($('mistakeList'), current.mistakes, 'mistake');
    $('mistakeChart').replaceChildren(); $('mistakeCounts').replaceChildren();
    const counts = core.TYPES.map(type => current.mistakes.filter(item => item.type === type).length);
    const max = Math.max(1, ...counts);
    core.TYPES.forEach((type, index) => {
      const bar = element('div', undefined, 'vod-chart-row'); const rail = element('div', undefined, 'vod-chart-rail'); const fill = element('span'); fill.style.width = counts[index] / max * 100 + '%'; rail.appendChild(fill);
      bar.append(element('span', type), rail); $('mistakeChart').appendChild(bar);
      const row = element('tr'); row.append(element('th', type), element('td', String(counts[index]))); row.firstChild.scope = 'row'; $('mistakeCounts').appendChild(row);
    });
  };
  const renderAutoRounds = () => {
    $('autoRoundList').replaceChildren();
    core.autoRounds(current).forEach(round => $('autoRoundList').appendChild(button(core.stamp(round.time) + ' ' + round.label, () => adapter.seek(round.time))));
    $('autoRoundEmpty').hidden = core.autoRounds(current).length > 0;
  };
  const updateDuration = () => {
    if (!current || !loaded) return;
    const duration = adapter.duration();
    if (!Number.isFinite(duration) || duration <= 0 || duration > 86400 || current.roundTiming.duration === duration) return;
    current.roundTiming.duration = duration; persist(current); renderAutoRounds();
  };
  setInterval(() => { if (!document.hidden) updateDuration(); }, 1000);
  $('roundTimingForm').addEventListener('submit', event => {
    event.preventDefault(); if (!current) return;
    const first = core.time($('roundFirst').value), interval = Number($('roundInterval').value);
    if (first === null || interval < 30 || interval > 600 || !Number.isFinite(interval)) { message('Use a valid first timestamp and spacing from 30 to 600 seconds.'); return; }
    current.roundTiming.first = first; current.roundTiming.interval = interval; save(); message('Round estimates updated.');
  });
  const deleteSaved = review => {
    if (!confirm('Delete this saved review and all its tags?')) return;
    try { localStorage.removeItem(prefix + review.key); damaged.delete(review.key); } catch { warning('Removed from this visit only. Browser storage could not delete the saved copy.'); }
    reviews.delete(review.key);
    if (current?.key === review.key) { token++; cleanPlayer(); current = null; try { sessionStorage.removeItem('kixot_vod_active_v1'); } catch {} }
    render(); message('Review deleted.');
  };
  const download = (data, extension, source) => {
    let url;
    try {
      url = URL.createObjectURL(new Blob([data], { type: extension === 'json' ? 'application/json' : 'text/plain' }));
      const link = element('a'); link.href = url; link.download = 'kixot-review.' + extension; document.body.appendChild(link); link.click(); link.remove();
      message('Export ready.'); window.KixotAnalytics?.track('review_exported', source ? { video_source: source } : {});
    } catch { message('Export failed. Try sharing as text.'); }
    if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $('youtubeForm').addEventListener('submit', event => {
    event.preventDefault(); const id = core.parseYouTube($('youtubeUrl').value);
    if (!id) { message('Enter a YouTube watch, youtu.be, shorts or embed link with a valid video ID.'); return; }
    select({ type: 'youtube', videoId: id });
  });
  $('localFile').addEventListener('change', () => {
    const file = $('localFile').files?.[0]; if (!file) return;
    if (!file.type.startsWith('video/') && !/\.(mp4|webm|ogv|mov|m4v)$/i.test(file.name)) { message('Choose a video file.'); $('localFile').value = ''; return; }
    select({ type: 'file', name: file.name, size: file.size, lastModified: file.lastModified }, file); $('localFile').value = '';
  });
  $('markRound').addEventListener('click', () => {
    const value = adapter.currentTime(); if (value === null) { message('Load a playable video first.'); return; }
    if (current.rounds.length >= 1000) { message('Round limit reached. Export this review first.'); return; }
    current.rounds.push({ id: uid(), time: value, label: 'Point ' + current.nextRound++ }); save(); message('Point marked.'); analytics('round_marked');
  });
  $('tagMistake').addEventListener('click', () => {
    const value = adapter.currentTime(); if (value === null) return;
    $('mistakeTime').value = Number(value.toFixed(3)); $('mistakeForm').hidden = false; $('mistakeNote').value = ''; $('mistakeType').focus();
  });
  $('cancelMistake').addEventListener('click', () => { $('mistakeForm').hidden = true; });
  $('mistakeForm').addEventListener('submit', event => {
    event.preventDefault(); if (!current || !loaded) return;
    const value = core.time($('mistakeTime').value), type = $('mistakeType').value;
    if (value === null) { message('Use seconds or mm:ss, up to 24 hours.'); return; }
    if (current.mistakes.length >= 5000) { message('Tag limit reached. Export this review first.'); return; }
    current.mistakes.push({ id: uid(), time: value, type, note: $('mistakeNote').value }); $('mistakeForm').hidden = true;
    save(); message('Mistake tagged.'); analytics('mistake_tag_added', { mistake_type: type.toLowerCase().replaceAll(' ', '_') });
  });
  $('exportReviewText').addEventListener('click', () => { if (current) download(core.reviewText(current), 'txt', current.source.type); });
  $('exportReviewJson').addEventListener('click', () => { if (current) download(JSON.stringify({ version: 1, reviews: [current] }, null, 2), 'json', current.source.type); });
  $('exportAllReviews').addEventListener('click', () => download(JSON.stringify({ version: 1, reviews: [...reviews.values()] }, null, 2), 'json'));
  $('deleteReview').addEventListener('click', () => { if (current) deleteSaved(current); });
  $('shareReview').addEventListener('click', async () => {
    if (!current) return;
    const text = core.reviewText(current), source = current.source.type;
    try { await navigator.clipboard.writeText(text); message('Review copied.'); window.KixotAnalytics?.track('review_exported', { video_source: source }); }
    catch { $('manualShare').hidden = false; $('shareText').value = text; $('shareText').focus(); $('shareText').select(); message('Select and copy the review text below.'); }
  });
  $('shareText').addEventListener('copy', () => { if (current) analytics('review_exported'); });
  $('closeShare').addEventListener('click', () => { $('manualShare').hidden = true; });
  $('importReviewsButton').addEventListener('click', () => $('importReviews').click());
  $('importReviews').addEventListener('change', async () => {
    const file = $('importReviews').files?.[0]; if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Choose an export smaller than 2 MB.');
      const incoming = core.validateImport(JSON.parse(await file.text()));
      if (new Set([...reviews.keys(), ...incoming.map(review => review.key)]).size > 200) throw new Error('Saved review limit reached.');
      const merged = incoming.map(review => {
        const existing = reviews.get(review.key); if (!existing) return review;
        const combine = (a, b) => [...a, ...b.filter(item => !a.some(old => old.id === item.id))];
        return core.validateReview({ ...review, rounds: combine(existing.rounds, review.rounds), mistakes: combine(existing.mistakes, review.mistakes), nextRound: Math.max(existing.nextRound, review.nextRound) });
      });
      merged.forEach(review => persist(review));
      if (current && reviews.has(current.key)) current = reviews.get(current.key);
      render(); message('Reviews imported. Existing entries were kept.');
    } catch (error) { message(error instanceof SyntaxError ? 'This file is not valid JSON.' : error.message); }
    $('importReviews').value = '';
  });
  core.TYPES.forEach(type => $('mistakeType').appendChild(new Option(type, type)));
  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); loadApi().catch(() => {}); }
  }, { rootMargin: '250px' });
  observer.observe($('vodSources'));
  document.addEventListener('visibilitychange', () => { if (document.hidden) adapter.pause(); });
  window.addEventListener('pagehide', () => { adapter.pause(); if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; } });
  window.addEventListener('pageshow', event => { if (event.persisted && current?.source.type === 'file') select(current.source); });
  render();
  try { const saved = sessionStorage.getItem('kixot_vod_active_v1'); if (saved && reviews.has(saved)) select(reviews.get(saved).source); } catch {}
})();
