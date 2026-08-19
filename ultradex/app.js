/* =============================================================================
   ULTRADEX — single-screen field Pokédex + team console
   One screen, no modes. A Gen-IV style scroll/click WHEEL travels the national
   dex; the centre SCREEN reads the focused unit (dex data / stats only); the six
   TEAM capsules live at the top; two parallel rails read live team RATING; team
   building, movesets and the rating matrix all reach in from caps / rails / the
   wheel — never a page change. Type engine + data descend from Pokemeter.
   ========================================================================== */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
  const SPRITE_FALLBACK = dex => `this.onerror=null;this.src='${SPRITE(dex)}'`;
  const GEN_CAPS = [151, 251, 386, 493, 649, 721, 809, 905, 1025];
  const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
  const REGIONS = ["KANTO","JOHTO","HOENN","SINNOH","UNOVA","KALOS","ALOLA","GALAR","PALDEA"];
  const STAT_LBL = ["HP", "ATK", "DEF", "SPA", "SPD", "SPE"];
  const PARTY_KEY = "ultradex-party-v1", MOVES_KEY = "ultradex-moves-v1";
  const SKIN_KEY = "ultradex-skin", FOCUS_KEY = "ultradex-focus";

  const genOf = dex => { for (let i = 0; i < GEN_CAPS.length; i++) if (dex <= GEN_CAPS[i]) return i + 1; return 9; };
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const prettify = ident => ident.replace(/-/g, " ");
  const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ------------------------------------------------ type / rating engine ---
  const TYPES = ["normal","fire","water","electric","grass","ice","fighting","poison",
    "ground","flying","psychic","bug","rock","ghost","dragon","dark","steel","fairy"];
  const TYPE_ABBR = { normal:"NOR", fire:"FIR", water:"WAT", electric:"ELC", grass:"GRS",
    ice:"ICE", fighting:"FIG", poison:"PSN", ground:"GRD", flying:"FLY", psychic:"PSY",
    bug:"BUG", rock:"ROC", ghost:"GHO", dragon:"DRA", dark:"DRK", steel:"STL", fairy:"FAI" };
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

  const DUTIES = [
    { key:"physatk",  name:"PHYS ATK",  hint:"ATK ≥ 100",              test:s => s[1] >= 100 },
    { key:"specatk",  name:"SPEC ATK",  hint:"SPA ≥ 100",              test:s => s[3] >= 100 },
    { key:"physwall", name:"PHYS WALL", hint:"DEF ≥ 100 · HP ≥ 60",    test:s => s[2] >= 100 && s[0] >= 60 },
    { key:"specwall", name:"SPEC WALL", hint:"SPD ≥ 95 · HP ≥ 60",     test:s => s[4] >= 95  && s[0] >= 60 },
    { key:"speed",    name:"SPEED",     hint:"SPE ≥ 105",              test:s => s[5] >= 105 },
    { key:"support",  name:"SUPPORT",   hint:"HP ≥ 85 · both DEF ≥ 70",test:s => s[0] >= 85 && s[2] >= 70 && s[4] >= 70 },
  ];

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
  const READ_TIERS = [
    { min: 88, label: "COMBAT READY", short: "READY",  sub: "fully outfitted for the field" },
    { min: 72, label: "FIELD READY",  short: "FIELD",  sub: "solid kit — a few gaps to close" },
    { min: 55, label: "HOLDING",      short: "HOLD",   sub: "serviceable — room to sharpen" },
    { min: 35, label: "OUTFITTING",   short: "OUTFIT", sub: "coming together — keep building" },
    { min: 0,  label: "OUTFITTING",   short: "OUTFIT", sub: "early days — add and adjust" },
  ];
  const readiness = (A) => {
    if (!A.count) return { label: "AWAITING", short: "EMPTY", sub: "file a unit to begin", score: 0, items: 0 };
    const tier = READ_TIERS.find(t => A.score >= t.min);
    const items = A.exposed.length + A.walled.length + A.vacant.length;
    return { label: tier.label, short: tier.short, sub: tier.sub, score: A.score, items };
  };
  const priorityLine = (A) => {
    if (!A.count) return "file your party to begin";
    if (A.exposed.length) return `patch the <b>${A.exposed[0].t}</b> weak point`;
    if (A.vacant.length)  return `staff a <b>${A.vacant[0].name}</b>`;
    if (A.walled.length)  return `find an answer to <b>${A.walled[0]}</b>`;
    return "well-rounded — fine-tune to taste";
  };
  const netCat = (w, r) => (w > r ? "neg" : w < r ? "pos" : "even");
  const sortedTypes = (A) => TYPES.slice().sort((a, b) => {
    const A1 = A.defRows[a], B1 = A.defRows[b];
    const ma = A1.weak - A1.resist, mb = B1.weak - B1.resist;
    if (mb !== ma) return mb - ma;
    return B1.weak - A1.weak;
  });
  const MULT_TXT = { 4: "×4", 2: "×2", 0.5: "½", 0.25: "¼", 0: "×0" };
  const effGroups = (u) => {
    const weak = [], resist = [], immune = [];
    for (const atk of TYPES) {
      const m = effOn(atk, u.t1, u.t2);
      if (m > 1) weak.push([atk, m]);
      else if (m === 0) immune.push([atk, m]);
      else if (m < 1) resist.push([atk, m]);
    }
    weak.sort((a, b) => b[1] - a[1]);
    resist.sort((a, b) => a[1] - b[1]);
    return { weak, resist, immune };
  };

  // ---------------------------------------------------------------- audio ---
  let actx = null, master = null;
  const ensureAudio = () => {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)();
        master = actx.createGain(); master.gain.value = 0.85; master.connect(actx.destination);
      } catch { actx = null; }
    }
    if (actx && actx.state === "suspended") actx.resume().catch(() => {});
    return actx;
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
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
    add:    () => { click(0.03);
                    voice(523, 523, 0.10, { vol: 0.06 });
                    voice(784, 784, 0.13, { vol: 0.055, when: 0.06 });
                    voice(1046, 1150, 0.18, { type: "sine", vol: 0.042, when: 0.12, cut: 6500 }); },
    clear:  () => { click(0.02, 0.03); voice(380, 180, 0.17, { type: "sawtooth", vol: 0.045, cut: 1700 }); },
    tick:   () => { click(0.014, 0.010); voice(1240, 1240, 0.020, { type: "square", vol: 0.014, cut: 6200 }); },
    detent: () => { click(0.02, 0.012); voice(1400, 1400, 0.018, { type: "square", vol: 0.02, cut: 6800 }); },
    err:    () => { click(0.02, 0.03); voice(220, 160, 0.16, { type: "sawtooth", vol: 0.04, cut: 1400 }); },
  };
  const countUp = (el, to, dur = 460) => {
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
  let motionAsked = false;
  const requestMotion = () => {
    if (motionAsked) return; motionAsked = true;
    const ask = E => { if (E && typeof E.requestPermission === "function") E.requestPermission().catch(() => {}); };
    ask(window.DeviceOrientationEvent); ask(window.DeviceMotionEvent);
  };
  const firstTouchUnlock = () => { ensureAudio(); requestMotion(); };
  const initTactile = () => {
    const root = document.documentElement, phone = $("#phone");
    const MAX = 16; const cl = (v, m) => Math.max(-m, Math.min(m, v));
    let raf = 0, bx = 0, by = 0, mx = 0, my = 0, cx = 0, cy = 0;
    const step = () => {
      const tx = cl(bx + mx, MAX), ty = cl(by + my, MAX);
      cx += (tx - cx) * 0.14; cy += (ty - cy) * 0.14; mx *= 0.88; my *= 0.88;
      root.style.setProperty("--px", cx.toFixed(2) + "px");
      root.style.setProperty("--py", cy.toFixed(2) + "px");
      const live = Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05 || Math.abs(mx) > 0.05 || Math.abs(my) > 0.05;
      raf = live ? requestAnimationFrame(step) : 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(step); };
    phone.addEventListener("pointermove", e => {
      const r = phone.getBoundingClientRect();
      bx = ((e.clientX - r.left) / r.width - 0.5) * 2 * MAX;
      by = ((e.clientY - r.top) / r.height - 0.5) * 2 * MAX; kick();
    }, { passive: true });
    phone.addEventListener("pointerleave", () => { bx = 0; by = 0; kick(); });
    window.addEventListener("deviceorientation", e => {
      if (e.gamma == null && e.beta == null) return;
      bx = cl((e.gamma || 0) * 0.85, MAX); by = cl(((e.beta || 0) - 42) * 0.70, MAX); kick();
    }, { passive: true });
    window.addEventListener("devicemotion", e => {
      const a = e.acceleration; if (!a || (a.x == null && a.y == null)) return;
      mx = cl(mx + (a.x || 0) * 0.9, MAX * 1.4); my = cl(my - (a.y || 0) * 0.9, MAX * 1.4); kick();
    }, { passive: true });
  };

  // ----------------------------------------------------------- state --------
  let DEX = [];
  const byId = new Map();
  let MOVES = [];
  const moveById = new Map();
  const LEARN = {}; let LEARN_LOADED = false;
  let NATIVE_DEX = {}, NATIVE_LOADED = false;      // per-region (gen 1..9) Set of natively-catchable national dex nos
  let party = [null, null, null, null, null, null];
  let partyMoves = [[null,null,null,null],[null,null,null,null],[null,null,null,null],
                    [null,null,null,null],[null,null,null,null],[null,null,null,null]];

  const teamUnits = () => party.filter(x => x != null).map(id => byId.get(id));
  const firstEmpty = () => party.findIndex(x => x == null);

  const loadParty = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(PARTY_KEY));
      if (Array.isArray(raw)) for (let i = 0; i < 6; i++) party[i] = byId.has(raw[i]) ? raw[i] : null;
    } catch {}
  };
  const saveParty = () => { try { localStorage.setItem(PARTY_KEY, JSON.stringify(party)); } catch {} };
  const saveMoves = () => { try { localStorage.setItem(MOVES_KEY, JSON.stringify(partyMoves)); } catch {} };
  const loadMoves = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(MOVES_KEY));
      if (Array.isArray(raw)) for (let i = 0; i < 6; i++)
        partyMoves[i] = Array.isArray(raw[i]) ? [0,1,2,3].map(k => moveById.has(raw[i][k]) ? raw[i][k] : null) : [null,null,null,null];
    } catch {}
  };
  const resetSlotMoves = i => { partyMoves[i] = [null, null, null, null]; saveMoves(); };

  // ------------------------------------------------------ small renderers ---
  const typeChip = t => t ? `<span class="tchip t-${t}">${t}</span>` : "";
  const typeDots = u => `<i class="t-${u.t1}"></i>${u.t2 ? `<i class="t-${u.t2}"></i>` : ""}`;
  // native catchability: can this species be caught in a region's own games (no transfer)?
  const nativeIn = (u, gen) => NATIVE_LOADED && !!NATIVE_DEX[gen] && NATIVE_DEX[gen].has(u.dexno);
  const nativeCount = u => { let n = 0; for (let g = 1; g <= 9; g++) if (nativeIn(u, g)) n++; return n; };
  const slotOfId = id => party.indexOf(id);
  const updateCount = () => { $("#partyCount").textContent = party.filter(x => x != null).length; };

  // ================================================================ TEAM ====
  const renderTeamRack = () => {
    const el = $("#teamRack");
    el.innerHTML = party.map((id, i) => {
      const u = id != null ? byId.get(id) : null;
      const onScreen = u && focusId === id;
      const cls = ["cap", u ? "filled" : "empty", onScreen ? "active" : "", i === 0 ? "lead" : ""].join(" ").trim();
      const inner = u
        ? `<img class="cap-sprite" src="${SPRITE(u.id)}" onerror="${SPRITE_FALLBACK(u.dexno)}" alt="">
           <span class="cap-name">${u.name}</span>
           <span class="cap-typedots">${typeDots(u)}</span>
           <span class="cap-mvpips">${(partyMoves[i]||[]).map(m => `<i class="mvpip ${m!=null?"on":""}"></i>`).join("")}</span>`
        : `<span class="cap-plus">+</span><span class="cap-empty-lbl">EMPTY</span>`;
      return `<div class="${cls}" data-slot="${i}">
                <div class="cap-in">${inner}</div>
                <span class="cap-idx">${i === 0 ? "LEAD" : "0" + (i + 1)}</span>
                ${u ? `<span class="cap-hold" aria-hidden="true"></span>` : ""}
              </div>`;
    }).join("");
  };

  // ================================================================ SCREEN ==
  const statRow = (lbl, v, max) =>
    `<div class="stat-row">
       <span class="stat-lbl">${lbl}</span>
       <div class="stat-bar"><div class="stat-fill" data-w="${Math.min(100, v / max * 100).toFixed(1)}"></div></div>
       <span class="stat-val" data-v="${v}">0</span>
     </div>`;
  const echip = ([t, m]) =>
    `<span class="tchip echip t-${t}">${TYPE_ABBR[t]}${m === 0 ? "" : `<b class="emul">${MULT_TXT[m]}</b>`}</span>`;
  const effRow = (lbl, cls, arr) =>
    `<div class="eff-row"><span class="eff-lbl ${cls}">${lbl}</span>
       <div class="eff-chips">${arr.length ? arr.map(echip).join("") : `<span class="eff-none">—</span>`}</div></div>`;

  // full dex-entry markup for a unit (rendered into the INFO SHEET on OK)
  const unitReadoutHTML = (u) => {
    const slot = slotOfId(u.id);
    const g = effGroups(u);
    const badge = slot >= 0
      ? `<span class="scr-team on">◉ ON TEAM · ${slot === 0 ? "LEAD" : "SLOT 0" + (slot + 1)}</span>`
      : `<span class="scr-team">◎ NOT ON TEAM</span>`;
    let catchStrip = "";
    if (NATIVE_LOADED) {
      const cnt = nativeCount(u); const cells = [];
      for (let gi = 1; gi <= 9; gi++)
        cells.push(`<span class="cat-cell ${nativeIn(u, gi) ? "on" : ""}" title="${REGIONS[gi - 1]}">${ROMAN[gi - 1]}</span>`);
      const tag = cnt === 0 ? "TRANSFER" : cnt === 9 ? "×9 ALL" : "×" + cnt;
      catchStrip = `<div class="catch"><span class="catch-k">◆ CATCH</span><div class="catch-cells">${cells.join("")}</div><span class="catch-n ${cnt === 0 ? "none" : ""}">${tag}</span></div>`;
    }
    return `<div class="unit">
         <div class="unit-top">
           <div class="specimen"><span class="spec-no">№${String(u.dexno).padStart(3, "0")}</span>
             <img src="${SPRITE(u.id)}" onerror="${SPRITE_FALLBACK(u.dexno)}" alt="${u.name}"></div>
           <div class="unit-meta">
             <div class="unit-dex">NAT&nbsp;№${String(u.dexno).padStart(4, "0")} · ${REGIONS[u.gen - 1]}</div>
             <div class="unit-name">${u.name}</div>
             <div class="unit-gen">GEN&nbsp;${ROMAN[u.gen - 1]} · <span class="unit-arch">${archetype(u.stats)}</span></div>
             <div class="unit-types">${typeChip(u.t1)}${typeChip(u.t2)}</div>
             ${badge}
           </div>
         </div>
         ${catchStrip}
         <div class="stats">
           ${u.stats.map((v, i) => statRow(STAT_LBL[i], v, 200)).join("")}
           <div class="stat-row bst"><span class="stat-lbl">BST</span>
             <div class="stat-bar"><div class="stat-fill" data-w="${Math.min(100, u.bst / 720 * 100).toFixed(1)}"></div></div>
             <span class="stat-val" data-v="${u.bst}">0</span></div>
         </div>
         <div class="eff">
           <div class="eff-head">DEFENSIVE&nbsp;PROFILE <span class="eff-sub">DAMAGE&nbsp;TAKEN</span></div>
           ${effRow("WEAK", "weak", g.weak)}
           ${effRow("RESIST", "resist", g.resist)}
           ${effRow("IMMUNE", "immune", g.immune)}
         </div>
       </div>`;
  };
  const animateReadout = (el) => {
    if (prefersReduced) {
      el.querySelectorAll(".stat-fill").forEach(f => { f.style.transition = "none"; f.style.width = f.dataset.w + "%"; });
      el.querySelectorAll(".stat-val").forEach(s => { s.textContent = s.dataset.v; });
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.querySelectorAll(".stat-fill").forEach((f, i) => { f.style.transitionDelay = (i * 45) + "ms"; f.style.width = f.dataset.w + "%"; });
      el.querySelectorAll(".stat-val").forEach((s, i) => setTimeout(() => countUp(s, +s.dataset.v, 420), i * 45));
      el.querySelectorAll(".echip").forEach((c, i) => { c.style.animationDelay = (120 + i * 22) + "ms"; });
    }));
  };

  // the SMALLER screen — the running unit's live nameplate (name / no / origin / types)
  const renderNameplate = () => {
    const el = $("#nameplate");
    const u = focusId != null ? byId.get(focusId) : null;
    if (!u) { el.innerHTML = `<div class="np-empty">SPIN&nbsp;·&nbsp;BROWSE&nbsp;THE&nbsp;NATIONAL&nbsp;DEX</div>`; return; }
    const slot = slotOfId(u.id);
    el.innerHTML =
      `<div class="np-no">№${String(u.dexno).padStart(4, "0")}</div>
       <div class="np-mid">
         <div class="np-name">${u.name}</div>
         <div class="np-sub">GEN&nbsp;${ROMAN[u.gen - 1]} · ${REGIONS[u.gen - 1]}${slot >= 0 ? ` · <b>${slot === 0 ? "LEAD" : "SLOT 0" + (slot + 1)}</b>` : ""}</div>
       </div>
       <div class="np-types">${typeChip(u.t1)}${typeChip(u.t2)}</div>`;
  };

  // ================================================================ RAILS ===
  const renderRails = () => {
    const units = teamUnits();
    const A = analyzeTeam(units);
    const R = readiness(A);
    // readiness rail (left)
    $("#rdyFill").style.height = (R.score) + "%";
    $("#rdyFill").className = "rail-gauge-fill " + (R.score >= 72 ? "hi" : R.score >= 45 ? "mid" : "lo");
    $("#rdyScore").textContent = A.count ? R.score : "--";
    $("#rdyTier").textContent = R.short;
    $("#rdyItems").innerHTML = A.count ? (R.items ? `${R.items}<span>FIX</span>` : `<span class="ok">OK</span>`) : "";
    // coverage rail (right): vertical strip of type pips, worst-first
    const strip = $("#covStrip");
    if (!units.length) { strip.innerHTML = ""; $("#covFoot").innerHTML = ""; }
    else {
      const order = sortedTypes(A);
      strip.innerHTML = order.map(t => {
        const r = A.defRows[t], cat = netCat(r.weak, r.resist);
        return `<span class="covpip nt-${cat}" title="${t} ${r.weak}/${r.resist}"><i class="t-${t}"></i></span>`;
      }).join("");
      $("#covFoot").innerHTML = A.exposed.length ? `${A.exposed.length}<span>WEAK</span>` : `<span class="ok">SOLID</span>`;
    }
    // header readiness LED
    const led = $("#readyLed");
    const actionable = A.count && (A.exposed.length || A.vacant.length || A.walled.length);
    led.classList.toggle("alert", !!actionable);
    // team hint
    $("#tzHint").innerHTML = A.count ? priorityLine(A).replace(/<\/?b>/g, "") : "SPIN &amp; FILE SIX UNITS";
  };

  // ================================================================ MATRIX ==
  const openMatrix = () => {
    const units = teamUnits();
    const body = $("#matrixBody"), summary = $("#matrixSummary");
    if (!units.length) { body.innerHTML = `<div class="scr-empty"><p>NO PARTY ON FILE</p></div>`; summary.innerHTML = ""; }
    else {
      const A = analyzeTeam(units), R = readiness(A);
      summary.innerHTML =
        `<div class="ms-tier"><span class="ms-score">${R.score}<small>/100</small></span>
           <span class="ms-lab"><b>${R.label}</b><i>${R.sub}</i></span></div>
         <div class="ms-prio">PRIORITY&nbsp;·&nbsp;${priorityLine(A)}</div>
         <div class="ms-duty">${DUTIES.map(d => {
            const on = A.staffed.includes(d);
            return `<span class="msd ${on ? "on" : "off"}">${d.name}</span>`; }).join("")}</div>`;
      const head = `<tr><th class="cov-corner">VS</th>${units.map(u =>
        `<th><img class="cov-sprite" src="${SPRITE(u.id)}" onerror="${SPRITE_FALLBACK(u.dexno)}" alt=""></th>`).join("")}<th class="cov-neth">W/R</th></tr>`;
      let last = null;
      const rows = sortedTypes(A).map(atk => {
        const r = A.defRows[atk], cat = netCat(r.weak, r.resist);
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
    }
    const el = $("#matrix"); el.classList.add("open"); el.setAttribute("aria-hidden", "false"); sfx.open();
  };
  const closeMatrix = () => { const el = $("#matrix"); el.classList.remove("open"); el.setAttribute("aria-hidden", "true"); };

  const refreshTeam = () => { renderTeamRack(); renderRails(); updateCount(); if ($("#matrix").classList.contains("open")) openMatrix(); };

  // ================================================================ WHEEL ====
  // The THEATRE is a windowed horizontal filmstrip: `pos` is a float dex-list
  // index; a recycled pool of sprite frames is transformed around it (a carousel
  // curve via rotateY). Physics: drag/jog -> pos, release -> inertia -> spring-snap
  // to the nearest integer. The centre frame is the "running" unit under focus.
  const FRAME = 80;                     // px between adjacent sprite centres
  const HALF = 3;                       // frames each side of centre
  const POOL = HALF * 2 + 3;            // recycled sprite frames
  const DIAL_DEG = 16;                  // knurl rotation per dex step (the jog dial turns 1:1)
  let list = [];                        // filtered dex list (unit objects)
  let pos = 0, vel = 0, raf = 0, dragging = false;
  let focusId = null;                   // the unit running through centre stage
  const theaterWin = () => $("#theaterWindow");
  let pool = [];
  let cwRingEl = null, prFillEl = null; // cached: the rotating knurl + the position-rail fill

  // first-run "SPIN" hint on the jog dial — shown until the wheel is first used
  const HINT_KEY = "ultradex-wheel-used";
  let wheelUsed = false;
  const markWheelUsed = () => {
    if (wheelUsed) return; wheelUsed = true;
    const w = $("#clickWheel"); if (w) w.classList.add("used");
    try { localStorage.setItem(HINT_KEY, "1"); } catch {}
  };

  const maxPos = () => Math.max(0, list.length - 1);
  const clampPos = p => clamp(p, 0, maxPos());

  const buildPool = () => {
    const win = theaterWin(); win.innerHTML = "";
    pool = [];
    for (let i = 0; i < POOL; i++) {
      const f = document.createElement("div");
      f.className = "tframe"; f.dataset.idx = "-999";
      f.innerHTML = `<span class="tf-glow"></span><img class="tf-img" alt="">`;
      win.appendChild(f); pool.push(f);
    }
  };

  const paintFrame = (f, idx) => {
    const u = list[idx];
    f.dataset.idx = String(idx);
    if (!u) { f.style.display = "none"; return; }
    f.style.display = "";
    const img = f.querySelector(".tf-img");
    img.src = SPRITE(u.id); img.setAttribute("onerror", SPRITE_FALLBACK(u.dexno));
    f.querySelector(".tf-glow").className = "tf-glow t-" + u.t1;
    f.classList.toggle("on-team", slotOfId(u.id) >= 0);
    f.dataset.id = String(u.id);
  };

  const renderTheater = () => {
    const center = Math.round(pos);
    for (let k = -Math.floor(POOL / 2); k <= Math.ceil(POOL / 2) - 1; k++) {
      const idx = center + k;
      const f = pool[k + Math.floor(POOL / 2)];
      if (!f) continue;
      if (+f.dataset.idx !== idx) paintFrame(f, idx);
      if (idx < 0 || idx >= list.length) { f.style.display = "none"; continue; }
      f.style.display = "";
      const d = idx - pos;                         // signed distance from centre stage
      const x = d * FRAME;
      const ang = clamp(d * -26, -62, 62);         // carousel turn
      const dist = Math.abs(d);
      const scale = clamp(1 - dist * 0.19, 0.46, 1);
      const op = clamp(1 - dist * 0.32, 0.05, 1);
      f.style.transform = `translate(-50%,-50%) translateX(${x.toFixed(1)}px) rotateY(${ang.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
      f.style.opacity = op.toFixed(3);
      f.style.zIndex = String(100 - Math.round(dist * 10));
      f.classList.toggle("center", Math.abs(d) < 0.5);
    }
    // spin the knurl 1:1 with the dex position, and slide the position rail
    if (cwRingEl) cwRingEl.style.transform = "rotate(" + (pos * DIAL_DEG).toFixed(2) + "deg)";
    if (prFillEl) prFillEl.style.width = (maxPos() ? (clampPos(pos) / maxPos() * 100) : 0).toFixed(2) + "%";
  };

  let lastFocus = -999, snapTarget = null;
  const setFocusId = (id) => {
    if (id === focusId) return;
    focusId = id;
    $$("#teamRack .cap").forEach(c => { const s = +c.dataset.slot; c.classList.toggle("active", party[s] != null && party[s] === focusId); });
    try { if (id != null) localStorage.setItem(FOCUS_KEY, String(id)); } catch {}
  };
  const updateFoot = () => {
    const idx = clampPos(Math.round(pos));
    const u = list[idx];
    $("#reelFoot").innerHTML = list.length
      ? `<b>${String(idx + 1)}</b> / ${list.length}${u ? ` · ${u.name.toUpperCase()}` : ""}`
      : `NO UNITS MATCH FILTER`;
  };
  const setTheaterNo = () => {
    const u = list[clampPos(Math.round(pos))];
    $("#theaterNo").textContent = u ? "№" + String(u.dexno).padStart(3, "0") : "";
  };
  // resolve a crossing: swap the running unit -> nameplate + foot + dex no. Cheap;
  // the heavy full readout only builds when you press OK (openInfo).
  const onCross = () => {
    const c = clampPos(Math.round(pos));
    if (c !== lastFocus) {
      lastFocus = c; sfx.tick();
      if (navigator.vibrate && Math.abs(vel) < 0.18) navigator.vibrate(4);   // a soft detent tick (Android)
      setFocusId(list[c] ? list[c].id : null);
      renderNameplate(); updateFoot(); setTheaterNo();
      if (infoOpen()) openInfo(true);            // keep an open info sheet in sync while stepping
    }
  };

  const tick = () => {
    if (dragging) { renderTheater(); onCross(); raf = requestAnimationFrame(tick); return; }
    if (snapTarget != null) {
      const d = snapTarget - pos;
      if (Math.abs(d) > 0.002) pos += d * 0.22; else { pos = snapTarget; snapTarget = null; }
    } else if (Math.abs(vel) > 0.0006) {
      pos += vel; vel *= 0.90;
      if (pos < 0) { pos = 0; vel = 0; } else if (pos > maxPos()) { pos = maxPos(); vel = 0; }
    } else {
      vel = 0;
      const target = clampPos(Math.round(pos)), d = target - pos;
      if (Math.abs(d) > 0.0015) pos += d * 0.24;
      else { pos = target; renderTheater(); onCross(); raf = 0; return; }
    }
    renderTheater(); onCross();
    raf = requestAnimationFrame(tick);
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
  // land on the current position immediately (used on filter/boot changes)
  const resolveNow = () => {
    const idx = clampPos(Math.round(pos)); lastFocus = idx; snapTarget = null; vel = 0;
    setFocusId(list[idx] ? list[idx].id : null);
    renderTheater(); renderNameplate(); updateFoot(); setTheaterNo();
  };
  const snapTo = (idx, quiet) => {
    idx = clampPos(idx); vel = 0;
    if (prefersReduced) { pos = idx; snapTarget = null; lastFocus = -999; renderTheater(); onCross(); if (!quiet) sfx.detent(); return; }
    snapTarget = idx; kick();
    if (!quiet) sfx.detent();
  };
  const nudge = (delta) => { markWheelUsed(); snapTo(clampPos((snapTarget != null ? snapTarget : Math.round(pos)) + delta), true); sfx.detent(); };

  // ---- theatre drag (horizontal filmstrip) + tap-to-open-info ----
  const initTheaterDrag = () => {
    const th = $("#theater");
    let startX = 0, startY = 0, startPos = 0, lastX = 0, lastT = 0, moved = false;
    th.addEventListener("pointerdown", e => {
      firstTouchUnlock(); markWheelUsed();
      dragging = true; vel = 0; moved = false;
      startX = lastX = e.clientX; startY = e.clientY; startPos = pos; lastT = performance.now();
      try { th.setPointerCapture(e.pointerId); } catch {}
      kick();
    });
    th.addEventListener("pointermove", e => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4 || Math.abs(e.clientY - startY) > 4) moved = true;
      pos = clampPos(startPos - dx / FRAME);
      const now = performance.now(), dt = Math.max(1, now - lastT);
      vel = -((e.clientX - lastX) / FRAME) / dt * 16;   // per-frame index velocity
      vel = clamp(vel, -2.4, 2.4);
      lastX = e.clientX; lastT = now;
      renderTheater();
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      if (!moved) openInfo();                          // a clean tap on the stage -> open info
      kick();
    };
    th.addEventListener("pointerup", end);
    th.addEventListener("pointercancel", () => { dragging = false; kick(); });
    th.addEventListener("wheel", e => {
      e.preventDefault(); firstTouchUnlock();
      nudge(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
  };

  // ---- click wheel (jog dial + poles + centre FILE) ----
  const initClickWheel = () => {
    const wheel = $("#clickWheel"), ring = $("#cwRing"), touch = $("#cwTouch");
    let spinning = false, cx = 0, cy = 0, rad = 0, lastAng = 0, acc = 0;
    const angOf = (x, y) => Math.atan2(y - cy, x - cx);
    const placeTouch = (x, y) => { const a = angOf(x, y);
      touch.style.transform = `translate(${(Math.cos(a) * rad).toFixed(1)}px, ${(Math.sin(a) * rad).toFixed(1)}px)`; };
    ring.addEventListener("pointerdown", e => {
      firstTouchUnlock(); markWheelUsed();
      const r = ring.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; rad = r.width * 0.38;
      spinning = true; lastAng = angOf(e.clientX, e.clientY); acc = 0;
      wheel.classList.add("spinning"); placeTouch(e.clientX, e.clientY);
      try { ring.setPointerCapture(e.pointerId); } catch {}
    });
    ring.addEventListener("pointermove", e => {
      if (!spinning) return;
      placeTouch(e.clientX, e.clientY);
      const a = angOf(e.clientX, e.clientY);
      let d = a - lastAng;
      if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
      lastAng = a; acc += d;
      const STEP = Math.PI / 5.2;                       // ~a sixth-turn per entry — a firm, geared feel
      while (acc >= STEP) { acc -= STEP; nudge(1); }
      while (acc <= -STEP) { acc += STEP; nudge(-1); }
    });
    const stop = () => { spinning = false; wheel.classList.remove("spinning"); };
    ring.addEventListener("pointerup", stop);
    ring.addEventListener("pointercancel", stop);
    // centre OK -> open the running unit's full info sheet
    $("#cwCenter").addEventListener("click", () => { firstTouchUnlock(); openInfo(); });
  };

  // ================================================================ FILTER ===
  let genFilter = 0, query = "";
  const rebuildList = (keepId) => {
    const nq = norm(query), digits = query.replace(/\D/g, "");
    list = DEX.filter(u => {
      if (genFilter && u.gen !== genFilter) return false;
      if (!nq && !digits) return true;
      if (nq && u.key.includes(nq)) return true;
      if (digits && (String(u.dexno).includes(digits) || String(u.id).includes(digits))) return true;
      return false;
    });
    if (query) {
      list.sort((a, b) => (b.key.startsWith(nq) - a.key.startsWith(nq)) || (a.dexno - b.dexno) || (a.id - b.id));
    } else list.sort((a, b) => a.dexno - b.dexno || a.id - b.id);
    // keep the focus if still present, else land at top
    let idx = 0;
    if (keepId != null) { const f = list.findIndex(u => u.id === keepId); if (f >= 0) idx = f; }
    const pt = $("#prTicks"); if (pt) pt.classList.toggle("hide", !!(genFilter || query));   // ticks only honest on the full dex
    pos = clampPos(idx); resolveNow();
  };
  const buildGenChips = () => {
    const el = $("#genChips");
    const chips = ['<button class="gchip sel" data-gen="0">ALL</button>'];
    for (let g = 1; g <= 9; g++) chips.push(`<button class="gchip" data-gen="${g}">${ROMAN[g - 1]}</button>`);
    el.innerHTML = chips.join("");
  };
  // gen-boundary ticks on the position rail (national-dex proportions; only honest
  // when the full dex is shown, so they hide under a filter)
  const buildPosTicks = () => {
    const el = $("#prTicks"); if (!el) return;
    el.innerHTML = GEN_CAPS.slice(0, 8).map(cap => `<i style="left:${(cap / 1025 * 100).toFixed(2)}%"></i>`).join("");
  };

  // ================================================================ ACTIONS ==
  const flashCap = (i, kind) => {
    const cap = $(`#teamRack .cap[data-slot="${i}"]`);
    if (!cap) return; cap.classList.remove("pulse-add", "pulse-no");
    void cap.offsetWidth; cap.classList.add(kind === "no" ? "pulse-no" : "pulse-add");
  };
  const fileFocus = (slot) => {
    if (focusId == null) { sfx.err(); return; }
    let i = slot != null ? slot : firstEmpty();
    if (i < 0) {                                   // full — replace lead? no: signal full
      sfx.err(); $("#tzHint").innerHTML = "TEAM FULL · HOLD A UNIT TO RELEASE"; return;
    }
    const changed = party[i] !== focusId;
    party[i] = focusId; saveParty();
    if (changed) resetSlotMoves(i);
    refreshTeam(); flashCap(i, "add"); sfx.add();
  };
  const inspectSlot = (i) => {                     // tap a filled cap -> jump wheel + screen to it
    const id = party[i]; if (id == null) return;
    if (list.findIndex(u => u.id === id) < 0) {     // not in current filter -> clear filters
      query = ""; genFilter = 0; $("#dexSearch").value = ""; $("#dexClear").classList.remove("show");
      $$("#genChips .gchip").forEach(g => g.classList.toggle("sel", g.dataset.gen === "0"));
      rebuildList(id);
    } else {
      const idx = list.findIndex(u => u.id === id); snapTo(idx, true);
    }
    sfx.select();
  };
  const releaseSlot = (i) => {
    party[i] = null; saveParty(); resetSlotMoves(i);
    refreshTeam(); sfx.clear();
  };
  // ---- INFO SHEET (opened by OK / tapping the theatre) ----
  let infoUnitId = -1;
  const infoOpen = () => $("#infoSheet").classList.contains("open");
  const openInfo = (refresh) => {
    if (focusId == null) { sfx.err(); return; }
    const u = byId.get(focusId); if (!u) return;
    infoUnitId = u.id;
    $("#infoBody").innerHTML = unitReadoutHTML(u);
    const slot = slotOfId(u.id);
    $("#infoFoot").innerHTML = slot >= 0
      ? `<button class="is-btn danger" data-is="release">⌫ RELEASE ${slot === 0 ? "LEAD" : "0" + (slot + 1)}</button>
         <button class="is-btn" data-is="close">CLOSE</button>`
      : `<button class="is-btn key" data-is="file">＋ FILE TO TEAM</button>
         <button class="is-btn" data-is="close">CLOSE</button>`;
    animateReadout($("#infoBody"));
    if (!refresh) { const el = $("#infoSheet"); el.classList.add("open"); el.setAttribute("aria-hidden", "false"); sfx.open(); }
  };
  const closeInfo = () => { const el = $("#infoSheet"); el.classList.remove("open"); el.setAttribute("aria-hidden", "true"); };

  const makeLead = (i) => {
    if (i === 0 || party[i] == null) return;
    [party[0], party[i]] = [party[i], party[0]];
    [partyMoves[0], partyMoves[i]] = [partyMoves[i], partyMoves[0]];
    saveParty(); saveMoves(); refreshTeam(); sfx.select();
  };
  const swapSlots = (a, b) => {
    if (a === b || a < 0 || b < 0 || a > 5 || b > 5) return;
    if (party[a] == null && party[b] == null) return;
    [party[a], party[b]] = [party[b], party[a]];
    [partyMoves[a], partyMoves[b]] = [partyMoves[b], partyMoves[a]];
    saveParty(); saveMoves(); refreshTeam(); sfx.select();
  };

  // ---- team rack pointer: tap / long-press / drag-reorder ----
  const initTeamRack = () => {
    const rack = $("#teamRack");
    const LONG = 380, DRAG_MIN = 7;
    let downSlot = -1, srcEl = null, startX = 0, startY = 0, longT = 0;
    let armed = false, dragging2 = false, didLong = false, srcRect = null, scale = 1;
    const capAt = s => rack.querySelector(`.cap[data-slot="${s}"]`);
    const slotUnder = (x, y) => {
      for (const el of $$(".cap", rack)) {
        if (el === srcEl) continue;
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return +el.dataset.slot;
      } return -1;
    };
    const clearDrop = () => $$(".cap.drop-target", rack).forEach(el => el.classList.remove("drop-target"));
    rack.addEventListener("pointerdown", e => {
      firstTouchUnlock();
      const cap = e.target.closest(".cap"); if (!cap) return;
      downSlot = +cap.dataset.slot; srcEl = cap; startX = e.clientX; startY = e.clientY;
      armed = true; dragging2 = false; didLong = false;
      clearTimeout(longT);
      if (party[downSlot] != null) {
        longT = setTimeout(() => {
          if (!dragging2) { didLong = true; openCapMenu(downSlot); if (navigator.vibrate) navigator.vibrate(12); }
        }, LONG);
      }
    });
    rack.addEventListener("pointermove", e => {
      if (!armed) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!dragging2 && Math.hypot(dx, dy) > DRAG_MIN) {
        if (party[downSlot] == null) { armed = false; return; }   // nothing to drag from empty
        clearTimeout(longT);
        dragging2 = true; dragActiveFlag = true;
        const cr = rack.getBoundingClientRect(); scale = rack.offsetWidth ? cr.width / rack.offsetWidth : 1;
        srcRect = srcEl.getBoundingClientRect();
        srcEl.classList.add("dragging");
        try { rack.setPointerCapture(e.pointerId); } catch {}
      }
      if (dragging2) {
        srcEl.style.transform = `translate(${(dx / scale).toFixed(1)}px, ${(dy / scale).toFixed(1)}px) scale(1.1)`;
        clearDrop();
        const t = slotUnder(e.clientX, e.clientY);
        if (t >= 0 && t !== downSlot) { const el = capAt(t); if (el) el.classList.add("drop-target"); }
      }
    });
    const end = e => {
      clearTimeout(longT);
      if (dragging2) {
        const to = slotUnder(e.clientX, e.clientY);
        clearDrop(); if (srcEl) { srcEl.classList.remove("dragging"); srcEl.style.transform = ""; }
        if (to >= 0 && to !== downSlot) swapSlots(downSlot, to);
        dragActiveFlag = false; armed = false; dragging2 = false; srcEl = null; return;
      }
      if (armed && !didLong) {                        // a clean tap
        if (party[downSlot] == null) fileFocus(downSlot);
        else inspectSlot(downSlot);
      }
      armed = false; srcEl = null;
    };
    rack.addEventListener("pointerup", end);
    rack.addEventListener("pointercancel", () => { clearTimeout(longT); if (srcEl) { srcEl.classList.remove("dragging"); srcEl.style.transform = ""; } clearDrop(); armed = dragging2 = false; dragActiveFlag = false; srcEl = null; });
  };
  let dragActiveFlag = false;

  // ================================================================ CAP MENU ==
  let cmSlot = -1;
  const openCapMenu = (i) => {
    cmSlot = i; const id = party[i]; if (id == null) return;
    const u = byId.get(id);
    $("#cmSprite").src = SPRITE(u.id); $("#cmSprite").setAttribute("onerror", SPRITE_FALLBACK(u.dexno));
    $("#cmSlot").textContent = i === 0 ? "LEAD UNIT" : "SLOT 0" + (i + 1);
    $("#cmName").textContent = u.name;
    $("#cmTypes").innerHTML = typeChip(u.t1) + typeChip(u.t2);
    const leadBtn = $('#capMenu .cm-act[data-cm="lead"]'); if (leadBtn) leadBtn.disabled = (i === 0);
    renderCapMoves();
    const el = $("#capMenu"); el.classList.add("open"); el.setAttribute("aria-hidden", "false"); sfx.open();
  };
  const closeCapMenu = () => { const el = $("#capMenu"); el.classList.remove("open"); el.setAttribute("aria-hidden", "true"); cmSlot = -1; };
  const renderCapMoves = () => {
    if (cmSlot < 0) return;
    const id = party[cmSlot], u = byId.get(id);
    const learn = (LEARN_LOADED && LEARN[id]) ? LEARN[id] : null;
    $("#cmLearnNote").textContent = learn ? `${learn.size} LEARNABLE` : "ALL MOVES";
    const mv = partyMoves[cmSlot] || [null, null, null, null];
    $("#cmMoves").innerHTML = [0, 1, 2, 3].map(k => {
      const m = mv[k] != null ? moveById.get(mv[k]) : null;
      return m
        ? `<div class="mslot filled" data-mv="${k}"><span class="mslot-top"><span class="mslot-k">${k + 1}</span><i class="mslot-dot t-${m.type}"></i></span>
             <span class="mslot-name">${m.name}</span>
             <span class="mslot-pow">${m.power > 0 ? m.power + " BP · " + (m.cat === "P" ? "PHYS" : "SPEC") : m.cat === "S" ? "SPEC" : m.cat === "P" ? "PHYS" : "STATUS"}</span>
             <button class="mslot-x" data-mvx="${k}" aria-label="Clear move ${k + 1}">&times;</button></div>`
        : `<div class="mslot empty" data-mv="${k}"><span class="mslot-k">${k + 1}</span><span class="mslot-add">+ SET MOVE</span></div>`;
    }).join("");
  };

  // ---- move picker ----
  let mpTarget = -1;
  const MOVE_CAP = 60;
  const openMovePick = (k) => {
    if (cmSlot < 0 || party[cmSlot] == null) return;
    mpTarget = k; $("#mpSlot").textContent = String(k + 1);
    const u = byId.get(party[cmSlot]);
    const input = $("#moveSearch"); input.value = ""; $("#moveClear").classList.remove("show");
    input.placeholder = u ? `SEARCH ${u.name.toUpperCase()} MOVES` : "SEARCH MOVES";
    renderMoveResults("");
    const el = $("#movePick"); el.classList.add("open"); el.setAttribute("aria-hidden", "false"); sfx.open();
    setTimeout(() => input.focus(), 300);
  };
  const closeMovePick = () => { const el = $("#movePick"); el.classList.remove("open"); el.setAttribute("aria-hidden", "true"); mpTarget = -1; };
  const renderMoveResults = (q) => {
    const nq = norm(q), id = party[cmSlot];
    const own = new Set((partyMoves[cmSlot] || []).filter((x, k) => x != null && k !== mpTarget));
    const learn = (LEARN_LOADED && id != null) ? LEARN[id] : null;
    const poolM = learn ? MOVES.filter(m => learn.has(m.id)) : MOVES;
    let l = poolM.filter(m => !nq || m.key.includes(nq));
    const total = l.length;
    if (nq) l.sort((a, b) => (b.key.startsWith(nq) - a.key.startsWith(nq)) || a.name.localeCompare(b.name));
    else l.sort((a, b) => a.name.localeCompare(b.name));
    const shown = l.slice(0, MOVE_CAP), res = $("#moveResults");
    if (!total) { res.innerHTML = `<div class="mp-none">${learn ? "NOT IN THIS UNIT'S LEARNSET" : "NO MOVES MATCH QUERY"}</div>`; $("#moveFoot").textContent = ""; return; }
    res.innerHTML = shown.map(m =>
      `<div class="mv-row${own.has(m.id) ? " dup" : ""}" data-mvid="${m.id}">
         <span class="mv-typedot t-${m.type}"></span>
         <div class="mv-body"><div class="mv-name">${m.name}</div>
           <div class="mv-sub"><span class="tchip t-${m.type}">${m.type}</span>
             <span class="mv-meta">${m.power > 0 ? m.power + " BP" : "—"} · ${m.cat === "P" ? "PHYS" : m.cat === "S" ? "SPEC" : "STAT"}</span>
             ${own.has(m.id) ? `<span class="mv-dupflag">SET</span>` : ""}</div></div>
       </div>`).join("");
    res.scrollTop = 0;
    $("#moveFoot").innerHTML = `SHOWING <b>${shown.length}</b>/<b>${total}</b>${learn ? " LEARNABLE" : ""}`;
  };
  const assignMove = (moveId) => {
    if (mpTarget < 0 || cmSlot < 0 || party[cmSlot] == null) return;
    partyMoves[cmSlot][mpTarget] = moveId; saveMoves();
    renderCapMoves(); renderTeamRack(); closeMovePick(); sfx.add();
  };

  // ============================================================== SKINS ======
  const SKINS = ["y2k-aqua", "y2k-silver", "hud", "plastic-red", "plastic-cream"];
  const SKIN_CLASS = {
    "y2k-aqua":     ["y2k", "y2k-aqua"],
    "y2k-silver":   ["y2k", "y2k-silver"],
    "hud":          [],
    "plastic-red":  ["skin-plastic"],
    "plastic-cream":["skin-plastic", "plastic-cream"],
  };
  const ALL_SKIN_CLASSES = [...new Set(Object.values(SKIN_CLASS).flat())];
  let skin = "y2k-aqua";
  const applySkin = (next, animate = true) => {
    skin = SKINS.includes(next) ? next : "y2k-aqua";
    const phone = $("#phone");
    phone.classList.remove(...ALL_SKIN_CLASSES);
    if (SKIN_CLASS[skin].length) phone.classList.add(...SKIN_CLASS[skin]);
    $("#skinToggle").setAttribute("aria-pressed", skin !== "hud" ? "true" : "false");
    try { localStorage.setItem(SKIN_KEY, skin); } catch {}
    if (animate) sfx.select();
  };
  const cycleSkin = () => applySkin(SKINS[(SKINS.indexOf(skin) + 1) % SKINS.length]);

  // ============================================================== EVENTS =====
  const wireEvents = () => {
    initTheaterDrag(); initClickWheel(); initTeamRack();

    // function rack
    $("#funcRack").addEventListener("click", e => {
      const b = e.target.closest(".fcap"); if (!b) return; firstTouchUnlock();
      const fn = b.dataset.fn;
      if (fn === "file") fileFocus();
      else if (fn === "random") { snapTo((Math.random() * list.length) | 0, true); sfx.select(); }
      else if (fn === "rate") openMatrix();
    });

    // rails expand the rating matrix
    $("#railL").addEventListener("click", () => { firstTouchUnlock(); openMatrix(); });
    $("#railR").addEventListener("click", () => { firstTouchUnlock(); openMatrix(); });

    // search
    const input = $("#dexSearch");
    input.addEventListener("input", () => {
      $("#dexClear").classList.toggle("show", input.value.length > 0);
      query = input.value; rebuildList(focusId);
    });
    $("#dexClear").addEventListener("click", () => { input.value = ""; query = ""; $("#dexClear").classList.remove("show"); rebuildList(focusId); input.focus(); });
    $("#genChips").addEventListener("click", e => {
      const c = e.target.closest(".gchip"); if (!c) return; firstTouchUnlock();
      genFilter = +c.dataset.gen;
      $$("#genChips .gchip").forEach(g => g.classList.toggle("sel", g === c));
      sfx.tick(); rebuildList(focusId);
    });

    // skin
    $("#skinToggle").addEventListener("click", () => { firstTouchUnlock(); cycleSkin(); });

    // cap menu
    $("#cmClose").addEventListener("click", closeCapMenu);
    $("#capMenu").addEventListener("click", e => { if (e.target === $("#capMenu")) closeCapMenu(); });
    $("#capMenu").addEventListener("click", e => {
      const act = e.target.closest(".cm-act"); if (act) {
        firstTouchUnlock(); const a = act.dataset.cm; const i = cmSlot;
        if (a === "lead") { makeLead(i); closeCapMenu(); }
        else if (a === "inspect") { inspectSlot(i); closeCapMenu(); }
        else if (a === "release") { releaseSlot(i); closeCapMenu(); }
        return;
      }
      const x = e.target.closest(".mslot-x");
      if (x) { e.stopPropagation(); const k = +x.dataset.mvx; partyMoves[cmSlot][k] = null; saveMoves(); renderCapMoves(); renderTeamRack(); sfx.clear(); return; }
      const s = e.target.closest(".mslot"); if (s) openMovePick(+s.dataset.mv);
    });

    // move picker
    $("#mpBack").addEventListener("click", closeMovePick);
    $("#movePick").addEventListener("click", e => { if (e.target === $("#movePick")) closeMovePick(); });
    const mInput = $("#moveSearch");
    mInput.addEventListener("input", () => { $("#moveClear").classList.toggle("show", mInput.value.length > 0); renderMoveResults(mInput.value); });
    $("#moveClear").addEventListener("click", () => { mInput.value = ""; $("#moveClear").classList.remove("show"); renderMoveResults(""); mInput.focus(); });
    $("#moveResults").addEventListener("click", e => { const r = e.target.closest(".mv-row"); if (r) assignMove(+r.dataset.mvid); });

    // matrix
    $("#matrixClose").addEventListener("click", closeMatrix);
    $("#matrix").addEventListener("click", e => { if (e.target === $("#matrix")) closeMatrix(); });

    // info sheet (OK / theatre tap): file / release / close
    $("#infoClose").addEventListener("click", closeInfo);
    $("#infoSheet").addEventListener("click", e => {
      if (e.target === $("#infoSheet")) { closeInfo(); return; }
      const b = e.target.closest("[data-is]"); if (!b) return;
      firstTouchUnlock();
      const a = b.dataset.is;
      if (a === "close") closeInfo();
      else if (a === "file") { fileFocus(); openInfo(true); }
      else if (a === "release") { const s = slotOfId(infoUnitId); if (s >= 0) releaseSlot(s); openInfo(true); }
    });

    // keyboard: arrows scrub the wheel
    addEventListener("keydown", e => {
      if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if (e.key === "ArrowDown") { nudge(1); e.preventDefault(); }
      else if (e.key === "ArrowUp") { nudge(-1); e.preventDefault(); }
      else if (e.key === "PageDown") { nudge(10); e.preventDefault(); }
      else if (e.key === "PageUp") { nudge(-10); e.preventDefault(); }
      else if (e.key === "Enter") { openInfo(); }
      else if (e.key === " ") { fileFocus(); e.preventDefault(); }
      else if (e.key === "Escape") { closeInfo(); closeMatrix(); closeCapMenu(); closeMovePick(); }
    });
  };

  // -------------------------------------------------------------- clock -----
  const clockTick = () => {
    const el = $("#clock"); if (!el) return;
    const upd = () => { const d = new Date(); el.textContent = d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0"); };
    upd(); setInterval(upd, 15000);
  };

  // --------------------------------------------------------------- boot -----
  async function boot() {
    let raw;
    try { raw = await (await fetch("data/pokedex.json")).json(); }
    catch { $("#nameplate").innerHTML = `<div class="np-empty" style="color:var(--amber)">DATABASE OFFLINE · COULD NOT LOAD DEX</div>`; return; }
    DEX = raw.map(r => {
      const [id, ident, t1, t2, stats, dexno] = r;
      const u = { id, ident, name: prettify(ident), key: norm(ident), t1, t2: t2 || null,
                  stats, bst: stats.reduce((a, b) => a + b, 0), dexno, gen: genOf(dexno) };
      byId.set(id, u); return u;
    });
    try {
      const mraw = await (await fetch("data/moves.json")).json();
      MOVES = mraw.map(r => { const [id, name, type, power, cat] = r; const m = { id, name, type, key: norm(name), power: power || 0, cat: cat || "N" }; moveById.set(id, m); return m; });
    } catch {}
    try {
      const lraw = await (await fetch("data/learnsets.json")).json();
      for (const k in lraw) LEARN[k] = new Set(lraw[k]); LEARN_LOADED = true;
    } catch {}
    // per-region native-catch dex (which regions can catch a species without transfer)
    try {
      const nd = await (await fetch("data/nativedex.json")).json();
      for (let g = 1; g <= 9; g++) NATIVE_DEX[g] = new Set(nd[g] || nd[String(g)] || []);
      NATIVE_LOADED = true;
    } catch {}

    loadParty(); loadMoves();
    // deep-link: #f=<dexId> focuses a unit; #team=a,b,c… seeds the party (also handy for testing)
    let hashFocus = null;
    try {
      const h = new URLSearchParams(location.hash.slice(1));
      const t = h.get("team");
      if (t) { const ids = t.split(",").map(Number).filter(x => byId.has(x)).slice(0, 6);
        if (ids.length) { party = [null,null,null,null,null,null]; ids.forEach((id, i) => party[i] = id); saveParty(); } }
      const f = +h.get("f"); if (byId.has(f)) hashFocus = f;
    } catch {}
    buildGenChips(); buildPool(); buildPosTicks();
    cwRingEl = $("#cwRing"); prFillEl = $("#prFill");
    try { if (localStorage.getItem(HINT_KEY)) markWheelUsed(); } catch {}
    updateCount(); renderTeamRack(); renderRails();

    // restore skin
    let savedSkin = "y2k-aqua";
    try { const s = localStorage.getItem(SKIN_KEY); if (SKINS.includes(s)) savedSkin = s; } catch {}
    applySkin(savedSkin, false);

    // initial list + focus
    rebuildList(null);
    let startId = hashFocus;
    try { const f = +localStorage.getItem(FOCUS_KEY); if (startId == null && byId.has(f)) startId = f; } catch {}
    if (startId == null && party.some(x => x != null)) startId = party.find(x => x != null);
    if (startId != null) { const idx = list.findIndex(u => u.id === startId); if (idx >= 0) { pos = idx; resolveNow(); } }

    wireEvents();
    if (!prefersReduced) initTactile();
    clockTick();

    // deep-link openers (also used for review screenshots)
    try {
      const h = new URLSearchParams(location.hash.slice(1)), m = h.get("menu");
      if (m === "cap" && party[0] != null) setTimeout(() => openCapMenu(0), 150);
      else if (m === "move" && party[0] != null) { openCapMenu(0); setTimeout(() => openMovePick(0), 220); }
      else if (m === "rate") setTimeout(openMatrix, 150);
      else if (m === "info") setTimeout(() => openInfo(), 150);
    } catch {}
  }

  boot();
})();
