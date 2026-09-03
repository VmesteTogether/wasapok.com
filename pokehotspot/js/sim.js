/* =============================================================================
   POKÉHOTSPOT — sim.js
   SPAR (ex-pokemeter SIM, the 4th mode). Two linked ideas share ONE engine:
     (1) THEATER ELIGIBILITY — the games this exact six can legally play in
         (floor = latest species / regional-form / move generation on the team).
     (2) COMBAT SIM — 100 deterministic, seeded engagements in a chosen theater;
         a 1v1 attrition chain off the type chart + base stats + real move data.
   State machine: deploy → running → results → inspect (paged after-action
   debriefs). Re-dressed into pokecenter glass; runs on the live hang-out six.
   ========================================================================== */
(() => {
  "use strict";
  const P = window.PH;
  const { $, $$, SPRITE, spriteFallback, buzz, byId, moveById, effOn, ROMAN } = P;
  const DEX = () => P.DEX;
  const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const capW = w => w ? w.charAt(0).toUpperCase() + w.slice(1) : w;
  const REGION_FORM = [[/-alola/, "Alolan"], [/-galar/, "Galarian"], [/-hisui/, "Hisuian"], [/-paldea/, "Paldean"]];
  const NAME_FIX = { "nidoran-f":"Nidoran ♀", "nidoran-m":"Nidoran ♂", "mr-mime":"Mr. Mime", "mr-rime":"Mr. Rime",
    "mime-jr":"Mime Jr.", "porygon-z":"Porygon-Z", "jangmo-o":"Jangmo-o", "hakamo-o":"Hakamo-o", "kommo-o":"Kommo-o", "ho-oh":"Ho-Oh" };
  const dName = u => { const id = u.ident; if (NAME_FIX[id]) return NAME_FIX[id];
    for (const [re, pre] of REGION_FORM) if (re.test(id)) return pre + " " + capW(id.split("-")[0]);
    return id.includes("-") ? capW(id.split("-")[0]) : capW(id); };

  const REGIONS = ["KANTO","JOHTO","HOENN","SINNOH","UNOVA","KALOS","ALOLA","GALAR","PALDEA"];
  const SIM_N = 100;
  const SIM_KEY = "pokehotspot-sim-theater", LEG_KEY = "pokehotspot-sim-legends";

  // ---- eligibility floor ----------------------------------------------------
  const MOVE_GEN_CAPS = [165, 251, 354, 467, 559, 621, 742, 826, 920];
  const moveGen = id => { for (let i = 0; i < MOVE_GEN_CAPS.length; i++) if (id <= MOVE_GEN_CAPS[i]) return i + 1; return 9; };
  const FORM_RULES = [
    [/-primal/, 6, "PRIMAL"], [/-mega/, 6, "MEGA"], [/-gmax/, 8, "GIGANTAMAX"],
    [/-alola/, 7, "ALOLAN"], [/-galar/, 8, "GALARIAN"], [/-hisui/, 8, "HISUIAN"], [/-paldea/, 9, "PALDEAN"],
  ];
  const formInfo = ident => { for (const [re, g, tag] of FORM_RULES) if (re.test(ident)) return { g, tag }; return null; };
  const unitFloor = u => { const f = formInfo(u.ident); return Math.max(u.gen, f ? f.g : 1); };

  const computeEligibility = () => {
    let floor = 1, bind = null;
    const raise = (g, kind, label, detail) => { if (g > floor) { floor = g; bind = { kind, label, detail }; } };
    P.teamUnits().forEach(u => {
      raise(u.gen, "species", dName(u), `debuts Gen ${ROMAN[u.gen - 1]}`);
      const f = formInfo(u.ident);
      if (f && f.g > u.gen) raise(f.g, "form", dName(u), `${f.tag} form · Gen ${ROMAN[f.g - 1]}+`);
      (u.moves || []).forEach(mid => { if (mid == null) return;
        const g = moveGen(mid), mv = moveById.get(mid);
        raise(g, "move", mv ? mv.name : "MOVE", `on ${dName(u)} · Gen ${ROMAN[g - 1]} move`); });
    });
    const eligible = []; for (let g = floor; g <= 9; g++) eligible.push(g);
    return { floor, eligible, bind, count: P.teamUnits().length };
  };

  // ---- battle model (deterministic 1v1 attrition chain) ---------------------
  const mulberry32 = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  const coverageAttacks = (u, moveIds) => {
    const atk = [];
    (moveIds || []).forEach(mid => { const m = mid != null ? moveById.get(mid) : null;
      if (m && m.power > 0 && (m.cat === "P" || m.cat === "S")) atk.push({ type: m.type, power: m.power, cat: m.cat }); });
    if (atk.length) return atk;
    const cat = u.stats[1] >= u.stats[3] ? "P" : "S";
    return [u.t1, u.t2].filter(Boolean).map(t => ({ type: t, power: 90, cat }));
  };
  const duelDamage = (fA, fB) => {
    const A = fA.u, B = fB.u, own = [A.t1, A.t2]; let best = 0;
    for (const mv of fA.attacks) {
      const eff = effOn(mv.type, B.t1, B.t2); if (eff === 0) continue;
      const off = mv.cat === "P" ? A.stats[1] : A.stats[3];
      const def = mv.cat === "P" ? B.stats[2] : B.stats[4];
      const stab = own.includes(mv.type) ? 1.5 : 1;
      const dmg = ((22 * mv.power * off / def) / 50 + 2) * eff * stab;
      if (dmg > best) best = dmg;
    }
    return best;
  };
  const battle = (teamA, teamB) => {
    const A = teamA.map(f => ({ f, hp: f.u.stats[0] * 2 })), B = teamB.map(f => ({ f, hp: f.u.stats[0] * 2 }));
    let ia = 0, ib = 0, guard = 0; const log = [];
    while (ia < A.length && ib < B.length && guard++ < 300) {
      const a = A[ia], b = B[ib];
      const dab = duelDamage(a.f, b.f), dba = duelDamage(b.f, a.f);
      if (dab <= 0 && dba <= 0) {
        if (a.f.u.bst >= b.f.u.bst) { log.push({ by: "A", att: a.f.u, fell: b.f.u }); ib++; }
        else { log.push({ by: "B", att: b.f.u, fell: a.f.u }); ia++; }
        continue;
      }
      const strike = (att, dfn, dmg, side, adv) => { dfn.hp -= dmg;
        if (dfn.hp <= 0) { log.push({ by: side, att: att.f.u, fell: dfn.f.u }); adv(); return true; } return false; };
      const aFirst = a.f.u.stats[5] >= b.f.u.stats[5];
      if (aFirst) { if (strike(a, b, dab, "A", () => ib++)) continue; strike(b, a, dba, "B", () => ia++); }
      else        { if (strike(b, a, dba, "B", () => ia++)) continue; strike(a, b, dab, "A", () => ib++); }
    }
    return { win: ib >= B.length && ia < A.length, survA: A.length - ia, survB: B.length - ib, log };
  };

  const LEGENDARY = new Set([144,145,146,150,151,243,244,245,249,250,251,377,378,379,380,381,382,383,384,385,386,
    480,481,482,483,484,485,486,487,488,489,490,491,492,493,494,638,639,640,641,642,643,644,645,646,647,648,649,
    716,717,718,719,720,721,772,773,785,786,787,788,789,790,791,792,793,794,795,796,797,798,799,800,801,802,803,804,805,806,807,808,809,
    888,889,890,891,892,893,894,895,896,897,898,905,984,985,986,987,988,989,990,991,992,993,994,995,
    1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1014,1015,1016,1017,1020,1021,1022,1023,1024,1025]);
  const oppPoolCache = {};
  const opponentPool = (gen, legends) => { const key = gen + (legends ? "L" : "");
    return oppPoolCache[key] || (oppPoolCache[key] = DEX().filter(u => unitFloor(u) <= gen && u.bst >= 430 &&
      !/-mega|-primal|-gmax|-totem|-eternamax|-ultra/.test(u.ident) && (legends || !LEGENDARY.has(u.dexno)))); };
  const pickTeam = (pool, size, rnd) => { const team = [], used = new Set(); let guard = 0;
    while (team.length < size && guard++ < size * 60) { const c = pool[(rnd() * pool.length) | 0];
      if (c && !used.has(c.id)) { used.add(c.id); team.push(c); } } return team; };

  const DEBRIEF_WIN = [
    (mvp, opp) => `<b>${mvp}</b> swept the back line after <b>${opp}</b> whiffed the lead.`,
    mvp => `Traded down into <b>${mvp}</b>, then closed it out clean.`,
    mvp => `Won the speed race — <b>${mvp}</b> mopped up the survivors.`,
    (mvp, opp) => `<b>${mvp}</b> broke the <b>${opp}</b> wall and ran it back.`,
  ];
  const DEBRIEF_LOSS = [
    (opp, t) => `<em>${opp}</em> outsped after the lead fell — no answer for <em>${t}</em>.`,
    (opp, t) => `<em>${opp}</em> broke through; the <em>${t}</em> check went down early.`,
    opp => `Lost the tempo — <em>${opp}</em> snowballed unchecked.`,
    (opp, t) => `Walled by <em>${opp}</em> — couldn't punch past <em>${t}</em>.`,
  ];
  const makeDebriefFor = e => {
    if (e.win) { const tally = {}; e.log.filter(l => l.by === "A").forEach(l => tally[l.att.id] = (tally[l.att.id] || 0) + 1);
      const mvpId = Object.keys(tally).sort((x, y) => tally[y] - tally[x])[0];
      const mvp = mvpId ? dName(byId.get(+mvpId)) : dName(e.you[0]);
      return DEBRIEF_WIN[e.i % DEBRIEF_WIN.length](mvp, e.opp0 || "the lead"); }
    const theirs = e.log.filter(l => l.by === "B"), oppU = (theirs[theirs.length - 1] || {}).att;
    return DEBRIEF_LOSS[e.i % DEBRIEF_LOSS.length](oppU ? dName(oppU) : e.opp0, oppU ? oppU.t1 : "coverage");
  };

  const SIM_TIERS = [
    { min: 85, label: "DOMINANT",   sub: "the field can't answer this squad" },
    { min: 65, label: "FAVORED",    sub: "wins the majority of engagements" },
    { min: 45, label: "CONTESTED",  sub: "a coin-flip theater — sharpen the kit" },
    { min: 25, label: "OUTMATCHED", sub: "losing ground — patch the gaps" },
    { min: 0,  label: "OVERRUN",    sub: "this theater is hostile to the squad" },
  ];
  const simTier = pct => SIM_TIERS.find(t => pct >= t.min);

  const runSim = gen => {
    const tu = P.teamUnits(); if (!tu.length) return null;
    const you = tu, youF = tu.map(u => ({ u, attacks: coverageAttacks(u, u.moves) }));
    const size = you.length, pool = opponentPool(gen, simLegends);
    if (pool.length < size) return null;
    const rnd = mulberry32((0x5E5E ^ Math.imul(gen, 0x9E3779B1)) >>> 0);
    const engs = []; let wins = 0;
    const koBy = {}, fellFirst = {}, threatBy = {};
    for (let i = 0; i < SIM_N; i++) {
      const opp = pickTeam(pool, size, rnd);
      const r = battle(youF, opp.map(u => ({ u, attacks: coverageAttacks(u, null) })));
      if (r.win) wins++;
      r.log.forEach(l => {
        if (l.by === "A") koBy[l.att.id] = (koBy[l.att.id] || 0) + 1;
        if (l.by === "B") threatBy[l.att.id] = (threatBy[l.att.id] || 0) + 1; });
      if (!r.win) { const firstOwn = r.log.find(l => l.by === "B");
        if (firstOwn) fellFirst[firstOwn.fell.id] = (fellFirst[firstOwn.fell.id] || 0) + 1; }
      engs.push({ i, win: r.win, survA: r.survA, survB: r.survB, size, you, opp, log: r.log,
        opp0: opp[0] ? dName(opp[0]) : "", debrief: "" });
    }
    engs.forEach(e => e.debrief = makeDebriefFor(e));
    const top = o => { const k = Object.keys(o).sort((x, y) => o[y] - o[x])[0]; return k ? +k : null; };
    const mvp = top(koBy), liability = top(fellFirst), threat = top(threatBy);
    return { gen, size, wins, losses: SIM_N - wins, engs, legends: simLegends,
      nonCanon: gen < computeEligibility().floor,
      mvp, mvpN: mvp ? koBy[mvp] : 0, liability, liabilityN: liability ? fellFirst[liability] : 0,
      threat, threatN: threat ? threatBy[threat] : 0 };
  };

  // ---- native catchability (P.NATIVE = {1..9: Set(dexno)}) ------------------
  const NATIVE_OK = () => !!(P.NATIVE && P.NATIVE[1]);
  const nativeIn = (u, gen) => NATIVE_OK() && P.NATIVE[gen] && P.NATIVE[gen].has(u.dexno);
  const nativeBadge = (units, gen) => { if (!NATIVE_OK()) return "";
    const n = units.filter(u => nativeIn(u, gen)).length, t = units.length;
    const cls = n === 0 ? "none" : n === t ? "full" : "";
    return `<span class="sim-nat ${cls}">◆${n}/${t}</span>`; };
  const nativeLine = (units, gen) => { if (!NATIVE_OK() || !units.length) return "";
    const region = REGIONS[gen - 1], missing = units.filter(u => !nativeIn(u, gen)), n = units.length - missing.length;
    if (!missing.length) return `<div class="sim-native full"><span class="sn-k">◆ NATIVE</span><span class="sn-v">catch all ${units.length} in ${region}</span></div>`;
    const names = missing.map(dName).slice(0, 2).join(", ") + (missing.length > 2 ? ` +${missing.length - 2}` : "");
    return `<div class="sim-native"><span class="sn-k">◆ ${n}/${units.length}</span><span class="sn-v">${region} can't catch <b>${names}</b></span></div>`; };

  // ---- state ----------------------------------------------------------------
  let built = false, simState = "deploy", simRun = null, simTheater = 0, inspIdx = 0, inspLossOnly = false;
  let simLegends = (() => { try { return localStorage.getItem(LEG_KEY) !== "0"; } catch { return true; } })();

  const initSimTheater = E => { let saved = 0; try { saved = +localStorage.getItem(SIM_KEY) || 0; } catch {}
    if (saved >= 1 && saved <= 9) simTheater = saved;
    else if (simTheater < 1 || simTheater > 9) simTheater = E.floor; };

  // ---- views ----------------------------------------------------------------
  const el = () => $("#station-sim");
  const unitCell = (u, i) => `<div class="sim-mcap"><span class="smc-idx">0${i + 1}</span>
    <img src="${SPRITE(u.id)}" onerror="${spriteFallback(u.dexno)}" alt=""><span class="smc-n">${dName(u)}</span></div>`;

  const deployHTML = () => {
    const you = P.teamUnits();
    if (!you.length) return `<div class="sim-empty">
      <div class="se-ic" aria-hidden="true"><svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l8 8M7 4L4 7l2.6 2.6L9.6 6.6zM5 22l4-4M23 5l-8 8M21 4l3 3-2.6 2.6L18.4 6.6zM23 22l-4-4"/></svg></div>
      <h3>NO SQUAD ON FILE</h3><p>File your six and project 100 engagements.</p>
      <div class="se-cta"><button class="pill" data-goto="forge">⚒ FORGE</button><button class="pill" data-goto="quiz">◓ QUIZ</button><button class="pill" data-goto="dex">◎ DEX</button></div></div>`;
    const E = computeEligibility(); initSimTheater(E);
    const nonCanon = simTheater < E.floor;
    const grid = REGIONS.map((name, idx) => { const g = idx + 1, legal = g >= E.floor, sel = g === simTheater;
      const cls = ["sim-th", legal ? "legal" : "locked", sel ? "sel" : "", sel && !legal ? "warn" : ""].filter(Boolean).join(" ");
      const lock = legal ? "" : `<span class="sim-th-lock" title="off-limits">▮</span>`;
      return `<button class="${cls}" data-th="${g}"><span class="sth-g">GEN ${g}</span><span class="sth-n">${name}</span>${nativeBadge(you, g)}${lock}</button>`;
    }).join("");
    const note = nonCanon
      ? `<div class="sim-note warn"><span class="sn-ic">⚠</span><span><b>NON-CANONICAL · ${REGIONS[simTheater - 1]}</b> — this squad can't legally exist here${E.bind ? ` (<b>${E.bind.label}</b> ${E.bind.detail})` : ""}. Running a hypothetical.</span></div>`
      : `<div class="sim-note"><span class="sn-ic">▲</span><span>${E.bind
          ? `EARLIEST THEATER <b>${REGIONS[E.floor - 1]} · GEN ${E.floor}</b> — floor set by <b>${E.bind.label}</b> <i>(${E.bind.detail})</i>`
          : `<b>ALL THEATERS OPEN</b> — legal in every region`}</span></div>`;
    return `<div class="sim-scr scroll">
      <div class="sim-kicker"><span>SPAR // COMBAT PROJECTION</span><span>${you.length} UNIT${you.length > 1 ? "S" : ""}</span></div>
      <div class="sim-team">${you.map(unitCell).join("")}</div>
      <div class="sim-elig-head"><h3>SELECT THEATER</h3><span class="sim-elig-cnt">${E.eligible.length} / 9 ELIGIBLE</span></div>
      <div class="sim-th-grid">${grid}</div>
      ${nativeLine(you, simTheater)}
      ${note}
      <button class="sim-legtog ${simLegends ? "on" : ""}" data-act="legtog" aria-pressed="${simLegends}">
        <span class="slt-l"><span class="slt-ic">★</span>LEGENDARY OPPONENTS</span><span class="sim-switch"><span class="ssw-knob"></span></span></button>
      <button class="sim-run-btn${nonCanon ? " warn" : ""}" data-act="run"><span>RUN SIM ▸</span><b>${SIM_N} ${nonCanon ? "HYPOTHETICAL" : "ENGAGEMENTS"} · ${REGIONS[simTheater - 1]}</b></button>
    </div>`;
  };

  const runningHTML = () => `<div class="sim-scr sim-running">
    <div class="sr-tl">RUNNING ENGAGEMENTS</div>
    <div class="sr-th">THEATER · ${REGIONS[simRun.gen - 1]}</div>
    <div class="sr-big"><span id="simRunNum">000</span><small>/${SIM_N}</small></div>
    <div class="sr-bar"><div class="sr-bar-fill" id="simRbar"></div></div>
    <div class="sr-tally"><div class="srt w"><b id="simRunW">0</b><span>WON</span></div><div class="srt l"><b id="simRunL">0</b><span>LOST</span></div></div>
    <div class="sr-scroll" id="simRunScroll">&nbsp;</div></div>`;

  const startRunAnim = () => {
    const run = simRun; if (!run) { simState = "deploy"; renderSim(); return; }
    if (prefersReduced) { simState = "results"; renderSim(); return; }
    const num = $("#simRunNum"), bar = $("#simRbar"), w = $("#simRunW"), l = $("#simRunL"), scr = $("#simRunScroll");
    let n = 0, wc = 0, lc = 0; const t0 = performance.now(), dur = 1500;
    const frame = t => {
      if (el().hidden || simState !== "running") return;
      const p = Math.min(1, (t - t0) / dur), target = (p * SIM_N) | 0;
      while (n < target) { n++; if (run.engs[n - 1].win) wc++; else lc++; }
      if (num) num.textContent = String(n).padStart(3, "0");
      if (w) w.textContent = wc; if (l) l.textContent = lc;
      if (bar) bar.style.width = (p * 100) + "%";
      if (scr && n > 0) { const e = run.engs[n - 1]; scr.innerHTML = `ENG ${String(n).padStart(3, "0")} · <b>${e.win ? "WON" : "LOST"}</b> vs ${e.opp0}`; }
      if (p < 1) requestAnimationFrame(frame);
      else setTimeout(() => { if (!el().hidden && simState === "running") { simState = "results"; renderSim(); } }, 240);
    };
    requestAnimationFrame(frame);
  };

  const resultsHTML = () => {
    const r = simRun, pct = Math.round(r.wins / SIM_N * 100), tier = simTier(pct);
    const co = (lbl, id, extra) => { if (!id) return ""; const u = byId.get(id); if (!u) return "";
      return `<div class="sim-callout"><span class="sco-l">${lbl}</span><span class="sco-pip tc-${u.t1}"></span><b>${dName(u)}</b><i>${extra}</i></div>`; };
    return `<div class="sim-scr sim-results scroll">
      <div class="sr-k${r.nonCanon ? " warn" : ""}">${r.nonCanon ? "NON-CANONICAL" : "PROJECTION COMPLETE"} · ${REGIONS[r.gen - 1]}${r.legends ? "" : " · NO LEGENDS"}</div>
      <div class="sim-res-score">${r.wins}<small>/${SIM_N} WON</small></div>
      <div class="sim-res-tier">${tier.label}</div>
      <div class="sim-res-sub">${tier.sub}</div>
      <div class="sim-rmeter"><div class="srm-fill" data-w="${pct}"></div></div>
      <div class="sim-split"><div class="ssp w"><b>${r.wins}</b><span>VICTORIES</span></div><div class="ssp l"><b>${r.losses}</b><span>DEFEATS</span></div></div>
      <div class="sim-callouts">
        ${co("MVP", r.mvp, `${r.mvpN} KOs across the run`)}
        ${co("FELL FIRST", r.liability, `led ${r.liabilityN} of ${r.losses} defeats`)}
        ${co("THREAT", r.threat, `${r.threatN} KOs on your squad`)}
      </div>
      <div class="sim-res-foot">
        <button class="sim-run-btn" data-act="review"><span>REVIEW ENGAGEMENTS ▸</span></button>
        <button class="sim-btn-2" data-act="reconf">↺ THEATER</button>
      </div></div>`;
  };
  const afterResults = () => requestAnimationFrame(() => requestAnimationFrame(() => {
    const f = $("#station-sim .srm-fill"); if (f) f.style.width = f.dataset.w + "%"; }));

  const inspList = () => inspLossOnly ? simRun.engs.filter(e => !e.win).map(e => e.i) : simRun.engs.map(e => e.i);
  const tokRow = (list, fainted) => list.map((u, i) =>
    `<div class="sim-tok ${i < fainted ? "ko" : ""}"><img src="${SPRITE(u.id)}" onerror="${spriteFallback(u.dexno)}" alt="">
       <span class="stk-dex">${String(u.dexno).padStart(3, "0")}</span></div>`).join("");

  const inspectHTML = () => {
    const list = inspList(); if (!list.includes(inspIdx)) inspIdx = list.length ? list[0] : 0;
    const e = simRun.engs[inspIdx], pos = list.indexOf(inspIdx) + 1, R = REGIONS[simRun.gen - 1];
    return `<div class="sim-scr sim-inspect">
      <div class="si-head">
        <button class="si-nav" data-act="prev" aria-label="Previous">‹</button>
        <div class="si-count"><div class="sic-n">ENGAGEMENT <b>${String(inspIdx + 1).padStart(3, "0")}</b>/${SIM_N}</div>
          <div class="sic-s">${inspLossOnly ? `DEFEAT ${pos} / ${list.length}` : "STEP WITH ‹ ›"}</div></div>
        <button class="si-nav" data-act="next" aria-label="Next">›</button>
        <button class="si-close" data-act="closeinsp" aria-label="Close">×</button>
      </div>
      <div class="si-body scroll">
        <div class="sim-verdict ${e.win ? "won" : "lost"}"><span class="sv-tag">${e.win ? "WON" : "LOST"}</span>
          <span class="sv-sub">${R} THEATER · ${e.survA} OF ${e.size} SURVIVING</span></div>
        <div class="sim-side"><div class="ss-lbl ours"><span>YOUR SQUAD</span><span>${e.survA}/${e.size} STANDING</span></div>
          <div class="sim-tokrow">${tokRow(e.you, e.size - e.survA)}</div></div>
        <div class="sim-side"><div class="ss-lbl theirs"><span>HOSTILE · ${R}</span><span>${e.survB}/${e.size} STANDING</span></div>
          <div class="sim-tokrow">${tokRow(e.opp, e.size - e.survB)}</div></div>
        <div class="sim-why"><div class="sw-k">AFTER-ACTION DEBRIEF</div><div class="sw-txt">${e.debrief}</div></div>
      </div>
      <div class="si-foot">
        <button class="sim-loss-tog ${inspLossOnly ? "on" : ""}" data-act="lossonly"><span class="slt-box"></span>LOSSES ONLY</button>
        <span class="si-hint">TAP ‹ › TO STEP</span>
      </div></div>`;
  };

  const renderSim = () => {
    const c = el(); if (!c) return;
    if (simState === "running") { c.innerHTML = runningHTML(); startRunAnim(); }
    else if (simState === "results") { c.innerHTML = resultsHTML(); afterResults(); }
    else if (simState === "inspect") c.innerHTML = inspectHTML();
    else c.innerHTML = deployHTML();
    const scr = c.querySelector(".sim-scr");
    if (scr && !prefersReduced) { scr.classList.remove("sim-in"); void scr.offsetWidth; scr.classList.add("sim-in"); }
  };

  // ---- interactions ---------------------------------------------------------
  const wire = c => c.addEventListener("click", ev => {
    const goto = ev.target.closest("[data-goto]");
    if (goto) { P.openStation(goto.dataset.goto); return; }
    const th = ev.target.closest(".sim-th");
    if (th) { simTheater = +th.dataset.th; try { localStorage.setItem(SIM_KEY, simTheater); } catch {} buzz(6); renderSim(); return; }
    const btn = ev.target.closest("[data-act]"); if (!btn) return;
    switch (btn.dataset.act) {
      case "legtog": simLegends = !simLegends; try { localStorage.setItem(LEG_KEY, simLegends ? "1" : "0"); } catch {} buzz(6); renderSim(); break;
      case "run": simRun = runSim(simTheater); if (!simRun) { buzz(4); return; } simState = "running"; buzz(18); renderSim(); break;
      case "review": inspLossOnly = false; inspIdx = (simRun.engs.find(e => !e.win) || simRun.engs[0]).i; simState = "inspect"; buzz(10); renderSim(); break;
      case "reconf": simState = "deploy"; buzz(8); renderSim(); break;
      case "closeinsp": simState = "results"; buzz(8); renderSim(); break;
      case "prev": case "next": { const list = inspList(); let p = list.indexOf(inspIdx); if (p < 0) p = 0;
        p = (p + (btn.dataset.act === "next" ? 1 : -1) + list.length) % list.length; inspIdx = list[p]; buzz(5); renderSim(); break; }
      case "lossonly": if (!inspLossOnly && !simRun.engs.some(e => !e.win)) { buzz(4); return; }
        inspLossOnly = !inspLossOnly; buzz(6); renderSim(); break;
    }
  });

  P.stations.sim = {
    title: "SPAR",
    open(c) { if (!built) { wire(c); built = true; } simState = "deploy"; renderSim(); },  // fresh eligibility each visit
  };
})();
