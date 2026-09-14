/* =====================================================================
   Gnominium Chunk Viewer  -  main.js
   ---------------------------------------------------------------------
   Renders a full overworld chunk: floor tiles (never two identical
   touching) -> glass roof panes -> autotiled walls -> scattered sprites.
   Everything is seeded, so "Reroll" walks through the random space.

   All the moving parts are data-driven:
     * assets come from window.GNOM_ASSETS  (built by scan-assets.ps1)
     * wall shapes come from the AUTOTILE table below
     * templates come from window.GNOM_TEMPLATES (built from the .gml)
   ===================================================================== */

const TILE  = 32;   // floor / wall cell size, px  (matches the game)
const GLASS = 64;   // glass pane size, px

/* --- Autotile: 4-neighbour mask -> wall role (filename suffix) --------
   Bits:  N=1  E=2  S=4  W=8   (a set bit = a wall connects on that side)
   Caps are named by the side they CLOSE; corners / T / cross are named by
   the sides they OPEN toward. If any piece looks rotated wrong, this one
   table is the only thing to change (toggle "Autotile test" to see them). */
const NN = 1, EE = 2, SS = 4, WW = 8;
const AUTOTILE = {
  0:                 '01',                       // isolated block
  [NN]:              'bottom_cap',               // connects up
  [EE]:              'left_cap',                 // connects right
  [SS]:              'top_cap',                  // connects down
  [WW]:              'right_cap',                // connects left
  [NN|SS]:           'center_vertical',
  [EE|WW]:           'center_horizontal',
  [NN|EE]:           'right_top_trans',
  [NN|WW]:           'left_top_trans',
  [SS|EE]:           'right_bottom_trans',
  [SS|WW]:           'left_bottom_trans',
  [NN|EE|SS]:        'top_right_bottom_trans',
  [NN|EE|WW]:        'top_right_left_trans',
  [NN|SS|WW]:        'top_bottom_left_trans',
  [EE|SS|WW]:        'left_right_bottom_trans',
  [NN|EE|SS|WW]:     'middle_trans',
};

/* ------------------------------ RNG --------------------------------- */
function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ri = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)); // inclusive int

/* --------------------------- asset load ----------------------------- */
function loadImg(src){
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('bad image'));
    im.src = src;
  });
}

const A = window.GNOM_ASSETS || { tilesets:[], wallsets:[], glass:[], sprites:[] };

const state = {
  seed: 1,
  size: 1024,          // chunk px (multiple of 64)
  zoom: 0.6,
  tilesetIdx: 0,
  wallsetIdx: 0,
  glassIdx: 0,
  glassOn: true,
  glassOp: 0.85,
  wallSource: 'proc',  // 'proc' | 'tpl'
  wallDensity: 0.5,
  edgeOpen: true,
  spriteDensity: 1,
  showBoxes: false,
  lockSprites: false,
  showGrid: false,
  showWallGrid: false,
  showMaskTest: false,
  // built each regen:
  N: 32,
  tileGrid: [],
  wallGrid: [],
  placements: [],
  // sprite config (per sprite): {enabled, freq, boxScale}
  spriteCfg: [],
  // caustics video overlay
  caustics: { enabled: false, pixel: 16, speed: 1, binary: true, flip: false, threshold: 0.5, opacity: 0.6, blend: 'multiply', color: '#0d1b2e' },
  // blinking panel LEDs (auto-detected from the tiles)
  lightsCfg: { enabled: true, speed: 1, jitter: 0.5, glow: 1, vibrant: false },
  lightList: [],
  lightPalette: [],
  // placeable elliptical glow lights: {x,y,rx,ry,rot(rad),intensity,temp}
  glows: [],
  glowDefaults: { rx: 70, ry: 70, rot: 0, intensity: 1, temp: 0.5 },
  glowBlend: 'overlay',   // how spotlights interact with the scene (blend mode)
};

let canvas, ctx;

// live drag of a placed sprite: dragK is the index into state.placements being
// dragged (-1 = none); dragBG caches the rest of the scene so a drag repaints
// as one blit + one sprite instead of the whole chunk.
let dragK = -1, dragBG = null, dragOff = { x: 0, y: 0 };
// per-instance editing: selK = selected placement (for Delete key / highlight),
// brushType = sprite type armed for click-to-place on the map (-1 = none).
let selK = -1, brushType = -1;

// caustics overlay: a <video> pixelated + thresholded into a moving alpha mask
// drawn on a separate canvas stacked above the scene (its own animation loop).
let cxVideo = null, cxURL = null, overlay = null, octx = null, cxBuf = null, cxBufCtx = null, cxRAF = 0;

// panel-lights overlay: animated LED pixels on their own top canvas + rAF loop.
let lightsCanvas = null, lightsCtx = null, lightsRAF = 0;

// glow-lights overlay (top, screen-blended): static radial gradients, re-rendered
// only when they change. selGlow = selected glow index, dragGlow while moving one.
let glowCanvas = null, glowCtx = null, selGlow = -1, dragGlow = -1;
let fullLitArmed = false, _glowSil = null;   // "full-light sprite" mode + reused silhouette canvas
let _lbuckets = null, _lbucketsN = 0;   // reused per-frame draw buckets (color × brightness)
const LX_LEVELS = 14;

/* ============================ generation ============================ */

// floor tiles, filled row-major so no variant equals its left/up neighbour
function genTiles(N, rng, nVariants){
  const g = new Array(N * N);
  for (let y = 0; y < N; y++){
    for (let x = 0; x < N; x++){
      const left = x > 0 ? g[y*N + x-1] : -1;
      const up   = y > 0 ? g[(y-1)*N + x] : -1;
      let pick;
      if (nVariants <= 1){ pick = 0; }
      else {
        // choose among variants that are neither the left nor the up tile
        const ok = [];
        for (let i = 0; i < nVariants; i++) if (i !== left && i !== up) ok.push(i);
        pick = ok[Math.floor(rng() * ok.length)];
      }
      g[y*N + x] = pick;
    }
  }
  return g;
}

// ---- procedural walls: rooms + corridors, some running off the edge ----
function genWallsProcedural(N, rng, density){
  const g = new Array(N * N).fill(false);
  const put   = (x,y) => { if (x>=0 && x<N && y>=0 && y<N) g[y*N+x] = true; };
  const clear = (x,y) => { if (x>=0 && x<N && y>=0 && y<N) g[y*N+x] = false; };

  function hrun(x0, x1, y, doors){
    const a = Math.min(x0,x1), b = Math.max(x0,x1);
    for (let x = a; x <= b; x++) put(x, y);
    for (let d = 0; d < doors; d++){
      if (b - a < 3) break;
      const gx = ri(rng, a+1, b-1); clear(gx, y);
      if (rng() < 0.5) clear(gx+1, y);
    }
  }
  function vrun(y0, y1, x, doors){
    const a = Math.min(y0,y1), b = Math.max(y0,y1);
    for (let y = a; y <= b; y++) put(x, y);
    for (let d = 0; d < doors; d++){
      if (b - a < 3) break;
      const gy = ri(rng, a+1, b-1); clear(x, gy);
      if (rng() < 0.5) clear(x, gy+1);
    }
  }

  // rooms (some poke past the border, so their walls run to the edge)
  const rooms = Math.round(2 + density * 6);
  for (let r = 0; r < rooms; r++){
    const rw = ri(rng, 4, Math.max(5, Math.floor(N/2)));
    const rh = ri(rng, 4, Math.max(5, Math.floor(N/2)));
    const rx = ri(rng, -3, N - 2);
    const ry = ri(rng, -3, N - 2);
    const x1 = rx + rw - 1, y1 = ry + rh - 1;
    hrun(rx, x1, ry, ri(rng,0,1));
    hrun(rx, x1, y1, ri(rng,0,1));
    vrun(ry, y1, rx, ri(rng,0,1));
    vrun(ry, y1, x1, ri(rng,0,1));
  }

  // straight corridors; ~40% span the whole chunk and connect edge-to-edge
  const corr = Math.round(1 + density * 5);
  for (let c = 0; c < corr; c++){
    if (rng() < 0.5){ // horizontal
      const y = ri(rng, 0, N-1);
      let x0 = 0, x1 = N-1;
      if (rng() > 0.4){ x0 = ri(rng,0,N-1); x1 = Math.min(N-1, x0 + ri(rng,3,N)); }
      hrun(x0, x1, y, ri(rng,1,2));
    } else {          // vertical
      const x = ri(rng, 0, N-1);
      let y0 = 0, y1 = N-1;
      if (rng() > 0.4){ y0 = ri(rng,0,N-1); y1 = Math.min(N-1, y0 + ri(rng,3,N)); }
      vrun(y0, y1, x, ri(rng,1,2));
    }
  }
  return g;
}

// ---- template walls (rm1..rm9): fixed 32x32, placed with a random flip ----
function genWallsTemplate(N, rng){
  const g = new Array(N * N).fill(false);
  const T = window.GNOM_TEMPLATES;
  if (!T) return g;
  const keys = Object.keys(T);
  const cells = T[keys[Math.floor(rng() * keys.length)]];
  const flip = ri(rng, 0, 3);              // same four orientations the game uses
  for (const [col, row] of cells){
    let cx, cy;
    switch (flip){
      case 0: cx = col;        cy = row;        break;
      case 1: cx = row;        cy = col;        break;
      case 2: cx = 31 - col;   cy = row;        break;
      case 3: cx = col;        cy = 31 - row;   break;
    }
    if (cx >= 0 && cx < N && cy >= 0 && cy < N) g[cy*N + cx] = true;
  }
  return g;
}

/* wall connectivity for autotiling, honouring the "open to the edge" rule:
   an off-grid neighbour counts as connected only when the wall runs straight
   into that edge (the opposite in-grid neighbour is also a wall), so chunks
   seam together without spurious openings on walls that merely skirt a border */
function wallAt(g, N, x, y){ return (x>=0 && x<N && y>=0 && y<N) && g[y*N+x]; }
function connected(g, N, x, y, dx, dy){
  const nx = x+dx, ny = y+dy;
  if (nx>=0 && nx<N && ny>=0 && ny<N) return g[ny*N+nx];
  return state.edgeOpen && wallAt(g, N, x-dx, y-dy);   // straight run into edge
}
function wallMask(g, N, x, y){
  let m = 0;
  if (connected(g,N,x,y, 0,-1)) m |= NN;
  if (connected(g,N,x,y, 1, 0)) m |= EE;
  if (connected(g,N,x,y, 0, 1)) m |= SS;
  if (connected(g,N,x,y,-1, 0)) m |= WW;
  return m;
}

// ---- sprite placement: only where the spawn box is clear of walls ----
function boxHitsWall(g, N, bx, by, bw, bh){
  const x0 = Math.floor(bx / TILE),  x1 = Math.floor((bx + bw - 1) / TILE);
  const y0 = Math.floor(by / TILE),  y1 = Math.floor((by + bh - 1) / TILE);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++)
      if (wallAt(g, N, tx, ty)) return true;
  return false;
}

