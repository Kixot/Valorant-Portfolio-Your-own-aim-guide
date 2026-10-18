const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const origin = 'https://www.kixotgg.com';
const pages = ['index.html', 'dojo.html', 'vod.html'];

test('search metadata identifies each public page and exposes crawlable image previews', () => {
  for (const file of pages) {
    const html = read(file), url = origin + (file === 'index.html' ? '/' : '/' + file);
    assert.ok(html.includes(`<link rel="canonical" href="${url}"`));
    assert.ok(html.includes(`<meta property="og:url" content="${url}"`));
    assert.ok(html.includes('property="og:site_name" content="Kixot"'));
    assert.ok(html.includes('property="og:image" content="' + origin + '/assets/img/og.png"'));
    assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
    const data = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(data['@context'], 'https://schema.org');
    if (file === 'index.html') {
      const profile = data['@graph'].find(item => item['@type'] === 'ProfilePage');
      assert.equal(profile.mainEntity['@type'], 'Person');
      assert.equal(profile.mainEntity.name, 'Kixot');
      assert.ok(profile.mainEntity.sameAs.includes('https://www.youtube.com/kixot'));
    } else {
      assert.equal(data.url, url);
      assert.equal(data['@type'], 'WebPage');
      assert.equal(data.creator.name, 'Kixot');
      assert.equal(data.isAccessibleForFree, true);
    }
    const sitemap = read('sitemap.xml');
    assert.ok(sitemap.includes('<loc>' + url + '</loc>'));
  }
  assert.match(read('robots.txt'), /Allow: \/\s/);
  assert.ok(read('robots.txt').includes('Sitemap: ' + origin + '/sitemap.xml'));
});

test('favicon files are real square PNGs and a valid multi-size ICO, included for deployment', () => {
  for (const [file, size] of [['assets/favicon-96.png', 96], ['assets/favicon-192.png', 192], ['assets/apple-touch-icon.png', 180]]) {
    const png = fs.readFileSync(path.join(root, file));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
    for (const page of pages) assert.ok(read(page).includes('href="' + file + '"'));
  }
  const ico = fs.readFileSync(path.join(root, 'favicon.ico'));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 4);
  for (let i = 0; i < 4; i++) {
    const entry = 6 + i * 16, bytes = ico.readUInt32LE(entry + 8), offset = ico.readUInt32LE(entry + 12);
    assert.equal(ico[entry], ico[entry + 1]);
    assert.ok(offset + bytes <= ico.length);
    assert.equal(ico.subarray(offset, offset + 8).toString('hex'), '89504e470d0a1a0a');
  }
  assert.match(read('.vercelignore'), /^!favicon\.ico$/m);
});
