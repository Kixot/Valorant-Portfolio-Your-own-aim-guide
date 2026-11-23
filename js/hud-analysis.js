/* Local HUD inspection. Video frames stay on this device. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KixotHudAnalysis = api;
})(typeof window === 'object' ? window : globalThis, () => {
  'use strict';
  const defaults = {
    left: { x: .435, y: .012, width: .026, height: .041 },
    timer: { x: .478, y: .012, width: .044, height: .041 },
    right: { x: .539, y: .012, width: .026, height: .041 }
  };
  const regions = value => {
    const result = {};
    for (const key of ['left', 'timer', 'right']) {
      const box = value?.[key];
      if (!box || !['x', 'y', 'width', 'height'].every(name => Number.isFinite(box[name])) || box.x < 0 || box.y < 0 || box.width < .005 || box.height < .005 || box.x + box.width > 1.001 || box.y + box.height > 1.001) throw new Error('Keep each HUD box inside the video.');
      result[key] = { ...box };
    }
    return result;
  };
  const parse = data => {
    if (!data || data.confidence < 45) return null;
    const lines = data.text.trim().split(/\n+/).map(line => line.trim());
    if (lines.length !== 3 || !/^\d{1,2}$/.test(lines[0]) || !/^\d{1,2}$/.test(lines[2])) return null;
    const clock = /^(\d):([0-5]\d)$/.exec(lines[1]);
    if (!clock) return null;
    const left = Number(lines[0]), right = Number(lines[2]), timer = Number(clock[1]) * 60 + Number(clock[2]);
    if (left > 40 || right > 40 || timer > 100) return null;
    return { left, right, timer };
  };
  const sameScore = (a, b) => a && b && a.left === b.left && a.right === b.right;
  const increment = (a, b) => a && b && ((b.left === a.left + 1 && b.right === a.right) || (b.right === a.right + 1 && b.left === a.left));
  const abort = signal => { if (signal?.aborted) throw new DOMException('Analysis stopped.', 'AbortError'); };
  // Require observed buy-to-live clock changes and persistent score increments.
  // Gaps and unfinished rounds are omitted, never filled using fixed intervals.
  async function detect({ duration, read, signal, progress = () => {}, step = 2 }) {
    if (!Number.isFinite(duration) || duration <= 0 || duration > 7200) throw new Error('Choose a recording no longer than two hours.');
    const rounds = []; let previous = null, buying = null, active = null, pending = null, resetting = null, map = 1;
    const refine = async (from, to, matches) => {
      while (to - from > .25) {
        abort(signal); const mid = (from + to) / 2, sample = await read(mid);
        if (!sample) return { time: to, uncertain: true };
        if (matches(sample)) to = mid; else from = mid;
      }
      return { time: +to.toFixed(3), uncertain: false };
    };
    for (let time = 0; time < duration; time += step) {
      abort(signal); const value = await read(time); abort(signal); progress(time / duration);
      if (!value) { if (previous && time - previous.time > 12) { buying = null; active = null; pending = null; } continue; }
      const sample = { ...value, time };
      if (resetting) {
        if (value.left === 0 && value.right === 0 && time - resetting.time <= step * 2) { map++; previous = null; active = null; pending = null; buying = null; }
        resetting = null;
      }
      if (previous && value.left + value.right < previous.left + previous.right) {
        // A single misread score or replay is not evidence of a new map.
        if (value.left === 0 && value.right === 0) resetting = sample;
        active = null; pending = null; buying = null; continue;
      }
      if (pending) {
        if (sameScore(pending.sample, sample) && active) {
          const boundary = await refine(pending.from, pending.sample.time, frame => increment(active.score, frame));
          if (boundary.time > active.start) rounds.push({ id: 'hud-' + rounds.length, map: active.map, round: active.score.left + active.score.right + 1, start: active.start, end: boundary.time, confidence: 'low', evidence: 'Observed buy-to-live timer reset and score increment. HUD samples are 2 seconds apart, refined to a 0.25-second window where readable. Review for replays or delayed score updates.', confirmed: false });
          active = null; pending = null;
        } else pending = null;
      }
      if (active && increment(active.score, value) && previous) pending = { from: previous.time, sample };
      else if (active && !sameScore(active.score, value)) active = null;
      if (value.timer <= 45 && !active) buying = sample;
      if (!active && buying && previous && sameScore(buying, sample) && time - previous.time <= step * 2 && previous.timer <= 45 && value.timer >= 97 && value.timer <= 100) {
        const boundary = await refine(previous.time, time, frame => sameScore(frame, sample) && frame.timer >= 97);
        active = { start: boundary.time, score: sample, map }; buying = null;
      }
      previous = sample;
    }
    progress(1); return rounds;
  }
  let scriptPromise;
  const bounded = (promise, signal, timeout, message) => new Promise((resolve, reject) => {
    const clean = () => { clearTimeout(timer); signal?.removeEventListener('abort', stopped); };
    const stopped = () => { clean(); reject(new DOMException('Analysis stopped.', 'AbortError')); };
    const timer = setTimeout(() => { clean(); reject(new Error(message)); }, timeout);
    if (signal?.aborted) { stopped(); return; }
    signal?.addEventListener('abort', stopped, { once: true });
    promise.then(value => { clean(); resolve(value); }, error => { clean(); reject(error); });
  });
  const load = () => {
    if (window.Tesseract) return Promise.resolve();
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script'), timer = setTimeout(fail, 30000);
      function fail() { clearTimeout(timer); script.remove(); scriptPromise = null; reject(new Error('The local text reader could not load. Check your connection and try again.')); }
      script.src = 'assets/vendor/tesseract/tesseract.min.js';
      script.onload = () => { clearTimeout(timer); resolve(); }; script.onerror = fail; document.head.appendChild(script);
    });
    return scriptPromise;
  };
  const createReader = async signal => {
    await bounded(load(), signal, 35000, 'The local text reader could not load.'); abort(signal);
    let worker, initializing;
    try {
      initializing = window.Tesseract.createWorker('eng', 1, { errorHandler: () => {},
        workerPath: new URL('assets/vendor/tesseract/', document.baseURI).href + 'worker.min.js',
        corePath: new URL('assets/vendor/tesseract/', document.baseURI).href + 'core',
        langPath: new URL('assets/vendor/tesseract/', document.baseURI).href + 'lang' });
      worker = await bounded(initializing, signal, 90000, 'The local text reader could not start.');
      abort(signal);
      await worker.setParameters({ tessedit_char_whitelist: '0123456789:', tessedit_pageseg_mode: '6' });
    } catch (error) { if (worker) await worker.terminate(); else initializing?.then(value => value.terminate()).catch(() => {}); if (error.name === 'AbortError') throw error; throw new Error('The local text reader could not start. Check your connection and try again.'); }
    return worker;
  };
  const crop = (video, boxes) => {
    const canvas = document.createElement('canvas'); canvas.width = 420; canvas.height = 240;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 420, 240);
    ['left', 'timer', 'right'].forEach((key, index) => {
      // Whole-pixel placement: a fractional edge blends with the white page and reads as a stray "1".
      const box = boxes[key], height = 52, width = Math.max(1, Math.round(Math.min(360, height * box.width * video.videoWidth / (box.height * video.videoHeight))));
      ctx.drawImage(video, box.x * video.videoWidth, box.y * video.videoHeight, box.width * video.videoWidth, box.height * video.videoHeight, Math.round((420 - width) / 2), 14 + index * 80, width, height);
      const pixels = ctx.getImageData(Math.round((420 - width) / 2), 14 + index * 80, width, height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const bright = Math.max(pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]);
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = bright >= 170 ? 0 : 255;
      }
      ctx.putImageData(pixels, Math.round((420 - width) / 2), 14 + index * 80);
    });
    return canvas;
  };
  const seek = (video, time, signal) => new Promise((resolve, reject) => {
    abort(signal);
    if (Math.abs(video.currentTime - time) < .001 && video.readyState >= 2) { resolve(); return; }
    const clean = () => { clearTimeout(timer); video.removeEventListener('seeked', done); video.removeEventListener('error', fail); signal?.removeEventListener('abort', stopped); };
    const done = () => { clean(); resolve(); }, fail = () => { clean(); reject(new Error('This recording could not be scanned. Try an MP4 recording.')); }, stopped = () => { clean(); reject(new DOMException('Analysis stopped.', 'AbortError')); };
    const timer = setTimeout(fail, 15000); video.addEventListener('seeked', done, { once: true }); video.addEventListener('error', fail, { once: true }); signal?.addEventListener('abort', stopped, { once: true });
    video.currentTime = time;
  });
  const loadVideo = (src, signal) => new Promise((resolve, reject) => {
    const video = document.createElement('video'); video.muted = true; video.preload = 'auto'; video.src = src;
    const clean = () => { clearTimeout(timer); video.onloadeddata = null; video.onerror = null; signal?.removeEventListener('abort', stopped); };
    const stopped = () => { clean(); reject(new DOMException('Analysis stopped.', 'AbortError')); };
    const timer = setTimeout(() => { clean(); reject(new Error('This recording could not load for scanning.')); }, 15000);
    video.onloadeddata = () => { clean(); resolve(video); }; video.onerror = () => { clean(); reject(new Error('This recording could not load for scanning.')); }; signal?.addEventListener('abort', stopped, { once: true });
  });
  // Several readers work at once, each with its own copy of the video and its own
  // text reader. The whole timeline is read ahead in parallel; the round logic then
  // walks through the finished readings, and its few follow-up reads jump the queue.
  async function scan({ src, duration, boxes, signal, progress = () => {}, readers }) {
    boxes = regions(boxes); abort(signal);
    const cores = (typeof navigator === 'object' && navigator.hardwareConcurrency) || 4;
    const count = Math.max(1, Math.min(4, readers || Math.floor(cores / 2) || 1));
    const videos = [], workers = [];
    const stopAll = () => { workers.forEach(worker => worker.terminate().catch(() => {})); };
    signal?.addEventListener('abort', stopAll, { once: true });
    try {
      videos.push(...await Promise.all(Array.from({ length: count }, () => loadVideo(src, signal))));
      // The first reader downloads the text model; the rest then start from the cache.
      workers.push(await createReader(signal));
      const extra = await Promise.allSettled(Array.from({ length: count - 1 }, () => createReader(signal)));
      extra.forEach(result => { if (result.status === 'fulfilled') workers.push(result.value); });
      abort(signal);
      const cache = new Map(), queue = [], idle = workers.map((worker, index) => ({ worker, video: videos[index] }));
      const pump = () => {
        while (idle.length && queue.length) {
          const reader = idle.pop(), task = queue.shift();
          (async () => {
            try {
              while (document.hidden) { abort(signal); await new Promise(resolve => setTimeout(resolve, 250)); }
              await seek(reader.video, task.time, signal); abort(signal);
              let result; try { result = await bounded(reader.worker.recognize(crop(reader.video, boxes)), signal, 20000, 'The local text reader stopped.'); } catch { abort(signal); throw new Error('The local text reader stopped. Try again.'); }
              task.resolve(parse(result.data));
            } catch (error) { task.reject(error); }
            finally { idle.push(reader); pump(); }
          })();
        }
      };
      const read = (time, urgent) => {
        const key = time.toFixed(3);
        if (!cache.has(key)) {
          const promise = new Promise((resolve, reject) => { const task = { time, resolve, reject }; if (urgent) queue.unshift(task); else queue.push(task); });
          promise.catch(() => {}); cache.set(key, promise); pump();
        }
        return cache.get(key);
      };
      const step = 2, grid = [];
      for (let time = 0; time < duration; time += step) grid.push(time);
      let done = 0;
      grid.forEach(time => read(time).then(() => { done++; progress(Math.min(.99, done / grid.length)); }, () => {}));
      const rounds = await detect({ duration, signal, step, progress: () => {}, read: time => read(time, true) });
      progress(1); return rounds;
    } finally {
      signal?.removeEventListener('abort', stopAll);
      await Promise.all(workers.map(worker => worker.terminate().catch(() => {})));
      videos.forEach(video => { video.removeAttribute('src'); video.load(); });
    }
  }
  return Object.freeze({ defaults, regions, parse, detect, crop, createReader, scan });
});
