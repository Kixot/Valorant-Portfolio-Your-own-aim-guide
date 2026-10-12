const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const walk = folder => fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(folder, entry.name)) : [path.join(folder, entry.name)]);
const files = [ ...fs.readdirSync(root).filter(file => file.endsWith('.html')).map(file => path.join(root, file)), ...['pages', 'css', 'js'].flatMap(folder => walk(path.join(root, folder))) ].filter(file => /\.(html|css|js)$/.test(file));
test('site sources have no forbidden dashes, heading elements or shadow effects', () => {
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /\u2014|&mdash;|&#8212;|&#x2014;/i, file);
    assert.doesNotMatch(text, /<h1(?:\s|>)/i, file);
    assert.doesNotMatch(text, /(?:box-shadow|text-shadow)\s*:|drop-shadow\s*\(/i, file);
  }
});
test('all local HTML stylesheet, script, image and page paths exist', () => {
  for (const file of files.filter(file => file.endsWith('.html'))) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const link = match[1]; if (/^(?:[a-z]+:|#|\/\/)/i.test(link)) continue;
      const relative = decodeURIComponent(link.split(/[?#]/)[0]); if (!relative) continue;
      const target = path.resolve(path.dirname(file), relative);
      assert.ok(fs.existsSync(target), file + ': missing ' + link);
    }
  }
});
