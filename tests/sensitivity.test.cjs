const test = require('node:test');
const assert = require('node:assert/strict');
const math = require('../js/sensitivity.js');
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('100 raw counts at 0.4 sens turn 2.8 degrees, including signed movement', () => {
  near(math.degrees(100, 0.4), 2.8);
  near(math.degrees(-100, 0.4), -2.8);
  near(math.degrees(0, 0.4), 0);
});
test('full turns are independent of how counts are split across events', () => {
  const counts = 360 / (0.4 * 0.07);
  near(math.degrees(counts, 0.4), 360);
  near(math.degrees(400, 0.4) + math.degrees(counts - 400, 0.4), 360);
  near(math.degrees(counts, 0.2), 180);
});

test('0.145 sensitivity preserves small adjustments and batched turns', () => {
  near(math.degrees(1, 0.145), 0.01015);
  near(math.degrees(1000, 0.145), 10.15);
  near(math.degrees(7000, 0.145), 71.05);
  near(math.degrees(7000, 0.145), math.degrees(3500, 0.145) * 2);
});
test('invalid inputs cannot produce invalid camera rotations', () => {
  for (const value of [0, -1, NaN, Infinity, '0.4']) assert.throws(() => math.degrees(100, value), RangeError);
  for (const value of [NaN, Infinity, -Infinity, '100']) assert.throws(() => math.degrees(value, 0.4), RangeError);
});
