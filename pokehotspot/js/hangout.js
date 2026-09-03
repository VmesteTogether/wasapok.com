/* =============================================================================
   POKÉHOTSPOT — hangout.js
   The living diorama home. Renders your six as billboarded, idle-bobbing sprites
   in a selectable locale under a day/night sky. Tap a 'mon → hop + cry;
   long-press → capsule menu.
   ========================================================================== */
(() => {
  "use strict";
  const P = window.PH, { $, SPRITE, spriteFallback, playCry, buzz, attachLongPress } = P;

  const LOCALES = [
    { id:"route",      name:"ROUTE 1" },
    { id:"meadow",     name:"MEADOW" },
    { id:"beach",      name:"SEASIDE" },
    { id:"cave",       name:"CAVERN" },
    { id:"summit",     name:"SNOW SUMMIT" },
    { id:"pokecenter", name:"POKÉ CENTER" },
  ];
  // feet-anchored spots (x%, y% within the scene; scale). Three depth tiers spread
  // across the field so the six fill the screen; lead sits biggest, front-centre.
  const SPOTS = [
    { x:50, y:95, s:1.30 },   // lead — front centre
    { x:18, y:88, s:1.08 },   // front left
    { x:82, y:88, s:1.08 },   // front right
    { x:31, y:71, s:0.96 },   // mid left
    { x:69, y:71, s:0.96 },   // mid right
    { x:50, y:53, s:0.82 },   // back centre — near the horizon
  ];

  const todClass = () => {
    const h = new Date().getHours();
    return h < 5 ? "tod-night" : h < 8 ? "tod-dawn" : h < 17 ? "tod-day" : h < 20 ? "tod-dusk" : "tod-night";
  };
  const todLabel = () => {
    const c = todClass();
    return c === "tod-dawn" ? "☀ DAWN" : c === "tod-day" ? "☀ DAY" : c === "tod-dusk" ? "☾ DUSK" : "☾ NIGHT";
  };

  let localeIdx = 0;

  const buildAmbient = (stage) => {
    // sun/moon + a couple of drifting clouds (kept once)
    if (stage.querySelector(".stage-orb")) return;
    const sky = $("#stageSky");
    const orb = document.createElement("div"); orb.className = "stage-orb"; sky.appendChild(orb);
    for (let i = 0; i < 3; i++) {
      const c = document.createElement("div"); c.className = "cloud";
      c.style.top = (14 + i * 16) + "px";
      c.style.width = (34 + i * 12) + "px";
      c.style.animationDuration = (26 + i * 10) + "s";
      c.style.animationDelay = (-i * 8) + "s";
      c.style.opacity = .8 - i * .18;
      sky.appendChild(c);
    }
  };

  const render = () => {
    const stage = $("#stage"), scene = $("#stageScene");
    const loc = LOCALES[localeIdx];
    stage.dataset.loc = loc.id;
    stage.classList.remove("tod-dawn","tod-day","tod-dusk","tod-night");
    stage.classList.add(todClass());
    $("#localeName").textContent = loc.name;
    buildAmbient(stage);

    // time chip (create once)
    let tc = stage.querySelector(".time-chip");
    if (!tc) { tc = document.createElement("div"); tc.className = "time-chip"; stage.appendChild(tc); }
    tc.textContent = todLabel();

    const units = P.teamUnits();               // resolved, with .slot
    $("#stageEmpty").hidden = units.length > 0;

    // place by SPOT index in party order (lead first). Only render filled slots.
    scene.innerHTML = "";
    const ordered = P.state.team.map((t,i)=>({t,i})).filter(o=>o.t);
    ordered.forEach((o, order) => {
      const u = P.byId.get(o.t.id); if (!u) return;
      const spot = SPOTS[Math.min(order, SPOTS.length-1)];
      const mon = document.createElement("div");
      mon.className = "mon";
      mon.style.left = spot.x + "%";
      mon.style.top = spot.y + "%";
      mon.style.zIndex = Math.round(spot.y);
      const px = Math.round(82 * spot.s);
      mon.innerHTML = `
        <span class="cry-ring" aria-hidden="true"></span>
        ${o.i === 0 ? `<span class="mon-lead" aria-hidden="true">★</span>` : ""}
        <img class="mon-spr" style="width:${px}px;height:${px}px"
             src="${SPRITE(u.id)}" onerror="${spriteFallback(u.dexno)}" alt="${u.name}">
        <span class="mon-shadow" style="animation-delay:${order*0.3}s"></span>`;
      // stagger idle bob so the group feels alive
      const spr = mon.querySelector(".mon-spr"), sh = mon.querySelector(".mon-shadow");
      spr.style.animationDelay = (order * 0.28) + "s";
      sh.style.animationDelay = (order * 0.28) + "s";

      const hop = () => {
        mon.classList.remove("hop"); void mon.offsetWidth; mon.classList.add("hop");
        playCry(u); buzz(12);
      };
      attachLongPress(mon, () => P.openCap(o.i), hop);
      scene.appendChild(mon);
    });
  };

  const wire = () => {
    $("#localeTab").addEventListener("click", () => {
      localeIdx = (localeIdx + 1) % LOCALES.length;
      try { localStorage.setItem("pokehotspot-locale", LOCALES[localeIdx].id); } catch {}
      buzz(8); render();
    });
    // refresh the sky as real time rolls over
    setInterval(() => { const st = $("#stage");
      if (!st.classList.contains(todClass())) render(); }, 60000);
  };

  P.on("ready", () => {
    const saved = P.state.locale || "route";
    const i = LOCALES.findIndex(l => l.id === saved);
    localeIdx = i >= 0 ? i : 0;
    wire(); render();
  });
  P.on("team", render);
  P.on("home", render);
  P.on("palette", () => { /* palette drives tokens via CSS; ring colour follows */ });
})();
