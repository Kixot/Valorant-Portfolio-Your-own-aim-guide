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
    }
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.KixotSensitivity = api;
})(globalThis);
