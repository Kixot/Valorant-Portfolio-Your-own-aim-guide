const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const assert = require('node:assert/strict');
const fakeApi = `window.__players=[];window.YT={Player:class{constructor(frame,config){this.frame=frame;this.config=config;this.id=config.videoId;this.time=0;window.__players.push(this);setTimeout(()=>config.events.onReady({target:this}),0)}getIframe(){return this.frame}cueVideoById(id){this.id=id;setTimeout(()=>this.config.events.onStateChange({target:this,data:5}),0)}getVideoData(){return{video_id:this.id}}getCurrentTime(){return this.time}getDuration(){return 600}seekTo(time){this.time=time}pauseVideo(){}destroy(){this.frame.remove()}}};window.onYouTubeIframeAPIReady();`;
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const base = process.env.SITE_TEST_URL || 'http://127.0.0.1:4188';
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('https://www.youtube.com/iframe_api', route => route.fulfill({ contentType: 'text/javascript', body: fakeApi }));
    await context.route('https://www.youtube.com/embed/**', route => route.fulfill({ contentType: 'text/html', body: '<html>Player test</html>' }));
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    const rounds = [{ id: 'detected-0', map: 1, round: 1, start: 71.5, end: 148.25, confidence: 'high', evidence: '<img src=x onerror=alert(1)>', confirmed: false }, { id: 'detected-1', map: 1, round: 2, start: 180, end: 235, confidence: 'low', evidence: 'Score changed.', confirmed: false }];
    await context.route('**/api/analyze-rounds', async route => {
      const body = route.request().postDataJSON();
      if (route.request().method() === 'GET') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ configured: true, maximumDuration: 7200 }) });
      requests.push(body);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'completed', rounds }) });
    });
    await page.goto(base + '/vod.html');
    await page.locator('#youtubeUrl').fill('https://youtu.be/M7lc1UVf-VE'); await page.locator('#youtubeForm button').click();
    await page.locator('#detectedRoundList li').first().waitFor();
    assert.equal(await page.locator('#detectedRoundList li').count(), 2);
    assert.deepEqual(requests, [{ action: 'start', videoId: 'M7lc1UVf-VE', duration: 600 }]);
    assert.equal(await page.locator('#detectedRoundList img').count(), 0);
    const first = page.locator('#detectedRoundList li').first();
    await first.getByRole('button', { name: /^Start / }).click(); assert.equal(await page.evaluate(() => window.__players.at(-1).time), 71.5);
    await first.getByRole('button', { name: /^End / }).click(); assert.equal(await page.evaluate(() => window.__players.at(-1).time), 148.25);
    await first.getByRole('button', { name: 'Edit', exact: true }).click();
    await first.locator('input').first().fill('01:15'); await first.locator('input').last().fill('02:30'); await first.getByRole('button', { name: 'Save', exact: true }).click();
    assert.match(await first.innerText(), /Confirmed/);
    await page.locator('#markRound').click(); await page.reload(); await page.locator('#vodStatus').filter({ hasText: 'Video ready.' }).waitFor();
    assert.equal(requests.length, 1, 'saved detections must prevent repeated analysis'); assert.match(await page.locator('#roundList').innerText(), /Point 1/i);
    await page.locator('#detectedRoundList li').first().getByRole('button', { name: /^Start / }).click(); assert.equal(await page.evaluate(() => window.__players.at(-1).time), 75);
    await page.locator('#detectedRoundList li').last().getByRole('button', { name: 'Confirm', exact: true }).click();
    await page.locator('#detectedRoundList li').last().getByRole('button', { name: 'Delete', exact: true }).click(); assert.equal(await page.locator('#detectedRoundList li').count(), 1);
    const imported = { version: 1, reviews: [{ version: 1, key: 'youtube:M7lc1UVf-VE', source: { type: 'youtube', videoId: 'M7lc1UVf-VE' }, updated: new Date().toISOString(), nextRound: 1, rounds: [], mistakes: [], detectedRounds: [{ ...rounds[0], id: 'incoming-first' }, { ...rounds[1], id: 'detected-0' }] }] };
    await page.locator('#importReviews').setInputFiles({ name: 'rounds.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
    await page.locator('#vodStatus').filter({ hasText: 'Reviews imported.' }).waitFor();
    assert.equal(await page.locator('#detectedRoundList li').count(), 2);
    await page.locator('#detectedRoundList li').first().getByRole('button', { name: /^Start / }).click(); assert.equal(await page.evaluate(() => window.__players.at(-1).time), 75, 'import must preserve an existing corrected boundary');
    await page.locator('.dock-trigger').click(); assert.match(await page.locator('.branch-link').first().evaluate(node => getComputedStyle(node).fontFamily), /Courier New/);
    assert.match(await page.locator('.dock-label').evaluate(node => getComputedStyle(node).fontFamily), /-apple-system/);
    await page.keyboard.press('Escape');
    for (const width of [360, 390, 768]) { await page.setViewportSize({ width, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); }
    assert.deepEqual(errors, []); await context.close();
    const files = await browser.newContext(); const direct = await files.newPage(), directErrors = [], youtubeRequests = [];
    direct.on('pageerror', error => directErrors.push(error.message)); direct.on('request', request => { if (request.url().includes('youtube.com')) youtubeRequests.push(request.url()); });
    await direct.goto(pathToFileURL(path.resolve('vod.html')).href);
    assert.equal(await direct.locator('#localPreviewHelp').isVisible(), true);
    await direct.locator('#youtubeUrl').fill('https://youtu.be/M7lc1UVf-VE'); await direct.locator('#youtubeForm button').click();
    assert.match(await direct.locator('#vodStatus').innerText(), /Preview.cmd/); assert.equal(await direct.locator('#youtubePlayer').count(), 0); assert.equal(youtubeRequests.length, 0);
    assert.deepEqual(directErrors, []); await files.close();
    console.log('Detected start/end links, edits, confirmation, deletion, safe evidence, restore, privacy, fonts, mobile layout and direct-file guard passed with offline analysis fixtures.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
