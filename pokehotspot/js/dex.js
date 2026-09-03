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
  // picker state — the row centred under the glass lens is the live focus
  let rowsCache = [], rowEls = [], rowH = 54, rowStep = 59, padY = 0, curIdx = -1, magRow = null, ticking = false;

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
    // instant: the small list sprite is already cached, so the spotlight tracks
    // the scroll in real time; upgrade to the crisp HOME render once it loads
    const spr = $("#dxsSpr");
    spr.style.imageRendering = "pixelated";
    spr.src = SPRITE(u.id); spr.setAttribute("onerror", spriteFallback(u.dexno));
    const hi = new Image();
    hi.onload = () => { if (focus && focus.id === u.id) { spr.src = HOME(u.id); spr.style.imageRendering = "auto"; } };
    hi.src = HOME(u.id);
    $("#dxsNo").textContent = `Nº ${String(u.dexno).padStart(4,"0")} · GEN ${P.ROMAN[u.gen-1]}`;
    $("#dxsName").textContent = u.name;
    $("#dxsTypes").innerHTML = P.typeChips(u);
    $("#dxsRegs").innerHTML = regs.length
      ? regs.map(g => `<span class="dxs-reg">${REG_SHORT[g]}</span>`).join("")
      : `<span class="dxs-reg none">NOT A WILD CATCH</span>`;
    const fileBtn = $("#dxsFile");
    fileBtn.disabled = inTeam || P.partyCount() >= 6;
    fileBtn.textContent = inTeam ? "✓ ON TEAM" : (P.partyCount() >= 6 ? "TEAM FULL" : "▸ FILE");
  };

  // ---- picker: scroll the list, the centred row lands under the lens and
  // fills the spotlight live (no click needed). ------------------------------
  const measure = () => {
    const listEl = $("#dexList"); if (!listEl) return;
    rowEls = [...listEl.querySelectorAll(".dex-row")];
    rowH = rowEls.length ? (rowEls[0].offsetHeight || rowH) : rowH;
    padY = Math.max(0, listEl.clientHeight / 2 - rowH / 2);
    listEl.style.paddingTop = padY + "px";
    listEl.style.paddingBottom = padY + "px";
  };
  // read live layout (offsetTop) so centring is exact regardless of measure timing
  const rowCenter = i => rowEls[i].offsetTop + rowEls[i].offsetHeight / 2;
  const centeredIndex = () => {
    const listEl = $("#dexList"); if (!rowEls.length) return 0;
    const centerY = listEl.scrollTop + listEl.clientHeight / 2;
    const step = rowEls[1] ? (rowCenter(1) - rowCenter(0)) : rowEls[0].offsetHeight + 5;
    const idx = Math.round((centerY - rowCenter(0)) / step);
    return Math.max(0, Math.min(rowsCache.length - 1, idx));
  };
  const focusIndex = (idx) => {
    if (!rowsCache.length) return;
    idx = Math.max(0, Math.min(rowsCache.length - 1, idx));
    curIdx = idx;
    setFocus(rowsCache[idx]);
    if (magRow) magRow.classList.remove("mag");
    magRow = rowEls[idx] || null;
    if (magRow) magRow.classList.add("mag");
  };
  const scrollToIndex = (idx, smooth) => {
    const listEl = $("#dexList"); if (!rowEls[idx]) return;
    const top = rowCenter(idx) - listEl.clientHeight / 2;
    listEl.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
  };
  const onScroll = () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => { ticking = false;
      const idx = centeredIndex();
      if (idx !== curIdx) { focusIndex(idx); buzz(3); }
    });
  };

  const render = () => {
    const list = baseSet();
    rowsCache = list.slice(0, CAP);
    const wrap = $("#dexList");
    wrap.innerHTML = rowsCache.map(u => {
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
    // measure the fresh rows, then centre the lens on the focused (or first)
    // species so the spotlight stays coherent
    magRow = null; curIdx = -1;
    measure();
    if (rowsCache.length) {
      let target = 0;
      if (focus) { const i = rowsCache.findIndex(u => u.id === focus.id); if (i >= 0) target = i; }
      scrollToIndex(target, false);
      focusIndex(target);
    } else setFocus(focus);
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
      <div class="dex-listwrap">
        <div class="dex-list scroll" id="dexList"></div>
        <div class="dex-lens" aria-hidden="true"><span class="dxl-caret l">&lsaquo;</span><span class="dxl-caret r">&rsaquo;</span></div>
      </div>
      <div class="dex-foot" id="dexFoot"></div>`;

    buildChips();

    $("#dexChips").addEventListener("click", e => { const c = e.target.closest(".dchip"); if (!c) return;
      region = +c.dataset.r; buildChips(); render(); buzz(6); });
    $("#dexSearch").addEventListener("input", e => { query = e.target.value; render(); });
    $("#dexClear").addEventListener("click", () => { $("#dexSearch").value=""; query=""; render(); });

    const list = $("#dexList");
    list.addEventListener("scroll", onScroll, { passive: true });
    // tap a row → glide it up to the lens (which then focuses it live)
    list.addEventListener("click", e => { const r = e.target.closest(".dex-row"); if (!r) return;
      const i = rowEls.indexOf(r); if (i >= 0) { scrollToIndex(i, true); buzz(6); } });
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
      render();   // lands on the top of the index (or the last-focused species)
    },
  };
  P.on("team", () => { if (built && !$("#station-dex").hidden) render(); });
})();
