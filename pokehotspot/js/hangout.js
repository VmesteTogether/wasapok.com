/* =============================================================================
   POKÉHOTSPOT — hangout.js
   Home, two zones:
     TOP  — a 3×2 grid of portrait cells (crisp artwork). Tap → cry + bounce;
            long-press → capsule menu. Empty slots show a faint + → quick-add.
     BOT  — a TILE-BASED top-down overworld (Emerald-style). Terrain is drawn on
            a canvas from a deterministic, endless map (grass · dirt-path grid ·
            trees · tall grass · flowers). A 4-way D-pad walks the party through
            it (hold to move); the party rides centre on animated Gen-5 sprites.
   ========================================================================== */
(() => {
  "use strict";
  const P = window.PH, { $, $$, SPRITE, HOME, spriteFallback, playCry, buzz, attachLongPress } = P;

  const LOCALES = [
    { id:"route",      name:"ROUTE&nbsp;1" },
    { id:"meadow",     name:"MEADOW" },
    { id:"beach",      name:"SEASIDE" },
    { id:"cave",       name:"CAVERN" },
    { id:"summit",     name:"SNOW&nbsp;SUMMIT" },
    { id:"pokecenter", name:"POKÉ&nbsp;CENTER" },
  ];
  let localeIdx = 0;

  // ---- persisted travel state ----------------------------------------------
  const DIST_KEY = "pokehotspot-dist", POS_KEY = "pokehotspot-pos";
  let dist = 0, worldX = 0, worldY = 0;
  try { dist = +localStorage.getItem(DIST_KEY) || 0; } catch {}
  try { const p = JSON.parse(localStorage.getItem(POS_KEY) || "null"); if (p) { worldX = p.x || 0; worldY = p.y || 0; } } catch {}
  const save = () => { try { localStorage.setItem(DIST_KEY, String(Math.round(dist)));
    localStorage.setItem(POS_KEY, JSON.stringify({ x: Math.round(worldX), y: Math.round(worldY) })); } catch {} };

  const todClass = () => { const h = new Date().getHours();
    return h < 5 ? "tod-night" : h < 8 ? "tod-dawn" : h < 17 ? "tod-day" : h < 20 ? "tod-dusk" : "tod-night"; };

  // ---- TOP: portrait grid (3×2) --------------------------------------------
  const renderGrid = () => {
    const grid = $("#partyGrid"); if (!grid) return;
    grid.innerHTML = [0,1,2,3,4,5].map(i => {
      const t = P.state.team[i], u = t && P.byId.get(t.id);
      if (!u) return `<button class="pg-cell empty" data-slot="${i}" type="button" aria-label="Add a Pokémon to slot ${i+1}"><span class="pg-plus" aria-hidden="true">+</span></button>`;
      return `<div class="pg-cell filled ${i===0?"lead":""}" data-slot="${i}" data-id="${u.id}" role="button" tabindex="0">
        ${i===0 ? `<span class="pg-lead" aria-hidden="true">★</span>` : ""}
        <img class="pg-art" src="${HOME(u.id)}" onerror="${spriteFallback(u.dexno)}" alt="${u.name}">
        <span class="pg-name">${u.name}</span>
      </div>`;
    }).join("");
    $$(".pg-cell", grid).forEach(cell => {
      const slot = +cell.dataset.slot;
      if (cell.classList.contains("empty")) { cell.onclick = () => openQuickAdd(slot); return; }
      const u = P.byId.get(+cell.dataset.id);
      attachLongPress(cell, () => P.openCap(slot),
        () => { playCry(u); cell.classList.remove("cry"); void cell.offsetWidth; cell.classList.add("cry"); buzz(10); });
    });
  };

  // ==========================================================================
  //  BOTTOM: the tile-based overworld
  // ==========================================================================
  const TS = 26;                      // tile size (css px)
  // per-locale palette (canvas colours)
  const PAL = {
    route:      { g:"#63b64a", g2:"#57a83f", p:"#d8b676", p2:"#c19a58", t:"#347a3a", t2:"#245427", fl:"#ff7a9c" },
    meadow:     { g:"#8ccf63", g2:"#74b74c", p:"#e6cf86", p2:"#cdb063", t:"#4f9440", t2:"#3a7030", fl:"#ffd24a" },
    beach:      { g:"#ecd9a0", g2:"#ddc784", p:"#d3b06a", p2:"#bd944e", t:"#7cae5c", t2:"#5f8f45", fl:"#ff8f6a" },
    cave:       { g:"#39344e", g2:"#2c2740", p:"#5a5170", p2:"#463f5c", t:"#241d33", t2:"#171226", fl:"#8f7fd0" },
    summit:     { g:"#e9f1fb", g2:"#d4e2f0", p:"#c1d3e6", p2:"#a9c0d8", t:"#9fb6cf", t2:"#87a0bb", fl:"#cfe0ef" },
    pokecenter: { g:"#f0c7d3", g2:"#e4afbf", p:"#f8e7ed", p2:"#eccdd8", t:"#dc92aa", t2:"#c47791", fl:"#ffffff" },
  };
  const pal = () => PAL[LOCALES[localeIdx].id] || PAL.route;

  // deterministic map — same coords always yield the same tile (endless world)
  const hash = (x, y) => { let h = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const isPath = (x, y) => (((x % 7) + 7) % 7) === 0 || (((y % 7) + 7) % 7) === 0;   // a dirt-path grid
  const tileAt = (x, y) => {
    if (isPath(x, y)) return "path";
    const r = hash(x, y);
    if (r < 0.05) return "tree";
    if (r < 0.12) return "tall";
    if (r < 0.15) return "flower";
    return "grass";
  };

  let mapCtx = null, dpr = 1;
  const setupCanvas = () => {
    const cv = $("#rsMap"), scene = $("#routeScene"); if (!cv || !scene) return;
    const w = scene.clientWidth, h = scene.clientHeight; if (!w || !h) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + "px"; cv.style.height = h + "px";
    mapCtx = cv.getContext("2d"); mapCtx.setTransform(dpr, 0, 0, dpr, 0, 0); mapCtx.imageSmoothingEnabled = false;
    drawMap();
  };

  const drawTile = (ctx, sx, sy, tx, ty, c) => {
    const type = tileAt(tx, ty), even = hash(tx * 1.7 + 2, ty * 1.3 + 5) < 0.5;
    if (type === "path") {
      ctx.fillStyle = c.p; ctx.fillRect(sx, sy, TS, TS);
      if (hash(tx + 9, ty + 4) < 0.4) { ctx.fillStyle = c.p2;
        ctx.fillRect(sx + ((hash(tx, ty) * (TS - 5)) | 0), sy + ((hash(ty, tx) * (TS - 5)) | 0), 3, 3); }
      return;
    }
    ctx.fillStyle = even ? c.g : c.g2; ctx.fillRect(sx, sy, TS, TS);                 // grass base
    ctx.fillStyle = even ? c.g2 : c.g;                                              // a fleck
    ctx.fillRect(sx + ((hash(tx + 1, ty + 2) * (TS - 4)) | 0), sy + ((hash(tx + 3, ty + 4) * (TS - 4)) | 0), 2, 2);
    if (type === "tall") { ctx.fillStyle = c.t;
      ctx.fillRect(sx + 4, sy + TS - 8, 2, 6); ctx.fillRect(sx + 9, sy + TS - 11, 2, 9);
      ctx.fillRect(sx + 14, sy + TS - 7, 2, 5); ctx.fillRect(sx + 19, sy + TS - 10, 2, 8); }
    else if (type === "flower") { const fx = sx + TS / 2, fy = sy + TS / 2; ctx.fillStyle = c.fl;
      ctx.fillRect(fx - 1, fy - 3, 3, 3); ctx.fillRect(fx - 3, fy - 1, 3, 3); ctx.fillRect(fx + 1, fy - 1, 3, 3); ctx.fillRect(fx - 1, fy + 1, 3, 3);
      ctx.fillStyle = "#ffe14a"; ctx.fillRect(fx - 1, fy - 1, 3, 3); }
    else if (type === "tree") {
      ctx.fillStyle = c.t2; ctx.beginPath(); ctx.ellipse(sx + TS / 2, sy + TS / 2 - 1, TS * 0.44, TS * 0.42, 0, 0, 7); ctx.fill();
      ctx.fillStyle = c.t;  ctx.beginPath(); ctx.ellipse(sx + TS / 2 - 1, sy + TS / 2 - 3, TS * 0.34, TS * 0.3, 0, 0, 7); ctx.fill(); }
  };

  const drawMap = () => {
    const ctx = mapCtx, cv = $("#rsMap"); if (!ctx || !cv) return;
    const w = cv.width / dpr, h = cv.height / dpr, c = pal();
    const baseTx = Math.floor(worldX / TS), baseTy = Math.floor(worldY / TS);
    const offX = worldX - baseTx * TS, offY = worldY - baseTy * TS;
    const cols = Math.ceil(w / TS) + 2, rows = Math.ceil(h / TS) + 2;
    ctx.clearRect(0, 0, w, h);
    for (let r = -1; r < rows; r++) for (let col = -1; col < cols; col++)
      drawTile(ctx, col * TS - offX, r * TS - offY, baseTx + col, baseTy + r, c);
  };

  // ---- the party (centred cluster of animated Gen-5 sprites) ----------------
  const G5A = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${id}.gif`;
  const G5  = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/${id}.png`;
  const routeSprite = u => [ G5A(u.id), G5(u.id), G5A(u.dexno), G5(u.dexno), SPRITE(u.id), SPRITE(u.dexno) ];
  const PARTY_SPOTS = [
    { x:50, y:66, s:1.00 }, { x:37, y:57, s:0.85 }, { x:63, y:57, s:0.85 },
    { x:44, y:47, s:0.72 }, { x:56, y:47, s:0.72 }, { x:50, y:39, s:0.62 },
  ];
  const renderParty = () => {
    const wrap = $("#rsParty"); if (!wrap) return;
    const units = P.teamUnits(), chains = units.map(routeSprite);
    wrap.innerHTML = units.map((u, order) => {
      const spot = PARTY_SPOTS[Math.min(order, 5)], px = Math.round(52 * spot.s), delay = (order * 0.13).toFixed(2);
      return `<div class="rs-mon" style="left:${spot.x}%;top:${spot.y}%;z-index:${Math.round(spot.y)}">
        ${u.slot === 0 ? `<span class="rs-lead" aria-hidden="true">★</span>` : ""}
        <img class="rs-spr" style="width:${px}px;height:${px}px;animation-delay:${delay}s" src="${chains[order][0]}" alt="${u.name}">
        <span class="rs-shadow" style="animation-delay:${delay}s"></span>
      </div>`;
    }).join("");
    $$(".rs-spr", wrap).forEach((img, i) => { let step = 0; const ch = chains[i];
      img.onerror = () => { step++; if (step < ch.length) img.src = ch[step]; else img.onerror = null; }; });
    const hint = $("#rsHint");
    if (hint) hint.innerHTML = units.length ? "HOLD ✛ TO WALK" : "TAP + ABOVE TO ADD YOUR SIX";
  };

  const applyScene = () => {
    const scene = $("#routeScene"); if (!scene) return;
    scene.dataset.loc = LOCALES[localeIdx].id;
    scene.classList.remove("tod-dawn","tod-day","tod-dusk","tod-night");
    scene.classList.add(todClass());
    $("#localeName").innerHTML = LOCALES[localeIdx].name;
    drawMap();
  };

  // ---- movement loop (runs only while a direction is held) ------------------
  const DIRV = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] };
  let moveDir = null, running = false, lastSave = 0;
  const frame = (t) => {
    const stage = $("#stage"), cv = $("#rsMap");
    if (!stage || stage.hidden || !cv) { running = false; return; }
    if (moveDir && DIRV[moveDir]) {
      const [dx, dy] = DIRV[moveDir], sp = 1.7;
      // trees are decorative — nothing blocks the party; the world always advances
      worldX += dx * sp; worldY += dy * sp; dist += sp;
      drawMap();
      const d = $("#rsDist"); if (d && d.firstChild) d.firstChild.textContent = (dist / 1400).toFixed(1);
      if (t - lastSave > 3000) { lastSave = t; save(); }
    }
    if (moveDir) requestAnimationFrame(frame); else running = false;
  };
  const startLoop = () => { if (running) return; const stage = $("#stage");
    if (!stage || stage.hidden) return; running = true; lastSave = performance.now(); requestAnimationFrame(frame); };

  const setDir = (dir) => {
    moveDir = dir;
    const p = $("#rsParty"); if (p) p.classList.toggle("walking", !!dir);
    if (dir) { buzz(4); const h = $("#rsHint"); if (h) h.classList.add("gone"); startLoop(); }
    else save();
  };
  const clearDir = () => { setDir(null); $$(".dp", $("#rsDpad")).forEach(b => b.classList.remove("on")); };

  // ---- quick-add overlay (tap a + on the grid) -----------------------------
  let qaSlot = 0, qaq = "";
  const QA_CAP = 60;
  const openQuickAdd = (slot) => { qaSlot = slot; qaq = "";
    $("#qaSlot").textContent = slot + 1; $("#qaSearch").value = ""; renderQaResults();
    P.openOverlay("#quickAdd"); setTimeout(() => $("#qaSearch").focus(), 120); };
  const renderQaResults = () => {
    const nq = P.norm(qaq);
    let list = nq ? P.DEX.filter(u => u.key.includes(nq) || String(u.dexno).includes(nq)) : P.DEX;
    list = list.slice(0, QA_CAP);
    const onTeam = new Set(P.state.team.filter(Boolean).map(t => t.id));
    $("#qaResults").innerHTML = list.map(u =>
      `<button class="qa-row ${onTeam.has(u.id) ? "in" : ""}" data-id="${u.id}" ${onTeam.has(u.id) ? "disabled" : ""}>
        <img src="${SPRITE(u.id)}" onerror="${spriteFallback(u.dexno)}" alt="">
        <span class="qa-nm">${u.name}</span>${P.typeChips(u)}
        <span class="qa-add">${onTeam.has(u.id) ? "✓" : "+"}</span></button>`).join("")
      || `<div class="mp-empty">No species match.</div>`;
  };

  // ---- wiring ---------------------------------------------------------------
  const render = () => { applyScene(); renderGrid(); renderParty(); setupCanvas();
    const d = $("#rsDist"); if (d && d.firstChild) d.firstChild.textContent = (dist / 1400).toFixed(1);
    startLoop(); };

  const wire = () => {
    // D-pad — hold a direction to walk
    const dpad = $("#rsDpad");
    dpad.addEventListener("pointerdown", e => { const b = e.target.closest(".dp[data-dir]"); if (!b) return;
      e.preventDefault(); $$(".dp", dpad).forEach(x => x.classList.remove("on")); b.classList.add("on"); setDir(b.dataset.dir); });
    dpad.addEventListener("pointerenter", e => { if (!moveDir) return; const b = e.target.closest(".dp[data-dir]"); }, true);
    addEventListener("pointerup", clearDir);
    addEventListener("pointercancel", clearDir);
    dpad.addEventListener("pointerleave", clearDir);
    // keyboard arrows (desktop)
    addEventListener("keydown", e => { const s = $("#stage"); if (!s || s.hidden) return;
      const k = { ArrowUp:"up", ArrowDown:"down", ArrowLeft:"left", ArrowRight:"right" }[e.key]; if (k) { e.preventDefault(); if (moveDir !== k) setDir(k); } });
    addEventListener("keyup", e => { if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) clearDir(); });

    // locale
    $("#localeTab").addEventListener("click", () => {
      localeIdx = (localeIdx + 1) % LOCALES.length;
      try { localStorage.setItem("pokehotspot-locale", LOCALES[localeIdx].id); } catch {}
      applyScene(); buzz(8);
    });
    setInterval(() => { const s = $("#routeScene"); if (s && !s.classList.contains(todClass())) applyScene(); }, 60000);
    addEventListener("resize", () => { const s = $("#stage"); if (s && !s.hidden) setupCanvas(); });

    // quick-add
    $("#qaSearch").addEventListener("input", e => { qaq = e.target.value; renderQaResults(); });
    $("#qaClear").addEventListener("click", () => { $("#qaSearch").value = ""; qaq = ""; renderQaResults(); });
    $("#qaClose").addEventListener("click", () => P.closeOverlay("#quickAdd"));
    $("#quickAdd").addEventListener("click", e => { if (e.target.id === "quickAdd") P.closeOverlay("#quickAdd"); });
    $("#qaResults").addEventListener("click", e => {
      const row = e.target.closest(".qa-row"); if (!row || row.disabled) return;
      const id = +row.dataset.id;
      if (P.state.team.some(t => t && t.id === id)) return;
      P.setSlot(qaSlot, id); buzz(16); P.closeOverlay("#quickAdd");
    });
  };

  P.on("ready", () => {
    const saved = P.state.locale || "route";
    const i = LOCALES.findIndex(l => l.id === saved); localeIdx = i >= 0 ? i : 0;
    wire(); render();
  });
  P.on("team", () => { renderGrid(); renderParty(); });
  P.on("home", () => { render(); });
})();
