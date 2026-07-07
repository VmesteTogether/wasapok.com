/* ARE MY POKÉMON GOOD? — Orre Team Inspection Bureau */
"use strict";

// ---------------------------------------------------------------- type chart
// CHART[attacking][defending] = multiplier (missing = 1)
const TYPES = ["normal","fire","water","electric","grass","ice","fighting","poison",
  "ground","flying","psychic","bug","rock","ghost","dragon","dark","steel","fairy"];

const CHART = {
  normal:   { rock:.5, steel:.5, ghost:0 },
  fire:     { grass:2, ice:2, bug:2, steel:2, fire:.5, water:.5, rock:.5, dragon:.5 },
  water:    { fire:2, ground:2, rock:2, water:.5, grass:.5, dragon:.5 },
  electric: { water:2, flying:2, electric:.5, grass:.5, dragon:.5, ground:0 },
  grass:    { water:2, ground:2, rock:2, fire:.5, grass:.5, poison:.5, flying:.5, bug:.5, dragon:.5, steel:.5 },
  ice:      { grass:2, ground:2, flying:2, dragon:2, fire:.5, water:.5, ice:.5, steel:.5 },
  fighting: { normal:2, ice:2, rock:2, dark:2, steel:2, poison:.5, flying:.5, psychic:.5, bug:.5, fairy:.5, ghost:0 },
  poison:   { grass:2, fairy:2, poison:.5, ground:.5, rock:.5, ghost:.5, steel:0 },
  ground:   { fire:2, electric:2, poison:2, rock:2, steel:2, grass:.5, bug:.5, flying:0 },
  flying:   { grass:2, fighting:2, bug:2, electric:.5, rock:.5, steel:.5 },
  psychic:  { fighting:2, poison:2, psychic:.5, steel:.5, dark:0 },
  bug:      { grass:2, psychic:2, dark:2, fire:.5, fighting:.5, poison:.5, flying:.5, ghost:.5, steel:.5, fairy:.5 },
  rock:     { fire:2, ice:2, flying:2, bug:2, fighting:.5, ground:.5, steel:.5 },
  ghost:    { psychic:2, ghost:2, dark:.5, normal:0 },
  dragon:   { dragon:2, steel:.5, fairy:0 },
  dark:     { psychic:2, ghost:2, fighting:.5, dark:.5, fairy:.5 },
  steel:    { ice:2, rock:2, fairy:2, fire:.5, water:.5, electric:.5, steel:.5 },
  fairy:    { fighting:2, dragon:2, dark:2, fire:.5, poison:.5, steel:.5 },
};

function effOn(atk, def1, def2) {
  const m1 = CHART[atk][def1] ?? 1;
  const m2 = def2 ? (CHART[atk][def2] ?? 1) : 1;
  return m1 * m2;
}

// ---------------------------------------------------------------- names
const NAME_FIX = {
  "mr-mime":"Mr. Mime","mr-rime":"Mr. Rime","mime-jr":"Mime Jr.","ho-oh":"Ho-Oh",
  "porygon-z":"Porygon-Z","farfetchd":"Farfetch'd","sirfetchd":"Sirfetch'd",
  "type-null":"Type: Null","nidoran-f":"Nidoran F","nidoran-m":"Nidoran M",
  "flabebe":"Flabébé","jangmo-o":"Jangmo-o","hakamo-o":"Hakamo-o","kommo-o":"Kommo-o",
  "wo-chien":"Wo-Chien","chien-pao":"Chien-Pao","ting-lu":"Ting-Lu","chi-yu":"Chi-Yu",
  "mr-mime-galar":"Galarian Mr. Mime",
};
function cap(w){ return w.charAt(0).toUpperCase() + w.slice(1); }
function prettyName(ident) {
  if (NAME_FIX[ident]) return NAME_FIX[ident];
  let m;
  if ((m = ident.match(/^(.+)-mega(-x|-y|-z)?$/)))
    return "Mega " + prettyName(m[1]) + (m[2] ? " " + m[2].slice(1).toUpperCase() : "");
  if ((m = ident.match(/^(.+)-alola$/)))  return "Alolan " + prettyName(m[1]);
  if ((m = ident.match(/^(.+)-galar$/)))  return "Galarian " + prettyName(m[1]);
  if ((m = ident.match(/^(.+)-hisui$/)))  return "Hisuian " + prettyName(m[1]);
  if ((m = ident.match(/^(.+)-paldea(-.+)?$/)))
    return "Paldean " + prettyName(m[1]) + (m[2] ? " (" + m[2].slice(1).replace(/-/g," ") + ")" : "");
  return ident.split("-").map(cap).join(" ");
}