function placeSprites(N, rng, wallGrid){
  const px = N * TILE;
  const out = [];
  A.sprites.forEach((sp, i) => {
    const cfg = state.spriteCfg[i];
    if (!cfg || !cfg.enabled || cfg.freq <= 0) return;
    const w = sp.w || 16, h = sp.h || 16;
    if (w > px || h > px) return;
    // desired count scales with chunk area; fractional part is a coin-flip
    const want = cfg.freq * state.spriteDensity * (N*N) / 1024;
    const count = Math.floor(want) + (rng() < (want - Math.floor(want)) ? 1 : 0);
    for (let n = 0; n < count; n++){
      for (let attempt = 0; attempt < 14; attempt++){    // a few tries, then give up
        const dx = Math.floor(rng() * (px - w + 1));
        const dy = Math.floor(rng() * (px - h + 1));
        const bw = Math.max(2, Math.round(w * cfg.boxScale));
        const bh = Math.max(2, Math.round(h * cfg.boxScale));
        const bx = dx + Math.round((w - bw) / 2);
        const by = dy + Math.round((h - bh) / 2);
        if (!boxHitsWall(wallGrid, N, bx, by, bw, bh)){
          out.push({ i, dx, dy, w, h, bx, by, bw, bh });
          break;
        }
      }
    }
  });
  out.sort((a,b) => (a.dy + a.h) - (b.dy + b.h));   // painter's order, back to front
  return out;
}

/* ============================ regen + draw ========================== */
function regen(){
  const N = Math.max(1, Math.round(state.size / TILE));
  state.N = N;
  const rng = mulberry32(state.seed);

  const ts = A.tilesets[state.tilesetIdx];
  state.tileGrid = genTiles(N, rng, ts ? ts.variants.length : 1);

  if (state.wallSource === 'tpl' && window.GNOM_TEMPLATES)
    state.wallGrid = genWallsTemplate(N, rng);
  else
    state.wallGrid = genWallsProcedural(N, rng, state.wallDensity);

  if (!(state.lockSprites && state.placements.length))
    state.placements = placeSprites(N, rng, state.wallGrid);

  buildLights();
  draw();
}

function draw(){
  if (state.showMaskTest) return drawMaskTest();

  const N = state.N, px = N * TILE;
  canvas.width = px; canvas.height = px;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, px, px);

  // 1) floor tiles
  const ts = A.tilesets[state.tilesetIdx];
  if (ts && ts.variants.length){
    const litless = state.lightsCfg.enabled;   // draw LED-removed copies; the overlay animates them
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++){
        const v = ts.variants[state.tileGrid[y*N + x]] || ts.variants[0];
        ctx.drawImage((litless && v._base) ? v._base : v._img, x*TILE, y*TILE, TILE, TILE);
      }
  }

  // 2) glass roof
  const glass = A.glass[state.glassIdx];
  if (state.glassOn && glass){
    ctx.globalAlpha = state.glassOp;
    for (let gy = 0; gy < px; gy += GLASS)
      for (let gx = 0; gx < px; gx += GLASS)
        ctx.drawImage(glass._img, gx, gy, GLASS, GLASS);
    ctx.globalAlpha = 1;
  }

  // 3) walls (autotiled)
  const ws = A.wallsets[state.wallsetIdx];
  if (ws){
    const g = state.wallGrid;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++){
        if (!g[y*N + x]) continue;
        const role = AUTOTILE[wallMask(g, N, x, y)] || '01';
        const piece = ws.roles[role] || ws.roles['01'] || firstRole(ws);
        if (piece) ctx.drawImage(piece._img, x*TILE, y*TILE, TILE, TILE);
      }
  }

  // 4) sprites  (skip the one being dragged — it's painted on top during the drag)
  state.placements.forEach((p, k) => {
    if (k === dragK) return;
    const sp = A.sprites[p.i];
    if (!sp || !sp._img) return;
    ctx.drawImage(sp._img, p.dx, p.dy, p.w, p.h);
  });

  // overlays
  if (state.showGrid)     drawGrid(px, TILE, 'rgba(255,255,255,.08)');
  if (state.showWallGrid) drawWallCells(N);
  if (state.showBoxes)    drawBoxes();

  // selected-sprite highlight (for Delete / clarity), except while dragging it
  if (selK >= 0 && selK < state.placements.length && dragK < 0){
    const p = state.placements[selK];
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(143,209,79,.95)';
    ctx.strokeRect(p.dx - 1.5, p.dy - 1.5, p.w + 3, p.h + 3);
  }

  renderGlows();
  updateHud();
  applyZoom();
}

function firstRole(ws){ const k = Object.keys(ws.roles)[0]; return k ? ws.roles[k] : null; }

function drawGrid(px, step, color){
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= px; i += step){ ctx.moveTo(i,0); ctx.lineTo(i,px); ctx.moveTo(0,i); ctx.lineTo(px,i); }
  ctx.stroke();
}
function drawWallCells(N){
  ctx.fillStyle = 'rgba(255,80,80,.28)';
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++)
      if (state.wallGrid[y*N+x]) ctx.fillRect(x*TILE, y*TILE, TILE, TILE);
}
function drawBoxes(){
  ctx.strokeStyle = 'rgba(120,220,255,.9)'; ctx.lineWidth = 1;
  for (const p of state.placements) ctx.strokeRect(p.bx+0.5, p.by+0.5, p.bw-1, p.bh-1);
}

// visual check of the autotile table: every mask 0..15 as one wall cell
function drawMaskTest(){
  const cell = 64, pad = 22, cols = 4, rows = 4;
  const w = cols*cell + (cols+1)*pad, h = rows*(cell+18) + (rows+1)*pad;
  canvas.width = w; canvas.height = h;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#12140f'; ctx.fillRect(0,0,w,h);
  const ws = A.wallsets[state.wallsetIdx];
  ctx.font = '11px monospace'; ctx.textAlign = 'center';
  for (let m = 0; m < 16; m++){
    const c = m % cols, r = (m / cols) | 0;
    const x = pad + c*(cell+pad), y = pad + r*(cell+18+pad);
    ctx.strokeStyle = '#333a29'; ctx.strokeRect(x-.5, y-.5, cell+1, cell+1);
    const role = AUTOTILE[m] || '01';
    const piece = ws && (ws.roles[role] || ws.roles['01']);
    if (piece) ctx.drawImage(piece._img, x, y, cell, cell);
    // connection ticks
    ctx.fillStyle = '#8fd14f';
    if (m & NN) ctx.fillRect(x+cell/2-3, y-5, 6, 5);
    if (m & SS) ctx.fillRect(x+cell/2-3, y+cell, 6, 5);
    if (m & EE) ctx.fillRect(x+cell, y+cell/2-3, 5, 6);
    if (m & WW) ctx.fillRect(x-5, y+cell/2-3, 5, 6);
    ctx.fillStyle = '#c7f59a';
    ctx.fillText(role, x+cell/2, y+cell+13);
  }
  applyZoom();
  el('hudSize').textContent = 'autotile test';
  el('hudSeed').textContent = A.wallsets[state.wallsetIdx] ? A.wallsets[state.wallsetIdx].name : '';
  el('hudSprites').textContent = '';
}

function applyZoom(){
  canvas.style.width  = (canvas.width  * state.zoom) + 'px';
  canvas.style.height = (canvas.height * state.zoom) + 'px';
  scheduleSave();                                   // every redraw/zoom ends here -> persist settings
}
function updateHud(){
  el('hudSize').textContent = `${state.N}×${state.N} tiles · ${state.N*TILE}px`;
  el('hudSeed').textContent = `seed ${state.seed}`;
  el('hudSprites').textContent = `${state.placements.length} sprites`;
}

/* ============================== UI ================================= */
const el = id => document.getElementById(id);

function buildSelects(){
  const tset = el('tileset'); tset.innerHTML = '';
  A.tilesets.forEach((t,i) => tset.append(new Option(`${t.name} (${t.variants.length})`, i)));
  tset.value = state.tilesetIdx;
  const wset = el('wallset'); wset.innerHTML = '';
  A.wallsets.forEach((w,i) => wset.append(new Option(`${w.name} (${Object.keys(w.roles).length})`, i)));
  wset.value = state.wallsetIdx;
  const gsel = el('glassSel'); gsel.innerHTML = '';
  A.glass.forEach((g,i) => gsel.append(new Option(g.name, i)));
  gsel.value = state.glassIdx;
}

/* ---- user-uploaded floor tiles (a per-browser "uploaded" tile set) --- */
const TILE_KEY = 'gnom_tiles_v1';

function ensureUploadedTileset(){
  let ts = A.tilesets.find(t => t.name === 'uploaded');
  if (!ts){ ts = { name: 'uploaded', variants: [], uploaded: true }; A.tilesets.push(ts); }
  return ts;
}
function addTileFromSrc(name, src){
  return loadImg(src).then(im => {
    const v = { name, w: im.naturalWidth||im.width, h: im.naturalHeight||im.height, src, _img: im, uploaded: true };
    ensureUploadedTileset().variants.push(v);
    scanTileLights(v);
  });
}
function persistTiles(){
  try {
    const ts = A.tilesets.find(t => t.name === 'uploaded');
    localStorage.setItem(TILE_KEY, JSON.stringify(ts ? ts.variants.map(v => ({ name: v.name, src: v.src })) : []));
  } catch (e) {}
}
async function loadPersistedTiles(){
  let arr = [];
  try { arr = JSON.parse(localStorage.getItem(TILE_KEY) || '[]'); } catch (e) { arr = []; }
  for (const t of arr){ try { await addTileFromSrc(t.name, t.src); } catch (e) {} }
}
function selectUploadedTileset(){
  const i = A.tilesets.findIndex(t => t.name === 'uploaded');
  if (i >= 0) state.tilesetIdx = i;
}
function handleTileFiles(files){
  const imgs = [...files].filter(f => f.type.startsWith('image/'));
  if (!imgs.length) return;
  let pending = imgs.length;
  const done = () => { if (--pending === 0){ persistTiles(); selectUploadedTileset(); buildSelects(); buildTileThumbs(); regen(); } };
  imgs.forEach(f => {
    const rd = new FileReader();
    rd.onload  = () => addTileFromSrc(f.name.replace(/\.[^.]+$/, ''), rd.result).then(done, done);
    rd.onerror = done;
    rd.readAsDataURL(f);
  });
}
function dropTilesetAt(idx){                       // remove a tileset, keep selection sane
  A.tilesets.splice(idx, 1);
  if (state.tilesetIdx === idx) state.tilesetIdx = 0;
  else if (state.tilesetIdx > idx) state.tilesetIdx--;
  if (state.tilesetIdx >= A.tilesets.length) state.tilesetIdx = 0;
}
function removeUploadedTile(vi){
  const ts = A.tilesets.find(t => t.name === 'uploaded');
  if (!ts) return;
  ts.variants.splice(vi, 1);
  if (!ts.variants.length) dropTilesetAt(A.tilesets.indexOf(ts));  // last one gone: drop the set
  persistTiles(); buildSelects(); buildTileThumbs(); regen();
}
function clearTiles(){
  const idx = A.tilesets.findIndex(t => t.name === 'uploaded');
  if (idx >= 0) dropTilesetAt(idx);
  try { localStorage.removeItem(TILE_KEY); } catch (e) {}
  buildSelects(); buildTileThumbs(); regen();
}
function buildTileThumbs(){
  const host = el('tileThumbs'); if (!host) return;
  host.innerHTML = '';
  const ts = A.tilesets.find(t => t.name === 'uploaded');
  el('clearTiles').style.display = (ts && ts.variants.length) ? '' : 'none';
  if (!ts) return;
  ts.variants.forEach((v, vi) => {
    const d = document.createElement('div'); d.className = 't';
    d.innerHTML = `<img src="${v.src}" alt="" title="${v.name} · ${v.w}×${v.h}"><button class="rm" title="remove">×</button>`;
    d.querySelector('.rm').onclick = () => removeUploadedTile(vi);
    host.append(d);
  });
}

