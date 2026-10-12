(() => {
  'use strict';
  // Vanilla adaptation of React Bits FolderFloat and BranchedMenu.
  // See THIRD_PARTY_NOTICES.md for source and license.
  const dock = document.querySelector('.ff');
  if (!dock) return;
  const links = [...dock.querySelectorAll('a')].map(link => link.cloneNode(true));
  const make = (tag, className, text) => { const node = document.createElement(tag); node.className = className; if (text) node.textContent = text; return node; };
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  dock.className = 'site-dock';
  dock.replaceChildren();
  const folder = make('div', 'dock-folder');
  const back = make('div', 'dock-back'), paper = make('div', 'dock-paper'), face = make('div', 'dock-face');
  const toggle = make('button', 'dock-trigger'); toggle.type = 'button'; toggle.setAttribute('aria-label', 'Open site menu'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'siteMenu');
  face.appendChild(make('span', 'dock-label', 'Kixot'));
  folder.append(back, paper, face, toggle);
  const tree = make('div', 'branch-menu'); tree.id = 'siteMenu'; tree.hidden = true;
  const groups = [{ label: 'Site', links: [links[0], links[1], links[4]] }, { label: 'Training', links: [links[2], links[3]] }];
  const marker = make('span', 'branch-marker'); tree.appendChild(marker);
  const paths = [];
  const svgNode = tag => document.createElementNS('http://www.w3.org/2000/svg', tag);
  groups.forEach((group, groupIndex) => {
    const section = make('div', 'branch-section is-expanded');
    const heading = make('button', 'branch-heading', group.label); heading.type = 'button'; heading.setAttribute('aria-expanded', 'true');
    const body = make('div', 'branch-body'), inner = make('div', 'branch-inner'); inner.id = 'menuGroup' + groupIndex; heading.setAttribute('aria-controls', inner.id);
    const svg = svgNode('svg'); svg.classList.add('branch-lines'); svg.setAttribute('width', '40'); svg.setAttribute('height', String(12 + group.links.length * 36)); svg.setAttribute('aria-hidden', 'true');
    const lastY = 6 + (group.links.length - 1) * 36 + 18;
    const trunk = svgNode('path'); trunk.setAttribute('d', 'M14 0 V' + (lastY - 10)); svg.appendChild(trunk);
    group.links.filter(Boolean).forEach((link, index) => {
      const y = 24 + index * 36;
      const branch = svgNode('path'); branch.setAttribute('d', `M14 ${y - 10} A10 10 0 0 0 24 ${y} H32`); svg.appendChild(branch);
      const active = svgNode('path'); active.classList.add('branch-reach'); active.setAttribute('d', `M14 0 V${y - 10} A10 10 0 0 0 24 ${y} H32`);
      const length = y - 10 + Math.PI * 5 + 8; active.style.strokeDasharray = length; active.style.strokeDashoffset = length; svg.appendChild(active);
      link.className = 'site-link branch-link' + (link.classList.contains('is-active') || link.hasAttribute('aria-current') ? ' is-active' : '');
      // Keep the homepage section links and full-page destinations intact.
      inner.appendChild(link); paths.push({ link, path: active, length, heading, section });
    });
    inner.prepend(svg); body.appendChild(inner); section.append(heading, body); tree.appendChild(section);
    heading.addEventListener('click', () => {
      const expanded = section.classList.toggle('is-expanded'); heading.setAttribute('aria-expanded', String(expanded)); inner.inert = !expanded; syncMarker();
    });
  });
  dock.append(folder, tree);
  const syncMarker = () => {
    let active = paths.find(item => item.link.classList.contains('is-active') || item.link.getAttribute('aria-current') === 'page') || paths[0];
    paths.forEach(item => { item.path.style.strokeDashoffset = item === active ? 0 : item.length; });
    if (!active || tree.hidden) return;
    const anchor = active.section.classList.contains('is-expanded') ? active.link : active.heading;
    const rect = anchor.getBoundingClientRect(), parent = tree.getBoundingClientRect();
    marker.style.transform = `translateY(${rect.top - parent.top + (rect.height - 16) / 2}px)`;
  };
  const setOpen = open => {
    dock.classList.toggle('is-open', open); tree.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) requestAnimationFrame(syncMarker);
  };
  setOpen(false);
  let hoverTimer, closeTimer;
  toggle.addEventListener('click', () => { clearTimeout(hoverTimer); setOpen(!dock.classList.contains('is-open')); });
  // Hover opens on desktop; tapping and keyboard work on every device.
  toggle.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') hoverTimer = setTimeout(() => setOpen(true), 180); });
  dock.addEventListener('pointerenter', () => clearTimeout(closeTimer));
  dock.addEventListener('pointerleave', event => {
    clearTimeout(hoverTimer);
    if (event.pointerType === 'mouse') closeTimer = setTimeout(() => { if (!dock.matches(':hover') && !dock.contains(document.activeElement)) setOpen(false); }, 180);
  });
  document.addEventListener('click', event => { if (!dock.contains(event.target) || event.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && dock.classList.contains('is-open')) { setOpen(false); toggle.focus(); } });
  dock.addEventListener('focusout', () => { requestAnimationFrame(() => { if (!dock.contains(document.activeElement) && !dock.matches(':hover')) setOpen(false); }); });
  new MutationObserver(syncMarker).observe(tree, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-current'] });
  tree.addEventListener('transitionend', syncMarker);
  window.addEventListener('resize', syncMarker, { passive: true });
  motion.addEventListener('change', syncMarker);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(hoverTimer); clearTimeout(closeTimer); setOpen(false); } });
})();
