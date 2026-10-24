const { test } = require('node:test');
const assert = require('node:assert/strict');
const config = require('../vercel.json');
test('deployment routes block local secrets and development files while allowing site pages and API', () => {
  const route = pathname => config.routes.find(item => item.src && new RegExp('^' + item.src + '$').test(pathname));
  for (const pathname of ['/.env', '/.env.example', '/.git/config', '/.freebuff/project-id', '/server/round-analysis.cjs', '/server/local-video.cjs', '/tools/preview.ps1', '/tests/vod.test.cjs', '/docs/analytics.md', '/node_modules/package.json', '/package.json', '/package-lock.json', '/Preview.cmd', '/README.md']) assert.equal(route(pathname)?.status, 404, pathname);
  for (const pathname of ['/', '/css/shared.css', '/js/vod.js', '/assets/img/og.png', '/assets/vendor/vercel-analytics.js', '/favicon.ico', '/assets/favicon-96.png', '/assets/apple-touch-icon.png', '/robots.txt', '/sitemap.xml', '/api/analyze-rounds']) assert.equal(route(pathname), undefined, pathname);
  assert.equal(typeof require('../api/analyze-rounds.js'), 'function', 'the API dependency tree must remain loadable');
});

test('clean page URLs serve existing files and legacy URLs redirect once', () => {
  const resolve = pathname => {
    const route = config.routes.find(item => item.src && new RegExp('^' + item.src + '$').test(pathname));
    const replacement = route.headers?.Location || route.dest;
    return { status: route.status, destination: pathname.replace(new RegExp('^' + route.src + '$'), replacement) };
  };
  for (const page of ['dojo', 'vod']) {
    assert.deepEqual(resolve('/' + page), { status: undefined, destination: '/' + page + '.html' });
    assert.deepEqual(resolve('/' + page + '.html'), { status: 308, destination: '/' + page });
    assert.deepEqual(resolve('/' + page + '/'), { status: 308, destination: '/' + page });
  }
  for (const pathname of ['/training', '/training.html', '/pages/training.html']) assert.deepEqual(resolve(pathname), { status: 308, destination: '/dojo' });
  assert.deepEqual(resolve('/index.html'), { status: 308, destination: '/' });
});
