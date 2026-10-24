const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { withoutGoogleAnalytics, artifacts } = require('./browser-fixtures.cjs');
const base = process.env.SITE_TEST_URL;
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await withoutGoogleAnalytics(context);
    await context.route('**/api/analyze-rounds', route => route.fulfill({ json: { configured: false } }));
    const page = await context.newPage(), errors = [], missing = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) missing.push(response.url()); });
    for (const [legacy, target] of [['/index.html', '/'], ['/dojo.html', '/dojo'], ['/vod.html', '/vod'], ['/training.html', '/dojo'], ['/training', '/dojo'], ['/pages/training.html', '/dojo'], ['/dojo/', '/dojo']]) {
      const response = await context.request.get(base + legacy + '?quick=1&test=routes', { maxRedirects: 0 });
      assert.equal(response.status(), 308, legacy);
      const destination = new URL(response.headers().location, base);
      assert.equal(destination.pathname, target);
      assert.equal(destination.searchParams.get('quick'), '1');
      assert.equal(destination.searchParams.get('test'), 'routes');
    }
    await page.goto(base + '/');
    await page.locator('.preview-actions a[href="/dojo"]').click();
    await page.waitForURL(base + '/dojo');
    assert.equal(await page.locator('#dojoLauncher').isVisible(), true);
    await page.locator('.dojo-home').click(); await page.waitForURL(base + '/');
    await page.locator('a[href="/dojo?quick=1"]').click(); await page.waitForURL(base + '/dojo?quick=1');
    await page.waitForFunction(() => !!window.__range.view);
    assert.equal(await page.locator('#dojoLauncher').isVisible(), false);
    await page.locator('.dojo-home').click(); await page.waitForURL(base + '/');
    await page.locator('.preview-actions a[href="/vod"]').click(); await page.waitForURL(base + '/vod');
    assert.equal(await page.locator('#youtubeUrl').isVisible(), true);
    await page.locator('.dock-trigger').click();
    await page.locator('#siteMenu a[href="/dojo"]').click(); await page.waitForURL(base + '/dojo');
    for (const width of [360, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      for (const pathname of ['/dojo', '/vod']) {
        await page.goto(base + pathname);
        assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://www.kixotgg.com' + pathname);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), pathname + ' overflows at ' + width);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + '/dojo');
    fs.mkdirSync(artifacts, { recursive: true });
    await page.screenshot({ path: artifacts + '/dojo-clean-url-390.png' });
    assert.deepEqual(errors, []); assert.deepEqual(missing, []);
    console.log('Clean URLs, legacy redirects with queries, homepage navigation, Quick 30, folder navigation and 360/390/768px layouts passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
