const test = require('node:test');
const assert = require('node:assert/strict');
const math = require('../js/sensitivity.js');
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('800 DPI and 0.4 sens give 320 eDPI and 40.82142857 cm/360', () => {
  near(math.edpi(800, 0.4), 320);
  near(math.cm360(800, 0.4), 40.82142857142857);
});
test('50 cm/360 at 800 DPI gives 0.32657142857 Valorant sens', () => {
  near(math.sensFromCm360(800, 50), 0.32657142857142857);
});
test('0.4 Valorant sens converts to 1.27272727273 CS2 sens', () => {
  near(math.convert(0.4, 'valorant', 'cs2'), 1.272727272727273);
  near(math.convert(1.272727272727273, 'cs2', 'valorant'), 0.4);
});
test('100 raw counts at 0.4 sens turn 2.8 degrees, including signed movement', () => {
  near(math.degrees(100, 0.4), 2.8);
  near(math.degrees(-100, 0.4), -2.8);
  near(math.degrees(0, 0.4), 0);
});
test('doubling DPI halves cm/360 without changing the yaw multiplier', () => {
  near(math.cm360(1600, 0.4), 20.410714285714285);
  near(math.degrees(100, 0.4), 2.8);
});
test('invalid inputs cannot produce infinite conversion values', () => {
  for (const value of [0, -1, NaN, Infinity, '800']) assert.throws(() => math.cm360(value, 0.4), RangeError);
  assert.throws(() => math.sensFromCm360(800, 0), RangeError);
  assert.throws(() => math.convert(0.4, 'unknown', 'cs2'), RangeError);
});
