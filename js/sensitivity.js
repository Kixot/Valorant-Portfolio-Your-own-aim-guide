(function (scope) {
  'use strict';
  const yaw = Object.freeze({ valorant: 0.07, cs2: 0.022 });
  const positive = value => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new RangeError('Enter a positive number.');
    return value;
  };
  const api = Object.freeze({
    yaw,
    edpi: (dpi, sens) => positive(dpi) * positive(sens),
    cm360: (dpi, sens, game = 'valorant') => 2.54 * 360 / (positive(dpi) * positive(sens) * positive(yaw[game])),
    sensFromCm360: (dpi, cm, game = 'valorant') => 2.54 * 360 / (positive(dpi) * positive(cm) * positive(yaw[game])),
    convert: (sens, from, to) => positive(sens) * positive(yaw[from]) / positive(yaw[to]),
    degrees: (counts, sens) => {
      if (!Number.isFinite(counts)) throw new RangeError('Invalid mouse count.');
      return counts * positive(sens) * yaw.valorant;
    }
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.KixotSensitivity = api;
})(globalThis);
