(() => {
  'use strict';
  const core = window.KixotVodCore;
  const $ = id => document.getElementById(id);
  const prefix = 'kixot_vod_v1:';
  const youtubeSupported = ['http:', 'https:'].includes(location.protocol);
  const previewHelp = 'YouTube needs a web address. Double-click Preview.cmd in the site folder, then use the page it opens.';
  const confirmAction = text => window.KixotCursor ? window.KixotCursor.withNativeCursor(() => window.confirm(text)) : window.confirm(text);
  $('localPreviewHelp').hidden = youtubeSupported;
  const reviews = new Map(), files = new Map(), damaged = new Set();
  let current = null, token = 0, objectUrl = null, youtube = null, loaded = false, apiPromise = null, playerTimer = null, localDuration = 0;
  let analysisTask = null;
  const analysisTried = new Set();
  const confirmLocalUpload = signal => new Promise(resolve => {
    if (signal.aborted) { resolve(false); return; }
    const panel = $('localAnalysisConfirm'); panel.hidden = false;
    const finish = accepted => {
      panel.hidden = true; $('confirmLocalAnalysis').removeEventListener('click', accept); $('cancelLocalAnalysis').removeEventListener('click', decline); signal.removeEventListener('abort', decline); document.removeEventListener('keydown', escape); resolve(accepted);
    };
    const accept = () => finish(true), decline = () => finish(false), escape = event => { if (event.key === 'Escape') { event.preventDefault(); decline(); } };
    $('confirmLocalAnalysis').addEventListener('click', accept); $('cancelLocalAnalysis').addEventListener('click', decline); signal.addEventListener('abort', decline, { once: true }); document.addEventListener('keydown', escape);
    $('confirmLocalAnalysis').focus({ preventScroll: true }); panel.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  });
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
  const newReview = source => ({ version: 1, key: core.key(source), source, updated: new Date().toISOString(), nextRound: 1, rounds: [], mistakes: [], detectedRounds: [] });
  const adapter = {
    duration() { try { return current?.source.type === 'file' ? (Number.isFinite(local.duration) ? local.duration : localDuration) : youtube?.getDuration?.(); } catch { return 0; } },
    currentTime() {
      if (!loaded || !current) return null;
      try { const value = current.source.type === 'file' ? local.currentTime : youtube.getCurrentTime(); return core.time(value); } catch { return null; }
    },
    seek(value) {
      if (!loaded || core.time(value) === null) { message('Load the matching video before seeking.'); return false; }
      try {
        const duration = adapter.duration();
        if (Number.isFinite(duration) && duration > 0 && value > duration) { message('That timestamp is outside this video.'); return false; }
        if (current.source.type === 'file') local.currentTime = value; else youtube.seekTo(value, true);
        message('Seek: ' + core.stamp(value)); return true;
      } catch { message('Could not seek. Try loading the video again.'); return false; }
    },
    pause() { try { local.pause(); youtube?.pauseVideo?.(); } catch {} }
  };
  document.addEventListener('keydown', event => {
    if (event.code !== 'Space' || !loaded || event.target.closest('button, a, input, textarea, select, summary, [contenteditable="true"]')) return;
    event.preventDefault();
    if (event.repeat) return;
    try {
      if (current.source.type === 'file') { if (local.paused) local.play()?.catch(() => message('Click the video to play.')); else local.pause(); }
      else if (youtube.getPlayerState() === 1) youtube.pauseVideo(); else youtube.playVideo();
    } catch { message('Click the video to play or pause.'); }
  });
  const loadApi = () => {
    if (!youtubeSupported) return Promise.reject(new Error(previewHelp));
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
    $('analyzeRounds').disabled = !loaded || !!analysisTask;
    $('analyzeRounds').textContent = current?.source.type === 'file' ? 'Analyze local video' : 'Analyze rounds';
    $('localAnalyzerOptions').hidden = current?.source.type !== 'file';
    $('localAnalyzer').disabled = !!analysisTask;
    $('hudOptions').hidden = $('localAnalyzer').value !== 'device';
    $('cancelRoundAnalysis').hidden = !analysisTask;
    $('activeVideo').textContent = current ? name(current) : 'Choose a video';
  };
  const success = expected => {
    if (expected !== token || loaded || !current) return;
    loaded = true; $('playerEmpty').hidden = true;
    clearTimeout(playerTimer);
    persist(current); render(); message('Video ready.'); analytics('video_loaded');
    if (current.source.type === 'youtube') startAnalysis(true);
  };
  const cleanPlayer = () => {
    stopAnalysis();
    clearTimeout(playerTimer);
    loaded = false; adapter.pause();
    localDuration = 0; local.onloadedmetadata = null; local.onloadeddata = null; local.onseeked = null; local.onerror = null;
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
    $('roundAnalysisStatus').textContent = '';
    try { sessionStorage.setItem('kixot_vod_active_v1', current.key); } catch {}
    persist(current); render();
    if (source.type === 'file') {
      window.KixotHudSettings.select(current.key);
      const selected = file || files.get(current.key);
      if (!selected) { message('Choose the matching local file to play. Saved tags are restored.'); return; }
      files.set(current.key, selected); local.hidden = false;
      const ready = () => {
        if (expected !== token) return;
        if (Number.isFinite(local.duration)) { localDuration = local.duration; success(expected); return; }
        // WebM screen recordings can omit duration metadata. Seek to the end once
        // without playing, then restore the initial frame and retain that duration.
        local.onloadeddata = null; local.onloadedmetadata = null;
        local.onseeked = () => {
          if (expected !== token) return;
          localDuration = Number.isFinite(local.duration) ? local.duration : local.currentTime;
          local.onseeked = () => { local.onseeked = null; success(expected); };
          local.currentTime = 0;
        };
        local.currentTime = 1e10;
      };
      local.onloadeddata = ready;
      local.onloadedmetadata = ready;
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
      const field = element('label', 'Point'); label = element('input'); label.value = item.label; label.required = true; label.maxLength = 60; field.appendChild(label); form.appendChild(field);
    } else {
      const field = element('label', 'Type'); type = element('select'); core.TYPES.forEach(value => type.appendChild(new Option(value, value))); type.value = item.type; field.appendChild(type);
      const noteLabel = element('label', 'Note'); note = element('textarea'); note.value = item.note; note.maxLength = 1000; noteLabel.appendChild(note); form.append(field, noteLabel);
    }
    const saveButton = element('button', 'Save', 'rbtn vod-mini'); saveButton.type = 'submit';
    form.append(saveButton, button('Cancel', render));
    form.addEventListener('submit', event => {
      event.preventDefault(); const value = core.time(timestamp.value);
      if (value === null) { message('Use seconds or mm:ss, up to 24 hours.'); return; }
      const duration = adapter.duration();
      if (loaded && Number.isFinite(duration) && duration > 0 && value > duration) { message('That timestamp is outside this video.'); return; }
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
      const seekLabel = core.stamp(item.time) + ' ' + (kind === 'round' ? item.label : item.type);
      const jumpToPoint = () => {
        if (adapter.seek(item.time)) document.querySelector('.vod-player-card').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      };
      const seek = button(seekLabel, jumpToPoint); seek.classList.add('vod-seek'); seek.title = 'Jump to ' + core.stamp(item.time); seek.setAttribute('aria-label', 'Jump to ' + seekLabel);
      const actions = element('div', undefined, 'vod-row-actions');
      actions.append(button('Jump', jumpToPoint), button('Edit', () => editRow(item, kind, row)), button('Delete', () => { const index = items.indexOf(item); if (index >= 0) items.splice(index, 1); save(); message('Deleted.'); }));
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
    renderDetectedRounds();
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
  const renderDetectedRounds = () => {
    const host = $('detectedRoundList'); host.replaceChildren();
    if (!current.detectedRounds.length) { host.appendChild(element('p', 'No detected rounds yet.', 'vod-empty')); return; }
    [...current.detectedRounds].sort((a, b) => a.start - b.start).forEach(item => {
      const row = element('li', undefined, 'vod-entry');
      row.appendChild(element('p', 'Map ' + item.map + ' / Round ' + item.round + ' / ' + (item.confirmed ? 'Confirmed' : item.confidence + ' confidence'), 'vod-round-label'));
      const actions = element('div', undefined, 'vod-actions');
      actions.append(button('Start ' + core.stamp(item.start), () => adapter.seek(item.start)), button('End ' + core.stamp(item.end), () => adapter.seek(item.end)), button('Edit', () => {
        const form = element('form', undefined, 'vod-edit');
        const startLabel = element('label', 'Start (seconds or mm:ss)'), endLabel = element('label', 'End (seconds or mm:ss)');
        const start = element('input'), end = element('input'); start.value = item.start; end.value = item.end; start.required = end.required = true;
        startLabel.appendChild(start); endLabel.appendChild(end);
        const submit = element('button', 'Save', 'rbtn vod-mini'); submit.type = 'submit';
        form.append(startLabel, endLabel, submit, button('Cancel', render));
        form.addEventListener('submit', event => {
          event.preventDefault(); const first = core.time(start.value), last = core.time(end.value), duration = adapter.duration();
          if (first === null || last === null || first >= last || (Number.isFinite(duration) && duration > 0 && last > duration)) { $('roundAnalysisStatus').textContent = 'Enter a start before the end, within this video.'; return; }
          item.start = first; item.end = last; item.confirmed = true; save();
        }); row.replaceChildren(form); start.focus();
      }), button('Delete', () => { current.detectedRounds.splice(current.detectedRounds.indexOf(item), 1); save(); }));
      if (!item.confirmed) actions.appendChild(button('Confirm', () => { item.confirmed = true; save(); }));
      row.append(actions, element('p', item.evidence, 'vod-note')); host.appendChild(row);
    });
  };
  const stopAnalysis = () => {
    analysisTask?.abort(); analysisTask = null;
  };
  const wait = (milliseconds, signal) => new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Stopped', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
    signal.addEventListener('abort', abort, { once: true });
  });
  const startAnalysis = async automatic => {
    if (!loaded || !current || analysisTask) return;
    if (automatic && current.source.type === 'file') return;
    const key = current.key, expected = token;
    if (automatic && (current.detectedRounds.length || analysisTried.has(key))) return;
    if (!automatic && current.detectedRounds.length && !confirmAction('Replace the detected round timestamps? Your custom points stay saved.')) return;
    analysisTried.add(key);
    const task = new AbortController(); analysisTask = task; syncControls();
    const jobKey = 'kixot_round_job_v1:' + key;
    const started = performance.now();
    let phase = 'Checking round analysis.';
    const updateElapsed = () => {
      if (analysisTask === task && !task.signal.aborted && expected === token && current?.key === key)
        $('roundAnalysisStatus').textContent = phase + ' ' + core.stamp(Math.floor((performance.now() - started) / 1000)) + ' elapsed.';
    };
    const setPhase = text => { phase = text; updateElapsed(); };
    const elapsedTimer = setInterval(updateElapsed, 1000);
    task.signal.addEventListener('abort', () => clearInterval(elapsedTimer), { once: true });
    try {
      updateElapsed();
      if (current.source.type === 'file' && $('localAnalyzer').value === 'device') {
        adapter.pause();
        const duration = adapter.duration();
        if (!Number.isFinite(duration) || duration <= 0) throw new Error('Wait for the recording duration, then analyze again.');
        setPhase('Loading the on-device HUD reader.');
        let scanStarted = null;
        const rounds = await window.KixotHudAnalysis.scan({ src: objectUrl, duration, boxes: window.KixotHudSettings.getBoxes(), signal: task.signal,
          progress: fraction => {
            if (scanStarted === null) scanStarted = performance.now();
            const elapsed = (performance.now() - scanStarted) / 1000;
            const estimate = fraction > 0 && fraction < 1 && elapsed >= 5 ? ' About ' + core.stamp(Math.ceil(elapsed * (1 - fraction) / fraction)) + ' remaining.' : '';
            setPhase('Scanning HUD: ' + Math.round(fraction * 100) + '%.' + estimate);
          } });
        if (expected !== token || current?.key !== key || task.signal.aborted) return;
        const validated = core.validateDetectedRounds(rounds);
        if (validated.length) { current.detectedRounds = validated; save(); }
        $('roundAnalysisStatus').textContent = validated.length ? 'HUD boundaries detected. Review them for replays and delayed score updates.' : 'No complete rounds could be read. Adjust HUD boxes around the timer and scores, then scan again. Existing markers were kept.';
        if (!validated.length) $('hudOptions').open = true;
        return;
      }
      const info = await window.KixotRoundAnalysis.info(task.signal);
      if (!info.configured) throw new Error('Round analysis is not available yet.');
      if (current.source.type === 'file' && info.localUploads !== true) throw new Error(info.localUploads === false ? 'Google uploads are unavailable on this host. Choose On this device to analyze this recording.' : 'This preview is out of date. Open Preview.cmd again for local video analysis.');
      const duration = adapter.duration();
      if (!Number.isFinite(duration) || duration <= 0) throw new Error('Wait for the video duration, then analyze again.');
      if (duration > info.maximumDuration) throw new Error('Round analysis supports videos up to two hours.');
      let job = null; try { job = sessionStorage.getItem(jobKey); } catch {}
      let fileToken = null;
      const uploadKey = 'kixot_round_file_v1:' + key;
      if (current.source.type === 'file' && !job) {
        try { fileToken = sessionStorage.getItem(uploadKey); } catch {}
        if (!fileToken) {
          const file = files.get(key);
          if (!file) throw new Error('Choose the matching recording before analyzing.');
          if (file.size > 2 * 1024 ** 3) throw new Error('Local analysis supports files smaller than 2 GB.');
          setPhase('Waiting for your upload choice.');
          if (!await confirmLocalUpload(task.signal)) { if (expected === token) $('roundAnalysisStatus').textContent = 'Upload canceled. The video stayed local.'; return; }
          setPhase('Uploading the selected video to Google.');
          fileToken = await window.KixotRoundAnalysis.upload(file, duration, task.signal);
          if (typeof fileToken !== 'string') throw new Error('The video upload did not return a valid reference.');
          try { sessionStorage.setItem(uploadKey, fileToken); } catch {}
        }
      }
      setPhase('Analyzing gameplay and round transitions.');
      let result = job ? await window.KixotRoundAnalysis.poll(job, task.signal) : fileToken ? await window.KixotRoundAnalysis.startFile(fileToken, task.signal) : await window.KixotRoundAnalysis.start(current.source.videoId, duration, task.signal);
      while (['processing', 'file_processing'].includes(result.status)) {
        if (expected !== token || current?.key !== key || task.signal.aborted) return;
        if (result.status === 'file_processing') {
          if (performance.now() - started > 1500000) throw new Error('Google is still preparing this file. Analyze local video checks it again.');
          setPhase('Google is preparing the uploaded video.');
          await wait(15000, task.signal);
          while (document.hidden) await wait(2000, task.signal);
          result = await window.KixotRoundAnalysis.startFile(fileToken, task.signal); continue;
        }
        if (typeof result.job !== 'string') throw new Error('Round analysis returned an invalid job.');
        job = result.job; try { sessionStorage.setItem(jobKey, job); } catch {}
        setPhase(result.message || 'Analyzing gameplay and round transitions.');
        if (performance.now() - started > 1500000) throw new Error('Analysis is taking longer than expected. Click Analyze rounds to check the saved job again.');
        await wait(Math.max(15, Math.min(60, Number(result.pollAfter) || 15)) * 1000, task.signal);
        while (document.hidden) await wait(2000, task.signal);
        result = await window.KixotRoundAnalysis.poll(job, task.signal);
      }
      if (expected !== token || current?.key !== key || task.signal.aborted) return;
      if (result.status !== 'completed') throw new Error('Round analysis could not finish.');
      const rounds = core.validateDetectedRounds(result.rounds);
      if (rounds.some(item => item.end > duration)) throw new Error('Analysis returned timestamps outside this video.');
      if (rounds.length) { current.detectedRounds = rounds; save(); } try { sessionStorage.removeItem(jobKey); } catch {}
      $('roundAnalysisStatus').textContent = rounds.length ? (result.message || 'Round timestamps detected. Check them before confirming.') : 'No complete live rounds detected. Existing markers were kept.';
    } catch (error) {
      if (expected === token && error.name !== 'AbortError') {
        $('roundAnalysisStatus').textContent = error.message;
        // Failed jobs cannot recover. Keep quota-limited or temporarily busy jobs.
        if ([400, 410, 422, 502].includes(error.status) || /expired|could not establish|cannot access|stopped this job|returned invalid|returned unreadable/.test(error.message)) try { sessionStorage.removeItem(jobKey); } catch {}
        if (/uploaded video expired/.test(error.message)) try { sessionStorage.removeItem('kixot_round_file_v1:' + key); } catch {}
      }
    } finally { clearInterval(elapsedTimer); if (analysisTask === task) { analysisTask = null; syncControls(); } }
  };
  $('analyzeRounds').addEventListener('click', () => startAnalysis(false));
  $('localAnalyzer').addEventListener('change', syncControls);
  $('cancelRoundAnalysis').addEventListener('click', () => { const device = current?.source.type === 'file' && $('localAnalyzer').value === 'device'; stopAnalysis(); syncControls(); $('roundAnalysisStatus').textContent = device ? 'HUD scan stopped. Existing markers were kept.' : 'Stopped waiting. Analyze rounds resumes the saved job if available.'; });
  const deleteSaved = review => {
    if (!confirmAction('Delete this saved review and all its tags?')) return;
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
    if (!youtubeSupported) { message(previewHelp); return; }
    select({ type: 'youtube', videoId: id });
  });
  $('localFile').addEventListener('change', () => {
    const file = $('localFile').files?.[0]; if (!file) return;
    if (!file.type.startsWith('video/') && !/\.(mp4|webm|ogv|mov|m4v)$/i.test(file.name)) { message('Choose a video file.'); $('localFile').value = ''; return; }
    select({ type: 'file', name: file.name, size: file.size, lastModified: file.lastModified }, file); $('localFile').value = '';
  });
  $('markRound').addEventListener('click', () => {
    const value = adapter.currentTime(); if (value === null) { message('Load a playable video first.'); return; }
    if (current.rounds.length >= 1000) { message('Point limit reached. Export this review first.'); return; }
    current.rounds.push({ id: uid(), time: value, label: 'Point ' + current.nextRound++ }); save(); message('Point marked. Use Jump to return to it.'); analytics('round_marked');
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
    const duration = adapter.duration();
    if (Number.isFinite(duration) && duration > 0 && value > duration) { message('That timestamp is outside this video.'); return; }
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
        const detectionIds = new Set(existing.detectedRounds.map(item => item.id));
        const additions = review.detectedRounds.filter(item => !existing.detectedRounds.some(old => old.map === item.map && old.round === item.round)).map(item => {
          const id = detectionIds.has(item.id) ? uid() : item.id; detectionIds.add(id); return { ...item, id };
        });
        return core.validateReview({ ...review, rounds: combine(existing.rounds, review.rounds), mistakes: combine(existing.mistakes, review.mistakes), detectedRounds: [...existing.detectedRounds, ...additions], nextRound: Math.max(existing.nextRound, review.nextRound) });
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
  if (youtubeSupported) observer.observe($('vodSources'));
  document.addEventListener('visibilitychange', () => { if (document.hidden) adapter.pause(); });
  window.addEventListener('pagehide', () => { stopAnalysis(); adapter.pause(); if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; } });
  window.addEventListener('pageshow', event => { if (event.persisted && current?.source.type === 'file') select(current.source); });
  render();
  try { const saved = sessionStorage.getItem('kixot_vod_active_v1'); if (saved && reviews.has(saved)) select(reviews.get(saved).source); } catch {}
})();