// ---------------------------------------------------------------- data + state
const SPRITE = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
const STAT_LABELS = ["HP","ATK","DEF","SPA","SPD","SPE"];
const STORE_KEY = "ampg-party-v1";

let DEX = [];           // [{id, ident, name, t1, t2, stats, dexno}]
let byId = new Map();
let party = [null,null,null,null,null,null];   // {id, alias} | null
let audioCtx = null;

async function boot() {
  const res = await fetch("data/pokedex.json");
  const raw = await res.json();
  DEX = raw.map(r => ({ id:r[0], ident:r[1], name:prettyName(r[1]), t1:r[2], t2:r[3], stats:r[4], dexno:r[5] }));
  // default forms first so plain names win ties in search
  DEX.sort((a,b) => a.id - b.id);
  DEX.forEach(p => byId.set(p.id, p));
  loadParty();
  renderAll();
}

function loadParty() {
  const h = location.hash.match(/p=([\d.]+)/);
  if (h) {
    const ids = h[1].split(".").map(Number);
    ids.slice(0,6).forEach((id,i) => { if (byId.has(id)) party[i] = { id, alias:"" }; });
    saveParty();
    return;
  }
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (Array.isArray(saved)) saved.slice(0,6).forEach((m,i) => {
      if (m && byId.has(m.id)) party[i] = { id:m.id, alias:m.alias || "" };
    });
  } catch (e) {}
}
function saveParty() {
  localStorage.setItem(STORE_KEY, JSON.stringify(party));
  history.replaceState(null, "", location.pathname + location.search); // keep URL clean after import
}

// ---------------------------------------------------------------- stamp thud
function thud() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + .12);
    g.gain.setValueAtTime(.18, t);
    g.gain.exponentialRampToValueAtTime(.001, t + .16);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t); osc.stop(t + .18);
    const buf = audioCtx.createBuffer(1, 2205, 44100);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/d.length, 3);
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const ng = audioCtx.createGain(); ng.gain.value = .1;
    const lp = audioCtx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
    src.connect(lp).connect(ng).connect(audioCtx.destination);
    src.start(t);
  } catch (e) {}
}

// ---------------------------------------------------------------- party UI
const partyEl = document.getElementById("party");

function typeBadge(t, small) {
  return `<span class="type-badge t-${t}">${t.toUpperCase()}</span>`;
}

function archetype(s) {
  const [hp, atk, def, spa, spd, spe] = s;
  const off = Math.max(atk, spa);
  const phys = atk >= spa;
  const bulkP = hp * def, bulkS = hp * spd;
  const bst = s.reduce((a,b) => a+b, 0);
  if (off >= 100 && spe >= 100) return phys ? "PHYS. SWEEPER" : "SPEC. SWEEPER";
  if (atk >= 100 && spa >= 100) return "MIXED ATTACKER";
  if (off >= 115) return phys ? "WALLBREAKER" : "SPEC. BREAKER";
  if (bulkP >= 9000 && bulkS >= 9000) return "FORTRESS";
  if (bulkP >= 8200) return "PHYSICAL WALL";
  if (bulkS >= 8200) return "SPECIAL WALL";
  if (spe >= 110) return "SCOUT";
  if (off >= 95) return phys ? "PHYS. ATTACKER" : "SPEC. ATTACKER";
  if (hp >= 85 && def >= 65 && spd >= 65) return "BULKY PIVOT";
  if (bst < 430) return "IN TRAINING";
  return "ALL-ROUNDER";
}

