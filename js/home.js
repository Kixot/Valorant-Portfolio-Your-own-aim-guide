
    (() => {
      'use strict';

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const $ = (s) => document.querySelector(s);

      /* ============ page reveal: no page transition any more (it flashed kixot
         over the old page). links just navigate, the hero is simply there. ============ */
      let armHeroFloats = null; /* set further down; fires once the page is visible */

      const revealPage = () => {
        document.body.classList.add('ready');
        if (armHeroFloats) armHeroFloats();
      };
      revealPage();

      /* ============ net background: the official vanta.js "net" ============
               the real effect this time (three.js + vanta.net.min.js), not a lookalike:
               a lit wireframe net in perspective that reacts to the cursor. both scripts
               are pulled in lazily (the site already loads fonts + emoji + rank icons from
               cdns) so the first paint never waits on ~600kb of three.

               the page keeps ownership of the pointer: vanta's own scroll/mousemove
               listeners are switched off and the target is written by hand every frame,
               so the cursor AND the scroll can drive the same camera - scroll down and
               the net glides with you, exactly like it does on vantajs.com. */

            const netCssFallback = () => document.body.classList.add('net-css');

            const loadScript = (src) => new Promise((resolve, reject) => {
              const s = document.createElement('script');
              s.src = src;
              s.onload = resolve;
              s.onerror = () => reject(new Error('cdn unreachable: ' + src));
              document.head.appendChild(s);
            });

            (async () => {
              const host = document.getElementById('netBg');
              if (!host) return;
              try {
                if (!window.THREE) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js');
                if (!window.VANTA || !window.VANTA.NET) await loadScript('https://cdn.jsdelivr.net/npm/vanta@latest/dist/vanta.net.min.js');
              } catch (e) { netCssFallback(); return; }

              let net = null;
              try {
                net = window.VANTA.NET({
                  el: '#netBg',
                  /* vanta's own net defaults, recoloured for this site: white on black */
                  color: 0xffffff,
                  backgroundColor: 0x000000,
                  points: 10,
                  maxDistance: 18,
                  spacing: 15,
                  showDots: true,
                  scale: 1,
                  scaleMobile: 1,
                  mouseCoeffX: 1,
                  mouseCoeffY: 1,
                  speed: 0.5,
                  /* pointer is fed from below, not from vanta's own listeners */
                  mouseControls: false,
                  touchControls: false,
                  gyroControls: false,
                  /* vanta eases mouseX/mouseY toward whatever we publish: free smoothing */
                  mouseEase: !reducedMotion
                });
              } catch (e) { net = null; }
              /* init can fail on machines with no webgl: the css net takes over */
              if (!net || !net.renderer) { netCssFallback(); return; }
              const previousResize = net.onResize;
              net.onResize = function () {
                if (previousResize) previousResize.call(this);
                const cap = matchMedia('(max-width: 768px), (pointer: coarse)').matches ? 1.25 : 2;
                this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
              };
              net.resize();
              const syncNetVisibility = () => {
                if (document.hidden || reducedMotion) {
                  cancelAnimationFrame(net.req);
                  net.req = 0;
                } else if (!net.req) {
                  net.prevNow = performance.now();
                  net.animationLoop();
                }
              };
              document.addEventListener('visibilitychange', syncNetVisibility);
              syncNetVisibility();


              /* ---- cursor + scroll -> one pointer, resolved every frame ----
                 the cursor sets where the net is lit up; the scroll adds a slow parallax
                 sweep over the whole page plus a kick that decays after a flick. both feed
                 the same mouseX/mouseY, so they compose instead of fighting each other. */
              let w = 1, h = 1, cx = null, cy = null, kick = 0, sx = 0, maxScroll = 1, heroH = 1;
              const measure = () => {
                w = Math.max(1, host.offsetWidth);
                h = Math.max(1, host.offsetHeight);
                maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
                const hero = document.getElementById('hero');
                heroH = Math.max(1, hero ? hero.offsetHeight : h);
              };
              measure();
              window.addEventListener('resize', measure, { passive: true });
              window.addEventListener('load', measure, { once: true });

              let apply = () => {};
              const aim = (clientX, clientY) => {
                const r = host.getBoundingClientRect();
                if (!r.width || !r.height) return;
                cx = ((clientX - r.left) / r.width) * w;
                cy = ((clientY - r.top) / r.height) * h;
                apply();
              };
              window.addEventListener('pointermove', (e) => aim(e.clientX, e.clientY), { passive: true });
              window.addEventListener('pointerdown', (e) => aim(e.clientX, e.clientY), { passive: true });
              window.addEventListener('touchmove', (e) => {
                if (e.touches.length === 1) aim(e.touches[0].clientX, e.touches[0].clientY);
              }, { passive: true });

              let lastY = window.scrollY || 0;
              window.addEventListener('scroll', () => {
                const y = window.scrollY || 0;
                /* the flick: scroll faster, the net gets pushed further, then springs back */
                kick = Math.max(-h * 0.45, Math.min(h * 0.45, kick + (y - lastY) * 0.8));
                sx = window.scrollX || 0;
                lastY = y;
                apply();
              }, { passive: true });

              apply = () => {
                const frac = Math.max(0, Math.min(1, (window.scrollY || 0) / maxScroll));
                /* the net gets out of the way once the words take over: full strength in the
                   hero, dialed right down through the content sections */
                const past = Math.max(0, Math.min(1, (window.scrollY || 0) / heroH));
                host.style.opacity = (0.22 - 0.15 * past).toFixed(3);
                /* and the cursor gets a shorter leash down there: full range in the hero,
                   about a quarter of it once you are reading - it still answers, it just
                   no longer throws the net around while you are trying to read */
                const damp = 1 - 0.72 * past;
                const tx = w / 2 + (cx == null ? 0 : (cx - w / 2) * damp) + sx * 0.6;
                const ty = h / 2 + (cy == null ? 0 : (cy - h / 2) * damp) + (frac - 0.5) * h * 0.85 + kick * damp;
                /* no easing when motion is reduced, so move the camera directly */
                if (reducedMotion) { net.triggerMouseMove(tx, ty); return; }
                net.mouseX = tx;
                net.mouseY = ty;
              };
              apply();

              if (!reducedMotion) {
                let raf = 0;
                const loop = () => {
                  kick *= 0.94;
                  if (Math.abs(kick) < 0.05) kick = 0;
                  apply();
                  raf = requestAnimationFrame(loop);
                };
                if (!document.hidden) raf = requestAnimationFrame(loop);
                /* never burn a gpu on a tab nobody is looking at */
                document.addEventListener('visibilitychange', () => {
                  if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
                  else if (!raf) { kick = 0; raf = requestAnimationFrame(loop); }
                });
              }
            })();

      /* ============ rotating word: fixed width, clean fade ============ */
      const rotWords = ['clutcher', 'player', 'flicker', 'pro'];
      const rotBox = document.querySelector('.rot-box');
      const rotEl = $('#rotWord');
      if (rotBox && rotEl) {
        const DECRYPT = '!<>-_\\/[]{}=+*^?#';
        /* typewriter entrance + the box width follows exactly what is appearing. no gap.
           widths cached per word: no forced reflow on every swap (lighthouse (hearts)) */
        const widthCache = {};
        let typing = null;
        const measure = (txt) => {
          if (widthCache[txt] != null) return widthCache[txt];
          const probe = document.createElement('span');
          probe.style.visibility = 'hidden';
          probe.style.whiteSpace = 'nowrap';
          probe.textContent = txt;
          rotBox.appendChild(probe);
          const w = probe.getBoundingClientRect().width;
          probe.remove();
          widthCache[txt] = w;
          return w;
        };
        const typeTo = (word) => {
          if (typing) clearInterval(typing);
          rotBox.style.width = measure(word) + 'px';
          let frame = 0;
          typing = setInterval(() => {
            if (document.hidden) return;
            frame++;
            const settled = Math.floor(frame / 2);
            let out = '';
            for (let i = 0; i < word.length; i++) {
              out += i < settled ? word[i] : DECRYPT[Math.floor(Math.random() * DECRYPT.length)];
            }
            rotEl.textContent = out;
            if (settled >= word.length) { clearInterval(typing); typing = null; rotEl.textContent = word; }
          }, 34);
        };
        const initRot = () => {
          rotBox.style.width = measure(rotWords[0]) + 'px';
          rotEl.textContent = rotWords[0];
        };
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(initRot); else initRot();

        if (!reducedMotion) {
          let ri = 0;
          setInterval(() => {
            if (document.hidden) return;
            ri = (ri + 1) % rotWords.length;
            typeTo(rotWords[ri]);
          }, 2800);
        }
      }

      /* ============ click sparks ============ */
      if (!reducedMotion) {
        window.addEventListener('pointerdown', (e) => {
          for (let i = 0; i < 7; i++) {
            const s = document.createElement('span');
            s.className = 'spark';
            const ang = Math.random() * Math.PI * 2;
            const dist = 22 + Math.random() * 30;
            s.style.left = e.clientX + 'px';
            s.style.top = e.clientY + 'px';
            s.style.setProperty('--sx', Math.cos(ang) * dist + 'px');
            s.style.setProperty('--sy', Math.sin(ang) * dist + 'px');
            document.body.appendChild(s);
            setTimeout(() => s.remove(), 550);
          }
        }, { passive: true });
      }

      /* ============ folder float dock: active section ============ */
      const ffLinks = [...document.querySelectorAll('.ff__item[data-section]')];
      if (ffLinks.length) {
        const secs = ffLinks
          .map((l) => document.querySelector(l.dataset.section === 'top' ? '#hero' : '#' + l.dataset.section))
          .filter(Boolean);
        /* offsets cached: reading offsetTop on every scroll event forces layout.
           re-measure only on resize */
        let tops = secs.map((s) => s.offsetTop);
        window.addEventListener('resize', () => { tops = secs.map((s) => s.offsetTop); }, { passive: true });
        window.addEventListener('scroll', () => {
          const probe = window.scrollY + window.innerHeight * 0.4;
          let cur = secs[0].id;
          for (let i = 0; i < secs.length; i++) { if (tops[i] <= probe) cur = secs[i].id; }
          ffLinks.forEach((l) => l.classList.toggle('is-active',
            l.dataset.section === 'top' ? cur === 'hero' : l.dataset.section === cur));
        }, { passive: true });
      }

      /* ============ carousel: seamless infinite flex loop (reactbits style) ============
         the track holds the card set twice; when the first half has fully passed,
         the offset wraps back by exactly one copy - visually a loop with no seam,
         no pause, no end. rAF instead of css animation so the wrap is invisible. */
      const track = document.getElementById('carouselTrack');
      if (track && !reducedMotion) {
        /* one "set" = the cards as authored. repeat the set until the strip is
           comfortably wider than the viewport, so the loop can never run out of
           cards (a 5-card strip vanished past ~1680px wide screens = the "stops"). */
        const setHTML = track.innerHTML;
        const gap = parseFloat(getComputedStyle(track).gap) || 0;
        let sets = 1;
        const fill = () => {
          const setW0 = track.scrollWidth / sets;
          if (setW0 < 1) return;
          const need = Math.max(2, Math.ceil((window.innerWidth * 2) / setW0));
          while (sets < need) { track.insertAdjacentHTML('beforeend', setHTML); sets++; }
        };
        /* setW = one full set PLUS the gap that follows it. the old half-width math
           dropped that gap, so every wrap landed half a gap short = a tiny jump. */
        let setW = 1;
        const measure = () => { fill(); setW = (track.scrollWidth + gap) / sets; };
        measure();
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
        window.addEventListener('resize', measure, { passive: true });
        /* Advance only on visible animation frames. */
        let offset = 0;
        let last = performance.now();
        let lastVW = window.innerWidth;
        let carouselFrame = 0;
        const animateCarousel = () => {
          const now = performance.now();
          const dt = Math.min(0.06, (now - last) / 1000);
          last = now;
          /* some environments change the viewport without firing resize - re-fill
             the moment the width moves so the strip is always wide enough. */
          if (window.innerWidth !== lastVW) { lastVW = window.innerWidth; measure(); }
          if (setW > 1) {
            offset += 42 * dt; /* px per second, always moving, never ends */
            if (offset >= setW) offset -= setW; /* wrap: seam-free by construction */
            track.style.transform = 'translate3d(' + (-offset).toFixed(2) + 'px,0,0)';
          }
          carouselFrame = requestAnimationFrame(animateCarousel);
        };
        const syncCarousel = () => {
          cancelAnimationFrame(carouselFrame);
          carouselFrame = 0;
          if (!document.hidden) {
            last = performance.now();
            carouselFrame = requestAnimationFrame(animateCarousel);
          }
        };
        document.addEventListener('visibilitychange', syncCarousel);
        syncCarousel();
      }

      /* ============ hero floats: pop back in around the hero, and only there ============ */
      const heroFloats = $('#heroFloats');
      if (heroFloats) {
        if (reducedMotion) {
          heroFloats.classList.add('is-on');
        } else {
          /* rect-based check (works everywhere, no io quirks): floats live while the hero is in view */
          const heroEl = $('#hero');
          let floatsArmed = false;
          const floatCheck = () => {
            if (!floatsArmed) return;
            const r = heroEl.getBoundingClientRect();
            heroFloats.classList.toggle('is-on', r.bottom > window.innerHeight * 0.25 && r.top < window.innerHeight * 0.75);
          };
          window.addEventListener('scroll', floatCheck, { passive: true });
          window.addEventListener('resize', floatCheck, { passive: true });
          armHeroFloats = () => { floatsArmed = true; floatCheck(); };
        }
      }

      /* ============ spotlight cards ============ */
      document.querySelectorAll('.spot').forEach((el) => {
        el.addEventListener('pointermove', (e) => {
          const r = el.getBoundingClientRect();
          el.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%');
          el.style.setProperty('--my', ((e.clientY - r.top) / r.height) * 100 + '%');
        }, { passive: true });
      });

      /* ============ reveal on scroll ============ */
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
      document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

      /* ============ apple emojis everywhere (emoji-datasource-apple pngs) ============ */
      const EMJ_CDN = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/';
      const EMJ_RE = /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/gu;
      const applefy = (root) => {
        if (!root) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
          acceptNode: (n) => (n.parentElement && n.parentElement.closest('script, style, noscript, .emj, [data-emj-skip]'))
            ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
        });
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach((n) => {
          const txt = n.nodeValue;
          if (!txt) return;
          EMJ_RE.lastIndex = 0;
          if (!EMJ_RE.test(txt)) return;
          EMJ_RE.lastIndex = 0;
          const frag = document.createDocumentFragment();
          let last = 0, m;
          while ((m = EMJ_RE.exec(txt))) {
            const emoji = m[0];
            if (m.index > last) frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
            const cps = [...emoji].map((c) => c.codePointAt(0).toString(16)).join('-');
            const img = document.createElement('img');
            img.className = 'emj';
            img.src = EMJ_CDN + cps + '.png';
            img.alt = emoji;
            img.draggable = false;
            img.onerror = () => img.replaceWith(document.createTextNode(emoji));
            frag.appendChild(img);
            last = m.index + emoji.length;
          }
          if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
          n.replaceWith(frag);
        });
      };
      applefy(document.body);

      /* ============ hero wordmark: react-bits tech text ============ */
      (() => {
        const tech = initTechText(document.getElementById('heroTitle'), document.getElementById('techCanvas'));
        if (!tech) return;
        /* no languages: the wordmark is English only. the animation (letters flipping
           to dashed vector outlines) keeps running on its own, always. */
      })();
      const emjObs = new MutationObserver((muts) => {
        emjObs.disconnect();
        const roots = new Set();
        muts.forEach((mu) => {
          const fresh = [...mu.addedNodes].some((n) => !(n.nodeType === 1 && (n.classList.contains('spark') || n.classList.contains('emj'))));
          if (!fresh || !mu.target.closest || mu.target.closest('script, style, [data-emj-skip]')) return;
          roots.add(mu.target);
        });
        roots.forEach((el) => applefy(el.nodeType === 1 ? el : el.parentElement));
        emjObs.observe(document.body, { childList: true, subtree: true });
      });
      emjObs.observe(document.body, { childList: true, subtree: true });

      const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, '');

      /* ============ about loadout: guns + agents ============
         tracker.gg hard-blocks every automated read (api, proxies, archives - all 403),
         so the numbers live right here, synced from the profile by hand. edit a number
         below and the page re-renders it. nothing else to touch.

         the icons used to be hot-linked from media.valorant-api.com, which served
         1024x1024 agent art (2.5MB on its own) for 74px slots and held up the page on
         a phone. they are self-hosted in assets/img/ at the size they are actually drawn at. */
      const GUNS = [
        { name: 'VANDAL', skin: "gaia's vandal (blue)", img: 'assets/img/gun-vandal.png', skinImg: 'assets/img/skin-vandal.png', w: 256, h: 78, sw: 384, sh: 105, kills: '2,129', hs: '52.5%', dmg: '158.0' },
        { name: 'PHANTOM', skin: 'recon (red camo)', img: 'assets/img/gun-phantom.png', skinImg: 'assets/img/skin-phantom.png', w: 256, h: 60, sw: 384, sh: 93, kills: '659', hs: '50.3%', dmg: '150.5' },
        { name: 'SHERIFF', skin: 'singularity (pink)', img: 'assets/img/gun-sheriff.png', skinImg: 'assets/img/skin-sheriff.png', w: 248, h: 128, sw: 384, sh: 168, kills: '236', hs: '72.7%', dmg: '83.8' }
      ];
      const AGENTS = [
        { name: 'CLOVE', icon: 'assets/img/agent-clove.png', role: 'controller', pun: 'too ez..' },
        { name: 'OMEN', icon: 'assets/img/agent-omen.png', role: 'controller', pun: 'shadows..' },
        { name: 'ASTRA', icon: 'assets/img/agent-astra.png', role: 'controller', pun: 'are you ready..' },
        { name: 'CYPHER', icon: 'assets/img/agent-cypher.png', role: 'sentinel', pun: 'where are you..' },
        { name: 'CHAMBER', icon: 'assets/img/agent-chamber.png', role: 'sentinel', pun: 'you want to play lets play..' },
        { name: 'WILLING TO LEARN MORE', icon: '', role: '', pun: 'only if you are willing to get carried.' }
      ];
      const gunGrid = $('#gunGrid');
      if (gunGrid) {
        gunGrid.innerHTML = GUNS.map((g) =>
          '<div class="gun-card">'
          +          '<div class="gun-card__skin"><img src="' + g.skinImg + '" alt="' + esc(g.skin) + '" title="' + esc(g.skin) + '" loading="lazy" decoding="async" width="' + g.sw + '" height="' + g.sh + '"' + (g.tint ? ' style="filter:' + g.tint + '"' : '') + ' /></div>'
          + '<div class="gun-card__head"><img src="' + g.img + '" alt="' + g.name + '" loading="lazy" decoding="async" width="' + g.w + '" height="' + g.h + '" />'
          + '<div><h4>' + g.name + '</h4></div></div>'
          + '<div class="gun-card__stats">'
          + '<div><b>' + g.kills + '</b><span>kills</span></div>'
          + '<div><b>' + g.hs + '</b><span>headshot %</span></div>'
          + '<div><b>' + g.dmg + '</b><span>dmg / round</span></div>'
          + '</div>'
          + '</div>').join('');
      }
      const agentGrid = $('#agentGrid');
      if (agentGrid) {
        agentGrid.innerHTML = AGENTS.map((a) =>
          '<div class="agent-card">'
          + (a.icon ? '<img class="agent-card__icon" src="' + a.icon + '" alt="' + a.name + '" loading="lazy" decoding="async" width="160" height="160" />' : '<div class="agent-card__icon" style="display:grid;place-items:center;font-size:30px;">?</div>')
          + '<div class="agent-card__body"><h4>' + a.name + '</h4>' + (a.role ? '<span>' + a.role + '</span>' : '')
          + '<p class="agent-card__pun">' + a.pun + '</p>'
          + '</div>'
          + '</div>').join('');
      }

      /* ============ scroll extras: word reveals, staggered cards, the rail ============
         four quiet scroll behaviours (none of them loop, none of them block scroll):
         the two section headings lift in word by word out of a mask, the loadout
         cards/chips fade up in a stagger, a hairline draws across each panel as it
         arrives, and a 1px rail at the top of the page reads how far down you are. */
      (() => {
        /* one observer, one reveal class: whatever scrolls in, gets revealed once.
           the top < 0 check catches the jump case (anchor link / End key) where an
           element goes from below the fold to above it without ever intersecting -
           without it, a skipped block would stay invisible forever. */
        const revealer = new IntersectionObserver((entries) => {
          entries.forEach((en) => {
            if (!en.isIntersecting && en.boundingClientRect.top >= 0) return;
            en.target.classList.add(en.target.classList.contains('w-host') ? 'is-revealed' : 'is-visible');
            revealer.unobserve(en.target);
          });
        }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

        /* words: wrap every text node run in <span class="w"><i>word</i></span>, recursing
           through child elements so inline markup (.accent) survives untouched */
        const splitWords = (root) => {
          let n = 0;
          const walk = (node) => {
            Array.from(node.childNodes).forEach((kid) => {
              if (kid.nodeType === 3) {
                const frag = document.createDocumentFragment();
                kid.nodeValue.split(/(\s+)/).forEach((part) => {
                  if (!part) return;
                  if (!part.trim()) { frag.appendChild(document.createTextNode(part)); return; }
                  const box = document.createElement('span');
                  box.className = 'w';
                  const word = document.createElement('i');
                  word.style.setProperty('--i', n++);
                  word.textContent = part;
                  box.appendChild(word);
                  frag.appendChild(box);
                });
                node.replaceChild(frag, kid);
              } else if (kid.nodeType === 1 && kid.tagName !== 'IMG') {
                /* an element that paints its own background (the metallic .accent) is
                   atomic: the gradient is clipped to the text, so a word sliding
                   inside it would drag the fill around and read as a glitch. the whole
                   accent run animates as one word instead, gradient travelling with it. */
                const cs = getComputedStyle(kid);
                const painted = cs.backgroundImage !== 'none'
                  || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent');
                if (painted) {
                  const box = document.createElement('span');
                  box.className = 'w';
                  const inner = document.createElement('i');
                  inner.style.setProperty('--i', n++);
                  box.appendChild(inner);
                  /* replaceChild puts the finished box exactly where the element was
                     (appendChild would drop it at the end and scramble the line) */
                  node.replaceChild(box, kid);
                  /* the accent runs carry their own leading/trailing space (" a
                     nutshell."). inside an inline-block that space collapses away and
                     the word welds itself to the one before it, so park it outside. */
                  if (!kid.children.length) {
                    const lead = (kid.textContent.match(/^\s+/) || [''])[0];
                    const trail = (kid.textContent.match(/\s+$/) || [''])[0];
                    if (lead) box.before(document.createTextNode(lead));
                    if (trail) box.after(document.createTextNode(trail));
                    if (lead || trail) kid.textContent = kid.textContent.trim();
                  }
                  inner.appendChild(kid);
                } else {
                  walk(kid);
                }
              }
            });
          };
          walk(root);
        };

        document.querySelectorAll('.section__title').forEach((title) => {
          title.classList.add('w-host');
          splitWords(title);
          if (reducedMotion) title.classList.add('is-revealed');
          else revealer.observe(title);
        });

        /* the stagger is set per card/chip, so they arrive like a deck being dealt */
        document.querySelectorAll('#gunGrid .gun-card, #agentGrid .agent-card, .about__chips li').forEach((el, i) => {
          el.classList.add('fade-in');
          el.style.setProperty('--d', (i % 6) * 0.07 + 's');
          if (reducedMotion) el.classList.add('is-visible');
          else revealer.observe(el);
        });


      })();

      /* ============ react-bits "tech text": letters turn into dashed vector paths
         under the cursor, and any letter can be grabbed and springs back home. ============ */
      function initTechText(container, canvas) {
        if (!container || !canvas) return;
        const ctx = canvas.getContext('2d');
        const scratch = document.createElement('canvas');
        const scratchCtx = scratch.getContext('2d');
        if (!ctx || !scratchCtx) return;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const LABEL_FONT = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        const FALLOFF_STEPS = 8;
        const SPRING = 320;
        const DAMPING = 22;
        const s = {
          text: 'kixot', fontFamily: '', fontWeight: 800, fontSize: 150,
          letterSpacing: 0.02, color: '#ffffff', accentColor: '#ffffff',
          reach: 200, softness: 0.7, dashLength: 4, dashGap: 2, strokeWidth: 1.5,
          lineStyle: 'dashed', reveal: 'letter', specks: 15, selection: true,
          labels: true, draggable: true, sweep: true, speed: 1
        };
        const approach = (current, target, dt, seconds) => current + (target - current) * (1 - Math.exp(-dt / seconds));
        const hexToRgb = (hex) => {
          let h = String(hex || '').replace('#', '');
          if (h.length === 3) h = h.replace(/./g, (c) => c + c);
          const n = parseInt(h.slice(0, 6), 16);
          return Number.isNaN(n) ? [255, 255, 255] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        };
        const rgba = (hex, alpha) => {
          const c = hexToRgb(hex);
          return 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', ' + alpha + ')';
        };
        const noise = (...values) => {
          let h = 2166136261;
          for (const value of values) {
            h = Math.imul(h ^ (value | 0), 16777619);
            h ^= h >>> 13;
            h = Math.imul(h, 0x5bd1e995);
            h ^= h >>> 15;
          }
          return (h >>> 0) / 4294967296;
        };
        const signed = (value) => (value > 0 ? '+' + value : value < 0 ? '\u2212' + (-value) : '0');
        let width = 1, height = 1, fitW = 1, fitH = 1, dpr = 1, raf = 0;
        let last = performance.now(), visible = true, alive = true, layoutKey = '', requestedFont = '';
        let word = null, glyphs = [], presence = 0, clock = 0, pulse = 0, placed = false, dragging = -1;
        const pointer = { x: 0, y: 0, inside: false };
        const grab = { x: 0, y: 0 };
        const lens = { x: 0, y: 0 };
        const frame = { x1: 0, y1: 0, x2: 0, y2: 0, alpha: 0, index: -1 };
        const family = (o) => o.fontFamily || getComputedStyle(container).fontFamily || 'sans-serif';
        const fontFor = (o, size) => o.fontWeight + ' ' + size + 'px ' + family(o);
        const setFont = (target, o, size) => {
          target.font = fontFor(o, size);
          if ('letterSpacing' in target) target.letterSpacing = (o.letterSpacing * size) + 'px';
          target.textAlign = 'left';
          target.textBaseline = 'alphabetic';
        };
        const sprite = (o, view, glyph, stroke) => {
          const pad = Math.ceil(o.strokeWidth * 2 + 4);
          const left = glyph.box.x1 - pad;
          const top = glyph.box.y1 - pad;
          const w = glyph.box.x2 - glyph.box.x1 + pad * 2;
          const h = glyph.box.y2 - glyph.box.y1 + pad * 2;
          const image = document.createElement('canvas');
          image.width = Math.max(1, Math.ceil(w * dpr));
          image.height = Math.max(1, Math.ceil(h * dpr));
          const c = image.getContext('2d');
          if (!c) return { image, left, top };
          c.setTransform(dpr, 0, 0, dpr, -left * dpr, -top * dpr);
          setFont(c, o, view.size);
          if (stroke) {
            c.lineJoin = 'round';
            c.lineWidth = o.strokeWidth * 2;
            c.lineCap = 'butt';
            c.strokeStyle = o.color;
            if (o.lineStyle !== 'solid') c.setLineDash([Math.max(1, o.dashLength), Math.max(1, o.dashGap)]);
            c.strokeText(glyph.char, glyph.x, view.baseline);
            c.setLineDash([]);
            c.globalCompositeOperation = 'destination-out';
            c.fillStyle = '#000000';
            c.fillText(glyph.char, glyph.x, view.baseline);
            c.globalCompositeOperation = 'source-over';
          } else {
            c.fillStyle = o.color;
            c.fillText(glyph.char, glyph.x, view.baseline);
          }
          return { image, left, top };
        };
        const ensureLayout = (o) => {
          const key = [o.text, family(o), o.fontWeight, o.fontSize, o.letterSpacing, o.color, o.dashLength, o.dashGap, o.strokeWidth, o.lineStyle, width, height, fitW, fitH, dpr].join('|');
          if (key === layoutKey && word) return word;
          layoutKey = key;
          const wanted = fontFor(o, 64);
          if (document.fonts && wanted !== requestedFont) {
            requestedFont = wanted;
            document.fonts.load(wanted, o.text).then(refreshFonts, refreshFonts);
          }
          const probe = scratchCtx;
          setFont(probe, o, o.fontSize);
          let m = probe.measureText(o.text);
          const fit = Math.min(1, (fitW * 0.9) / Math.max(m.actualBoundingBoxLeft + m.actualBoundingBoxRight, 1), (fitH * 0.66) / Math.max(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, 1));
          const size = o.fontSize * fit;
          setFont(probe, o, size);
          m = probe.measureText(o.text);
          const inkWidth = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
          const inkHeight = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
          const x = (width - inkWidth) / 2 + m.actualBoundingBoxLeft;
          const baseline = (height - inkHeight) / 2 + m.actualBoundingBoxAscent;
          const next = {
            size, baseline,
            left: x - m.actualBoundingBoxLeft,
            right: x + m.actualBoundingBoxRight,
            top: baseline - m.actualBoundingBoxAscent,
            bottom: baseline + m.actualBoundingBoxDescent
          };
          word = next;
          const chars = Array.from(o.text);
          const previous = glyphs;
          glyphs = [];
          let prefix = '';
          chars.forEach((char, i) => {
            prefix += char;
            const own = probe.measureText(char);
            const gx = x + probe.measureText(prefix).width - own.width;
            if (!char.trim()) return;
            const base = {
              char, x: gx,
              box: {
                x1: gx - own.actualBoundingBoxLeft,
                y1: baseline - own.actualBoundingBoxAscent,
                x2: gx + own.actualBoundingBoxRight,
                y2: baseline + own.actualBoundingBoxDescent
              }
            };
            const kept = previous[glyphs.length];
            glyphs.push({
              ...base,
              offset: kept && kept.char === char ? kept.offset : { x: 0, y: 0 },
              velocity: { x: 0, y: 0 },
              outline: 0,
              index: i,
              fill: sprite(o, next, base, false),
              dashes: sprite(o, next, base, true)
            });
          });
          dragging = -1;
          frame.index = -1;
          return next;
        };
        const glyphAt = (x, y) => {
          if (!word || y < word.top - 24 || y > word.bottom + 24) return -1;
          let best = -1, bestDistance = Infinity;
          glyphs.forEach((glyph, i) => {
            const x1 = glyph.box.x1 + glyph.offset.x;
            const x2 = glyph.box.x2 + glyph.offset.x;
            const d = x < x1 ? x1 - x : x > x2 ? x - x2 : 0;
            if (d < bestDistance) { bestDistance = d; best = i; }
          });
          return bestDistance < 28 ? best : -1;
        };
        const falloff = (target, cx, cy, radius, strength, softness) => {
          const inner = Math.min(1, Math.max(0, 1 - softness));
          const gradient = target.createRadialGradient(cx, cy, 0, cx, cy, radius);
          gradient.addColorStop(0, 'rgba(0, 0, 0, ' + strength + ')');
          for (let i = 0; i <= FALLOFF_STEPS; i++) {
            const t = i / FALLOFF_STEPS;
            const eased = t * t * (3 - 2 * t);
            gradient.addColorStop(Math.min(1, inner + (1 - inner) * t), 'rgba(0, 0, 0, ' + (strength * (1 - eased)) + ')');
          }
          return gradient;
        };
        const blit = (target, art, dx, dy, originX, originY) => {
          target.drawImage(art.image, Math.round((art.left + dx) * dpr - originX), Math.round((art.top + dy) * dpr - originY));
        };
        const drawReveal = (o) => {
          const radius = o.reach * dpr;
          const cx = lens.x * dpr;
          const cy = lens.y * dpr;
          ctx.globalCompositeOperation = 'destination-out';
          ctx.fillStyle = falloff(ctx, cx, cy, radius, presence, o.softness);
          ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
          ctx.globalCompositeOperation = 'source-over';
          const x0 = Math.max(0, Math.floor(cx - radius));
          const y0 = Math.max(0, Math.floor(cy - radius));
          const x1 = Math.min(canvas.width, Math.ceil(cx + radius));
          const y1 = Math.min(canvas.height, Math.ceil(cy + radius));
          if (x1 <= x0 || y1 <= y0) return;
          const w = x1 - x0;
          const h = y1 - y0;
          if (scratch.width < w || scratch.height < h) {
            scratch.width = Math.max(scratch.width, w);
            scratch.height = Math.max(scratch.height, h);
          }
          scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
          scratchCtx.globalCompositeOperation = 'source-over';
          scratchCtx.clearRect(0, 0, w, h);
          for (const glyph of glyphs) blit(scratchCtx, glyph.dashes, glyph.offset.x, glyph.offset.y, x0, y0);
          scratchCtx.globalCompositeOperation = 'destination-in';
          scratchCtx.fillStyle = falloff(scratchCtx, cx - x0, cy - y0, radius, 1, o.softness);
          scratchCtx.fillRect(0, 0, w, h);
          scratchCtx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = presence;
          ctx.drawImage(scratch, 0, 0, w, h, x0, y0, w, h);
          ctx.globalAlpha = 1;
        };
        const crisp = (value) => (Math.round(value * dpr) + 0.5) / dpr;
        const perimeterPoint = (distance, w, h) => {
          let d = ((distance % (2 * (w + h))) + 2 * (w + h)) % (2 * (w + h));
          if (d < w) return [frame.x1 + d, frame.y1, 0, -1];
          d -= w;
          if (d < h) return [frame.x2, frame.y1 + d, 1, 0];
          d -= h;
          if (d < w) return [frame.x2 - d, frame.y2, 0, 1];
          d -= w;
          return [frame.x1, frame.y2 - d, -1, 0];
        };
        const drawSpecks = (o, a) => {
          const w = frame.x2 - frame.x1;
          const h = frame.y2 - frame.y1;
          if (w < 2 || h < 2) return;
          const perimeter = 2 * (w + h);
          const seed = frame.index + 1;
          const grid = 3;
          for (let k = 0; k < o.specks; k++) {
            const period = 0.5 + noise(seed, k, 11) * 1.2;
            const t = pulse / period + noise(seed, k, 17);
            const cycle = Math.floor(t);
            const life = t - cycle;
            if (life > 0.7) continue;
            const p = perimeterPoint(noise(seed, k, cycle) * perimeter, w, h);
            const pick = noise(seed, k, cycle, 2);
            const size = pick < 0.46 ? 2 : pick < 0.7 ? 3 : pick < 0.84 ? 5 : pick < 0.94 ? 8 : 11;
            const large = size >= 8;
            const out = (large ? 9 : 4) + Math.floor(noise(seed, k, cycle, 1) * 5) * grid;
            const x = frame.x1 + Math.round((p[0] + p[2] * out - frame.x1) / grid) * grid;
            const y = frame.y1 + Math.round((p[1] + p[3] * out - frame.y1) / grid) * grid;
            const tone = noise(seed, k, cycle, 3);
            const blink = life < 0.06 || (life > 0.32 && life < 0.36) ? 0.35 : 1;
            const alpha = a * (large ? 0.3 + 0.4 * tone : 0.3 + 0.6 * tone) * blink;
            const left = Math.round(x - size / 2);
            const top = Math.round(y - size / 2);
            if (tone < 0.26 || (large && tone < 0.78)) {
              ctx.strokeStyle = rgba(o.accentColor, alpha);
              ctx.strokeRect(left + 0.5, top + 0.5, size, size);
            } else {
              ctx.fillStyle = rgba(o.accentColor, alpha);
              ctx.fillRect(left, top, size, size);
            }
          }
        };
        const drawFrame = (o) => {
          const glyph = glyphs[frame.index];
          if (!glyph || frame.alpha < 0.01) return;
          const a = frame.alpha;
          const x1 = crisp(frame.x1), y1 = crisp(frame.y1), x2 = crisp(frame.x2), y2 = crisp(frame.y2);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          const moved = Math.hypot(glyph.offset.x, glyph.offset.y);
          if (moved > 1) {
            const hx = (glyph.box.x1 + glyph.box.x2) / 2;
            const hy = (glyph.box.y1 + glyph.box.y2) / 2;
            ctx.beginPath();
            ctx.moveTo(hx, hy);
            ctx.lineTo(hx + glyph.offset.x, hy + glyph.offset.y);
            ctx.setLineDash([3, 4]);
            ctx.lineWidth = 1;
            ctx.strokeStyle = rgba(o.accentColor, 0.45 * a);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.rect(Math.round(hx) - 2, Math.round(hy) - 2, 4, 4);
            ctx.fillStyle = rgba(o.accentColor, 0.7 * a);
            ctx.fill();
          }
          ctx.beginPath();
          ctx.rect(x1, y1, x2 - x1, y2 - y1);
          ctx.lineWidth = 1;
          ctx.strokeStyle = rgba(o.accentColor, 0.5 * a);
          ctx.stroke();
          ctx.beginPath();
          for (const corner of [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]) {
            ctx.rect(Math.round(corner[0]) - 2, Math.round(corner[1]) - 2, 5, 5);
          }
          ctx.fillStyle = rgba(o.accentColor, 0.95 * a);
          ctx.fill();
          if (o.specks > 0) { ctx.lineWidth = 1; drawSpecks(o, a); }
          if (!o.labels) return;
          ctx.font = LABEL_FONT;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = rgba(o.accentColor, 0.62 * a);
          const label = moved > 1 ? signed(Math.round(glyph.offset.x)) + ', ' + signed(Math.round(-glyph.offset.y)) : glyph.char + ' ' + Math.round(glyph.box.x2 - glyph.box.x1) + ' x ' + Math.round(glyph.box.y2 - glyph.box.y1);
          ctx.fillText(label, Math.round(frame.x1), Math.round(frame.y1) - 7);
        };
        const tick = (now) => {
          raf = 0;
          const o = s;
          const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
          last = now;
          const view = ensureLayout(o);
          /* the wordmark animates on its own: the lens sweeps the letters even when the
             pointer is nowhere near. hovering/dropping onto a letter hands it control. */
          const hoverGlyph = pointer.inside ? glyphAt(pointer.x, pointer.y) : -1;
          const sweeping = o.sweep && !reducedMotion && dragging < 0 && hoverGlyph < 0;
          if (sweeping) clock += dt * o.speed;
          pulse += dt;
          let targetX = pointer.x, targetY = pointer.y;
          if (sweeping) {
            targetX = view.left + (view.right - view.left) * (0.5 - 0.5 * Math.cos(clock * 0.45));
            targetY = view.top + (view.bottom - view.top) * (0.45 + 0.1 * Math.sin(clock * 0.8));
          }
          const active = pointer.inside || sweeping || dragging >= 0;
          if (active && !placed) { lens.x = targetX; lens.y = targetY; }
          if (active) {
            const lag = pointer.inside ? 0.05 : 0.22;
            lens.x = approach(lens.x, targetX, dt, lag);
            lens.y = approach(lens.y, targetY, dt, lag);
          }
          placed = active;
          presence = approach(presence, o.reveal === 'area' && active && dragging < 0 ? 1 : 0, dt, 0.16);
          let moving = false;
          glyphs.forEach((glyph, i) => {
            if (i === dragging) {
              glyph.offset.x = approach(glyph.offset.x, pointer.x - grab.x, dt, 0.03);
              glyph.offset.y = approach(glyph.offset.y, pointer.y - grab.y, dt, 0.03);
              glyph.velocity.x = 0; glyph.velocity.y = 0;
              moving = true;
              return;
            }
            const off = glyph.offset, vel = glyph.velocity;
            if (Math.abs(off.x) < 0.05 && Math.abs(off.y) < 0.05 && Math.hypot(vel.x, vel.y) < 0.5) {
              off.x = 0; off.y = 0; vel.x = 0; vel.y = 0;
              return;
            }
            vel.x += (-SPRING * off.x - DAMPING * vel.x) * dt;
            vel.y += (-SPRING * off.y - DAMPING * vel.y) * dt;
            off.x += vel.x * dt;
            off.y += vel.y * dt;
            moving = true;
          });
          const focus = dragging >= 0 ? dragging : active ? glyphAt(lens.x, lens.y) : -1;
          if (focus >= 0 && o.selection) {
            const glyph = glyphs[focus];
            const bx1 = glyph.box.x1 + glyph.offset.x - 6;
            const by1 = glyph.box.y1 + glyph.offset.y - 6;
            const bx2 = glyph.box.x2 + glyph.offset.x + 6;
            const by2 = glyph.box.y2 + glyph.offset.y + 6;
            if (frame.index < 0 || frame.alpha < 0.02) { frame.x1 = bx1; frame.y1 = by1; frame.x2 = bx2; frame.y2 = by2; }
            const glide = focus === dragging ? 0.02 : 0.08;
            frame.x1 = approach(frame.x1, bx1, dt, glide);
            frame.y1 = approach(frame.y1, by1, dt, glide);
            frame.x2 = approach(frame.x2, bx2, dt, glide);
            frame.y2 = approach(frame.y2, by2, dt, glide);
            frame.index = focus;
          }
          frame.alpha = approach(frame.alpha, focus >= 0 && o.selection ? 1 : 0, dt, 0.1);
          glyphs.forEach((glyph, i) => {
            const target = o.reveal === 'letter' && i === focus && i !== dragging ? 1 : 0;
            glyph.outline = approach(glyph.outline, target, dt, 0.09);
            if (Math.abs(glyph.outline - target) > 0.002) moving = true;
            else glyph.outline = target;
          });
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalCompositeOperation = 'source-over';
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          for (const glyph of glyphs) {
            const moved = Math.hypot(glyph.offset.x, glyph.offset.y);
            if (moved > 1) {
              ctx.globalAlpha = Math.min(1, moved / 24) * 0.55;
              blit(ctx, glyph.dashes, 0, 0, 0, 0);
              ctx.globalAlpha = 1;
            }
          }
          for (const glyph of glyphs) {
            if (glyph.outline < 0.999) {
              ctx.globalAlpha = 1 - glyph.outline;
              blit(ctx, glyph.fill, glyph.offset.x, glyph.offset.y, 0, 0);
            }
            if (glyph.outline > 0.001) {
              ctx.globalAlpha = glyph.outline;
              blit(ctx, glyph.dashes, glyph.offset.x, glyph.offset.y, 0, 0);
            }
            ctx.globalAlpha = 1;
          }
          if (presence > 0.001) drawReveal(o);
          drawFrame(o);
          const settling = moving || Math.abs(presence - (o.reveal === 'area' && active && dragging < 0 ? 1 : 0)) > 0.002 || (frame.alpha > 0.01 && frame.alpha < 0.99);
          if ((active || settling) && visible && alive && !document.hidden) raf = requestAnimationFrame(tick);
        };
        const wake = () => {
          if (raf || !visible || !alive || document.hidden) return;
          last = performance.now();
          raf = requestAnimationFrame(tick);
        };
        const refreshFonts = () => { layoutKey = ''; wake(); };
        const resize = () => {
          /* the canvas is bigger than the visible title: the word is fitted to the
             visible box but drawn centred in the larger canvas, so a dragged letter
             keeps going well past the wordmark before it reaches the edge */
          width = Math.max(1, canvas.clientWidth);
          height = Math.max(1, canvas.clientHeight);
          fitW = Math.max(1, container.clientWidth);
          fitH = Math.max(1, container.clientHeight);
          dpr = Math.min(window.devicePixelRatio || 1, matchMedia('(max-width: 768px), (pointer: coarse)').matches ? 1.25 : 2);
          canvas.width = Math.round(width * dpr);
          canvas.height = Math.round(height * dpr);
          layoutKey = '';
          wake();
        };
        const locate = (e) => {
          const rect = canvas.getBoundingClientRect();
          pointer.x = e.clientX - rect.left;
          pointer.y = e.clientY - rect.top;
          pointer.inside = pointer.x >= 0 && pointer.x <= rect.width && pointer.y >= 0 && pointer.y <= rect.height;
        };
        const onMove = (e) => { locate(e); wake(); };
        const onDown = (e) => {
          locate(e);
          if (s.draggable && (e.pointerType !== 'mouse' || e.button === 0)) {
            const index = glyphAt(pointer.x, pointer.y);
            if (index >= 0) {
              dragging = index;
              grab.x = pointer.x - glyphs[index].offset.x;
              grab.y = pointer.y - glyphs[index].offset.y;
            }
          }
          wake();
        };
        const onUp = () => {
          if (dragging >= 0) dragging = -1;
          wake();
        };
        /* listeners on the window so a letter can be dragged anywhere over the page,
           even outside the wordmark (the canvas itself ignores pointer events) */
        window.addEventListener('pointermove', onMove, { passive: true });
        window.addEventListener('pointerdown', onDown, { passive: true });
        window.addEventListener('pointerup', onUp, { passive: true });
        window.addEventListener('pointercancel', onUp, { passive: true });
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
          else wake();
        });
        new ResizeObserver(resize).observe(container);
        new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; wake(); }).observe(container);
        if (document.fonts) document.fonts.ready.then(refreshFonts, refreshFonts);
        resize();
        return { setText: (t) => { s.text = t; layoutKey = ''; wake(); } };
      }
    })();
  