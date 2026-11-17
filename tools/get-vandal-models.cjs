// Downloads the Vandal models from ILilMitch's Sketchfab collection (CC Attribution)
// into assets/models/vandal/ and lists them in assets/dojo-assets.json.
// Run it yourself so your Sketchfab token never leaves your machine:
//   PowerShell:  $env:SKETCHFAB_TOKEN = "your token"; node tools/get-vandal-models.cjs
// The token is read from the environment only. It is never written to disk.
const fs = require('node:fs');
const path = require('node:path');

const token = (process.env.SKETCHFAB_TOKEN || '').trim();
if (!/^[0-9a-f]{32}$/i.test(token)) { console.error('Set SKETCHFAB_TOKEN to your Sketchfab API token first.'); process.exit(1); }

const root = path.resolve(__dirname, '..');
const folder = path.join(root, 'assets', 'models', 'vandal');
const manifestFile = path.join(root, 'assets', 'dojo-assets.json');
const COLLECTION = '08dea74e797d4d7c8c55f0a1b167af6a';
const VANDAL = '9c82e19d-4575-0200-1a81-3eacf00cf872';
const LIMIT = 200 * 1024 * 1024;
// Sketchfab title prefix -> the skin's in-game name.
const NAMES = {
  'neptune': 'Neptune Vandal', 'oni': 'Oni Vandal', 'sol': 'Sentinels of Light Vandal', 'reaver': 'Reaver Vandal',
  'foresaken': 'Forsaken Vandal', 'forsaken': 'Forsaken Vandal', 'rgx': 'RGX 11z Pro Vandal', 'prime': 'Prime Vandal',
  'gaia': "Gaia's Vengeance Vandal", 'prelude': 'Prelude to Chaos Vandal'
};

const json = async (url, headers) => {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(url.split('?')[0] + ' answered ' + response.status);
  return response.json();
};

(async () => {
  const skins = new Set((await json('https://valorant-api.com/v1/weapons/' + VANDAL)).data.skins.map((skin) => skin.displayName));
  let models = [], next = 'https://api.sketchfab.com/v3/collections/' + COLLECTION + '/models?count=24';
  while (next) { const page = await json(next); models = models.concat(page.results); next = page.next; }

  // One model per skin: the default colour when there is one, otherwise the first listed.
  const chosen = new Map();
  for (const model of models) {
    const skin = NAMES[model.name.trim().split(/\s+/)[0].toLowerCase()];
    if (!skin || !skins.has(skin)) { console.log('skip  ' + model.name + ' (no matching skin name)'); continue; }
    if (!model.isDownloadable) { console.log('skip  ' + model.name + ' (not downloadable)'); continue; }
    if (/unupgraded/i.test(model.name)) continue;
    if (!chosen.has(skin) || /de[a]?fault/i.test(model.name)) chosen.set(skin, model);
  }

  // Single models from other Sketchfab authors (all CC Attribution), for skins the collection lacks.
  const EXTRA = { 'Oni Vandal': '24155eea4c1c4e57b970a3ac3275ce31', 'Standard Vandal': '0dd5c4e5342a42d9b6969b7f4e6ac69e' };
  for (const [skin, uid] of Object.entries(EXTRA)) {
    if (chosen.has(skin) || !skins.has(skin)) continue;
    try {
      const model = await json('https://api.sketchfab.com/v3/models/' + uid);
      if (model.isDownloadable && model.license && /^CC Attribution$/i.test(model.license.label)) chosen.set(skin, model);
      else console.log('skip  ' + model.name + ' (not a CC Attribution download)');
    } catch (error) { console.log('skip  ' + skin + ': ' + error.message); }
  }

  fs.mkdirSync(folder, { recursive: true });
  const listed = {}, credits = ['Vandal models from Sketchfab, each licensed CC Attribution 4.0', 'https://creativecommons.org/licenses/by/4.0/', ''];
  for (const [skin, model] of chosen) {
    try {
      const links = await json('https://api.sketchfab.com/v3/models/' + model.uid + '/download', { Authorization: 'Token ' + token });
      if (!links.glb || !links.glb.url) { console.log('skip  ' + model.name + ' (no GLB offered)'); continue; }
      if (links.glb.size > LIMIT) { console.log('skip  ' + model.name + ' (too large)'); continue; }
      const response = await fetch(links.glb.url);
      if (!response.ok) throw new Error('download answered ' + response.status);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > LIMIT || bytes.subarray(0, 4).toString('latin1') !== 'glTF') throw new Error('not a GLB file');
      const file = skin.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.glb';
      fs.writeFileSync(path.join(folder, file), bytes);
      listed[skin] = file;
      credits.push(skin + ': "' + model.name + '" by ' + ((model.user && model.user.username) || 'unknown') + ' https://sketchfab.com/3d-models/' + model.uid);
      console.log('saved ' + file + ' (' + (bytes.length / 1048576).toFixed(1) + ' MB)');
    } catch (error) { console.log('fail  ' + model.name + ': ' + error.message); }
  }

  let manifest = {};
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch {}
  manifest.killSounds = Array.isArray(manifest.killSounds) ? manifest.killSounds : [];
  // Keep hand-tuned entries (objects with keep or rotateY) instead of overwriting them with a bare file name.
  manifest.vandalModels = Object.assign({}, listed, manifest.vandalModels);
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(folder, 'CREDITS.txt'), credits.join('\n') + '\n');
  console.log(Object.keys(listed).length + ' models listed in assets/dojo-assets.json');
})().catch((error) => { console.error(error.message); process.exit(1); });
