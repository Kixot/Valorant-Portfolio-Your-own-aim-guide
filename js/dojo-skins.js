/* Vandal skin picker for the Dojo.
   Skin names, tiers and renders come from valorant-api.com at runtime, so new
   skins appear without a site update. Optional 3D models and kill sound files
   are listed in assets/dojo-assets.json; nothing is bundled by default. */
(() => {
  const VANDAL = '9c82e19d-4575-0200-1a81-3eacf00cf872';
  const KEY = 'kixot_vandal_skin_v1';
  const TIERS = ['Ultra', 'Exclusive', 'Premium', 'Deluxe', 'Select', 'Standard'];

  const getJson = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  const assets = getJson('assets/dojo-assets.json').catch(() => ({}));
  window.KixotDojoAssets = assets;

  const select = document.getElementById('skinSelect');
  if (!select) return;
  const preview = document.getElementById('skinPreview');
  const status = document.getElementById('skinStatus');
  let skins = [];

  const say = (text) => { if (status) status.textContent = text; };
  const stored = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const store = (name) => { try { localStorage.setItem(KEY, name); } catch {} };

  const modelFor = (models, name) => {
    const entry = models && models[name];
    if (!entry) return null;
    const file = typeof entry === 'string' ? entry : entry.file;
    if (typeof file !== 'string' || !/^[\w.-]+\.(glb|gltf)$/i.test(file)) return null;
    return {
      url: 'assets/models/vandal/' + file,
      rotateY: Number(entry.rotateY) || 0,
      // Some files hold several guns. "keep" names the parts that make up one.
      keep: Array.isArray(entry.keep) ? entry.keep.filter((name) => typeof name === 'string').slice(0, 20) : null,
      scale: Number(entry.scale) > 0 ? Number(entry.scale) : 1
    };
  };

  const apply = (skin) => {
    if (!skin) return;
    if (preview) { preview.src = skin.icon || ''; preview.alt = skin.name; preview.hidden = !skin.icon; }
    // A page opened straight from disk cannot read the model files; browsers block it.
    if (location.protocol === 'file:') say(skin.tier + ' skin. 3D models cannot load from an opened file. Double-click Preview.cmd in the site folder and use the page it opens.');
    else say(skin.model ? skin.tier + ' skin. 3D model, shown in the range.' : skin.tier + ' skin. No 3D model for this skin yet, showing its picture.');
    window.KixotSkin = skin;
    document.dispatchEvent(new CustomEvent('kixot:skin', { detail: skin }));
  };

  document.addEventListener('kixot:skin-model', (event) => {
    if (!window.KixotSkin || event.detail.name !== window.KixotSkin.name) return;
    say(event.detail.ok ? window.KixotSkin.tier + ' skin. 3D model in the range.' : window.KixotSkin.tier + ' skin. Its 3D model could not load: ' + event.detail.reason);
  });

  select.addEventListener('change', () => {
    const skin = skins.find((item) => item.name === select.value);
    if (skin) { store(skin.name); apply(skin); }
  });

  const load = async () => {
    say('Loading skins.');
    try {
      const [weapon, tiers, extra] = await Promise.all([
        getJson('https://valorant-api.com/v1/weapons/' + VANDAL),
        getJson('https://valorant-api.com/v1/contenttiers'),
        assets
      ]);
      const tierName = new Map(tiers.data.map((tier) => [tier.uuid, tier.devName]));
      skins = weapon.data.skins
        .filter((skin) => skin.displayName && !/^Random /i.test(skin.displayName))
        .map((skin) => ({
          name: skin.displayName,
          tier: tierName.get(skin.contentTierUuid) || 'Standard',
          icon: skin.displayIcon || (skin.chromas && skin.chromas[0] && skin.chromas[0].fullRender) || (skin.levels && skin.levels[0] && skin.levels[0].displayIcon) || null,
          model: modelFor(extra.vandalModels, skin.displayName)
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      select.replaceChildren();
      TIERS.forEach((tier) => {
        const members = skins.filter((skin) => (TIERS.includes(skin.tier) ? skin.tier : 'Standard') === tier);
        if (!members.length) return;
        const group = document.createElement('optgroup');
        group.label = tier + ' (' + members.length + ')';
        members.forEach((skin) => {
          const option = document.createElement('option');
          option.value = skin.name;
          option.textContent = skin.name + (skin.model ? ' (3D)' : '');
          group.appendChild(option);
        });
        select.appendChild(group);
      });
      const wanted = stored();
      const start = skins.find((skin) => skin.name === wanted) || skins.find((skin) => skin.name === 'Standard Vandal') || skins[0];
      if (start) { select.value = start.name; select.disabled = false; apply(start); }
    } catch (error) {
      say('Skins could not load. The range still works.');
    }
  };

  if ('requestIdleCallback' in window) requestIdleCallback(load, { timeout: 2500 }); else setTimeout(load, 600);
})();
