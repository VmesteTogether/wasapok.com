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

  let DEX = [];
  const byId = new Map();
  let party = [null, null, null, null, null, null];
  let activeSlot = -1;   // slot whose readout is shown in the console
  let targetSlot = -1;   // slot currently being filled from search
  let genFilter = 0;     // 0 = ALL, else 1..9

  // ---------------------------------------------------------------- audio ---
  let actx = null;
  const ensureAudio = () => {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; } }
    if (actx && actx.state === "suspended") actx.resume().catch(() => {});
    return actx;
  };
  const blip = (freq = 660, dur = 0.07, type = "square", vol = 0.05) => {
    const c = ensureAudio(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(vol, c.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination);
    o.start(); o.stop(c.currentTime + dur + 0.02);
  };
  const sfx = {
    open:   () => blip(520, 0.06, "square", 0.045),
    select: () => blip(720, 0.06, "square", 0.05),
    add:    () => { blip(880, 0.06, "square", 0.05); setTimeout(() => blip(1180, 0.09, "square", 0.05), 55); },
    clear:  () => blip(300, 0.10, "sawtooth", 0.04),
    tick:   () => blip(1040, 0.03, "square", 0.03),
  };

  // ------------------------------------------------------------ parallax ----
  let gyroAsked = false;
  const requestGyro = () => {
    if (gyroAsked) return; gyroAsked = true;
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === "function") D.requestPermission().catch(() => {});
  };
  const firstTouchUnlock = () => { ensureAudio(); requestGyro(); };

  const initTactile = () => {
    const phone = $("#phone"), root = document.documentElement;
    let raf = 0, tx = 0, ty = 0, cx = 0, cy = 0;
    const clamp = (v, m) => Math.max(-m, Math.min(m, v));
    const step = () => {
      cx += (tx - cx) * 0.12; cy += (ty - cy) * 0.12;
      root.style.setProperty("--px", cx.toFixed(2) + "px");
      root.style.setProperty("--py", cy.toFixed(2) + "px");
      raf = (Math.abs(tx - cx) > 0.08 || Math.abs(ty - cy) > 0.08) ? requestAnimationFrame(step) : 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(step); };
    phone.addEventListener("pointermove", e => {
      const r = phone.getBoundingClientRect();
      tx = clamp(((e.clientX - r.left) / r.width - 0.5) * 20, 11);
      ty = clamp(((e.clientY - r.top) / r.height - 0.5) * 20, 11);
      kick();
    }, { passive: true });
    phone.addEventListener("pointerleave", () => { tx = 0; ty = 0; kick(); });
    window.addEventListener("deviceorientation", e => {
      if (e.gamma == null) return;
      tx = clamp(e.gamma * 0.55, 11);
      ty = clamp((e.beta - 42) * 0.45, 11);
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
       <span class="stat-val">${v}</span>
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
             <span class="stat-val">${u.bst}</span>
           </div>
           <div class="stat-track-note">BASE STATS // ANALYSIS MODULE PENDING &mdash; v0.1</div>
         </div>
       </div>`;
    // sweep the gauges in from 0
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.querySelectorAll(".stat-fill").forEach(f => { f.style.width = f.dataset.w + "%"; });
    }));
  };

  const selectSlot = (i) => {
    if (party[i] == null) return;
    activeSlot = i;
    renderLoadout();
    renderConsole();
    sfx.select();
  };

  const clearSlot = (i) => {
    party[i] = null; saveParty();
    if (activeSlot === i) activeSlot = party.findIndex(x => x != null);
    renderLoadout(); renderConsole(); updateCount();
    sfx.clear();
  };

  const assignSlot = (i, id) => {
    party[i] = id; saveParty();
    activeSlot = i;
    renderLoadout(); renderConsole(); updateCount();
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
    // loadout: add (empty) / select (filled) / clear (x)
    $("#loadout").addEventListener("click", e => {
      firstTouchUnlock();
      const x = e.target.closest(".cap-x");
      if (x) { e.stopPropagation(); clearSlot(+x.dataset.x); return; }
      const cap = e.target.closest(".cap");
      if (!cap) return;
      const i = +cap.dataset.slot;
      if (party[i] == null) openSearch(i); else selectSlot(i);
    });

    // console: swap
    $("#console").addEventListener("click", e => {
      const s = e.target.closest(".swap-btn");
      if (s) { firstTouchUnlock(); openSearch(+s.dataset.swap); }
    });

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
    loadParty();
    buildGenChips();
    renderLoadout();
    renderConsole();
    updateCount();
    wireEvents();
    initTactile();
    clockTick();
  }

  boot();
})();
