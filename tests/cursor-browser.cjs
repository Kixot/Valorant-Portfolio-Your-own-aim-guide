const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await require('./browser-fixtures.cjs').withoutGoogleAnalytics(context);
    await context.route('**/api/analyze-rounds', route => route.fulfill({ json: { configured: false } }));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const shown = () => page.waitForFunction(() => document.documentElement.classList.contains('cur-on') && document.querySelector('#cur').classList.contains('is-visible'));
    const hidden = async () => {
      // Let queued focus and animation callbacks run before checking stale state.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('cur-on') || document.querySelector('#cur').classList.contains('is-visible')), false);
    };
    for (const file of ['index.html', 'dojo.html', 'vod.html']) {
      await page.goto(process.env.SITE_TEST_URL + '/' + file);
      const target = page.locator('.hero__actions .rbtn, .dojo-home, .vod-home').first();
      await target.hover(); await shown();
      await target.click({ button: 'right' }); await hidden();
      await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
      await hidden();
      await page.keyboard.press('Escape');
      await page.mouse.move(350, 130); await shown();
      await page.evaluate(() => document.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
      await hidden();
      await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', buttons: 2, clientX: 350, clientY: 130 })));
      await hidden();
      await page.mouse.move(355, 135); await shown();
      await target.click({ button: 'right' }); await hidden();
      await page.keyboard.press('Escape');
      await page.mouse.click(360, 140); await shown();
    }
    assert.deepEqual(errors, []);
    console.log('Right-click and keyboard context menus hide the custom cursor on every page; queued callbacks cannot revive it. Movement and primary clicks restore it.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
