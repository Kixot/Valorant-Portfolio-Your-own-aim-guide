const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.SITE_TEST_URL;
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-7, `${label}: ${actual} != ${expected}`);
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  try {
    for (const deviceScaleFactor of [1, 2]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, screen: { width: 1920, height: 1080 }, deviceScaleFactor });
      await require('./browser-fixtures.cjs').withoutGoogleAnalytics(context);
      const errors = [];
      for (const mode of deviceScaleFactor === 1 ? ['flick', 'precision', 'track'] : ['flick']) {
        const page = await context.newPage();
        const focalLength = () => page.evaluate(() => {
          const view = window.__range.view, canvas = document.querySelector('#range3d');
          return canvas.clientWidth / (2 * Math.tan(view.horizontalFov * Math.PI / 360));
        });
        const checkView = async () => {
          const view = await page.evaluate(() => { const c = document.querySelector('#range3d'); return { ...window.__range.view, width: c.clientWidth, height: c.clientHeight }; });
          const expected = require('../js/sensitivity.js').projection(view.width, view.height, view.referenceWidth);
          near(view.horizontalFov, expected.horizontalFov, 'windowed projection');
          near(await focalLength(), expected.focalLength, 'screen-space aim scale');
        };
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(base + '/dojo.html');
        await page.locator(`[data-launch-mode="${mode}"]`).click();
        await page.locator('#btnQuick').click();
        await page.locator('#rngDpi').fill('1600'); await page.locator('#rngSens').fill('0.145');
        await page.waitForFunction(() => !!window.__range.view);
        await page.locator('#ovBtn').click();
        await page.waitForFunction(() => window.__range.state.locked);
        const turns = await page.evaluate(() => {
          const range = window.__range, canvas = document.querySelector('#range3d');
          const turn = counts => {
            const before = range.cameraYaw;
            for (const movementX of counts) canvas.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX, movementY: 0 }));
            return -(range.cameraYaw - before) * 180 / Math.PI;
          };
          return { sens: range.sensV, mode: range.state.mode, small: turn([1]), normal: turn([1000]), batch: turn([7000]), split: turn([3500,3500]), reverse: turn([-7000]), input: range.inputMode };
        });
        assert.equal(turns.sens, 0.145); assert.equal(turns.mode, mode);
        near(turns.small, 0.01015, 'small adjustment'); near(turns.normal, 10.15, 'regular movement');
        near(turns.batch, 71.05, 'batched movement'); near(turns.split, turns.batch, 'event batching'); near(turns.reverse, -71.05, 'reverse movement');
        assert.ok(['raw','adjusted','unknown'].includes(turns.input));
        await page.evaluate(() => document.exitPointerLock());
        for (const width of [1000, 720, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.waitForFunction(() => { const c = document.querySelector('#range3d'); return Math.abs(window.__range.view.aspect - c.clientWidth / c.clientHeight) < 1e-7; });
          await checkView();
        }
        // Element-only changes also need a projection update, without a window resize.
        await page.locator('#range3d').evaluate(canvas => { canvas.style.height = '300px'; });
        await page.waitForFunction(() => { const c = document.querySelector('#range3d'); return Math.abs(window.__range.view.aspect - c.clientWidth / c.clientHeight) < 1e-7; });
        await checkView();
        await page.locator('#ovFs').click(); await page.waitForFunction(() => !!document.fullscreenElement);
        await page.waitForFunction(() => { const c = document.querySelector('#range3d'); return Math.abs(window.__range.view.aspect - c.clientWidth / c.clientHeight) < 1e-7; });
        near(await page.evaluate(() => window.__range.view.horizontalFov), 103, 'fullscreen field of view');
        const fullscreenFocal = await focalLength();
        await page.evaluate(() => document.exitFullscreen());
        await page.waitForFunction(() => !document.fullscreenElement);
        await page.setViewportSize({ width: 1000, height: 900 });
        await page.waitForFunction(() => { const c = document.querySelector('#range3d'); return Math.abs(window.__range.view.aspect - c.clientWidth / c.clientHeight) < 1e-7; });
        near(await focalLength(), fullscreenFocal, 'fullscreen-to-windowed visual sensitivity');
        assert.ok(await page.evaluate(() => window.__range.view.horizontalFov < 103), 'windowed view must crop instead of shrinking the fullscreen view');
        await page.close();
      }
      assert.deepEqual(errors, []); await context.close();
    }
    for (const legacy of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await require('./browser-fixtures.cjs').withoutGoogleAnalytics(context);
      await context.addInitScript(legacy => {
        const nativeLock = Element.prototype.requestPointerLock;
        Element.prototype.requestPointerLock = function (options) {
          if (legacy) { nativeLock.call(this).catch(() => {}); return; }
          if (options?.unadjustedMovement) return Promise.reject(new DOMException('Unsupported raw input', 'NotSupportedError'));
          return nativeLock.call(this);
        };
      }, legacy);
      const page = await context.newPage(); await page.goto(base + '/dojo.html?quick=1');
      await page.waitForFunction(() => !!window.__range.view); await page.locator('#ovBtn').click();
      await page.waitForFunction(() => window.__range.state.locked && ['unknown','adjusted'].includes(window.__range.inputMode));
      assert.equal(await page.evaluate(() => window.__range.inputMode), legacy ? 'unknown' : 'adjusted');
      assert.match(await page.locator('#sensitivityStatus').innerText(), /Raw mouse input/);
      await page.evaluate(() => document.exitPointerLock());
      await page.locator('#rngSens').fill('0.145');
      assert.match(await page.locator('#sensitivityStatus').innerText(), /Raw mouse input/);
      await context.close();
    }
    console.log('1600 DPI / 0.145 preserves raw yaw in all modes. Windowed views match fullscreen focal length; fullscreen keeps 103-degree FOV. Resizing, DPR, raw-input fallback and legacy API checks passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
