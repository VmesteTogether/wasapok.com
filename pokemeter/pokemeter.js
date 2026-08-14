/* =============================================================================
   POKEMETER — field-companion logic
   v0.1 scaffold: six loadout capsules (add / inspect / clear) + any-gen tactical
   search + per-unit base-stat readout. Data model carries full types + base stats
   so the eventual "meter" (aremypokemongood-class analysis) bolts straight on.
   ========================================================================== */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);

  const SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
  const SPRITE_FALLBACK = dex => `this.onerror=null;this.src='${SPRITE(dex)}'`;
  const GEN_CAPS = [151, 251, 386, 493, 649, 721, 809, 905, 1025];
  const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
  const STAT_LBL = ["HP", "ATK", "DEF", "SPA", "SPD", "SPE"];
  const PARTY_KEY = "pokemeter-party-v1";

  const genOf = dex => { for (let i = 0; i < GEN_CAPS.length; i++) if (dex <= GEN_CAPS[i]) return i + 1; return 9; };
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const prettify = ident => ident.replace(/-/g, " ");

  // ------------------------------------------------ type / readiness engine ---
  // Ported from aremypokemongood. IMPORTANT framing: this reads the FIELD's
  // threats — it never grades the trainer. No pass/fail; readiness only ever
  // reports how outfitted you are and what would raise it.
  const TYPES = ["normal","fire","water","electric","grass","ice","fighting","poison",
    "ground","flying","psychic","bug","rock","ghost","dragon","dark","steel","fairy"];
  const CHART = {
    normal:   { rock:.5, steel:.5, ghost:0 },
    fire:     { grass:2, ice:2, bug:2, steel:2, fire:.5, water:.5, rock:.5, dragon:.5 },
    water:    { fire:2, ground:2, rock:2, water:.5, grass:.5, dragon:.5 },
    electric: { water:2, flying:2, electric:.5, grass:.5, dragon:.5, ground:0 },
    grass:    { water:2, ground:2, rock:2, fire:.5, grass:.5, poison:.5, flying:.5, bug:.5, dragon:.5, steel:.5 },
    ice:      { grass:2, ground:2, flying:2, dragon:2, fire:.5, water:.5, ice:.5, steel:.5 },
    fighting: { normal:2, ice:2, rock:2, dark:2, steel:2, poison:.5, flying:.5, psychic:.5, bug:.5, fairy:.5, ghost:0 },
    poison:   { grass:2, fairy:2, poison:.5, ground:.5, rock:.5, ghost:.5, steel:0 },
    ground:   { fire:2, electric:2, poison:2, rock:2, steel:2, grass:.5, bug:.5, flying:0 },
    flying:   { grass:2, fighting:2, bug:2, electric:.5, rock:.5, steel:.5 },
    psychic:  { fighting:2, poison:2, psychic:.5, steel:.5, dark:0 },
    bug:      { grass:2, psychic:2, dark:2, fire:.5, fighting:.5, poison:.5, flying:.5, ghost:.5, steel:.5, fairy:.5 },
    rock:     { fire:2, ice:2, flying:2, bug:2, fighting:.5, ground:.5, steel:.5 },
    ghost:    { psychic:2, ghost:2, dark:.5, normal:0 },
    dragon:   { dragon:2, steel:.5, fairy:0 },
    dark:     { psychic:2, ghost:2, fighting:.5, dark:.5, fairy:.5 },
    steel:    { ice:2, rock:2, fairy:2, fire:.5, water:.5, electric:.5, steel:.5 },
    fairy:    { fighting:2, dragon:2, dark:2, fire:.5, poison:.5, steel:.5 },
  };
  const effOn = (atk, d1, d2) => (CHART[atk][d1] ?? 1) * (d2 ? (CHART[atk][d2] ?? 1) : 1);

  // six field duties, tested off base stats [hp,atk,def,spa,spd,spe]
  const DUTIES = [
    { key:"physatk",  name:"PHYS ATK",  hint:"ATK ≥ 100",              test:s => s[1] >= 100 },
    { key:"specatk",  name:"SPEC ATK",  hint:"SPA ≥ 100",              test:s => s[3] >= 100 },
    { key:"physwall", name:"PHYS WALL", hint:"DEF ≥ 100 · HP ≥ 60",    test:s => s[2] >= 100 && s[0] >= 60 },
    { key:"specwall", name:"SPEC WALL", hint:"SPD ≥ 95 · HP ≥ 60",     test:s => s[4] >= 95  && s[0] >= 60 },
    { key:"speed",    name:"SPEED",     hint:"SPE ≥ 105",              test:s => s[5] >= 105 },
    { key:"support",  name:"SUPPORT",   hint:"HP ≥ 85 · both DEF ≥ 70",test:s => s[0] >= 85 && s[2] >= 70 && s[4] >= 70 },
  ];

  // per-unit combat class from base stats
  const archetype = s => {
    const [hp, atk, def, spa, spd] = s, spe = s[5];
    const off = Math.max(atk, spa), phys = atk >= spa;
    const bulkP = hp * def, bulkS = hp * spd, bst = s.reduce((a,b) => a+b, 0);
    if (off >= 100 && spe >= 100) return phys ? "PHYS SWEEPER" : "SPEC SWEEPER";
    if (atk >= 100 && spa >= 100) return "MIXED ATTACKER";
    if (off >= 115) return phys ? "WALLBREAKER" : "SPEC BREAKER";
    if (bulkP >= 9000 && bulkS >= 9000) return "FORTRESS";
    if (bulkP >= 8200) return "PHYS WALL";
    if (bulkS >= 8200) return "SPEC WALL";
    if (spe >= 110) return "SCOUT";
    if (off >= 95) return phys ? "PHYS ATTACKER" : "SPEC ATTACKER";
    if (hp >= 85 && def >= 65 && spd >= 65) return "BULKY PIVOT";
    if (bst < 430) return "IN TRAINING";
    return "ALL-ROUNDER";
  };

  // whole-squad diagnostic. team = array of unit objects (nulls already stripped)
  const analyzeTeam = (team) => {
    const defRows = {}, exposed = [], secure = [];
    TYPES.forEach(atk => {
      let weak = 0, resist = 0;
      team.forEach(p => { const m = effOn(atk, p.t1, p.t2); if (m >= 2) weak++; if (m < 1) resist++; });
      let status = "mid";
      if (weak >= 3 || (weak >= 2 && resist === 0)) { status = "bad"; exposed.push({ t: atk, weak }); }
      else if (weak === 0 && resist >= Math.min(3, team.length)) { status = "good"; secure.push(atk); }
      else if (weak > resist) status = "soft";
      defRows[atk] = { weak, resist, status };
    });

    const stabs = [...new Set(team.flatMap(p => [p.t1, p.t2]).filter(Boolean))];
    const offRows = {}, uncovered = [], walled = [];
    TYPES.forEach(def => {
      const best = stabs.length ? Math.max(...stabs.map(atk => effOn(atk, def, null))) : 0;
      offRows[def] = best;
      if (best < 1) { walled.push(def); uncovered.push(def); }
      else if (best < 2) uncovered.push(def);
    });

    const staffed = DUTIES.filter(d => team.some(p => d.test(p.stats)));
    const vacant  = DUTIES.filter(d => !team.some(p => d.test(p.stats)));

    // readiness: same deduction weights as ampg, but reported as a positive meter
    let score = 100; const notes = [];
    const dEx = Math.min(28, exposed.length * 9);
    if (dEx) { score -= dEx; notes.push({ tag: "shared weakness", val: dEx, types: exposed.map(x => x.t) }); }
    const dWall = Math.min(16, walled.length * 8);
    if (dWall) { score -= dWall; notes.push({ tag: "walled attacks", val: dWall, types: walled }); }
    const neutralOnly = uncovered.length - walled.length;
    const dOff = Math.min(15, Math.max(0, neutralOnly - 1) * 3);
    if (dOff) { score -= dOff; notes.push({ tag: "coverage gaps", val: dOff }); }
    const dRole = Math.min(30, vacant.length * 6);
    if (dRole) { score -= dRole; notes.push({ tag: "unfilled duties", val: dRole, roles: vacant.map(d => d.name) }); }
    if (team.length < 6) { const dSize = (6 - team.length) * 4; score -= dSize; notes.push({ tag: "roster forming", val: dSize }); }
    score = Math.max(0, Math.round(score));

    return { defRows, exposed, secure, stabs, offRows, uncovered, walled, staffed, vacant, score, notes, count: team.length };
  };

  // no-fail readiness tier. NEVER a pass/fail — the floor still reads as progress.
  const READ_TIERS = [
    { min: 88, label: "COMBAT READY", sub: "fully outfitted for the field" },
    { min: 72, label: "FIELD READY",  sub: "solid kit — a few gaps to close" },
    { min: 55, label: "HOLDING",      sub: "serviceable — room to sharpen" },
    { min: 35, label: "OUTFITTING",   sub: "coming together — keep building" },
    { min: 0,  label: "OUTFITTING",   sub: "early days — add and adjust" },
  ];
  const readiness = (A) => {
    if (!A.count) return { label: "AWAITING PARTY", sub: "file a unit to begin", score: A.score, items: 0 };
    const tier = READ_TIERS.find(t => A.score >= t.min);
    const items = A.exposed.length + A.walled.length + A.vacant.length;
    return { label: tier.label, sub: tier.sub, score: A.score, items };
  };

  let DEX = [];
  const byId = new Map();
  let MOVES = [];                                   // move catalog {id,name,type,key} for SQUAD
  const moveById = new Map();
  let NATIVE_DEX = {}, NATIVE_LOADED = false;       // per-region (gen 1..9) Set of natively-obtainable national dex nos
  let party = [null, null, null, null, null, null];
  let partyMoves = [[null,null,null,null],[null,null,null,null],[null,null,null,null],
                    [null,null,null,null],[null,null,null,null],[null,null,null,null]]; // 4 move ids per slot
  let activeSlot = -1;   // slot whose readout is shown in the console
  let targetSlot = -1;   // slot currently being filled from search
  let genFilter = 0;     // 0 = ALL, else 1..9

  // ---------------------------------------------------------------- audio ---
  // A small tactile synth: shaped two-part voices (soft triangles through a
  // lowpass, with pitch glides) plus a noise-transient "click" so every tap has
  // a satisfying physical attack. Kept quiet + a touch randomised so repeats
  // never feel robotic.
  let actx = null, master = null;
  const ensureAudio = () => {
    if (!actx) {
      try {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        master = actx.createGain(); master.gain.value = 0.85; master.connect(actx.destination);
      } catch { actx = null; }
    }
    if (actx && actx.state === "suspended") actx.resume().catch(() => {});
    return actx;
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  // one shaped oscillator voice (freq glide f0->f1, gain env, lowpass)
  const voice = (f0, f1, dur, { type = "triangle", vol = 0.05, when = 0, glide = 0.55, cut = 4200, detune = 0 } = {}) => {
    const c = ensureAudio(); if (!c) return;
    const t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * glide);
    lp.type = "lowpass"; lp.frequency.value = cut; lp.Q.value = 0.7;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(master || c.destination);
    o.start(t); o.stop(t + dur + 0.03);
  };
  // a tiny filtered-noise transient — the "click" of a physical press
  const click = (vol = 0.03, dur = 0.02, when = 0) => {
    const c = ensureAudio(); if (!c) return;
    const t = c.currentTime + when, n = c.createBufferSource();
    const buf = c.createBuffer(1, Math.max(1, Math.ceil(c.sampleRate * dur)), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    n.buffer = buf;
    const g = c.createGain(), hp = c.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 1500;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(hp).connect(g).connect(master || c.destination);
    n.start(t); n.stop(t + dur + 0.01);
  };
  const sfx = {
    open:   () => { click(0.018); voice(360, 560, 0.15, { vol: 0.05, cut: 3200 }); },
    select: () => { const f = rnd(650, 700); click(0.024); voice(f, f * 1.5, 0.11, { vol: 0.055, cut: 5200 }); },
    // add / confirm: a bright rising C–G–C arpeggio with a sparkle tail
    add:    () => { click(0.03);
                    voice(523, 523, 0.10, { vol: 0.06 });
                    voice(784, 784, 0.13, { vol: 0.055, when: 0.06 });
                    voice(1046, 1150, 0.18, { type: "sine", vol: 0.042, when: 0.12, cut: 6500 }); },
    clear:  () => { click(0.02, 0.03); voice(380, 180, 0.17, { type: "sawtooth", vol: 0.045, cut: 1700 }); },
    tick:   () => { click(0.02, 0.014); voice(1180, 1180, 0.028, { type: "square", vol: 0.022, cut: 6000 }); },
  };
  // ease-out count-up for satisfying number reveals (respects reduced-motion)
  const countUp = (el, to, dur = 520) => {
    if (!el) return;
    const target = Math.round(to);
    if (prefersReduced) { el.textContent = target; return; }
    const start = performance.now(), ease = p => 1 - Math.pow(1 - p, 3);
    const step = now => {
      const p = Math.min(1, (now - start) / dur);
      el.textContent = Math.round(target * ease(p));
      if (p < 1) requestAnimationFrame(step); else el.textContent = target;
    };
    requestAnimationFrame(step);
  };

  // ------------------------------------------------- motion / parallax ------
  // The blue grid backdrop is alive to the phone's motion: tilting slides it
  // (deviceorientation) and actually moving/shaking it ripples it (devicemotion).
  let motionAsked = false;
  const requestMotion = () => {
    if (motionAsked) return; motionAsked = true;
    // iOS 13+ gates BOTH orientation and motion behind a gesture-triggered grant
    const ask = E => { if (E && typeof E.requestPermission === "function") E.requestPermission().catch(() => {}); };
    ask(window.DeviceOrientationEvent);
    ask(window.DeviceMotionEvent);
  };
  const firstTouchUnlock = () => { ensureAudio(); requestMotion(); };

  const initTactile = () => {
    const root = document.documentElement, phone = $("#phone");
    const MAX = 18;                        // px of parallax travel per axis
    const clamp = (v, m) => Math.max(-m, Math.min(m, v));
    let raf = 0;
    let bx = 0, by = 0;                     // base target (tilt / pointer)
    let mx = 0, my = 0;                     // live motion impulse (decays -> springs back)
    let cx = 0, cy = 0;                     // smoothed value written to CSS vars

    const step = () => {
      const tx = clamp(bx + mx, MAX), ty = clamp(by + my, MAX);
      cx += (tx - cx) * 0.14; cy += (ty - cy) * 0.14;
      mx *= 0.88; my *= 0.88;              // impulse bleeds off after a move/shake
      root.style.setProperty("--px", cx.toFixed(2) + "px");
      root.style.setProperty("--py", cy.toFixed(2) + "px");
      const live = Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05 ||
                   Math.abs(mx) > 0.05 || Math.abs(my) > 0.05;
      raf = live ? requestAnimationFrame(step) : 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(step); };

    // desktop: pointer drives the base target
    phone.addEventListener("pointermove", e => {
      const r = phone.getBoundingClientRect();
      bx = ((e.clientX - r.left) / r.width  - 0.5) * 2 * MAX;
      by = ((e.clientY - r.top)  / r.height - 0.5) * 2 * MAX;
      kick();
    }, { passive: true });
    phone.addEventListener("pointerleave", () => { bx = 0; by = 0; kick(); });

    // device tilt drives the base target — grid slides as you angle the phone
    window.addEventListener("deviceorientation", e => {
      if (e.gamma == null && e.beta == null) return;
      bx = clamp((e.gamma || 0) * 0.85, MAX);
      by = clamp(((e.beta || 0) - 42) * 0.70, MAX);
      kick();
    }, { passive: true });

    // raw device MOTION adds a live impulse — moving/shaking ripples the grid.
    // Use gravity-excluded acceleration only (accelerationIncludingGravity would
    // pin a constant ~1g offset); if unavailable, tilt alone still drives it.
    window.addEventListener("devicemotion", e => {
      const a = e.acceleration;
      if (!a || (a.x == null && a.y == null)) return;
      mx = clamp(mx + (a.x || 0) * 0.9, MAX * 1.4);
      my = clamp(my - (a.y || 0) * 0.9, MAX * 1.4);
      kick();
    }, { passive: true });
  };

  // ------------------------------------------------------------ persist -----
  const loadParty = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(PARTY_KEY));
      if (Array.isArray(raw)) for (let i = 0; i < 6; i++) party[i] = byId.has(raw[i]) ? raw[i] : null;
    } catch {}
    activeSlot = party.findIndex(x => x != null);
  };
  const saveParty = () => { try { localStorage.setItem(PARTY_KEY, JSON.stringify(party)); } catch {} };

  // --------------------------------------------------------- rendering ------
  const typeChip = t => t ? `<span class="tchip t-${t}">${t}</span>` : "";
  const typeDots = u => `<i class="t-${u.t1}"></i>${u.t2 ? `<i class="t-${u.t2}"></i>` : ""}`;

  const updateCount = () => { $("#partyCount").textContent = party.filter(x => x != null).length; };

  const renderLoadout = () => {
    const el = $("#loadout");
    el.innerHTML = party.map((id, i) => {
      const u = id != null ? byId.get(id) : null;
      const cls = ["cap", u ? "filled" : "empty", i === activeSlot && u ? "active" : ""].join(" ").trim();
      const inner = u
        ? `<img class="cap-sprite" src="${SPRITE(u.id)}" onerror="${SPRITE_FALLBACK(u.dexno)}" alt="">
           <span class="cap-name">${u.name}</span>
           <span class="cap-typedots">${typeDots(u)}</span>`
        : `<span class="cap-plus">+</span><span class="cap-empty-lbl">EMPTY</span>`;
      return `<div class="${cls}" data-slot="${i}">
                <div class="cap-in">${inner}</div>
                <span class="cap-idx">0${i + 1}</span>
                ${u ? `<button class="cap-x" data-x="${i}" aria-label="Clear slot ${i + 1}">&times;</button>` : ""}
              </div>`;
    }).join("");
  };

  const statRow = (lbl, v, max) =>
    `<div class="stat-row">
       <span class="stat-lbl">${lbl}</span>
       <div class="stat-bar"><div class="stat-fill" data-w="${Math.min(100, v / max * 100).toFixed(1)}"></div></div>
       <span class="stat-val" data-v="${v}">0</span>
     </div>`;

  const renderConsole = () => {
    const el = $("#console");
    const id = activeSlot >= 0 ? party[activeSlot] : null;
    const u = id != null ? byId.get(id) : null;
    if (!u) {
      el.innerHTML =
        `<div class="con-empty">
           <div class="ce-ring"></div>
           <p>NO UNIT SELECTED<br><b>ADD</b> OR <b>TAP</b> A SLOT ABOVE</p>
         </div>`;
      return;
    }
    el.innerHTML =
      `<div class="unit">
         <div class="unit-top">
           <div class="specimen"><img src="${SPRITE(u.id)}" onerror="${SPRITE_FALLBACK(u.dexno)}" alt="${u.name}"></div>
           <div class="unit-meta">
             <div class="unit-dex">NO.${String(u.id).padStart(4, "0")} &middot; SLOT&nbsp;0${activeSlot + 1}</div>
             <div class="unit-name">${u.name}</div>
             <div class="unit-gen">GENERATION&nbsp;${ROMAN[u.gen - 1]}</div>
             <div class="unit-types">${typeChip(u.t1)}${typeChip(u.t2)}</div>
             <button class="swap-btn" data-swap="${activeSlot}">&#8635; SWAP UNIT</button>
           </div>
         </div>
         <div class="stats">
           ${u.stats.map((v, i) => statRow(STAT_LBL[i], v, 200)).join("")}
           <div class="stat-row bst">
             <span class="stat-lbl">BST</span>
             <div class="stat-bar"><div class="stat-fill" data-w="${Math.min(100, u.bst / 720 * 100).toFixed(1)}"></div></div>
             <span class="stat-val" data-v="${u.bst}">0</span>
           </div>
           <div class="stat-track-note">BASE STATS // ANALYSIS MODULE PENDING &mdash; v0.1</div>
         </div>
       </div>`;
    // cascade the gauges in from 0 and count the numbers up alongside them
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.querySelectorAll(".stat-fill").forEach((f, i) => {
        f.style.transitionDelay = (i * 55) + "ms";
        f.style.width = f.dataset.w + "%";
      });
      el.querySelectorAll(".stat-val").forEach((s, i) =>
        setTimeout(() => countUp(s, +s.dataset.v, 460), prefersReduced ? 0 : i * 55));
    }));
  };

  // ---------------------------------------------------- home / squad view ----
  const VIEW_KEY = "pokemeter-view-v1";
  const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let view = "team";
  let viewBusy = false;               // a view transition is animating — ignore new switches
  let squadFocus = 0;                 // which SQUAD hero tile is focused (its moves fill the bar)
  const VIEWS = ["team", "home", "squad", "sim"];
  // one-way cycle; the flip shows the mode you'll advance to next. The label
  // strings are offset by one so the button READS "HOME / TEAM / SQUAD / SIM" as
  // you press through (team's meta carries SIM's label, sim's carries SQUAD's).
  const VIEW_META = {
    team:  { label: "SIM",   sub: "COMBAT&nbsp;PROJECTION" },
    home:  { label: "HOME",  sub: "PARTY&nbsp;DIAGNOSTIC" },
    squad: { label: "TEAM",  sub: "UNIT&nbsp;LOADOUT" },
    sim:   { label: "SQUAD", sub: "BATTLE&nbsp;LOADOUT" },
  };
  const nextView = () => VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length];
  const updateFlipLabel = () => {
    const m = VIEW_META[nextView()];
    $("#vfLabel").textContent = m.label;
    $("#vfSub").innerHTML = m.sub;
  };
  const teamUnits = () => party.filter(x => x != null).map(id => byId.get(id));

  const chips = (arr, mod) => arr.length
    ? arr.map(t => `<span class="tchip t-${t}${mod ? " " + mod : ""}">${t}</span>`).join("")
    : `<span class="hnone">—</span>`;

  // compact 3-letter type tags for the coverage matrix
  const TYPE_ABBR = { normal:"NOR", fire:"FIR", water:"WAT", electric:"ELC", grass:"GRS",
    ice:"ICE", fighting:"FIG", poison:"PSN", ground:"GRD", flying:"FLY", psychic:"PSY",
    bug:"BUG", rock:"ROC", ghost:"GHO", dragon:"DRA", dark:"DRK", steel:"STL", fairy:"FAI" };
  // coverage chart splits into 3 clean blocks by NET SIGN (members weak vs resisting):
  // neg = exposed (red), even = neutral (grey), pos = secure (green). Display-only —
  // this is separate from the readiness `status`/scoring thresholds.
  const netCat = (w, r) => (w > r ? "neg" : w < r ? "pos" : "even");
  const sortedTypes = (A) => TYPES.slice().sort((a, b) => {
    const A1 = A.defRows[a], B1 = A.defRows[b];
    const ma = A1.weak - A1.resist, mb = B1.weak - B1.resist;
    if (mb !== ma) return mb - ma;          // most weak-leaning first -> 3 contiguous blocks
    return B1.weak - A1.weak;               // tie: more interactions first
  });

  const priorityLine = (A) => {
    if (!A.count) return "file your party to begin";
    if (A.exposed.length) return `patch the <b>${A.exposed[0].t}</b> weak point`;
    if (A.vacant.length)  return `staff a <b>${A.vacant[0].name}</b>`;
    if (A.walled.length)  return `find an answer to <b>${A.walled[0]}</b>`;
    return "well-rounded — fine-tune to taste";
  };

  // one flip-tile: front headline, back drill-down
  const tile = (mods, front, back) =>
    `<div class="htile ${mods}" tabindex="0">
       <div class="htile-3d">
         <div class="htile-face htile-front">${front}</div>
         <div class="htile-face htile-back">${back}</div>
       </div>
     </div>`;

  const updateStrip = (A) => {
    A = A || analyzeTeam(teamUnits());
    const actionable = A.count && (A.exposed.length || A.vacant.length || A.walled.length);
    $("#viewFlip").classList.toggle("alert", !!actionable);
  };

  const renderHome = () => {
    const el = $("#home");
    const units = teamUnits();
    const A = analyzeTeam(units);
    updateStrip(A);

    if (!units.length) {
      el.innerHTML =
        `<div class="home-empty">
           <div class="ce-ring"></div>
           <p>NO PARTY ON FILE<br><b>FLIP TO TEAM</b> AND FILE A UNIT</p>
         </div>`;
      return;
    }

    const R = readiness(A);
    const neutral = A.uncovered.filter(t => !A.walled.includes(t));

    // READINESS — qualitative front, opt-in /100 on the back
    const readTile = tile("t-read span2",
      `<div class="rt-head"><span class="rt-kicker">PARTY READINESS</span><span class="ht-flip">TAP · INDEX</span></div>
       <div class="rt-tier">${R.label}</div>
       <div class="rt-sub">${R.sub}</div>
       <div class="rmeter"><div class="rmeter-fill" data-w="${R.score}"></div></div>
       <div class="rt-priority">PRIORITY&nbsp;//&nbsp;${priorityLine(A)}</div>`,
      `<div class="rt-head"><span class="rt-kicker">READINESS INDEX</span><span class="ht-flip">TAP · BACK</span></div>
       <div class="rt-score">${R.score}<small>/100</small></div>
       <div class="rt-notes">${A.notes.length
         ? A.notes.map(n => `<div class="rt-note"><b>−${n.val}</b> ${n.tag}${
             n.types ? ` <i>${n.types.slice(0, 5).join(", ")}</i>` : ""}${
             n.roles ? ` <i>${n.roles.slice(0, 3).join(", ")}</i>` : ""}</div>`).join("")
         : `<div class="rt-note ok">no deductions — fully outfitted</div>`}</div>
       <div class="rt-foot">this reads the field's threats, not your taste</div>`);

    // DEFENSIVE COVERAGE — the central chart. Collapsed = per-type net grid;
    // TAP expands to the full per-member matrix (fits screen, no scrolling).
    const covCell = t => {
      const r = A.defRows[t];
      return `<div class="cov-cell nt-${netCat(r.weak, r.resist)}"><span class="cov-t t-${t}">${TYPE_ABBR[t]}</span><span class="cov-net">${r.weak}/${r.resist}</span></div>`;
    };
    const coverTile =
      `<div class="htile t-cover" tabindex="0">
         <div class="htile-face htile-front">
           <div class="ht-kicker">DEFENSIVE COVERAGE<span class="ht-flip">TAP · EXPAND ⤢</span></div>
           <div class="cov-grid">${sortedTypes(A).map(covCell).join("")}</div>
         </div>
       </div>`;

    // OFFENSE
    const offHead = !A.uncovered.length ? `<span class="hgood">FULL SPECTRUM</span>`
      : A.walled.length ? `<span class="hwarn">${A.walled.length} WALLED</span>`
      : `<span class="hsoft">${A.uncovered.length} GAPS</span>`;
    const offTile = tile("t-off",
      `<div class="ht-kicker">OFFENSE<span class="ht-flip">›</span></div>
       <div class="ht-head2">${offHead}</div>
       <div class="ht-rowlbl">STAB</div>
       <div class="ht-chips">${chips(A.stabs)}</div>`,
      `<div class="ht-kicker">OFFENSE · DETAIL</div>
       ${A.walled.length ? `<div class="ht-line"><span class="hwarn">WALLED</span>${chips(A.walled, "warn")}</div>` : ""}
       ${neutral.length ? `<div class="ht-line"><span class="hsoft">SOFT</span>${chips(neutral)}</div>` : ""}
       ${!A.uncovered.length ? `<div class="ht-line hgood">every type takes super-effective STAB</div>` : ""}`);

    // DUTY ROSTER
    const dutyTile = tile("t-duty span2",
      `<div class="ht-kicker">DUTY ROSTER<span class="ht-flip">›</span></div>
       <div class="duty-strip">${DUTIES.map(d => {
         const on = A.staffed.includes(d);
         return `<div class="dpip ${on ? "on" : "off"}"><span class="dpip-dot"></span><span class="dpip-name">${d.name}</span></div>`;
       }).join("")}</div>`,
      `<div class="ht-kicker">DUTY ROSTER · GAPS</div>
       ${A.vacant.length
         ? A.vacant.map(d => `<div class="ht-line"><b>${d.name}</b><i>${d.hint}</i></div>`).join("")
         : `<div class="ht-line hgood">all six duties staffed</div>`}`);

    el.innerHTML = `<div class="home-grid">${readTile}${coverTile}${offTile}${dutyTile}</div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const f = el.querySelector(".rmeter-fill"); if (f) f.style.width = f.dataset.w + "%";
    }));
  };

  const refreshDiagnostic = () => { updateStrip(); if (view === "home") renderHome(); if ($("#matrix").classList.contains("open")) renderMatrix(); };

  // ---- expandable full defensive-coverage matrix (no scroll — fit to screen) -
  const renderMatrix = () => {
    const units = teamUnits();
    const body = $("#matrixBody");
    if (!units.length) { body.innerHTML = `<div class="home-empty"><p>NO PARTY ON FILE</p></div>`; return; }
    const A = analyzeTeam(units);
    const head = `<tr><th class="cov-corner">VS</th>${units.map(u =>
      `<th><img class="cov-sprite" src="${SPRITE(u.id)}" onerror="${SPRITE_FALLBACK(u.dexno)}" alt=""></th>`).join("")}<th class="cov-neth">W/R</th></tr>`;
    let last = null;
    const rows = sortedTypes(A).map(atk => {
      const r = A.defRows[atk];
      const cat = netCat(r.weak, r.resist);
      const div = (last !== null && cat !== last) ? " cov-div" : ""; last = cat;
      const cells = units.map(u => {
        const m = effOn(atk, u.t1, u.t2);
        if (m === 1) return `<td></td>`;
        const cls = m >= 4 ? "cx4" : m >= 2 ? "cx2" : m === 0 ? "cx0" : m <= .25 ? "cx025" : "cx05";
        return `<td class="${cls}">×${m}</td>`;
      }).join("");
      return `<tr class="nt-${cat}${div}"><td class="cov-rt"><span class="cov-t t-${atk}">${TYPE_ABBR[atk]}</span></td>${cells}<td class="cov-net-td nt-${cat}">${r.weak}/${r.resist}</td></tr>`;
    }).join("");
    body.innerHTML = `<table class="cov"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
  };
  const openMatrix = () => { renderMatrix(); const el = $("#matrix"); el.classList.add("open"); el.setAttribute("aria-hidden", "false"); sfx.open(); };
  const closeMatrix = () => { const el = $("#matrix"); el.classList.remove("open"); el.setAttribute("aria-hidden", "true"); };

  // reveal the incoming screen (console or home) with a short delayed rise+fade
  // so it lands WITH the flying caps instead of snapping in ahead of them
  const revealScreen = (el) => {
    if (!el || prefersReduced) return;
    el.classList.remove("screen-enter");
    void el.offsetWidth;                       // reflow so the animation restarts
    el.classList.add("screen-enter");
    el.addEventListener("animationend", () => el.classList.remove("screen-enter"), { once: true });
  };

  // SQUAD transition: the six hero tiles DEAL IN one-by-one (scale+rise) and the
  // move bar rises after them — an "assembling the battle squad" feel. On exit the
  // tiles collapse out, then a callback swaps to the next view.
  // hero tiles deal in/out; the move bar (the SQUAD "screen") is handled by the
  // morphing screen ghost, so it isn't animated here.
  const DEAL_EASE_IN = "cubic-bezier(.2,.9,.3,1)", DEAL_EASE_OUT = "cubic-bezier(.4,0,.6,1)";
  const dealSquadTilesIn = () => {
    if (prefersReduced) return;
    [...$("#squadGrid").children].forEach((t, i) => t.animate(
      [{ opacity: 0, transform: "scale(.86) translateY(12px)" }, { opacity: 1, transform: "none" }],
      { duration: 300, delay: i * 46, easing: DEAL_EASE_IN, fill: "backwards" }));
  };
  const dealSquadOut = (done) => {
    if (prefersReduced) { done(); return; }
    const tiles = [...$("#squadGrid").children];
    tiles.forEach((t, i) => t.animate(
      [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.9) translateY(8px)" }],
      { duration: 210, delay: i * 30, easing: DEAL_EASE_OUT, fill: "forwards" }));
    setTimeout(done, 210 + (tiles.length - 1) * 30 + 20);
  };

  // -------------------------------------------------- morphing screen -------
  // Each view's "screen": team = the readout console, home = the diagnostic
  // cockpit, squad = the bottom move bar. A single blank ghost persists across
  // the switch and morphs its geometry from one to the next.
  const SCREEN_SEL = { team: "#console", home: "#home", squad: "#moveBar", sim: "#sim" };
  const SCREEN_EL = v => $(SCREEN_SEL[v]);
  const LOOK_PROPS = ["backgroundColor", "backgroundImage", "backgroundSize", "backgroundPosition",
    "boxShadow", "borderStyle", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
    "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor", "borderRadius"];
  let screenGhost = null, morphToken = 0;
  const beginScreenMorph = (prev) => {
    if (prefersReduced) return null;
    const phone = $("#phone"), fromEl = SCREEN_EL(prev);
    if (!phone || !fromEl) return null;
    const pr = phone.getBoundingClientRect(), fr = fromEl.getBoundingClientRect();
    if (fr.width < 4 || fr.height < 4) return null;
    if (!screenGhost) { screenGhost = document.createElement("div"); screenGhost.className = "screen-ghost"; phone.appendChild(screenGhost); }
    const g = screenGhost, cs = getComputedStyle(fromEl), tok = ++morphToken;
    LOOK_PROPS.forEach(p => { g.style[p] = cs.getPropertyValue(p.replace(/[A-Z]/g, m => "-" + m.toLowerCase())); });
    g.style.transition = "none";
    g.style.left = (fr.left - pr.left) + "px"; g.style.top = (fr.top - pr.top) + "px";
    g.style.width = fr.width + "px"; g.style.height = fr.height + "px";
    g.style.display = "block"; g.style.opacity = "0";
    void g.offsetWidth;
    return {
      // fade the leaving screen out to the blank ghost, then continue
      blank(cb) {
        g.style.transition = "opacity .14s ease"; g.style.opacity = "1";
        setTimeout(() => { if (tok === morphToken) cb(); }, 120);
      },
      // morph the ghost to the incoming screen's geometry, then fade it in
      run(next) {
        const toEl = SCREEN_EL(next);
        if (!toEl) { g.style.display = "none"; return; }
        const pr2 = phone.getBoundingClientRect(), tr = toEl.getBoundingClientRect();
        toEl.style.opacity = "0";
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (tok !== morphToken) return;
          const D = ".42s cubic-bezier(.55,0,.15,1)";
          g.style.transition = `left ${D}, top ${D}, width ${D}, height ${D}, border-radius ${D}`;
          g.style.left = (tr.left - pr2.left) + "px"; g.style.top = (tr.top - pr2.top) + "px";
          g.style.width = tr.width + "px"; g.style.height = tr.height + "px";
          g.style.borderRadius = getComputedStyle(toEl).borderRadius;
        }));
        setTimeout(() => {
          if (tok !== morphToken) return;
          toEl.style.transition = "opacity .2s ease"; toEl.style.opacity = "1";
          g.style.transition = "opacity .2s ease"; g.style.opacity = "0";
          setTimeout(() => {
            if (tok !== morphToken) return;
            g.style.display = "none"; toEl.style.transition = ""; toEl.style.opacity = "";
          }, 210);
        }, 440);
      },
    };
  };

  // reorient the six caps between the top strip and the right rail as a two-phase
  // MECHANISM instead of a diagonal flight:
  //   (1) GATHER — every cap slides to the shared top-right corner into a fanned stack
  //   (2) DEAL   — they extend out one-by-one along the new axis (down the rail /
  //                left along the strip)
  // Caps only ever ride the top edge + right edge, so nothing crosses the central
  // screen; the panel (revealScreen) stays hidden through the gather and fades in as
  // they deal. FLIP-measured: a cap's untransformed box IS its TARGET slot, so every
  // waypoint is a translate from there; `.reorienting` keeps caps above the panel.
  let reorientTimer = 0, reorientToken = 0;
  const reorient = (caps, first) => {
    if (!first || prefersReduced) return;
    const phone = $("#phone");
    const token = ++reorientToken;
    clearTimeout(reorientTimer);
    caps.forEach(c => { (c.__anims || []).forEach(a => a.cancel()); c.__anims = []; });  // drop any in-flight
    phone.classList.add("reorienting");

    const n = caps.length;
    const last = caps.map(c => c.getBoundingClientRect());
    // stack / pivot corner = the target slot nearest the top-right:
    //   rail (home) -> the TOP cap (0);  strip (team) -> the RIGHT cap (n-1)
    const anchor = view === "home" ? 0 : n - 1;
    const cx = last[anchor].left, cy = last[anchor].top;

    const DG = 250, GST = 12, DD = 260, DST = 52;   // gather (near-together) / deal (one-by-one)
    const gatherAnims = caps.map((c, i) => {
      const f = first[i], l = last[i], dist = Math.abs(i - anchor), fan = dist * 2;
      c.style.transformOrigin = "top left";
      c.__dist = dist;
      const startT = `translate(${(f.left - l.left).toFixed(1)}px, ${(f.top - l.top).toFixed(1)}px) scale(${(f.width / l.width) || 1}, ${(f.height / l.height) || 1})`;
      // fanned stack leans toward the deal axis (down for the rail, left for the strip)
      c.__cornerT = view === "home"
        ? `translate(${(cx - l.left).toFixed(1)}px, ${(cy - l.top + fan).toFixed(1)}px) scale(1)`
        : `translate(${(cx - l.left - fan).toFixed(1)}px, ${(cy - l.top).toFixed(1)}px) scale(1)`;
      const a = c.animate([{ transform: startT }, { transform: c.__cornerT }],
        { duration: DG, delay: i * GST, easing: "cubic-bezier(.5,0,.4,1)", fill: "both" });
      c.__anims.push(a);
      return a;
    });

    // once the whole stack has gathered, deal each cap out to its slot in turn
    Promise.all(gatherAnims.map(a => a.finished)).then(() => {
      if (token !== reorientToken) return;
      caps.forEach(c => {
        const d = c.animate([{ transform: c.__cornerT }, { transform: "none" }],
          { duration: DD, delay: c.__dist * DST, easing: "cubic-bezier(.2,.85,.3,1)", fill: "both" });
        c.__anims.push(d);
      });
    }).catch(() => {});

    const total = DG + (n - 1) * GST + DD + (n - 1) * DST + 90;
    reorientTimer = setTimeout(() => {
      if (token !== reorientToken) return;
      caps.forEach(c => {
        (c.__anims || []).forEach(a => a.cancel());
        c.__anims = []; c.style.transform = c.style.transformOrigin = "";
        delete c.__cornerT; delete c.__dist;
      });
      phone.classList.remove("reorienting");
    }, total);
  };

  // pin the right rail to exactly cover the .home region (top/height are dynamic
  // across preview vs standalone + safe-area, so measure rather than hardcode)
  const layoutRail = () => {
    const rail = $("#loadout"), home = $("#home");
    if (view === "home") { rail.style.top = home.offsetTop + "px"; rail.style.height = home.offsetHeight + "px"; }
    else { rail.style.top = ""; rail.style.height = ""; }
  };

  const applyView = (next, animate = true) => {
    if (next === view || !VIEWS.includes(next)) return;
    if (viewBusy && animate) return;                 // ignore switches mid-transition
    const prev = view;
    if (animate) { viewBusy = true; setTimeout(() => { viewBusy = false; }, prev === "squad" ? 1150 : 980); }

    // swap the view + run the piece animations; `morph` (if present) carries the
    // persistent screen from the old geometry to the new one.
    const commit = (morph) => {
      const caps = [...$("#loadout").querySelectorAll(".cap")];
      // the cap "stack & deal" reorient runs for the team<->home pair; SQUAD has
      // its own hero tiles that deal in/out; the SCREEN always morphs (via `morph`).
      const useReorient = animate && ((prev === "team" && next === "home") || (prev === "home" && next === "team"));
      const first = useReorient ? caps.map(c => c.getBoundingClientRect()) : null;
      view = next;
      const phone = $("#phone");
      phone.classList.toggle("view-home", view === "home");
      phone.classList.toggle("view-squad", view === "squad");
      phone.classList.toggle("view-sim", view === "sim");
      updateFlipLabel();
      $("#viewFlip").setAttribute("aria-pressed", view !== "team" ? "true" : "false");
      if (view === "home") renderHome();
      if (view === "squad") renderSquad();
      if (view === "sim") { simState = "deploy"; renderSim(); }   // always land on deploy, fresh eligibility
      layoutRail();
      try { localStorage.setItem(VIEW_KEY, view); } catch {}
      if (animate) {
        if (useReorient) reorient(caps, first);
        if (view === "squad") dealSquadTilesIn();
        if (morph) morph.run(next);
        else revealScreen(SCREEN_EL(view));      // fallback (reduced-motion / capture failed)
      }
    };

    if (!animate) { commit(null); return; }

    sfx.open();
    const morph = beginScreenMorph(prev);        // capture + place the ghost over the leaving screen
    const start = () => (morph ? morph.blank(() => commit(morph)) : commit(null));
    // leaving SQUAD: collapse the hero tiles out first, then blank + swap + morph
    if (prev === "squad") dealSquadOut(start);
    else start();
  };

  // ---------------------------------------------------------------- skin ----
  // The header switch is a ONE-WAY cycle through the shell iterations. Each skin
  // maps to a set of CSS classes on #phone (composed from small pieces):
  //   .skin-plastic  = the molded-overshell structure (red is the default colour)
  //   .plastic-cream = cream shell colour vars
  //   .screen-green  = green screen accent (overrides the cyan --* family)
  //   .poke          = two-tone structure — screen bezels + capsule/tile lips take
  //                    the accent colour --lip*  (.lip-cream / .lip-red set it)
  // A new iteration = one SKINS entry + its class list + (maybe) a colour block.
  const SKIN_KEY = "pokemeter-skin";
  const SKINS = ["hud", "plastic-red", "plastic-cream", "plastic-cream-green", "plastic-red-poke", "plastic-cream-poke",
    "plastic-cream-green-poke-gscreen", "plastic-cream-green-poke-bscreen", "plastic-cream-purple-poke",
    "plastic-cream-yellow-poke", "plastic-red-blue-poke"];
  const SKIN_CLASS = {
    "hud":                 [],
    "plastic-red":         ["skin-plastic"],
    "plastic-cream":       ["skin-plastic", "plastic-cream"],
    "plastic-cream-green": ["skin-plastic", "plastic-cream", "screen-green"],
    "plastic-red-poke":    ["skin-plastic", "poke", "lip-cream"],
    "plastic-cream-poke":  ["skin-plastic", "plastic-cream", "poke", "lip-red"],
    // cream shell + green lips, green screen then blue screen
    "plastic-cream-green-poke-gscreen": ["skin-plastic", "plastic-cream", "poke", "lip-green", "screen-green"],
    "plastic-cream-green-poke-bscreen": ["skin-plastic", "plastic-cream", "poke", "lip-green"],
    // cream shell + purple/lavender lips
    "plastic-cream-purple-poke":        ["skin-plastic", "plastic-cream", "poke", "lip-purple"],
    // cream shell + yellow/marigold lips
    "plastic-cream-yellow-poke":        ["skin-plastic", "plastic-cream", "poke", "lip-yellow"],
    // red shell + blue lips
    "plastic-red-blue-poke":            ["skin-plastic", "poke", "lip-blue"],
  };
  const ALL_SKIN_CLASSES = [...new Set(Object.values(SKIN_CLASS).flat())];
  let skin = "hud";
  const applySkin = (next, animate = true) => {
    skin = SKINS.includes(next) ? next : "hud";
    const phone = $("#phone");
    phone.classList.remove(...ALL_SKIN_CLASSES);
    if (SKIN_CLASS[skin].length) phone.classList.add(...SKIN_CLASS[skin]);
    // aria-pressed reads "a non-default shell is active" for this cycling switch
    $("#skinToggle").setAttribute("aria-pressed", skin !== "hud" ? "true" : "false");
    if (view === "home") layoutRail();
    try { localStorage.setItem(SKIN_KEY, skin); } catch {}
    if (animate) sfx.select();
  };
  const cycleSkin = () => applySkin(SKINS[(SKINS.indexOf(skin) + 1) % SKINS.length]);

  // ---------------------------------------------------- SQUAD view + moves ----
  // Six "hero" tiles (2x3). Tap a tile to FOCUS it; the full-width move bar edits
  // that unit's four moves, picked from data/moves.json (names + types).
  const MOVES_KEY = "pokemeter-moves-v1";
  const saveMoves = () => { try { localStorage.setItem(MOVES_KEY, JSON.stringify(partyMoves)); } catch {} };
  const loadMoves = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(MOVES_KEY));
      if (Array.isArray(raw)) for (let i = 0; i < 6; i++)
        partyMoves[i] = Array.isArray(raw[i])
          ? [0,1,2,3].map(k => moveById.has(raw[i][k]) ? raw[i][k] : null)
          : [null,null,null,null];
    } catch {}
  };
  const resetSlotMoves = (i) => { partyMoves[i] = [null, null, null, null]; saveMoves(); };
  const moveFillPips = (i) => (partyMoves[i] || [])
    .map((m, k) => `<i class="mvpip ${m != null ? "on" : ""}"></i>`).join("") || "";

  const renderSquad = () => {
    const grid = $("#squadGrid");
    if (party[squadFocus] == null) { const f = party.findIndex(x => x != null); squadFocus = f < 0 ? 0 : f; }
    grid.innerHTML = party.map((id, i) => {
      const u = id != null ? byId.get(id) : null;
      const cls = ["hero", u ? "filled" : "empty", i === squadFocus && u ? "focus" : ""].join(" ").trim();
      if (!u) return `<div class="${cls}" data-hi="${i}"><span class="hero-idx">0${i+1}</span>
                        <div class="hero-empty"><span class="he-plus">+</span><span>EMPTY</span></div></div>`;
      return `<div class="${cls}" data-hi="${i}" tabindex="0">
                <span class="hero-accent t-${u.t1}"></span>
                <span class="hero-idx">0${i+1}</span>
                <div class="hero-art"><img src="${SPRITE(u.id)}" onerror="${SPRITE_FALLBACK(u.dexno)}" alt="${u.name}"></div>
                <div class="hero-foot">
                  <div class="hero-name">${u.name}</div>
                  <div class="hero-row"><span class="hero-types">${typeDots(u)}</span><span class="hero-mv">${moveFillPips(i)}</span></div>
                </div>
              </div>`;
    }).join("");
    renderMoveBar();
  };

  const renderMoveBar = () => {
    const bar = $("#moveBar");
    const id = party[squadFocus];
    const u = id != null ? byId.get(id) : null;
    if (!u) { bar.innerHTML = `<div class="mb-empty">NO UNIT IN FOCUS &middot; <b>TAP A TILE</b></div>`; return; }
    const mv = partyMoves[squadFocus] || [null,null,null,null];
    bar.innerHTML =
      `<div class="mb-head"><span class="mb-idx">0${squadFocus+1}</span><span class="mb-unit">${u.name}</span><span class="mb-lbl">MOVE&nbsp;LOADOUT</span></div>
       <div class="mb-slots">${[0,1,2,3].map(k => {
         const m = mv[k] != null ? moveById.get(mv[k]) : null;
         return m
           ? `<div class="mslot filled" data-mv="${k}"><span class="mslot-top"><span class="mslot-k">${k+1}</span><i class="mslot-dot t-${m.type}"></i></span><span class="mslot-name">${m.name}</span><button class="mslot-x" data-mvx="${k}" aria-label="Clear move ${k+1}">&times;</button></div>`
           : `<div class="mslot empty" data-mv="${k}"><span class="mslot-k">${k+1}</span><span class="mslot-add">+ SET</span></div>`;
       }).join("")}</div>`;
  };

  // ---- move picker overlay (reuses the .search screen) ----
  let moveTarget = -1;
  const MOVE_CAP = 60;
  const openMovePick = (k) => {
    if (party[squadFocus] == null) return;
    moveTarget = k;
    $("#movepickSlot").textContent = "MOVE 0" + (k + 1);
    const input = $("#moveInput");
    input.value = ""; $("#moveClear").classList.remove("show");
    renderMoveResults("");
    const el = $("#movepick"); el.classList.add("open"); el.setAttribute("aria-hidden", "false");
    sfx.open();
    setTimeout(() => input.focus(), 340);
  };
  const closeMovePick = () => {
    const el = $("#movepick"); el.classList.remove("open"); el.setAttribute("aria-hidden", "true");
    moveTarget = -1;
  };
  const renderMoveResults = (q) => {
    const nq = norm(q);
    const own = new Set((partyMoves[squadFocus] || []).filter((x, k) => x != null && k !== moveTarget));
    let list = MOVES.filter(m => !nq || m.key.includes(nq));
    const total = list.length;
    if (nq) list.sort((a, b) => (b.key.startsWith(nq) - a.key.startsWith(nq)) || a.name.localeCompare(b.name));
    const shown = list.slice(0, MOVE_CAP);
    const res = $("#moveResults");
    if (!total) { res.innerHTML = `<div class="results-foot" style="padding-top:34px">NO MOVES MATCH QUERY</div>`; $("#moveResultsFoot").textContent = ""; return; }
    res.innerHTML = shown.map(m =>
      `<div class="res-row mv-row${own.has(m.id) ? " dup" : ""}" data-mvid="${m.id}">
         <span class="mv-typedot t-${m.type}"></span>
         <div class="res-body"><div class="res-name">${m.name}</div>
           <div class="res-sub"><span class="tchip t-${m.type}">${m.type}</span>${own.has(m.id) ? `<span class="mv-dupflag">ALREADY SET</span>` : ""}</div>
         </div>
       </div>`).join("");
    res.scrollTop = 0;
    $("#moveResultsFoot").innerHTML = `SHOWING <b>${shown.length}</b> / <b>${total}</b> MOVES`;
  };
  const assignMove = (moveId) => {
    if (moveTarget < 0 || party[squadFocus] == null) return;
    partyMoves[squadFocus][moveTarget] = moveId;
    saveMoves(); renderSquad(); closeMovePick(); sfx.add();
  };
  const clearMove = (k) => {
    if (party[squadFocus] == null) return;
    partyMoves[squadFocus][k] = null; saveMoves(); renderSquad(); sfx.clear();
  };

  // ==========================================================================
  // SIM — combat projection (the 4th mode). Two linked ideas share ONE engine:
  //  (1) THEATER ELIGIBILITY — the set of games this exact squad can legally play
  //      in (floor = max species / form / move generation).
  //  (2) COMBAT SIM — 100 curated engagements in a chosen eligible theater; the
  //      eligibility gate makes every matchup authentic.
  // v1 battle model: a DETERMINISTIC chain of 1v1 matchups off the type chart +
  // base stats — no turn engine, no move-power data. Fully reproducible, so a
  // given squad vs a given theater always scores the same across the 100 seeded
  // opponent teams. A unit's assigned MOVES drive its attacking coverage (see
  // coverageTypes/duelDamage); moves also set the eligibility floor. Per-move
  // POWER + physical/special category remain v2 (needs a moves.json re-dump).
  // ==========================================================================
  const SIM_KEY = "pokemeter-sim-theater-v1";
  const SIM_N = 100;
  const REGIONS = ["KANTO","JOHTO","HOENN","SINNOH","UNOVA","KALOS","ALOLA","GALAR","PALDEA"];

  // move gen ≈ national move-id range (keeps the floor honest with no re-dump)
  const MOVE_GEN_CAPS = [165, 251, 354, 467, 559, 621, 742, 826, 920];
  const moveGen = id => { for (let i = 0; i < MOVE_GEN_CAPS.length; i++) if (id <= MOVE_GEN_CAPS[i]) return i + 1; return 9; };
  // forms that debut later than their species raise the floor (ident suffix)
  const FORM_RULES = [
    [/-primal/, 6, "PRIMAL"], [/-mega/, 6, "MEGA"], [/-gmax/, 8, "GIGANTAMAX"],
    [/-alola/, 7, "ALOLAN"], [/-galar/, 8, "GALARIAN"], [/-hisui/, 8, "HISUIAN"], [/-paldea/, 9, "PALDEAN"],
  ];
  const formInfo = ident => { for (const [re, g, tag] of FORM_RULES) if (re.test(ident)) return { g, tag }; return null; };
  const unitFloor = u => { const f = formInfo(u.ident); return Math.max(u.gen, f ? f.g : 1); };

  // which theaters (generations) this squad can play in + the binding constraint
  const computeEligibility = () => {
    let floor = 1, bind = null;
    const raise = (g, kind, label, detail) => { if (g > floor) { floor = g; bind = { kind, label, detail }; } };
    for (let i = 0; i < 6; i++) {
      const id = party[i]; if (id == null) continue;
      const u = byId.get(id);
      raise(u.gen, "species", u.name, `debuts Gen ${ROMAN[u.gen - 1]}`);
      const f = formInfo(u.ident);
      if (f && f.g > u.gen) raise(f.g, "form", u.name, `${f.tag} form · Gen ${ROMAN[f.g - 1]}+`);
      (partyMoves[i] || []).forEach(mid => {
        if (mid == null) return;
        const g = moveGen(mid), mv = moveById.get(mid);
        raise(g, "move", mv ? mv.name : "MOVE", `on ${u.name} · Gen ${ROMAN[g - 1]} move`);
      });
    }
    const eligible = [];
    for (let g = floor; g <= 9; g++) eligible.push(g);
    return { floor, eligible, bind, count: teamUnits().length };
  };

  // ---- battle model: 1v1 matchup chain, deterministic ----------------------
  const mulberry32 = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  // a fighter's COVERAGE = the types it can attack with. If the unit has a moveset
  // (from SQUAD), coverage = its move types — so the moves you pick actually decide
  // what it threatens. With no moves set it falls back to its STAB types, so teams
  // you haven't touched behave exactly as before. (Per-move POWER + physical/special
  // category still need the moves.json re-dump — that's the v2 depth.)
  const coverageTypes = (u, moveIds) => {
    const ts = [];
    (moveIds || []).forEach(mid => { const m = mid != null ? moveById.get(mid) : null; if (m && !ts.includes(m.type)) ts.push(m.type); });
    return ts.length ? ts : [u.t1, u.t2].filter(Boolean);
  };

  // per-hit damage fA→fB: the fighter's BEST coverage type this turn (effectiveness
  // × STAB when the move type matches its own typing) against the matching defense.
  // Returns ~0..62; 0 when every coverage type is walled/immune. Attacker offense is
  // its dominant stat (atk vs spa); the opponent defends with the matching stat.
  const duelDamage = (fA, fB) => {
    const A = fA.u, B = fB.u;
    const phys = A.stats[1] >= A.stats[3];
    const off = phys ? A.stats[1] : A.stats[3];
    const defv = phys ? B.stats[2] : B.stats[4];
    const own = [A.t1, A.t2];
    let best = 0;
    for (const t of fA.cov) {
      const eff = effOn(t, B.t1, B.t2);
      const raw = off * eff * (own.includes(t) ? 1.5 : 1);   // STAB on own-type moves
      const dmg = 62 * raw / (raw + defv * 1.8);
      if (dmg > best) best = dmg;
    }
    return best;
  };
  // resolve two teams (fighter arrays) as a 1v1 chain; attrition (hp) carries between
  // duels. Each duel picks the best coverage move each side has vs the current foe.
  const battle = (teamA, teamB) => {
    const A = teamA.map(f => ({ f, hp: f.u.stats[0] })), B = teamB.map(f => ({ f, hp: f.u.stats[0] }));
    let ia = 0, ib = 0, guard = 0; const log = [];
    while (ia < A.length && ib < B.length && guard++ < 300) {
      const a = A[ia], b = B[ib];
      const dab = duelDamage(a.f, b.f), dba = duelDamage(b.f, a.f);
      if (dab <= 0 && dba <= 0) {                    // mutual immunity → bulk breaks the stalemate
        if (a.f.u.bst >= b.f.u.bst) { log.push({ by: "A", att: a.f.u, fell: b.f.u }); ib++; }
        else { log.push({ by: "B", att: b.f.u, fell: a.f.u }); ia++; }
        continue;
      }
      const strike = (att, dfn, dmg, side, adv) => {
        dfn.hp -= dmg;
        if (dfn.hp <= 0) { log.push({ by: side, att: att.f.u, fell: dfn.f.u }); adv(); return true; }
        return false;
      };
      const aFirst = a.f.u.stats[5] >= b.f.u.stats[5];
      if (aFirst) { if (strike(a, b, dab, "A", () => ib++)) continue; strike(b, a, dba, "B", () => ia++); }
      else        { if (strike(b, a, dba, "B", () => ia++)) continue; strike(a, b, dab, "A", () => ib++); }
    }
    return { win: ib >= B.length && ia < A.length, survA: A.length - ia, survB: B.length - ib, log };
  };

  // legendary / mythical / UB / paradox / treasure species (by national dex no.) —
  // the "not a normal wild mon" tier. Pseudo-legends (Dragonite, Garchomp, …) are
  // deliberately NOT here: they stay in the pool even with legendaries off.
  const LEGENDARY = new Set([
    144,145,146,150,151, 243,244,245,249,250,251,
    377,378,379,380,381,382,383,384,385,386,
    480,481,482,483,484,485,486,487,488,489,490,491,492,493,
    494,638,639,640,641,642,643,644,645,646,647,648,649,
    716,717,718,719,720,721,
    772,773,785,786,787,788,789,790,791,792,793,794,795,796,797,798,799,800,801,802,803,804,805,806,807,808,809,
    888,889,890,891,892,893,894,895,896,897,898,905,
    984,985,986,987,988,989,990,991,992,993,994,995,
    1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1014,1015,1016,1017,1020,1021,1022,1023,1024,1025,
  ]);
  // opponent species available by a gen: fully-evolved-ish foes (BST floor cuts
  // out fodder) and no battle-only forms. Sampled ~uniformly so opponent teams are
  // a fair cross-section. `legends` toggles the legendary/mythical tier in or out.
  const oppPoolCache = {};
  const opponentPool = (gen, legends) => {
    const key = gen + (legends ? "L" : "");
    return oppPoolCache[key] || (oppPoolCache[key] = DEX.filter(u =>
      unitFloor(u) <= gen && u.bst >= 430 &&
      !/-mega|-primal|-gmax|-totem|-eternamax|-ultra/.test(u.ident) &&
      (legends || !LEGENDARY.has(u.dexno))));
  };
  const pickTeam = (pool, size, rnd) => {
    const team = [], used = new Set(); let guard = 0;
    while (team.length < size && guard++ < size * 60) {
      const c = pool[(rnd() * pool.length) | 0];
      if (c && !used.has(c.id)) { used.add(c.id); team.push(c); }
    }
    return team;
  };

  const DEBRIEF_WIN = [
    (mvp, opp) => `<b>${mvp}</b> swept the back line after <b>${opp}</b> whiffed the lead.`,
    (mvp) => `Traded down into <b>${mvp}</b>, then closed it out clean.`,
    (mvp) => `Won the speed race — <b>${mvp}</b> mopped up the survivors.`,
    (mvp, opp) => `<b>${mvp}</b> broke the <b>${opp}</b> wall and ran it back.`,
  ];
  const DEBRIEF_LOSS = [
    (opp, t) => `<em>${opp}</em> outsped after the lead fell — no answer for <em>${t}</em>.`,
    (opp, t) => `<em>${opp}</em> broke through; the <em>${t}</em> check went down early.`,
    (opp) => `Lost the tempo — <em>${opp}</em> snowballed unchecked.`,
    (opp, t) => `Walled by <em>${opp}</em> — couldn't punch past <em>${t}</em>.`,
  ];
  const makeDebriefFor = e => {
    if (e.win) {
      const tally = {}; e.log.filter(l => l.by === "A").forEach(l => tally[l.att.name] = (tally[l.att.name] || 0) + 1);
      const mvp = Object.keys(tally).sort((x, y) => tally[y] - tally[x])[0] || e.you[0].name;
      return DEBRIEF_WIN[e.i % DEBRIEF_WIN.length](mvp, e.opp0 || "the lead");
    }
    const theirs = e.log.filter(l => l.by === "B");
    const oppMon = (theirs[theirs.length - 1] || {}).att;
    return DEBRIEF_LOSS[e.i % DEBRIEF_LOSS.length](oppMon ? oppMon.name : e.opp0, oppMon ? oppMon.t1 : "coverage");
  };

  const SIM_TIERS = [
    { min: 85, label: "DOMINANT",   sub: "the field can't answer this squad" },
    { min: 65, label: "FAVORED",    sub: "wins the majority of engagements" },
    { min: 45, label: "CONTESTED",  sub: "a coin-flip theater — sharpen the kit" },
    { min: 25, label: "OUTMATCHED", sub: "losing ground — patch the gaps" },
    { min: 0,  label: "OVERRUN",    sub: "this theater is hostile to the squad" },
  ];
  const simTier = pct => SIM_TIERS.find(t => pct >= t.min);

  // run the full gauntlet (fixed per theater) + aggregate MVP / liability / threat
  const runSim = gen => {
    // build the squad in slot order so each unit lines up with its moveset; `you`
    // holds the units (for display), `youF` the fighters (unit + move coverage)
    const you = [], youF = [];
    for (let i = 0; i < 6; i++) {
      const id = party[i]; if (id == null) continue;
      const u = byId.get(id); you.push(u); youF.push({ u, cov: coverageTypes(u, partyMoves[i]) });
    }
    if (!you.length) return null;
    const size = you.length, pool = opponentPool(gen, simLegends);
    if (pool.length < size) return null;
    const rnd = mulberry32((0x5E5E ^ Math.imul(gen, 0x9E3779B1)) >>> 0);
    const engs = []; let wins = 0;
    const koBy = {}, fellFirst = {}, threatBy = {}, typeOf = {};
    for (let i = 0; i < SIM_N; i++) {
      const opp = pickTeam(pool, size, rnd);                                    // wild foes: no moveset → STAB coverage
      const r = battle(youF, opp.map(u => ({ u, cov: [u.t1, u.t2].filter(Boolean) })));
      if (r.win) wins++;
      r.log.forEach(l => {
        typeOf[l.att.name] = l.att.t1; typeOf[l.fell.name] = l.fell.t1;
        if (l.by === "A") koBy[l.att.name] = (koBy[l.att.name] || 0) + 1;
        if (l.by === "B") threatBy[l.att.name] = (threatBy[l.att.name] || 0) + 1;
      });
      if (!r.win) { const firstOwn = r.log.find(l => l.by === "B");   // "fell first" is a defeat metric
        if (firstOwn) fellFirst[firstOwn.fell.name] = (fellFirst[firstOwn.fell.name] || 0) + 1; }
      engs.push({ i, win: r.win, survA: r.survA, survB: r.survB, size, you, opp, log: r.log,
        opp0: opp[0] ? opp[0].name : "", debrief: "" });
    }
    engs.forEach(e => e.debrief = makeDebriefFor(e));
    const top = o => Object.keys(o).sort((x, y) => o[y] - o[x])[0] || null;
    const mvp = top(koBy), liability = top(fellFirst), threat = top(threatBy);
    return { gen, size, wins, losses: SIM_N - wins, engs, typeOf, legends: simLegends,
      nonCanon: gen < computeEligibility().floor,
      mvp, mvpN: koBy[mvp] || 0, liability, liabilityN: fellFirst[liability] || 0,
      threat, threatN: threatBy[threat] || 0 };
  };

  // ---- SIM view: state machine (deploy → running → results → inspect) ------
  const LEG_KEY = "pokemeter-sim-legends-v1";
  let simState = "deploy";
  let simRun = null;
  let simTheater = 0;               // selected gen (1..9)
  let simLegends = (() => { try { return localStorage.getItem(LEG_KEY) !== "0"; } catch { return true; } })();  // legendaries in the opponent pool (default on)
  let inspIdx = 0, inspLossOnly = false;

  const initSimTheater = E => {
    // any region 1..9 is selectable now (off-limits ones run as NON-CANONICAL);
    // a stored explicit pick is honored, otherwise default to the earliest legal
    let saved = 0; try { saved = +localStorage.getItem(SIM_KEY) || 0; } catch {}
    if (saved >= 1 && saved <= 9) simTheater = saved;
    else if (simTheater < 1 || simTheater > 9) simTheater = E.floor;
  };

  // NATIVE CATCHABILITY — can you catch a species in a region's own games, without
  // transferring? Uses each region's Pokédex (data/nativedex.json, built from PokeAPI:
  // the union of that region's games). Species-level (a regional form counts as its
  // base species). Separate axis from ELIGIBILITY: a squad can be native-catchable in
  // a region yet still non-canonical there (e.g. a move that region's era didn't have).
  const nativeIn = (u, gen) => NATIVE_LOADED && !!NATIVE_DEX[gen] && NATIVE_DEX[gen].has(u.dexno);
  const nativeBadge = (units, gen) => {
    if (!NATIVE_LOADED) return "";
    const n = units.filter(u => nativeIn(u, gen)).length, t = units.length;
    const cls = n === 0 ? "none" : n === t ? "full" : "";
    return `<span class="sim-th-nat ${cls}">&#9670;${n}/${t}</span>`;
  };
  const nativeLine = (units, gen) => {
    if (!NATIVE_LOADED || !units.length) return "";
    const region = REGIONS[gen - 1], missing = units.filter(u => !nativeIn(u, gen)), n = units.length - missing.length;
    if (!missing.length)
      return `<div class="sim-native full"><span class="sn-k">&#9670; NATIVE</span><span class="sn-v">catch all ${units.length} in ${region}</span></div>`;
    const names = missing.map(u => u.name).slice(0, 3).join(", ") + (missing.length > 3 ? ` +${missing.length - 3}` : "");
    return `<div class="sim-native"><span class="sn-k">&#9670; NATIVE ${n}/${units.length}</span><span class="sn-v">${region} can't catch <b>${names}</b></span></div>`;
  };

  const simUnitCell = (u, i) =>
    `<div class="sim-mcap"><span class="sim-mcap-idx">0${i + 1}</span>
       <img class="sim-mcap-img" src="${SPRITE(u.id)}" onerror="${SPRITE_FALLBACK(u.dexno)}" alt="">
       <span class="sim-mcap-name">${u.name}</span></div>`;

  const simDeployHTML = () => {
    const you = teamUnits();
    if (!you.length) return `<div class="sim-scr sim-empty"><div class="ce-ring"></div>
      <p>NO SQUAD ON FILE<br><b>FILE UNITS</b> TO PROJECT COMBAT</p></div>`;
    const E = computeEligibility();
    initSimTheater(E);
    const nonCanon = simTheater < E.floor;                 // an off-limits region is selected
    const grid = REGIONS.map((name, idx) => {
      const g = idx + 1, legal = g >= E.floor, sel = g === simTheater;
      const cls = ["sim-th", legal ? "legal" : "locked", sel ? "sel" : "", sel && !legal ? "warn" : ""]
        .filter(Boolean).join(" ");
      const lock = legal ? "" : `<span class="sim-th-lock" title="off-limits — squad can't legally exist here">▮</span>`;
      return `<button class="${cls}" data-th="${g}">
        <span class="sim-th-g">GEN ${g}</span><span class="sim-th-n">${name}</span>${nativeBadge(you, g)}${lock}</button>`;
    }).join("");
    const note = nonCanon
      ? `<div class="sim-elig-note warn"><span class="sim-note-ic">&#9888;</span><span><b>NON-CANONICAL · ${REGIONS[simTheater - 1]}</b> — this squad can't legally exist here${E.bind ? ` (<b>${E.bind.label}</b> ${E.bind.detail})` : ""}. Running a hypothetical.</span></div>`
      : `<div class="sim-elig-note"><span class="sim-note-ic">&#9650;</span><span>${E.bind
          ? `EARLIEST THEATER <b>${REGIONS[E.floor - 1]} · GEN ${E.floor}</b> — floor set by <b>${E.bind.label}</b> <i>(${E.bind.detail})</i>`
          : `<b>ALL THEATERS OPEN</b> — this squad is legal in every region`}</span></div>`;
    return `<div class="sim-scr">
      <div class="sim-kicker"><span>SIM // COMBAT PROJECTION</span><span class="sim-kicker-r">${you.length} UNIT${you.length > 1 ? "S" : ""}</span></div>
      <div class="sim-team">${you.map(simUnitCell).join("")}</div>
      <div class="sim-elig">
        <div class="sim-elig-head"><h3>SELECT THEATER</h3><span class="sim-elig-cnt">${E.eligible.length} / 9 ELIGIBLE</span></div>
        <div class="sim-th-grid">${grid}</div>
        ${nativeLine(you, simTheater)}
        ${note}
      </div>
      <div class="sim-deploy-foot">
        <button class="sim-legtog ${simLegends ? "on" : ""}" data-act="legtog" aria-pressed="${simLegends}">
          <span class="sim-legtog-l"><span class="sim-leg-ico">&#9733;</span>LEGENDARY OPPONENTS</span>
          <span class="sim-switch"><span class="sim-switch-knob"></span></span>
        </button>
        <div class="sim-deploy-action">
          <div class="sim-dep-meta"><span class="sim-dep-n">${SIM_N}</span><span class="sim-dep-l">${nonCanon ? "HYPOTHETICAL" : "ENGAGEMENTS"} · ${REGIONS[simTheater - 1]}</span></div>
          <button class="sim-run-btn sim-key${nonCanon ? " warn" : ""}" data-act="run">RUN SIM ▸</button>
        </div>
      </div>
    </div>`;
  };

  const simRunningHTML = () => `<div class="sim-scr sim-run">
      <div class="sim-run-tl">RUNNING ENGAGEMENTS</div>
      <div class="sim-run-th">THEATER · ${REGIONS[simRun.gen - 1]}</div>
      <div class="sim-run-big"><span id="simRunNum">000</span><small>/${SIM_N}</small></div>
      <div class="sim-rbar"><div class="sim-rbar-fill" id="simRbar"></div></div>
      <div class="sim-run-tally">
        <div class="sim-rt w"><span class="n" id="simRunW">0</span><span class="l">WON</span></div>
        <div class="sim-rt l"><span class="n" id="simRunL">0</span><span class="l">LOST</span></div>
      </div>
      <div class="sim-run-scroll" id="simRunScroll">&nbsp;</div></div>`;

  const startRunAnim = () => {
    const run = simRun;
    if (!run) { simState = "deploy"; renderSim(); return; }
    if (prefersReduced) { simState = "results"; renderSim(); return; }
    const num = $("#simRunNum"), bar = $("#simRbar"), w = $("#simRunW"), l = $("#simRunL"), scr = $("#simRunScroll");
    let n = 0, wc = 0, lc = 0; const t0 = performance.now(), dur = 1500;
    const frame = t => {
      if (view !== "sim" || simState !== "running") return;      // cycled away → abort
      const p = Math.min(1, (t - t0) / dur), target = (p * SIM_N) | 0;
      while (n < target) { n++; if (run.engs[n - 1].win) wc++; else lc++; }
      if (num) num.textContent = String(n).padStart(3, "0");
      if (w) w.textContent = wc; if (l) l.textContent = lc;
      if (bar) bar.style.width = (p * 100) + "%";
      if (scr && n > 0) { const e = run.engs[n - 1]; scr.innerHTML = `ENG ${String(n).padStart(3, "0")} · <b>${e.win ? "WON" : "LOST"}</b> vs ${e.opp0}`; }
      if (p < 1) requestAnimationFrame(frame);
      else setTimeout(() => { if (view === "sim" && simState === "running") { simState = "results"; renderSim(); } }, 240);
    };
    requestAnimationFrame(frame);
  };

  const simResultsHTML = () => {
    const r = simRun, pct = Math.round(r.wins / SIM_N * 100), tier = simTier(pct);
    const co = (lbl, name, extra) => name
      ? `<div class="sim-callout"><span class="sim-co-l">${lbl}</span><span class="sim-co-pip t-${r.typeOf[name] || "none"}"></span><b>${name}</b> <i>${extra}</i></div>` : "";
    return `<div class="sim-scr sim-results">
      <div class="sim-res-body">
        <div class="sim-res-k${r.nonCanon ? " warn" : ""}">${r.nonCanon ? "NON-CANONICAL" : "PROJECTION COMPLETE"} · ${REGIONS[r.gen - 1]} THEATER${r.legends ? "" : " · NO LEGENDS"}</div>
        <div class="sim-res-score">${r.wins}<small> /${SIM_N} WON</small></div>
        <div class="sim-res-tier">${tier.label}</div>
        <div class="sim-res-sub">${tier.sub}</div>
        <div class="rmeter"><div class="rmeter-fill" data-w="${pct}"></div></div>
        <div class="sim-res-split">
          <div class="sim-rs w"><div class="rn">${r.wins}</div><div class="rl">VICTORIES</div></div>
          <div class="sim-rs l"><div class="rn">${r.losses}</div><div class="rl">DEFEATS</div></div>
        </div>
        <div class="sim-res-callouts">
          ${co("MVP", r.mvp, `${r.mvpN} KOs across the run`)}
          ${co("FELL FIRST", r.liability, `led ${r.liabilityN} of ${r.losses || 0} defeats`)}
          ${co("THREAT", r.threat, `${r.threatN} KOs on your squad`)}
        </div>
      </div>
      <div class="sim-res-foot">
        <button class="sim-btn-primary sim-key" data-act="review">REVIEW ENGAGEMENTS ▸</button>
        <button class="sim-btn-2 sim-key" data-act="reconf">↺ THEATER</button>
      </div></div>`;
  };
  const afterResults = () => requestAnimationFrame(() => requestAnimationFrame(() => {
    const f = $("#sim .rmeter-fill"); if (f) f.style.width = f.dataset.w + "%";
  }));

  const inspList = () => inspLossOnly ? simRun.engs.filter(e => !e.win).map(e => e.i) : simRun.engs.map(e => e.i);
  const simTokRow = (list, fainted) => list.map((u, i) =>
    `<div class="sim-tok ${i < fainted ? "ko" : ""}"><img src="${SPRITE(u.id)}" onerror="${SPRITE_FALLBACK(u.dexno)}" alt="">
       <span class="sim-tok-dex">${String(u.id).padStart(3, "0")}</span></div>`).join("");

  const simInspectHTML = () => {
    const list = inspList();
    if (!list.includes(inspIdx)) inspIdx = list.length ? list[0] : 0;
    const e = simRun.engs[inspIdx], pos = list.indexOf(inspIdx) + 1, R = REGIONS[simRun.gen - 1];
    return `<div class="sim-scr sim-inspect">
      <div class="sim-insp-head">
        <button class="sim-nav sim-key" data-act="prev" aria-label="Previous engagement">&lsaquo;</button>
        <div class="sim-insp-count">
          <div class="ic-n">ENGAGEMENT <b>${String(inspIdx + 1).padStart(3, "0")}</b>/${SIM_N}</div>
          <div class="ic-s">${inspLossOnly ? `DEFEAT ${pos} / ${list.length}` : "STEP WITH ◂ ▸"}</div>
        </div>
        <button class="sim-nav sim-key" data-act="next" aria-label="Next engagement">&rsaquo;</button>
        <button class="sim-insp-close sim-key" data-act="closeinsp" aria-label="Close">&times;</button>
      </div>
      <div class="sim-insp-body">
      <div class="sim-verdict ${e.win ? "won" : "lost"}">
        <span class="sim-vtag">${e.win ? "WON" : "LOST"}</span>
        <span class="sim-vsub">${R} THEATER<br>${e.survA} OF ${e.size} SURVIVING</span>
      </div>
      <div class="sim-side">
        <div class="sim-side-lbl ours"><span>YOUR SQUAD</span><span>${e.survA}/${e.size} STANDING</span></div>
        <div class="sim-tokrow">${simTokRow(e.you, e.size - e.survA)}</div>
      </div>
      <div class="sim-side">
        <div class="sim-side-lbl theirs"><span>HOSTILE · ${R}</span><span>${e.survB}/${e.size} STANDING</span></div>
        <div class="sim-tokrow">${simTokRow(e.opp, e.size - e.survB)}</div>
      </div>
      <div class="sim-why">
        <div class="sim-why-k">AFTER-ACTION DEBRIEF</div>
        <div class="sim-why-txt">${e.debrief}</div>
      </div>
      </div>
      <div class="sim-insp-foot">
        <button class="sim-loss-tog sim-key ${inspLossOnly ? "on" : ""}" data-act="lossonly"><span class="box"></span>LOSSES ONLY</button>
        <span class="sim-insp-hint">TAP <b>◂ ▸</b> TO STEP</span>
      </div></div>`;
  };

  const renderSim = () => {
    const el = $("#sim"); if (!el) return;
    if (simState === "running") { el.innerHTML = simRunningHTML(); startRunAnim(); }
    else if (simState === "results") { el.innerHTML = simResultsHTML(); afterResults(); }
    else if (simState === "inspect") el.innerHTML = simInspectHTML();
    else el.innerHTML = simDeployHTML();
    const scr = el.querySelector(".sim-scr");
    if (scr && !prefersReduced) { scr.classList.remove("sim-in"); void scr.offsetWidth; scr.classList.add("sim-in"); }
  };

  const simClick = ev => {
    firstTouchUnlock();
    const th = ev.target.closest(".sim-th");
    if (th) {                                        // any region is selectable; off-limits ones run non-canonically
      simTheater = +th.dataset.th; try { localStorage.setItem(SIM_KEY, simTheater); } catch {}
      sfx.select(); renderSim(); return;
    }
    const btn = ev.target.closest("[data-act]"); if (!btn) return;
    switch (btn.dataset.act) {
      case "legtog":
        simLegends = !simLegends;
        try { localStorage.setItem(LEG_KEY, simLegends ? "1" : "0"); } catch {}
        sfx.tick(); renderSim(); break;
      case "run":
        simRun = runSim(simTheater);
        if (!simRun) { sfx.clear(); return; }
        simState = "running"; sfx.add(); renderSim(); break;
      case "review":
        inspLossOnly = false;
        inspIdx = (simRun.engs.find(e => !e.win) || simRun.engs[0]).i;   // open on a loss to show the "why"
        simState = "inspect"; sfx.open(); renderSim(); break;
      case "reconf":
        simState = "deploy"; sfx.open(); renderSim(); break;
      case "closeinsp":
        simState = "results"; sfx.open(); renderSim(); break;
      case "prev": case "next": {
        const list = inspList(); let p = list.indexOf(inspIdx);
        if (p < 0) p = 0;
        p = (p + (btn.dataset.act === "next" ? 1 : -1) + list.length) % list.length;
        inspIdx = list[p]; sfx.tick(); renderSim(); break;
      }
      case "lossonly":
        if (!inspLossOnly && !simRun.engs.some(e => !e.win)) { sfx.tick(); return; }  // nothing to filter to
        inspLossOnly = !inspLossOnly;
        sfx.select(); renderSim(); break;
    }
  };

  const selectSlot = (i) => {
    if (party[i] == null) return;
    activeSlot = i;
    renderLoadout();
    renderConsole();
    sfx.select();
  };

  const clearSlot = (i) => {
    party[i] = null; saveParty(); resetSlotMoves(i);
    if (activeSlot === i) activeSlot = party.findIndex(x => x != null);
    renderLoadout(); renderConsole(); updateCount(); refreshDiagnostic();
    if (view === "squad") renderSquad();
    sfx.clear();
  };

  const assignSlot = (i, id) => {
    const changed = party[i] !== id;
    party[i] = id; saveParty();
    if (changed) resetSlotMoves(i);          // a new unit starts with an empty move loadout
    activeSlot = i;
    renderLoadout(); renderConsole(); updateCount(); refreshDiagnostic();
    if (view === "squad") { squadFocus = i; renderSquad(); }
    closeSearch();
    sfx.add();
  };

  // ------------------------------------------------------------- search -----
  const searchEl = () => $("#search");
  const openSearch = (slot) => {
    targetSlot = slot;
    $("#searchSlot").textContent = "SLOT 0" + (slot + 1);
    const input = $("#searchInput");
    input.value = "";
    $("#searchClear").classList.remove("show");
    renderResults("");
    searchEl().classList.add("open");
    searchEl().setAttribute("aria-hidden", "false");
    sfx.open();
    setTimeout(() => input.focus(), 340);
  };
  const closeSearch = () => {
    searchEl().classList.remove("open");
    searchEl().setAttribute("aria-hidden", "true");
    targetSlot = -1;
  };

  const RESULT_CAP = 80;
  const renderResults = (q) => {
    const nq = norm(q);
    const digits = q.replace(/\D/g, "");
    let list = DEX.filter(u => {
      if (genFilter && u.gen !== genFilter) return false;
      if (!nq && !digits) return true;
      if (nq && u.key.includes(nq)) return true;
      if (digits && (String(u.id).includes(digits) || String(u.dexno).includes(digits))) return true;
      return false;
    });
    const total = list.length;
    if (nq) list.sort((a, b) => (b.key.startsWith(nq) - a.key.startsWith(nq)) || (a.dexno - b.dexno) || (a.id - b.id));
    else list.sort((a, b) => a.dexno - b.dexno || a.id - b.id);
    const shown = list.slice(0, RESULT_CAP);

    const res = $("#results");
    if (!total) {
      res.innerHTML = `<div class="results-foot" style="padding-top:34px">NO UNITS MATCH QUERY</div>`;
      $("#resultsFoot").textContent = "";
      return;
    }
    res.innerHTML = shown.map(u =>
      `<div class="res-row" data-id="${u.id}">
         <img class="res-sprite" loading="lazy" src="${SPRITE(u.id)}" onerror="${SPRITE_FALLBACK(u.dexno)}" alt="">
         <div class="res-body">
           <div class="res-name">${u.name}</div>
           <div class="res-sub">
             <span class="res-dex">NO.${String(u.id).padStart(4, "0")} &middot; GEN ${ROMAN[u.gen - 1]}</span>
             <span class="res-types">${typeChip(u.t1)}${typeChip(u.t2)}</span>
           </div>
         </div>
       </div>`).join("");
    res.scrollTop = 0;
    $("#resultsFoot").innerHTML = `SHOWING <b>${shown.length}</b> / <b>${total}</b> UNITS`;
  };

  const buildGenChips = () => {
    const el = $("#genFilter");
    const chips = ['<button class="gchip sel" data-gen="0">ALL</button>'];
    for (let g = 1; g <= 9; g++) chips.push(`<button class="gchip" data-gen="${g}">GEN ${ROMAN[g - 1]}</button>`);
    el.innerHTML = chips.join("");
  };

  const wireEvents = () => {
    // loadout: add (empty) / select (filled) / clear (x). In HOME view the strip
    // is the right rail — a filled unit hops back to TEAM so you can read it.
    $("#loadout").addEventListener("click", e => {
      firstTouchUnlock();
      const x = e.target.closest(".cap-x");
      if (x) { e.stopPropagation(); clearSlot(+x.dataset.x); return; }
      const cap = e.target.closest(".cap");
      if (!cap) return;
      const i = +cap.dataset.slot;
      if (party[i] == null) { openSearch(i); return; }
      if (view === "home") applyView("team");
      selectSlot(i);
    });

    // console: swap
    $("#console").addEventListener("click", e => {
      const s = e.target.closest(".swap-btn");
      if (s) { firstTouchUnlock(); openSearch(+s.dataset.swap); }
    });

    // view flip: one-way cycle TEAM -> HOME -> SQUAD -> TEAM
    $("#viewFlip").addEventListener("click", () => {
      firstTouchUnlock();
      applyView(nextView());
    });

    // squad: tap a hero tile to focus it (empty tile -> add a unit there)
    $("#squadGrid").addEventListener("click", e => {
      firstTouchUnlock();
      const h = e.target.closest(".hero"); if (!h) return;
      const i = +h.dataset.hi;
      if (party[i] == null) { openSearch(i); return; }
      if (i !== squadFocus) { squadFocus = i; renderSquad(); sfx.select(); }
    });
    // squad move bar: set a move (opens picker) / clear a move (x)
    $("#moveBar").addEventListener("click", e => {
      firstTouchUnlock();
      const x = e.target.closest(".mslot-x");
      if (x) { e.stopPropagation(); clearMove(+x.dataset.mvx); return; }
      const s = e.target.closest(".mslot"); if (!s) return;
      openMovePick(+s.dataset.mv);
    });
    // sim view: theater select + run / review / step / filter (all delegated)
    $("#sim").addEventListener("click", simClick);

    // move picker overlay
    $("#movepickClose").addEventListener("click", closeMovePick);
    $("#movepick").addEventListener("click", e => { if (e.target === $("#movepick")) closeMovePick(); });
    const mInput = $("#moveInput");
    mInput.addEventListener("input", () => {
      $("#moveClear").classList.toggle("show", mInput.value.length > 0);
      renderMoveResults(mInput.value);
    });
    $("#moveClear").addEventListener("click", () => {
      mInput.value = ""; $("#moveClear").classList.remove("show"); renderMoveResults(""); mInput.focus();
    });
    $("#moveResults").addEventListener("click", e => {
      const r = e.target.closest(".mv-row"); if (r) assignMove(+r.dataset.mvid);
    });

    // skin switch: one-way cycle through the shell iterations
    $("#skinToggle").addEventListener("click", () => {
      firstTouchUnlock();
      cycleSkin();
    });

    // home: tap the coverage tile to expand the full matrix; other tiles flip
    $("#home").addEventListener("click", e => {
      const t = e.target.closest(".htile"); if (!t) return;
      if (t.classList.contains("t-cover")) { openMatrix(); return; }
      t.classList.toggle("flipped"); sfx.tick();
    });

    // defensive-coverage matrix overlay
    $("#matrixClose").addEventListener("click", closeMatrix);
    $("#matrix").addEventListener("click", e => { if (e.target === $("#matrix")) closeMatrix(); });

    // keep the rail aligned to the home region on viewport changes
    addEventListener("resize", layoutRail);
    addEventListener("orientationchange", layoutRail);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", layoutRail);

    // search
    $("#searchClose").addEventListener("click", closeSearch);
    searchEl().addEventListener("click", e => { if (e.target === searchEl()) closeSearch(); });
    const input = $("#searchInput");
    input.addEventListener("input", () => {
      $("#searchClear").classList.toggle("show", input.value.length > 0);
      renderResults(input.value);
    });
    $("#searchClear").addEventListener("click", () => {
      input.value = ""; $("#searchClear").classList.remove("show"); renderResults(""); input.focus();
    });
    $("#genFilter").addEventListener("click", e => {
      const c = e.target.closest(".gchip"); if (!c) return;
      genFilter = +c.dataset.gen;
      $("#genFilter").querySelectorAll(".gchip").forEach(g => g.classList.toggle("sel", g === c));
      sfx.tick();
      renderResults($("#searchInput").value);
    });
    $("#results").addEventListener("click", e => {
      const row = e.target.closest(".res-row"); if (!row || targetSlot < 0) return;
      assignSlot(targetSlot, +row.dataset.id);
    });
  };

  // -------------------------------------------------------------- clock -----
  const clockTick = () => {
    const el = $("#clock"); if (!el) return;
    const upd = () => {
      const d = new Date();
      el.textContent = d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0");
    };
    upd(); setInterval(upd, 15000);
  };

  // --------------------------------------------------------------- boot -----
  async function boot() {
    let raw;
    try { raw = await (await fetch("data/pokedex.json")).json(); }
    catch { $("#console").innerHTML = `<div class="con-empty"><p style="color:var(--amber)">DATABASE OFFLINE<br>COULD NOT LOAD DEX</p></div>`; return; }
    DEX = raw.map(r => {
      const [id, ident, t1, t2, stats, dexno] = r;
      const u = { id, ident, name: prettify(ident), key: norm(ident), t1, t2: t2 || null,
                  stats, bst: stats.reduce((a, b) => a + b, 0), dexno, gen: genOf(dexno) };
      byId.set(id, u);
      return u;
    });
    // move catalog for the SQUAD move picker (non-fatal if missing)
    try {
      const mraw = await (await fetch("data/moves.json")).json();
      MOVES = mraw.map(r => { const [id, name, type] = r; const m = { id, name, type, key: norm(name) }; moveById.set(id, m); return m; });
    } catch {}
    // per-region native-catch dex for the SIM theater readouts (non-fatal if missing)
    try {
      const nd = await (await fetch("data/nativedex.json")).json();
      for (let g = 1; g <= 9; g++) NATIVE_DEX[g] = new Set(nd[g] || nd[String(g)] || []);
      NATIVE_LOADED = true;
    } catch {}
    loadParty();
    loadMoves();
    buildGenChips();
    renderLoadout();
    renderConsole();
    updateCount();
    updateStrip();
    wireEvents();
    initTactile();
    clockTick();
    // restore last skin + view (no animation on cold boot)
    let savedSkin = "hud";
    try {
      const s = localStorage.getItem(SKIN_KEY);
      savedSkin = s === "plastic" ? "plastic-red"        // migrate the old binary value
                : SKINS.includes(s) ? s : "hud";
    } catch {}
    if (savedSkin !== "hud") applySkin(savedSkin, false);
    updateFlipLabel();
    let savedView = "team";
    try { const v = localStorage.getItem(VIEW_KEY); savedView = VIEWS.includes(v) ? v : "team"; } catch {}
    if (savedView !== "team") applyView(savedView, false);
  }

  boot();
})();
