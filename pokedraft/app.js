/* =============================================================================
   POKÉDRAFT — forge the best teams of six from a pool of favourites.
   Feed up to 30 units; the drafter builds + ranks candidate teams by a type/role
   engine (ported from pokemeter). Two rankings: COMPETITIVE (power, speed, roles,
   no shared weakness) vs GAME-READY (type diversity, survivability, coverage).
   Lock units to force them into every team. Coverage + team-stats tabs per team.
   ========================================================================== */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
  const SPRITE_FALLBACK = dex => `this.onerror=null;this.src='${SPRITE(dex)}'`;
  const GEN_CAPS = [151, 251, 386, 493, 649, 721, 809, 905, 1025];
  const ROMAN = ["I","II","III","IV","V","VI","VII","VIII","IX"];
  const REGIONS = ["KANTO","JOHTO","HOENN","SINNOH","UNOVA","KALOS","ALOLA","GALAR","PALDEA"];
  const STAT_LBL = ["HP","ATK","DEF","SPA","SPD","SPE"];
  const POOL_KEY = "pokedraft-pool-v1";
  const genOf = dex => { for (let i = 0; i < GEN_CAPS.length; i++) if (dex <= GEN_CAPS[i]) return i + 1; return 9; };
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const capW = w => w ? w.charAt(0).toUpperCase() + w.slice(1) : w;
  const REGION_FORM = [[/-alola/, "Alolan"], [/-galar/, "Galarian"], [/-hisui/, "Hisuian"], [/-paldea/, "Paldean"]];
  const NAME_FIX = { "nidoran-f":"Nidoran ♀", "nidoran-m":"Nidoran ♂", "mr-mime":"Mr. Mime", "mr-rime":"Mr. Rime",
    "mime-jr":"Mime Jr.", "porygon-z":"Porygon-Z", "jangmo-o":"Jangmo-o", "hakamo-o":"Hakamo-o", "kommo-o":"Kommo-o", "ho-oh":"Ho-Oh" };
  const displayName = ident => {
    if (NAME_FIX[ident]) return NAME_FIX[ident];
    for (const [re, pre] of REGION_FORM) if (re.test(ident)) return pre + " " + capW(ident.split("-")[0]);
    if (ident.includes("-")) return capW(ident.split("-")[0]);
    return capW(ident);
  };
  const prefersReduced = matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------- type / rating engine ---
  const TYPES = ["normal","fire","water","electric","grass","ice","fighting","poison",
    "ground","flying","psychic","bug","rock","ghost","dragon","dark","steel","fairy"];
  const TYPE_HEX = { normal:"#9099a1", fire:"#ff7a3d", water:"#3f8dff", electric:"#f6c343",
    grass:"#4fbf5f", ice:"#5fd0d6", fighting:"#e0402f", poison:"#b45cd6", ground:"#d8a54a",
    flying:"#8fa9f2", psychic:"#ff5d8a", bug:"#9fb828", rock:"#c2a955", ghost:"#6b5ba8",
    dragon:"#6a53e6", dark:"#5a5366", steel:"#6d8a9c", fairy:"#f08fd0" };
  const TYPE_ABBR = { normal:"NOR", fire:"FIR", water:"WAT", electric:"ELC", grass:"GRS",
    ice:"ICE", fighting:"FIG", poison:"PSN", ground:"GRD", flying:"FLY", psychic:"PSY",
    bug:"BUG", rock:"ROC", ghost:"GHO", dragon:"DRA", dark:"DRK", steel:"STL", fairy:"FAI" };
  const CHART = {
    normal:{rock:.5,steel:.5,ghost:0}, fire:{grass:2,ice:2,bug:2,steel:2,fire:.5,water:.5,rock:.5,dragon:.5},
    water:{fire:2,ground:2,rock:2,water:.5,grass:.5,dragon:.5}, electric:{water:2,flying:2,electric:.5,grass:.5,dragon:.5,ground:0},
    grass:{water:2,ground:2,rock:2,fire:.5,grass:.5,poison:.5,flying:.5,bug:.5,dragon:.5,steel:.5},
    ice:{grass:2,ground:2,flying:2,dragon:2,fire:.5,water:.5,ice:.5,steel:.5},
    fighting:{normal:2,ice:2,rock:2,dark:2,steel:2,poison:.5,flying:.5,psychic:.5,bug:.5,fairy:.5,ghost:0},
    poison:{grass:2,fairy:2,poison:.5,ground:.5,rock:.5,ghost:.5,steel:0}, ground:{fire:2,electric:2,poison:2,rock:2,steel:2,grass:.5,bug:.5,flying:0},
    flying:{grass:2,fighting:2,bug:2,electric:.5,rock:.5,steel:.5}, psychic:{fighting:2,poison:2,psychic:.5,steel:.5,dark:0},
    bug:{grass:2,psychic:2,dark:2,fire:.5,fighting:.5,poison:.5,flying:.5,ghost:.5,steel:.5,fairy:.5},
    rock:{fire:2,ice:2,flying:2,bug:2,fighting:.5,ground:.5,steel:.5}, ghost:{psychic:2,ghost:2,dark:.5,normal:0},
    dragon:{dragon:2,steel:.5,fairy:0}, dark:{psychic:2,ghost:2,fighting:.5,dark:.5,fairy:.5},
    steel:{ice:2,rock:2,fairy:2,fire:.5,water:.5,electric:.5,steel:.5}, fairy:{fighting:2,dragon:2,dark:2,fire:.5,poison:.5,steel:.5},
  };
  const effOn = (atk, d1, d2) => (CHART[atk][d1] ?? 1) * (d2 ? (CHART[atk][d2] ?? 1) : 1);
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
  const WALL_ARCH = new Set(["FORTRESS","PHYS WALL","SPEC WALL","BULKY PIVOT"]);
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
    const resistBreadth = TYPES.filter(t => defRows[t].resist > defRows[t].weak).length;
    const typeDiv = new Set(team.flatMap(p => [p.t1, p.t2]).filter(Boolean)).size;
    const speed = team.filter(p => p.stats[5] >= 100).length;
    const bulk = team.filter(p => WALL_ARCH.has(archetype(p.stats))).length;
    const sweepers = team.filter(p => SWEEP_ARCH.has(archetype(p.stats))).length;
    const avgBST = Math.round(team.reduce((a, p) => a + p.bst, 0) / team.length);
    return { defRows, exposed, secure, stabs, offRows, uncovered, walled, staffed, vacant,
      resistBreadth, typeDiv, speed, bulk, sweepers, avgBST, count: team.length };
  };

  // dual scoring — built ADDITIVELY (not "100 minus") so strong pools still spread
  // out and the two rankings genuinely diverge on the same candidate set.
  // COMPETITIVE rewards offensive coverage, filled roles, speed control + power and
  // punishes shared weaknesses hard. GAME-READY rewards type variety, resistance
  // breadth and having a wall — a survivable, broad playthrough squad.
  const scoreComp = A => {
    const gaps = Math.max(0, A.uncovered.length - A.walled.length);
    let s =
      1.7 * (18 - A.uncovered.length)      // types your STAB hits super-effectively (≤30.6)
      + 1.4 * (18 - A.walled.length)       // not fully walled (≤25.2)
      + 2.4 * A.staffed.length             // roles filled: attacker/wall/speed/pivot (≤14.4)
      + 3.2 * Math.min(3, A.speed)         // speed control (≤9.6)
      + 1.2 * Math.min(6, A.resistBreadth) // a defensive spine (≤7.2)
      + clamp((A.avgBST - 460) / 16, -3, 7)// raw power
      - 7 * A.exposed.length               // shared weaknesses are lethal
      - 2 * gaps;
    if (A.count < 6) s -= (6 - A.count) * 9;
    return clamp(Math.round(s), 1, 99);
  };
  const scoreGame = A => {
    const gaps = Math.max(0, A.uncovered.length - A.walled.length);
    let s =
      2.6 * Math.min(12, A.typeDiv)        // broad type variety for gyms/coverage (≤31.2)
      + 1.8 * Math.min(12, A.resistBreadth)// survivability (≤21.6)
      + 1.3 * (18 - A.walled.length)       // can still hit most things (≤23.4)
      + 1.6 * A.staffed.length             // some role structure (≤9.6)
      + 4 * Math.min(2, A.bulk)            // at least a wall to lean on (≤8)
      + clamp((A.avgBST - 450) / 18, -2, 5)
      - 4 * A.exposed.length
      - 1.5 * gaps;
    if (A.count < 6) s -= (6 - A.count) * 6;
    return clamp(Math.round(s), 1, 99);
  };
  // AVERAGE = the best all-purpose team, strong across both battle and playthrough.
  const scoreOf = (ev, m) => m === "game" ? ev.game : m === "avg" ? Math.round((ev.comp + ev.game) / 2) : ev.comp;
  const MODE_LBL = { comp: "COMPETITIVE", avg: "AVERAGE", game: "GAME-READY" };

  const TIERS = [
    { min: 88, t:"S" }, { min: 78, t:"A" }, { min: 66, t:"B" }, { min: 52, t:"C" }, { min: 38, t:"D" }, { min: 0, t:"E" },
  ];
  const tierOf = sc => (TIERS.find(x => sc >= x.min) || TIERS[TIERS.length - 1]).t;
  const netCat = (w, r) => (w > r ? "neg" : w < r ? "pos" : "even");
  const sortedTypes = (A) => TYPES.slice().sort((a, b) => {
    const ma = A.defRows[a].weak - A.defRows[a].resist, mb = A.defRows[b].weak - A.defRows[b].resist;
    if (mb !== ma) return mb - ma; return A.defRows[b].weak - A.defRows[a].weak;
  });
  const verdict = (A, mode) => {
    if (A.exposed.length) return `shared <b>${A.exposed[0].t}</b> weakness`;
    if (mode === "comp" && A.vacant.length) return `wants a <b>${A.vacant[0].name.toLowerCase()}</b>`;
    if (A.walled.length) return `walled vs <b>${A.walled[0]}</b>`;
    if (mode === "game" && A.typeDiv >= 9) return `broad, ${A.typeDiv}-type coverage`;
    if (A.uncovered.length > A.walled.length) return `minor coverage gaps`;
    return `well-rounded — few holes`;
  };

  // -------------------------------------------------------- optimal movesets ---
  // A sensible 4-move build per unit, legal to its learnset: STAB in its preferred
  // category, a setup/utility slot fit to its role, then best coverage by new type.
  const SETUP_RE = /^(swords dance|dragon dance|nasty plot|calm mind|quiver dance|shell smash|bulk up|coil|work up)$/i;
  const UTIL_PRI = ["recover","roost","synthesis","moonlight","slack off","soft-boiled","morning sun","calm mind","bulk up",
    "toxic","will-o-wisp","thunder wave","stealth rock","spikes","defog","iron defense","leech seed","substitute","knock off"];
  const UTIL_RE = new RegExp("^(" + UTIL_PRI.map(s => s.replace(/[-]/g, "\\-")).join("|") + ")", "i");
  // recharge / self-KO / one-shot gimmick moves — high BP but not "optimal", so
  // they're skipped in favour of reliable STAB (Flamethrower over Blast Burn, etc.)
  const BAD_DMG = /^(hyper beam|giga impact|blast burn|hydro cannon|frenzy plant|roar of time|rock wrecker|prismatic laser|eternabeam|light of ruin|self-destruct|explosion|last resort|misty explosion|final gambit)$/i;
  const movesetFor = (u) => {
    if (!MOVES.length) return [];
    const learn = (LEARN_OK && LEARN[u.id]) ? LEARN[u.id] : null;
    const canUse = m => !learn || learn.has(m.id);
    const good = m => !BAD_DMG.test(m.name);
    const phys = u.stats[1] >= u.stats[3], preferCat = phys ? "P" : "S";
    const own = [u.t1, u.t2].filter(Boolean);
    const chosen = [], usedIds = new Set(), usedTypes = new Set();
    const push = m => { if (m && !usedIds.has(m.id)) { chosen.push(m); usedIds.add(m.id); usedTypes.add(m.type); } };
    const bestDmg = (type, cat) => {
      let p = MOVES.filter(m => canUse(m) && good(m) && m.type === type && m.power > 0 && (!cat || m.cat === cat));
      if (!p.length && cat) p = MOVES.filter(m => canUse(m) && good(m) && m.type === type && m.power > 0);
      p.sort((a, b) => b.power - a.power); return p[0] || null;
    };
    own.forEach(t => { if (chosen.length < 2) push(bestDmg(t, preferCat)); });     // STAB
    const arch = archetype(u.stats);
    if (WALL_ARCH.has(arch)) {                                                     // wall → best utility move
      const util = MOVES.filter(m => canUse(m) && m.cat === "N" && UTIL_RE.test(m.name))
        .sort((a, b) => { const ia = UTIL_PRI.findIndex(p => a.name.toLowerCase().startsWith(p)), ib = UTIL_PRI.findIndex(p => b.name.toLowerCase().startsWith(p)); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
      push(util[0]);
    } else if (SWEEP_ARCH.has(arch)) {                                            // sweeper → a fitting setup move
      const setup = MOVES.filter(m => canUse(m) && m.cat === "N" && SETUP_RE.test(m.name) &&
        (phys ? !/nasty plot|quiver dance/i.test(m.name) : !/swords dance|coil/i.test(m.name)));
      push(setup[0]);
    }
    const cov = MOVES.filter(m => canUse(m) && good(m) && m.power > 0 && !own.includes(m.type)).sort((a, b) => b.power - a.power);
    for (const m of cov) { if (chosen.length >= 4) break; if (usedTypes.has(m.type) || m.cat !== preferCat) continue; push(m); }
    if (chosen.length < 4) { const rest = MOVES.filter(m => canUse(m) && good(m) && m.power > 0).sort((a, b) => b.power - a.power);
      for (const m of rest) { if (chosen.length >= 4) break; if (usedIds.has(m.id)) continue; if (usedTypes.has(m.type) && chosen.length > 2) continue; push(m); } }
    return chosen.slice(0, 4);
  };

  // ------------------------------------------------------------------ state ---
  let DEX = [], NATIVE = {}, NATIVE_OK = false;
  let MOVES = [], LEARN = {}, LEARN_OK = false;
  const byId = new Map(), moveById = new Map();
  let pool = [];                    // [{id, locked}]
  let candidates = [], mode = "comp", curTeam = null, curTab = "coverage";
  const inPool = id => pool.some(p => p.id === id);

  const savePool = () => { try { localStorage.setItem(POOL_KEY, JSON.stringify(pool)); } catch {} };
  const loadPool = () => { try { const r = JSON.parse(localStorage.getItem(POOL_KEY));
    if (Array.isArray(r)) pool = r.filter(p => p && byId.has(p.id)).map(p => ({ id: p.id, locked: !!p.locked })).slice(0, 50); } catch {} };

  // ------------------------------------------------------------- team eval ---
  const evalCache = new Map();
  const evalTeam = (ids) => {
    const key = ids.slice().sort((a, b) => a - b).join(",");
    let ev = evalCache.get(key);
    if (ev) return ev;
    const units = ids.map(id => byId.get(id));
    const A = analyzeTeam(units);
    ev = { ids: ids.slice(), key, units, A, comp: scoreComp(A), game: scoreGame(A) };
    evalCache.set(key, ev);
    return ev;
  };

  // ----------------------------------------------------------- generation ---
  const Cnk = (n, k) => { if (k < 0 || k > n) return 0; k = Math.min(k, n - k); let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return Math.round(r); };
  function* combos(arr, k) {
    const n = arr.length; if (k > n || k < 0) return;
    if (k === 0) { yield []; return; }
    const idx = [...Array(k).keys()];
    while (true) {
      yield idx.map(i => arr[i]);
      let i = k - 1; while (i >= 0 && idx[i] === i + n - k) i--;
      if (i < 0) break;
      idx[i]++; for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
    }
  }
  const mulberry32 = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const EXHAUST = 150000;

  const generate = () => {
    evalCache.clear();
    const poolIds = pool.map(p => p.id);
    const locked = pool.filter(p => p.locked).map(p => p.id);
    const size = Math.min(6, poolIds.length);
    const lockN = Math.min(locked.length, size);
    const lockedUse = locked.slice(0, lockN);
    const free = poolIds.filter(id => !lockedUse.includes(id));
    const need = size - lockN;
    const cand = new Map();
    const add = ids => { const ev = evalTeam(ids); if (!cand.has(ev.key)) cand.set(ev.key, ev); };

    if (need <= 0) { add(lockedUse); }
    else if (Cnk(free.length, need) <= EXHAUST) {
      for (const c of combos(free, need)) add([...lockedUse, ...c]);
    } else {
      // heuristic: greedy from every seed for BOTH modes, random restarts, then local swaps
      const greedy = (m) => {
        for (const seed of free) {
          const ids = [...lockedUse, seed], used = new Set(ids);
          while (ids.length < size) {
            let best = null, bv = -1e9;
            for (const c of free) { if (used.has(c)) continue;
              const s = scoreOf(evalTeam([...ids, c]), m); if (s > bv) { bv = s; best = c; } }
            if (best == null) break; ids.push(best); used.add(best);
          }
          add(ids);
        }
      };
      greedy("comp"); greedy("game"); greedy("avg");
      const rng = mulberry32(0x51ceb00c);
      for (let r = 0; r < 260; r++) {
        const sh = free.slice(); for (let i = sh.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [sh[i], sh[j]] = [sh[j], sh[i]]; }
        add([...lockedUse, ...sh.slice(0, need)]);
      }
      // local search: try swapping each free member for a bench unit
      let list = [...cand.values()].sort((a, b) => Math.max(b.comp, b.game) - Math.max(a.comp, a.game)).slice(0, 40);
      for (const ev of list) {
        let ids = ev.ids.slice();
        for (let pass = 0; pass < 2; pass++) {
          for (let i = 0; i < ids.length; i++) {
            if (lockedUse.includes(ids[i])) continue;
            let bestIds = ids, bv = Math.max(evalTeam(ids).comp, evalTeam(ids).game);
            for (const c of free) { if (ids.includes(c)) continue;
              const trial = ids.slice(); trial[i] = c;
              const e = evalTeam(trial), v = Math.max(e.comp, e.game);
              if (v > bv) { bv = v; bestIds = trial; } }
            ids = bestIds;
          }
        }
        add(ids);
      }
    }
    candidates = [...cand.values()];
  };

  // --------------------------------------------------------------- render ----
  const show = id => { $$(".view").forEach(v => v.classList.remove("active")); $("#" + id).classList.add("active"); scrollTop($("#" + id)); };
  const scrollTop = el => { const b = el.querySelector(".team-list, .tab-body"); if (b) b.scrollTop = 0; };
  const typeChip = t => t ? `<span class="tchip" style="--tc:${TYPE_HEX[t]}">${t}</span>` : "";
  const typeDots = u => [u.t1, u.t2].filter(Boolean).map(t => `<i style="background:${TYPE_HEX[t]}"></i>`).join("");
  const spr = u => `<img src="${SPRITE(u.id)}" onerror="${SPRITE_FALLBACK(u.dexno)}" alt="${displayName(u.ident)}">`;

  const updatePoolMeta = () => {
    const n = pool.length, locked = pool.filter(p => p.locked).length;
    $("#poolCount").textContent = n; $("#poolHeadCount").textContent = n;
    const btn = $("#forgeBtn");
    btn.disabled = n < 2;
    $("#forgeSub").textContent = n < 2 ? "add 2+ units" : locked ? `${n} units · ${locked} locked` : `best of ${n} units`;
    $("#poolWrap").classList.toggle("empty", n === 0);
    $("#poolIntro").style.display = n === 0 ? "" : "none";
  };
  const renderPool = () => {
    const grid = $("#poolGrid");
    grid.innerHTML = pool.map(p => {
      const u = byId.get(p.id);
      return `<div class="ptile${p.locked ? " locked" : ""}" data-id="${p.id}">
        <button class="pt-lock" data-lock="${p.id}" aria-label="Lock ${displayName(u.ident)} into every team" title="Lock into every team">${p.locked ? "🔒" : "🔓"}</button>
        <div class="pt-art">${spr(u)}</div>
        <div class="pt-name">${displayName(u.ident)}</div>
        <div class="pt-dots">${typeDots(u)}</div>
        <button class="pt-x" data-remove="${p.id}" aria-label="Remove">&times;</button>
      </div>`;
    }).join("");
    updatePoolMeta();
  };

  const RESULT_CAP = 70;
  const renderSearch = (q) => {
    const nq = norm(q), digits = q.replace(/\D/g, "");
    const res = $("#results");
    if (!nq && !digits) { res.innerHTML = ""; res.classList.remove("show"); return; }
    let list = DEX.filter(u => (nq && u.key.includes(nq)) || (digits && (String(u.dexno).includes(digits) || String(u.id).includes(digits))));
    if (nq) list.sort((a, b) => (b.key.startsWith(nq) - a.key.startsWith(nq)) || a.dexno - b.dexno);
    else list.sort((a, b) => a.dexno - b.dexno);
    list = list.slice(0, RESULT_CAP);
    res.classList.add("show");
    res.innerHTML = list.length ? list.map(u => {
      const has = inPool(u.id);
      return `<button class="res-row${has ? " added" : ""}" data-add="${u.id}" ${has ? "disabled" : ""}>
        <img class="res-spr" loading="lazy" src="${SPRITE(u.id)}" onerror="${SPRITE_FALLBACK(u.dexno)}" alt="">
        <span class="res-name">${displayName(u.ident)}</span>
        <span class="res-types">${typeDots(u)}</span>
        <span class="res-plus">${has ? "✓" : "+"}</span>
      </button>`;
    }).join("") : `<div class="res-empty">no units match</div>`;
  };

  const addToPool = (id) => {
    if (inPool(id) || pool.length >= 50) return;
    pool.push({ id, locked: false }); savePool(); renderPool();
    const inp = $("#searchInput"); renderSearch(inp.value);
  };
  const removeFromPool = (id) => { pool = pool.filter(p => p.id !== id); savePool(); renderPool(); renderSearch($("#searchInput").value); };
  const toggleLock = (id) => { const p = pool.find(x => x.id === id); if (p) { p.locked = !p.locked; savePool(); renderPool(); } };

  // ---- ranked team list ----
  const rankBadge = (sc) => `<span class="tier tier-${tierOf(sc)}">${tierOf(sc)}</span>`;
  const TEAMS_SHOWN = 24;
  const renderResults = () => {
    const list = candidates.slice().sort((a, b) => scoreOf(b, mode) - scoreOf(a, mode)).slice(0, TEAMS_SHOWN);
    $("#modeNote").innerHTML =
      mode === "comp" ? `<b>COMPETITIVE</b> — ranked for battle: power, speed control, filled roles, no shared weakness.`
      : mode === "game" ? `<b>GAME-READY</b> — ranked for a playthrough: broad type coverage, survivability, few gaps.`
      : `<b>AVERAGE</b> — the best all-purpose team: strongest across both battle and playthrough at once.`;
    const wrap = $("#teamList");
    if (!list.length) { wrap.innerHTML = `<div class="tl-empty">Add at least two units and forge again.</div>`; return; }
    wrap.innerHTML = list.map((ev, i) => {
      const sc = scoreOf(ev, mode), A = ev.A;
      return `<button class="team-card" data-team="${ev.key}">
        <div class="tc-rank">#${i + 1}</div>
        <div class="tc-mid">
          <div class="tc-sprites">${ev.units.map(u => `<span class="tcs">${spr(u)}</span>`).join("")}</div>
          <div class="tc-verdict">${verdict(A, mode)}</div>
        </div>
        <div class="tc-score">${rankBadge(sc)}<span class="tc-num">${sc}</span></div>
      </button>`;
    }).join("");
  };

  const openTeam = (key) => {
    curTeam = candidates.find(e => e.key === key); if (!curTeam) return;
    curTab = "coverage";
    $$("#tabs .tab").forEach(t => t.classList.toggle("sel", t.dataset.tab === "coverage"));
    const sc = scoreOf(curTeam, mode);
    $("#teamRankBadge").innerHTML = `${rankBadge(sc)}<span class="trb-lbl">${MODE_LBL[mode]}</span>`;
    $("#teamHero").innerHTML =
      `<div class="th-sprites">${curTeam.units.map(u => `<span class="ths">${spr(u)}</span>`).join("")}</div>
       <div class="th-scores">
         <div class="ths-item"><span class="thsi-n">${curTeam.comp}</span><span class="thsi-l">COMPETITIVE</span></div>
         <div class="ths-item"><span class="thsi-n">${curTeam.game}</span><span class="thsi-l">GAME-READY</span></div>
         <div class="ths-item"><span class="thsi-n">${curTeam.A.avgBST}</span><span class="thsi-l">AVG BST</span></div>
       </div>`;
    renderTab();
    show("viewTeam");
  };

  const renderTab = () => {
    const A = curTeam.A, body = $("#tabBody");
    if (curTab === "coverage") body.innerHTML = coverageHTML(A, curTeam.units);
    else if (curTab === "roster") body.innerHTML = rosterHTML(curTeam.units);
    else if (curTab === "games") body.innerHTML = gamesHTML(curTeam.units);
    else body.innerHTML = statsHTML(A);
    body.scrollTop = 0;
  };

  const coverageHTML = (A, units) => {
    const head = `<tr><th class="cov-corner">VS</th>${units.map(u => `<th><img class="cov-spr" src="${SPRITE(u.id)}" onerror="${SPRITE_FALLBACK(u.dexno)}" alt=""></th>`).join("")}<th class="cov-net">W/R</th></tr>`;
    let last = null;
    const rows = sortedTypes(A).map(atk => {
      const r = A.defRows[atk], cat = netCat(r.weak, r.resist);
      const div = (last !== null && cat !== last) ? " cov-div" : ""; last = cat;
      const cells = units.map(u => { const m = effOn(atk, u.t1, u.t2);
        if (m === 1) return `<td></td>`;
        const cls = m >= 4 ? "cx4" : m >= 2 ? "cx2" : m === 0 ? "cx0" : m <= .25 ? "cx025" : "cx05";
        return `<td class="${cls}">×${m}</td>`; }).join("");
      return `<tr class="nt-${cat}${div}"><td class="cov-rt"><span class="cov-t" style="--tc:${TYPE_HEX[atk]}">${TYPE_ABBR[atk]}</span></td>${cells}<td class="cov-net nt-${cat}">${r.weak}/${r.resist}</td></tr>`;
    }).join("");
    const off = A.walled.length ? `<span class="warn">${A.walled.length} WALLED</span> ${A.walled.map(t => typeChip(t)).join("")}`
      : A.uncovered.length ? `<span class="soft">${A.uncovered.length} soft</span> ${A.uncovered.map(t => typeChip(t)).join("")}`
      : `<span class="good">every type takes super-effective STAB</span>`;
    return `<div class="cov-wrap">
      <div class="sec-h">DEFENSIVE COVERAGE <span class="sec-sub">effectiveness vs the team · W/R = members weak / resisting</span></div>
      <div class="cov-scroll"><table class="cov"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
      <div class="sec-h">OFFENSIVE REACH <span class="sec-sub">what your STAB types can't hit hard</span></div>
      <div class="off-line">${off}</div>
      <div class="cov-legend"><span><i class="lg lg-se"></i>super-eff</span><span><i class="lg lg-rs"></i>resist</span><span><i class="lg lg-im"></i>immune</span></div>
    </div>`;
  };

  const statRow = (lbl, v, max) => `<div class="mstat"><span class="mstat-l">${lbl}</span><div class="mstat-t"><div class="mstat-f" style="width:${clamp(v / max * 100, 0, 100).toFixed(0)}%"></div></div><span class="mstat-v">${v}</span></div>`;
  const moveChip = m => `<span class="mvchip" style="--tc:${TYPE_HEX[m.type]}"><i class="mv-dot"></i><span class="mv-nm">${m.name}</span><b class="mv-bp">${m.power > 0 ? m.power : "—"}</b></span>`;
  const rosterHTML = (units) => `<div class="roster">${units.map(u => {
    const arch = archetype(u.stats), best = STAT_LBL[u.stats.indexOf(Math.max(...u.stats))];
    const mv = movesetFor(u);
    return `<div class="rmon" style="--tc:${TYPE_HEX[u.t1]}">
      <div class="rm-head">
        <div class="rm-art">${spr(u)}</div>
        <div class="rm-body">
          <div class="rm-top"><span class="rm-name">${displayName(u.ident)}</span><span class="rm-dots">${typeDots(u)}</span></div>
          <div class="rm-meta"><span class="rm-arch">${arch}</span><span class="rm-dex">№${String(u.dexno).padStart(3,"0")} · ${u.stats[1] >= u.stats[3] ? "PHYSICAL" : "SPECIAL"}</span></div>
          <div class="rm-stats"><span>BST <b>${u.bst}</b></span><span>top <b>${best} ${Math.max(...u.stats)}</b></span><span>SPE <b>${u.stats[5]}</b></span></div>
        </div>
      </div>
      ${mv.length ? `<div class="rm-moves">${mv.map(moveChip).join("")}</div>` : ""}
    </div>`;
  }).join("")}</div>`;

  // GAMES tab — which era's games best fit this exact team, by % you can catch
  // in-region (no transfers). Eras before the team's latest debut can't run it.
  const gamesHTML = (units) => {
    const size = units.length, floor = Math.max(...units.map(u => u.gen));
    const rows = [];
    for (let g = 1; g <= 9; g++) {
      const playable = g >= floor;
      const nativeN = NATIVE_OK && NATIVE[g] ? units.filter(u => NATIVE[g].has(u.dexno)).length : 0;
      rows.push({ g, playable, nativeN, pct: playable ? Math.round(100 * nativeN / size) : 0 });
    }
    const sorted = rows.slice().sort((a, b) => (b.playable - a.playable) || (b.pct - a.pct) || (a.g - b.g));
    const best = sorted.find(r => r.playable);
    const bar = r => {
      const cls = !r.playable ? "locked" : r.pct >= 80 ? "hi" : r.pct >= 40 ? "mid" : "lo";
      const note = !r.playable ? `pre-debut · needs Gen ${ROMAN[floor - 1]}+` : `catch ${r.nativeN}/${size} in-region`;
      return `<div class="grow ${cls}${best && r.g === best.g ? " best" : ""}">
        <div class="grow-l"><span class="grow-g">GEN ${ROMAN[r.g - 1]}</span><span class="grow-r">${REGIONS[r.g - 1]}</span>${best && r.g === best.g ? `<span class="grow-best">BEST FIT</span>` : ""}</div>
        <div class="grow-bar"><div class="grow-fill" style="width:${r.playable ? Math.max(4, r.pct) : 0}%"></div></div>
        <div class="grow-pct">${r.playable ? r.pct + "%" : "—"}</div>
        <div class="grow-note">${note}</div>
      </div>`;
    };
    return `<div class="games-wrap">
      <div class="sec-h">GAME FIT <span class="sec-sub">% of the team you can catch in that era — no transfers</span></div>
      ${NATIVE_OK ? "" : `<div class="off-line dim">availability data offline</div>`}
      <div class="games-list">${sorted.map(bar).join("")}</div>
      <div class="games-foot">Earliest era this exact team can legally exist: <b>Gen ${ROMAN[floor - 1]} · ${REGIONS[floor - 1]}</b>.</div>
    </div>`;
  };

  const statsHTML = (A) => {
    const dutyPips = DUTIES.map(d => { const on = A.staffed.includes(d);
      return `<span class="dpip ${on ? "on" : "off"}">${d.name}</span>`; }).join("");
    const weakChips = A.exposed.length ? A.exposed.map(x => `<span class="tchip" style="--tc:${TYPE_HEX[x.t]}">${x.t} ·${x.weak}</span>`).join("") : `<span class="good">none — no 3-way weakness</span>`;
    const secureChips = A.secure.length ? A.secure.slice(0, 8).map(t => typeChip(t)).join("") : `<span class="dim">—</span>`;
    return `<div class="stats-wrap">
      <div class="sec-h">TEAM RATING</div>
      <div class="tr-grid">
        <div class="tr-cell"><span class="trc-n">${scoreComp(A)}</span><span class="trc-l">COMPETITIVE</span><div class="trc-bar"><div style="width:${scoreComp(A)}%"></div></div></div>
        <div class="tr-cell"><span class="trc-n">${scoreGame(A)}</span><span class="trc-l">GAME-READY</span><div class="trc-bar game"><div style="width:${scoreGame(A)}%"></div></div></div>
      </div>
      <div class="sec-h">SHAPE</div>
      <div class="metrics">
        ${statRow("Avg BST", A.avgBST, 600)}
        ${statRow("Type diversity", A.typeDiv, 12)}
        ${statRow("Resist breadth", A.resistBreadth, 18)}
        ${statRow("Speed control", A.speed, 6)}
        ${statRow("Defensive walls", A.bulk, 6)}
        ${statRow("Offense (sweepers)", A.sweepers, 6)}
      </div>
      <div class="sec-h">DUTY ROSTER <span class="sec-sub">${A.staffed.length}/6 filled</span></div>
      <div class="duty-strip">${dutyPips}</div>
      <div class="sec-h">SHARED WEAKNESSES</div>
      <div class="chip-row">${weakChips}</div>
      <div class="sec-h">LOCKED-DOWN TYPES <span class="sec-sub">the team resists as a wall</span></div>
      <div class="chip-row">${secureChips}</div>
    </div>`;
  };

  // ------------------------------------------------------------------ boot ---
  const doForge = () => {
    if (pool.length < 2) return;
    const btn = $("#forgeBtn"); btn.classList.add("forging"); $(".fb-label", btn).textContent = "FORGING…";
    setTimeout(() => {
      generate();
      mode = "comp";
      $$("#modeToggle .mt-opt").forEach(o => o.classList.toggle("sel", o.dataset.mode === "comp"));
      renderResults(); show("viewResults");
      btn.classList.remove("forging"); $(".fb-label", btn).textContent = "FORGE TEAMS";
    }, prefersReduced ? 10 : 260);
  };

  const wire = () => {
    const inp = $("#searchInput");
    inp.addEventListener("input", () => { $("#searchClear").classList.toggle("show", inp.value.length > 0); renderSearch(inp.value); });
    $("#searchClear").addEventListener("click", () => { inp.value = ""; $("#searchClear").classList.remove("show"); renderSearch(""); inp.focus(); });
    $("#results").addEventListener("click", e => { const b = e.target.closest("[data-add]"); if (b && !b.disabled) addToPool(+b.dataset.add); });
    $("#poolGrid").addEventListener("click", e => {
      const rm = e.target.closest("[data-remove]"); if (rm) { removeFromPool(+rm.dataset.remove); return; }
      const lk = e.target.closest("[data-lock]"); if (lk) { toggleLock(+lk.dataset.lock); return; }
    });
    $("#poolClear").addEventListener("click", () => { pool = []; savePool(); renderPool(); renderSearch(inp.value); });
    $("#forgeBtn").addEventListener("click", doForge);
    $("#resBack").addEventListener("click", () => show("viewPool"));
    $("#teamBack").addEventListener("click", () => show("viewResults"));
    $("#modeToggle").addEventListener("click", e => { const o = e.target.closest(".mt-opt"); if (!o) return;
      mode = o.dataset.mode; $$("#modeToggle .mt-opt").forEach(x => x.classList.toggle("sel", x === o)); renderResults(); });
    $("#teamList").addEventListener("click", e => { const c = e.target.closest("[data-team]"); if (c) openTeam(c.dataset.team); });
    $("#tabs").addEventListener("click", e => { const t = e.target.closest(".tab"); if (!t) return;
      curTab = t.dataset.tab; $$("#tabs .tab").forEach(x => x.classList.toggle("sel", x === t)); renderTab(); });
  };

  const clockTick = () => { const el = $("#clock"); if (!el) return;
    const u = () => { const d = new Date(); el.textContent = d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0"); }; u(); setInterval(u, 15000); };

  async function boot() {
    let raw;
    try { raw = await (await fetch("data/pokedex.json")).json(); }
    catch { $("#results").innerHTML = `<div class="res-empty" style="color:var(--amber)">DATABASE OFFLINE — could not load the dex.</div>`; return; }
    DEX = raw.map(r => { const [id, ident, t1, t2, stats, dexno] = r;
      const u = { id, ident, name: displayName(ident), key: norm(ident), t1, t2: t2 || null, stats, bst: stats.reduce((a, b) => a + b, 0), dexno, gen: genOf(dexno) };
      byId.set(id, u); return u; });
    try { const nd = await (await fetch("data/nativedex.json")).json();
      for (let g = 1; g <= 9; g++) NATIVE[g] = new Set(nd[g] || nd[String(g)] || []); NATIVE_OK = true; } catch {}
    try { const mv = await (await fetch("data/moves.json")).json();
      MOVES = mv.map(r => { const m = { id: r[0], name: r[1], type: r[2], power: r[3] || 0, cat: r[4] || "N" }; moveById.set(m.id, m); return m; }); } catch {}
    try { const lr = await (await fetch("data/learnsets.json")).json();
      for (const k in lr) LEARN[k] = new Set(lr[k]); LEARN_OK = true; } catch {}
    loadPool(); renderPool(); wire(); clockTick();
    // dev/preview hook: #pool=1,4,7,...[;lock=1,4][;forge] seeds a pool
    const h = location.hash;
    const pm = /pool=([\d,]+)/.exec(h);
    if (pm) {
      const lk = new Set((/lock=([\d,]+)/.exec(h)?.[1] || "").split(",").map(Number));
      pool = pm[1].split(",").map(Number).filter(id => byId.has(id)).slice(0, 50).map(id => ({ id, locked: lk.has(id) }));
      savePool(); renderPool();
      if (/[#;&]forge/.test(h)) {
        generate();
        mode = /mode=(comp|avg|game)/.test(h) ? RegExp.$1 : "comp";
        $$("#modeToggle .mt-opt").forEach(o => o.classList.toggle("sel", o.dataset.mode === mode));
        renderResults();
        const tm = /team=(\d+)/.exec(h);
        if (tm) {
          const ranked = candidates.slice().sort((a, b) => scoreOf(b, mode) - scoreOf(a, mode));
          const pick = ranked[Math.max(0, +tm[1] - 1)];
          if (pick) { openTeam(pick.key); const tb = /tab=(\w+)/.exec(h); if (tb) { curTab = tb[1]; $$("#tabs .tab").forEach(t => t.classList.toggle("sel", t.dataset.tab === curTab)); renderTab(); } return; }
        }
        show("viewResults");
      }
    }
  }
  boot();
})();
