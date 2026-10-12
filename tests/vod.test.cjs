const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/vod-core.js');
const id = 'M7lc1UVf-VE';
const review = () => ({ version: 1, key: 'youtube:' + id, source: { type: 'youtube', videoId: id }, updated: '2026-10-12T00:00:00.000Z', nextRound: 1, rounds: [], mistakes: [] });
test('YouTube parsing accepts the four formats and rejects hostile or ambiguous links', () => {
  for (const link of [`https://www.youtube.com/watch?v=${id}&t=30`, `https://youtu.be/${id}`, `https://youtube.com/shorts/${id}`, `https://m.youtube.com/embed/${id}/`, `youtube.com/watch?v=${id}`]) assert.equal(core.parseYouTube(link), id);
  for (const link of [`https://youtube.com.evil.example/watch?v=${id}`, `https://evil.example/?v=${id}`, `javascript:alert(1)`, `https://user@youtube.com/watch?v=${id}`, `https://youtube.com:8443/watch?v=${id}`, `https://youtube.com/watch?v=${id}&v=${id}`, `https://youtu.be/${id}/extra`, `https://youtube.com/watch?v=short`, id, null]) assert.equal(core.parseYouTube(link), null);
});
test('timestamps accept precise seconds and clock times with strict bounds', () => {
  assert.equal(core.time('01:02.125'), 62.125); assert.equal(core.time('1:02:03'), 3723);
  for (const value of [-1, NaN, Infinity, 86401, '1:60', '1:01:60', '3e2', 'abc', '1.1234', {}]) assert.equal(core.time(value), null);
  assert.equal(core.stamp(3723.9), '1:02:03');
});
test('imports are validated completely, with unique entries and bounded text', () => {
  const data = review(); data.rounds.push({ id: 'one', time: 5, label: 'Round 1' }); data.mistakes.push({ id: 'two', time: 8, type: 'Bad peek', note: '<img src=x onerror=alert(1)>' });
  assert.equal(core.validateImport({ version: 1, reviews: [data] })[0].mistakes[0].note, data.mistakes[0].note);
  assert.throws(() => core.validateImport({ version: 2, reviews: [data] }));
  assert.throws(() => core.validateImport({ version: 1, reviews: [data, data] }));
  assert.throws(() => core.validateReview({ ...data, key: 'youtube:wrong' }));
  assert.throws(() => core.validateReview({ ...data, mistakes: [{ ...data.mistakes[0], id: 'one' }] }));
  assert.throws(() => core.validateReview({ ...data, mistakes: [{ ...data.mistakes[0], note: 'x'.repeat(1001) }] }));
});
test('file identities differ by name, size and modification time', () => {
  const source = { type: 'file', name: 'game.webm', size: 100, lastModified: 1 };
  assert.notEqual(core.key(source), core.key({ ...source, size: 101 }));
  assert.notEqual(core.key(source), core.key({ ...source, lastModified: 2 }));
});
test('legacy interval metadata is ignored without losing custom points', () => {
  const original = review(); original.roundTiming = { first: 0, interval: 130, duration: 300 };
  const data = core.validateReview(original);
  assert.equal(data.rounds.length, 0);
  assert.equal('roundTiming' in data, false);
  assert.doesNotMatch(core.reviewText(data), /Estimated round starts/);
  original.rounds.push({ id: 'saved', time: 71.5, label: 'My point' });
  assert.equal(core.validateReview(original).rounds[0].time, 71.5);
});
