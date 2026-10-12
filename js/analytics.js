(() => {
  'use strict';
  // GA4 CONFIG: paste your G- measurement ID between these quotes.
  const GA_MEASUREMENT_ID = '';
  const validId = /^G-[A-Z0-9]{6,}$/.test(GA_MEASUREMENT_ID) && !/YOUR|PLACEHOLDER|XXXX|TEST/.test(GA_MEASUREMENT_ID);
  const consentKey = 'kixot_analytics_consent_v1';
  const events = new Set(['dojo_opened', 'drill_started', 'drill_completed', 'video_loaded', 'round_marked', 'mistake_tag_added', 'review_exported']);
  const values = {
    drill_mode: ['flick', 'precision', 'track'], difficulty: ['rookie', 'ranked', 'ascendant', 'radiant'],
    video_source: ['youtube', 'file'],
    mistake_type: ['bad_peek', 'no_utility', 'bad_crosshair_placement', 'overextended', 'wrong_rotation', 'lost_trade', 'mistimed_reload', 'other']
  };
  let choice = 'off', initialized = false, loading = false, viewed = false, dojoSent = false, queue = [];
  try { choice = localStorage.getItem(consentKey) === 'accept' ? 'accept' : 'off'; } catch {}
  const accepted = () => choice === 'accept' && validId;
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
  const disable = () => {
    window['ga-disable-' + GA_MEASUREMENT_ID] = true;
    queue = [];
    if (initialized) send('consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    // Remove first-party GA cookies for this host and parent domains.
    try {
      const domains = location.hostname.split('.').map((_, index, parts) => parts.slice(index).join('.'));
      document.cookie.split(';').forEach(cookie => {
        const name = cookie.split('=')[0].trim();
        if (!/^_ga(?:_|$)/.test(name)) return;
        document.cookie = name + '=; Max-Age=0; path=/';
        domains.forEach(domain => { document.cookie = name + '=; Max-Age=0; path=/; domain=' + domain; });
      });
    } catch {}
  };
  window.KixotAnalytics = Object.freeze({ track });
  const widget = document.createElement('aside');
  widget.className = 'analytics-choice';
  widget.setAttribute('role', 'dialog');
  widget.setAttribute('aria-modal', 'true');
  widget.setAttribute('aria-label', 'Analytics choice');
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.className = 'analytics-toggle'; toggle.textContent = 'Analytics';
  const panel = document.createElement('div'); panel.id = 'analyticsPanel';
  const label = document.createElement('p'); label.textContent = 'Optional analytics';
  const state = document.createElement('p'); state.className = 'analytics-state'; state.setAttribute('role', 'status');
  const accept = document.createElement('button'); accept.type = 'button'; accept.textContent = 'Accept';
  const decline = document.createElement('button'); decline.type = 'button'; decline.textContent = 'Decline';
  let savedChoice = false;
  try { savedChoice = ['accept', 'decline'].includes(localStorage.getItem(consentKey)); } catch {}
  panel.hidden = savedChoice;
  const sync = () => {
    widget.hidden = panel.hidden;
    toggle.setAttribute('aria-controls', panel.id); toggle.setAttribute('aria-expanded', String(!panel.hidden));
    state.textContent = choice === 'accept' ? (validId ? 'Accepted' : 'Accepted. Not configured.') : 'Off';
    if (!widget.hidden) accept.focus({ preventScroll: true });
    else if (widget.contains(document.activeElement)) toggle.focus({ preventScroll: true });
  };
  toggle.addEventListener('click', () => { panel.hidden = !panel.hidden; sync(); });
  const choose = next => {
    choice = next;
    try { localStorage.setItem(consentKey, next); } catch {}
    panel.hidden = true; sync();
    if (next === 'accept') {
      activate();
    } else disable();
  };
  accept.addEventListener('click', () => choose('accept'));
  decline.addEventListener('click', () => choose('decline'));
  panel.append(label, state, accept, decline); widget.append(panel); document.body.appendChild(widget);
  (document.querySelector('.footer__actions') || document.body).appendChild(toggle);
  widget.addEventListener('click', event => { if (event.target === widget) { panel.hidden = true; sync(); } });
  document.addEventListener('keydown', event => {
    if (widget.hidden) return;
    if (event.key === 'Escape') { panel.hidden = true; sync(); toggle.focus({ preventScroll: true }); }
    if (event.key === 'Tab') {
      if (event.shiftKey && document.activeElement === accept) { event.preventDefault(); decline.focus(); }
      else if (!event.shiftKey && document.activeElement === decline) { event.preventDefault(); accept.focus(); }
    }
  });
  sync(); activate();
  window.addEventListener('storage', event => {
    if (event.key !== consentKey && event.key !== null) return;
    try { choice = localStorage.getItem(consentKey) === 'accept' ? 'accept' : 'off'; } catch { choice = 'off'; }
    sync(); if (choice === 'accept') activate(); else disable();
  });
})();