function renderParty() {
  partyEl.innerHTML = "";
  const tilts = [-0.7, 0.5, -0.4, 0.6, -0.5, 0.4];
  party.forEach((m, i) => {
    const slot = document.createElement("div");
    slot.className = "slot";
    if (!m) {
      slot.innerHTML = `
        <div class="slot-empty">
          <span class="slot-vacant-tag">SLOT ${i+1} — VACANT</span>
          <input class="slot-input" type="text" placeholder="type a pokémon name…"
                 autocomplete="off" spellcheck="false" data-slot="${i}">
        </div>`;
      wireSearch(slot.querySelector(".slot-input"), slot, i);
    } else {
      const p = byId.get(m.id);
      slot.innerHTML = `
        <div class="dossier" style="--tilt:${tilts[i]}deg">
          <div class="dossier-top">
            <div class="photo"><img src="${SPRITE(p.id)}" alt="${p.name}"
              onerror="this.onerror=null;this.src='${SPRITE(p.dexno)}'"></div>
            <div class="ident">
              <div class="regno">Nº ${String(p.dexno).padStart(4,"0")} · SLOT ${i+1}</div>
              <div class="mon-name">${p.name}</div>
              <div class="alias-line">alias&nbsp;<input class="alias-input" maxlength="14"
                   placeholder="————" value="${m.alias.replace(/"/g,"&quot;")}" data-slot="${i}"></div>
              <div class="types">${typeBadge(p.t1)}${p.t2 ? typeBadge(p.t2) : ""}</div>
            </div>
          </div>
          <div class="holo-stats">${p.stats.map((v, si) => {
            const hMax = 34, h = Math.round(Math.min(1, v/150) * hMax);
            return `<div class="hstat">
              <div class="hstat-bar"><div class="hstat-fill${v >= 100 ? " hot" : ""}" style="height:${h}px"></div></div>
              <div class="hstat-label">${STAT_LABELS[si]}</div><div class="hstat-num">${v}</div>
            </div>`;
          }).join("")}</div>
          <div class="dossier-foot">
            <span class="archetype">CLASS: ${archetype(p.stats)}</span>
            <button class="remove-btn" data-slot="${i}" title="Remove from party">✕ DISCHARGE</button>
          </div>
        </div>`;
      slot.querySelector(".remove-btn").addEventListener("click", () => {
        party[i] = null; saveParty(); renderAll();
      });
      const alias = slot.querySelector(".alias-input");
      alias.addEventListener("input", () => { party[i].alias = alias.value; saveParty(); });
    }
    partyEl.appendChild(slot);
  });
}

// ---------------------------------------------------------------- search
function wireSearch(input, slot, slotIdx) {
  let box = null, sel = -1, results = [];

  function close() { if (box) { box.remove(); box = null; } sel = -1; }

  function pick(p) {
    party[slotIdx] = { id: p.id, alias: "" };
    saveParty(); thud(); renderAll();
    // move focus to the next empty slot's input, if any
    const next = partyEl.querySelector(".slot-input");
    if (next) next.focus();
  }

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    close();
    if (q.length < 2) return;
    results = DEX.filter(p =>
      p.name.toLowerCase().includes(q) || p.ident.includes(q)
    ).sort((a,b) => {
      const aw = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bw = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return aw - bw || a.id - b.id;
    }).slice(0, 8);
    if (!results.length) return;
    box = document.createElement("div");
    box.className = "ac";
    box.innerHTML = results.map((p, ri) => `
      <div class="ac-item" data-ri="${ri}">
        <img loading="lazy" src="${SPRITE(p.id)}" alt=""
             onerror="this.onerror=null;this.src='${SPRITE(p.dexno)}'">
        <span class="ac-name">${p.name}</span>
        <span class="ac-types">${typeBadge(p.t1)}${p.t2 ? typeBadge(p.t2) : ""}</span>
      </div>`).join("");
    box.querySelectorAll(".ac-item").forEach(el =>
      el.addEventListener("mousedown", e => { e.preventDefault(); pick(results[+el.dataset.ri]); }));
    slot.appendChild(box);
  });

  input.addEventListener("keydown", e => {
    if (!box) return;
    const items = box.querySelectorAll(".ac-item");
    if (e.key === "ArrowDown") { sel = Math.min(sel+1, items.length-1); }
    else if (e.key === "ArrowUp") { sel = Math.max(sel-1, 0); }
    else if (e.key === "Enter") { pick(results[Math.max(sel, 0)]); return; }
    else if (e.key === "Escape") { close(); return; }
    else return;
    e.preventDefault();
    items.forEach((el,i) => el.classList.toggle("sel", i === sel));
    if (items[sel]) items[sel].scrollIntoView({ block:"nearest" });
  });

  input.addEventListener("blur", () => setTimeout(close, 150));
}

// ---------------------------------------------------------------- analysis
function members() { return party.filter(Boolean).map(m => byId.get(m.id)); }

function stamp(cls, text, sub) {
  return `<div class="stamp ${cls}">${text}${sub ? `<small>${sub}</small>` : ""}</div>`;
}

