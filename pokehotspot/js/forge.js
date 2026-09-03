/* =============================================================================
   POKÉHOTSPOT — forge.js
   FORGE (ex-Pokédraft): feed a pool of favourites, forge + rank the best teams
   of six. Dual scoring (Competitive / Average / Game-Ready). Adopt any forged
   team — with legal optimal movesets — straight into your hang-out.
   ========================================================================== */
(() => {
  "use strict";
  const P = window.PH, { $, $$, SPRITE, spriteFallback, norm, clamp, buzz } = P;
  const POOL_CAP = 30;

  // ---- scoring (ported from Pokédraft; additive so rankings genuinely diverge) --
  const scoreComp = A => {
    const gaps = Math.max(0, A.uncovered.length - A.walled.length);
    let s = 1.7*(18-A.uncovered.length) + 1.4*(18-A.walled.length) + 2.4*A.staffed.length
      + 3.2*Math.min(3,A.speed) + 1.2*Math.min(6,A.resistBreadth)
      + clamp((A.avgBST-460)/16,-3,7) - 7*A.exposed.length - 2*gaps;
    if (A.count < 6) s -= (6-A.count)*9;
    return clamp(Math.round(s),1,99);
  };
  const scoreGame = A => {
    const gaps = Math.max(0, A.uncovered.length - A.walled.length);
    let s = 2.6*Math.min(12,A.typeDiv) + 1.8*Math.min(12,A.resistBreadth) + 1.3*(18-A.walled.length)
      + 1.6*A.staffed.length + 4*Math.min(2,A.bulk) + clamp((A.avgBST-450)/18,-2,5)
      - 4*A.exposed.length - 1.5*gaps;
    if (A.count < 6) s -= (6-A.count)*6;
    return clamp(Math.round(s),1,99);
  };
  const scoreOf = (ev, m) => m==="game" ? ev.game : m==="avg" ? Math.round((ev.comp+ev.game)/2) : ev.comp;
  const MODE_LBL = { comp:"COMPETITIVE", avg:"ALL-ROUND", game:"GAME-READY" };
  const TIERS = [{min:88,t:"S"},{min:78,t:"A"},{min:66,t:"B"},{min:52,t:"C"},{min:38,t:"D"},{min:0,t:"E"}];
  const tierOf = sc => (TIERS.find(x => sc >= x.min) || TIERS[TIERS.length-1]).t;
  const verdict = (A, mode) => {
    if (A.exposed.length) return `shared <b>${A.exposed[0].t}</b> weakness`;
    if (mode==="comp" && A.vacant.length) return `wants a <b>${A.vacant[0].name.toLowerCase()}</b>`;
    if (A.walled.length) return `walled vs <b>${A.walled[0]}</b>`;
    if (mode==="game" && A.typeDiv >= 9) return `broad, ${A.typeDiv}-type coverage`;
    if (A.uncovered.length > A.walled.length) return `minor coverage gaps`;
    return `well-rounded — few holes`;
  };

  // ---- optimal moveset (ported) ---------------------------------------------
  const SETUP_RE = /^(swords dance|dragon dance|nasty plot|calm mind|quiver dance|shell smash|bulk up|coil|work up)$/i;
  const UTIL_PRI = ["recover","roost","synthesis","moonlight","slack off","soft-boiled","morning sun","calm mind","bulk up",
    "toxic","will-o-wisp","thunder wave","stealth rock","spikes","defog","iron defense","leech seed","substitute","knock off"];
  const UTIL_RE = new RegExp("^(" + UTIL_PRI.map(s=>s.replace(/[-]/g,"\\-")).join("|") + ")","i");
  const BAD_DMG = /^(hyper beam|giga impact|blast burn|hydro cannon|frenzy plant|roar of time|rock wrecker|prismatic laser|eternabeam|light of ruin|self-destruct|explosion|last resort|misty explosion|final gambit)$/i;
  const movesetFor = (u) => {
    const MOVES = P.MOVES; if (!MOVES.length) return [];
    const set = P.LEARN[u.id] || P.LEARN[u.dexno] || null;
    const canUse = m => !set || set.has(m.id);
    const good = m => !BAD_DMG.test(m.name);
    const phys = u.stats[1] >= u.stats[3], preferCat = phys ? "P" : "S";
    const own = [u.t1,u.t2].filter(Boolean);
    const chosen = [], usedIds = new Set(), usedTypes = new Set();
    const push = m => { if (m && !usedIds.has(m.id)) { chosen.push(m); usedIds.add(m.id); usedTypes.add(m.type); } };
    const bestDmg = (type,cat) => { let p = MOVES.filter(m => canUse(m)&&good(m)&&m.type===type&&m.power>0&&(!cat||m.cat===cat));
      if (!p.length&&cat) p = MOVES.filter(m => canUse(m)&&good(m)&&m.type===type&&m.power>0);
      p.sort((a,b)=>b.power-a.power); return p[0]||null; };
    own.forEach(t => { if (chosen.length<2) push(bestDmg(t,preferCat)); });
    const arch = P.archetype(u.stats);
    if (P.WALL_ARCH.has(arch)) {
      const util = MOVES.filter(m => canUse(m)&&m.cat==="N"&&UTIL_RE.test(m.name))
        .sort((a,b)=>{const ia=UTIL_PRI.findIndex(p=>a.name.toLowerCase().startsWith(p)),ib=UTIL_PRI.findIndex(p=>b.name.toLowerCase().startsWith(p));return (ia<0?99:ia)-(ib<0?99:ib);});
      push(util[0]);
    } else if (P.SWEEP_ARCH.has(arch)) {
      const setup = MOVES.filter(m => canUse(m)&&m.cat==="N"&&SETUP_RE.test(m.name)&&(phys?!/nasty plot|quiver dance/i.test(m.name):!/swords dance|coil/i.test(m.name)));
      push(setup[0]);
    }
    const cov = MOVES.filter(m => canUse(m)&&good(m)&&m.power>0&&!own.includes(m.type)).sort((a,b)=>b.power-a.power);
    for (const m of cov) { if (chosen.length>=4) break; if (usedTypes.has(m.type)||m.cat!==preferCat) continue; push(m); }
    if (chosen.length<4) { const rest = MOVES.filter(m => canUse(m)&&good(m)&&m.power>0).sort((a,b)=>b.power-a.power);
      for (const m of rest) { if (chosen.length>=4) break; if (usedIds.has(m.id)) continue; if (usedTypes.has(m.type)&&chosen.length>2) continue; push(m); } }
    return chosen.slice(0,4);
  };
  // share the optimal-moveset builder so other stations (QUIZ adopt) can dress teams too
  P.movesetFor = movesetFor;

  // ---- generation (ported) --------------------------------------------------
  const Cnk = (n,k) => { if(k<0||k>n)return 0; k=Math.min(k,n-k); let r=1; for(let i=0;i<k;i++)r=r*(n-i)/(i+1); return Math.round(r); };
  function* combos(arr,k){ const n=arr.length; if(k>n||k<0)return; if(k===0){yield[];return;} const idx=[...Array(k).keys()];
    while(true){ yield idx.map(i=>arr[i]); let i=k-1; while(i>=0&&idx[i]===i+n-k)i--; if(i<0)break; idx[i]++; for(let j=i+1;j<k;j++)idx[j]=idx[j-1]+1; } }
  const mulberry32 = a => () => { a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
  const EXHAUST = 150000;
  const evalCache = new Map();
  const evalTeam = ids => {
    const key = ids.slice().sort((a,b)=>a-b).join(",");
    let ev = evalCache.get(key); if (ev) return ev;
    const units = ids.map(id => P.byId.get(id));
    const A = P.analyzeTeam(units);
    ev = { ids: ids.slice(), key, units, A, comp: scoreComp(A), game: scoreGame(A) };
    evalCache.set(key, ev); return ev;
  };
  let candidates = [];
  const generate = () => {
    evalCache.clear();
    const poolIds = pool.map(p=>p.id);
    const locked = pool.filter(p=>p.locked).map(p=>p.id);
    const size = Math.min(6, poolIds.length);
    const lockN = Math.min(locked.length, size);
    const lockedUse = locked.slice(0,lockN);
    const free = poolIds.filter(id => !lockedUse.includes(id));
    const need = size - lockN;
    const cand = new Map();
    const add = ids => { const ev = evalTeam(ids); if (!cand.has(ev.key)) cand.set(ev.key, ev); };
    if (need <= 0) add(lockedUse);
    else if (Cnk(free.length, need) <= EXHAUST) { for (const c of combos(free,need)) add([...lockedUse,...c]); }
    else {
      const greedy = m => { for (const seed of free) { const ids=[...lockedUse,seed], used=new Set(ids);
        while (ids.length<size){ let best=null,bv=-1e9; for (const c of free){ if(used.has(c))continue;
          const s=scoreOf(evalTeam([...ids,c]),m); if(s>bv){bv=s;best=c;} } if(best==null)break; ids.push(best); used.add(best); } add(ids); } };
      greedy("comp"); greedy("game"); greedy("avg");
      const rng = mulberry32(0x51ceb00c);
      for (let r=0;r<260;r++){ const sh=free.slice(); for(let i=sh.length-1;i>0;i--){const j=(rng()*(i+1))|0;[sh[i],sh[j]]=[sh[j],sh[i]];} add([...lockedUse,...sh.slice(0,need)]); }
      let list=[...cand.values()].sort((a,b)=>Math.max(b.comp,b.game)-Math.max(a.comp,a.game)).slice(0,40);
      for (const ev of list){ let ids=ev.ids.slice();
        for (let pass=0;pass<2;pass++){ for (let i=0;i<ids.length;i++){ if(lockedUse.includes(ids[i]))continue;
          let bestIds=ids,bv=Math.max(evalTeam(ids).comp,evalTeam(ids).game);
          for (const c of free){ if(ids.includes(c))continue; const trial=ids.slice(); trial[i]=c;
            const e=evalTeam(trial),v=Math.max(e.comp,e.game); if(v>bv){bv=v;bestIds=trial;} } ids=bestIds; } } add(ids); }
    }
    candidates = [...cand.values()];
  };

  // ---- state / views --------------------------------------------------------
  let pool = [], mode = "comp", built = false, view = "pool", curTeam = null, curTab = "cover";
  const inPool = id => pool.some(p => p.id === id);
  const loadPool = () => {
    const raw = P.state.pool || [];
    pool = raw.map(p => typeof p === "number" ? { id:p, locked:false } : { id:p.id, locked:!!p.locked })
      .filter(p => P.byId.has(p.id)).slice(0, POOL_CAP);
  };
  const persist = () => { P.state.pool = pool; P.savePool(); };

  const spr = u => `<img src="${SPRITE(u.id)}" onerror="${spriteFallback(u.dexno)}" alt="${u.name}">`;

  // ---- POOL view ------------------------------------------------------------
  let q = "";
  const renderResults = () => {
    const box = $("#forgeResA"); if (!box) return;
    const nq = norm(q);
    if (!nq) { box.innerHTML = ""; box.hidden = true; return; }
    const hits = P.DEX.filter(u => u.key.includes(nq) || String(u.dexno).includes(nq)).slice(0, 24);
    box.hidden = false;
    box.innerHTML = hits.map(u => `<button class="fr-hit ${inPool(u.id)?"in":""}" data-id="${u.id}">
      ${spr(u)}<span class="frh-name">${u.name}</span>${inPool(u.id)?"<span class='frh-chk'>✓</span>":"<span class='frh-add'>+</span>"}</button>`).join("")
      || `<div class="fr-empty">no match</div>`;
  };
  const renderPool = () => {
    $("#poolTally").textContent = `${pool.length}/${POOL_CAP}`;
    const grid = $("#poolGrid");
    grid.innerHTML = pool.map(p => { const u = P.byId.get(p.id);
      return `<div class="pool-cap ${p.locked?"locked":""}" data-id="${p.id}">
        ${spr(u)}
        <span class="pc-name">${u.name}</span>
        <button class="pc-lock" data-act="lock" data-id="${p.id}" title="Lock into every team">${p.locked?"🔒":"🔓"}</button>
        <button class="pc-del" data-act="del" data-id="${p.id}" title="Remove">×</button>
      </div>`; }).join("") || `<div class="pool-hint">Add favourites below — FORGE builds the best sixes from them. 🔒 locks a unit into every team.</div>`;
    const fb = $("#forgeGo"); fb.disabled = pool.length < 2;
    $("#forgeGoSub").textContent = pool.length < 2 ? "add 2+ units" : `from ${pool.length}`;
  };

  // ---- RESULTS view ---------------------------------------------------------
  const renderRanked = () => {
    const sorted = candidates.slice().sort((a,b)=>scoreOf(b,mode)-scoreOf(a,mode)).slice(0, 24);
    $$("#forgeMode .seg-opt").forEach(o => o.classList.toggle("sel", o.dataset.mode===mode));
    $("#forgeList").innerHTML = sorted.map((ev,i)=>{
      const sc = scoreOf(ev,mode), t = tierOf(sc);
      return `<button class="team-card" data-key="${ev.key}">
        <div class="tc-rank"><span class="tc-tier tier-${t}">${t}</span><span class="tc-no">#${i+1}</span></div>
        <div class="tc-mons">${ev.units.map(u=>`<img src="${SPRITE(u.id)}" onerror="${spriteFallback(u.dexno)}" alt="">`).join("")}</div>
        <div class="tc-foot"><span class="tc-score">${sc}</span><span class="tc-verdict">${verdict(ev.A,mode)}</span></div>
      </button>`;
    }).join("");
  };

  // ---- TEAM DETAIL ----------------------------------------------------------
  const renderTeam = () => {
    const ev = curTeam; if (!ev) return;
    const sc = scoreOf(ev,mode), t = tierOf(sc);
    $("#teamBadge").innerHTML = `<span class="tc-tier tier-${t}">${t}</span><span class="tb-score">${sc}</span><span class="tb-mode">${MODE_LBL[mode]}</span>`;
    $("#teamHero").innerHTML = ev.units.map(u=>`<div class="th-mon"><img src="${SPRITE(u.id)}" onerror="${spriteFallback(u.dexno)}" alt=""><span>${u.name}</span></div>`).join("");
    $$("#teamTabs .tab").forEach(b => b.classList.toggle("sel", b.dataset.tab===curTab));
    renderTab();
  };
  const renderTab = () => {
    const ev = curTeam, A = ev.A, body = $("#teamTabBody");
    if (curTab === "cover") {
      const rows = P.TYPES.slice().sort((a,b)=>(A.defRows[b].weak-A.defRows[b].resist)-(A.defRows[a].weak-A.defRows[a].resist));
      body.innerHTML = `
        <div class="cov-summary">
          <span class="cs-item"><b>${A.typeDiv}</b>types</span>
          <span class="cs-item"><b>${A.exposed.length}</b>shared weak</span>
          <span class="cs-item"><b>${A.walled.length}</b>walled</span>
          <span class="cs-item"><b>${A.resistBreadth}</b>resist spine</span>
        </div>
        <div class="cov-rows">${rows.map(tp=>{ const r=A.defRows[tp]; const net=r.weak-r.resist;
          const cls = net>0?"neg":net<0?"pos":"even";
          return `<div class="cov-row cov-${cls}"><span class="tchip tc-${tp}">${tp}</span>
            <span class="cov-bar"><i class="cb-w" style="width:${r.weak*22}px"></i><i class="cb-r" style="width:${r.resist*22}px"></i></span>
            <span class="cov-net">${r.weak}/${r.resist}</span></div>`; }).join("")}</div>`;
    } else if (curTab === "moves") {
      body.innerHTML = ev.units.map(u=>{ const ms = movesetFor(u);
        return `<div class="mv-unit"><div class="mv-head">${spr(u)}<span>${u.name}</span><span class="mv-arch">${P.archetype(u.stats)}</span></div>
          <div class="mv-set">${ms.length?ms.map(m=>`<span class="mv-move tc-${m.type}">${m.name}<b>${m.power||"—"}</b></span>`).join(""):"<span class='mv-none'>learnset unavailable</span>"}</div></div>`;
      }).join("");
    } else {
      const totals = [0,0,0,0,0,0]; ev.units.forEach(u=>u.stats.forEach((v,i)=>totals[i]+=v));
      const avg = totals.map(v=>Math.round(v/ev.units.length));
      body.innerHTML = `<div class="st-team">
        <div class="stt-h">TEAM AVERAGE · BST ${A.avgBST}</div>
        ${avg.map((v,i)=>P.statBar(v,i)).join("")}
      </div>
      <div class="st-units">${ev.units.map(u=>`<div class="stu"><div class="stu-h">${spr(u)}<span>${u.name}</span><b>${u.bst}</b></div></div>`).join("")}</div>`;
    }
  };

  const showView = v => { view = v; ["pool","results","team"].forEach(x => { const el = $("#forgeV-"+x); if(el) el.hidden = x!==v; });
    $("#stAux").innerHTML = v==="results" || v==="team"
      ? `<button class="pill" id="forgePoolBtn">POOL</button>` : "";
    const pb = $("#forgePoolBtn"); if (pb) pb.onclick = () => showView("pool"); };

  const build = (container) => {
    container.innerHTML = `
      <!-- POOL -->
      <div class="forge-view" id="forgeV-pool">
        <div class="pool-bar">
          <span class="pool-lbl">POOL</span><span class="pool-tally" id="poolTally">0/${POOL_CAP}</span>
          <button class="pill" id="poolSeed" title="Add your current team">＋ MY TEAM</button>
        </div>
        <div class="field"><span class="si-glyph" aria-hidden="true"></span>
          <input id="forgeSearch" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ADD A FAVOURITE — NAME / Nº">
          <button class="si-clear" id="forgeClear">&times;</button></div>
        <div class="forge-hits scroll" id="forgeResA" hidden></div>
        <div class="pool-grid scroll" id="poolGrid"></div>
        <button class="forge-go" id="forgeGo" disabled><span>⚒ FORGE TEAMS</span><b id="forgeGoSub">add 2+ units</b></button>
      </div>
      <!-- RESULTS -->
      <div class="forge-view" id="forgeV-results" hidden>
        <div class="seg" id="forgeMode">
          <button class="seg-opt sel" data-mode="comp">COMPETITIVE</button>
          <button class="seg-opt" data-mode="avg">ALL-ROUND</button>
          <button class="seg-opt" data-mode="game">GAME-READY</button>
        </div>
        <div class="team-list scroll" id="forgeList"></div>
      </div>
      <!-- TEAM DETAIL -->
      <div class="forge-view" id="forgeV-team" hidden>
        <div class="team-detail-bar"><button class="pill" id="teamBackBtn">‹ TEAMS</button><div class="team-badge" id="teamBadge"></div></div>
        <div class="team-hero" id="teamHero"></div>
        <div class="tabs" id="teamTabs">
          <button class="tab sel" data-tab="cover">COVER</button>
          <button class="tab" data-tab="moves">MOVES</button>
          <button class="tab" data-tab="stats">STATS</button>
        </div>
        <div class="team-tab-body scroll" id="teamTabBody"></div>
        <button class="adopt-btn" id="adoptBtn">▾ ADOPT AS MY TEAM</button>
      </div>`;

    // pool search
    $("#forgeSearch").addEventListener("input", e => { q = e.target.value; renderResults(); });
    $("#forgeClear").onclick = () => { $("#forgeSearch").value=""; q=""; renderResults(); };
    $("#forgeResA").addEventListener("click", e => { const b = e.target.closest(".fr-hit"); if (!b) return;
      const id = +b.dataset.id;
      if (inPool(id)) { pool = pool.filter(p=>p.id!==id); }
      else if (pool.length < POOL_CAP) pool.push({ id, locked:false });
      persist(); renderPool(); renderResults(); buzz(8); });
    $("#poolSeed").onclick = () => { P.teamUnits().forEach(u => { if (!inPool(u.id) && pool.length<POOL_CAP) pool.push({id:u.id,locked:false}); });
      persist(); renderPool(); buzz(10); };
    $("#poolGrid").addEventListener("click", e => { const btn = e.target.closest("[data-act]"); if (!btn) return;
      const id = +btn.dataset.id;
      if (btn.dataset.act==="del") pool = pool.filter(p=>p.id!==id);
      else { const p = pool.find(x=>x.id===id); if (p) p.locked = !p.locked; }
      persist(); renderPool(); buzz(8); });
    $("#forgeGo").onclick = () => {
      $("#forgeGo").classList.add("forging");
      $("#forgeGo").querySelector("span").textContent = "⚒ FORGING…";
      setTimeout(() => { generate(); showView("results"); renderRanked();
        $("#forgeGo").classList.remove("forging"); $("#forgeGo").querySelector("span").textContent = "⚒ FORGE TEAMS"; buzz(20); }, 30);
    };

    // results
    $("#forgeMode").addEventListener("click", e => { const o = e.target.closest(".seg-opt"); if(!o)return; mode=o.dataset.mode; renderRanked(); buzz(6); });
    $("#forgeList").addEventListener("click", e => { const c = e.target.closest(".team-card"); if(!c)return;
      curTeam = candidates.find(ev=>ev.key===c.dataset.key); curTab="cover"; showView("team"); renderTeam(); });

    // team detail
    $("#teamBackBtn").onclick = () => { showView("results"); renderRanked(); };
    $("#teamTabs").addEventListener("click", e => { const b=e.target.closest(".tab"); if(!b)return; curTab=b.dataset.tab; renderTeam(); });
    $("#adoptBtn").onclick = () => {
      const ev = curTeam; if (!ev) return;
      const movesets = ev.units.map(u => movesetFor(u).map(m=>m.id));
      P.adoptTeam(ev.ids, movesets); buzz(24);
      const b = $("#adoptBtn"); b.textContent = "✓ ADOPTED — SEE THEM HOME"; b.classList.add("done");
      b.onclick = () => P.closeStation();
    };

    built = true;
  };

  P.stations.forge = {
    title: "FORGE",
    open(container) {
      if (!built) build(container);
      loadPool();
      showView(candidates.length ? "results" : "pool");
      renderPool(); if (candidates.length) renderRanked();
    },
  };
})();
