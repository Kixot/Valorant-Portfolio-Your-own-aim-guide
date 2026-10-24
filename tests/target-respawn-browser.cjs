const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { withoutGoogleAnalytics } = require('./browser-fixtures.cjs');
const base = process.env.SITE_TEST_URL;
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  try {
    const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 768, height: 1024 }, reducedMotion: 'reduce' });
    await withoutGoogleAnalytics(context);
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const mode of ['flick', 'precision']) {
      for (const difficulty of [0, 1, 2, 3]) {
        await page.goto(base + '/dojo');
        await page.locator(`[data-launch-mode="${mode}"]`).click();
        await page.locator('#btnQuick').click();
        await page.waitForFunction(() => !!window.__range.view);
        await page.evaluate(id => window.__range.setDiff(id), difficulty);
        await page.locator('#ovBtn').click();
        await page.waitForFunction(() => window.__range.state.playing && !window.__range.state.counting && !window.__range.state.paused);
        for (let repeat = 0; repeat < 3; repeat++) {
          const result = await page.evaluate(() => {
            const range = window.__range;
            const initialScore = range.score, target = range.targets[0];
            range.aimAt(target.x, target.y, target.z);
            range.shoot();
            const countBeforePause = range.targets.length;
            document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            return { countBeforePause, countAfterPause: range.targets.length, initialScore, score: range.score, paused: range.state.paused };
          });
          assert.ok(result.score > result.initialScore, `${mode}/${difficulty}: shot must actually hit`);
          assert.equal(result.countBeforePause, 3, `${mode}/${difficulty}: replacement must exist synchronously`);
          assert.equal(result.countAfterPause, 3);
          assert.equal(result.paused, true);
          // Stay paused past every former replacement delay (100-400 ms).
          await page.waitForTimeout(450);
          assert.equal(await page.evaluate(() => window.__range.targets.length), 3);
          await page.locator('#ovBtn').click();
          await page.waitForFunction(() => !window.__range.state.paused);
          assert.equal(await page.evaluate(() => window.__range.targets.length), 3);
        }
        const rapid = await page.evaluate(() => {
          const range = window.__range, scores = [], counts = [];
          // Include newly spawned targets before another animation frame renders.
          for (let shot = 0; shot < 10; shot++) {
            const target = range.targets.at(-1), before = range.score;
            range.aimAt(target.x, target.y, target.z); range.shoot();
            scores.push(range.score > before); counts.push(range.targets.length);
          }
          range.pause(); return { scores, counts };
        });
        assert.ok(rapid.scores.every(Boolean), `${mode}/${difficulty}: fresh targets must be immediately hittable`);
        assert.ok(rapid.counts.every(count => count === 3));
        await page.waitForTimeout(450);
        assert.equal(await page.evaluate(() => window.__range.targets.length), 3, 'no delayed replacements may add extra targets');
      }
    }
    assert.deepEqual(errors, []);
    console.log('Flick and precision keep 3 immediately hittable targets across instant Escape, repeated pause/resume and rapid hits at all 4 difficulties.');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