/* ---- user-uploaded glass panes (added to the glass dropdown) --------- */
const GLASS_KEY = 'gnom_glass_v1';

function addGlassFromSrc(name, src){
  return loadImg(src).then(im => {
    A.glass.push({ name, w: im.naturalWidth||im.width, h: im.naturalHeight||im.height, src, _img: im, uploaded: true });
  });
}
function persistGlass(){
  try { localStorage.setItem(GLASS_KEY, JSON.stringify(A.glass.filter(g => g.uploaded).map(g => ({ name: g.name, src: g.src })))); } catch (e) {}
}
async function loadPersistedGlass(){
  let a = []; try { a = JSON.parse(localStorage.getItem(GLASS_KEY) || '[]'); } catch (e) { a = []; }
  for (const g of a){ try { await addGlassFromSrc(g.name, g.src); } catch (e) {} }
}
function handleGlassFiles(files){
  const imgs = [...files].filter(f => f.type.startsWith('image/'));
  if (!imgs.length) return;
  let pending = imgs.length;
  const done = () => { if (--pending === 0){ persistGlass(); state.glassIdx = A.glass.length - 1; state.glassOn = true; el('glassOn').checked = true; buildSelects(); buildGlassThumbs(); draw(); } };
  imgs.forEach(f => {
    const rd = new FileReader();
    rd.onload  = () => addGlassFromSrc(f.name.replace(/\.[^.]+$/, ''), rd.result).then(done, done);
    rd.onerror = done;
    rd.readAsDataURL(f);
  });
}
function fixIdxAfterRemoval(gi){                    // keep state.glassIdx valid after splicing gi
  if (state.glassIdx === gi) state.glassIdx = Math.min(gi, A.glass.length - 1);
  else if (state.glassIdx > gi) state.glassIdx--;
  if (state.glassIdx < 0) state.glassIdx = 0;
}
function removeUploadedGlass(gi){
  if (!A.glass[gi] || !A.glass[gi].uploaded) return;
  A.glass.splice(gi, 1); fixIdxAfterRemoval(gi);
  persistGlass(); buildSelects(); buildGlassThumbs(); draw();
}
function clearGlass(){
  for (let i = A.glass.length - 1; i >= 0; i--) if (A.glass[i].uploaded){ A.glass.splice(i, 1); fixIdxAfterRemoval(i); }
  try { localStorage.removeItem(GLASS_KEY); } catch (e) {}
  buildSelects(); buildGlassThumbs(); draw();
}
function buildGlassThumbs(){
  const host = el('glassThumbs'); if (!host) return;
  host.innerHTML = '';
  const ups = A.glass.map((g, i) => ({ g, i })).filter(o => o.g.uploaded);
  el('clearGlass').style.display = ups.length ? '' : 'none';
  ups.forEach(({ g, i }) => {
    const d = document.createElement('div'); d.className = 't';
    d.innerHTML = `<img src="${g.src}" alt="" title="${g.name} · ${g.w}×${g.h}"><button class="rm" title="remove">×</button>`;
    d.querySelector('.rm').onclick = () => removeUploadedGlass(i);
    host.append(d);
  });
}

/* ---- user-uploaded wall themes (pieces grouped by filename) ---------- */
const WALL_KEY = 'gnom_walls_v1';

function parseWallName(fname){
  const base = fname.replace(/\.[^.]+$/, '');
  const dash = base.indexOf('-');
  return dash >= 0 ? { theme: base.slice(0, dash), role: base.slice(dash + 1) } : { theme: 'uploaded', role: base };
}
function ensureWallset(theme){
  let ws = A.wallsets.find(w => w.name === theme);
  if (!ws){ ws = { name: theme, roles: {}, uploaded: true }; A.wallsets.push(ws); }
  return ws;
}
function addWallFromSrc(theme, role, src){
  return loadImg(src).then(im => {
    ensureWallset(theme).roles[role] = { w: im.naturalWidth||im.width, h: im.naturalHeight||im.height, src, _img: im };
  });
}
function persistWalls(){
  try {
    const out = [];
    A.wallsets.forEach(w => { if (w.uploaded) Object.keys(w.roles).forEach(role => out.push({ theme: w.name, role, src: w.roles[role].src })); });
    localStorage.setItem(WALL_KEY, JSON.stringify(out));
  } catch (e) {}
}
async function loadPersistedWalls(){
  let a = []; try { a = JSON.parse(localStorage.getItem(WALL_KEY) || '[]'); } catch (e) { a = []; }
  for (const w of a){ try { await addWallFromSrc(w.theme, w.role, w.src); } catch (e) {} }
}
function handleWallFiles(files){
  const imgs = [...files].filter(f => f.type.startsWith('image/'));
  if (!imgs.length) return;
  let pending = imgs.length, lastTheme = null;
  const done = () => { if (--pending === 0){ persistWalls(); if (lastTheme){ const i = A.wallsets.findIndex(w => w.name === lastTheme); if (i >= 0) state.wallsetIdx = i; } buildSelects(); buildWallThemes(); regen(); } };
  imgs.forEach(f => {
    const { theme, role } = parseWallName(f.name);
    lastTheme = theme;
    const rd = new FileReader();
    rd.onload  = () => addWallFromSrc(theme, role, rd.result).then(done, done);
    rd.onerror = done;
    rd.readAsDataURL(f);
  });
}
function dropWallsetAt(idx){
  A.wallsets.splice(idx, 1);
  if (state.wallsetIdx === idx) state.wallsetIdx = 0;
  else if (state.wallsetIdx > idx) state.wallsetIdx--;
  if (state.wallsetIdx >= A.wallsets.length) state.wallsetIdx = 0;
}
function removeUploadedWallset(theme){
  const idx = A.wallsets.findIndex(w => w.name === theme && w.uploaded);
  if (idx < 0) return;
  dropWallsetAt(idx);
  persistWalls(); buildSelects(); buildWallThemes(); regen();
}
function clearWalls(){
  for (let i = A.wallsets.length - 1; i >= 0; i--) if (A.wallsets[i].uploaded) dropWallsetAt(i);
  try { localStorage.removeItem(WALL_KEY); } catch (e) {}
  buildSelects(); buildWallThemes(); regen();
}
function buildWallThemes(){
  const host = el('wallThemes'); if (!host) return;
  host.innerHTML = '';
  const ups = A.wallsets.filter(w => w.uploaded);
  el('clearWalls').style.display = ups.length ? '' : 'none';
  ups.forEach(w => {
    const n = Object.keys(w.roles).length;
    const c = document.createElement('span'); c.className = 'chip';
    c.innerHTML = `${w.name} · ${n}/16<button class="rm" title="remove theme">×</button>`;
    c.querySelector('.rm').onclick = () => removeUploadedWallset(w.name);
    host.append(c);
  });
}

function buildSpriteList(){
  const host = el('spriteList'); host.innerHTML = '';
  el('spriteCount').textContent = `(${A.sprites.length})`;
  A.sprites.forEach((sp, i) => {
    const cfg = state.spriteCfg[i];
    const row = document.createElement('div');
    row.className = 'sprite' + (cfg.enabled ? '' : ' off');
    row.innerHTML = `
      <div class="thumb"><img src="${sp.src}" alt=""></div>
      <div class="meta">
        <div class="nm" title="${sp.name} · ${sp.w}×${sp.h}${sp.uploaded?' · uploaded':''}">${sp.uploaded?'↑ ':''}${sp.name}</div>
        <div class="ctrls">
          <input type="checkbox" ${cfg.enabled ? 'checked' : ''} data-k="enabled">
          <input type="range" min="0" max="8" step="0.25" value="${cfg.freq}" data-k="freq">
          <span class="tag">${cfg.freq.toFixed(2)}</span>
          <button class="place" data-i="${i}" title="place instances by clicking the map (arm, then click)">place</button>
        </div>
      </div>
      <div class="box" title="spawn box size (fraction of sprite)">
        box<input type="range" min="0.2" max="1" step="0.05" value="${cfg.boxScale}" data-k="boxScale">
        ${sp.uploaded ? '<button class="rm" title="remove this upload">×</button>' : ''}
      </div>`;
    row.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('input', () => {
        const k = inp.dataset.k;
        if (k === 'enabled'){ cfg.enabled = inp.checked; row.classList.toggle('off', !cfg.enabled); }
        else { cfg[k] = parseFloat(inp.value); if (k==='freq') row.querySelector('.tag').textContent = cfg.freq.toFixed(2); }
        if (sp.uploaded) persistUploads();
        regen();
      });
    });
    const rm = row.querySelector('.rm');
    if (rm) rm.addEventListener('click', () => removeUploadedAt(i));
    const placeBtn = row.querySelector('.place');
    placeBtn.classList.toggle('on', brushType === i);
    placeBtn.addEventListener('click', () => { brushType === i ? disarmBrush() : armBrush(i); });
    host.append(row);
  });
}

/* ---- user-uploaded sprites (runtime, remembered per-browser) -------- */
const UP_KEY = 'gnom_uploads_v1';

function addSpriteFromSrc(name, src, cfg){
  return loadImg(src).then(im => {
    A.sprites.push({ name, w: im.naturalWidth || im.width, h: im.naturalHeight || im.height, src, _img: im, uploaded: true });
    state.spriteCfg.push(Object.assign({ enabled: true, freq: 2, boxScale: 0.7 }, cfg || {}));
  });
}
function persistUploads(){
  try {
    const ups = [];
    A.sprites.forEach((s, i) => {
      if (!s.uploaded) return;
      const c = state.spriteCfg[i] || {};
      ups.push({ name: s.name, src: s.src, freq: c.freq, boxScale: c.boxScale, enabled: c.enabled });
    });
    localStorage.setItem(UP_KEY, JSON.stringify(ups));
  } catch (e) { /* storage full or blocked: uploads just won't persist */ }
}
async function loadPersistedUploads(){
  let ups = [];
  try { ups = JSON.parse(localStorage.getItem(UP_KEY) || '[]'); } catch (e) { ups = []; }
  for (const u of ups){
    try { await addSpriteFromSrc(u.name, u.src, { enabled: u.enabled !== false, freq: u.freq ?? 2, boxScale: u.boxScale ?? 0.7 }); } catch (e) {}
  }
}
function handleFiles(files){
  const imgs = [...files].filter(f => f.type.startsWith('image/'));
  if (!imgs.length) return;
  let pending = imgs.length;
  const done = () => { if (--pending === 0){ persistUploads(); state.placements = []; buildSpriteList(); regen(); } };
  imgs.forEach(f => {
    const rd = new FileReader();
    rd.onload  = () => addSpriteFromSrc(f.name.replace(/\.[^.]+$/, ''), rd.result).then(done, done);
    rd.onerror = done;
    rd.readAsDataURL(f);
  });
}
function removeUploadedAt(i){
  if (!A.sprites[i] || !A.sprites[i].uploaded) return;
  A.sprites.splice(i, 1); state.spriteCfg.splice(i, 1);
  // keep the manual arrangement: drop this type's instances, shift higher type-indices down
  state.placements = state.placements.filter(p => p.i !== i).map(p => (p.i > i ? (p.i--, p) : p));
  if (brushType === i) brushType = -1; else if (brushType > i) brushType--;
  selK = -1; dragK = -1;
  persistUploads(); buildSpriteList(); updateBrushUI(); regen();
}
function clearUploads(){
  for (let i = A.sprites.length - 1; i >= 0; i--)
    if (A.sprites[i].uploaded){ A.sprites.splice(i, 1); state.spriteCfg.splice(i, 1); }
  const n = A.sprites.length;
  state.placements = state.placements.filter(p => p.i < n);   // uploads are appended at the tail
  if (brushType >= n) brushType = -1;
  selK = -1; dragK = -1;
  try { localStorage.removeItem(UP_KEY); } catch (e) {}
  buildSpriteList(); updateBrushUI(); regen();
}

