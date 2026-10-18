const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { withoutGoogleAnalytics, artifacts } = require('./browser-fixtures.cjs');
const base = process.env.SITE_TEST_URL;
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  const errors = [], missing = [];
  fs.mkdirSync(artifacts, { recursive: true });
  try {
    const context = await browser.newContext({ isMobile: true, hasTouch: true, deviceScaleFactor: 3, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await withoutGoogleAnalytics(context);
    await context.route('**/api/analyze-rounds', route => route.fulfill({ json: { configured: false } }));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) missing.push(response.url()); });
    const noOverlap = async () => {
      const bounds = await page.evaluate(() => {
        const rect = node => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
        const nav = rect(document.querySelector('#siteMenu')), main = rect(document.querySelector('main'));
        return { nav, main, width: innerWidth, scroll: document.documentElement.scrollWidth, controls: [...document.querySelectorAll('.dojo-home, .dojo-back:not([hidden]), .vod-home, .dock-trigger')].map(rect) };
      });
      assert.ok(bounds.nav.bottom <= bounds.main.top + 1, 'open menu covers page content');
      assert.ok(bounds.nav.left >= 0 && bounds.nav.right <= bounds.width, 'menu leaves the viewport');
      assert.ok(bounds.scroll <= bounds.width, 'page overflows');
      for (const item of bounds.controls) assert.ok(item.bottom <= bounds.nav.top, 'menu covers a header control');
      for (const link of await page.locator('.branch-link').all()) assert.ok((await link.boundingBox()).height >= 44, 'touch target is too small');
    };
    for (const width of [320, 360, 390, 414, 768, 844]) {
      await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
      for (const route of ['index.html', 'dojo.html', 'vod.html']) {
        await page.goto(base + '/' + route);
        if (route === 'vod.html') {
          const frame = await page.locator('.vod-player-frame').boundingBox();
          assert.ok(frame.x >= 0 && frame.x + frame.width <= width - 18, 'player is clipped on a narrow screen');
        }
        await page.locator('.dock-trigger').tap();
        await noOverlap();
        const training = page.getByRole('button', { name: 'Training', exact: true });
        await training.tap();
        assert.equal(await training.getAttribute('aria-expanded'), 'false');
        await training.tap(); await noOverlap();
        if (width === 390) { await page.waitForTimeout(150); await page.screenshot({ path: artifacts + '/' + route.replace('.html', '') + '-menu-390.png' }); }
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#siteMenu').isVisible(), false);
        assert.equal(await page.locator('.dock-trigger').evaluate(node => node === document.activeElement), true);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const control of ['#btnQuick', '#btnOpenPlan']) {
      await page.goto(base + '/dojo.html'); await page.locator(control).tap();
      await page.locator('.dock-trigger').tap(); await noOverlap();
      const home = await page.locator('.dojo-home').boundingBox(), back = await page.locator('#backToModes').boundingBox();
      assert.ok(home.y + home.height <= back.y);
      await page.locator('#backToModes').tap();
      assert.equal(await page.locator('#dojoLauncher').isVisible(), true);
      assert.equal(await page.locator('#siteMenu').isVisible(), false, 'outside action closes the menu');
    }
    await page.goto(base + '/index.html'); await page.locator('.dock-trigger').tap();
    await page.locator('#siteMenu a[href="#dojo"]').tap();
    assert.equal(await page.locator('#siteMenu').isVisible(), false);
    assert.ok(await page.locator('#dojo').evaluate(node => Math.abs(node.getBoundingClientRect().top) < 50), 'closing menu offsets anchor scroll');
    await page.goto(base + '/vod.html'); await page.locator('.dock-trigger').tap();
    await page.locator('#youtubeUrl').tap(); assert.equal(await page.locator('#siteMenu').isVisible(), false);
    await page.locator('#youtubeUrl').fill('https://youtu.be/M7lc1UVf-VE');
    assert.equal(await page.locator('#youtubeUrl').inputValue(), 'https://youtu.be/M7lc1UVf-VE');
    for (const file of ['favicon.ico', 'assets/favicon-96.png', 'assets/favicon-192.png', 'assets/apple-touch-icon.png', 'assets/img/og.png', 'robots.txt', 'sitemap.xml']) {
      const response = await page.request.get(base + '/' + file); assert.equal(response.status(), 200, file);
      assert.ok((await response.body()).length > 0, file);
    }
    await page.screenshot({ path: artifacts + '/vod-390.png' });
    await context.close();
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await withoutGoogleAnalytics(desktop);
    await desktop.goto(base + '/');
    assert.equal(await desktop.locator('.site-dock').evaluate(node => getComputedStyle(node).position), 'fixed');
    await desktop.locator('.dock-trigger').click(); assert.equal(await desktop.locator('#siteMenu').isVisible(), true);
    await desktop.screenshot({ path: artifacts + '/menu-desktop.png' });
    await desktop.setViewportSize({ width: 390, height: 844 });
    await desktop.waitForFunction(() => document.querySelector('.branch-lines').getAttribute('height') === '144');
    assert.ok(await desktop.evaluate(() => document.querySelector('#siteMenu').getBoundingClientRect().bottom <= document.querySelector('main').getBoundingClientRect().top));
    await desktop.setViewportSize({ width: 1440, height: 1000 });
    await desktop.waitForFunction(() => document.querySelector('.branch-lines').getAttribute('height') === '108');
    assert.deepEqual(errors, []); assert.deepEqual(missing, []);
    console.log('Touch menus stay above page content at 320/360/390/414/768px and landscape, including Quick 30 and survey. Anchor scrolling, keyboard close, VOD fields, desktop menu and search assets passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
