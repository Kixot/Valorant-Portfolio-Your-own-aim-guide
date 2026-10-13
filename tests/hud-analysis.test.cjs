const { test } = require('node:test');
const assert = require('node:assert/strict');
const hud = require('../js/hud-analysis.js');
test('HUD OCR accepts only readable timer and score rows, with bounded values', () => {
  assert.deepEqual(hud.parse({ text: '7\n1:40\n8\n', confidence: 88 }), { left: 7, timer: 100, right: 8 });
  for (const text of ['7\n1:60\n8', '7\n140\n8', 'player\n1:40\n8', '50\n1:40\n8', '7\n1:40']) assert.equal(hud.parse({ text, confidence: 90 }), null);
  assert.equal(hud.parse({ text: '7\n1:40\n8', confidence: 20 }), null);
  assert.throws(() => hud.regions({ ...hud.defaults, timer: { x: .99, y: 0, width: .1, height: .1 } }));
});
test('HUD detection uses irregular observed transitions and refines boundaries', async () => {
  const rounds = await hud.detect({ duration: 180, read: async time => {
    const left = time >= 125.5 ? 1 : 0, right = time >= 160.25 ? 1 : 0;
    let timer = 30;
    if (time >= 23.5 && time < 125.5) timer = Math.max(0, 100 - Math.floor(time - 23.5));
    if (time >= 147.75 && time < 160.25) timer = 100 - Math.floor(time - 147.75);
    return { left, right, timer };
  } });
  assert.equal(rounds.length, 2);
  assert.ok(Math.abs(rounds[0].start - 23.5) <= .25); assert.ok(Math.abs(rounds[0].end - 125.5) <= .25);
  assert.ok(Math.abs(rounds[1].start - 147.75) <= .25); assert.ok(Math.abs(rounds[1].end - 160.25) <= .25);
  assert.deepEqual(rounds.map(item => item.round), [1, 2]); assert.ok(rounds.every(item => item.confidence === 'low' && !item.confirmed));
});
test('Unreadable HUDs, unfinished rounds and fleeting score changes never become intervals', async () => {
  assert.deepEqual(await hud.detect({ duration: 90, read: async () => null }), []);
  assert.deepEqual(await hud.detect({ duration: 50, read: async time => ({ left: 0, right: 0, timer: time < 20 ? 30 : 100 - Math.floor(time - 20) }) }), []);
  assert.deepEqual(await hud.detect({ duration: 50, read: async time => ({ left: time === 40 ? 1 : 0, right: 0, timer: time < 20 || time >= 40 ? 30 : 100 - Math.floor(time - 20) }) }), []);
  const controller = new AbortController(); controller.abort(); await assert.rejects(hud.detect({ duration: 50, read: async () => null, signal: controller.signal }), { name: 'AbortError' });
});
test('Fleeting score regressions do not invent a new map', async () => {
  const rounds = await hud.detect({ duration: 60, read: async time => ({
    left: time === 8 ? 0 : time >= 46 ? 4 : 3, right: 0,
    timer: time < 20 || time >= 46 ? 30 : Math.max(0, 100 - Math.floor(time - 20))
  }) });
  assert.equal(rounds.length, 1); assert.equal(rounds[0].map, 1); assert.equal(rounds[0].round, 4);
});
