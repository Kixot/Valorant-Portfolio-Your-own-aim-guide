// Copies the Valorant data the site needs from valorant-api.com into assets/valorant/,
// so the pages work on networks that cannot reach that service. Run it again after a
// new map, agent or Vandal skin comes out:  node tools/update-valorant-data.cjs
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'assets', 'valorant');
const VANDAL = '9c82e19d-4575-0200-1a81-3eacf00cf872';
const json = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(url + ' answered ' + r.status); return (await r.json()).data; };
const image = async (url, file) => {
  const target = path.join(out, file);
  if (fs.existsSync(target)) return 'assets/valorant/' + file;
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' answered ' + r.status);
  const bytes = Buffer.from(await r.arrayBuffer());
  if (bytes.subarray(1, 4).toString('latin1') !== 'PNG') throw new Error(url + ' is not a PNG');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  return 'assets/valorant/' + file;
};

(async () => {
  const [maps, agents, weapon, tiers] = await Promise.all([
    json('https://valorant-api.com/v1/maps'),
    json('https://valorant-api.com/v1/agents?isPlayableCharacter=true'),
    json('https://valorant-api.com/v1/weapons/' + VANDAL),
    json('https://valorant-api.com/v1/contenttiers')
  ]);
  const data = { updated: new Date().toISOString().slice(0, 10), maps: [], agents: [], tiers: [], vandalSkins: [] };
  for (const map of maps.filter((item) => item.displayIcon && item.tacticalDescription)) {
    data.maps.push({ uuid: map.uuid, displayName: map.displayName, tacticalDescription: map.tacticalDescription, displayIcon: await image(map.displayIcon, 'maps/' + map.uuid + '.png') });
  }
  for (const agent of agents) {
    const abilities = [];
    for (const ability of agent.abilities.filter((item) => item.displayName && item.slot !== 'Passive')) {
      abilities.push({ slot: ability.slot, displayName: ability.displayName, displayIcon: ability.displayIcon ? await image(ability.displayIcon, 'abilities/' + agent.uuid + '-' + ability.slot.toLowerCase() + '.png') : null });
    }
    data.agents.push({ uuid: agent.uuid, displayName: agent.displayName, displayIconSmall: await image(agent.displayIconSmall || agent.displayIcon, 'agents/' + agent.uuid + '.png'), abilities });
  }
  data.tiers = tiers.map((tier) => ({ uuid: tier.uuid, devName: tier.devName }));
  for (const skin of weapon.skins.filter((item) => item.displayName && !/^Random /i.test(item.displayName))) {
    const source = skin.displayIcon || (skin.chromas && skin.chromas[0] && skin.chromas[0].fullRender) || (skin.levels && skin.levels[0] && skin.levels[0].displayIcon);
    data.vandalSkins.push({ displayName: skin.displayName, contentTierUuid: skin.contentTierUuid, displayIcon: source ? await image(source, 'skins/' + skin.uuid + '.png') : null });
  }
  fs.writeFileSync(path.join(out, 'data.json'), JSON.stringify(data));
  console.log(data.maps.length + ' maps, ' + data.agents.length + ' agents, ' + data.vandalSkins.length + ' Vandal skins saved to assets/valorant/');
})().catch((error) => { console.error(error.message); process.exit(1); });
