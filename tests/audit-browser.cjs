const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  const base = process.env.SITE_TEST_URL;
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [], missing = [], failed = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) missing.push(response.url()); });
    page.on('requestfailed', request => { if (!request.url().includes('/api/')) failed.push({ url: request.url(), error: request.failure().errorText }); });
    await page.route('**/api/analyze-rounds', route => route.fulfill({ json: { configured: false } }));
    await page.goto(base + '/'); await page.waitForFunction(() => document.querySelectorAll('.agent-card').length === 6);
    await page.locator('.hero__actions a[href="#dojo"]').click();
    assert.ok(await page.locator('#dojo').evaluate(node => Math.abs(node.getBoundingClientRect().top) < 180));
    await page.locator('#dojo a[href="dojo.html?quick=1"]').click(); await page.waitForURL('**/dojo.html?quick=1');
    assert.equal(await page.locator('#stepSettings').isVisible(), true);
    await page.locator('#backToModes').click(); await page.locator('[data-launch-mode="track"]').click();
    await page.locator('#btnOpenPlan').click();
    assert.equal(await page.locator('#qGoal [data-v="tracking"]').evaluate(node => node.classList.contains('is-on')), true);
    await page.locator('#backToModes').click();
    await page.locator('.dojo-home').click(); await page.waitForURL('**/index.html');
    await page.locator('.hero__actions a[href="#vod"]').click();
    assert.ok(await page.locator('#vod').evaluate(node => Math.abs(node.getBoundingClientRect().top) < 180));
    await page.locator('#vod a[href="vod.html"]').click(); await page.waitForURL('**/vod.html');
    await page.locator('.dock-trigger').focus(); await page.keyboard.press('Enter'); assert.equal(await page.locator('#siteMenu').isVisible(), true);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#siteMenu').isVisible(), false);
    assert.equal(await page.locator('.dock-trigger').evaluate(node => document.activeElement === node), true);
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      for (const route of ['index.html', 'dojo.html', 'vod.html']) {
        await page.goto(base + '/' + route);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, route + ' at ' + width);
        const home = page.locator('.dojo-home, .vod-home');
        if (await home.count()) {
          const a = await page.locator('.dock-trigger').boundingBox(), b = await home.boundingBox();
          assert.ok(a.x + a.width <= b.x || a.y + a.height <= b.y || b.y + b.height <= a.y, 'header controls overlap at ' + width);
        }
      }
    }
    fs.mkdirSync('docs/screenshots', { recursive: true });
    await page.goto(base + '/index.html'); await page.screenshot({ path: 'docs/screenshots/audit-home-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: 'docs/screenshots/audit-home-390.png' });
    assert.deepEqual(errors, []); assert.deepEqual(missing, []);
    fs.writeFileSync('docs/site-audit.json', JSON.stringify({ checked: ['Home and footer navigation', 'Quick launch', 'Plan mode selection', 'Keyboard menu', 'Header overlap', 'Local asset responses', 'Mobile overflow'], errors, missingLocalAssets: missing, failedRequests: failed }, null, 2));
    console.log('Homepage navigation, quick launch, preselected plan, keyboard menu, header spacing and all page layouts passed with no script errors or missing local assets.');
    if (failed.length) console.log(JSON.stringify({ failedRequests: failed }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
