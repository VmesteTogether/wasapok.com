/* =============================================================================
   POKÉHOTSPOT — dex.js
   The omniscient poke-device. Browse/search/region-filter the whole dex; the
   focused species shows on a spotlight "screen" (tap → cry); OPEN reveals the
   full catch/stat/matchup readout (core's shared info sheet).
   ========================================================================== */
(() => {
  "use strict";
  const P = window.PH, { $, SPRITE, HOME, spriteFallback, norm, buzz } = P;

  const REG_SHORT = { 1:"KAN", 2:"JOH", 3:"HOE", 4:"SIN", 5:"UNO", 6:"KAL", 7:"ALO", 8:"GAL", 9:"PAL" };
  const CAP = 140;
  let built = false, region = 0, query = "", focus = null;

  const baseSet = () => {
    let list = P.DEX;
    if (region) list = list.filter(u => (P.REGION_OF.get(u.dexno) || []).includes(region));
    const nq = norm(query);
    if (nq) list = list.filter(u => u.key.includes(nq) || String(u.dexno).includes(nq));
    return list;
  };

  const setFocus = (u) => {
    focus = u; if (!u) return;
    const inTeam = P.state.team.some(t => t && t.id === u.id);
    const regs = P.REGION_OF.get(u.dexno) || [];
    $("#dxsSpr").src = HOME(u.id); $("#dxsSpr").setAttribute("onerror", spriteFallback(u.dexno));
    $("#dxsNo").textContent = `Nº ${String(u.dexno).padStart(4,"0")} · GEN ${P.ROMAN[u.gen-1]}`;
    $("#dxsName").textContent = u.name;
    $("#dxsTypes").innerHTML = P.typeChips(u);
    $("#dxsRegs").innerHTML = regs.length
      ? regs.map(g => `<span class="dxs-reg">${REG_SHORT[g]}</span>`).join("")
      : `<span class="dxs-reg none">NOT A WILD CATCH</span>`;
    const fileBtn = $("#dxsFile");
    fileBtn.disabled = inTeam || P.partyCount() >= 6;
    fileBtn.textContent = inTeam ? "✓ ON TEAM" : (P.partyCount() >= 6 ? "TEAM FULL" : "▸ FILE");
    // reflect the focused row
    P.$$(".dex-row", $("#dexList")).forEach(r => r.classList.toggle("on", +r.dataset.id === u.id));
  };

  const render = () => {
    const list = baseSet();
    const rows = list.slice(0, CAP);
    const wrap = $("#dexList");
    wrap.innerHTML = rows.map(u => {
      const inTeam = P.state.team.some(t => t && t.id === u.id);
      const regs = P.REGION_OF.get(u.dexno) || [];
      return `<button class="dex-row ${inTeam?"inteam":""}" data-id="${u.id}">
        <img class="dxr-spr" loading="lazy" src="${SPRITE(u.id)}" onerror="${spriteFallback(u.dexno)}" alt="">
        <div class="dxr-main">
          <div class="dxr-name">${u.name}</div>
          <div class="dxr-sub"><span class="dxr-no">Nº${String(u.dexno).padStart(4,"0")}</span>${P.typeChips(u)}</div>
        </div>
        <span class="dxr-regdots">${regs.slice(0,3).map(()=>`<i class="dxr-dot"></i>`).join("")}</span>
      </button>`;
    }).join("") || `<div class="mp-empty">No species match.</div>`;
    $("#dexFoot").textContent = list.length > CAP
      ? `showing ${CAP} of ${list.length} — refine search or region`
      : `${list.length} ${region?REG_SHORT[region]+" ":""}${list.length===1?"entry":"entries"}`;
    // keep spotlight coherent
    if (!focus || !list.some(u => u.id === focus.id)) setFocus(rows[0] || focus);
    else setFocus(focus);
  };

  const buildChips = () => {
    const chips = [`<button class="dchip ${region===0?"sel":""}" data-r="0">ALL</button>`]
      .concat(Object.keys(REG_SHORT).map(g =>
        `<button class="dchip ${+g===region?"sel":""}" data-r="${g}">${REG_SHORT[g]}</button>`));
    $("#dexChips").innerHTML = chips.join("");
  };

  const build = (container) => {
    container.innerHTML = `
      <div class="dex-screen">
        <span class="dxs-scanline" aria-hidden="true"></span>
        <button class="dxs-figure" id="dxsFigure" title="Cry">
          <img class="dxs-spr" id="dxsSpr" src="" alt="">
          <span class="dxs-cryhint">◂ TAP · CRY ▸</span>
        </button>
        <div class="dxs-meta">
          <div class="dxs-no" id="dxsNo">—</div>
          <div class="dxs-name" id="dxsName">—</div>
          <div class="dxs-types" id="dxsTypes"></div>
          <div class="dxs-regs" id="dxsRegs"></div>
          <div class="dxs-acts">
            <button class="dxs-btn primary" id="dxsFile">▸ FILE</button>
            <button class="dxs-btn" id="dxsOpen">◎ OPEN</button>
          </div>
        </div>
      </div>
      <div class="dex-controls">
        <div class="field"><span class="si-glyph" aria-hidden="true"></span>
          <input id="dexSearch" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="FIND ANY POKÉMON — NAME / Nº">
          <button class="si-clear" id="dexClear" aria-label="Clear">&times;</button></div>
        <div class="dex-chips" id="dexChips"></div>
      </div>
      <div class="dex-list scroll" id="dexList"></div>
      <div class="dex-foot" id="dexFoot"></div>`;

    buildChips();

    $("#dexChips").addEventListener("click", e => { const c = e.target.closest(".dchip"); if (!c) return;
      region = +c.dataset.r; buildChips(); render(); buzz(6); });
    $("#dexSearch").addEventListener("input", e => { query = e.target.value; render(); });
    $("#dexClear").addEventListener("click", () => { $("#dexSearch").value=""; query=""; render(); });

    const list = $("#dexList");
    list.addEventListener("click", e => { const r = e.target.closest(".dex-row"); if (!r) return;
      const u = P.byId.get(+r.dataset.id); setFocus(u); buzz(6); });
    // long-press a row = quick-file
    let lpTimer, lpMoved;
    list.addEventListener("touchstart", e => { const r = e.target.closest(".dex-row"); if (!r) return;
      lpMoved = false; lpTimer = setTimeout(() => { if (lpMoved) return; const u = P.byId.get(+r.dataset.id);
        if (P.addUnit(u.id)) { buzz(20); r.classList.add("inteam"); render(); } }, 450); }, { passive:true });
    list.addEventListener("touchmove", () => { lpMoved = true; clearTimeout(lpTimer); }, { passive:true });
    list.addEventListener("touchend", () => clearTimeout(lpTimer));

    $("#dxsFigure").addEventListener("click", () => { if (!focus) return;
      P.playCry(focus); const f = $("#dxsFigure"); f.classList.remove("dxs-cry"); void f.offsetWidth; f.classList.add("dxs-cry"); buzz(10); });
    $("#dxsOpen").addEventListener("click", () => focus && P.openInfo(focus));
    $("#dxsFile").addEventListener("click", () => { if (focus && P.addUnit(focus.id)) { setFocus(focus); render(); buzz(14); } });

    built = true;
  };

  P.stations.dex = {
    title: "DEX",
    open(container) {
      if (!built) build(container);
      if (!focus) { const pool = P.DEX.slice(0, 151); focus = pool[Math.floor(Math.random()*pool.length)]; }
      render();
    },
  };
  P.on("team", () => { if (built && !$("#station-dex").hidden) render(); });
})();