/* ---- remember settings across refreshes (per-browser) --------------- */
const SETTINGS_KEY = 'gnom_settings_v1';
let _saveTimer = null;
function scheduleSave(){ clearTimeout(_saveTimer); _saveTimer = setTimeout(saveSettings, 300); }
function snapshotSettings(){
  const s = {
    v: 1,
    seed: state.seed, size: state.size, zoom: state.zoom,
    glassOn: state.glassOn, glassOp: state.glassOp,
    wallSource: state.wallSource, wallDensity: state.wallDensity, edgeOpen: state.edgeOpen,
    spriteDensity: state.spriteDensity,
    showBoxes: state.showBoxes, lockSprites: state.lockSprites,
    showGrid: state.showGrid, showWallGrid: state.showWallGrid,
    tilesetName: A.tilesets[state.tilesetIdx]?.name,
    wallsetName: A.wallsets[state.wallsetIdx]?.name,
    glassName:   A.glass[state.glassIdx]?.name,
    caustics: { ...state.caustics },
    lightsCfg: { ...state.lightsCfg },
    glows: state.glows.map(g => ({ ...g })),
    glowDefaults: { ...state.glowDefaults },
    glowBlend: state.glowBlend,
    spriteCfg: {},
  };
  A.sprites.forEach((sp, i) => { const c = state.spriteCfg[i]; if (c) s.spriteCfg[sp.name] = { enabled: c.enabled, freq: c.freq, boxScale: c.boxScale }; });
  // a hand-made arrangement isn't reproducible from the seed, so store it
  if (state.lockSprites)
    s.placements = state.placements.map(p => ({ name: A.sprites[p.i]?.name, dx: p.dx, dy: p.dy, fullLit: !!p.fullLit })).filter(p => p.name);
  return s;
}
function saveSettings(){
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(snapshotSettings())); }
  catch (e) { /* storage full or blocked: settings just won't persist */ }
}
// apply a full settings object to the live viewer (used when clicking an example)
function loadSceneFrom(obj){
  if (!obj) return;
  applySettings(obj);
  buildSelects(); syncControls(); refreshTplAvailability(); updateBrushUI();
  regen(); applyZoom();
  updateLightsRun(); updateGlowBlend();
  scheduleSave();
}
function loadSettings(){
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch (e) { return null; }
}
function applySettings(s){
  if (!s) return false;
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d;
  state.seed         = num(s.seed, state.seed);
  state.size         = num(s.size, state.size);
  state.zoom         = num(s.zoom, state.zoom);
  state.glassOn      = s.glassOn !== false;
  state.glassOp      = num(s.glassOp, state.glassOp);
  state.wallSource   = (s.wallSource === 'tpl' || s.wallSource === 'proc') ? s.wallSource : state.wallSource;
  state.wallDensity  = num(s.wallDensity, state.wallDensity);
  state.edgeOpen     = s.edgeOpen !== false;
  state.spriteDensity = num(s.spriteDensity, state.spriteDensity);
  state.showBoxes    = !!s.showBoxes;
  state.lockSprites  = !!s.lockSprites;
  state.showGrid     = !!s.showGrid;
  state.showWallGrid = !!s.showWallGrid;
  const ti = A.tilesets.findIndex(t => t.name === s.tilesetName); if (ti >= 0) state.tilesetIdx = ti;
  const wi = A.wallsets.findIndex(w => w.name === s.wallsetName); if (wi >= 0) state.wallsetIdx = wi;
  const gi = A.glass.findIndex(g => g.name === s.glassName);       if (gi >= 0) state.glassIdx   = gi;
  if (s.caustics && typeof s.caustics === 'object'){
    const c = s.caustics, cc = state.caustics;
    cc.enabled = !!c.enabled;
    cc.pixel = num(c.pixel, cc.pixel);
    cc.speed = num(c.speed, cc.speed);
    cc.binary = c.binary !== false;
    cc.flip = !!c.flip;
    cc.threshold = num(c.threshold, cc.threshold);
    cc.opacity = num(c.opacity, cc.opacity);
    cc.blend = ['multiply', 'screen', 'normal'].includes(c.blend) ? c.blend : cc.blend;
    cc.color = typeof c.color === 'string' ? c.color : cc.color;
  }
  if (s.lightsCfg && typeof s.lightsCfg === 'object'){
    const c = s.lightsCfg, lc = state.lightsCfg;
    lc.enabled = c.enabled !== false;
    lc.speed = num(c.speed, lc.speed);
    lc.jitter = num(c.jitter, lc.jitter);
    lc.glow = num(c.glow, lc.glow);
    lc.vibrant = !!c.vibrant;
  }
  if (Array.isArray(s.glows)){
    state.glows = s.glows.filter(g => g && typeof g === 'object').map(g => ({
      x: num(g.x, 0), y: num(g.y, 0), rx: num(g.rx, 70), ry: num(g.ry, 70),
      rot: num(g.rot, 0), intensity: num(g.intensity, 1), temp: num(g.temp, 0.5),
    }));
  }
  if (s.glowDefaults && typeof s.glowDefaults === 'object'){
    const d = s.glowDefaults, gd = state.glowDefaults;
    gd.rx = num(d.rx, gd.rx); gd.ry = num(d.ry, gd.ry); gd.rot = num(d.rot, gd.rot);
    gd.intensity = num(d.intensity, gd.intensity); gd.temp = num(d.temp, gd.temp);
  }
  if (['overlay','soft-light','color-dodge','screen','lighten'].includes(s.glowBlend)) state.glowBlend = s.glowBlend;
  if (s.spriteCfg) A.sprites.forEach((sp, i) => {
    const c = s.spriteCfg[sp.name];
    if (c) state.spriteCfg[i] = { enabled: c.enabled !== false, freq: num(c.freq, 2), boxScale: num(c.boxScale, 0.7) };
  });
  if (state.lockSprites && Array.isArray(s.placements) && s.placements.length){
    const rebuilt = [];
    for (const pp of s.placements){
      const idx = A.sprites.findIndex(sp => sp.name === pp.name);
      if (idx >= 0){ const p = makePlacement(idx, pp.dx, pp.dy); if (pp.fullLit) p.fullLit = true; rebuilt.push(p); }
    }
    if (rebuilt.length) state.placements = rebuilt;
  }
  return true;
}
function syncControls(){                            // push restored state into the DOM controls
  el('seed').value = state.seed;
  el('size').value = state.size; el('sizeOut').textContent = state.size;
  el('zoom').value = state.zoom; el('zoomOut').textContent = state.zoom.toFixed(2) + '×';
  el('glassOn').checked = state.glassOn;
  el('glassOp').value = state.glassOp; el('glassOpOut').textContent = state.glassOp.toFixed(2);
  el('wallSource').value = state.wallSource;
  el('wallDensity').value = state.wallDensity; el('wallDensityOut').textContent = state.wallDensity.toFixed(2);
  el('edgeOpen').checked = state.edgeOpen;
  el('spriteDensity').value = state.spriteDensity; el('spriteDensityOut').textContent = state.spriteDensity.toFixed(2) + '×';
  el('showBoxes').checked = state.showBoxes;
  el('lockSprites').checked = state.lockSprites;
  el('showGrid').checked = state.showGrid;
  el('showWallGrid').checked = state.showWallGrid;
  el('tileset').value = state.tilesetIdx;
  el('wallset').value = state.wallsetIdx;
  el('glassSel').value = state.glassIdx;
  const c = state.caustics;
  el('cxOn').checked = c.enabled;
  el('cxPixel').value = c.pixel; el('cxPixelOut').textContent = c.pixel;
  el('cxSpeed').value = c.speed; el('cxSpeedOut').textContent = c.speed.toFixed(2) + '×';
  el('cxBinary').checked = c.binary;
  el('cxFlip').checked = c.flip;
  el('cxThresh').value = Math.round(c.threshold * 100); el('cxThreshOut').textContent = Math.round(c.threshold * 100) + '%';
  el('cxOpacity').value = c.opacity; el('cxOpacityOut').textContent = c.opacity.toFixed(2);
  el('cxBlend').value = c.blend;
  el('cxColor').value = c.color;
  const lc = state.lightsCfg;
  el('lxOn').checked = lc.enabled;
  el('lxVibrant').checked = lc.vibrant;
  el('lxSpeed').value = lc.speed; el('lxSpeedOut').textContent = lc.speed.toFixed(1) + '×';
  el('lxJitter').value = lc.jitter; el('lxJitterOut').textContent = lc.jitter.toFixed(2);
  el('lxGlow').value = lc.glow; el('lxGlowOut').textContent = lc.glow.toFixed(2);
  syncGlowEditor();
}

function refreshTplAvailability(){
  const hasT = !!window.GNOM_TEMPLATES;
  const fits = state.size === 1024;
  const opt = el('wallSource').querySelector('option[value=tpl]');
  opt.disabled = !hasT;
  el('tplHint').hidden = !(state.wallSource === 'tpl' && !fits);
  el('densityRow').style.display = state.wallSource === 'proc' ? '' : 'none';
}

