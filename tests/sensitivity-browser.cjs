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
          const expected = require('../js/sensitivity.js').projection(view.width, view.height);
          near(view.horizontalFov, expected.horizontalFov, 'windowed projection');
          near(await focalLength(), expected.focalLength, 'screen-space aim scale');
        };
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(base + '/dojo');
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
          return { sens: range.sensV, scale: range.view.inputScale, mode: range.state.mode, small: turn([1]), normal: turn([1000]), batch: turn([7000]), split: turn([3500,3500]), reverse: turn([-7000]), input: range.inputMode };
        });
        assert.equal(turns.sens, 0.145); assert.equal(turns.mode, mode);
        near(turns.small, 0.01015 * turns.scale, 'small adjustment'); near(turns.normal, 10.15 * turns.scale, 'regular movement');
        near(turns.batch, 71.05 * turns.scale, 'batched movement'); near(turns.split, turns.batch, 'event batching'); near(turns.reverse, -71.05 * turns.scale, 'reverse movement');
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
        const turnAtCurrentView = (movementX = 1000, movementY = 0) => page.evaluate(({ movementX, movementY }) => {
          const before = window.__range.cameraYaw;
          document.querySelector('#range3d').dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX, movementY }));
          return -(window.__range.cameraYaw - before) * 180 / Math.PI;
        }, { movementX, movementY });
        await page.locator('#ovBtn').click();
        await page.waitForFunction(() => window.__range.state.locked);
        const fullscreenTurn = await turnAtCurrentView();
        near(fullscreenTurn, 10.15, 'fullscreen raw sensitivity');
        const fullscreenFocal = await focalLength();
        near(await page.evaluate(() => window.__range.view.inputScale), 1, 'fullscreen input stays unchanged');
        await page.evaluate(() => document.exitPointerLock());
        await page.evaluate(() => document.exitFullscreen());
        await page.waitForFunction(() => !document.fullscreenElement);
        await page.setViewportSize({ width: 1000, height: 900 });
        await page.waitForFunction(() => { const c = document.querySelector('#range3d'); return Math.abs(window.__range.view.aspect - c.clientWidth / c.clientHeight) < 1e-7; });
        await checkView();
        near(await page.evaluate(() => window.__range.view.horizontalFov), 103, 'windowed view must stay unzoomed after fullscreen');
        await page.locator('#ovBtn').click();
        await page.waitForFunction(() => window.__range.state.locked);
        const scale = await page.evaluate(() => window.__range.view.inputScale);
        near(await turnAtCurrentView(), fullscreenTurn * scale, 'window compensation');
        near(await focalLength() * scale, fullscreenFocal, 'same screen-space aim speed after leaving fullscreen');
        const verticalTurn = await page.evaluate(() => {
          const before = window.__range.cameraPitch;
          document.querySelector('#range3d').dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 0, movementY: 20 }));
          return -(window.__range.cameraPitch - before) * 180 / Math.PI;
        });
        near(verticalTurn, 20 * 0.145 * 0.07 * scale, 'vertical aim uses the same compensation');
        if (deviceScaleFactor === 1 && mode === 'flick') {
          const fs = require('node:fs'), { artifacts } = require('./browser-fixtures.cjs');
          fs.mkdirSync(artifacts, { recursive: true });
          await page.locator('#range3d').evaluate(canvas => { canvas.style.height = ''; });
          await page.evaluate(() => window.__range.aimAt(0, 1.6, -14));
          await page.waitForFunction(() => !window.__range.state.paused && !window.__range.state.counting);
          await page.locator('.range-wrap').scrollIntoViewIfNeeded();
          await page.evaluate(() => document.fonts.ready);
          await page.screenshot({ path: artifacts + '/dojo-windowed-unzoomed.png' });
        }
        await page.close();
      }
      assert.deepEqual(errors, []); await context.close();
    }
    const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await require('./browser-fixtures.cjs').withoutGoogleAnalytics(touch);
    const mobilePage = await touch.newPage();
    await mobilePage.goto(base + '/dojo?quick=1');
    await mobilePage.waitForFunction(() => !!window.__range.view);
    near(await mobilePage.evaluate(() => window.__range.view.inputScale), 1, 'touch input stays unchanged');
    near(await mobilePage.evaluate(() => window.__range.view.horizontalFov), 103, 'touch field of view');
    await touch.close();
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
      const page = await context.newPage(); await page.goto(base + '/dojo?quick=1');
      await page.waitForFunction(() => !!window.__range.view); await page.locator('#ovBtn').click();
      await page.waitForFunction(() => window.__range.state.locked && ['unknown','adjusted'].includes(window.__range.inputMode));
      assert.equal(await page.evaluate(() => window.__range.inputMode), legacy ? 'unknown' : 'adjusted');
      assert.match(await page.locator('#sensitivityStatus').innerText(), /Raw mouse input/);
      await page.evaluate(() => document.exitPointerLock());
      await page.locator('#rngSens').fill('0.145');
      assert.match(await page.locator('#sensitivityStatus').innerText(), /Raw mouse input/);
      await context.close();
    }
    console.log('Fullscreen input stays unchanged at 1600 DPI / 0.145. Windowed view keeps 103 degrees with compensated screen-space aim speed. All modes, resizing, DPR, raw-input fallback and legacy API checks passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