function renderDefense(team) {
  const table = document.getElementById("defMatrix");
  const head = `<tr><th class="rowtype">VS ↓</th>${team.map(p =>
    `<th title="${p.name}"><img src="${SPRITE(p.id)}" alt="${p.name}"
       onerror="this.onerror=null;this.src='${SPRITE(p.dexno)}'"></th>`).join("")}<th>NET</th></tr>`;

  const exposed = [], secure = [];
  const rows = TYPES.map(atk => {
    let weak = 0, resist = 0;
    const cells = team.map(p => {
      const m = effOn(atk, p.t1, p.t2);
      if (m >= 2) weak++;
      if (m < 1) resist++;
      const cls = m >= 4 ? "cell-x4" : m >= 2 ? "cell-x2" : m === 0 ? "cell-x0"
                : m <= .25 ? "cell-x025" : m < 1 ? "cell-x05" : "";
      const txt = m === 0 ? "0" : m === .25 ? "¼" : m === .5 ? "½" : m === 1 ? "·" : m + "×";
      return `<td class="${cls}">${txt}</td>`;
    }).join("");
    let net, netCls;
    if (weak >= 3 || (weak >= 2 && resist === 0)) { net = "EXPOSED"; netCls = "cell-net-bad"; exposed.push({ t:atk, weak }); }
    else if (weak === 0 && resist >= Math.min(3, team.length)) { net = "SECURE"; netCls = "cell-net-good"; secure.push(atk); }
    else { net = weak > resist ? "SOFT" : "—"; netCls = "cell-net-mid"; }
    return `<tr><td class="rowtype">${typeBadge(atk)}</td>${cells}<td class="${netCls}">${net}</td></tr>`;
  }).join("");
  table.innerHTML = head + rows;

  const st = document.getElementById("defStamps");
  let s = "";
  exposed.sort((a,b) => b.weak - a.weak).forEach(x =>
    s += stamp("bad", `WEAK TO ${x.t.toUpperCase()}`, `${x.weak} of ${members().length} members hit hard`));
  if (!exposed.length) s += stamp("good", "NO SHARED WEAKNESS", "no type threatens the whole party");
  if (secure.length >= 4) s += stamp("good", "DEFENSIVE CORE INTACT", `secure vs ${secure.length} types`);
  st.innerHTML = s;
  return exposed;
}

function renderOffense(team) {
  const stabs = [...new Set(team.flatMap(p => [p.t1, p.t2]).filter(Boolean))];
  document.getElementById("stabLine").innerHTML =
    `STAB types on staff:&nbsp; ${stabs.map(t => typeBadge(t)).join(" ")}`;

  const uncovered = [], walled = [];
  document.getElementById("offGrid").innerHTML = TYPES.map(def => {
    const best = Math.max(...stabs.map(atk => effOn(atk, def, null)));
    let cls, txt;
    if (best >= 2) { cls = "off-se"; txt = best + "×"; }
    else if (best >= 1) { cls = "off-neutral"; txt = "1× only"; uncovered.push(def); }
    else { cls = "off-walled"; txt = best === 0 ? "immune" : "resisted"; walled.push(def); uncovered.push(def); }
    return `<div class="off-tile ${cls}">${typeBadge(def)}<div class="off-mult">${txt}</div></div>`;
  }).join("");

  const st = document.getElementById("offStamps");
  let s = "";
  if (walled.length)
    s += stamp("bad", "WALLED BY " + walled.map(t => t.toUpperCase()).join(", "), "no STAB even lands neutral");
  const neutralOnly = uncovered.filter(t => !walled.includes(t));
  if (neutralOnly.length)
    s += stamp("warn", "CANNOT PRESSURE " + neutralOnly.map(t => t.toUpperCase()).join(", "), "no super-effective STAB available");
  if (!uncovered.length)
    s += stamp("good", "FULL COVERAGE", "every type takes super-effective STAB");
  st.innerHTML = s;
  return { uncovered, walled, stabs };
}

const DUTIES = [
  { key: "physatk", name: "PHYSICAL ATTACKER", desc: "someone has to hit things (ATK ≥ 100)",
    test: s => s[1] >= 100 },
  { key: "specatk", name: "SPECIAL ATTACKER", desc: "mixed pressure keeps walls honest (SPA ≥ 100)",
    test: s => s[3] >= 100 },
  { key: "physwall", name: "PHYSICAL WALL", desc: "absorbs physical blows (DEF ≥ 100, HP ≥ 60)",
    test: s => s[2] >= 100 && s[0] >= 60 },
  { key: "specwall", name: "SPECIAL WALL", desc: "absorbs special blows (SP.DEF ≥ 95, HP ≥ 60)",
    test: s => s[4] >= 95 && s[0] >= 60 },
  { key: "speed", name: "SPEED CONTROL", desc: "moves first when it matters (SPE ≥ 105)",
    test: s => s[5] >= 105 },
  { key: "pivot", name: "BULKY SUPPORT", desc: "soaks hits and holds the line (HP ≥ 85, both defenses ≥ 70)",
    test: s => s[0] >= 85 && s[2] >= 70 && s[4] >= 70 },
];

