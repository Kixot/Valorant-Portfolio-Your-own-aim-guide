// Development checks only. Install nothing into the production site.
// Run against a static server with Playwright available on NODE_PATH.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.SITE_TEST_URL || 'http://127.0.0.1:4174';
const fakeApi = `window.__players=[]; window.YT={Player:class {
 constructor(frame,config){this.frame=frame;this.config=config;this.time=0;this.id=config.videoId;this.duration=540;window.__players.push(this);setTimeout(()=>config.events.onReady({target:this}),0)}
 getIframe(){return this.frame} cueVideoById(id){this.id=id;setTimeout(()=>this.config.events.onStateChange({target:this,data:5}),0)}
 getVideoData(){return {video_id:this.id}} getCurrentTime(){return this.time} getDuration(){return this.duration}
 seekTo(time){this.time=time} pauseVideo(){} destroy(){this.frame.remove()}
 }}; if(!window.onYouTubeIframeAPIReady)throw Error('API callback missing');window.onYouTubeIframeAPIReady();`;
const passed = [];
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const contexts = [];
  const fresh = async (options = {}) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options }); contexts.push(context);
    await context.route('https://www.youtube.com/iframe_api', route => route.fulfill({ contentType: 'text/javascript', body: fakeApi }));
    await context.route('https://www.youtube.com/embed/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Test player</body></html>' }));
    const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    return { context, page, errors };
  };
  const ready = async page => { await page.locator('#vodStatus').filter({ hasText: 'Video ready.' }).waitFor(); };
  const load = async (page, id = 'M7lc1UVf-VE') => {
    await page.locator('#youtubeUrl').fill('https://www.youtube.com/watch?v=' + id);
    await page.getByRole('button', { name: 'Load YouTube', exact: true }).click(); await ready(page);
  };
  const dismiss = async page => { if (await page.getByRole('button', { name: 'Decline', exact: true }).isVisible()) await page.getByRole('button', { name: 'Decline', exact: true }).click(); };
  try {
    const { page, errors } = await fresh();
    const gaRequests = []; page.on('request', request => { if (/googletagmanager|google-analytics/.test(request.url())) gaRequests.push(request.url()); });
    await page.goto(base + '/vod.html');
    assert.equal(await page.locator('.analytics-choice').isVisible(), true);
    await page.getByRole('button', { name: 'Accept', exact: true }).click();
    assert.equal(await page.locator('.analytics-choice').isVisible(), false);
    assert.equal(gaRequests.length, 0, 'empty GA ID must not load even after accept');
    await load(page);
    assert.equal(await page.locator('#youtubePlayer').getAttribute('referrerpolicy'), 'strict-origin-when-cross-origin');
    assert.equal(await page.locator('#autoRoundList').count(), 0);
    await page.evaluate(() => { window.__players.at(-1).time = 130; });
    await page.locator('#markRound').click(); assert.match(await page.locator('#roundList').innerText(), /02:10 Point 1/i);
    await page.locator('#roundList button').filter({ hasText: /^Edit$/ }).click();
    await page.locator('#roundList input').first().fill('00:35');
    await page.locator('#roundList input').last().fill('My marker'); await page.locator('#roundList').getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('#roundList .vod-seek').click(); assert.equal(await page.evaluate(() => window.__players.at(-1).time), 35);
    await page.locator('#tagMistake').click();
    await page.locator('#mistakeTime').fill('00:40'); await page.locator('#mistakeType').selectOption('Lost trade');
    await page.locator('#mistakeNote').fill('<img src=x onerror="alert(1)">'); await page.getByRole('button', { name: 'Save mistake', exact: true }).click();
    assert.equal(await page.locator('#mistakeList img').count(), 0); assert.match(await page.locator('#mistakeList').innerText(), /<img src=x/);
    assert.equal(await page.locator('#mistakeCounts tr').nth(5).locator('td').innerText(), '1');
    await page.locator('#mistakeList').getByRole('button', { name: 'Edit', exact: true }).click();
    await page.locator('#mistakeList select').selectOption('Bad peek'); await page.locator('#mistakeList textarea').fill('Edited');
    await page.locator('#mistakeList').getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('#mistakeList .vod-seek').click(); assert.equal(await page.evaluate(() => window.__players.at(-1).time), 40);
    await page.reload(); await ready(page); assert.match(await page.locator('#roundList').innerText(), /My marker/i); assert.match(await page.locator('#mistakeList').innerText(), /Edited/);
    await page.locator('#youtubeUrl').fill('https://youtube.com.evil.example/watch?v=M7lc1UVf-VE'); await page.locator('#youtubeForm button').click();
    assert.match(await page.locator('#vodStatus').innerText(), /valid video ID/); assert.match(await page.locator('#activeVideo').innerText(), /M7lc1UVf-VE/);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportReviewJson').click()]);
    const exportText = fs.readFileSync(await download.path(), 'utf8'); assert.equal(JSON.parse(exportText).reviews[0].mistakes[0].note, 'Edited');
    await load(page, 'aqz-KE-bpKQ'); assert.match(await page.locator('#roundList').innerText(), /No custom points/);
    await page.locator('.vod-saved summary').click();
    await page.locator('#importReviews').setInputFiles({ name: 'reviews.json', mimeType: 'application/json', buffer: Buffer.from(exportText) });
    await page.locator('#vodStatus').filter({ hasText: 'Reviews imported.' }).waitFor();
    const before = await page.locator('#savedReviews li').count();
    await page.locator('#importReviews').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":2,"reviews":[]}') });
    await page.locator('#vodStatus').filter({ hasText: 'Use a version 1' }).waitFor(); assert.equal(await page.locator('#savedReviews li').count(), before);
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(Error('blocked')) }, configurable: true }));
    await page.locator('#shareReview').click(); assert.equal(await page.locator('#manualShare').isVisible(), true);
    page.once('dialog', dialog => dialog.dismiss()); await page.locator('#deleteReview').click(); assert.equal(await page.locator('#savedReviews li').count(), before);
    page.once('dialog', dialog => dialog.accept()); await page.locator('#deleteReview').click(); assert.equal(await page.locator('#savedReviews li').count(), before - 1);
    // The hover dot stays exactly at the pointer and text inputs retain a native cursor.
    await load(page); await page.locator('#tagMistake').scrollIntoViewIfNeeded(); const box = await page.locator('#tagMistake').boundingBox();
    await page.mouse.move(box.x + 10, box.y + 10); await page.waitForTimeout(40);
    assert.equal(await page.locator('#cur').evaluate(node => node.classList.contains('is-hover')), true);
    const position = await page.locator('#cur').evaluate(node => { const matrix = new DOMMatrix(getComputedStyle(node).transform); return [matrix.m41, matrix.m42]; });
    assert.ok(Math.abs(position[0] - box.x - 10) < .1 && Math.abs(position[1] - box.y - 10) < .1);
    assert.equal(await page.locator('.cur__corner').count(), 0);
    await page.locator('#tagMistake').click(); const inputBox = await page.locator('#mistakeTime').boundingBox(); await page.mouse.move(inputBox.x + 20, inputBox.y + 20);
    assert.equal(await page.locator('html').evaluate(node => node.classList.contains('cur-on')), false);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Open site menu' }).click(); assert.equal(await page.locator('#siteMenu').isVisible(), true);
    assert.equal(await page.locator('.dock-pill').count(), 0);
    assert.equal(await page.locator('.dock-label').innerText(), 'Kixot');
    const folderBox = await page.locator('.dock-trigger').boundingBox();
    await page.mouse.move(folderBox.x + 30, folderBox.y + folderBox.height - 3);
    await page.mouse.move(folderBox.x + 30, folderBox.y + folderBox.height + 5);
    await page.mouse.move(folderBox.x + 30, folderBox.y + 100);
    await page.waitForTimeout(250); assert.equal(await page.locator('#siteMenu').isVisible(), true, 'menu must stay open crossing the gap below the folder');
    await page.locator('.branch-heading').first().click(); assert.equal(await page.locator('.branch-heading').first().getAttribute('aria-expanded'), 'false');
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#siteMenu').isVisible(), false);
    for (const code of [2, 5, 100, 101, 150, 153]) {
      await page.evaluate(value => { const player = window.__players.at(-1); player.config.events.onError({ target: player, data: value }); }, code);
      assert.match(await page.locator('#vodStatus').innerText(), new RegExp('code ' + code)); assert.equal(await page.locator('#markRound').isDisabled(), true);
    }
    await load(page);
    assert.deepEqual(errors, []); passed.push('Review CRUD, seeking, switch, restore, export/import, safe text, sharing fallback, confirmed deletion, cursor and menu');

    assert.ok(process.env.SITE_TEST_VIDEO, 'Set SITE_TEST_VIDEO to a short local MP4 clip for the media checks.');
    const localBytes = fs.readFileSync(process.env.SITE_TEST_VIDEO);
    await page.evaluate(() => { window.__urlLog = { created: [], revoked: [] }; const create = URL.createObjectURL, revoke = URL.revokeObjectURL; URL.createObjectURL = function (value) { const url = create.call(URL, value); window.__urlLog.created.push(url); return url; }; URL.revokeObjectURL = function (value) { window.__urlLog.revoked.push(value); return revoke.call(URL, value); }; });
    const localRequests = []; page.on('request', request => { if (request.method() !== 'GET') localRequests.push(request.url()); });
    await page.locator('#localFile').setInputFiles({ name: 'private-recording.' + (process.env.SITE_TEST_VIDEO ? 'mp4' : 'webm'), mimeType: process.env.SITE_TEST_VIDEO ? 'video/mp4' : 'video/webm', buffer: Buffer.from(localBytes) });
    await ready(page).catch(async error => { throw Error(error.message + '\n' + JSON.stringify(await page.evaluate(() => { const video = document.querySelector('#localPlayer'); return { status: document.querySelector('#vodStatus').textContent, src: video.src, ready: video.readyState, network: video.networkState, error: video.error?.message }; })) + ' bytes=' + localBytes.length); });
    assert.equal(await page.locator('#localPlayer').evaluate(video => video.paused), true, 'local files must not autoplay');
    assert.match(await page.locator('#localPlayer').getAttribute('src'), /^blob:/);
    await page.locator('#localPlayer').evaluate(video => video.play());
    await page.waitForFunction(() => document.querySelector('#localPlayer').currentTime > 0);
    await page.locator('#localPlayer').evaluate(video => video.pause());
    await page.locator('#markRound').click(); assert.match(await page.locator('#roundList').innerText(), /Point 1/i);
    const localUrl = await page.locator('#localPlayer').getAttribute('src'); await load(page);
    assert.equal(await page.evaluate(url => window.__urlLog.revoked.includes(url), localUrl), true);
    assert.deepEqual(localRequests, []); passed.push('Local MP4 plays without upload or autoplay; switching revokes its object URL');

    const blocked = await fresh();
    await blocked.context.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } }); Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } }); });
    await blocked.page.goto(base + '/vod.html'); await dismiss(blocked.page); await load(blocked.page);
    await blocked.page.locator('#markRound').click(); assert.match(await blocked.page.locator('#vodStorageStatus').innerText(), /this visit/);
    assert.match(await blocked.page.locator('#roundList').innerText(), /Point 1/i); assert.deepEqual(blocked.errors, []); passed.push('Blocked storage keeps usable in-memory reviews');

    const quota = await fresh();
    await quota.context.addInitScript(() => { Storage.prototype.setItem = function () { throw new DOMException('Full', 'QuotaExceededError'); }; });
    await quota.page.goto(base + '/vod.html'); await dismiss(quota.page); await load(quota.page); await quota.page.locator('#markRound').click();
    assert.match(await quota.page.locator('#vodStorageStatus').innerText(), /this visit/); assert.deepEqual(quota.errors, []); passed.push('Quota failures keep the current review available for export');

    const analytics = await fresh(); let gaLoads = 0;
    const analyticsSource = fs.readFileSync(path.join(__dirname, '../js/analytics.js'), 'utf8').replace("const GA_MEASUREMENT_ID = '';", "const GA_MEASUREMENT_ID = 'G-ABCDEF1234';");
    await analytics.context.route('**/js/analytics.js', route => route.fulfill({ contentType: 'text/javascript', body: analyticsSource }));
    await analytics.context.route('https://www.googletagmanager.com/**', route => { gaLoads++; return route.fulfill({ contentType: 'text/javascript', body: '' }); });
    await analytics.page.goto(base + '/vod.html'); assert.equal(gaLoads, 0);
    await analytics.page.evaluate(() => window.KixotAnalytics.track('round_marked', { video_source: 'youtube' }));
    // A popup covers controls until dismissed; consent is never inferred.
    await analytics.page.getByRole('button', { name: 'Accept', exact: true }).click();
    await analytics.page.waitForFunction(() => window.dataLayer?.some(item => item[0] === 'event' && item[1] === 'page_view'));
    await analytics.page.evaluate(() => { window.KixotAnalytics.track('mistake_tag_added', { mistake_type: 'bad_peek', note: 'private', video_source: 'youtube', filename: 'private.mp4', video_link: 'secret' }); window.KixotAnalytics.track('not_allowed', {}); });
    let entries = await analytics.page.evaluate(() => window.dataLayer.map(item => [...item]));
    assert.equal(entries.filter(item => item[1] === 'page_view').length, 1);
    assert.deepEqual(entries.find(item => item[1] === 'mistake_tag_added')[2], { video_source: 'youtube', mistake_type: 'bad_peek' });
    assert.equal(JSON.stringify(entries).includes('private'), false);
    await analytics.page.getByRole('button', { name: 'Analytics', exact: true }).click(); await analytics.page.getByRole('button', { name: 'Decline', exact: true }).click();
    const count = await analytics.page.evaluate(() => window.dataLayer.length); await analytics.page.evaluate(() => window.KixotAnalytics.track('round_marked', { video_source: 'youtube' })); assert.equal(await analytics.page.evaluate(() => window.dataLayer.length), count);
    await analytics.page.getByRole('button', { name: 'Analytics', exact: true }).click(); await analytics.page.getByRole('button', { name: 'Accept', exact: true }).click();
    assert.equal(gaLoads, 1); entries = await analytics.page.evaluate(() => window.dataLayer.map(item => [...item])); assert.equal(entries.filter(item => item[1] === 'page_view').length, 1);
    assert.deepEqual(analytics.errors, []); passed.push('Analytics stays off before consent, sanitizes parameters, sends one page view and handles decline/reaccept');

    const blockedTag = await fresh();
    await blockedTag.context.route('**/js/analytics.js', route => route.fulfill({ contentType: 'text/javascript', body: analyticsSource }));
    await blockedTag.context.route('https://www.googletagmanager.com/**', route => route.abort('blockedbyclient'));
    await blockedTag.page.goto(base + '/vod.html'); await blockedTag.page.getByRole('button', { name: 'Accept', exact: true }).click(); await load(blockedTag.page); await blockedTag.page.locator('#markRound').click(); assert.deepEqual(blockedTag.errors, []);
    passed.push('Blocked gtag does not interrupt the reviewer');

    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of ['index.html', 'dojo.html', 'vod.html']) {
        await page.goto(base + '/' + route); await dismiss(page);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, route + ' overflows at ' + width);
      }
    }
    const reduced = await fresh({ reducedMotion: 'reduce' }); await reduced.page.goto(base + '/vod.html'); await dismiss(reduced.page); await reduced.page.mouse.move(250, 250);
    assert.equal(await reduced.page.locator('#cur').evaluate(node => getComputedStyle(node).display), 'none');
    const touch = await fresh({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } }); await touch.page.goto(base + '/vod.html'); await dismiss(touch.page); assert.equal(await touch.page.locator('#cur').evaluate(node => getComputedStyle(node).display), 'none');
    passed.push('All three pages fit 360/390/768/1440; reduced-motion and touch retain native cursors');
    assert.deepEqual(errors, []);
    console.log(passed.join('\n'));
  } finally { await Promise.all(contexts.map(context => context.close())); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
