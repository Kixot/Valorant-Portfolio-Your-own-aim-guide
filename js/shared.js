(() => {
  'use strict';
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const coarse = matchMedia('(any-pointer: coarse)');
  const cur = document.getElementById('cur');
  const root = document.documentElement;
  const interactive = 'a, button, input, select, textarea, label, summary, [role="button"], [contenteditable="true"]';
  let frame = 0, x = 0, y = 0, positioned = false, hasPointer = false, activeTarget = null;
  let targetStarted = 0, cornerOrigins = [], cornerPositions = [];
  const corners = cur ? ['tl', 'tr', 'br', 'bl'].map(position => {
    const corner = document.createElement('span');
    corner.className = 'cur__corner cur__corner--' + position;
    cur.appendChild(corner);
    return corner;
  }) : [];
  const enabled = () => fine.matches && !coarse.matches && !motion.matches;
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
    cur.style.transform = `translate3d(${x}px,${y}px,0)`;
    cur.classList.toggle('is-hover', !!activeTarget);
    if (activeTarget?.isConnected) {
      const rect = activeTarget.getBoundingClientRect();
      const positions = [
        [rect.left - 3, rect.top - 3], [rect.right - 9, rect.top - 3],
        [rect.right - 9, rect.bottom - 9], [rect.left - 3, rect.bottom - 9]
      ];
      const progress = Math.min(1, (performance.now() - targetStarted) / 220);
      const ease = 1 - Math.pow(1 - progress, 3);
      corners.forEach((corner, index) => {
        const [left, top] = positions[index];
        const from = cornerOrigins[index] || [x - 18, y - 18];
        const px = from[0] + (left - from[0]) * ease;
        const py = from[1] + (top - from[1]) * ease;
        cornerPositions[index] = [px, py];
        corner.style.transform = `translate3d(${px - x + 6}px,${py - y + 6}px,0)`;
        corner.style.rotate = `${(1 - ease) * 90}deg`;
      });
    }
    cur.classList.add('is-visible');
    root.classList.add('cur-on');
    positioned = true;
    // Keep brackets attached to animated controls while the pointer remains exact.
    if (activeTarget) frame = requestAnimationFrame(draw);
  };
  const selectTarget = target => {
    let next = target?.closest?.(interactive) || null;
    if (next?.matches(':disabled')) next = null;
    if (next !== activeTarget && next) {
      targetStarted = performance.now();
      cornerOrigins = activeTarget && cornerPositions.length ? cornerPositions.map(position => [...position])
        : [[x - 18, y - 18], [x + 6, y - 18], [x + 6, y + 6], [x - 18, y + 6]];
    }
    activeTarget = next;
    cur?.classList.toggle('is-hover', !!activeTarget);
  };
  window.addEventListener('pointermove', (event) => {
    if (!cur || !enabled() || event.pointerType === 'touch' || document.pointerLockElement) {
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
    selectTarget(event.target);
    if (positioned && !frame) frame = requestAnimationFrame(draw);
  }, { passive: true });
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

  // The folder remains the site's navigation. Its front also opens by tap or keyboard.
  const folder = document.querySelector('.ff');
  const toggle = document.querySelector('.ff__front');
  if (folder && toggle) {
    toggle.addEventListener('click', () => {
      const open = folder.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (event) => {
      if (!folder.contains(event.target) || event.target.closest('.ff__item')) {
        folder.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        if (event.target.closest('.ff__item')) toggle.blur();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        folder.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        if (folder.contains(document.activeElement)) toggle.blur();
      }
    });
  }

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
