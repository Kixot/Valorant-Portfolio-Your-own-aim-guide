(() => {
  'use strict';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const coarse = matchMedia('(any-pointer: coarse)');
  const cur = document.getElementById('cur');
  const root = document.documentElement;
  // Pointer clicks release button focus so Space cannot repeat a completed action.
  // Keyboard activation retains normal focus and accessibility.
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || event.detail === 0) return;
    queueMicrotask(() => { if (document.activeElement === button) button.blur(); });
  });
  const interactive = 'a, button, input, select, textarea, label, summary, [role="button"], [contenteditable="true"]';
  let frame = 0, x = 0, y = 0, positioned = false, hasPointer = false, activeTarget = null;
  const enabled = () => fine.matches && !coarse.matches && !motion.matches;
  const nativePlayer = target => !!target?.closest?.('iframe, video, #hudPreview, select, textarea, input:not([type="range"]):not([type="button"]):not([type="submit"])');
  const hide = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    positioned = false;
    activeTarget = null;
    root.classList.remove('cur-on');
    cur?.classList.remove('is-visible', 'is-hover');
  };
  const draw = () => {
    frame = 0;
    if (!cur || !enabled() || document.hidden || document.pointerLockElement) return;
    const underPointer = document.elementFromPoint(x, y);
    if (nativePlayer(underPointer)) { hide(); return; }
    selectTarget(underPointer);
    cur.style.transform = `translate3d(${x}px,${y}px,0)`;
    cur.classList.toggle('is-hover', !!activeTarget);
    cur.classList.add('is-visible');
    root.classList.add('cur-on');
    positioned = true;
    // Recheck layout while hovering so opening forms cannot leave a stale state.
    if (activeTarget) frame = requestAnimationFrame(draw);
  };
  const selectTarget = target => {
    let next = target?.closest?.(interactive) || null;
    if (next?.matches('input[type="range"]') || (next?.tagName === 'LABEL' && next.control?.type === 'range')) next = null;
    activeTarget = next;
    cur?.classList.toggle('is-hover', !!activeTarget);
  };
  window.addEventListener('pointermove', (event) => {
    if (!cur || !enabled() || event.pointerType === 'touch' || document.pointerLockElement || nativePlayer(event.target)) {
      hide();
      return;
    }
    x = event.clientX;
    y = event.clientY;
    hasPointer = true;
    selectTarget(event.target);
    // Snap immediately on entry. Subsequent frames use the latest real coordinates.
    if (!positioned) draw();
    else if (!frame) frame = requestAnimationFrame(draw);
  }, { passive: true });
  document.addEventListener('pointerover', (event) => {
    if (nativePlayer(event.target)) { hide(); return; }
    selectTarget(event.target);
    if (positioned && !frame) frame = requestAnimationFrame(draw);
  }, { passive: true });
  document.addEventListener('focusin', event => { if (nativePlayer(event.target)) hide(); });
  document.addEventListener('pointerdown', event => { if (nativePlayer(event.target)) hide(); }, { passive: true });
  document.addEventListener('pointerout', (event) => {
    if (!event.relatedTarget) hide();
    else selectTarget(event.relatedTarget);
  }, { passive: true });
  window.addEventListener('blur', () => { hasPointer = false; hide(); });
  document.addEventListener('pointerlockchange', () => {
    hide();
    hasPointer = false;
  });
  document.addEventListener('fullscreenchange', () => {
    hide();
    if (!cur) return;
    // Only descendants of the active fullscreen element are painted by the browser.
    (document.fullscreenElement || document.body).appendChild(cur);
    if (hasPointer && enabled() && !document.pointerLockElement) {
      selectTarget(document.elementFromPoint(x, y));
      draw();
    }
  });
  window.addEventListener('scroll', () => {
    if (!positioned || document.hidden || !enabled() || document.pointerLockElement) return;
    selectTarget(document.elementFromPoint(x, y));
    if (!frame) frame = requestAnimationFrame(draw);
  }, { passive: true });
  const syncVisibility = () => {
    document.body.classList.toggle('is-tab-hidden', document.hidden);
    hide();
  };
  document.addEventListener('visibilitychange', syncVisibility);
  syncVisibility();
  [motion, fine, coarse].forEach(query => query.addEventListener('change', hide));

  // Anchor links work without JavaScript; enhance same-page links with motion-aware scroll.
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.pathname !== location.pathname || !url.hash) return;
    const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (!target) return;
    event.preventDefault();
    history.pushState(null, '', url.hash);
    target.scrollIntoView({ behavior: motion.matches ? 'instant' : 'smooth', block: 'start' });
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });

  // Reuse the existing masked reveals on the full-page placeholders.
  if (document.body.classList.contains('tool-page')) {
    const blocks = document.querySelectorAll('.reveal');
    if (motion.matches) blocks.forEach(el => el.classList.add('is-visible'));
    else {
      const observer = new IntersectionObserver(entries => entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      }), { threshold: 0.1 });
      blocks.forEach(el => observer.observe(el));
    }
  }

  const copy = document.getElementById('copyRiot');
  const toast = document.getElementById('copyToast');
  copy?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(copy.dataset.copy);
      toast?.classList.add('is-visible');
      setTimeout(() => toast?.classList.remove('is-visible'), 1500);
    } catch {
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents(copy);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  });
})();
