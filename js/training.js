
    (() => {
      'use strict';

      const $ = (s) => document.querySelector(s);
      const TIER = 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04';
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (!reducedMotion) {
        window.addEventListener('pointerdown', (e) => {
          if (document.pointerLockElement) return; /* mid-run the crosshair shoots, no sparks */
          for (let i = 0; i < 7; i++) {
            const s = document.createElement('span');
            s.className = 'spark';
            const ang = Math.random() * Math.PI * 2;
            const dist = 22 + Math.random() * 30;
            s.style.left = e.clientX + 'px';
            s.style.top = e.clientY + 'px';
            s.style.setProperty('--sx', Math.cos(ang) * dist + 'px');
            s.style.setProperty('--sy', Math.sin(ang) * dist + 'px');
            /* fullscreen only renders the shell's subtree - park sparks there too */
            (document.fullscreenElement || document.body).appendChild(s);
            setTimeout(() => s.remove(), 550);
          }
        }, { passive: true });
      }

      /* ============ fullscreen: available at all times on the range ============ */
      /* Fullscreen keeps the active range and its cursor in the same subtree. */
      let escWantsFullscreen = false; /* see the fullscreenchange handler below */
      const fsTarget = document.querySelector('.range-shell') || document.documentElement;
      const fsButtons = [document.getElementById('ovFs')].filter(Boolean);
      /* esc inside fullscreen is the browser's to take: it drops fullscreen before we
         ever see the key. we want the opposite - pause, stay big - so we flag the
         intent on keydown and then put the range straight back into fullscreen.
         the flag is consumed by exactly one fullscreenchange. */
      if (fsTarget.requestFullscreen && fsButtons.length) {
        const enterFs = () => {
          const p = fsTarget.requestFullscreen({ navigationUI: 'hide' });
          if (p && p.catch) p.catch(() => {
            try {
              const retry = fsTarget.requestFullscreen();
              if (retry && retry.catch) retry.catch(() => {});
            } catch (e) {}
          });
        };
        const exitFs = () => { if (document.fullscreenElement) document.exitFullscreen(); };
        const toggleFs = () => {
          escWantsFullscreen = false;
          if (document.fullscreenElement) exitFs();
          else enterFs();
        };
        fsButtons.forEach((b) => b.addEventListener('click', toggleFs));
        document.addEventListener('fullscreenchange', () => {
          const on = !!document.fullscreenElement;
          fsButtons.forEach((b) => { b.textContent = on ? 'exit fullscreen' : 'fullscreen aim'; });
          /* Shared cursor moves into the fullscreen subtree. */
          setTimeout(() => { sizeRange(); resizeXhLayer(); }, 120);
          if (escWantsFullscreen && !on) {
            escWantsFullscreen = false;
            /* the browser dropped fullscreen for our pause esc - take it back so the
               player stays fullscreen; the pause menu is already up */
            enterFs();
            return;
          }
          if (!on && (playing || counting) && !paused) {
            pauseRun();
          }
        });
        window.__fsExit = exitFs;
        window.__fsState = () => document.fullscreenElement;
      } else fsButtons.forEach((b) => b.remove());

      /* no page transition any more: every data-nav link just navigates. */

      /* ================= data ================= */
      const RANKS = [
        { id: 'iron', label: 'Iron', tier: 5, n: 'baby steps', base: 0 },
        { id: 'bronze', label: 'Bronze', tier: 8, n: 'getting better', base: 0 },
        { id: 'silver', label: 'Silver', tier: 11, n: 'not bad', base: 0 },
        { id: 'gold', label: 'Gold', tier: 14, n: 'the classic', base: 1 },
        { id: 'plat', label: 'Platinum', tier: 17, n: 'respectable', base: 1 },
        { id: 'diamond', label: 'Diamond', tier: 20, n: 'ego arc', base: 2 },
        { id: 'asc', label: 'Ascendant', tier: 23, n: 'getting serious', base: 2 },
        { id: 'imm', label: 'Immortal', tier: 26, n: 'like me', base: 3 },
        { id: 'rad', label: 'Radiant', tier: 27, n: 'why are you here 💀', base: 3 }
      ];

      const DIFFS = [
        { id: 0, label: 'Iron lobby warmup', short: 'rookie', desc: 'giant targets, zero stress. pure warmup vibes.', size: 1.5, respawn: 0.5, pts: 60, track: 0.65, medal: 'pat on the head difficulty' },
        { id: 1, label: 'Ranked lobby', short: 'ranked', desc: 'the standard grind. honest targets, honest times.', size: 1.0, respawn: 1.0, pts: 100, track: 1.0, medal: 'the classic ranked feel' },
        { id: 2, label: 'Asc lobby', short: 'ascendant', desc: 'small targets, quick swaps. no freebies.', size: 0.72, respawn: 1.4, pts: 150, track: 1.3, medal: 'targets have an ego now' },
        { id: 3, label: 'Radiant trials', short: 'radiant', desc: 'tiny, fast, merciless. good luck champion.', size: 0.52, respawn: 2.0, pts: 220, track: 1.65, medal: 'this diff is genuinely evil' }
      ];

      const BENCH = [
        { min: 15000, tier: 27, name: 'RADIANT', pun: 'OMG ur better than me (nah not really)' },
        { min: 12000, tier: 26, name: 'IMMORTAL', pun: 'ok ok we might be related' },
        { min: 10000, tier: 23, name: 'ASCENDANT', pun: 'certified kixot trainee' },
        { min: 8000, tier: 20, name: 'DIAMOND', pun: 'diamond hands, diamond aim' },
        { min: 6800, tier: 17, name: 'PLATINUM', pun: 'plat patrol reporting for duty' },
        { min: 5600, tier: 14, name: 'GOLD', pun: 'gold. shiny. like my future' },
        { min: 4400, tier: 11, name: 'SILVER', pun: 'aim still buffering' },
        { min: 2400, tier: 8, name: 'BRONZE', pun: 'bronze is just iron with confidence' },
        { min: -1, tier: 5, name: 'IRON', pun: 'the targets send their regards' }
      ];
      /* per-run benchmarks: flick + precision use the full rank ladder on solo runs.
         tracking is hold-scored (140/sec, 30s cap ~4.2k) so it gets its own honest ladder. */
      const BENCH_TRACK = [
        { min: 2500, tier: 27, name: 'RADIANT', pun: BENCH[0].pun },
        { min: 2000, tier: 26, name: 'IMMORTAL', pun: BENCH[1].pun },
        { min: 1600, tier: 23, name: 'ASCENDANT', pun: BENCH[2].pun },
        { min: 1300, tier: 20, name: 'DIAMOND', pun: BENCH[3].pun },
        { min: 1100, tier: 17, name: 'PLATINUM', pun: BENCH[4].pun },
        { min: 900, tier: 14, name: 'GOLD', pun: BENCH[5].pun },
        { min: 650, tier: 11, name: 'SILVER', pun: BENCH[6].pun },
        { min: 300, tier: 8, name: 'BRONZE', pun: BENCH[7].pun },
        { min: -1, tier: 5, name: 'IRON', pun: BENCH[8].pun }
      ];
      const runBenchFor = (m) => (m === 'track' ? BENCH_TRACK : BENCH);

      const GOALS = [
        { id: 'flicks', label: 'Flicks' },
        { id: 'precision', label: 'Precision' },
        { id: 'tracking', label: 'Tracking' },
        { id: 'sens', label: 'Sens / aim feel' },
        { id: 'consistency', label: 'Consistency' }
      ];
      const DIFF_CHOICE = [
        { id: -1, label: 'easier than my rank' },
        { id: 0, label: 'exactly my rank level' },
        { id: 1, label: 'harder than my rank' }
      ];
      const HOURS = ['0 to 5', '5 to 15', '15 to 30', '30+'];
      const SENSFEEL = ['too fast', 'just right', 'too slow', 'no idea'];

      const answers = { rank: null, goals: new Set(), diffChoice: 0, hours: null, sens: null };
      let diff = DIFFS[1];
      let session = null; // { list: [{mode,label,set,n}], idx, count, guided: bool }
      let hasPlan = false;

      const rankBase = () => (RANKS.find((r) => r.id === answers.rank) || { base: 1 }).base;
      const applyDifficulty = () => {
        const want = Math.max(0, Math.min(DIFFS.length - 1, rankBase() + (answers.diffChoice || 0)));
        diff = DIFFS[want];
        document.querySelectorAll('#optDiffLive .opt').forEach((b) =>
          b.classList.toggle('is-on', +b.dataset.v === want));
      };

      const buildOpts = (el, items, multi, onPick) => {
        items.forEach((it) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'opt';
          if (typeof it === 'string') { b.textContent = it; b.dataset.v = it; }
          else {
            b.innerHTML = (it.tier ? '<img src="' + TIER + '/' + it.tier + '/smallicon.png" alt="" width="256" height="256" fetchpriority="low" decoding="async" />' : '') +
              it.label + (it.n ? ' <span style="opacity:.82">' + it.n + '</span>' : '');
            b.dataset.v = it.id;
          }
          b.addEventListener('click', () => {
            if (multi) { b.classList.toggle('is-on'); }
            else { el.querySelectorAll('.opt').forEach((o) => o.classList.remove('is-on')); b.classList.add('is-on'); }
            onPick(b);
          });
          el.appendChild(b);
        });
      };

      const refreshSurvey = () => {
        const ok = answers.rank && answers.hours && answers.sens && answers.goals.size > 0;
        $('#btnPlan').disabled = !ok;
        $('#surveyHint').textContent = ok ? 'locked in'
          : (!answers.rank ? 'pick a rank to start'
          : answers.goals.size === 0 ? 'now pick at least one goal'
          : (!answers.hours || !answers.sens) ? 'almost there' : '');
      };

      buildOpts($('#qRank'), RANKS, false, (b) => { answers.rank = b.dataset.v; applyDifficulty(); refreshSurvey(); });
      buildOpts($('#qGoal'), GOALS, true, () => {
        answers.goals.clear();
        $('#qGoal').querySelectorAll('.opt.is-on').forEach((o) => answers.goals.add(o.dataset.v));
        refreshSurvey();
      });
      buildOpts($('#qDiff'), DIFF_CHOICE, false, (b) => { answers.diffChoice = +b.dataset.v; applyDifficulty(); refreshSurvey(); });
      buildOpts($('#qHours'), HOURS, false, (b) => { answers.hours = b.dataset.v; refreshSurvey(); });
      buildOpts($('#qSens'), SENSFEEL, false, (b) => { answers.sens = b.dataset.v; refreshSurvey(); });

      buildOpts($('#optDiffLive'), DIFFS.map((d) => ({ id: d.id, label: d.label })), false, (b) => {
        diff = DIFFS[+b.dataset.v];
        if (!playing && !paused && scene) { clearTargets(); for (let i = 0; i < MODES[mode].field; i++) spawnTarget(); }
      });

      /* ================= plan + session ================= */
      const PLAN_LIBRARY = {
        flicks: { name: 'Flick discipline', tag: 'flick range', desc: '2 flick runs daily. turn, click, dont think. thinking is for controllers.' },
        precision: { name: 'Micro precision', tag: 'precision range', desc: 'small targets, slow is smooth, smooth is fast. 2 runs minimum.' },
        tracking: { name: 'Tracking', tag: 'tracking range', desc: 'chase the bot and never let go. 3 runs. glue hands by friday.' },
        sens: { name: 'Sens calibration', tag: 'settings' },
        consistency: { name: 'Consistency', tag: 'any mode', desc: 'same mode, same time, every day. the report card will snitch on you.' }
      };
      /* guided workout steps per goal: mode + how many runs */
      const WORKOUT = {
        flicks: { mode: 'flick', runs: 2 },
        precision: { mode: 'precision', runs: 2 },
        tracking: { mode: 'track', runs: 3 },
        sens: { mode: 'flick', runs: 1 },
        consistency: { mode: 'precision', runs: 1 }
      };

      /* plain-english name for a mode, used everywhere the guide talks about itself */
      const modeLabel = (m) => ({ flick: 'flick', precision: 'precision', track: 'tracking' }[m] || m);
      /* the guide names its picks and nothing more: "2 flick runs and 3 tracking runs".
         no dashes, no pep talks, just the counts */
      const describeWorkout = (list) => {
        const parts = list.map((s) => s.runs + ' ' + modeLabel(s.mode) + ' run' + (s.runs === 1 ? '' : 's'));
        if (parts.length <= 1) return parts[0] || '';
        return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
      };

      $('#btnPlan').addEventListener('click', () => {
        hasPlan = true;
        stats = { flick: null, precision: null, track: null };
        $('#btnResults').disabled = true;
        applyDifficulty();
        const grid = $('#planGrid');
        grid.innerHTML = '';
        [...answers.goals].forEach((g) => {
          const p = PLAN_LIBRARY[g];
          const d = document.createElement('div');
          d.className = 'plan-item';
          d.innerHTML = '<span class="tag">' + p.tag + '</span><h3>' + p.name + '</h3>' + (g === 'sens' ? '' : '<p>' + p.desc + '</p>');
          grid.appendChild(d);
        });
        const base = document.createElement('div');
        base.className = 'plan-item';
        base.innerHTML = '<span class="tag">always</span><h3>Warm up first</h3><p>one flick run, one precision run, then touch grass (optional).</p>';
        grid.appendChild(base);
        const dItem = document.createElement('div');
        dItem.className = 'plan-item';
        dItem.innerHTML = '<span class="tag">difficulty</span><h3>' + diff.label + '</h3><p>' + diff.desc + '</p>';
        grid.appendChild(dItem);

        const rankName = (RANKS.find((r) => r.id === answers.rank) || {}).label || '?';
        const roasts = {
          iron: 'iron to radiant speedrun, any%, no cheats',
          bronze: 'bronze is just iron with confidence.',
          silver: 'silver: where aim goes to hibernate',
          gold: 'gold. the grind is real and so is the suffering.',
          plat: 'plat, the rank of "i almost had it"',
          diamond: 'diamond ego vs diamond aim, fight',
          asc: 'ascendant, aka immortal waiting room.',
          imm: 'immortal crew checking in we train anyway.',
          rad: 'radiant using my trainer? mom come pick me up im famous'
        };
        $('#planRoast').textContent = roasts[answers.rank] || '';

        // build the guided session from the plan
        const list = [];
        [...answers.goals].forEach((g) => {
          const w = WORKOUT[g];
          if (!w) return;
          const existing = list.find((s) => s.mode === w.mode);
          if (existing) existing.runs = Math.min(4, existing.runs + w.runs - 1);
          else list.push({ mode: w.mode, runs: w.runs });
        });
        if (!list.length) list.push({ mode: 'flick', runs: 2 });
        session = { list, idx: 0, count: 0, guided: true, done: false };
        const total = list.reduce((a, s) => a + s.runs, 0);
        /* the guide line spells out the exercises it picked, with counts */
        const gl = $('#guideList');
        if (gl) gl.textContent = describeWorkout(list);

        $('#stepSurvey').classList.add('hidden');
        enterRange(true);
        window.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
      });

      const enterRange = (guided) => {
        if (session) { session.guided = guided; session.idx = 0; session.count = 0; session.done = false; }
        updateSessionBanner();
        /* guided: land on the plan's FIRST exercise. plan says 3× tracking? the range
           opens on TRACKING. never auto flick, the guide owns the order. */
        if (guided && session && session.list && session.list.length) {
          const first = document.querySelector('.mode-btn[data-mode="' + session.list[0].mode + '"]');
          if (first && !first.disabled) first.click();
        }
        $('#stepPlan').classList.add('hidden');
        $('#stepSettings').classList.remove('hidden');
        $('#dojoLauncher').hidden = true;
        $('#btnBackPlan').textContent = 'Back to plan';
        window.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
        setTimeout(() => { sizeRange(); resizeXhLayer(); }, 80);
      };
      $('#btnGuided').addEventListener('click', () => enterRange(true));
      $('#btnFree').addEventListener('click', () => enterRange(false));
      $('#btnRedo').addEventListener('click', () => {
        $('#stepPlan').classList.add('hidden');
        $('#stepSurvey').classList.remove('hidden');
      });
      $('#btnBackPlan').addEventListener('click', () => {
        if (playing || counting) return;
        $('#stepSettings').classList.add('hidden');
        if (hasPlan) $('#stepPlan').classList.remove('hidden');
        else returnToModes();
      });
      $('#btnResults').addEventListener('click', () => {
        $('#stepSettings').classList.add('hidden');
        $('#stepResults').classList.remove('hidden');
        buildResults();
        window.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
      });

      /* locked report card: stays greyed until earned. hovering the wrapper pops the
         right note for the session you picked (guide vs individual). */
      const lockWrap = $('#lockWrap');
      const lockPop = $('#lockPop');
      const btnResultsEl = $('#btnResults');
      if (lockWrap && lockPop && btnResultsEl) {
        const syncLock = () => lockWrap.classList.toggle('is-locked', btnResultsEl.disabled);
        new MutationObserver(syncLock).observe(btnResultsEl, { attributes: true, attributeFilter: ['disabled'] });
        syncLock();
        const fillLockPop = () => {
          lockPop.textContent = (session && session.guided)
            ? 'guided: complete the guide to unlock your report card'
            : 'individual: complete each exercise once to unlock your report card';
        };
        lockWrap.addEventListener('pointerenter', fillLockPop);
        lockWrap.addEventListener('focusin', fillLockPop);
      }

      /* the guide leads, but it never locks anyone out: every mode stays playable.
         an unfinished run keeps its mode, including while paused. the
         player chooses another exercise after the current run ends. */
      const syncModeButtons = () => {
        const busy = playing || counting;
        document.querySelectorAll('#optDiffLive button, #btnQuick, #btnBackPlan').forEach(control => { control.disabled = busy; });
        $('#myProgress').hidden = busy;
        document.querySelector('a[href="#myProgress"]').hidden = busy;
        document.querySelectorAll('.mode-btn').forEach((b) => {
          b.disabled = busy;
        });
      };

      const updateSessionBanner = () => {
        const b = $('#sessionBanner');
        syncModeButtons();
        if (!session || !session.guided) { b.classList.remove('is-on'); return; }
        const step = session.list[session.idx];
        /* the guide leads and names the exercise it picked so the player knows what
           to aim at */
        b.textContent = 'guided · ' + modeLabel(step.mode) + ' run ' + (session.count + 1) + '/' + step.runs + ' · workout ' + (session.idx + 1) + '/' + session.list.length;
        b.classList.add('is-on');
      };

      const sessionAdvance = () => {
        if (!session || !session.guided) return null;
        const step = session.list[session.idx];
        session.count++;
        if (session.count < step.runs) { updateSessionBanner(); return step.mode; }
        session.count = 0;
        session.idx++;
        if (session.idx >= session.list.length) { session.idx = 0; session.done = true; updateSessionBanner(); return 'done'; }
        updateSessionBanner();
        return session.list[session.idx].mode;
      };

      /* ================= settings ================= */
      const settings = { dpi: 800, color: '#ffffff', style: 'cross', outline: false, len: 4, thick: 1, gap: 2, sens: 0.4 };
      /* ---- valorant sens math, exact ----
         valorant turns 0.07 degrees per mouse COUNT per sens point, on raw input.
         with unadjustedMovement (requested above) the browser hands over raw counts
         in movementX - so one count here is one count in valorant. no dpi factor,
         no display scaling, no feel tweaks: same number in, same turn out. */
      const sensitivityMath = window.KixotSensitivity;
      const degPerCount = (sens) => sensitivityMath.degrees(1, sens);
      try {
        const saved = JSON.parse(localStorage.getItem('kixot_sens') || 'null');
        if (saved && (saved.version === undefined || saved.version === 1)) {
          if (Number.isFinite(saved.sens) && saved.sens >= 0.001 && saved.sens <= 10) settings.sens = saved.sens;
          if (Number.isSafeInteger(saved.dpi) && saved.dpi >= 50 && saved.dpi <= 64000) settings.dpi = saved.dpi;
        }
      } catch { /* Keep defaults when settings storage is unavailable or damaged. */ }

      /* one pass paints the whole reticle in a single colour. "outline" = a fat dark
         pass laid down first, so the crosshair stays readable even on a bright target. */
      const paintXh = (g, cx, cy, L, G, dotR, w, col) => {
        g.strokeStyle = col; g.fillStyle = col; g.lineWidth = w;
        if (settings.style === 'dot' || settings.style === 'tdot') { g.beginPath(); g.arc(cx, cy, dotR(w), 0, Math.PI * 2); g.fill(); }
        if (settings.style === 'circle') { g.beginPath(); g.arc(cx, cy, G + L, 0, Math.PI * 2); g.stroke(); }
        if (settings.style === 'cross' || settings.style === 'tdot') {
          g.beginPath();
          g.moveTo(cx - G - L, cy); g.lineTo(cx - G, cy);
          g.moveTo(cx + G, cy); g.lineTo(cx + G + L, cy);
          g.moveTo(cx, cy - G - L); g.lineTo(cx, cy - G);
          g.moveTo(cx, cy + G); g.lineTo(cx, cy + G + L);
          g.stroke();
        }
        if (settings.style === 'outline') {
          g.beginPath();
          g.rect(cx - G - L, cy - w / 2, L, w);
          g.rect(cx + G, cy - w / 2, L, w);
          g.rect(cx - w / 2, cy - G - L, w, L);
          g.rect(cx - w / 2, cy + G, w, L);
          g.stroke();
        }
      };
      const drawXh = () => {
        const c = $('#xhCanvas');
        const g = c.getContext('2d');
        const S = 152, cx = S / 2, cy = S / 2;
        const L = settings.len * 4, G = settings.gap * 4, T = Math.max(1.5, settings.thick * 2);
        g.clearRect(0, 0, S, S);
        g.shadowColor = 'transparent'; g.shadowBlur = 0;
        if (settings.outline) paintXh(g, cx, cy, L, G, (w) => Math.max(1.5, w), T + 3, '#000000');
        paintXh(g, cx, cy, L, G, (w) => Math.max(1.5, w), T, settings.color);
        g.shadowBlur = 0;
      };
      const saveSensitivity = () => {
        try { localStorage.setItem('kixot_sens', JSON.stringify({ version: 1, dpi: settings.dpi, sens: settings.sens })); }
        catch { $('#sensitivityStatus').textContent = 'Settings stay in this visit. Browser storage is unavailable.'; }
      };
      const applySensitivity = sens => {
        if (!Number.isFinite(sens) || sens < 0.001 || sens > 10) {
          $('#sensitivityStatus').textContent = 'Sensitivity must be between 0.001 and 10.';
          return false;
        }
        settings.sens = sens;
        $('#rngSens').value = Number(sens.toFixed(8));
        $('#sensitivityStatus').textContent = '';
        saveSensitivity();
        return true;
      };

      const buildChips = (el, pairs, onPick) => {
        pairs.forEach((p) => {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'opt'; b.textContent = p[1]; b.dataset.v = p[0];
          b.addEventListener('click', () => {
            el.querySelectorAll('.opt').forEach((o) => o.classList.remove('is-on'));
            b.classList.add('is-on');
            onPick(p[0]);
          });
          el.appendChild(b);
        });
      };

      /* every crosshair control updates BOTH the preview and the live overlay */
      const updateCrosshairs = () => { drawXh(); drawXhLayer(); };

      buildChips($('#optColor'), [
        ['#ffffff', 'white'], ['#00ff88', 'green'], ['#00e5ff', 'cyan'],
        ['#ffe600', 'yellow'], ['#ff2d95', 'magenta'], ['#ff3b3b', 'red']
      ], (v) => { settings.color = v; updateCrosshairs(); });
      buildChips($('#optStyle'), [['cross', '✚ cross'], ['dot', '• dot'], ['tdot', '✚ dot center'], ['circle', '◯ circle'], ['outline', '▢ outline']], (v) => { settings.style = v; updateCrosshairs(); });
      buildChips($('#optOutline'), [['off', 'off'], ['on', 'on']], (v) => { settings.outline = v === 'on'; updateCrosshairs(); });
      $('#optColor').children[0].classList.add('is-on');
      $('#optStyle').children[0].classList.add('is-on');
      $('#optOutline').children[0].classList.add('is-on');

      const bindRange = (id, valId, key, fmt) => {
        const r = $(id);
        r.addEventListener('input', () => {
          settings[key] = parseInt(r.value, 10);
          $(valId).textContent = fmt(settings[key]);
          updateCrosshairs();
        });
      };
      bindRange('#rngLen', '#valLen', 'len', (v) => v);
      bindRange('#rngThick', '#valThick', 'thick', (v) => v);
      bindRange('#rngGap', '#valGap', 'gap', (v) => v);

      const readSensitivityInputs = () => {
        const dpi = $('#rngDpi').valueAsNumber;
        if (!$('#rngDpi').checkValidity() || !Number.isSafeInteger(dpi)) { $('#sensitivityStatus').textContent = 'Enter DPI from 50 to 64000.'; return; }
        const sens = $('#rngSens').valueAsNumber;
        if (!$('#rngSens').checkValidity() || !Number.isFinite(sens)) {
          $('#sensitivityStatus').textContent = 'Enter sens from 0.001 to 10.';
          return;
        }
        settings.dpi = dpi;
        applySensitivity(sens);
      };
      $('#rngDpi').addEventListener('input', readSensitivityInputs);
      $('#rngDpi').value = settings.dpi;
      $('#rngSens').addEventListener('input', readSensitivityInputs);
      $('#rngSens').value = settings.sens;
      drawXh();

      /* ================= live crosshair overlay ================= */
      const xhLayer = $('#xhLayer');
      const resizeXhLayer = () => {
        const w = xhLayer.clientWidth, h = xhLayer.clientHeight;
        if (w && h && (xhLayer.width !== w || xhLayer.height !== h)) { xhLayer.width = w; xhLayer.height = h; }
        drawXhLayer();
      };
      const drawXhLayer = () => {
        if (!xhLayer.width || !xhLayer.height) return;
        const g = xhLayer.getContext('2d');
        const cx = xhLayer.width / 2, cy = xhLayer.height / 2;
        const L = settings.len * 2, G = settings.gap * 2, T = Math.max(1.5, settings.thick * 1.5);
        g.clearRect(0, 0, xhLayer.width, xhLayer.height);
        g.shadowColor = 'transparent'; g.shadowBlur = 0;
        if (settings.outline) paintXh(g, cx, cy, L, G, (w) => Math.max(1.5, w * 0.8), T + 3, '#000000');
        paintXh(g, cx, cy, L, G, (w) => Math.max(1.5, w * 0.8), T, settings.color);
        g.shadowBlur = 0;
      };
      window.addEventListener('resize', resizeXhLayer);

      /* ================= 3D range ================= */
      const MODES = {
        flick:     { name: ['FLICK', 'RANGE'],     desc: 'bring out your inner you.', dur: 30, field: 3, size: 0.55 },
        precision: { name: ['PRECISION', 'RANGE'], desc: 'bring out your inner you.', dur: 30, field: 3, size: 0.3 },
        track:     { name: ['TRACKING', 'RANGE'],  desc: 'bring out your inner you.', dur: 30, field: 1, size: 0.6 }
      };

      const canvas3d = $('#range3d');
      const overlay = $('#overlay');
      const ovTitle = $('#ovTitle');
      const ovDesc = $('#ovDesc');
      const ovBig = $('#ovBig');
      const ovMsg = $('#ovMsg');
      const ovRank = $('#ovRank');
      const ovNext = $('#ovNext');
      const ovBtn = $('#ovBtn');
      const ovBtn2 = $('#ovBtn2');
      const hudScore = $('#hudScore');
      const hudTime = $('#hudTime');
      const hudAcc = $('#hudAcc');
      const hudStreak = $('#hudStreak');
      const rangeNote = $('#rangeNote');
      const fireBtn = $('#fireBtn');
      const isTouch = window.matchMedia('(pointer: coarse)').matches;

      let renderer = null, scene = null, camera = null, gun = null;
      let yaw = 0, pitch = 0;
      let playing = false, locked = false, paused = false;
      /* true only while the 3-2-1 is on screen. the 30s exercise clock is held
         until this clears, so the countdown never eats into the run. */
      let counting = false;
      let mode = 'flick';
      let score = 0, hits = 0, shots = 0, streak = 0, bestStreak = 0, onT = 0, timeLeft = 30;
      let targets = [];
      let stats = { flick: null, precision: null, track: null };
      let runConfiguration = null;
      let runStarted = false;
      const markDrillStarted = () => {
        if (runStarted || !playing || paused || counting) return;
        runStarted = true;
        window.KixotAnalytics?.track('drill_started', { drill_mode: mode, difficulty: runConfiguration.difficulty });
      };
      let lastT = 0, rafId = null, countdownTimer = null, lockPending = false;
      let holding = false;

      /* valorant has NO yaw limit: you can spin all day, and big tracking turns are
         normal. the old hard ±180° wall silently swallowed every further mouse
         movement once you reached it, which reads as "my aim feels slow/stuck".
         pitch still stops at valorant's ~89° so you can't flip over. */
      const PITCH_LIMIT = 89 * Math.PI / 180;
      const clampPitch = () => { pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch)); };

      /* pointer lock can be blocked right after esc (browser cooldown). never let it throw.
         unadjustedMovement:1 asks chrome to skip the os mouse accel (enhance pointer
         precision) for this pointer - raw counts like valorant. browsers that don't
         support it just take the normal path, everything still works. */
      let lockRequest = false;
      const safeLock = async () => {
        if (locked || lockRequest || isTouch) return;
        lockRequest = true;
        try {
          await canvas3d.requestPointerLock({ unadjustedMovement: true });
        } catch (error) {
          // Only unsupported raw input needs a second request. Other failures wait for a click.
          if (error?.name === 'NotSupportedError') {
            try { await canvas3d.requestPointerLock(); $('#sensitivityStatus').textContent = 'Raw mouse input is unavailable in this browser; sensitivity may differ.'; } catch {}
          }
        } finally { lockRequest = false; }
      };

      const sizeRange = () => {
        if (!renderer) return;
        const cap = matchMedia('(max-width: 768px), (pointer: coarse)').matches ? 1.25 : 1.75;
        const ratio = Math.min(window.devicePixelRatio || 1, cap);
        if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
        const w = canvas3d.clientWidth, h = canvas3d.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        /* THE sens feel fix: valorant's 103 degrees is HORIZONTAL fov. three.js fov is
           vertical. a 103 vertical fov on 16:9 is ~132 horizontal - the world looked
           shrunk and every turn felt way slower than valorant at the same sens.
           derive the vertical fov that yields exactly 103 horizontal at this aspect. */
        const hFov = 103 * Math.PI / 180;
        camera.fov = 2 * Math.atan(Math.tan(hFov / 2) / camera.aspect) * 180 / Math.PI;
        camera.updateProjectionMatrix();
      };

      /* three.js is ~600kb and the survey takes a while, so it only loads when
         the range actually appears. loadThree() injects the script once and
         resolves when THREE is ready. if the cdn fails we fail soft and the
         rest of the page keeps working. */
      let threeLoad = null;
      const loadThree = () => {
        if (window.THREE) return Promise.resolve();
        if (threeLoad) return threeLoad;
        threeLoad = new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
          s.onload = () => resolve();
          s.onerror = () => { threeLoad = null; reject(new Error('three.js cdn unreachable')); };
          document.head.appendChild(s);
        });
        return threeLoad;
      };

      const init3d = () => {
        if (!window.THREE) return; /* loadThree() has not finished yet */
        if (renderer) return;
        /* antialias only on low-dpi screens: at high dpr it's invisible and just eats frames */
        const dpr = window.devicePixelRatio || 1;
        renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: dpr < 1.5, powerPreference: 'high-performance' });
        /* cap pixel ratio: phones at dpr 3 were rendering 9x the pixels. that was the stutter */
        renderer.setPixelRatio(Math.min(dpr, matchMedia('(max-width: 768px), (pointer: coarse)').matches ? 1.25 : 1.75));
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000);
        scene.fog = new THREE.Fog(0x000000, 24, 70);

        /* 103 here is a placeholder; sizeRange() pins the fov to valorant's exact
           103 horizontal degrees for the current aspect ratio on every resize */
        camera = new THREE.PerspectiveCamera(71, 2, 0.1, 200);
        camera.position.set(0, 1.6, 6);
        camera.rotation.order = 'YXZ';
        camera.rotation.set(pitch, yaw, 0);

        scene.add(new THREE.HemisphereLight(0xffffff, 0x000000, 0.75));
        const dir = new THREE.DirectionalLight(0xffffff, 0.7);
        dir.position.set(5, 10, 4);
        scene.add(dir);
        const rim = new THREE.PointLight(0xffffff, 0.55, 34);
        rim.position.set(0, 3, -14);
        scene.add(rim);

        const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.95 }));
        floor.rotation.x = -Math.PI / 2;
        scene.add(floor);
        scene.add(new THREE.GridHelper(80, 40, 0x1c1c1c, 0x1c1c1c));

        const wallMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.9 });
        const back = new THREE.Mesh(new THREE.PlaneGeometry(44, 12), wallMat);
        back.position.set(0, 6, -22);
        scene.add(back);
        const wallL = new THREE.Mesh(new THREE.PlaneGeometry(56, 12), wallMat);
        wallL.position.set(-22, 6, 6); wallL.rotation.y = Math.PI / 2;
        scene.add(wallL);
        const wallR = wallL.clone(); wallR.position.x = 22; wallR.rotation.y = -Math.PI / 2;
        scene.add(wallR);

        const strip = new THREE.Mesh(new THREE.PlaneGeometry(44, 0.09), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        strip.position.set(0, 8.6, -21.9);
        scene.add(strip);
        const strip2 = new THREE.Mesh(new THREE.PlaneGeometry(44, 0.05), new THREE.MeshBasicMaterial({ color: 0x555555 }));
        strip2.position.set(0, 1.1, -21.9);
        scene.add(strip2);

        gun = new THREE.Group();
        const metal = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.45, metalness: 0.75 });
        const dark = new THREE.MeshStandardMaterial({ color: 0x0f0f0f, roughness: 0.6, metalness: 0.4 });
        const wood = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7, metalness: 0.05 });
        const accent = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.4 });
        const box = (w, h, d, mat, x, y, z, rx) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          m.position.set(x, y, z);
          if (rx) m.rotation.x = rx;
          gun.add(m);
          return m;
        };
        box(0.09, 0.13, 0.62, metal, 0, 0, -0.18);
        box(0.05, 0.05, 0.85, dark, 0, 0.015, -0.95);
        box(0.085, 0.1, 0.42, dark, 0, -0.005, -0.62);
        box(0.1, 0.05, 0.16, wood, 0, -0.06, -0.66);
        box(0.08, 0.11, 0.3, dark, 0, -0.02, 0.22);
        box(0.08, 0.16, 0.06, wood, 0, -0.07, 0.38, 0.25);
        box(0.06, 0.22, 0.09, dark, 0, -0.16, -0.06, 0.28);
        box(0.06, 0.16, 0.08, dark, 0, -0.13, 0.12, 0.4);
        box(0.02, 0.05, 0.05, accent, 0, 0.09, -0.42);
        box(0.02, 0.03, 0.02, accent, 0, 0.085, -0.02);
        gun.position.set(0.34, -0.34, -0.62);
        gun.rotation.y = -0.06;
        camera.add(gun);
        scene.add(camera);

        sizeRange();
        for (let i = 0; i < MODES[mode].field; i++) spawnTarget();
      };

      /* shared geometry + material caches: zero allocations while playing = no gc stutter */
      const geoCache = {};
      const matCache = {};
      const sphereGeo = (r) => {
        const k = Math.round(r * 100);
        if (!geoCache[k]) geoCache[k] = new THREE.SphereGeometry(r, 22, 22);
        return geoCache[k];
      };
      const targetMat = (isTrack) => {
        const k = isTrack ? 'track' : 'ball';
        if (!matCache[k]) {
          matCache[k] = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0x444444,
            emissiveIntensity: 0.6,
            roughness: 0.35
          });
        }
        return matCache[k];
      };

      const spawnTarget = () => {
        const r = MODES[mode].size * diff.size;
        const isTrack = mode === 'track';
        const t = new THREE.Mesh(sphereGeo(r), targetMat(isTrack));
        if (isTrack) {
          t.position.set(0, 2.1, -14);
          t.userData = { r, vx: (Math.random() < 0.5 ? -1 : 1) * 2.8 * diff.track, turn: 0, wob: Math.random() * 6 };
        } else {
          t.position.set((Math.random() - 0.5) * 22, 1.0 + Math.random() * 4.6, -6 - Math.random() * 13);
          t.userData = { r };
        }
        scene.add(t);
        targets.push(t);
      };

      const clearTargets = () => { if (scene) targets.forEach((t) => scene.remove(t)); targets = []; };

      /* sparks share one geometry + one material per burst (they fade in sync) */
      let sparkGeo = null;
      const burst = (pos) => {
        if (reducedMotion) return;
        if (!sparkGeo) sparkGeo = new THREE.SphereGeometry(0.05, 6, 6);
        const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
        for (let i = 0; i < 10; i++) {
          const s = new THREE.Mesh(sparkGeo, sparkMat);
          s.position.copy(pos);
          s.userData = { spark: true, life: 1, mat: sparkMat, v: new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6) };
          scene.add(s);
          targets.push(s);
        }
      };

      let raycaster = null; /* created lazily once three.js is actually loaded */

      const shoot = () => {
        if (!playing || paused) return;
        if (!raycaster) raycaster = new THREE.Raycaster();
        shots++;
        camera.updateMatrixWorld(true);
        raycaster.setFromCamera({ x: 0, y: 0 }, camera);
        const balls = targets.filter((t) => t.userData.r);
        const hitArr = raycaster.intersectObjects(balls, false);
        if (hitArr.length) {
          const obj = hitArr[0].object;
          hits++;
          streak++;
          bestStreak = Math.max(bestStreak, streak);
          if (mode !== 'track') {
            score += diff.pts + streak * 15;
            scene.remove(obj);
            targets = targets.filter((t) => t !== obj);
            burst(hitArr[0].point);
            setTimeout(() => { if (playing && !paused) spawnTarget(); }, 200 / diff.respawn);
          }
          beep(760 + Math.min(500, streak * 40), 0.06, 'square', 0.05);
        } else if (mode !== 'track') {
          streak = 0;
          beep(140, 0.09, 'sawtooth', 0.04);
        }
        updateHud();
      };

      let hudScoreR = -1;
      /* every hud write is guarded - rewriting the same string every frame forces style recalc = jank */
      const setTxt = (el, v) => { if (el.__t !== v) { el.__t = v; el.textContent = v; } };
      const updateHud = () => {
        const sc = Math.round(score);
        if (sc !== hudScoreR) { hudScoreR = sc; hudScore.textContent = sc; }
        setTxt(hudTime, Math.max(0, timeLeft).toFixed(1));
        if (mode === 'track') {
          const elapsed = MODES[mode].dur - Math.max(0, timeLeft);
          const pct = elapsed > 0.3 ? Math.round(Math.min(1, onT / elapsed) * 100) : 0;
          setTxt(hudAcc, elapsed > 0.3 ? pct + '%' : '-');
          setTxt(hudStreak, pct + '%');
        } else {
          setTxt(hudAcc, shots ? Math.round(hits / shots * 100) + '%' : '-');
          setTxt(hudStreak, String(streak));
        }
      };

      const beep = (freq, dur, type, vol) => {
        try {
          if (!beep.ctx) beep.ctx = new (window.AudioContext || window.webkitAudioContext)();
          const o = beep.ctx.createOscillator();
          const g = beep.ctx.createGain();
          o.type = type || 'square';
          o.frequency.value = freq;
          g.gain.setValueAtTime(vol || 0.05, beep.ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.0001, beep.ctx.currentTime + (dur || 0.08));
          o.connect(g); g.connect(beep.ctx.destination);
          o.start(); o.stop(beep.ctx.currentTime + (dur || 0.08));
        } catch (e) { /* shh */ }
      };

      const loop = (ts) => {
        if (document.hidden) { rafId = null; return; }
        rafId = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (ts - lastT) / 1000 || 0.016);
        lastT = ts;
        /* range hidden (survey/plan/results steps): don't burn frames rendering nothing */
        if (canvas3d.offsetParent === null) return;

        if (gun) {
          const t = ts / 1000;
          gun.position.x = 0.34 + (reducedMotion ? 0 : Math.sin(t * 1.4) * 0.006);
          gun.position.y = -0.34 + (reducedMotion ? 0 : Math.cos(t * 1.1) * 0.008);
          gun.position.z += (-0.62 - gun.position.z) * Math.min(1, dt * 9);
          gun.rotation.x += (0 - gun.rotation.x) * Math.min(1, dt * 8);
        }

        if (playing && !paused && !counting && (isTouch || locked)) { /* clock only runs with the mouse really locked (touch needs no lock), and never during the 3-2-1 */
          timeLeft -= dt;
          if (timeLeft <= 0) { end(); }
          else {
            if (mode === 'track' && targets.length) {
              const t = targets[0];
              const u = t.userData;
              u.turn += dt;
              if (u.turn > 0.9 + Math.random() * 1.2) {
                u.vx = (Math.random() < 0.5 ? -1 : 1) * (2.2 + Math.random() * 2.2) * diff.track;
                u.turn = 0;
              }
              t.position.x += u.vx * dt;
              if (Math.abs(t.position.x) > 12.5) { u.vx *= -1; t.position.x = Math.sign(t.position.x) * 12.5; }
              u.wob += dt;
              t.position.y = 2.1 + Math.sin(u.wob * 0.8) * 0.9;
              if (holding) {
                camera.updateMatrixWorld(true);
                if (!raycaster) raycaster = new THREE.Raycaster();
                raycaster.setFromCamera({ x: 0, y: 0 }, camera);
                if (raycaster.intersectObject(t, false).length) {
                  onT += dt;
                  score += 140 * dt;
                  if (Math.abs(u.vx) < 5.4 * diff.track) u.vx *= 1 + 0.05 * dt;
                }
              }
            }
            updateHud();
          }
        }

        const dead = [];
        targets.forEach((t) => {
          if (t.userData.spark) {
            t.userData.life -= dt * 2.4;
            t.material.opacity = Math.max(0, t.userData.life);
            t.userData.v.y -= 9 * dt;
            t.position.addScaledVector(t.userData.v, dt);
            if (t.userData.life <= 0) dead.push(t);
          }
        });
        if (dead.length) {
          dead.forEach((t) => scene.remove(t));
          /* dispose a burst material once its last spark is gone */
          const mats = new Set(dead.map((t) => t.userData.mat).filter(Boolean));
          mats.forEach((m) => {
            const stillAlive = targets.some((t) => !dead.includes(t) && t.userData.mat === m);
            if (!stillAlive) m.dispose();
          });
          targets = targets.filter((t) => !dead.includes(t));
        }

        renderer.render(scene, camera);
      };

      const start = () => {
        if (counting || (playing && !paused) || $('#stepSettings').classList.contains('hidden')) return;
        if (!$('#rngDpi').reportValidity() || !$('#rngSens').reportValidity()) return;
        if (!threeReady) { loadThree().then(() => { threeReady = true; init3d(); start(); }).catch(() => {}); return; }
        if (!renderer) init3d();
        resizeXhLayer();
        if (beep.ctx && beep.ctx.state === 'suspended') beep.ctx.resume();
        paused = false;
        score = 0; hits = 0; shots = 0; streak = 0; bestStreak = 0; onT = 0; holding = false;
        runConfiguration = { sens: settings.sens, dpi: settings.dpi, difficulty: diff.short };
        runStarted = false;
        timeLeft = MODES[mode].dur;
        clearTargets();
        for (let i = 0; i < MODES[mode].field; i++) spawnTarget();
        updateHud();
        ovNext.textContent = '';
        syncModeButtons();
        /* desktop: grab the mouse NOW, during the countdown. the cursor lands on the
           Start button, so a click-to-lock after countdown would instantly pause the run.
           locking here means the run always starts clean. */
        if (!isTouch && !locked) safeLock();

        let count = 3;
        /* the 30s exercise clock does not exist yet: counting holds the loop off
           the clock until the 3-2-1 has fully finished */
        counting = true;
        syncModeButtons();
        ovBig.textContent = count;
        ovBig.classList.add('is-showing');
        ovMsg.textContent = '';
        ovRank.classList.remove('is-showing');
        overlay.classList.remove('is-hidden');
        ovBtn.style.visibility = 'hidden';
        ovBtn2.hidden = true;
        beep(520, 0.09, 'square', 0.05);

        countdownTimer = setInterval(() => {
          if (document.hidden) return;
          count--;
          if (count > 0) { ovBig.textContent = count; beep(520, 0.09, 'square', 0.05); }
          else {
            clearInterval(countdownTimer);
            countdownTimer = null;
            ovBig.classList.remove('is-showing');
            ovBtn.style.visibility = '';
            if (!isTouch && !locked) {
              /* lock never landed (no fresh gesture to grant it). no pause menu:
                 hold the clock, hide the overlay, and grab the lock on the next
                 click anywhere. the run resumes the moment it lands */
              counting = false;
              overlay.classList.add('is-hidden');
              playing = true; paused = true;
              lockPending = true;
              syncModeButtons();
              rangeNote.textContent = 'click anywhere to lock in';
              updateHud();
              safeLock();
              return;
            }
            overlay.classList.add('is-hidden');
            playing = true;
            paused = false;
            /* clock starts HERE - after the 3-2-1, not before it */
            counting = false;
            syncModeButtons();
            lastT = performance.now();
            markDrillStarted();
            updateHud();
            rangeNote.textContent = isTouch ? 'drag to aim · tap to shoot'
              : (mode === 'track' ? 'HOLD left mouse on the bot · esc to pause' : 'aiming · click to shoot · esc to pause');
          }
        }, 700);
      };

      /* ---- one pause path for the whole range ----
         every trigger (escape key, pointer-lock loss, fullscreen exit) calls this,
         so the overlay always reads Resume and the run's timeLeft/score survive.
         resumeRun() is the only way back in, and it never resets the clock. */
      const pauseRun = (msg) => {
        if (!playing && !counting) return;
        /* already cleanly paused? nothing to do. but if we are parked waiting for the
           lock (the "click anywhere to lock in" state) esc still opens the menu */
        if (paused && !lockPending) return;
        paused = true;
        playing = true;
        holding = false;
        lockPending = false;
        if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
        counting = false;
        ovBig.classList.remove('is-showing');
        ovRank.classList.remove('is-showing');
        ovMsg.textContent = msg || '';
        ovNext.textContent = '';
        ovTitle.innerHTML = '<span class="accent">' + MODES[mode].name[0] + '</span> ' + MODES[mode].name[1];
        ovDesc.textContent = 'paused · ' + Math.max(0, timeLeft).toFixed(1) + 's left · your score is safe';
        ovBtn.textContent = 'Resume';
        ovBtn.dataset.action = 'resume';
        ovBtn.disabled = false;
        ovBtn.style.visibility = '';
        ovBtn2.hidden = true;
        overlay.classList.remove('is-hidden');
        rangeNote.textContent = isTouch ? 'paused · tap resume' : 'paused · click resume';
        syncModeButtons();
      };

      const resumeRun = () => {
        if (!paused) return;
        if (isTouch) {
          paused = false;
          playing = true;
          lastT = performance.now();
          overlay.classList.add('is-hidden');
          rangeNote.textContent = mode === 'track' ? 'HOLD left mouse on the bot · esc to pause' : 'aiming · click to shoot · esc to pause';
          syncModeButtons();
          markDrillStarted();
          return;
        }
        /* the browser refuses re-locks for a beat after esc. wait for the lock to
           ACTUALLY land before unpausing, or we get a frozen cursor mid-run */
        ovBtn.disabled = true;
        ovMsg.textContent = 'grabbing your mouse…';
        lockPending = true;
        lastT = performance.now();
        safeLock();
        setTimeout(() => { /* some browsers fail silently: no lock, no error event */
          if (lockPending) {
            lockPending = false;
            ovBtn.disabled = false;
            ovBtn.textContent = 'Resume';
            ovBtn.dataset.action = 'resume';
            ovMsg.textContent = 'pointer lock blocked · click resume again';
            overlay.classList.remove('is-hidden');
          }
        }, 1600);
      };

      /* Modes change only through a choice made outside an unfinished drill. */
      const runNextExercise = (m) => {
        const b = document.querySelector('.mode-btn[data-mode="' + m + '"]');
        if (b && !b.disabled) b.click();
        start();
        if (!isTouch) safeLock();
      };

      const end = () => {
        if (!playing) return; /* never score the same run twice (end can fire from the loop and a finish()) */
        const completed = timeLeft <= 0 && runStarted;
        playing = false;
        paused = false;
        holding = false;
        counting = false;
        lockPending = false;
        if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
        timeLeft = 0;
        updateHud();
        /* hand the cursor back the moment the run ends - no silent screen to escape from */
        if (!isTouch && locked) document.exitPointerLock();
        /* no auto-advance any more: the old build silently started the next exercise's
           countdown 4s after a run ended, which read as a glitch. the end screen now
           waits for the player ("start next"). */
        syncModeButtons(); /* run over: every mode button is playable again */
        const m = MODES[mode];
        const acc = mode === 'track'
          ? Math.max(0, Math.min(1, onT / m.dur))
          : (shots ? hits / shots : 0);
        stats[mode] = {
          mode, score: Math.round(score), acc: Math.round(acc * 100),
          streak: mode === 'track' ? Math.round((onT / m.dur) * 100) : bestStreak,
          shots, hits, sens: runConfiguration ? runConfiguration.sens : settings.sens, dpi: runConfiguration ? runConfiguration.dpi : settings.dpi, diff: runConfiguration ? runConfiguration.difficulty : diff.short
        };

        const s = stats[mode];
        window.KixotProgress.addRun(s);
        if (completed) window.KixotAnalytics?.track('drill_completed', { drill_mode: mode, difficulty: s.diff });
        const rank = runBenchFor(mode).find((r) => s.score >= r.min) || runBenchFor(mode)[runBenchFor(mode).length - 1];
        ovBig.textContent = s.score;
        ovBig.classList.add('is-showing');
        ovRank.src = TIER + '/' + rank.tier + '/largeicon.png';
        ovRank.classList.add('is-showing');
        ovMsg.textContent = rank.name + ' pace · ' + rank.pun;
        ovDesc.textContent = s.acc + '% accuracy · best streak ' + s.streak + ' · ' + diff.short + ' difficulty';

        const done = ['flick', 'precision', 'track'].filter((k) => stats[k]).length;
        /* guided session: only a run of the step's own mode advances the workout.
           playing any other mode off-guide is allowed and behaves like a free run */
        const stepNow = (session && session.guided && session.list) ? session.list[session.idx] : null;
        if (session && session.guided && stepNow && mode === stepNow.mode) {
          /* guided owns its own order, so the primary button is already the next
             exercise and no second button (or auto-roll) is needed */
          ovBtn2.hidden = true;
          const nextMode = sessionAdvance();
          if (nextMode === 'done') {
            ovNext.textContent = 'workout complete guide finished · report card unlocked';
            ovBtn.textContent = 'See report card';
            ovBtn.dataset.action = 'results';
            $('#btnResults').disabled = false; /* guide complete = card unlocks, even with modes missing */
          } else if (nextMode) {
            ovNext.textContent = 'next up: ' + modeLabel(nextMode) + ' run';
            ovBtn.textContent = 'Next exercise';
            ovBtn.dataset.action = 'next';
          } else {
            ovNext.textContent = '';
            ovBtn.textContent = 'Run it back';
            ovBtn.dataset.action = 'same';
          }
        } else {
          /* free mode: report card unlocks after one of each */
          $('#btnResults').disabled = done < 3;
          ovNext.textContent = done < 3 ? (done + '/3 done · report card unlocks after one of each (flick · precision · tracking)') : 'all three done · report card unlocked';
          ovBtn.textContent = done < 3 ? 'Run it back' : 'See report card';
          ovBtn.dataset.action = done < 3 ? 'same' : 'results';
          const order = ['flick', 'precision', 'track'];
          const oi = order.indexOf(mode);
          if (oi !== -1 && oi < order.length - 1) {
            /* The next exercise stays a deliberate choice after the full run. */
            ovBtn2.hidden = false;
            ovBtn2.textContent = 'next exercise';
            ovBtn2.dataset.mode = order[oi + 1];
          } else ovBtn2.hidden = true;
        }

        rangeNote.textContent = 'run over · pick your next';
        overlay.classList.remove('is-hidden');
        beep(220, 0.22, 'sawtooth', 0.05);
        setTimeout(() => beep(330, 0.28, 'sawtooth', 0.05), 130);
      };

      /* ================= analytics ================= */
      const buildResults = () => {
        const f = stats.flick, p = stats.precision, t = stats.track;
        if (!f && !p && !t) return;
        const solo = [f, p].filter(Boolean);
        const soloAvg = solo.length ? solo.reduce((a, s) => a + s.score, 0) / solo.length : 0;
        const tRank = t ? (BENCH_TRACK.find((b) => b.min < 0 || t.score >= b.min) || BENCH_TRACK[BENCH_TRACK.length - 1]) : null;
        /* the headline rank comes from the runs that actually happened: flick/precision
           average when we have them, otherwise the tracking pace. no "in progress". */
        const rank = solo.length
          ? (BENCH.find((b) => b.min < 0 || soloAvg >= b.min) || BENCH[BENCH.length - 1])
          : (BENCH.find((b) => tRank && b.name === tRank.name) || BENCH[BENCH.length - 1]);
        $('#resRankIcon').src = TIER + '/' + rank.tier + '/largeicon.png';
        $('#resRankName').textContent = rank.name;
        $('#resPun').textContent = rank.pun;
        const totals = [];
        if (f) totals.push('flick ' + f.score.toLocaleString());
        if (p) totals.push('precision ' + p.score.toLocaleString());
        if (t) totals.push('tracking ' + t.score.toLocaleString() + ' = ' + tRank.name + ' pace');
        totals.push('on ' + ((f || p || t).diff || 'ranked') + ' difficulty');
        $('#resTotal').textContent = totals.join(' · ');

        const grid = $('#resGrid');
        grid.innerHTML = '';
        const mk = (h, b, s) => {
          const d = document.createElement('div');
          d.className = 'res-card';
          d.innerHTML = '<h3>' + h + '</h3><b>' + b + '</b>' + (s ? '<span>' + s + '</span>' : '');
          grid.appendChild(d);
        };
        if (f) mk('Flick score', f.score.toLocaleString(), f.acc + '% acc · streak ' + f.streak);
        if (p) mk('Precision score', p.score.toLocaleString(), p.acc + '% acc · streak ' + p.streak);
        if (t) mk('Tracking score', t.score.toLocaleString(), t.acc + '% time on bot');
        mk('Sensitivity', [...new Set([f, p, t].filter(Boolean).map(run => run.sens))].join(', '));
        mk('Shots fired', ((f ? f.shots : 0) + (p ? p.shots : 0)).toLocaleString(), ((f ? f.hits : 0) + (p ? p.hits : 0)) + ' hit overall');

        const rows = [];
        if (f) rows.push({ h: 'Flicks', acc: f.acc, score: f.score, sub: f.acc + '% acc · ' + f.streak + ' best streak', tip: f.acc >= 60 ? 'turns are crisp. keep them warm.' : 'big moves with the arm, stop with the wrist.' });
        if (p) rows.push({ h: 'Precision', acc: p.acc, score: p.score, sub: p.acc + '% acc · ' + p.streak + ' best streak', tip: p.acc >= 60 ? 'micro adjustments looking pro.' : 'small targets shaking you? sens might be too fast. or its skill issue (jk).' });
        if (t) rows.push({ h: 'Tracking', acc: t.acc, score: t.score, sub: t.acc + '% time on bot', tip: t.acc >= 55 ? 'glue hands detected' : 'aim with the arm, correct with the wrist, never stop moving.' });
        const ov = $('#overview');
        ov.innerHTML = '';
        rows.forEach((r) => {
          const d = document.createElement('div');
          d.className = 'ov-row';
          d.innerHTML = '<h3>' + r.h + '</h3><div class="bar"><i></i></div><div class="meta"><span>' + r.sub + '</span><span>' + r.score.toLocaleString() + ' pts</span></div><p>' + r.tip + '</p>';
          ov.appendChild(d);
          const bar = d.querySelector('.bar i');
          bar.style.width = Math.max(3, r.acc) + '%';
        });

        /* benchmark table: solo requirement per rank + what tracking needs at half weight */
        const bt = $('#benchTable');
        bt.innerHTML = '<div class="brow" style="color:var(--text)"><span>rank</span><span>flick / precision avg · tracking</span></div>';
        const ordered = [...BENCH].reverse();
        ordered.forEach((b) => {
          const d = document.createElement('div');
          d.className = 'brow' + (b.name === rank.name ? ' is-you' : '');
          const need = b.min < 0 ? '0 (ouch)' : b.min.toLocaleString() + '+';
          const tr = BENCH_TRACK.find((x) => x.name === b.name);
          const needT = (b.min < 0 || !tr || tr.min < 0) ? '0 (ouch)' : tr.min.toLocaleString() + '+';
          d.innerHTML = '<span><img src="' + TIER + '/' + b.tier + '/smallicon.png" alt="" width="256" height="256" loading="lazy" decoding="async" />' + b.name + (b.name === rank.name ? ' ← you' : '') + '</span><span>' + need + ' · ' + needT + '</span>';
          bt.appendChild(d);
        });


        const worst = [...rows].sort((a, b) => a.acc - b.acc)[0] || { h: 'any mode', tip: 'run one and the tips write themselves.' };
        const nextRank = BENCH[BENCH.indexOf(rank) - 1];
        const rankIdx = BENCH.indexOf(rank);
        const tRankIdx = t ? BENCH.findIndex((b) => b.name === tRank.name) : -99;
        const tips = [
          { h: 'Fix first: ' + worst.h, b: worst.tip },
          { h: 'Climb the benchmark', b: nextRank ? (nextRank.name + ' needs ' + nextRank.min.toLocaleString() + ' avg on flick/precision. you are ' + (nextRank.min - soloAvg).toLocaleString() + ' away. that is like ' + Math.ceil((nextRank.min - soloAvg) / 300) + ' good runs. very doable.') : 'you maxed the benchmarks. outside time. grass. touch it.' },
          { h: 'Balance check', b: !t ? 'flick and precision are dialed in. add a tracking run to balance the whole setup.' : (rankIdx + 2 <= tRankIdx) ? ('your flicks say ' + rank.name + ' but your tracking says ' + tRank.name + '. in game that looks like winning duels but losing crosshair placement while moving. grind track mode.') : (tRankIdx + 2 <= rankIdx) ? 'tracking carries you (' + tRank.name + ') but flicks lag at ' + rank.name + '. stop holding angles, go click heads.' : 'all three modes are in the same tier. balanced setup, rare and beautiful.' },
          { h: 'Difficulty', b: (diff.id === 3 && soloAvg < 6000) ? 'you volunteered for radiant trials and got humbled, respect. drop to asc lobby until you crack 6k avg.' :
            (diff.id === 0 && soloAvg > 9000) ? 'bore diff detected, you are smurfing the warmup tier. go up a level, champ.' :
            'training at ' + diff.label.toLowerCase() + ' (' + diff.medal + '). switch it up anytime in settings.' },
          { h: 'Crosshair', b: settings.gap > 6 ? 'huge gap crosshair. its fine, but tighter gap = better precision reference. try gap 2 to 4.' : 'crosshair setup looks sane. keep it at head height, thats free kills.' },
          { h: 'Routine', b: 'one flick + one precision + one track run before ranked. your rank will thank you or at least stop crying.' }
        ];
        if (f && p && f.acc < 35 && p.acc < 35) tips.splice(1, 0, { h: 'Big picture', b: 'crosshair placement > raw flicks. half your flicks disappear when the crosshair lives at head height.' });
        const tipsEl = $('#resTips');
        tipsEl.innerHTML = '';
        tips.forEach((tp) => {
          const d = document.createElement('div');
          d.className = 'tip';
          d.innerHTML = '<b>' + tp.h + '</b>' + tp.b;
          tipsEl.appendChild(d);
        });
      };

      $('#btnAgain').addEventListener('click', () => {
        stats = { flick: null, precision: null, track: null };
        $('#btnResults').disabled = true;
        $('#stepResults').classList.add('hidden');
        $('#stepSettings').classList.remove('hidden');
        if (session) { session.idx = 0; session.count = 0; }
        updateSessionBanner();
        window.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
      });

      const runBack = (preMode) => {
        stats = { flick: null, precision: null, track: null };
        $('#btnResults').disabled = true;
        $('#stepResults').classList.add('hidden');
        $('#stepSettings').classList.remove('hidden');
        if (session) { session.guided = false; session.idx = 0; session.count = 0; }
        updateSessionBanner();
        if (preMode) {
          const b = document.querySelector('.mode-btn[data-mode="' + preMode + '"]');
          if (b && !b.disabled) b.click();
        }
        window.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
      };

      $('#btnShare').addEventListener('click', async () => {
        const f = stats.flick, p = stats.precision, t = stats.track;
        if (!f && !p && !t) return;
        const bits = [];
        if (f) bits.push('flick ' + f.score);
        if (p) bits.push('precision ' + p.score);
        if (t) bits.push('tracking ' + t.score);
        const txt = 'my kixot range report card ' + bits.join(' · ') + ' · sens ' + settings.sens.toFixed(2) + ' · beat me: ' + location.href;
        try { await navigator.clipboard.writeText(txt); $('#btnShare').textContent = 'copied'; }
        catch (e) { $('#btnShare').textContent = 'copy failed'; }
        setTimeout(() => { $('#btnShare').textContent = 'copy my results'; }, 1800);
      });

      /* ================= mode buttons ================= */
      document.querySelectorAll('.mode-btn').forEach((b) => {
        b.addEventListener('click', () => {
          if (playing || counting) return;
          /* switching exercises from the pause menu drops the current run. say so,
             so nobody wonders where their score went */
          const dropped = playing && paused;
          document.querySelectorAll('.mode-btn').forEach((o) => o.classList.remove('is-active'));
          b.classList.add('is-active');
          mode = b.dataset.mode;
          playing = false; paused = false; counting = false;
          lockPending = false;
          if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
          holding = false;
          if (!isTouch && locked) document.exitPointerLock();
          ovTitle.innerHTML = '<span class="accent">' + MODES[mode].name[0] + '</span> ' + MODES[mode].name[1];
          ovDesc.textContent = '';
          ovBig.classList.remove('is-showing');
          ovRank.classList.remove('is-showing');
          ovMsg.textContent = dropped ? 'switched exercise · that run is gone' : '';
          ovNext.textContent = '';
          ovBtn.textContent = 'Start';
          ovBtn.dataset.action = 'same';
          ovBtn.disabled = false;
          ovBtn.style.visibility = '';
          ovBtn2.hidden = true;
          overlay.classList.remove('is-hidden');
          clearTargets();
          if (scene) for (let i = 0; i < MODES[mode].field; i++) spawnTarget();
          score = 0; hits = 0; shots = 0; streak = 0; bestStreak = 0; onT = 0; timeLeft = MODES[mode].dur;
          updateHud();
          updateSessionBanner();
          rangeNote.textContent = 'ready · press start · Esc to pause';
        });
      });

      /* ================= pointer lock + fire =================
         Valorant turns 0.07 degrees per count per sens point. Request raw counts;
         browsers without raw input use their normal pointer-lock deltas. */

      canvas3d.addEventListener('click', () => {
        if (playing) return; /* mid-run: clicks shoot, they never re-open the pause menu */
        if (!threeReady) { loadThree().then(() => { threeReady = true; init3d(); }).catch(() => {}); return; }
        if (!renderer) init3d();
        if (!isTouch && !locked) safeLock();
      });

      document.addEventListener('pointerlockchange', () => {
        const wasLocked = locked;
        locked = document.pointerLockElement === canvas3d;
        rangeNote.textContent = locked ? (mode === 'track' ? 'aiming · HOLD left mouse on the bot · esc to pause'
                                                       : 'aiming · click to shoot · esc to pause')
          : isTouch ? 'drag to aim · tap to shoot'
          : 'click the range to lock in';
        /* a resume waits for this exact moment: lock landed -> NOW unpause */
        if (lockPending && locked) {
          lockPending = false;
          ovBtn.disabled = false;
          ovBtn.style.visibility = '';
          if (playing || paused) {
            paused = false;
            playing = true;
            lastT = performance.now();
            overlay.classList.add('is-hidden');
            syncModeButtons();
            markDrillStarted();
          }
          return;
        }
        if (wasLocked && !locked && (playing || counting) && !paused) {
          /* ANY unlock during a live run is a pause now. the old build tried to
             guess "esc vs glitch" from a 600ms keydown window, but browsers
             routinely swallow the escape keydown that ends pointer lock - so a
             real esc looked like a glitch and silently re-locked instead of
             pausing. the button is always Resume and it always continues. */
          pauseRun();
          return;
        }
      });

      /* re-lock refused (esc cooldown etc). without this the run would keep playing
         with a frozen cursor - the "range stuck" bug. */
      document.addEventListener('pointerlockerror', () => {
        if (lockPending) {
          /* a resume's re-lock was refused. settle into the normal pause screen so the
             player still sees Resume (and their progress) instead of a silent stall */
          pauseRun('pointer lock blocked · click resume again');
        }
      });

      /* any click while waiting on the lock re-grabs it: a click is a user gesture,
         so the browser grants it. this is what kills the random mid-aim escapes */
      document.addEventListener('click', () => {
        if (lockPending && !locked && !isTouch) safeLock();
      }, true);

      document.addEventListener('mousemove', (e) => {
        if (!locked) return;
        /* movementX IS the raw mouse count (unadjustedMovement): deg = 0.07 x sens x count.
           exactly valorant's turn rate - nothing added, nothing compensated. */
        const radPerCount = degPerCount(settings.sens) * (Math.PI / 180);
        /* sanity ceiling only, far beyond any real flick, purely to survive a
           browser glitch. the old code clamped every event for 60ms to ±120 counts,
           which chopped the head off real flicks (a hard flick is 200 to 800 counts
           in one go) and was very likely the "feels slow" you hit. */
        const mx = Math.max(-5000, Math.min(5000, e.movementX));
        const my = Math.max(-5000, Math.min(5000, e.movementY));
        yaw -= mx * radPerCount;
        pitch -= my * radPerCount;
        clampPitch();
        camera.rotation.set(pitch, yaw, 0);
      });

      document.addEventListener('mousedown', (e) => {
        if (!locked) return;
        if (e.button === 0) { holding = true; shoot(); if (gun && !reducedMotion) gun.position.z = -0.5; }
      });
      document.addEventListener('mouseup', () => { holding = false; });

      document.addEventListener('keydown', (e) => {
        /* escape always pauses a live run. when the pointer is locked the browser
           tears the lock down itself (pointerlockchange pauses us); when it isn't
           (fullscreen, or the lock was already gone) we pause here. */
        if (e.key === 'Escape') {
          if (locked) { document.exitPointerLock(); return; }
          /* fullscreen: first esc pauses WITHOUT leaving fullscreen, a second esc
             (or the exit-fullscreen button) is what actually drops out of it */
          if (document.fullscreenElement) {
            if (paused) { escWantsFullscreen = false; document.exitFullscreen(); }
            else {
              pauseRun();
              escWantsFullscreen = true;
            }
            return;
          }
          if (playing || counting) pauseRun();
        }
        if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
        if ((e.key === 'r' || e.key === 'R') && locked && !playing) start();
        /* fullscreen from inside a run, keyboard-first: F flips it without breaking the lock */
        if ((e.key === 'f' || e.key === 'F') && !e.repeat) {
          if (document.fullscreenElement) document.exitFullscreen();
          else fsTarget.requestFullscreen?.().catch(() => {});
          e.preventDefault();
        }
      });

      ovBtn.addEventListener('click', () => {
        const action = ovBtn.dataset.action || 'same';
        if (action === 'resume') { resumeRun(); return; }
        if (action === 'results') {
          $('#btnResults').click();
          return;
        }
        if (action === 'next' && session && session.guided) {
          const step = session.list[session.idx];
          /* resume the workout where it stopped: flip to this step's mode and start
             without resetting progress (count/runs) */
          document.querySelector('[data-mode="' + step.mode + '"]').click();
          start();
          if (!isTouch) safeLock();
          return;
        }
        start();
        if (!isTouch) safeLock();
      });

      /* "next exercise" (free mode) / "start next" (guided): roll straight into the
         countdown and cancel the auto-advance timer */
      ovBtn2.addEventListener('click', () => runNextExercise(ovBtn2.dataset.mode || mode));

      /* ================= touch ================= */
      let touchAim = null;
      canvas3d.addEventListener('touchstart', (e) => {
        if (!threeReady) { loadThree().then(() => { threeReady = true; init3d(); }).catch(() => {}); return; }
        if (!renderer) init3d();
        const t = e.touches[0];
        touchAim = { x: t.clientX, y: t.clientY };
        e.preventDefault();
      }, { passive: false });
      canvas3d.addEventListener('touchmove', (e) => {
        if (!touchAim) return;
        const t = e.touches[0];
        const dx = t.clientX - touchAim.x, dy = t.clientY - touchAim.y;
        touchAim = { x: t.clientX, y: t.clientY };
        /* same valorant scaling as desktop (deg per raw count), with a finger damping
           factor so a thumb drag covers roughly the same turn as a wrist flick */
        const radPerPx = degPerCount(settings.sens) * 0.55 * (Math.PI / 180);
        yaw -= dx * radPerPx;
        pitch -= dy * radPerPx;
        clampPitch();
        camera.rotation.set(pitch, yaw, 0);
        e.preventDefault();
      }, { passive: false });
      canvas3d.addEventListener('touchend', () => { touchAim = null; }, { passive: true });

      fireBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (playing) { holding = true; shoot(); setTimeout(() => { holding = false; }, 90); }
      });

      if (isTouch) {
        fireBtn.style.display = 'grid';
        rangeNote.textContent = 'drag to aim · tap to shoot';
      } else {
        rangeNote.textContent = 'click the range to lock in';
      }

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



      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          cancelAnimationFrame(rafId);
          rafId = null;
          holding = false;
          if (playing || counting) pauseRun();
        } else if (renderer && !rafId) {
          lastT = performance.now();
          rafId = requestAnimationFrame(loop);
        }
      });

      let launchMode = 'flick';
      document.querySelectorAll('[data-launch-mode]').forEach(button => {
        button.addEventListener('click', () => {
          launchMode = button.dataset.launchMode;
          document.querySelectorAll('[data-launch-mode]').forEach(item => {
            const selected = item === button;
            item.classList.toggle('is-active', selected);
            item.setAttribute('aria-pressed', String(selected));
          });
        });
      });
      const resetExercise = () => {
        if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
        playing = false; paused = false; counting = false; holding = false; lockPending = false;
        if (locked) document.exitPointerLock();
        syncModeButtons();
      };
      const returnToModes = () => {
        if (playing || counting) return;
        resetExercise();
        hasPlan = false;
        ['stepSurvey', 'stepPlan', 'stepSettings', 'stepResults'].forEach(id => $('#' + id).classList.add('hidden'));
        $('#dojoLauncher').hidden = false;
        $('#backToModes').hidden = true;
        window.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
      };
      $('#btnOpenPlan').addEventListener('click', () => {
        resetExercise();
        $('#dojoLauncher').hidden = true;
        $('#backToModes').hidden = false;
        $('#stepPlan').classList.add('hidden');
        $('#stepSettings').classList.add('hidden');
        $('#stepResults').classList.add('hidden');
        $('#stepSurvey').classList.remove('hidden');
        const goal = { flick: 'flicks', precision: 'precision', track: 'tracking' }[launchMode];
        answers.goals = new Set([goal]);
        document.querySelectorAll('#qGoal button').forEach(button => button.classList.toggle('is-on', button.dataset.v === goal));
        refreshSurvey();
        $('#planBuilder').open = true;
        $('#planBuilder').scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
      });
      $('#btnQuick').addEventListener('click', () => {
        resetExercise();
        hasPlan = false;
        session = { guided: false, idx: 0, count: 0, done: false, list: [] };
        stats = { flick: null, precision: null, track: null };
        $('#btnResults').disabled = true;
        diff = DIFFS[1];
        $('#dojoLauncher').hidden = true;
        $('#backToModes').hidden = false;
        $('#stepSurvey').classList.add('hidden');
        $('#stepPlan').classList.add('hidden');
        $('#stepResults').classList.add('hidden');
        $('#stepSettings').classList.remove('hidden');
        document.querySelector('.mode-btn[data-mode="' + launchMode + '"]').click();
        document.querySelectorAll('#optDiffLive button').forEach(button => button.classList.toggle('is-on', button.dataset.v === String(diff.id)));
        $('#btnBackPlan').textContent = 'Back to modes';
        window.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
        setTimeout(() => { sizeRange(); resizeXhLayer(); }, 80);
      });
      $('#backToModes').addEventListener('click', returnToModes);
      document.querySelector('a[href="#myProgress"]').addEventListener('click', () => { $('#progressPanel').open = true; });

      /* ================= boot ================= */
      let threeReady = false;
      const bootObs = new MutationObserver(() => {
        if (!$('#stepSettings').classList.contains('hidden')) {
          bootObs.disconnect();
          /* kick off the cdn fetch the moment the range step is visible */
          loadThree().then(() => {
            threeReady = true;
            init3d();
            resizeXhLayer();
            updateCrosshairs();
            if (!rafId && !document.hidden) { lastT = performance.now(); rafId = requestAnimationFrame(loop); }
          }).catch(() => {
            rangeNote.textContent = '3d engine failed to load, check your connection and refresh';
          });
        }
      });
      bootObs.observe($('#stepSettings'), { attributes: true });

      window.addEventListener('orientationchange', () => setTimeout(() => { sizeRange(); resizeXhLayer(); }, 200));

      window.__range = {
        start, shoot, spawnTarget, end, pause: pauseRun, resume: resumeRun,
        get state() { return { playing, paused, locked, counting, mode, timeLeft, score }; },
        get stats() { return stats; },
        get playing() { return playing; },
        get score() { return score; },
        get diff() { return diff; },
        setDiff(id) { diff = DIFFS[id]; },
        get session() { return session; },
        get targets() { return targets.filter((t) => t.userData.r).map((t) => ({ x: +t.position.x.toFixed(1), y: +t.position.y.toFixed(1), z: +t.position.z.toFixed(1), r: t.userData.r })); },
        setSens(v) { applySensitivity(v); },
        get sensV() { return settings.sens; },
        get degPerPx() { return degPerCount(settings.sens); },
        aimAt(x, y, z) {
          const p = camera.position;
          const dx = x - p.x, dy = y - p.y, dz = z - p.z;
          yaw = Math.atan2(-dx, -dz);
          pitch = Math.atan2(dy, Math.hypot(dx, dz));
          clampPitch();
          camera.rotation.set(pitch, yaw, 0);
        },
        setMode(m) { document.querySelector('[data-mode="' + m + '"]').click(); },
        finish() { timeLeft = 0.01; },
        get cameraYaw() { return yaw; },
        get cameraPitch() { return pitch; }
      };
      if (new URLSearchParams(location.search).get('quick') === '1') $('#btnQuick').click();
      window.KixotAnalytics?.track('dojo_opened');
    })();

