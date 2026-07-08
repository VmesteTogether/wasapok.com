/* ARE MY POKÉMON GOOD? — Poké Spot environments (party / mixed modes)
   Hard-pixel canvas scenes after the three Poké Spots of Pokémon XD:
   OASIS, CAVE, ROCK. Drawn at low internal resolution, upscaled with
   nearest-neighbor. World-space rendering: the scene scrolls with the
   page and continues underwater / underground to the document bottom. */
"use strict";

(() => {

const cvs = document.getElementById("envCanvas");
if (!cvs) return;
const g = cvs.getContext("2d");
const platformEl = document.querySelector(".platform");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ------------------------------------------------------------- setup
let S = 6, W = 0, H = 0, scroll = 0;

function resize() {
  S = Math.max(3, Math.round(innerWidth / 230));   // ~230 world px across
  W = Math.ceil(innerWidth / S);
  H = Math.ceil(innerHeight / S) + 1;
  cvs.width = W; cvs.height = H;
  g.imageSmoothingEnabled = false;
}
addEventListener("resize", resize);
resize();

// deterministic hash rand — stable feature placement across frames
function rnd(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

// world-space rect (y in world px; scroll subtracted at draw)
function R(x, wy, w, h, c) {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(wy - scroll), Math.round(w), Math.round(h));
}

// 2×2 checker dither patterns, world-parity locked so scrolling doesn't shimmer
const patterns = new Map();
function checker(a, b) {
  const k = a + "|" + b;
  if (patterns.has(k)) return patterns.get(k);
  const p = document.createElement("canvas"); p.width = 2; p.height = 2;
  const pg = p.getContext("2d");
  pg.fillStyle = a; pg.fillRect(0, 0, 2, 2);
  pg.fillStyle = b; pg.fillRect(0, 0, 1, 1); pg.fillRect(1, 1, 1, 1);
  const pat = g.createPattern(p, "repeat");
  patterns.set(k, pat);
  return pat;
}
function RP(x, wy, w, h, a, b) {
  const par = ((scroll % 2) + 2) % 2;
  g.save();
  g.translate(0, -par);
  g.fillStyle = checker(a, b);
  g.fillRect(Math.round(x), Math.round(wy - scroll) + par, Math.round(w), Math.round(h));
  g.restore();
}

// vertical banded gradient with dithered seams
function bands(y0, y1, colors) {
  const n = colors.length, bh = (y1 - y0) / n;
  for (let i = 0; i < n; i++) {
    R(0, y0 + i * bh, W, Math.ceil(bh) + 1, colors[i]);
    if (i) RP(0, y0 + i * bh - 2, W, 4, colors[i - 1], colors[i]);
  }
}

// pixel ellipse by rows (hard edges, no AA)
function ellipse(cx, cy, rx, ry, c) {
  for (let dy = -ry; dy <= ry; dy++) {
    const hw = rx * Math.sqrt(Math.max(0, 1 - (dy / ry) * (dy / ry)));
    if (hw < .5) continue;
    R(cx - hw, cy + dy, hw * 2, 1, c);
  }
}
function ellipseRing(cx, cy, rx, ry, c) {
  let prev = 0;
  for (let dy = -ry; dy <= ry; dy++) {
    const hw = rx * Math.sqrt(Math.max(0, 1 - (dy / ry) * (dy / ry)));
    if (hw < .5) continue;
    const w = Math.max(1, Math.abs(hw - prev));
    R(cx - hw, cy + dy, w + 1, 1, c);
    R(cx + hw - w - 1, cy + dy, w + 1, 1, c);
    prev = hw;
  }
}

function stars(count, y0, y1, t, seed, cols) {
  for (let i = 0; i < count; i++) {
    const x = rnd(seed + i) * W;
    const y = y0 + rnd(seed + i + 50) * (y1 - y0);
    if (((t * 0.22 + rnd(seed + i + 99)) % 1) < 0.62)
      R(x, y, 1, 1, cols[i % cols.length]);
  }
}

const visible = (wy, h) => wy - scroll < H + 24 && wy - scroll + h > -24;

// ============================================================= OASIS
// dusk desert oasis: afterglow sky, palm silhouettes, rippling pond
// around the platform island; page continues under the water.
function oasis(f) {
  const { t, horizon, cx, pw, docB } = f;

  // -- sky (dusk)
  bands(Math.min(0, scroll), horizon, ["#17294a", "#1f3c5e", "#2c5876", "#417a88", "#6d9c8a", "#c88e56"]);
  stars(26, 0, Math.max(20, horizon * .45), t, 11, ["#cfe0f0", "#8fa8c8", "#e8d8b0"]);

  // low ember sun above the dune line
  const sunX = W * 0.15, sunY = horizon - 28;
  for (let dy = -4; dy <= 4; dy++) {
    const hw = 4.5 * Math.sqrt(Math.max(0, 1 - (dy / 4.5) * (dy / 4.5)));
    R(sunX - hw, sunY + dy, hw * 2, 1, Math.abs(dy) < 3 ? "#f8dc9a" : "#f0c070");
  }
  RP(sunX - 8, sunY + 5, 16, 3, "#c88e56", "#e0aa64");      // haze under the sun

  // -- dune ridge silhouettes (fill down to the horizon line)
  for (let x = 0; x < W; x += 6) {
    const r1 = horizon - 11 - Math.round(Math.sin(x * .07 + 2) * 4 + rnd(x) * 3);
    R(x, r1, 6, horizon - r1 + 1, "#2a3a50");
  }
  for (let x = 0; x < W; x += 6) {
    const r2 = horizon - 4 - Math.round(Math.sin(x * .12 + 9) * 3 + rnd(x + 40) * 2);
    R(x, r2, 6, horizon - r2 + 1, "#403428");
  }

  // -- shore ground, a proper earth band before the water begins
  const waterTop = horizon + 32;
  R(0, horizon, W, 2, "#e0b878");
  R(0, horizon + 2, W, waterTop - horizon - 2, "#c89858");
  RP(0, waterTop - 5, W, 5, "#c89858", "#a87850");          // damp lower soil
  for (let i = 0; i < 24; i++)                              // scattered shore pebbles
    R(rnd(i + 300) * W, horizon + 3 + rnd(i + 330) * 20, 1 + (i % 2), 1, i % 3 ? "#a87850" : "#e8d0a0");

  // -- the pond ring (DOM platform covers the island center)
  const pr = Math.min(pw * 0.78, W * 0.42), pry = Math.max(9, pw * 0.2), py = horizon + 6;
  ellipseRing(cx, py, pr + 3, pry + 2, "#e8d0a0");          // dry sand lip
  ellipseRing(cx, py, pr + 1, pry + 1, "#8e6840");          // wet sand rim
  ellipse(cx, py, pr, pry, "#2e6e9e");
  // the pond opens down into the depths
  R(cx - pr * .62, py, pr * 1.24, waterTop - py + 1, "#2e6e9e");
  R(cx - pr * .62 - 1, py + pry * .6, 1, waterTop - py - pry * .6 + 1, "#8e6840");
  R(cx + pr * .62, py + pry * .6, 1, waterTop - py - pry * .6 + 1, "#8e6840");
  ellipse(cx, py, pr * .8, pry * .8, "#3a80b2");
  for (let k = 0; k < 3; k++) {                             // drifting ripple rings
    const ph = ((t * 0.16 + k / 3) % 1);
    ellipseRing(cx, py, pr * (0.4 + ph * 0.55), pry * (0.4 + ph * 0.55), ph > .7 ? "#4e94c4" : "#6fb8dd");
  }
  for (let i = 0; i < 9; i++) {                             // twinkling glints
    const a = rnd(i + 70) * 6.28, rr = 0.5 + rnd(i + 90) * 0.45;
    if (((t * 0.5 + rnd(i + 77)) % 1) < 0.2)
      R(cx + Math.cos(a) * pr * rr, py + Math.sin(a) * pry * rr, 1, 1, "#eaf6f8");
  }

  // -- palm silhouettes on the shore
  for (let i = 0; i < 5; i++) {
    const side = i % 2 ? 1 : -1;
    const px = cx + side * (pr + 4 + rnd(i + 8) * (W * 0.5 - pr));
    if (px < 5 || px > W - 5) continue;
    const hgt = 26 + rnd(i + 20) * 14, lean = side * (2 + rnd(i + 30) * 3);
    const topX = px + lean, topY = horizon + 2 - hgt;
    for (let s = 0; s < hgt; s += 2)                        // trunk
      R(px + lean * (s / hgt), horizon + 2 - s - 2, 2, 3, "#241a14");
    const sway = Math.sin(t * 0.7 + i) * 1.5;
    for (let a = 0; a < 6; a++) {                           // fronds
      const ang = -2.6 + a * 1.05, droop = 0.55 + rnd(i * 9 + a) * 0.3;
      let fx = topX, fy = topY;
      for (let s2 = 0; s2 < 4; s2++) {
        fx += Math.cos(ang) * 3 + (s2 === 3 ? sway : 0);
        fy += Math.sin(ang) * 2 + s2 * droop;
        R(fx, fy, 2, 1, "#1e3020");
      }
    }
    R(topX - 1, topY - 1, 4, 3, "#1e3020");                 // crown
  }

  // -- underwater
  bands(waterTop, docB - 10, ["#2e6e9e", "#28608e", "#22507a", "#1c4066", "#163252", "#102440", "#0c1a32"]);

  // sun shafts near the surface, swaying
  for (let k = 0; k < 3; k++) {
    const bx = W * (0.2 + k * 0.28) + Math.sin(t * 0.22 + k * 2) * 6;
    RP(bx, waterTop, 12 - k * 2, 130, "#2e6e9e", "#4487b4");
  }

  // rising bubbles
  const depth = Math.max(60, docB - 10 - waterTop - 20);
  for (let i = 0; i < 26; i++) {
    const sp = 7 + rnd(i + 500) * 9;
    const y = (docB - 14) - ((t * sp + rnd(i + 520) * depth * 4) % depth);
    if (!visible(y, 2)) continue;
    const x = rnd(i + 510) * W + Math.sin(t * 1.1 + i) * 2;
    R(x, y, i % 3 ? 1 : 2, i % 3 ? 1 : 2, i % 2 ? "#9ccce0" : "#e8f4f8");
  }

  // fish silhouettes gliding through
  for (let i = 0; i < 4; i++) {
    const sp = 5 + rnd(i + 600) * 6;
    const y = waterTop + 40 + rnd(i + 610) * Math.max(30, depth - 70) + Math.sin(t * 0.6 + i * 2) * 3;
    if (!visible(y, 3)) continue;
    const x = ((t * sp + rnd(i + 620) * 900) % (W + 40)) - 20;
    R(x, y, 4, 2, "#0e2438"); R(x - 2, y, 2, 1, "#0e2438"); R(x - 2, y + 1, 1, 1, "#0e2438");
  }

  // seaweed swaying at the bed
  for (let i = 0; i < 9; i++) {
    const x = rnd(i + 700) * W, hgt = 16 + rnd(i + 710) * 26;
    if (!visible(docB - 10 - hgt, hgt)) continue;
    for (let s = 0; s < hgt; s += 2)
      R(x + Math.sin(t * 0.8 + i + s * 0.14) * (s / hgt) * 3, docB - 11 - s, 2, 2,
        s > hgt - 6 ? "#2e7e5e" : "#1e5e4e");
  }

  // sandy bed
  R(0, docB - 10, W, 2, "#d0ac70");
  R(0, docB - 8, W, 8, "#b89058");
  for (let i = 0; i < 20; i++)
    R(rnd(i + 800) * W, docB - 7 + rnd(i + 820) * 5, 1 + (i % 2), 1, i % 3 ? "#96744a" : "#e0c080");
}

// ============================================================== CAVE
// violet cavern: stalactites dripping into pools, moisture glimmer,
// glowing crystals; page continues down through crystal-veined strata.
function cave(f) {
  const { t, horizon, cx, pw, docB } = f;

  // -- back wall + ceiling
  bands(Math.min(0, scroll), horizon, ["#171126", "#2c2144", "#3a2c55", "#43356a", "#3a2c55"]);
  for (let x = 0; x < W; x += 10)                           // jagged ceiling underside
    R(x, 0, 10, 10 + Math.round(rnd(x) * 14), "#171126");
  for (let i = 0; i < 8; i++) {                             // wall texture patches
    const x = rnd(i + 40) * W, y = 34 + rnd(i + 50) * Math.max(10, horizon - 64);
    RP(x, y, 8 + rnd(i + 60) * 14, 5 + rnd(i + 70) * 8, "#3a2c55", "#473866");
  }

  // cavern recess arching behind the platform
  for (let dy = 0; dy < 56; dy++) {
    const hw = pw * .74 * Math.sqrt(Math.max(0, 1 - (dy / 56) * (dy / 56)));
    R(cx - hw, horizon - dy, hw * 2, 1, "#1c1530");
  }
  for (let x = 0; x < 16; x += 4)                           // side walls closing in
    R(0, 0, 16 - x, horizon, "#1f1834");
  for (let x = 0; x < 16; x += 4)
    R(W - 16 + x, 0, 16 - x, horizon, "#1f1834");

  // -- glowing crystal clusters on the wall
  for (let i = 0; i < 6; i++) {
    const x = 14 + rnd(i + 100) * (W - 28), y = 26 + rnd(i + 110) * Math.max(12, horizon - 74);
    const pulse = (Math.sin(t * 1.1 + i * 2.1) + 1) / 2;
    const cyan = i % 2 === 0;
    const bright = cyan ? "#5fe8d0" : "#9e6be8", dim = cyan ? "#3fa898" : "#6e4ba8";
    RP(x - 4, y - 3, 12, 10, "#2e2244", "#43356a");         // halo
    R(x, y, 3, 4, pulse > .5 ? bright : dim);
    R(x + 3, y + 1, 2, 3, dim);
    R(x - 2, y + 1, 2, 3, pulse > .8 ? bright : dim);
    R(x + 1, y - 1, 1, 1, "#e8fff8");
  }

  // -- floor
  R(0, horizon - 2, W, 2, "#6e5a90");
  R(0, horizon, W, 15, "#4a3a66");
  for (let i = 0; i < 22; i++)                              // rubble
    R(rnd(i + 200) * W, horizon + 2 + rnd(i + 220) * 11, 1 + (i % 2), 1, i % 3 ? "#38295a" : "#7e6aa0");
  RP(cx - pw * .7, horizon + 1, pw * 1.4, 6, "#4a3a66", "#5a4880");   // clearing glow under the disc

  // two floor pools flanking the disc
  const pools = [
    { x: Math.max(16, cx - pw * 0.78), rx: 11 },
    { x: Math.min(W - 18, cx + pw * 0.82), rx: 14 },
  ];
  for (const p of pools) {
    ellipse(p.x, horizon + 8, p.rx, 3, "#2e5e7e");
    ellipse(p.x, horizon + 8, p.rx * .6, 2, "#3f7898");
    ellipseRing(p.x, horizon + 8, p.rx + 1, 4, "#38295a");
  }

  // -- stalactites + drips
  for (let i = 0; i < 9; i++) {
    const x = 10 + rnd(i + 300) * (W - 20);
    const topY = 4 + rnd(i + 310) * 8;
    const len = 16 + rnd(i + 320) * 34;
    for (let s = 0; s < len; s += 2) {
      const w = Math.max(1, Math.round(8 * (1 - s / len)));
      R(x - w / 2, topY + s, w, 2, "#171126");
      R(x + w / 2 - 1, topY + s, 1, 2, "#4a3a6a");          // lit edge
    }
    const tipY = topY + len;
    // drip cycle
    const cyc = 4 + rnd(i + 330) * 5;
    const ph = (t + rnd(i + 340) * cyc) % cyc;
    const pool = pools.reduce((best, p) => Math.abs(p.x - x) < 16 ? p : best, null);
    const floorY = horizon + (pool ? 8 : 2);
    const fall = (floorY - tipY) / 85;                      // seconds to fall
    if (ph < 0.5) {                                         // gathering bead
      if (((t * 3 + i) % 1) < .6) R(x, tipY, 1, 1, "#9fd8e8");
    } else if (ph < 0.5 + fall) {                           // falling droplet
      R(x, tipY + ((ph - 0.5) / fall) * (floorY - tipY), 1, 2, "#bfe8f0");
    } else if (ph < 0.5 + fall + 0.45) {                    // splash / pool ripple
      const sp = (ph - 0.5 - fall) / 0.45;
      if (pool) ellipseRing(pool.x, horizon + 8, 2 + sp * pool.rx * .8, 1 + sp * 2.4, "#5fa8c8");
      else { R(x - 1 - sp * 2, floorY, 1, 1, "#9fd8e8"); R(x + 1 + sp * 2, floorY, 1, 1, "#9fd8e8"); }
    }
  }

  // moisture glimmer on walls and ceiling
  for (let i = 0; i < 40; i++) {
    if (((t * 0.3 + rnd(i + 400)) % 1) < 0.1) {
      const x = rnd(i + 410) * W, y = rnd(i + 420) * Math.max(20, horizon - 8);
      R(x, y, 1, 1, i % 3 ? "#cff0f8" : "#8fe8d8");
    }
  }

  // -- strata below
  const under = horizon + 15;
  bands(under, docB - 8, ["#3a2c50", "#322448", "#2a1e3e", "#241a34", "#1e1630", "#181226"]);
  for (let k = 0; k < 70; k++) {                            // rubble flecks in the rock
    const sy = under + rnd(k + 900) * Math.max(20, docB - under - 22);
    if (!visible(sy, 1)) continue;
    R(rnd(k + 910) * W, sy, 1 + (k % 2), 1, k % 3 ? "#241a34" : "#4a3a66");
  }

  // crystal veins winding down
  for (let v = 0; v < 5; v++) {
    let vx = rnd(v + 500) * W;
    const cyan = v % 2 === 0;
    const bright = cyan ? "#5fe8d0" : "#9e6be8", dim = cyan ? "#357e70" : "#57408a";
    const pulse = (Math.sin(t * 0.7 + v * 1.7) + 1) / 2;
    for (let y = under + 10 + rnd(v + 510) * 30; y < docB - 14; y += 3) {
      vx += (rnd(v * 91 + y) - .5) * 3;
      vx = Math.max(4, Math.min(W - 4, vx));
      if (!visible(y, 2)) continue;
      R(vx, y, 1, 2, pulse > .5 && (y % 9 < 3) ? bright : dim);
      if (rnd(v * 31 + y) > .93) {                          // gem cluster at a bend
        R(vx - 1, y, 3, 2, pulse > .5 ? bright : dim);
        R(vx, y - 1, 1, 1, "#e8fff8");
      }
    }
  }

  // deep pockets with hanging drips
  for (let i = 0; i < 3; i++) {
    const x = 20 + rnd(i + 600) * (W - 40);
    const y = under + 40 + rnd(i + 610) * Math.max(30, docB - under - 90);
    if (!visible(y, 16)) continue;
    ellipse(x, y + 6, 12, 7, "#120e1e");
    R(x - 1, y, 2, 3, "#241a38");
    const ph = (t + rnd(i + 620) * 6) % 6;
    if (ph < .35) R(x, y + 3 + (ph / .35) * 8, 1, 1, "#9fd8e8");
  }

  // fossil curl
  const fy = under + Math.max(30, (docB - under) * 0.55);
  if (visible(fy, 8)) {
    const fx = W * 0.28;
    ellipseRing(fx, fy, 5, 4, "#8e7a9e");
    ellipseRing(fx + 1, fy, 2, 2, "#8e7a9e");
  }

  // bedrock
  R(0, docB - 8, W, 8, "#0e0a18");
  for (let i = 0; i < 14; i++)
    R(rnd(i + 700) * W, docB - 7 + rnd(i + 720) * 5, 2, 1, "#1e1630");
}

// ============================================================== ROCK
// sunset badlands: mesa silhouettes, drifting dust, dry cracked earth;
// page continues down through wavy sandstone strata and buried relics.
function rock(f) {
  const { t, horizon, cx, pw, docB } = f;

  // -- sunset sky
  bands(Math.min(0, scroll), horizon, ["#2e1e3e", "#4c2844", "#743650", "#a44c50", "#cc6c50", "#e89058"]);
  stars(18, 0, Math.max(16, horizon * .34), t, 21, ["#e8d0c0", "#c8a8b0"]);

  // ember sun low over the mesas
  const sunX = W * 0.6;
  for (let dy = -4; dy <= 4; dy++) {
    const hw = 4.5 * Math.sqrt(Math.max(0, 1 - (dy / 4.5) * (dy / 4.5)));
    R(sunX - hw, horizon - 26 + dy, hw * 2, 1, Math.abs(dy) < 3 ? "#f8c878" : "#f0a860");
  }
  RP(sunX - 8, horizon - 20, 16, 3, "#cc6c50", "#e89058");

  // -- mesas
  const mesa = (mx, mw, mh, c) => {
    R(mx + 3, horizon - mh, mw - 6, mh, c);
    R(mx + 1, horizon - mh + 3, mw - 2, mh - 3, c);
    R(mx, horizon - mh + 6, mw, mh - 6, c);
  };
  mesa(W * .04, 26, 20, "#3a2434"); mesa(W * .3, 34, 14, "#3a2434"); mesa(W * .8, 30, 22, "#3a2434");
  mesa(W * .16, 20, 11, "#4e2e30"); mesa(W * .62, 24, 9, "#4e2e30"); mesa(W * .92, 18, 13, "#4e2e30");

  // saguaro silhouettes
  for (let i = 0; i < 3; i++) {
    const x = 12 + rnd(i + 30) * (W - 24);
    if (Math.abs(x - cx) < pw * .58) continue;
    const hgt = 9 + rnd(i + 40) * 7;
    R(x, horizon - hgt, 2, hgt, "#2a1e28");
    R(x - 3, horizon - hgt + 3, 2, 4, "#2a1e28"); R(x - 3, horizon - hgt + 3, 3, 2, "#2a1e28");
    R(x + 3, horizon - hgt + 5, 2, 4, "#2a1e28"); R(x + 2, horizon - hgt + 5, 3, 2, "#2a1e28");
  }

  // -- dry ground
  R(0, horizon, W, 2, "#d09868");
  R(0, horizon + 2, W, 14, "#b07848");
  for (let i = 0; i < 16; i++)                              // cracks
    R(rnd(i + 100) * W, horizon + 3 + rnd(i + 120) * 10, 3 + rnd(i + 130) * 6, 1, "#7e5230");
  for (let i = 0; i < 18; i++)                              // stones
    R(rnd(i + 140) * W, horizon + 2 + rnd(i + 150) * 11, 1 + (i % 2), 1, i % 3 ? "#96603c" : "#d8a878");
  RP(cx - pw * .75, horizon + 1, pw * 1.5, 6, "#b07848", "#c8905c");  // trodden clearing

  // boulder piles flanking the platform
  for (const side of [-1, 1]) {
    const bx = side < 0 ? Math.max(14, cx - pw * 0.82) : Math.min(W - 14, cx + pw * 0.85);
    ellipse(bx, horizon + 2, 9, 5, "#6e4228");
    ellipse(bx - side * 3, horizon, 6, 4, "#8e5838");
    R(bx - side * 5, horizon - 4, 3, 2, "#b07848");
  }

  // -- drifting dust (wind right → left)
  for (let i = 0; i < 26; i++) {
    const sp = 8 + rnd(i + 200) * 13;
    const x = (W + 24) - ((t * sp + rnd(i + 210) * 1200) % (W + 48));
    const y = horizon - 4 - rnd(i + 220) * 52 + Math.sin(t * 0.9 + i) * 2.5;
    if (!visible(y, 1)) continue;
    R(x, y, i % 4 ? 1 : 2, 1, i % 3 ? "#e8cfa0" : "#d8b088");
  }
  { // a lone tumbleweed, every so often
    const cyc = 22, ph = (t % cyc) / cyc;
    if (ph < .4) {
      const x = W - ph * 2.5 * (W + 20);
      const y = horizon - 1 + Math.abs(Math.sin(ph * 40)) * -4;
      ellipseRing(x, y, 2.5, 2.5, "#a08048");
      R(x - 1, y - 1, 1, 1, "#7e6438");
    }
  }

  // -- strata below, wavy sedimentary bands
  const under = horizon + 16;
  const cols = ["#96603c", "#855234", "#74462c", "#683e28"];
  let y = under, i = 0;
  while (y < docB - 12) {
    const bh = 20 + rnd(i + 400) * 14;
    for (let x = 0; x < W; x += 16) {
      const off = Math.round((rnd(i * 57 + x / 16) - .5) * 5);
      if (visible(y + off, bh + 5)) {
        R(x, y + off, 16, bh + 5, cols[i % 4]);
        R(x, y + off, 16, 1, "#52301e");
      }
    }
    y += bh; i++;
  }

  // pebble speckle through the strata
  for (let k = 0; k < 90; k++) {
    const sy = under + rnd(k + 500) * Math.max(20, docB - under - 26);
    if (!visible(sy, 1)) continue;
    R(rnd(k + 510) * W, sy, 1 + (k % 2), 1, k % 3 ? "#5e3824" : "#b08054");
  }

  // roots reaching down from the surface
  for (let r = 0; r < 3; r++) {
    let rx = 16 + rnd(r + 600) * (W - 32);
    if (Math.abs(rx - cx) < pw * .7) continue;
    for (let ry2 = under; ry2 < under + 26 + rnd(r + 610) * 14; ry2 += 2) {
      rx += (rnd(r * 77 + ry2) - .5) * 2.4;
      if (visible(ry2, 2)) R(rx, ry2, 1, 2, "#4e3020");
    }
  }

  // buried things: fossil skeleton, geode, old relic pot
  const depthSpan = Math.max(60, docB - under - 40);
  const fy = under + depthSpan * 0.45, fx = W * 0.24;
  if (visible(fy, 6)) {                                     // fish fossil
    R(fx, fy + 2, 12, 1, "#d8c8a8");
    for (let b = 0; b < 5; b++) R(fx + 2 + b * 2, fy, 1, 5, "#d8c8a8");
    R(fx + 12, fy + 1, 2, 3, "#d8c8a8"); R(fx - 2, fy + 1, 2, 3, "#d8c8a8");
  }
  const gy = under + depthSpan * 0.72, gx = W * 0.72;
  if (visible(gy, 10)) {                                    // geode
    ellipse(gx, gy, 6, 5, "#3a2018");
    const pulse = (Math.sin(t * 0.9) + 1) / 2;
    R(gx - 2, gy - 1, 2, 2, pulse > .5 ? "#8fe8d8" : "#4fa898");
    R(gx + 1, gy, 2, 2, pulse > .5 ? "#4fa898" : "#8fe8d8");
  }
  const py2 = under + depthSpan * 0.9, px2 = W * 0.45;
  if (visible(py2, 8)) {                                    // relic pot
    R(px2 - 3, py2, 6, 6, "#7e6848");
    R(px2 - 4, py2 + 1, 8, 3, "#7e6848");
    R(px2 - 2, py2 - 1, 4, 1, "#93795a");
    R(px2 - 1, py2 + 2, 2, 2, "#4e3c28");
  }

  // bedrock
  R(0, docB - 12, W, 12, "#38241c");
  for (let k = 0; k < 14; k++)
    R(rnd(k + 700) * W, docB - 11 + rnd(k + 720) * 8, 2, 1, "#52301e");
}

const SCENES = { oasis, cave, rock };

// ------------------------------------------------------------- picker
const VALID = ["oasis", "cave", "rock"];
const ENV_KEY = "ampg-env";
let env = VALID.includes(localStorage.getItem(ENV_KEY)) ? localStorage.getItem(ENV_KEY) : "oasis";

const btns = document.querySelectorAll(".env-btn");
function setEnv(name) {
  env = name;
  document.body.dataset.env = name;
  localStorage.setItem(ENV_KEY, name);
  btns.forEach(b => b.classList.toggle("active", b.dataset.env === name));
}
btns.forEach(b => b.addEventListener("click", () => setEnv(b.dataset.env)));
setEnv(env);

// ------------------------------------------------------------- loop
function frame(tms) {
  requestAnimationFrame(frame);
  const mode = document.body.dataset.mode;
  if (mode !== "party" && mode !== "mixed") return;   // canvas is display:none in input mode
  if (document.hidden) return;

  const t = reduceMotion ? 0 : tms / 1000;
  scroll = Math.round(scrollY / S);
  const r = platformEl.getBoundingClientRect();
  const horizon = Math.round((r.top + r.height * 0.55) / S) + scroll;
  const f = {
    t,
    horizon,
    cx: (r.left + r.width / 2) / S,
    pw: Math.max(30, r.width / S),
    docB: Math.ceil(document.documentElement.scrollHeight / S),
  };
  g.clearRect(0, 0, W, H);
  SCENES[env](f);
}
requestAnimationFrame(frame);

})();