/* -------- drag a placed sprite to position it exactly -------------- */
function canvasPos(e){
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * canvas.width, y: (e.clientY - r.top) / r.height * canvas.height };
}
function pickSprite(x, y){                          // topmost sprite under the point
  for (let k = state.placements.length - 1; k >= 0; k--){
    const p = state.placements[k];
    if (x >= p.dx && x < p.dx + p.w && y >= p.dy && y < p.dy + p.h) return k;
  }
  return -1;
}
function makePlacement(i, dx, dy){                  // a single sprite instance + its spawn box
  const sp = A.sprites[i]; const w = sp.w || 16, h = sp.h || 16;
  const s = state.spriteCfg[i]?.boxScale ?? 0.7;
  const bw = Math.max(2, Math.round(w * s)), bh = Math.max(2, Math.round(h * s));
  return { i, dx, dy, w, h, bw, bh, bx: dx + Math.round((w - bw) / 2), by: dy + Math.round((h - bh) / 2) };
}
function markManual(){                              // hand-editing implies "keep this arrangement"
  if (!state.lockSprites){ state.lockSprites = true; el('lockSprites').checked = true; }
}
function deletePlacement(k){
  if (k < 0 || k >= state.placements.length) return;
  state.placements.splice(k, 1);
  if (selK === k) selK = -1; else if (selK > k) selK--;
  if (dragK === k) dragK = -1; else if (dragK > k) dragK--;
  markManual(); draw();
}
function armBrush(i){ brushType = i; selK = -1; updateBrushUI(); draw(); }
function disarmBrush(){ brushType = -1; updateBrushUI(); }
function updateBrushUI(){
  document.querySelectorAll('#spriteList .place').forEach(b => b.classList.toggle('on', +b.dataset.i === brushType));
  const st = el('brushStatus');
  if (brushType >= 0 && A.sprites[brushType]){
    st.hidden = false;
    st.innerHTML = `Placing <b>${A.sprites[brushType].name}</b> — click the map to drop one. <button id="brushStop">stop</button>`;
    el('brushStop').onclick = disarmBrush;
  } else st.hidden = true;
  if (canvas) canvas.style.cursor = brushType >= 0 ? 'copy' : 'default';
}
function applyDragBox(p){                            // recompute spawn box after a move
  const s = state.spriteCfg[p.i]?.boxScale ?? 0.7;
  p.bw = Math.max(2, Math.round(p.w * s));
  p.bh = Math.max(2, Math.round(p.h * s));
  p.bx = p.dx + Math.round((p.w - p.bw) / 2);
  p.by = p.dy + Math.round((p.h - p.bh) / 2);
}
function paintDrag(x, y){
  const p = state.placements[dragK]; if (!p) return;
  const px = state.N * TILE;
  p.dx = Math.max(0, Math.min(px - p.w, Math.round(x - dragOff.x)));
  p.dy = Math.max(0, Math.min(px - p.h, Math.round(y - dragOff.y)));
  applyDragBox(p);
  ctx.drawImage(dragBG, 0, 0);                       // everything else, cached
  const sp = A.sprites[p.i];
  if (sp && sp._img) ctx.drawImage(sp._img, p.dx, p.dy, p.w, p.h);
  const onWall = boxHitsWall(state.wallGrid, state.N, p.bx, p.by, p.bw, p.bh);
  ctx.lineWidth = 2;
  ctx.strokeStyle = onWall ? 'rgba(255,80,80,.95)' : 'rgba(120,220,255,.95)';
  ctx.strokeRect(p.bx + 1, p.by + 1, p.bw - 2, p.bh - 2);
}
function bindCanvasDrag(){
  canvas.addEventListener('contextmenu', e => e.preventDefault());   // right-click = delete, no menu

  canvas.addEventListener('pointerdown', e => {
    if (state.showMaskTest) return;
    if (fullLitArmed) return;                        // armed for double-click only; don't drag/select
    const { x, y } = canvasPos(e);

    // glow lights are the top editable layer — they take priority
    if (e.button === 2){ const gi = hitGlow(x, y); if (gi >= 0){ deleteGlowAt(gi); e.preventDefault(); return; } }
    else if (e.button === 0){
      const gi = hitGlow(x, y);
      if (gi >= 0){
        selGlow = gi; dragGlow = gi;
        const gl = state.glows[gi]; glowDragOff = { x: x - gl.x, y: y - gl.y };
        syncGlowEditor(); renderGlows();
        try { canvas.setPointerCapture?.(e.pointerId); } catch (_) {}
        canvas.style.cursor = 'grabbing';
        e.preventDefault(); return;
      }
    }

    if (e.button === 2){                             // right-click: delete the sprite under cursor
      const k = pickSprite(x, y);
      if (k >= 0) deletePlacement(k);
      e.preventDefault(); return;
    }
    if (e.button !== 0) return;

    let k = pickSprite(x, y);
    if (k < 0 && brushType >= 0){                    // empty spot + armed brush: stamp a new instance
      const sp = A.sprites[brushType]; const w = sp.w || 16, h = sp.h || 16, px = state.N * TILE;
      const dx = Math.max(0, Math.min(px - w, Math.round(x - w / 2)));
      const dy = Math.max(0, Math.min(px - h, Math.round(y - h / 2)));
      state.placements.push(makePlacement(brushType, dx, dy));
      k = state.placements.length - 1;
      markManual();
    }
    if (k < 0){ if (selGlow >= 0){ selGlow = -1; syncGlowEditor(); renderGlows(); } return; }   // click empty = deselect glow

    selK = k; dragK = k;                             // begin dragging (also lets you fine-tune a just-placed one)
    dragOff = { x: x - state.placements[k].dx, y: y - state.placements[k].dy };
    markManual();
    draw();                                          // repaint scene minus the dragged sprite
    dragBG = document.createElement('canvas');
    dragBG.width = canvas.width; dragBG.height = canvas.height;
    dragBG.getContext('2d').drawImage(canvas, 0, 0);
    try { canvas.setPointerCapture?.(e.pointerId); } catch (_) {}
    canvas.style.cursor = 'grabbing';
    paintDrag(x, y);
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', e => {
    const { x, y } = canvasPos(e);
    if (dragGlow >= 0){
      const gl = state.glows[dragGlow], px = state.N * TILE;
      gl.x = Math.max(0, Math.min(px, x - glowDragOff.x));
      gl.y = Math.max(0, Math.min(px, y - glowDragOff.y));
      renderGlows(); return;
    }
    if (dragK < 0){
      const cursor = hitGlow(x, y) >= 0 ? 'move' : (pickSprite(x, y) >= 0 ? 'grab' : (brushType >= 0 ? 'copy' : 'default'));
      canvas.style.cursor = cursor;
      return;
    }
    paintDrag(x, y);
  });

  const end = () => {
    if (dragGlow >= 0){ dragGlow = -1; canvas.style.cursor = 'default'; scheduleSave(); return; }
    if (dragK < 0) return; dragK = -1; dragBG = null; canvas.style.cursor = brushType >= 0 ? 'copy' : 'default'; draw();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'Escape'){
      if (brushType >= 0) disarmBrush();
      if (fullLitArmed){ fullLitArmed = false; el('glFullLit').classList.remove('on'); canvas.style.cursor = 'default'; }
    }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selK >= 0){ e.preventDefault(); deletePlacement(selK); }
  });

  // double-click a sprite (while armed) to toggle "fully lit by the spotlight"
  canvas.addEventListener('dblclick', e => {
    if (!fullLitArmed || state.showMaskTest) return;
    const { x, y } = canvasPos(e);
    const k = pickSprite(x, y);
    if (k >= 0){ const p = state.placements[k]; p.fullLit = !p.fullLit; markManual(); draw(); scheduleSave(); }
    e.preventDefault();
  });
}

/* ================= caustics video overlay ========================== */
// tiny IndexedDB kv store — the video blob is too big for localStorage
function idbOpen(){
  return new Promise((res, rej) => {
    const r = indexedDB.open('gnom_media', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbSet(k, v){ try { const db = await idbOpen(); await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); } catch (e) {} }
async function idbGet(k){ try { const db = await idbOpen(); return await new Promise((res, rej) => { const rq = db.transaction('kv', 'readonly').objectStore('kv').get(k); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }); } catch (e) { return null; } }
async function idbDel(k){ try { const db = await idbOpen(); await new Promise(res => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(k); tx.oncomplete = res; tx.onerror = res; }); } catch (e) {} }

function hexToRgb(h){
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h || '');
  return m ? { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) } : { r: 13, g: 27, b: 46 };
}
function updateCausticsState(){ if (el('cxState')) el('cxState').textContent = (cxVideo && cxVideo.src) ? '· loaded' : ''; }
function updateCausticsStyle(){ if (overlay){ overlay.style.opacity = state.caustics.opacity; overlay.style.mixBlendMode = state.caustics.blend; } }
function updateCausticsPlayback(){ if (cxVideo) try { cxVideo.playbackRate = state.caustics.speed; } catch (e) {} }

function setCausticsVideo(blob){
  if (!cxVideo){
    cxVideo = document.createElement('video');
    cxVideo.muted = true; cxVideo.loop = true; cxVideo.playsInline = true; cxVideo.autoplay = true;
    cxVideo.style.display = 'none';
    document.body.appendChild(cxVideo);   // some browsers decode more reliably when attached
  }
  if (cxURL){ URL.revokeObjectURL(cxURL); cxURL = null; }
  cxURL = URL.createObjectURL(blob);
  cxVideo.src = cxURL;
  cxVideo.load();                        // kick the pipeline (a bare play() can stall at readyState 0)
  cxVideo.play().catch(() => {});
  updateCausticsPlayback();
  updateCausticsState();
  updateCausticsRun();
}
function handleCausticsFile(file){
  if (!file || !file.type.startsWith('video/')) return;
  idbSet('caustics', file);
  state.caustics.enabled = true; el('cxOn').checked = true;
  setCausticsVideo(file);
  scheduleSave();
}
function clearCaustics(){
  idbDel('caustics');
  if (cxURL){ URL.revokeObjectURL(cxURL); cxURL = null; }
  if (cxVideo){ cxVideo.pause?.(); cxVideo.removeAttribute('src'); cxVideo.load?.(); }
  state.caustics.enabled = false; el('cxOn').checked = false;
  updateCausticsState(); updateCausticsRun(); scheduleSave();
}
function updateCausticsRun(){
  const on = state.caustics.enabled;
  if (overlay) overlay.hidden = !on;
  if (on && cxVideo && cxVideo.src){ cxVideo.play?.().catch(() => {}); startCaustics(); }
  else stopCaustics();
}
function startCaustics(){ if (!cxRAF) cxRAF = requestAnimationFrame(causticsTick); }
function stopCaustics(){ if (cxRAF){ cancelAnimationFrame(cxRAF); cxRAF = 0; } if (octx && overlay) octx.clearRect(0, 0, overlay.width, overlay.height); }
function causticsTick(){ renderCaustics(); cxRAF = requestAnimationFrame(causticsTick); }

function renderCaustics(){
  const cx = state.caustics;
  if (!cx.enabled || !cxVideo || cxVideo.readyState < 2 || !cxVideo.videoWidth){
    if (octx && overlay) octx.clearRect(0, 0, overlay.width, overlay.height);
    return;
  }
  const chunkPx = state.N * TILE;
  const cell = Math.max(1, cx.pixel);
  const gw = Math.max(1, Math.round(chunkPx / cell)), gh = gw;   // square chunk
  if (cxBuf.width !== gw) cxBuf.width = gw;
  if (cxBuf.height !== gh) cxBuf.height = gh;
  cxBufCtx.drawImage(cxVideo, 0, 0, gw, gh);                     // downscale video -> pixel grid
  const img = cxBufCtx.getImageData(0, 0, gw, gh), d = img.data;
  const thr = cx.threshold * 255, c = hexToRgb(cx.color);
  for (let i = 0; i < d.length; i += 4){
    const lum = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
    let a;
    if (cx.binary) a = (cx.flip ? lum < thr : lum >= thr) ? 255 : 0;   // hard mask
    else           a = cx.flip ? 255 - lum : lum;                       // soft luminance
    d[i] = c.r; d[i+1] = c.g; d[i+2] = c.b; d[i+3] = a;
  }
  if (overlay.width !== gw) overlay.width = gw;
  if (overlay.height !== gh) overlay.height = gh;
  octx.putImageData(img, 0, 0);

  // spotlights block the caustics: erase the caustic mask inside each glow so
  // the shadows never lay over a spotlight (mapped into the caustic grid's scale)
  if (state.glows.length){
    const sc = gw / chunkPx;
    octx.globalCompositeOperation = 'destination-out';
    octx.fillStyle = '#000';
    for (const gl of state.glows){
      octx.save();
      octx.translate(gl.x * sc, gl.y * sc);
      octx.rotate(gl.rot || 0);
      octx.beginPath();
      octx.ellipse(0, 0, Math.max(0.5, gl.rx * sc), Math.max(0.5, gl.ry * sc), 0, 0, 6.2832);
      octx.fill();
      octx.restore();
    }
    octx.globalCompositeOperation = 'source-over';
  }
}

