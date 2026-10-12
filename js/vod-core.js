(function (scope) {
  'use strict';
  const TYPES = Object.freeze(['Bad peek', 'No utility', 'Bad crosshair placement', 'Overextended', 'Wrong rotation', 'Lost trade', 'Mistimed reload', 'Other']);
  const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
  const parseYouTube = input => {
    if (typeof input !== 'string' || input.length > 2048) return null;
    try {
      const url = new URL(input.trim().replace(/^(?=(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/)/i, 'https://'));
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null;
      let id = null;
      if (['youtu.be', 'www.youtu.be'].includes(url.hostname)) id = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
      else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
        if (url.pathname === '/watch' && url.searchParams.getAll('v').length === 1) id = url.searchParams.get('v');
        else id = /^\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
      }
      return VIDEO_ID.test(id || '') ? id : null;
    } catch { return null; }
  };
  const time = input => {
    if (typeof input === 'number') return Number.isFinite(input) && input >= 0 && input <= 86400 ? input : null;
    if (typeof input !== 'string' || !/^(?:\d+:){0,2}\d+(?:\.\d{1,3})?$/.test(input.trim())) return null;
    const parts = input.trim().split(':').map(Number);
    if (parts.length > 1 && parts.slice(1).some(part => part >= 60)) return null;
    return time(parts.reduce((total, part) => total * 60 + part, 0));
  };
  const stamp = seconds => {
    const value = Math.max(0, Math.floor(seconds));
    return (value >= 3600 ? Math.floor(value / 3600) + ':' : '') + String(Math.floor(value / 60) % 60).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
  };
  const key = source => source.type === 'youtube' ? 'youtube:' + source.videoId : 'file:' + JSON.stringify([source.name, source.size, source.lastModified]);
  const text = (value, max) => typeof value === 'string' && value.length <= max;
  const integer = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max;
  const validateReview = value => {
    if (!value || value.version !== 1 || !value.source || !Array.isArray(value.rounds) || !Array.isArray(value.mistakes)) throw new Error('Invalid review.');
    let source;
    const input = value.source;
    if (input.type === 'youtube' && typeof input.videoId === 'string' && VIDEO_ID.test(input.videoId)) source = { type: 'youtube', videoId: input.videoId };
    else if (input.type === 'file' && text(input.name, 1024) && input.name.length && integer(input.size, 1e13) && integer(input.lastModified, 1e15)) source = { type: 'file', name: input.name, size: input.size, lastModified: input.lastModified };
    else throw new Error('Invalid video source.');
    if (value.key !== key(source) || !integer(value.nextRound, 1e6) || value.nextRound < 1 || !text(value.updated, 40) || !Number.isFinite(Date.parse(value.updated)) || value.rounds.length > 1000 || value.mistakes.length > 5000) throw new Error('Invalid review data.');
    const ids = new Set();
    const entry = item => {
      if (!item || !text(item.id, 80) || !/^[A-Za-z0-9_-]+$/.test(item.id) || ids.has(item.id) || time(item.time) === null || typeof item.time !== 'number') throw new Error('Invalid timestamp.');
      ids.add(item.id); return { id: item.id, time: item.time };
    };
    const rounds = value.rounds.map(item => { const safe = entry(item); if (!text(item.label, 60) || !item.label.trim()) throw new Error('Invalid round label.'); return { ...safe, label: item.label }; });
    const mistakes = value.mistakes.map(item => { const safe = entry(item); if (!TYPES.includes(item.type) || !text(item.note, 1000)) throw new Error('Invalid mistake.'); return { ...safe, type: item.type, note: item.note }; });
    const roundTiming = value.roundTiming || { first: 0, interval: 130, duration: 0 };
    if (time(roundTiming.first) === null || time(roundTiming.duration) === null || typeof roundTiming.first !== 'number' || typeof roundTiming.duration !== 'number' || !Number.isFinite(roundTiming.interval) || roundTiming.interval < 30 || roundTiming.interval > 600) throw new Error('Invalid round spacing.');
    return { version: 1, key: key(source), source, updated: value.updated, nextRound: value.nextRound, rounds, mistakes, roundTiming: { first: roundTiming.first, interval: roundTiming.interval, duration: roundTiming.duration } };
  };
  const validateImport = data => {
    if (!data || data.version !== 1 || !Array.isArray(data.reviews) || data.reviews.length > 200) throw new Error('Use a version 1 review export.');
    const reviews = data.reviews.map(validateReview);
    if (new Set(reviews.map(review => review.key)).size !== reviews.length) throw new Error('Duplicate video reviews.');
    return reviews;
  };
  const autoRounds = review => {
    const timing = review.roundTiming;
    if (!timing || timing.duration <= 0 || timing.first >= timing.duration) return [];
    return Array.from({ length: Math.min(1000, Math.ceil((timing.duration - timing.first) / timing.interval)) }, (_, index) => ({ time: timing.first + index * timing.interval, label: 'Round ' + (index + 1) }));
  };
  const reviewText = review => ['Kixot VOD review', review.source.type === 'youtube' ? 'YouTube: https://www.youtube.com/watch?v=' + review.source.videoId : 'Local file: ' + review.source.name,
    '', 'Estimated round starts (time based)', ...autoRounds(review).map(round => stamp(round.time) + ' ' + round.label),
    '', 'My points', ...review.rounds.map(round => stamp(round.time) + ' ' + round.label), '', 'User tagged mistakes',
    ...review.mistakes.map(mistake => stamp(mistake.time) + ' ' + mistake.type + (mistake.note ? ': ' + mistake.note : '')),
    '', 'User tagged counts', ...TYPES.map(type => type + ': ' + review.mistakes.filter(item => item.type === type).length)].join('\n');
  const api = Object.freeze({ TYPES, parseYouTube, time, stamp, key, validateReview, validateImport, autoRounds, reviewText });
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else scope.KixotVodCore = api;
})(globalThis);
