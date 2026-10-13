const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  try {
    for (const blocked of [false, true]) {
      const context = await browser.newContext(); let tagLoads = 0;
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'www.googletagmanager.com') {
          tagLoads++; assert.equal(url.searchParams.get('id'), 'G-YKWM2XBXYY');
          return blocked ? route.abort('blockedbyclient') : route.fulfill({ contentType: 'text/javascript', body: '' });
        }
        if (url.hostname !== 'www.kixotgg.com') return route.abort();
        if (url.pathname === '/api/analyze-rounds') return route.fulfill({ json: { configured: false } });
        if (url.pathname === '/_vercel/insights/script.js') return route.fulfill({ contentType: 'text/javascript', body: '' });
        const file = path.resolve(process.cwd(), '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
        if (!file.startsWith(process.cwd() + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream', body: fs.readFileSync(file) });
      });
      const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
      for (const pathname of ['/', '/dojo.html', '/vod.html']) {
        const priorLoads = tagLoads;
        await page.goto('https://www.kixotgg.com' + pathname + '?note=private#video-link', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !!window.KixotAnalytics);
        await page.waitForFunction(() => window.dataLayer?.length > 0 || !document.querySelector('#kixotGtag'));
        await page.evaluate(() => {
          window.KixotAnalytics.track('mistake_tag_added', { mistake_type: 'bad_peek', video_source: 'youtube', note: 'private note', video_link: 'private link', filename: 'private file' });
          window.KixotAnalytics.track('unsupported_event');
        });
        assert.equal(tagLoads - priorLoads, 1, pathname + ' must load only one tag');
        const entries = await page.evaluate(() => (window.dataLayer || []).map(item => [...item]));
        if (!blocked) {
          assert.equal(entries.filter(item => item[0] === 'config').length, 1);
          assert.equal(entries.find(item => item[0] === 'config')[1], 'G-YKWM2XBXYY');
          assert.equal(entries.find(item => item[0] === 'config')[2].send_page_view, false);
          const views = entries.filter(item => item[0] === 'event' && item[1] === 'page_view');
          assert.equal(views.length, 1); assert.equal(views[0][2].page_location, 'https://www.kixotgg.com' + pathname);
          assert.equal(views[0][2].page_referrer, '');
          assert.deepEqual(entries.find(item => item[1] === 'mistake_tag_added')[2], { video_source: 'youtube', mistake_type: 'bad_peek' });
          assert.equal(JSON.stringify(entries).includes('private'), false);
          assert.equal(entries.some(item => item[1] === 'unsupported_event'), false);
        }
        assert.equal(await page.locator('.analytics-choice, .analytics-toggle').count(), 0);
      }
      assert.deepEqual(errors, []); await context.close();
    }
    console.log('Configured GA4 ID, single page views on all three pages, safe parameters, no popup and blocked-tag resilience passed. No Google collection requests were sent.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
