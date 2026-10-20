const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.SITE_TEST_URL;
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-7, `${label}: ${actual} != ${expected}`);
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  try {
    for (const deviceScaleFactor of [1, 2]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor });
      await require('./browser-fixtures.cjs').withoutGoogleAnalytics(context);
      const errors = [];
      for (const mode of deviceScaleFactor === 1 ? ['flick', 'precision', 'track'] : ['flick']) {
        const page = await context.newPage();
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
          near(await page.evaluate(() => window.__range.view.horizontalFov), 103, 'horizontal field of view');
        }
        // Element-only changes also need a projection update, without a window resize.
        await page.locator('#range3d').evaluate(canvas => { canvas.style.height = '300px'; });
        await page.waitForFunction(() => { const c = document.querySelector('#range3d'); return Math.abs(window.__range.view.aspect - c.clientWidth / c.clientHeight) < 1e-7; });
        near(await page.evaluate(() => window.__range.view.horizontalFov), 103, 'element resize');
        await page.locator('#ovFs').click(); await page.waitForFunction(() => !!document.fullscreenElement);
        await page.waitForFunction(() => { const c = document.querySelector('#range3d'); return Math.abs(window.__range.view.aspect - c.clientWidth / c.clientHeight) < 1e-7; });
        near(await page.evaluate(() => window.__range.view.horizontalFov), 103, 'fullscreen field of view');
        await page.evaluate(() => document.exitFullscreen());
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
    console.log('1600 DPI / 0.145 uses exact unclipped turns in all modes, with additional DPR 2 checks. Resizing/fullscreen preserve 103-degree horizontal FOV. Unsupported and legacy raw input warn without losing the lock. Synthetic deltas do not verify physical mouse travel.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
