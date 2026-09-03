/* =============================================================================
   POKÉHOTSPOT — core.js
   The shared spine every station stands on: data + type engine, the team state
   (one team, felt everywhere) with an event bus, the palette engine, the station
   router (home world recedes as a station grows from its glyph), cries, and the
   shared overlays (species info sheet · capsule menu · settings).
   Everything hangs off window.PH.
   ========================================================================== */
(() => {
  "use strict";

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const norm = s => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const prettify = id => id.replace(/-/g, " ");
  const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };

  // ---- assets ---------------------------------------------------------------
  const SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
  const HOME   = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${id}.png`;
  const CRY    = no => `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${no}.ogg`;
  const spriteFallback = dex => `this.onerror=null;this.src='${SPRITE(dex)}'`;

  // ---- constants ------------------------------------------------------------
  const GEN_CAPS = [151, 251, 386, 493, 649, 721, 809, 905, 1025];
  const ROMAN = ["I","II","III","IV","V","VI","VII","VIII","IX"];
  const STAT_LBL = ["HP","ATK","DEF","SPA","SPD","SPE"];
  const STAT_MAX = 255;
  const genOf = dex => { for (let i = 0; i < GEN_CAPS.length; i++) if (dex <= GEN_CAPS[i]) return i + 1; return 9; };

  const REGIONS = {
    1:{ name:"KANTO",  games:"RBY · FRLG · LGPE" },
    2:{ name:"JOHTO",  games:"GSC · HGSS" },
    3:{ name:"HOENN",  games:"RSE · ORAS" },
    4:{ name:"SINNOH", games:"DPPt · BDSP · Legends" },
    5:{ name:"UNOVA",  games:"BW · B2W2" },
    6:{ name:"KALOS",  games:"XY" },
    7:{ name:"ALOLA",  games:"SM · USUM" },
    8:{ name:"GALAR",  games:"SwSh" },
    9:{ name:"PALDEA", games:"SV" },
  };

  // ---- type / readiness engine (ported from pokemeter/aremypokemongood) -----
  const TYPES = ["normal","fire","water","electric","grass","ice","fighting","poison",
    "ground","flying","psychic","bug","rock","ghost","dragon","dark","steel","fairy"];
  const CHART = {
    normal:{rock:.5,steel:.5,ghost:0},
    fire:{grass:2,ice:2,bug:2,steel:2,fire:.5,water:.5,rock:.5,dragon:.5},
    water:{fire:2,ground:2,rock:2,water:.5,grass:.5,dragon:.5},
    electric:{water:2,flying:2,electric:.5,grass:.5,dragon:.5,ground:0},
    grass:{water:2,ground:2,rock:2,fire:.5,grass:.5,poison:.5,flying:.5,bug:.5,dragon:.5,steel:.5},
    ice:{grass:2,ground:2,flying:2,dragon:2,fire:.5,water:.5,ice:.5,steel:.5},
    fighting:{normal:2,ice:2,rock:2,dark:2,steel:2,poison:.5,flying:.5,psychic:.5,bug:.5,fairy:.5,ghost:0},
    poison:{grass:2,fairy:2,poison:.5,ground:.5,rock:.5,ghost:.5,steel:0},
    ground:{fire:2,electric:2,poison:2,rock:2,steel:2,grass:.5,bug:.5,flying:0},
    flying:{grass:2,fighting:2,bug:2,electric:.5,rock:.5,steel:.5},
    psychic:{fighting:2,poison:2,psychic:.5,steel:.5,dark:0},
    bug:{grass:2,psychic:2,dark:2,fire:.5,fighting:.5,poison:.5,flying:.5,ghost:.5,steel:.5,fairy:.5},
    rock:{fire:2,ice:2,flying:2,bug:2,fighting:.5,ground:.5,steel:.5},
    ghost:{psychic:2,ghost:2,dark:.5,normal:0},
    dragon:{dragon:2,steel:.5,fairy:0},
    dark:{psychic:2,ghost:2,fighting:.5,dark:.5,fairy:.5},
    steel:{ice:2,rock:2,fairy:2,fire:.5,water:.5,electric:.5,steel:.5},
    fairy:{fighting:2,dragon:2,dark:2,fire:.5,poison:.5,steel:.5},
  };
  const effOn = (atk, d1, d2) => (CHART[atk][d1] ?? 1) * (d2 ? (CHART[atk][d2] ?? 1) : 1);
  // incoming multiplier of attacking type vs a defender's types
  const effAgainst = (atkType, u) => effOn(atkType, u.t1, u.t2);

  const DUTIES = [
    { key:"physatk",  name:"PHYS ATK",  test:s => s[1] >= 100 },
    { key:"specatk",  name:"SPEC ATK",  test:s => s[3] >= 100 },
    { key:"physwall", name:"PHYS WALL", test:s => s[2] >= 100 && s[0] >= 60 },
    { key:"specwall", name:"SPEC WALL", test:s => s[4] >= 95  && s[0] >= 60 },
    { key:"speed",    name:"SPEED",     test:s => s[5] >= 105 },
    { key:"support",  name:"SUPPORT",   test:s => s[0] >= 85 && s[2] >= 70 && s[4] >= 70 },
  ];
  const archetype = s => {
    const [hp, atk, def, spa, spd] = s, spe = s[5];
    const off = Math.max(atk, spa), phys = atk >= spa;
    const bulkP = hp * def, bulkS = hp * spd, bst = s.reduce((a,b)=>a+b,0);
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
  const WALL_ARCH  = new Set(["FORTRESS","PHYS WALL","SPEC WALL","BULKY PIVOT"]);
  const SWEEP_ARCH = new Set(["PHYS SWEEPER","SPEC SWEEPER","SCOUT","WALLBREAKER","SPEC BREAKER"]);
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
    if (dEx) { score -= dEx; notes.push({ tag:"shared weakness", val:dEx, types: exposed.map(x=>x.t) }); }
    const dWall = Math.min(16, walled.length * 8);
    if (dWall) { score -= dWall; notes.push({ tag:"walled attacks", val:dWall, types: walled }); }
    const neutralOnly = uncovered.length - walled.length;
    const dOff = Math.min(15, Math.max(0, neutralOnly - 1) * 3);
    if (dOff) { score -= dOff; notes.push({ tag:"coverage gaps", val:dOff }); }
    const dRole = Math.min(30, vacant.length * 6);
    if (dRole) { score -= dRole; notes.push({ tag:"unfilled duties", val:dRole, roles: vacant.map(d=>d.name) }); }
    if (team.length < 6) { const dSize = (6 - team.length) * 4; score -= dSize; notes.push({ tag:"roster forming", val:dSize }); }
    score = Math.max(0, Math.round(score));
    // extra structural metrics (used by FORGE scoring + AUDIT readout)
    const resistBreadth = TYPES.filter(t => defRows[t].resist > defRows[t].weak).length;
    const typeDiv = new Set(team.flatMap(p => [p.t1, p.t2]).filter(Boolean)).size;
    const speed = team.filter(p => p.stats[5] >= 100).length;
    const bulk = team.filter(p => WALL_ARCH.has(archetype(p.stats))).length;
    const sweepers = team.filter(p => SWEEP_ARCH.has(archetype(p.stats))).length;
    const avgBST = team.length ? Math.round(team.reduce((a,p)=>a+p.bst,0) / team.length) : 0;
    return { defRows, exposed, secure, stabs, offRows, uncovered, walled, staffed, vacant, score, notes,
      resistBreadth, typeDiv, speed, bulk, sweepers, avgBST, count: team.length };
  };
  const readinessTier = s =>
    s >= 90 ? { lbl:"OPTIMAL",  cls:"t-opt" } :
    s >= 75 ? { lbl:"SOLID",    cls:"t-sol" } :
    s >= 55 ? { lbl:"WORKABLE", cls:"t-wrk" } :
    s >= 35 ? { lbl:"RAW",      cls:"t-raw" } :
              { lbl:"FORMING",  cls:"t-frm" };

  // ---- data stores ----------------------------------------------------------
  let DEX = [];                 // [{id,ident,name,key,t1,t2,stats,bst,dexno,gen}]
  const byId = new Map();       // id  -> unit
  const byDex = new Map();      // national dexno -> unit (first / base form)
  let MOVES = []; const moveById = new Map();
  const LEARN = {};             // moveId -> Set(species dexno)
  const NATIVE = {};            // region -> Set(dexno)
  const REGION_OF = new Map();  // dexno -> [regions]
  let CATCH = { notes:{} };     // curated catch overlay (data/catch.json)
  let LEARN_LOADED = false;

  // moves a species can learn — learnsets are keyed by species id → move-id Set
  // (evolution lines inherit; forms with no set fall back to their base dex no.)
  const learnableFor = unit => {
    if (!LEARN_LOADED || !unit) return null;
    const set = LEARN[unit.id] || LEARN[unit.dexno];
    if (!set) return null;
    return MOVES.filter(m => set.has(m.id));
  };

  // ---- team state (one team, felt everywhere) + event bus -------------------
  const KEY = { team:"pokehotspot-team-v1", pool:"pokehotspot-pool-v1",
                pal:"pokehotspot-palette", loc:"pokehotspot-locale", set:"pokehotspot-settings" };
  const listeners = {};
  const on  = (evt, fn) => (listeners[evt] ??= []).push(fn);
  const emit = (evt, d) => (listeners[evt] || []).forEach(fn => { try { fn(d); } catch(e){ console.error(e); } });

  const state = {
    team: new Array(6).fill(null),  // null | {id, moves:[moveId..]}
    pool: [],                       // dexno / id list for FORGE
    palette: "aqua",
    locale: "route",
    settings: {},
  };

  const saveTeam = () => { try { localStorage.setItem(KEY.team, JSON.stringify(state.team)); } catch {} };
  const savePool = () => { try { localStorage.setItem(KEY.pool, JSON.stringify(state.pool)); } catch {} };

  // resolved, non-null team members with slot index attached
  const teamUnits = () => state.team.map((t,i) => t && byId.get(t.id) ? { ...byId.get(t.id), moves: t.moves||[], slot:i } : null).filter(Boolean);
  const partyCount = () => state.team.filter(Boolean).length;
  const firstEmpty = () => state.team.findIndex(t => !t);

  const setSlot = (slot, id) => {
    if (slot < 0 || slot > 5) return;
    state.team[slot] = { id, moves: [] };
    saveTeam(); emit("team");
  };
  const addUnit = id => {                 // file into first empty slot
    if (state.team.some(t => t && t.id === id)) return false;
    const i = firstEmpty(); if (i < 0) return false;
    setSlot(i, id); return true;
  };
  const releaseSlot = slot => { state.team[slot] = null; saveTeam(); emit("team"); };
  const makeLead = slot => {
    if (slot <= 0 || !state.team[slot]) return;
    const [u] = state.team.splice(slot, 1); state.team.unshift(u);
    while (state.team.length < 6) state.team.push(null);
    saveTeam(); emit("team");
  };
  const setMove = (slot, mi, moveId) => {
    const t = state.team[slot]; if (!t) return;
    t.moves = t.moves || []; t.moves[mi] = moveId; saveTeam(); emit("team");
  };
  const adoptTeam = (ids, movesets) => {  // replace whole team (forge/quiz result)
    state.team = new Array(6).fill(null);
    ids.slice(0,6).forEach((id,i) => { if (id != null)
      state.team[i] = { id, moves: (movesets && movesets[i]) ? movesets[i].slice(0,4) : [] }; });
    saveTeam(); emit("team");
  };

  // ---- cries ----------------------------------------------------------------
  let audio;
  const playCry = (unit) => {
    if (!unit) return;
    try {
      audio = audio || new Audio(); audio.pause();
      audio.volume = 0.55;
      const src = CRY(unit.dexno);
      audio.src = src;
      audio.play().catch(() => {
        // form ids sometimes lack a cry file; base national dex already used, no retry
      });
    } catch {}
  };

  // ---- palette engine -------------------------------------------------------
  const PALETTES = [
    { id:"aqua",     dot:"#35e6ff" },
    { id:"cherry",   dot:"#ff5a6a" },
    { id:"marigold", dot:"#ffb020" },
    { id:"leaf",     dot:"#54d98c" },
    { id:"orchid",   dot:"#b98cff" },
    { id:"dusk",     dot:"#5b8cff" },
    { id:"rose",     dot:"#ff7ab8" },
    { id:"mono",     dot:"#cfe0ea" },
  ];
  const applyPalette = (id, persist = true) => {
    if (!PALETTES.some(p => p.id === id)) id = "aqua";
    state.palette = id;
    $("#device").dataset.palette = id;
    $$(".pal-dot").forEach(d => d.classList.toggle("sel", d.dataset.pal === id));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (persist) { try { localStorage.setItem(KEY.pal, id); } catch {} }
    emit("palette", id);
  };
  const buildPaletteRail = () => {
    const rail = $("#paletteRail"); if (!rail) return;
    rail.innerHTML = PALETTES.map(p =>
      `<button class="pal-dot" data-pal="${p.id}" style="background:${p.dot};color:${p.dot}" aria-label="${p.id} palette"></button>`).join("");
    rail.addEventListener("click", e => {
      const d = e.target.closest(".pal-dot"); if (!d) return;
      applyPalette(d.dataset.pal); buzz(8);
    });
  };

  // ---- station router (home recedes · station grows from its glyph) ----------
  const stations = {};   // name -> { open(container), close?() }
  let openName = null;
  const device = () => $("#device");

  const openStation = (name, srcEl) => {
    const mod = stations[name]; if (!mod) return;
    openName = name;
    // grow the station layer from the tapped glyph
    const layer = $("#stationLayer");
    if (srcEl) {
      const gb = srcEl.getBoundingClientRect(), db = device().getBoundingClientRect();
      layer.style.transformOrigin = `${((gb.left+gb.width/2 - db.left)/db.width*100).toFixed(1)}% ${((gb.top+gb.height/2 - db.top)/db.height*100).toFixed(1)}%`;
    } else layer.style.transformOrigin = "50% 50%";
    // reveal only the target station body
    $$(".station").forEach(s => { s.hidden = s.dataset.station !== name; });
    layer.setAttribute("aria-hidden", "false");
    device().classList.add("station-open");
    // station chrome
    const glyph = srcEl ? srcEl.querySelector(".db-ico") : null;
    $("#stIco").innerHTML = glyph ? glyph.outerHTML : "";
    $("#stName").textContent = mod.title || name.toUpperCase();
    $("#stAux").innerHTML = "";
    try { mod.open($(`#station-${name}`)); } catch(e){ console.error(e); }
    buzz(10);
  };
  const closeStation = () => {
    if (!openName) return;
    const mod = stations[openName];
    device().classList.remove("station-open");
    $("#stationLayer").setAttribute("aria-hidden", "true");
    try { mod && mod.close && mod.close(); } catch {}
    openName = null;
    emit("home");
    buzz(8);
  };

  // ---- overlay helpers ------------------------------------------------------
  const openOverlay = sel => { const o = $(sel); if (o) o.setAttribute("aria-hidden","false"); };
  const closeOverlay = sel => { const o = $(sel); if (o) o.setAttribute("aria-hidden","true"); };

  // ---- shared: species INFO SHEET (the "zero in on your Pokémon" surface) ----
  const statBar = (v, i) => {
    const pct = clamp(v / STAT_MAX * 100, 3, 100);
    const hue = v >= 120 ? "var(--good)" : v >= 80 ? "var(--accent)" : v >= 55 ? "var(--warn)" : "var(--danger)";
    return `<div class="is-stat"><span class="iss-l">${STAT_LBL[i]}</span>
      <span class="iss-track"><span class="iss-fill" style="width:${pct}%;background:${hue}"></span></span>
      <b class="iss-v">${v}</b></div>`;
  };
  const typeChips = u => [u.t1, u.t2].filter(Boolean)
    .map(t => `<span class="tchip tc-${t}">${t}</span>`).join("");

  const regionSummary = u => {
    const regs = REGION_OF.get(u.dexno) || [];
    return { regs, note: (CATCH.notes && CATCH.notes[u.dexno]) || null };
  };

  const openInfo = (u, opts = {}) => {
    if (!u) return;
    const body = $("#infoBody"), foot = $("#infoFoot");
    const def = { weak:[], res:[], imm:[] };
    TYPES.forEach(t => { const m = effAgainst(t, u); if (m === 0) def.imm.push(t); else if (m >= 2) def.weak.push([t,m]); else if (m < 1) def.res.push([t,m]); });
    const { regs, note } = regionSummary(u);
    const regChips = regs.length
      ? regs.map(g => `<span class="reg-chip" title="${REGIONS[g].games}">${REGIONS[g].name}</span>`).join("")
      : `<span class="reg-none">EVOLVE / TRADE / EVENT — not a wild catch in the core dex</span>`;
    const inTeam = state.team.some(t => t && t.id === u.id);
    const learn = learnableFor(u);

    body.innerHTML = `
      <div class="is-hero">
        <button class="is-cry" id="isCry" title="Cry">
          <img class="is-spr" src="${HOME(u.id)}" onerror="${spriteFallback(u.dexno)}" alt="${u.name}">
        </button>
        <div class="is-idwrap">
          <div class="is-no">Nº ${String(u.dexno).padStart(4,"0")} · GEN ${ROMAN[u.gen-1]}</div>
          <h2 class="is-name">${u.name}</h2>
          <div class="is-types">${typeChips(u)}</div>
          <div class="is-bst">BST <b>${u.bst}</b> · ${archetype(u.stats)}</div>
        </div>
      </div>

      <div class="is-sec">
        <div class="is-sec-h">◈ WHERE TO CATCH</div>
        <div class="reg-chips">${regChips}</div>
        ${note ? `<div class="catch-note">
            ${note.tag ? `<span class="cn-tag cn-${note.tag}">${note.tag.toUpperCase()}</span>` : ""}
            ${note.how ? `<div class="cn-line"><span>HOW</span>${note.how}</div>` : ""}
            ${note.where ? `<div class="cn-line"><span>SPOT</span>${note.where}</div>` : ""}
          </div>` : ""}
      </div>

      <div class="is-sec">
        <div class="is-sec-h">▦ BASE STATS</div>
        <div class="is-stats">${u.stats.map(statBar).join("")}</div>
      </div>

      <div class="is-sec">
        <div class="is-sec-h">⛊ TYPE MATCHUPS</div>
        <div class="def-grid">
          ${def.weak.length ? `<div class="def-row def-weak"><span>WEAK</span><div>${def.weak.sort((a,b)=>b[1]-a[1]).map(([t,m])=>`<span class="tchip tc-${t}">${t}${m===4?"×4":""}</span>`).join("")}</div></div>` : ""}
          ${def.res.length ? `<div class="def-row def-res"><span>RESISTS</span><div>${def.res.sort((a,b)=>a[1]-b[1]).map(([t,m])=>`<span class="tchip tc-${t}">${t}${m===.25?"¼":""}</span>`).join("")}</div></div>` : ""}
          ${def.imm.length ? `<div class="def-row def-imm"><span>IMMUNE</span><div>${def.imm.map(t=>`<span class="tchip tc-${t}">${t}</span>`).join("")}</div></div>` : ""}
        </div>
      </div>

      ${learn ? `<div class="is-sec"><div class="is-sec-h">✷ MOVE POOL</div>
        <div class="is-learn">${learn.length} learnable moves — set a loadout from the capsule menu</div></div>` : ""}
    `;

    foot.innerHTML = inTeam
      ? `<button class="is-act ghost" id="isRelease">⏏ RELEASE FROM TEAM</button>`
      : `<button class="is-act" id="isFile" ${partyCount()>=6?"disabled":""}>${partyCount()>=6?"TEAM FULL":"▸ FILE TO TEAM"}</button>`;

    openOverlay("#infoSheet");
    $("#isCry").onclick = () => { playCry(u); const s=$("#isCry"); s.classList.remove("cry-anim"); void s.offsetWidth; s.classList.add("cry-anim"); };
    const fileBtn = $("#isFile"); if (fileBtn) fileBtn.onclick = () => { if (addUnit(u.id)) { closeOverlay("#infoSheet"); } };
    const relBtn = $("#isRelease"); if (relBtn) relBtn.onclick = () => {
      const slot = state.team.findIndex(t => t && t.id === u.id);
      if (slot >= 0) releaseSlot(slot); closeOverlay("#infoSheet");
    };
  };

  // ---- shared: CAPSULE MENU (long-press a teammate → moves/lead/release) -----
  let capSlot = -1, moveEditIdx = -1;
  const openCap = slot => {
    const t = state.team[slot]; if (!t) return;
    const u = byId.get(t.id); if (!u) return;
    capSlot = slot;
    $("#cmSprite").src = SPRITE(u.id); $("#cmSprite").setAttribute("onerror", spriteFallback(u.dexno));
    $("#cmSlot").textContent = `SLOT ${String(slot+1).padStart(2,"0")}${slot===0?" · LEAD":""}`;
    $("#cmName").textContent = u.name;
    $("#cmTypes").innerHTML = typeChips(u);
    renderCapMoves(u, t);
    openOverlay("#capMenu");
  };
  const renderCapMoves = (u, t) => {
    const learn = learnableFor(u);
    $("#cmLearnNote").textContent = learn ? `${learn.length} learnable` : "";
    const slots = [0,1,2,3].map(i => {
      const mid = (t.moves || [])[i], m = mid != null ? moveById.get(mid) : null;
      return m
        ? `<button class="cm-move set" data-mi="${i}"><span class="cmv-type tc-${m.type}"></span>
             <span class="cmv-name">${m.name}</span><span class="cmv-pow">${m.power||"—"}</span></button>`
        : `<button class="cm-move empty" data-mi="${i}"><span class="cmv-plus">+</span>MOVE ${i+1}</button>`;
    }).join("");
    $("#cmMoves").innerHTML = slots;
  };

  // ---- shared: MOVE PICKER --------------------------------------------------
  let mpUnit = null;
  const openMovePick = (slot, mi) => {
    const t = state.team[slot]; if (!t) return;
    mpUnit = byId.get(t.id); moveEditIdx = mi;
    $("#mpSlot").textContent = mi + 1;
    $("#moveSearch").value = "";
    renderMoveResults("");
    openOverlay("#movePick");
    setTimeout(() => $("#moveSearch").focus(), 120);
  };
  const renderMoveResults = q => {
    const learn = learnableFor(mpUnit) || MOVES;
    const nq = norm(q);
    const list = learn.filter(m => !nq || m.key.includes(nq)).slice(0, 80);
    $("#moveResults").innerHTML = list.map(m =>
      `<button class="mp-row" data-mid="${m.id}">
        <span class="tchip tc-${m.type}">${m.type}</span>
        <span class="mpr-name">${m.name}</span>
        <span class="mpr-cat mpr-${m.cat}">${m.cat}</span>
        <span class="mpr-pow">${m.power||"—"}</span></button>`).join("")
      || `<div class="mp-empty">No moves match.</div>`;
    $("#moveFoot").textContent = `${list.length} move${list.length===1?"":"s"}`;
  };

  // ---- settings tray --------------------------------------------------------
  const openSettings = () => {
    const cur = state.palette;
    $("#setBody").innerHTML = `
      <div class="set-block">
        <div class="set-lbl">PALETTE</div>
        <div class="set-pal">${PALETTES.map(p =>
          `<button class="setp ${p.id===cur?"sel":""}" data-pal="${p.id}" style="--c:${p.dot}">
            <span class="setp-sw"></span><span class="setp-nm">${p.id}</span></button>`).join("")}</div>
      </div>
      <div class="set-block">
        <div class="set-lbl">DATA</div>
        <div class="set-meta" id="setMeta"></div>
      </div>
      <div class="set-block">
        <button class="set-danger" id="setWipe">RESET TEAM &amp; POOL</button>
      </div>
      <div class="set-foot">PokéHotspot · v0.1 · Dex ${DEX.length} entries · Regions 1–9</div>
    `;
    $("#setMeta").innerHTML =
      `<span>${DEX.length} species/forms</span><span>${MOVES.length} moves</span><span>${LEARN_LOADED?"learnsets ✓":"learnsets —"}</span>`;
    openOverlay("#settingsTray");
    $$("#setBody .setp").forEach(b => b.onclick = () => { applyPalette(b.dataset.pal);
      $$("#setBody .setp").forEach(x=>x.classList.toggle("sel", x===b)); });
    $("#setWipe").onclick = () => {
      state.team = new Array(6).fill(null); state.pool = []; saveTeam(); savePool();
      emit("team"); closeOverlay("#settingsTray");
    };
  };

  // ---- boot -----------------------------------------------------------------
  const clockTick = () => { const c = $("#clock"); if (!c) return;
    const d = new Date(); c.textContent = `${((d.getHours()+11)%12)+1}:${String(d.getMinutes()).padStart(2,"0")}`; };

  async function boot() {
    // data
    try {
      const raw = await (await fetch("data/pokedex.json")).json();
      DEX = raw.map(r => {
        const [id, ident, t1, t2, stats, dexno] = r;
        const u = { id, ident, name: prettify(ident), key: norm(ident), t1, t2: t2||null,
                    stats, bst: stats.reduce((a,b)=>a+b,0), dexno, gen: genOf(dexno) };
        byId.set(id, u); if (!byDex.has(dexno)) byDex.set(dexno, u);
        return u;
      });
    } catch { console.error("dex load failed"); }
    try {
      const mraw = await (await fetch("data/moves.json")).json();
      MOVES = mraw.map(r => { const [id,name,type,power,cat] = r;
        const m = { id, name, type, key: norm(name), power: power||0, cat: cat||"N" }; moveById.set(id,m); return m; });
    } catch {}
    try {
      const nd = await (await fetch("data/nativedex.json")).json();
      for (let g = 1; g <= 9; g++) NATIVE[g] = new Set(nd[g] || nd[String(g)] || []);
      DEX.forEach(u => { const regs = [];
        for (let g = 1; g <= 9; g++) if (NATIVE[g].has(u.dexno)) regs.push(g);
        if (!REGION_OF.has(u.dexno)) REGION_OF.set(u.dexno, regs); });
    } catch {}
    try {
      const lraw = await (await fetch("data/learnsets.json")).json();
      for (const k in lraw) LEARN[k] = new Set(lraw[k]); LEARN_LOADED = true;
    } catch {}
    try { CATCH = await (await fetch("data/catch.json")).json(); } catch { CATCH = { notes:{} }; }

    // restore state
    try { const t = JSON.parse(localStorage.getItem(KEY.team)); if (Array.isArray(t)) { state.team = t.slice(0,6); while(state.team.length<6) state.team.push(null); } } catch {}
    try { const p = JSON.parse(localStorage.getItem(KEY.pool)); if (Array.isArray(p)) state.pool = p; } catch {}
    let pal = "aqua"; try { pal = localStorage.getItem(KEY.pal) || "aqua"; } catch {}
    try { state.locale = localStorage.getItem(KEY.loc) || "route"; } catch {}

    // chrome
    buildPaletteRail();
    applyPalette(pal, false);
    clockTick(); setInterval(clockTick, 15000);
    wireShell();

    // party count reflects team everywhere
    const refreshCount = () => { const n = partyCount();
      $("#partyCount").textContent = n;
      $("#partyFill").classList.toggle("full", n === 6); };
    on("team", refreshCount); refreshCount();

    // let stations initialise now that data is ready
    emit("ready");
  }

  const wireShell = () => {
    // dock → open stations
    $("#dock").addEventListener("click", e => {
      const b = e.target.closest(".dock-btn"); if (!b) return;
      openStation(b.dataset.station, b);
    });
    $("#stBack").addEventListener("click", closeStation);
    $("#settingsBtn").addEventListener("click", openSettings);

    // back-swipe (right swipe from the left edge) closes a station
    let sx = 0, sy = 0, tracking = false;
    const layer = $("#stationLayer");
    layer.addEventListener("touchstart", e => {
      if (e.touches[0].clientX < 42) { tracking = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY; }
    }, { passive: true });
    layer.addEventListener("touchend", e => {
      if (!tracking) return; tracking = false;
      const dx = e.changedTouches[0].clientX - sx, dy = Math.abs(e.changedTouches[0].clientY - sy);
      if (dx > 70 && dy < 60) closeStation();
    }, { passive: true });

    // overlays: close controls + backdrop
    const wireClose = (overlay, ...btns) => {
      const o = $(overlay);
      o.addEventListener("click", e => { if (e.target === o) o.setAttribute("aria-hidden","true"); });
      btns.forEach(b => { const el = $(b); if (el) el.onclick = () => o.setAttribute("aria-hidden","true"); });
    };
    wireClose("#infoSheet", "#infoClose");
    wireClose("#capMenu", "#cmClose");
    wireClose("#settingsTray", "#setClose");
    $("#movePick").addEventListener("click", e => { if (e.target.id === "movePick") closeOverlay("#movePick"); });
    $("#mpBack").onclick = () => closeOverlay("#movePick");

    // capsule menu actions
    $("#capMenu").addEventListener("click", e => {
      const act = e.target.closest(".cm-act");
      if (act) {
        const k = act.dataset.cm; const t = state.team[capSlot]; const u = t && byId.get(t.id);
        if (k === "lead") { makeLead(capSlot); closeOverlay("#capMenu"); }
        else if (k === "inspect") { closeOverlay("#capMenu"); if (u) openInfo(u); }
        else if (k === "release") { releaseSlot(capSlot); closeOverlay("#capMenu"); }
        return;
      }
      const mv = e.target.closest(".cm-move");
      if (mv) openMovePick(capSlot, +mv.dataset.mi);
    });

    // move picker input + pick
    let mpq = "";
    $("#moveSearch").addEventListener("input", e => { mpq = e.target.value; renderMoveResults(mpq); });
    $("#moveClear").onclick = () => { $("#moveSearch").value=""; renderMoveResults(""); };
    $("#moveResults").addEventListener("click", e => {
      const row = e.target.closest(".mp-row"); if (!row) return;
      setMove(capSlot, moveEditIdx, +row.dataset.mid);
      const t = state.team[capSlot]; renderCapMoves(byId.get(t.id), t);
      closeOverlay("#movePick");
    });
  };

  // ---- long-press helper (shared: teammate capsules everywhere) -------------
  const attachLongPress = (el, onLong, onTap) => {
    let timer = null, longFired = false, moved = false, sx = 0, sy = 0, usedTouch = false;
    const start = e => {
      longFired = false; moved = false;
      const p = e.touches ? e.touches[0] : e; sx = p.clientX; sy = p.clientY;
      timer = setTimeout(() => { longFired = true; buzz(18); onLong && onLong(); }, 420);
    };
    const move = e => { const p = e.touches ? e.touches[0] : e;
      if (Math.abs(p.clientX-sx) > 10 || Math.abs(p.clientY-sy) > 10) { moved = true; clearTimeout(timer); } };
    const end = () => { clearTimeout(timer); if (!longFired && !moved) onTap && onTap(); };
    el.addEventListener("touchstart", e => { usedTouch = true; start(e); }, { passive:true });
    el.addEventListener("touchmove", move, { passive:true });
    el.addEventListener("touchend", e => { end(e); setTimeout(() => { usedTouch = false; }, 600); });
    // mouse path (desktop) — suppressed right after touch to dodge synthetic events
    el.addEventListener("mousedown", e => { if (!usedTouch) start(e); });
    el.addEventListener("mousemove", e => { if (!usedTouch) move(e); });
    el.addEventListener("mouseup", e => { if (!usedTouch) end(e); });
    el.addEventListener("mouseleave", () => clearTimeout(timer));
  };

  // ---- public surface -------------------------------------------------------
  window.PH = {
    // dom / util
    $, $$, clamp, norm, prettify, buzz, attachLongPress,
    // assets
    SPRITE, HOME, CRY, spriteFallback, playCry,
    // data
    get DEX(){ return DEX; }, byId, byDex, get MOVES(){ return MOVES; }, moveById,
    LEARN, get LEARN_LOADED(){ return LEARN_LOADED; }, learnableFor,
    NATIVE, REGION_OF, REGIONS, get CATCH(){ return CATCH; },
    GEN_CAPS, ROMAN, STAT_LBL, genOf,
    // engine
    TYPES, CHART, effOn, effAgainst, DUTIES, archetype, WALL_ARCH, SWEEP_ARCH, analyzeTeam, readinessTier, typeChips, statBar,
    // team state + bus
    state, on, emit, teamUnits, partyCount, firstEmpty,
    setSlot, addUnit, releaseSlot, makeLead, setMove, adoptTeam, saveTeam, savePool,
    // palette / router / overlays
    PALETTES, applyPalette, stations, openStation, closeStation,
    openInfo, openCap, openOverlay, openSettings,
    openOverlayEl: openOverlay, closeOverlay,
  };

  document.addEventListener("DOMContentLoaded", boot);
})();
