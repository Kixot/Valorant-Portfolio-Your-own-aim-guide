(() => {
  'use strict';
  // GA4 CONFIG: paste your G- measurement ID between these quotes.
  const GA_MEASUREMENT_ID = 'G-YKWM2XBXYY';
  const validId = /^G-[A-Z0-9]{6,}$/.test(GA_MEASUREMENT_ID) && !/YOUR|PLACEHOLDER|XXXX|TEST/.test(GA_MEASUREMENT_ID);

  const events = new Set(['dojo_opened', 'drill_started', 'drill_completed', 'video_loaded', 'round_marked', 'mistake_tag_added', 'review_exported']);
  const values = {
    drill_mode: ['flick', 'precision', 'track'], difficulty: ['rookie', 'ranked', 'ascendant', 'radiant'],
    video_source: ['youtube', 'file'],
    mistake_type: ['bad_peek', 'no_utility', 'bad_crosshair_placement', 'overextended', 'wrong_rotation', 'lost_trade', 'mistimed_reload', 'other']
  };
  let initialized = false, loading = false, viewed = false, dojoSent = false, queue = [];
  const accepted = () => validId;
  const send = (...args) => { try { window.gtag?.(...args); } catch {} };
  const safePage = location.origin + location.pathname;
  const track = (event, parameters = {}) => {
    if (!accepted() || !events.has(event)) return;
    if (event === 'dojo_opened') { if (dojoSent) return; dojoSent = true; }
    const safe = {};
    for (const [key, allowed] of Object.entries(values)) if (allowed.includes(parameters[key])) safe[key] = parameters[key];
    if (initialized) send('event', event, safe);
    else if (queue.length < 100) queue.push([event, safe]);
  };
  const activate = () => {
    if (!accepted()) return;
    window['ga-disable-' + GA_MEASUREMENT_ID] = false;
    if (initialized) { send('consent', 'update', { analytics_storage: 'granted' }); return; }
    if (loading) return;
    loading = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    const script = document.createElement('script');
    script.id = 'kixotGtag';
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_MEASUREMENT_ID);
    script.onload = () => {
      loading = false;
      if (!accepted()) { script.remove(); return; }
      send('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
      send('js', new Date());
      send('config', GA_MEASUREMENT_ID, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
        page_location: safePage, page_referrer: '', page_title: document.title });
      initialized = true;
      if (!viewed) { viewed = true; send('event', 'page_view', { page_location: safePage, page_referrer: '', page_title: document.title }); }
      for (const [name, params] of queue) send('event', name, params);
      queue = [];
      if (window.__range) track('dojo_opened');
    };
    script.onerror = () => { loading = false; queue = []; script.remove(); };
    document.head.appendChild(script);
  };
  window.KixotAnalytics = Object.freeze({ track });
  // GA4 page views and successful actions use the configured property above.
  activate();
  // The installed package's vanilla SDK is shipped as a browser module.
  // Local previews and directly opened files never request Vercel collection.
  const localPreview = ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname) || location.protocol === 'file:';
  if (!localPreview) import(new URL('../assets/vendor/vercel-analytics.js', document.currentScript.src).href).then(({ inject }) => {
    inject({ mode: 'production', beforeSend: event => {
      try { const url = new URL(event.url); url.search = ''; url.hash = ''; return { ...event, url: url.href }; } catch { return null; }
    } });
  }).catch(() => {});
})();