function renderRoles(team) {
  const vacant = [];
  document.getElementById("dutyTable").innerHTML = DUTIES.map(d => {
    const holders = team.filter(p => d.test(p.stats));
    if (!holders.length) vacant.push(d);
    return `<div class="duty-row">
      <span class="duty-name">${d.name}</span>
      <span class="duty-desc">${d.desc}</span>
      <span class="duty-holders">${holders.slice(0,6).map(p =>
        `<img src="${SPRITE(p.id)}" alt="${p.name}" title="${p.name}"
          onerror="this.onerror=null;this.src='${SPRITE(p.dexno)}'">`).join("")}</span>
      <span class="duty-mark ${holders.length ? "ok" : "no"}">${holders.length ? "COVERED" : "VACANT"}</span>
    </div>`;
  }).join("");

  const st = document.getElementById("roleStamps");
  st.innerHTML = vacant.length
    ? vacant.map(d => stamp("bad", "LACKING: " + d.name)).join("")
    : stamp("good", "ALL DUTIES STAFFED", "a complete outfit");
  return vacant;
}

function renderVerdict(team, exposed, off, vacant) {
  let score = 100;
  const notes = [];
  const dEx = Math.min(28, exposed.length * 9);
  if (dEx) { score -= dEx; notes.push(`−${dEx} shared weaknesses (${exposed.map(x=>x.t).join(", ")})`); }
  const dWall = Math.min(16, off.walled.length * 8);
  if (dWall) { score -= dWall; notes.push(`−${dWall} walled offensively`); }
  const neutralOnly = off.uncovered.length - off.walled.length;
  const dOff = Math.min(15, Math.max(0, neutralOnly - 1) * 3);
  if (dOff) { score -= dOff; notes.push(`−${dOff} coverage gaps`); }
  const dRole = Math.min(30, vacant.length * 6);
  if (dRole) { score -= dRole; notes.push(`−${dRole} vacant duties`); }
  if (team.length < 6) {
    const dSize = (6 - team.length) * 4;
    score -= dSize; notes.push(`−${dSize} incomplete roster (${team.length}/6)`);
  }
  score = Math.max(0, Math.round(score));

  let cls, label, sub;
  if (score >= 88)      { cls = "v-exemplary";   label = "EXEMPLARY";   sub = "glory to your team"; }
  else if (score >= 72) { cls = "v-approved";    label = "APPROVED";    sub = "fit for the league"; }
  else if (score >= 55) { cls = "v-conditional"; label = "CONDITIONAL"; sub = "deficiencies noted above"; }
  else if (score >= 35) { cls = "v-needswork";   label = "NEEDS WORK";  sub = "revise and resubmit"; }
  else                  { cls = "v-denied";      label = "DENIED";      sub = "cause for concern" ; }

  document.getElementById("scoreNum").textContent = score;
  document.getElementById("scoreNotes").innerHTML = notes.length
    ? "<b>Deductions:</b><br>" + notes.join("<br>")
    : "<b>No deductions.</b><br>The inspector has nothing to add.";
  const vs = document.getElementById("verdictStamp");
  vs.className = "verdict-stamp " + cls;
  vs.innerHTML = `${label}<small>${sub}</small>`;
}

// ---------------------------------------------------------------- render all
function renderAll() {
  renderParty();
  const team = members();
  const empty = document.getElementById("emptyNotice");
  const body = document.getElementById("reportBody");
  if (!team.length) { empty.hidden = false; body.hidden = true; return; }
  empty.hidden = true; body.hidden = false;
  const exposed = renderDefense(team);
  const off = renderOffense(team);
  const vacant = renderRoles(team);
  renderVerdict(team, exposed, off, vacant);
}

// ---------------------------------------------------------------- chrome
document.getElementById("docdate").textContent =
  new Date().toISOString().slice(0, 10).replace(/-/g, ".");
document.getElementById("docno").textContent =
  String(Math.abs((localStorage.getItem(STORE_KEY) || "seed").split("")
    .reduce((a,c) => (a*31 + c.charCodeAt(0)) | 0, 7)) % 90000 + 10000);

document.getElementById("shareBtn").addEventListener("click", async e => {
  const ids = party.filter(Boolean).map(m => m.id).join(".");
  const url = location.origin + location.pathname + (ids ? "#p=" + ids : "");
  try { await navigator.clipboard.writeText(url); } catch (err) {}
  e.target.textContent = "LINK COPIED — FILED";
  setTimeout(() => { e.target.textContent = "COPY PARTY LINK"; }, 1600);
});

document.getElementById("clearBtn").addEventListener("click", () => {
  party = [null,null,null,null,null,null];
  saveParty(); renderAll();
});

boot();
