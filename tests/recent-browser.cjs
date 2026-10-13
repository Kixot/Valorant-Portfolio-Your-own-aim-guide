const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(), errors = [], sent = []; let uploads = 0;
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/api/analyze-rounds', async route => {
      const req = route.request();
      if (req.method() === 'GET') return route.fulfill({ contentType: 'application/json', body: '{"configured":true,"localUploads":true,"maximumDuration":7200}' });
      if (req.headers()['content-type'].startsWith('video/')) { uploads++; assert.equal(req.postDataBuffer().length, fs.statSync(process.env.SITE_TEST_VIDEO).size); assert.equal(req.headers()['x-video-duration'] > 0, true); return route.fulfill({ contentType: 'application/json', body: '{"fileToken":"offline-upload-reference"}' }); }
      sent.push(req.postDataJSON());
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'completed', rounds: [{ id: 'recorded-0', map: 1, round: 1, start: 1, end: 3, confidence: 'low', evidence: 'Offline fixture.', confirmed: false }] }) });
    });
    await page.goto((process.env.SITE_TEST_URL || 'http://127.0.0.1:4176') + '/vod.html');
    assert.equal(await page.locator('.analytics-choice, .analytics-toggle').count(), 0);
    await page.locator('#localFile').setInputFiles(process.env.SITE_TEST_VIDEO);
    await page.locator('#vodStatus').filter({ hasText: 'Video ready.' }).waitFor(); assert.equal(uploads, 0);
    await page.locator('#localPlayer').evaluate(video => { video.currentTime = 1.25; }); await page.locator('#markRound').click();
    await page.locator('#localPlayer').evaluate(video => { video.currentTime = 2.5; });
    await page.locator('#roundList .vod-seek').click(); assert.equal(await page.locator('#localPlayer').evaluate(video => video.currentTime), 1.25);
    await page.locator('#localAnalyzer').selectOption('cloud');
    await page.locator('#analyzeRounds').click(); assert.equal(await page.locator('#localAnalysisConfirm').isVisible(), true); assert.equal(uploads, 0);
    await page.locator('#cancelLocalAnalysis').click(); assert.equal(uploads, 0); assert.equal(await page.locator('#analyzeRounds').isEnabled(), true);
    await page.locator('#analyzeRounds').click();
    const box = await page.locator('#confirmLocalAnalysis').boundingBox(); await page.mouse.move(box.x + 12, box.y + 12);
    await page.waitForFunction(() => document.querySelector('#cur').classList.contains('is-hover'));
    assert.match(await page.locator('#cur').evaluate(node => node.style.transform), new RegExp(String(box.x + 12)));
    await page.locator('#confirmLocalAnalysis').click(); await page.locator('#detectedRoundList li').waitFor();
    assert.equal(uploads, 1); assert.equal(sent[0].action, 'startFile'); assert.equal(JSON.stringify(sent).includes(path.basename(process.env.SITE_TEST_VIDEO)), false);
    await page.locator('#detectedRoundList').getByRole('button', { name: 'Start 00:01' }).click(); assert.equal(await page.locator('#localPlayer').evaluate(video => video.currentTime), 1);
    await page.locator('.dock-trigger').click();
    assert.equal(await page.locator('.branch-menu').evaluate(node => getComputedStyle(node).animationName), 'branch-pop');
    assert.equal(await page.locator('.branch-menu').evaluate(node => getComputedStyle(node).width), '210px');
    await page.screenshot({ path: 'docs/screenshots/vod-local-analysis.png', fullPage: false });
    await page.emulateMedia({ reducedMotion: 'reduce' }); assert.equal(await page.locator('.branch-menu').evaluate(node => getComputedStyle(node).animationName), 'none');
    for (const width of [360, 390, 768]) { await page.setViewportSize({ width, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); }
    assert.deepEqual(errors, []); await context.close();

    const production = await browser.newContext(); const prod = await production.newPage(); let sdkRequests = 0;
    await production.route('https://www.kixotgg.com/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/_vercel/insights/script.js') { sdkRequests++; return route.fulfill({ contentType: 'text/javascript', body: '' }); }
      if (url.pathname === '/api/analyze-rounds') return route.fulfill({ contentType: 'application/json', body: '{"configured":false}' });
      const file = path.join(process.cwd(), url.pathname.slice(1) || 'index.html');
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html', body: fs.readFileSync(file) });
    });
    await prod.goto('https://www.kixotgg.com/vod.html'); await prod.waitForFunction(() => !!window.va);
    assert.equal(sdkRequests, 1); assert.equal(await prod.locator('.analytics-choice, .analytics-toggle').count(), 0);
    const sanitized = await prod.evaluate(() => window.vaq.find(entry => entry[0] === 'beforeSend')[1]({ type: 'pageview', url: 'https://www.kixotgg.com/vod.html?video=private#note' }));
    assert.equal(sanitized.url, 'https://www.kixotgg.com/vod.html');
    await production.close();
    console.log('Local playback privacy, upload confirmation/cancel, byte upload, file analysis, point seeking, cursor, menu pop/reduced motion, mobile widths and Vercel vanilla SDK passed with isolated fixtures.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
