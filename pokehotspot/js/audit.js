/* =============================================================================
   POKÉHOTSPOT — audit.js
   AUDIT (ex-aremypokemongood, de-noired). A clean diagnostic readout of the
   team that's currently hanging out: a readiness score + tier, the deductions
   behind it, a defensive coverage matrix, an offensive coverage map, a role
   roster, and a recruitment advisory that can file/swap units live.
   ========================================================================== */
(() => {
  "use strict";
  const P = window.PH;
  const { $, $$, SPRITE, spriteFallback, buzz, byId } = P;
  const { effOn, TYPES, DUTIES, archetype, genOf, ROMAN, analyzeTeam, readinessTier } = P;
  const DEX = () => P.DEX;

  const spr = u => `<img src="${SPRITE(u.id)}" onerror="${spriteFallback(u.dexno)}" alt="${u.name}">`;
  const tchip = t => `<span class="tchip tc-${t}">${t}</span>`;
  const bstOf = u => u.bst;

  // duty one-liners (core.DUTIES carries key/name/test; the "why" lives here)
  const DUTY_DESC = {
    physatk:  "hits hard physically · ATK ≥ 100",
    specatk:  "special pressure · SPA ≥ 100",
    physwall: "eats physical hits · DEF ≥ 100, HP ≥ 60",
    specwall: "eats special hits · SPD ≥ 95, HP ≥ 60",
    speed:    "moves first · SPE ≥ 105",
    support:  "soaks & holds the line · HP ≥ 85, both defs ≥ 70",
  };
  // mythicals can't just be "gone and caught" — kept out of advice
  const MYTHICAL = new Set([151,251,385,386,489,490,491,492,493,494,647,648,649,
    719,720,721,801,802,807,808,809,893,1025]);

  // ---- state ----------------------------------------------------------------
  let built = false, tab = "def";
  let recCache = null, recLimit = 3, recDirty = true;

  // ================================ VERDICT =================================
  const verdictOf = score =>
    score >= 88 ? { lbl:"OPTIMAL",  sub:"battle-ready — few holes to close" } :
    score >= 75 ? { lbl:"SOLID",    sub:"a strong outfit with minor gaps" } :
    score >= 55 ? { lbl:"WORKABLE", sub:"functional — deficiencies noted below" } :
    score >= 35 ? { lbl:"RAW",      sub:"real weaknesses to patch" } :
                  { lbl:"FORMING",  sub:"early days — keep filing units" };

  const noteLine = n => {
    switch (n.tag) {
      case "shared weakness": return `<b>−${n.val}</b> shared weakness · ${n.types.map(tchip).join("")}`;
      case "walled attacks":  return `<b>−${n.val}</b> walled attacks · ${n.types.map(tchip).join("")}`;
      case "coverage gaps":   return `<b>−${n.val}</b> offensive coverage gaps`;
      case "unfilled duties": return `<b>−${n.val}</b> unfilled duties · ${n.roles.join(" · ")}`;
      case "roster forming":  return `<b>−${n.val}</b> roster still forming`;
      default:                return `<b>−${n.val}</b> ${n.tag}`;
    }
  };

  const verdictHTML = (team, A) => {
    const v = verdictOf(A.score), tier = readinessTier(A.score);
    const ring = `conic-gradient(var(--accent) ${A.score * 3.6}deg, var(--bg2) 0)`;
    return `
      <div class="au-verdict">
        <div class="av-ring" style="background:${ring}">
          <div class="av-inner"><b>${A.score}</b><span>/100</span></div>
        </div>
        <div class="av-meta">
          <div class="av-tier ${tier.cls}">${v.lbl}</div>
          <div class="av-sub">${v.sub}</div>
          <div class="av-team">${team.map(u =>
            `<button class="av-mon" data-inspect="${u.id}" title="${u.name}">${spr(u)}</button>`).join("")}
            ${team.length < 6 ? `<span class="av-slots">${6 - team.length} open</span>` : ""}</div>
        </div>
      </div>
      <div class="au-deducts">
        ${A.notes.length ? A.notes.map(n => `<div class="ded-row">${noteLine(n)}</div>`).join("")
          : `<div class="ded-clean">✓ No deductions — the fundamentals are sound.</div>`}
      </div>`;
  };

  // ================================ DEFENSE =================================
  const CELL = m => m >= 4 ? ["x4","4×"] : m >= 2 ? ["x2","2×"] : m === 0 ? ["x0","0"]
    : m <= .25 ? ["q","¼"] : m < 1 ? ["h","½"] : ["n","·"];
  const NET = { bad:["EXPOSED","net-bad"], good:["SECURE","net-good"], soft:["SOFT","net-soft"], mid:["—","net-mid"] };

  const defenseHTML = (team, A) => {
    const head = `<tr><th class="rt">VS↓</th>${team.map(u =>
      `<th><img src="${SPRITE(u.id)}" onerror="${spriteFallback(u.dexno)}" alt="${u.name}"></th>`).join("")}<th class="nt">NET</th></tr>`;
    const rows = TYPES.map(atk => {
      const cells = team.map(u => { const [cls, txt] = CELL(effOn(atk, u.t1, u.t2)); return `<td class="c-${cls}">${txt}</td>`; }).join("");
      const [net, netCls] = NET[A.defRows[atk].status];
      return `<tr><td class="rt">${tchip(atk)}</td>${cells}<td class="${netCls}">${net}</td></tr>`;
    }).join("");
    let stamps = "";
    [...A.exposed].sort((a, b) => b.weak - a.weak).forEach(x =>
      stamps += stamp("bad", `WEAK TO ${x.t.toUpperCase()}`, `${x.weak} of ${team.length} hit hard`));
    if (!A.exposed.length) stamps += stamp("good", "NO SHARED WEAKNESS", "nothing threatens the whole team");
    if (A.secure.length >= 4) stamps += stamp("good", "RESIST SPINE INTACT", `secure vs ${A.secure.length} types`);
    return `<div class="au-matrix"><table class="def-mtx">${head}${rows}</table></div>
      <div class="au-stamps">${stamps}</div>`;
  };

  // ================================ OFFENSE =================================
  const offenseHTML = (team, A) => {
    const grid = TYPES.map(def => {
      const best = A.offRows[def]; let cls, txt;
      if (best >= 2) { cls = "se"; txt = best + "×"; }
      else if (best >= 1) { cls = "nu"; txt = "1×"; }
      else { cls = "wl"; txt = best === 0 ? "0" : "½"; }
      return `<div class="off-tile off-${cls}">${tchip(def)}<span class="off-m">${txt}</span></div>`;
    }).join("");
    const neutralOnly = A.uncovered.filter(t => !A.walled.includes(t));
    let stamps = "";
    if (A.walled.length) stamps += stamp("bad", "WALLED BY " + A.walled.map(t => t.toUpperCase()).join(", "), "no STAB lands neutral");
    if (neutralOnly.length) stamps += stamp("warn", "CAN'T PRESSURE " + neutralOnly.map(t => t.toUpperCase()).join(", "), "no super-effective STAB");
    if (!A.uncovered.length) stamps += stamp("good", "FULL COVERAGE", "every type takes S.E. STAB");
    return `<div class="au-stab"><span class="stab-lbl">STAB ON STAFF</span>${A.stabs.map(tchip).join("")}</div>
      <div class="off-grid">${grid}</div>
      <div class="au-stamps">${stamps}</div>`;
  };

  // ================================ ROLES ===================================
  const rolesHTML = (team, A) => {
    const rows = DUTIES.map(d => {
      const holders = team.filter(u => d.test(u.stats));
      return `<div class="duty-row ${holders.length ? "ok" : "no"}">
        <div class="duty-head"><span class="duty-name">${d.name}</span>
          <span class="duty-mark">${holders.length ? "✓ COVERED" : "VACANT"}</span></div>
        <div class="duty-desc">${DUTY_DESC[d.key] || ""}</div>
        <div class="duty-holders">${holders.map(u =>
          `<img src="${SPRITE(u.id)}" onerror="${spriteFallback(u.dexno)}" alt="${u.name}" title="${u.name}">`).join("")
          || `<span class="duty-none">— no one on staff —</span>`}</div>
      </div>`;
    }).join("");
    const sum = A.vacant.length
      ? stamp("warn", A.vacant.length + " DUT" + (A.vacant.length === 1 ? "Y" : "IES") + " VACANT", A.vacant.map(d => d.name).join(" · "))
      : stamp("good", "ALL DUTIES STAFFED", "a complete outfit");
    return `<div class="duty-list">${rows}</div><div class="au-stamps">${sum}</div>`;
  };

  // ================================ RECRUIT =================================
  const recReasons = (A, A2) => {
    const r = [];
    const duties = A.vacant.filter(d => !A2.vacant.includes(d)).map(d => d.name);
    if (duties.length) r.push("staffs " + duties.join(" + "));
    const patched = A.exposed.filter(x => !A2.exposed.some(y => y.t === x.t)).map(x => x.t.toUpperCase());
    if (patched.length) r.push("patches " + patched.join("/") + " weakness");
    const cov = A.uncovered.filter(t => !A2.uncovered.includes(t)).map(t => t.toUpperCase());
    if (cov.length) r.push("adds pressure on " + cov.slice(0, 4).join(", "));
    const opened = A2.exposed.filter(x => !A.exposed.some(y => y.t === x.t)).map(x => x.t.toUpperCase());
    if (opened.length) r.push("but opens " + opened.join("/"));
    return r;
  };

  const computeRecs = (team, A) => {
    const full = team.length >= 6;
    const onTeam = new Set(team.map(u => u.dexno));
    const pool = DEX().filter(u => u.id < 10000 && !onTeam.has(u.dexno) && !MYTHICAL.has(u.dexno) && bstOf(u) >= 500 && bstOf(u) <= 610);
    const tie = c => [c.t1, c.t2].filter(t => t && !A.stabs.includes(t)).length * 10 + bstOf(c) / 100;
    const sugg = [];
    if (!full) {
      pool.forEach(c => { const A2 = analyzeTeam(team.concat(c)); const delta = A2.score - A.score;
        if (delta > 0) sugg.push({ inn: c, out: null, slot: -1, delta, reasons: recReasons(A, A2), tie: tie(c) }); });
    } else {
      team.forEach((member, i) => {
        const rest = team.slice(0, i).concat(team.slice(i + 1));
        pool.forEach(c => { const A2 = analyzeTeam(rest.concat(c)); const delta = A2.score - A.score;
          if (delta > 0) sugg.push({ inn: c, out: member, slot: member.slot, delta, reasons: recReasons(A, A2), tie: tie(c) }); });
      });
    }
    sugg.sort((a, b) => b.delta - a.delta || b.tie - a.tie);
    const floor = sugg.length ? Math.max(1, Math.ceil(sugg[0].delta / 2)) : 1;
    const picks = [], seen = new Set();
    for (const s of sugg) { if (s.delta < floor) break; if (seen.has(s.inn.dexno)) continue; seen.add(s.inn.dexno); picks.push(s); if (picks.length === 30) break; }
    return { full, picks };
  };

  const recruitHTML = (team, A) => {
    if (recDirty || !recCache) { recCache = computeRecs(team, A); recDirty = false; recLimit = 3; }
    const { full, picks } = recCache;
    const note = full
      ? "Roster full — gains need a swap. Proposed changes, best first."
      : `Roster ${team.length}/6 — the advisory recommends filing these, best first.`;
    if (!picks.length) {
      return `<div class="rec-note">${note}</div>` + stamp("good", "NO CHANGES ADVISED",
        full ? "no swap would raise the score" : "file whoever you like — the base is sound");
    }
    const shown = picks.slice(0, recLimit);
    let html = `<div class="rec-note">${note}</div>` + shown.map((s, pi) => `
      <div class="rec-card">
        <div class="rec-art">${spr(s.inn)}</div>
        <div class="rec-body">
          <div class="rec-top"><span class="rec-name">${s.inn.name}</span><span class="rec-delta">+${s.delta}</span></div>
          <div class="rec-types">${tchip(s.inn.t1)}${s.inn.t2 ? tchip(s.inn.t2) : ""}<span class="rec-class">${archetype(s.inn.stats)}</span></div>
          <div class="rec-reason">${s.out ? `relieves <b>${s.out.name}</b> — ` : ""}${s.reasons.join(" · ") || "general reinforcement"}</div>
        </div>
        <button class="rec-enlist" data-pi="${pi}">${s.out ? "SWAP" : "FILE"}</button>
      </div>`).join("");
    html += picks.length > recLimit
      ? `<button class="rec-more" id="auRecMore">MORE CANDIDATES<small>${picks.length - recLimit} on file</small></button>`
      : `<div class="rec-end">— end of advisory —</div>`;
    return html;
  };

  // ---- shared stamp ---------------------------------------------------------
  const stamp = (cls, text, sub) => `<div class="au-stamp st-${cls}"><b>${text}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;

  // ================================ RENDER ==================================
  const TABS = [
    { k:"def",  lbl:"DEFENSE" },
    { k:"off",  lbl:"OFFENSE" },
    { k:"role", lbl:"ROLES" },
    { k:"rec",  lbl:"RECRUIT" },
  ];
  const panelHTML = (team, A) =>
    tab === "def" ? defenseHTML(team, A) :
    tab === "off" ? offenseHTML(team, A) :
    tab === "role" ? rolesHTML(team, A) : recruitHTML(team, A);

  const renderAudit = () => {
    const c = $("#station-audit"); if (!c) return;
    const team = P.teamUnits();
    if (!team.length) {
      c.innerHTML = `<div class="au-empty">
        <div class="aue-ic" aria-hidden="true"><svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M4 20a10 10 0 0 1 20 0"/><path d="M14 20l6-6"/><circle cx="14" cy="20" r="2.3" fill="currentColor" stroke="none"/></svg></div>
        <h3>NO TEAM ON FILE</h3>
        <p>File your six and the diagnostic comes online.</p>
        <div class="aue-cta">
          <button class="pill" data-goto="forge">⚒ FORGE</button>
          <button class="pill" data-goto="quiz">◓ QUIZ</button>
          <button class="pill" data-goto="dex">◎ DEX</button>
        </div>
      </div>`;
      return;
    }
    const A = analyzeTeam(team);
    c.innerHTML = `
      <div class="au-scroll scroll">
        ${verdictHTML(team, A)}
        <div class="au-seg" id="auSeg">${TABS.map(t =>
          `<button class="au-seg-opt ${t.k === tab ? "sel" : ""}" data-tab="${t.k}">${t.lbl}</button>`).join("")}</div>
        <div class="au-panel" id="auPanel">${panelHTML(team, A)}</div>
      </div>`;
  };

  // ---- interactions (delegated) --------------------------------------------
  const wire = c => {
    c.addEventListener("click", e => {
      // switch to another station from the empty state
      const goto = e.target.closest("[data-goto]");
      if (goto) { P.openStation(goto.dataset.goto); return; }

      // inspect a member
      const insp = e.target.closest("[data-inspect]");
      if (insp) { const u = byId.get(+insp.dataset.inspect); if (u) P.openInfo(u); return; }

      // tab switch
      const seg = e.target.closest(".au-seg-opt");
      if (seg) { tab = seg.dataset.tab; buzz(6);
        $$("#auSeg .au-seg-opt").forEach(o => o.classList.toggle("sel", o === seg));
        const team = P.teamUnits(); $("#auPanel").innerHTML = panelHTML(team, analyzeTeam(team)); return; }

      // recruit: more
      if (e.target.closest("#auRecMore")) { recLimit += 3;
        const team = P.teamUnits(); $("#auPanel").innerHTML = recruitHTML(team, analyzeTeam(team)); return; }

      // recruit: file / swap into the live team
      const enl = e.target.closest(".rec-enlist");
      if (enl && recCache) { const s = recCache.picks[+enl.dataset.pi]; if (!s) return;
        if (s.out) P.setSlot(s.slot, s.inn.id); else P.addUnit(s.inn.id);
        buzz(18); /* "team" event re-renders */ return; }
    });
  };

  // re-audit live whenever the team changes while we're open
  P.on("team", () => { recDirty = true;
    const c = $("#station-audit"); if (built && c && !c.hidden) renderAudit(); });

  P.stations.audit = {
    title: "AUDIT",
    open(c) {
      if (!built) { wire(c); built = true; }
      recDirty = true;   // fresh advisory each visit
      renderAudit();
    },
  };
})();
