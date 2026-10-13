// Real network check, separate from the deterministic reviewer tests.
const { chromium } = require('playwright');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], requests = [], results = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('youtube.com/embed/')) requests.push({ url: request.url(), referrer: request.headers().referer }); });
  try {
    // Test real playback without spending analysis quota on demonstration videos.
    await page.route('**/api/analyze-rounds', route => route.fulfill({ json: { configured: false } }));
    await page.goto((process.env.SITE_TEST_URL || 'http://127.0.0.1:4174') + '/vod.html');

    for (const id of ['M7lc1UVf-VE', 'dQw4w9WgXcQ', 'aqz-KE-bpKQ']) {
      await page.locator('#youtubeUrl').fill('https://www.youtube.com/watch?v=' + id); await page.locator('#youtubeForm button').click();
      await page.waitForFunction(() => /Video ready|code \d|could not load/.test(document.querySelector('#vodStatus').textContent), null, { timeout: 30000 }).catch(() => {});
      const result = { id, status: await page.locator('#vodStatus').innerText(), playback: false };
      if (result.status === 'Video ready.') {
        try {
          const frame = page.frameLocator('#youtubePlayer');
          await frame.getByRole('button', { name: /^Play(?: video)?(?: \(k\))?$/ }).first().click({ timeout: 5000 });
          await frame.locator('video').evaluate(video => new Promise(resolve => { const timer = setInterval(() => { if (video.currentTime > 0 && !video.paused) { clearInterval(timer); resolve(); } }, 100); setTimeout(() => { clearInterval(timer); resolve(); }, 12000); }));
          result.playback = await frame.locator('video').evaluate(video => video.currentTime > 0);
          await frame.locator('video').evaluate(video => video.pause());
        } catch (error) { result.detail = error.message.slice(0, 160); }
      }
      results.push(result); console.log(JSON.stringify(result));
    }
    fs.mkdirSync('docs/screenshots', { recursive: true });
    fs.writeFileSync('docs/youtube-results.json', JSON.stringify({ results, errors, requests }, null, 2));
    await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'docs/screenshots/vod-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: 'docs/screenshots/vod-390.png', fullPage: true });
    console.log(JSON.stringify({ errors, requests }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
