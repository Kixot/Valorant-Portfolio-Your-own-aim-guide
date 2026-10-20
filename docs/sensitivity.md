# Sensitivity input validation, 2026-10-20

The reported setting was 1600 DPI and 0.145 Valorant sensitivity. The base yaw remains 0.07 degrees per raw count per sensitivity point. DPI is already reflected in physical mouse counts and is not applied as a second multiplier. No arbitrary speed increase, distance converter or new sensitivity description was added.

The old movement handler clipped each axis to 5000 counts per event. An actual browser regression test reproduced a 7000-count event turning only 50.75 degrees at 0.145, rather than 71.05 degrees. The new handler applies the complete finite delta. A batched event and an equivalent split sequence produce the same horizontal turn. Invalid deltas are ignored; the existing vertical aim limit remains.

The window resize listener previously updated only the crosshair. It now resizes the renderer and recalculates the camera. A ResizeObserver also catches range-element changes without a window resize. Horizontal field of view stays 103 degrees through resizing and fullscreen changes, without multiplying input by viewport size, render resolution or frame time.

Raw pointer lock is requested first. A successful modern request that consumes the raw option is recorded separately from a legacy request that silently ignores it. Unsupported raw movement falls back to ordinary pointer lock with a warning. Sensitivity edits preserve that warning. Browser-specific movement units can still differ when raw input is unavailable.

Validation includes 38 dependency-free tests and tests/sensitivity-browser.cjs. Browser input tests use the real mousemove handler with synthetic deltas, the actual numeric controls at 1600 / 0.145, all three modes at DPR 1, an additional flick check at DPR 2, normal windows, fullscreen, window resizing, element-only resizing, unsupported raw input and legacy option handling. These checks passed in installed Chrome and Edge. The old handler fails the batched-input check; the corrected handler passes. A full 30-second drill, live DPI/sensitivity edits, Escape pause/resume, mode locking, progress visibility and fullscreen cursor regression also passed. Provider analysis is not requested and browser analytics are isolated.

These checks establish deterministic turn calculations and projection updates. They do not measure the tester's physical mouse travel and do not establish that the reported mild slowness was caused by clipping or resizing. Matching feel on every browser and mouse cannot be certified from synthetic input. A physical comparison on the tester's setup remains unverified.

References: [Pointer Lock raw input](https://w3c.github.io/pointerlock/), [browser differences in movement units](https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/movementX).