/* ================= blinking panel LEDs ============================= */
// an LED pixel is saturated AND bright — that separates it from the pale
// blue background (low saturation) and the dark navy wires (low brightness).
function isLightColor(r, g, b){
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const v = mx / 255, s = mx === 0 ? 0 : (mx - mn) / mx;
  return s >= 0.5 && v >= 0.6;
}
function neighborBg(d, w, h, x, y){                 // a nearby non-LED colour, to paint the LED out
  const offs = [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1],[0,-2],[0,2],[-2,0],[2,0]];
  for (const [dx, dy] of offs){
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    const i = (ny * w + nx) * 4;
    if (d[i+3] < 128) continue;
    if (!isLightColor(d[i], d[i+1], d[i+2])) return [d[i], d[i+1], d[i+2]];
  }
  return [197, 216, 240];                            // fallback: the pale panel blue
}
// scan a tile variant once: record its LED pixels (v._lights) and a copy with
// the LEDs painted out (v._base), drawn when the blink effect is on.
function scanTileLights(v){
  if (!v._img) { v._lights = []; v._base = null; return; }
  const w = v._img.naturalWidth || v.w || 32, h = v._img.naturalHeight || v.h || 32;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(v._img, 0, 0);
  let id; try { id = g.getImageData(0, 0, w, h); } catch (e) { v._lights = []; v._base = null; return; }
  const d = id.data, lights = [];
  const base = g.createImageData(w, h); base.data.set(d);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
    const i = (y * w + x) * 4;
    if (d[i+3] >= 128 && isLightColor(d[i], d[i+1], d[i+2])){
      lights.push({ x, y, r: d[i], g: d[i+1], b: d[i+2] });
      const bg = neighborBg(d, w, h, x, y);
      base.data[i] = bg[0]; base.data[i+1] = bg[1]; base.data[i+2] = bg[2]; base.data[i+3] = 255;
    }
  }
  v._lights = lights;
  if (lights.length){ const bc = document.createElement('canvas'); bc.width = w; bc.height = h; bc.getContext('2d').putImageData(base, 0, 0); v._base = bc; }
  else v._base = null;
}
function scanAllTiles(){ A.tilesets.forEach(t => t.variants.forEach(v => { if (v._lights === undefined) scanTileLights(v); })); }

// give a recolor tile the SAME LED positions as its overworldTile1 twin, but
// sampling its own palette's colour at each spot (identical layout, so positions
// carry over exactly — no need to re-detect on the new palette).
function applyLightPositions(v, refLights){
  if (!v._img) return;
  const w = v._img.naturalWidth || v.w || 32, h = v._img.naturalHeight || v.h || 32;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(v._img, 0, 0);
  let id; try { id = g.getImageData(0, 0, w, h); } catch (e) { return; }
  const d = id.data, base = g.createImageData(w, h); base.data.set(d);
  const lights = [];
  for (const l of refLights){
    const x = l.x, y = l.y; if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = (y * w + x) * 4;
    // own colour (this palette) + tile1's vibrant colour, so a toggle can pick either
    lights.push({ x, y, r: d[i], g: d[i+1], b: d[i+2], vr: l.r, vg: l.g, vb: l.b });
    const bg = neighborBg(d, w, h, x, y);
    base.data[i] = bg[0]; base.data[i+1] = bg[1]; base.data[i+2] = bg[2]; base.data[i+3] = 255;
  }
  v._lights = lights;
  if (lights.length){ const bc = document.createElement('canvas'); bc.width = w; bc.height = h; bc.getContext('2d').putImageData(base, 0, 0); v._base = bc; }
  else v._base = null;
}
// overworldTile2, overworldTile3, ... are palette recolors of overworldTile1 with
// the exact same layout, so they copy tile1's LED positions instead of re-detecting.
function inheritTileLights(){
  const ref = A.tilesets.find(t => t.name === 'overworldTile1');
  if (!ref) return;
  for (const ts of A.tilesets){
    if (ts.name === 'overworldTile1' || !/^overworldTile\d+$/.test(ts.name)) continue;
    for (const v of ts.variants){
      const m = /-(\w+)$/.exec(v.name); if (!m) continue;
      const v1 = ref.variants.find(r => r.name === `overworldTile1-${m[1]}`);
      if (v1 && v1._lights && v1._lights.length) applyLightPositions(v, v1._lights);
    }
  }
}

// gather every LED in the current chunk (skip cells hidden under a wall).
// Each light carries a colour index into state.lightPalette so the renderer can
// batch draws by colour+brightness instead of touching canvas state per pixel.
function buildLights(){
  state.lightList = [];
  state.lightPalette = [];
  const palMap = new Map();
  const palOf = (r, g, b) => { const key = `rgb(${r},${g},${b})`; let ci = palMap.get(key); if (ci === undefined){ ci = state.lightPalette.length; palMap.set(key, ci); state.lightPalette.push(key); } return ci; };
  const ts = A.tilesets[state.tilesetIdx]; if (!ts){ if (el('lxCount')) el('lxCount').textContent = ''; return; }
  const N = state.N;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
    if (state.wallGrid[y*N + x]) continue;
    const v = ts.variants[state.tileGrid[y*N + x]];
    if (!v || !v._lights || !v._lights.length) continue;
    for (const l of v._lights){
      const ciOwn = palOf(l.r, l.g, l.b);
      const ciVib = (l.vr !== undefined) ? palOf(l.vr, l.vg, l.vb) : ciOwn;   // tile1 twin colour if any
      state.lightList.push({
        x: x*TILE + l.x, y: y*TILE + l.y, ciOwn, ciVib,
        phase: Math.random() * 6.283,
        speed: 0.6 + Math.random() * 2.2,
        blinker: Math.random() < 0.5,               // ~half also blink fully off now and then
        blinkRate: 0.3 + Math.random() * 0.9,
        blinkThresh: -0.15 - Math.random() * 0.55,
        jit: 0.5 + Math.random() * 1.5,
      });
    }
  }
  if (el('lxCount')) el('lxCount').textContent = state.lightList.length ? `· ${state.lightList.length}` : '';
}
function lightBrightness(li, t){
  const L = state.lightsCfg;
  let b = 0.62 + 0.38 * Math.sin(t * li.speed * L.speed + li.phase);   // gentle pulse
  b += Math.sin(t * 9.3 * li.jit + li.phase * 2.3) * 0.3 * L.jitter;   // jitter
  if (li.blinker && Math.sin(t * li.blinkRate * L.speed + li.phase) < li.blinkThresh) b *= 0.06;  // blink off
  return b < 0 ? 0 : (b > 1 ? 1 : b);
}
function renderLights(){
  const L = state.lightsCfg, o = lightsCanvas, g = lightsCtx;
  if (!o) return;
  const px = state.N * TILE;
  if (o.width !== px){ o.width = px; o.height = px; }
  const list = state.lightList, pal = state.lightPalette;
  if (!L.enabled || !list.length){ g.clearRect(0, 0, o.width, o.height); return; }
  g.clearRect(0, 0, px, px);

  const np = pal.length, need = np * LX_LEVELS;
  if (_lbucketsN !== need){ _lbuckets = new Array(need); for (let i = 0; i < need; i++) _lbuckets[i] = []; _lbucketsN = need; }
  for (let i = 0; i < need; i++) _lbuckets[i].length = 0;

  const t = performance.now() / 1000, LV = LX_LEVELS - 1, vib = L.vibrant;
  for (let k = 0; k < list.length; k++){
    const li = list[k], b = lightBrightness(li, t);
    if (b <= 0.03) continue;
    const lvl = (b * LV) | 0;
    const ci = vib ? li.ciVib : li.ciOwn;
    _lbuckets[ci * LX_LEVELS + lvl].push(li.x, li.y);
  }
  // glow halo first (low alpha), then the bright cores on top — batched per bucket.
  // The 3×3 halo is the costly part, so skip it on very dense chunks to stay smooth.
  const glow = (list.length <= 4000) ? L.glow : 0;
  if (glow > 0){
    for (let ci = 0; ci < np; ci++){ g.fillStyle = pal[ci];
      for (let lvl = 1; lvl <= LV; lvl++){ const arr = _lbuckets[ci*LX_LEVELS + lvl]; if (!arr.length) continue;
        g.globalAlpha = Math.min(0.5, (lvl/LV) * 0.22 * glow);
        for (let j = 0; j < arr.length; j += 2) g.fillRect(arr[j]-1, arr[j+1]-1, 3, 3);
      }
    }
  }
  for (let ci = 0; ci < np; ci++){ g.fillStyle = pal[ci];
    for (let lvl = 1; lvl <= LV; lvl++){ const arr = _lbuckets[ci*LX_LEVELS + lvl]; if (!arr.length) continue;
      g.globalAlpha = lvl / LV;
      for (let j = 0; j < arr.length; j += 2) g.fillRect(arr[j], arr[j+1], 1, 1);
    }
  }
  g.globalAlpha = 1;

  // sprites block the lights behind them: erase lit pixels under each sprite's
  // actual (alpha) shape, so the sprite (on the layer below) reads as opaque.
  if (state.placements.length){
    g.globalCompositeOperation = 'destination-out';
    for (const p of state.placements){
      const sp = A.sprites[p.i];
      if (sp && sp._img) g.drawImage(sp._img, p.dx, p.dy, p.w, p.h);
    }
    g.globalCompositeOperation = 'source-over';
  }
}
function lightsTick(){ renderLights(); lightsRAF = requestAnimationFrame(lightsTick); }
function updateLightsRun(){
  if (!lightsCanvas) return;
  lightsCanvas.hidden = !state.lightsCfg.enabled;
  if (state.lightsCfg.enabled){ renderLights(); if (!lightsRAF) lightsRAF = requestAnimationFrame(lightsTick); }
  else { if (lightsRAF){ cancelAnimationFrame(lightsRAF); lightsRAF = 0; } lightsCtx && lightsCtx.clearRect(0, 0, lightsCanvas.width, lightsCanvas.height); }
}

