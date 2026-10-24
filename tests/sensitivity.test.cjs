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

test('all viewport sizes show the full 103 degrees without cropping or changing raw yaw', () => {
  const full = math.projection(1920, 1080);
  for (const [width, height] of [[960, 580], [720, 400], [1280, 720], [390, 340]]) {
    const view = math.projection(width, height);
    near(view.horizontalFov, 103);
    // Equal turns cross the same fraction of the viewport in both views.
    const angle = math.degrees(100, 0.145) * Math.PI / 180;
    near(Math.tan(angle) * view.focalLength / width, Math.tan(angle) * full.focalLength / 1920);
    near(2 * Math.atan(Math.tan(view.verticalFov * Math.PI / 360) * width / height) * 180 / Math.PI, 103);
  }
});

test('projection keeps native fullscreen/touch FOV and rejects invalid dimensions', () => {
  near(math.projection(390, 340).horizontalFov, 103);
  near(math.projection(1920, 1080).horizontalFov, 103);
  for (const value of [0, -1, NaN, Infinity]) {
    assert.throws(() => math.projection(value, 600), RangeError);
    assert.throws(() => math.projection(960, value), RangeError);
  }
});

test('window compensation preserves fullscreen screen-space aim speed without zoom', () => {
  const full = math.projection(1920, 1080);
  for (const [width, height] of [[960, 580], [720, 400], [1280, 720]]) {
    const view = math.projection(width, height), gain = math.windowScale(width, 1920);
    near(view.focalLength * gain, full.focalLength);
    near(view.horizontalFov, full.horizontalFov);
  }
  near(math.windowScale(1920, 1920), 1);
  near(math.windowScale(1920, 960), 1);
  for (const value of [0, -1, NaN, Infinity]) assert.throws(() => math.windowScale(value, 1920), RangeError);
});
