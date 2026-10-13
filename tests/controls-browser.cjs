const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await require('./browser-fixtures.cjs').withoutGoogleAnalytics(page);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let phase = 'pending', localUploads = true; const actions = [];
    await page.route('**/api/analyze-rounds', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { configured: true, localUploads, maximumDuration: 7200 } });
      if (route.request().headers()['content-type'].startsWith('video/')) return route.fulfill({ json: { fileToken: 'test-file-token' } });
      actions.push(route.request().postDataJSON().action);
      await new Promise(resolve => setTimeout(resolve, 3500));
      return route.fulfill(phase === 'invalid' ? { status: 502, json: { error: 'Analysis returned invalid timestamps. No markers were changed.' } } : phase === 'quota' ? { status: 429, json: { error: 'Free-tier quota reached. Try later.' } } : { json: { status: 'processing', job: 'test-job', pollAfter: 15, message: 'Provider is busy. Checking this job.' } });
    });
    await page.goto(process.env.SITE_TEST_URL + '/vod.html');
    const bytes = await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90;
      const context = canvas.getContext('2d'); const stream = canvas.captureStream(10);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' }); const chunks = [];
      recorder.ondataavailable = event => chunks.push(event.data);
      const done = new Promise(resolve => { recorder.onstop = async () => resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()))); });
      recorder.start(); const paint = setInterval(() => { context.fillStyle = '#111'; context.fillRect(0, 0, 160, 90); context.fillStyle = '#fff'; context.fillText(String(performance.now()), 12, 45); }, 100);
      await new Promise(resolve => setTimeout(resolve, 4500)); clearInterval(paint); recorder.stop(); stream.getTracks().forEach(track => track.stop()); return done;
    });
    await page.locator('#localFile').setInputFiles({ name: 'test.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) });
    await page.waitForFunction(() => document.querySelector('#vodStatus').textContent === 'Video ready.');
    assert.equal(await page.locator('#localPlayer').evaluate(video => video.currentTime), 0, 'duration discovery must restore the first frame');
    await page.locator('#localPlayer').evaluate(video => { video.currentTime = 1; });
    await page.locator('#markRound').click();
    assert.equal(await page.locator('#markRound').evaluate(node => node === document.activeElement), false);
    await page.keyboard.press('Space'); assert.equal(await page.locator('#roundList li').count(), 1);
    await page.locator('#localPlayer').evaluate(video => { video.pause(); video.currentTime = 3; });
    await page.locator('#roundList').getByRole('button', { name: 'Jump', exact: true }).click();
    assert.equal(await page.locator('#localPlayer').evaluate(video => video.currentTime), 1);
    await page.locator('#tagMistake').click(); assert.equal(await page.locator('#mistakeType').evaluate(node => node === document.activeElement), true);
    await page.locator('#cancelMistake').click(); await page.keyboard.press('Space'); assert.equal(await page.locator('#mistakeForm').isVisible(), false);
    await page.locator('#localAnalyzer').selectOption('cloud');
    await page.locator('#analyzeRounds').click();
    await page.locator('#confirmLocalAnalysis').hover();
    await page.waitForFunction(() => document.documentElement.classList.contains('cur-on') && document.querySelector('#cur').classList.contains('is-visible'));
    await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('cur-on')), false);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => document.documentElement.classList.contains('cur-on') && document.querySelector('#cur').classList.contains('is-visible'));
    await page.locator('#confirmLocalAnalysis').click();
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => !document.documentElement.classList.contains('cur-on') || document.querySelector('#cur').classList.contains('is-visible')), true, 'closing the upload prompt must keep a visible custom or native pointer');
    await page.waitForTimeout(2200); assert.match(await page.locator('#roundAnalysisStatus').textContent(), /00:0[2-9] elapsed/);
    await page.waitForTimeout(2100); assert.match(await page.locator('#roundAnalysisStatus').textContent(), /Provider is busy.*00:0[4-9] elapsed/);
    await page.locator('#cancelRoundAnalysis').click(); const stopped = await page.locator('#roundAnalysisStatus').textContent(); await page.waitForTimeout(1200); assert.equal(await page.locator('#roundAnalysisStatus').textContent(), stopped);
    phase = 'quota'; await page.locator('#analyzeRounds').click(); await page.waitForFunction(() => document.querySelector('#roundAnalysisStatus').textContent.includes('quota reached'));
    const quota = await page.locator('#roundAnalysisStatus').textContent(); await page.waitForTimeout(1200); assert.equal(await page.locator('#roundAnalysisStatus').textContent(), quota);
    phase = 'invalid'; await page.locator('#analyzeRounds').click(); await page.waitForFunction(() => document.querySelector('#roundAnalysisStatus').textContent.includes('invalid timestamps'));
    assert.equal(actions.at(-1), 'poll');
    phase = 'pending'; await page.locator('#analyzeRounds').click(); await page.waitForFunction(() => document.querySelector('#roundAnalysisStatus').textContent.includes('Provider is busy'));
    assert.equal(actions.at(-1), 'startFile', 'a terminally invalid job must be cleared before retrying'); await page.locator('#cancelRoundAnalysis').click();
    localUploads = false; const priorActions = actions.length;
    await page.locator('#analyzeRounds').click();
    await page.waitForFunction(() => document.querySelector('#roundAnalysisStatus').textContent.includes('Choose On this device'));
    assert.equal(actions.length, priorActions, 'unsupported hosting must not submit a video upload or analysis');
    const folder = page.locator('.dock-folder'); await folder.hover(); await page.waitForTimeout(600); assert.notEqual(await folder.evaluate(node => getComputedStyle(node).transform), 'none');
    await page.emulateMedia({ reducedMotion: 'reduce' }); assert.equal(await folder.evaluate(node => getComputedStyle(node).transform), 'none');
    await page.goto(process.env.SITE_TEST_URL + '/dojo.html?quick=1');
    const backSize = async () => {
      const home = await page.locator('.dojo-home').boundingBox(), back = await page.locator('#backToModes').boundingBox();
      assert.equal(home.width, back.width); assert.equal(home.height, back.height);
      assert.ok(back.x >= 0 && back.x + back.width <= (await page.viewportSize()).width);
    };
    await backSize(); await page.locator('#backToModes').click(); assert.equal(await page.locator('#dojoLauncher').isVisible(), true);
    await page.locator('#btnOpenPlan').click(); await page.locator('#backToModes').click(); assert.equal(await page.locator('#dojoLauncher').isVisible(), true);
    for (const width of [360, 390, 768]) { await page.setViewportSize({ width, height: 844 }); await page.locator('#btnQuick').click(); await backSize(); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await page.locator('#backToModes').click(); }
    assert.deepEqual(errors, []);
    console.log('Pointer focus, Space playback, point Jump, live timer during requests/busy polling, stop/quota cleanup, folder motion, matching back buttons and mobile navigation passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