/* ================= placeable glow lights =========================== */
let glowDragOff = { x: 0, y: 0 };
// colour temperature: 0 = cool blue-white, 0.5 = warm white, 1 = edison amber
function glowTempColor(t){
  t = Math.max(0, Math.min(1, t));
  const cool = [190, 214, 255], white = [255, 248, 240], warm = [255, 168, 70];
  const a = t < 0.5 ? cool : white, b = t < 0.5 ? white : warm, f = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  return [Math.round(a[0]+(b[0]-a[0])*f), Math.round(a[1]+(b[1]-a[1])*f), Math.round(a[2]+(b[2]-a[2])*f)];
}
// flat spotlight: a hard-edged (integer-scanline) ellipse filled uniformly, so
// the border is pixelated and it just lifts the scene brightness (screen blend).
function fillEllipseScanline(g, cx, cy, rx, ry, rot, px){
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const hy = Math.sqrt(rx*rx*sin*sin + ry*ry*cos*cos);         // rotated y half-extent
  const y0 = Math.max(0, Math.floor(cy - hy)), y1 = Math.min(px - 1, Math.ceil(cy + hy));
  const A = (cos*cos)/(rx*rx) + (sin*sin)/(ry*ry);
  for (let y = y0; y <= y1; y++){
    const dy = y + 0.5 - cy;
    const B = 2*dy*cos*sin*(1/(rx*rx) - 1/(ry*ry));
    const C = dy*dy*((sin*sin)/(rx*rx) + (cos*cos)/(ry*ry));
    const disc = B*B - 4*A*(C - 1);
    if (disc < 0) continue;
    const sq = Math.sqrt(disc), d1 = (-B - sq)/(2*A), d2 = (-B + sq)/(2*A);
    let xs = Math.max(0, Math.round(cx + Math.min(d1, d2)));
    let xe = Math.min(px - 1, Math.round(cx + Math.max(d1, d2)));
    if (xe >= xs) g.fillRect(xs, y, xe - xs + 1, 1);
  }
}
// a glow's effective light colour (with >1 whitening) and its alpha (intensity)
function glowLightRGBA(gl){
  let col = glowTempColor(gl.temp);
  const a = Math.min(1, gl.intensity);
  if (gl.intensity > 1){ const w = Math.min(1, gl.intensity - 1);
    col = [Math.round(col[0]+(255-col[0])*w), Math.round(col[1]+(255-col[1])*w), Math.round(col[2]+(255-col[2])*w)]; }
  return { rgb: `rgb(${col[0]},${col[1]},${col[2]})`, a };
}
function pointInGlow(gl, x, y){
  const dx = x - gl.x, dy = y - gl.y, c = Math.cos(gl.rot || 0), s = Math.sin(gl.rot || 0);
  const lx = dx*c + dy*s, ly = -dx*s + dy*c;
  return (lx*lx)/(gl.rx*gl.rx) + (ly*ly)/(gl.ry*gl.ry) <= 1;
}
// the spotlight a "full-light" sprite belongs to: the overlapping one whose centre is nearest
function glowForSprite(p){
  const cx = p.dx + p.w/2, cy = p.dy + p.h/2;
  let best = -1, bestD = Infinity;
  for (let i = 0; i < state.glows.length; i++){
    const gl = state.glows[i];
    const overlaps = pointInGlow(gl, cx, cy) || pointInGlow(gl, cx, p.dy + p.h) || pointInGlow(gl, cx, p.dy)
      || pointInGlow(gl, p.dx, cy) || pointInGlow(gl, p.dx + p.w, cy)
      || (gl.x >= p.dx && gl.x <= p.dx + p.w && gl.y >= p.dy && gl.y <= p.dy + p.h);
    if (!overlaps) continue;
    const d = (gl.x - cx)**2 + (gl.y - cy)**2;
    if (d < bestD){ bestD = d; best = i; }
  }
  return best;
}
function renderGlows(){
  const o = glowCanvas, g = glowCtx; if (!o) return;
  const px = state.N * TILE; if (o.width !== px){ o.width = px; o.height = px; }
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, px, px);
  for (const gl of state.glows){
    const lc = glowLightRGBA(gl);
    g.globalAlpha = lc.a; g.fillStyle = lc.rgb;
    fillEllipseScanline(g, gl.x, gl.y, Math.max(1, gl.rx), Math.max(1, gl.ry), gl.rot || 0, px);
  }
  g.globalAlpha = 1;

  // "full-light" sprites: paint the whole sprite silhouette with its spotlight's
  // colour so tall sprites that poke out of the beam still read as fully lit
  for (const p of state.placements){
    if (!p.fullLit) continue;
    const gi = glowForSprite(p); if (gi < 0) continue;
    const sp = A.sprites[p.i]; if (!sp || !sp._img) continue;
    const lc = glowLightRGBA(state.glows[gi]);
    const tw = Math.max(1, Math.round(p.w)), th = Math.max(1, Math.round(p.h));
    if (!_glowSil) _glowSil = document.createElement('canvas');
    _glowSil.width = tw; _glowSil.height = th;
    const tctx = _glowSil.getContext('2d');
    tctx.clearRect(0, 0, tw, th); tctx.imageSmoothingEnabled = false;
    tctx.globalCompositeOperation = 'source-over'; tctx.drawImage(sp._img, 0, 0, tw, th);
    tctx.globalCompositeOperation = 'source-in'; tctx.fillStyle = lc.rgb; tctx.fillRect(0, 0, tw, th);
    tctx.globalCompositeOperation = 'source-over';
    g.globalAlpha = lc.a;
    g.drawImage(_glowSil, Math.round(p.dx), Math.round(p.dy), tw, th);
    g.globalAlpha = 1;
  }
  if (selGlow >= 0 && state.glows[selGlow]){           // dashed selection outline (editing only)
    const gl = state.glows[selGlow];
    g.save(); g.translate(gl.x, gl.y); g.rotate(gl.rot || 0);
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.5; g.setLineDash([6, 4]);
    g.beginPath(); g.ellipse(0, 0, Math.max(1, gl.rx), Math.max(1, gl.ry), 0, 0, 6.2832); g.stroke();
    g.restore();
  }
}
function hitGlow(x, y){                                  // topmost glow whose ellipse contains the point
  for (let i = state.glows.length - 1; i >= 0; i--){
    const gl = state.glows[i], dx = x - gl.x, dy = y - gl.y;
    const cos = Math.cos(gl.rot || 0), sin = Math.sin(gl.rot || 0);
    const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;
    const rx = Math.max(1, gl.rx), ry = Math.max(1, gl.ry);
    if ((lx*lx)/(rx*rx) + (ly*ly)/(ry*ry) <= 1) return i;
  }
  return -1;
}
function glowEditTarget(){ return (selGlow >= 0 && state.glows[selGlow]) ? state.glows[selGlow] : state.glowDefaults; }
function syncGlowEditor(){
  const g = glowEditTarget();
  el('glRx').value = g.rx; el('glRxOut').textContent = Math.round(g.rx);
  el('glRy').value = g.ry; el('glRyOut').textContent = Math.round(g.ry);
  const deg = Math.round((g.rot || 0) * 180 / Math.PI);
  el('glRot').value = deg; el('glRotOut').textContent = deg + '°';
  el('glInt').value = g.intensity; el('glIntOut').textContent = g.intensity.toFixed(2);
  el('glTemp').value = g.temp;
  el('glBlend').value = state.glowBlend;
  el('glCount').textContent = state.glows.length ? `· ${state.glows.length}${selGlow >= 0 ? ' (1 selected)' : ''}` : '';
}
function addGlow(){
  const px = state.N * TILE, d = state.glowDefaults;
  state.glows.push({ x: px/2, y: px/2, rx: d.rx, ry: d.ry, rot: d.rot, intensity: d.intensity, temp: d.temp });
  selGlow = state.glows.length - 1;
  syncGlowEditor(); renderGlows(); scheduleSave();
}
function deleteGlowAt(i){
  if (i < 0 || i >= state.glows.length) return;
  state.glows.splice(i, 1);
  if (selGlow === i) selGlow = -1; else if (selGlow > i) selGlow--;
  if (dragGlow === i) dragGlow = -1; else if (dragGlow > i) dragGlow--;
  syncGlowEditor(); renderGlows(); scheduleSave();
}
function deleteSelectedGlow(){ if (selGlow >= 0) deleteGlowAt(selGlow); }
function updateGlowBlend(){ if (glowCanvas) glowCanvas.style.mixBlendMode = state.glowBlend; }

