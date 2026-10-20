(function (scope) {
  'use strict';
  const yaw = Object.freeze({ valorant: 0.07 });
  const positive = value => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new RangeError('Enter a positive number.');
    return value;
  };
  const api = Object.freeze({
    yaw,
    degrees: (counts, sens) => {
      if (!Number.isFinite(counts)) throw new RangeError('Invalid mouse count.');
      return counts * positive(sens) * yaw.valorant;
    },
    projection: (width, height, referenceWidth = width) => {
      positive(width); positive(height); positive(referenceWidth);
      const reference = Math.max(width, referenceWidth);
      const tangent = Math.tan(103 * Math.PI / 360);
      return {
        verticalFov: 2 * Math.atan(tangent * height / reference) * 180 / Math.PI,
        horizontalFov: 2 * Math.atan(tangent * width / reference) * 180 / Math.PI,
        focalLength: reference / (2 * tangent)
      };
    }
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.KixotSensitivity = api;
})(globalThis);