/* ================= record example (WebM) =========================== */
let recording = false;
let sessionExampleSettings = null, committedExampleSettings = null;
// flatten every live layer into one buffer, reproducing the CSS blend stack
function compositeScene(rctx, size){
  rctx.imageSmoothingEnabled = false;
  rctx.globalCompositeOperation = 'source-over'; rctx.globalAlpha = 1;
  rctx.clearRect(0, 0, size, size);
  rctx.drawImage(canvas, 0, 0, size, size);                              // chunk (tiles/glass/walls/sprites)
  if (state.caustics.enabled && overlay && !overlay.hidden && overlay.width > 1){
    rctx.globalCompositeOperation = state.caustics.blend;
    rctx.globalAlpha = state.caustics.opacity;
    rctx.drawImage(overlay, 0, 0, size, size);
    rctx.globalAlpha = 1; rctx.globalCompositeOperation = 'source-over';
  }
  if (state.lightsCfg.enabled && lightsCanvas && !lightsCanvas.hidden)
    rctx.drawImage(lightsCanvas, 0, 0, size, size);                      // LEDs (normal)
  if (glowCanvas && state.glows.length){
    rctx.globalCompositeOperation = state.glowBlend;                     // spotlights (blend)
    rctx.drawImage(glowCanvas, 0, 0, size, size);
    rctx.globalCompositeOperation = 'source-over';
  }
}
function setRecUI(on, text){
  const o = el('recOverlay'); if (o){ o.hidden = !on; if (on) el('recText').textContent = text; }
  const b = el('recExample'); if (b){ b.disabled = on; b.textContent = on ? 'Recording…' : '● Record 30s example (WebM)'; }
}
function finishExample(blob){
  if (!blob || !blob.size) return;
  const url = URL.createObjectURL(blob);
  const v = el('exampleVid');
  v.src = url; el('exampleBanner').hidden = false;
  el('exampleCap').textContent = `example · ${(blob.size/1048576).toFixed(1)} MB · click to load`;
  v.play?.().catch(() => {});
  const a = document.createElement('a'); a.href = url; a.download = 'gnominium_example.webm'; a.click();
  // also save the scene settings so clicking the example loads it (and so it can be committed site-wide)
  if (sessionExampleSettings){
    const jb = new Blob([JSON.stringify(sessionExampleSettings)], { type: 'application/json' });
    const ja = document.createElement('a'); ja.href = URL.createObjectURL(jb); ja.download = 'gnominium_example.json'; ja.click();
  }
}
function recordExample(durationSec, onDone){
  if (recording) return;
  durationSec = durationSec || 30;
  if (typeof MediaRecorder === 'undefined'){ alert('Recording is not supported in this browser.'); return; }
  const size = state.N * TILE;
  const rec = document.createElement('canvas'); rec.width = size; rec.height = size;
  const rctx = rec.getContext('2d');
  const stream = rec.captureStream(30);
  let mime = 'video/webm;codecs=vp9';
  if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm;codecs=vp8';
  if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm';
  let mr;
  try { mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8000000 }); }
  catch (e){ mr = new MediaRecorder(stream); }
  const parts = [];
  mr.ondataavailable = e => { if (e.data && e.data.size) parts.push(e.data); };
  mr.onstop = () => { recording = false; setRecUI(false, ''); const blob = new Blob(parts, { type: 'video/webm' }); finishExample(blob); if (onDone) onDone(blob); };
  sessionExampleSettings = snapshotSettings();          // the scene as recorded, for click-to-load
  recording = true;
  const start = performance.now();
  function tick(){
    if (!recording) return;
    compositeScene(rctx, size);
    const left = durationSec - (performance.now() - start) / 1000;
    setRecUI(true, `Recording example… ${Math.ceil(Math.max(0, left))}s`);
    if (left <= 0){ try { mr.stop(); } catch (e){} return; }
    requestAnimationFrame(tick);
  }
  mr.start();
  setRecUI(true, `Recording example… ${durationSec}s`);
  requestAnimationFrame(tick);
}
function loadCommittedExample(){
  const v = el('exampleVid'), b = el('exampleBanner');
  if (!v) return;
  v.addEventListener('error', () => { if ((v.currentSrc || '').indexOf('example.webm') >= 0) b.hidden = true; });
  v.addEventListener('loadeddata', () => {
    b.hidden = false;
    if ((v.currentSrc || '').indexOf('example.webm') >= 0) el('exampleCap').textContent = 'example · click to load';
  });
  v.src = 'example.webm';                 // committed site-wide example (404 => banner stays hidden)
  // its scene settings, so clicking the example loads it into the viewer
  fetch('example.json').then(r => r.ok ? r.json() : null).then(j => { if (j) committedExampleSettings = j; }).catch(() => {});
  // click the example -> load that scene into the viewer
  b.addEventListener('click', () => {
    const obj = sessionExampleSettings || committedExampleSettings;
    if (!obj) return;
    loadSceneFrom(obj);
    el('stageInner')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

function bindUI(){
  el('reroll').onclick = () => { state.seed = (Math.random()*1e9)|0; el('seed').value = state.seed; regen(); };
  el('recExample').onclick = () => recordExample(30);
  el('seed').onchange = e => { state.seed = parseInt(e.target.value)||0; regen(); };
  el('copySeed').onclick = () => { navigator.clipboard?.writeText(String(state.seed)); };

  let timer = null;
  el('autoCycle').onchange = e => {
    clearInterval(timer);
    if (e.target.checked) timer = setInterval(() => el('reroll').click(), Math.max(150, +el('autoMs').value||900));
  };
  el('autoMs').onchange = () => { if (el('autoCycle').checked){ el('autoCycle').checked=false; el('autoCycle').onchange({target:{checked:false}}); el('autoCycle').checked=true; el('autoCycle').onchange({target:{checked:true}}); } };

  el('size').oninput = e => { state.size = +e.target.value; el('sizeOut').textContent = state.size; refreshTplAvailability(); regen(); };
  el('zoom').oninput = e => { state.zoom = +e.target.value; el('zoomOut').textContent = state.zoom.toFixed(2)+'×'; applyZoom(); };
  el('fit').onclick = fitZoom;

  el('tileset').onchange = e => { state.tilesetIdx = +e.target.value; regen(); };
  el('wallset').onchange = e => { state.wallsetIdx = +e.target.value; draw(); };
  el('glassSel').onchange = e => { state.glassIdx = +e.target.value; draw(); };
  el('glassOn').onchange = e => { state.glassOn = e.target.checked; draw(); };
  el('glassOp').oninput = e => { state.glassOp = +e.target.value; el('glassOpOut').textContent = state.glassOp.toFixed(2); draw(); };

  el('wallSource').onchange = e => { state.wallSource = e.target.value; refreshTplAvailability(); regen(); };
  el('wallDensity').oninput = e => { state.wallDensity = +e.target.value; el('wallDensityOut').textContent = state.wallDensity.toFixed(2); regen(); };
  el('edgeOpen').onchange = e => { state.edgeOpen = e.target.checked; draw(); };

  el('spriteDensity').oninput = e => { state.spriteDensity = +e.target.value; el('spriteDensityOut').textContent = state.spriteDensity.toFixed(2)+'×'; regen(); };
  el('showBoxes').onchange = e => { state.showBoxes = e.target.checked; draw(); };
  el('lockSprites').onchange = e => { state.lockSprites = e.target.checked; scheduleSave(); };

  el('uploadBtn').onclick = () => el('spriteUpload').click();
  el('spriteUpload').onchange = e => { handleFiles(e.target.files); e.target.value = ''; };
  el('clearUploads').onclick = clearUploads;

  // dropping on a section's own upload row routes to that type (not the global sprite drop)
  const dropZone = (rowId, handler) => {
    const row = el(rowId);
    row.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); });
    row.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer?.files?.length) handler(e.dataTransfer.files); });
  };

  el('tileUploadBtn').onclick = () => el('tileUpload').click();
  el('tileUpload').onchange = e => { handleTileFiles(e.target.files); e.target.value = ''; };
  el('clearTiles').onclick = clearTiles;
  dropZone('tileUploadRow', handleTileFiles);

  el('glassUploadBtn').onclick = () => el('glassUpload').click();
  el('glassUpload').onchange = e => { handleGlassFiles(e.target.files); e.target.value = ''; };
  el('clearGlass').onclick = clearGlass;
  dropZone('glassUploadRow', handleGlassFiles);

  el('wallUploadBtn').onclick = () => el('wallUpload').click();
  el('wallUpload').onchange = e => { handleWallFiles(e.target.files); e.target.value = ''; };
  el('clearWalls').onclick = clearWalls;
  dropZone('wallUploadRow', handleWallFiles);

  // caustics overlay
  el('cxOn').onchange = e => { state.caustics.enabled = e.target.checked; updateCausticsRun(); scheduleSave(); };
  el('cxUploadBtn').onclick = () => el('cxUpload').click();
  el('cxUpload').onchange = e => { if (e.target.files[0]) handleCausticsFile(e.target.files[0]); e.target.value = ''; };
  el('cxClear').onclick = clearCaustics;
  dropZone('cxUploadRow', files => { if (files[0]) handleCausticsFile(files[0]); });
  el('cxPixel').oninput = e => { state.caustics.pixel = +e.target.value; el('cxPixelOut').textContent = e.target.value; scheduleSave(); };
  el('cxSpeed').oninput = e => { state.caustics.speed = +e.target.value; el('cxSpeedOut').textContent = (+e.target.value).toFixed(2) + '×'; updateCausticsPlayback(); scheduleSave(); };
  el('cxBinary').onchange = e => { state.caustics.binary = e.target.checked; scheduleSave(); };
  el('cxFlip').onchange = e => { state.caustics.flip = e.target.checked; scheduleSave(); };
  el('cxThresh').oninput = e => { state.caustics.threshold = +e.target.value / 100; el('cxThreshOut').textContent = e.target.value + '%'; scheduleSave(); };
  el('cxOpacity').oninput = e => { state.caustics.opacity = +e.target.value; el('cxOpacityOut').textContent = (+e.target.value).toFixed(2); updateCausticsStyle(); scheduleSave(); };
  el('cxBlend').onchange = e => { state.caustics.blend = e.target.value; updateCausticsStyle(); scheduleSave(); };
  el('cxColor').oninput = e => { state.caustics.color = e.target.value; scheduleSave(); };

  // panel lights
  el('lxOn').onchange = e => { state.lightsCfg.enabled = e.target.checked; draw(); updateLightsRun(); scheduleSave(); };
  el('lxSpeed').oninput = e => { state.lightsCfg.speed = +e.target.value; el('lxSpeedOut').textContent = (+e.target.value).toFixed(1) + '×'; scheduleSave(); };
  el('lxJitter').oninput = e => { state.lightsCfg.jitter = +e.target.value; el('lxJitterOut').textContent = (+e.target.value).toFixed(2); scheduleSave(); };
  el('lxGlow').oninput = e => { state.lightsCfg.glow = +e.target.value; el('lxGlowOut').textContent = (+e.target.value).toFixed(2); scheduleSave(); };
  el('lxVibrant').onchange = e => { state.lightsCfg.vibrant = e.target.checked; renderLights(); scheduleSave(); };

  // glow lights
  el('glAdd').onclick = addGlow;
  el('glDelete').onclick = deleteSelectedGlow;
  el('glRx').oninput = e => { glowEditTarget().rx = +e.target.value; el('glRxOut').textContent = e.target.value; renderGlows(); scheduleSave(); };
  el('glRy').oninput = e => { glowEditTarget().ry = +e.target.value; el('glRyOut').textContent = e.target.value; renderGlows(); scheduleSave(); };
  el('glRot').oninput = e => { glowEditTarget().rot = (+e.target.value) * Math.PI / 180; el('glRotOut').textContent = e.target.value + '°'; renderGlows(); scheduleSave(); };
  el('glInt').oninput = e => { glowEditTarget().intensity = +e.target.value; el('glIntOut').textContent = (+e.target.value).toFixed(2); renderGlows(); scheduleSave(); };
  el('glTemp').oninput = e => { glowEditTarget().temp = +e.target.value; renderGlows(); scheduleSave(); };
  el('glBlend').onchange = e => { state.glowBlend = e.target.value; updateGlowBlend(); scheduleSave(); };
  el('glFullLit').onclick = () => {
    fullLitArmed = !fullLitArmed;
    el('glFullLit').classList.toggle('on', fullLitArmed);
    if (canvas) canvas.style.cursor = fullLitArmed ? 'cell' : 'default';
  };
  // drag & drop image files anywhere on the tool
  const dz = document.getElementById('app');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', e => { if (e.target === dz) dz.classList.remove('drag'); });
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files); });

  el('showGrid').onchange = e => { state.showGrid = e.target.checked; draw(); };
  el('showWallGrid').onchange = e => { state.showWallGrid = e.target.checked; draw(); };
  el('showMaskTest').onchange = e => { state.showMaskTest = e.target.checked; draw(); };
  el('export').onclick = exportPng;

  window.addEventListener('keydown', e => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT'){ e.preventDefault(); el('reroll').click(); }
  });

  bindCanvasDrag();
}

function fitZoom(){
  const stage = el('stage');
  const avail = Math.min(stage.clientWidth, stage.clientHeight) - 80;
  const z = Math.max(0.1, Math.min(3, avail / (state.N * TILE)));
  state.zoom = Math.round(z*20)/20;
  el('zoom').value = state.zoom; el('zoomOut').textContent = state.zoom.toFixed(2)+'×';
  applyZoom();
}

function exportPng(){
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url; a.download = `gnominium_chunk_${state.N}x${state.N}_seed${state.seed}.png`;
  a.click();
}

/* ============================== init =============================== */
async function init(){
  canvas = el('chunk'); ctx = canvas.getContext('2d');
  overlay = el('caustics'); octx = overlay.getContext('2d');
  cxBuf = document.createElement('canvas'); cxBufCtx = cxBuf.getContext('2d', { willReadFrequently: true });
  lightsCanvas = el('lights'); lightsCtx = lightsCanvas.getContext('2d');
  glowCanvas = el('glow'); glowCtx = glowCanvas.getContext('2d');

  // decode every embedded png into an <img> once
  const jobs = [];
  A.tilesets.forEach(t => t.variants.forEach(v => jobs.push(loadImg(v.src).then(im => v._img = im))));
  A.wallsets.forEach(w => Object.values(w.roles).forEach(r => jobs.push(loadImg(r.src).then(im => r._img = im))));
  A.glass.forEach(g => jobs.push(loadImg(g.src).then(im => g._img = im)));
  A.sprites.forEach(s => jobs.push(loadImg(s.src).then(im => s._img = im)));
  await Promise.all(jobs);

  state.spriteCfg = A.sprites.map(() => ({ enabled: true, freq: 2, boxScale: 0.7 }));
  await loadPersistedUploads();   // re-attach sprites uploaded in this browser before
  await loadPersistedTiles();     // ...uploaded floor tiles
  await loadPersistedGlass();     // ...uploaded glass panes
  await loadPersistedWalls();     // ...uploaded wall themes
  scanAllTiles();                 // find the LED pixels in every tile variant
  inheritTileLights();            // overworldTile2+ copy tile1's LED positions

  // default glass = the built-in "...2" pane the game uses (built-ins come first)
  const g2 = A.glass.findIndex(g => !g.uploaded && /2\b|2$|glass-?0?2/i.test(g.name));
  state.glassIdx = g2 >= 0 ? g2 : 0;

  // restore the last session's settings (seed reproduces the same chunk)
  const restored = applySettings(loadSettings());

  buildSelects();
  buildSpriteList();
  buildTileThumbs();
  buildGlassThumbs();
  buildWallThemes();
  bindUI();
  refreshTplAvailability();
  updateBrushUI();
  syncControls();

  regen();
  if (restored) applyZoom(); else fitZoom();   // keep the saved zoom; only auto-fit on a fresh start

  updateLightsRun();               // start the LED blink loop
  updateGlowBlend();               // apply the spotlight blend mode
  loadCommittedExample();          // show the site-wide example at top if one is committed

  // restore the caustics video (stored in IndexedDB) and start its overlay
  updateCausticsStyle();
  const vid = await idbGet('caustics');
  if (vid) setCausticsVideo(vid); else updateCausticsRun();
}

if (!A.tilesets.length && !A.wallsets.length){
  document.getElementById('stageInner').innerHTML =
    '<p style="color:#c7f59a;max-width:30em">No assets loaded. Run <code>scan-assets.bat</code> to build <code>assets.js</code>, then refresh.</p>';
} else {
  init();
}
