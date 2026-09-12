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
};

let canvas, ctx;

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
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++){
        const v = ts.variants[state.tileGrid[y*N + x]] || ts.variants[0];
        ctx.drawImage(v._img, x*TILE, y*TILE, TILE, TILE);
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

  // 4) sprites
  for (const p of state.placements){
    const sp = A.sprites[p.i];
    if (!sp || !sp._img) continue;
    ctx.drawImage(sp._img, p.dx, p.dy, p.w, p.h);
  }

  // overlays
  if (state.showGrid)     drawGrid(px, TILE, 'rgba(255,255,255,.08)');
  if (state.showWallGrid) drawWallCells(N);
  if (state.showBoxes)    drawBoxes();

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
    ensureUploadedTileset().variants.push({ name, w: im.naturalWidth||im.width, h: im.naturalHeight||im.height, src, _img: im, uploaded: true });
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
  persistUploads(); state.placements = []; buildSpriteList(); regen();
}
function clearUploads(){
  for (let i = A.sprites.length - 1; i >= 0; i--)
    if (A.sprites[i].uploaded){ A.sprites.splice(i, 1); state.spriteCfg.splice(i, 1); }
  try { localStorage.removeItem(UP_KEY); } catch (e) {}
  state.placements = []; buildSpriteList(); regen();
}

function refreshTplAvailability(){
  const hasT = !!window.GNOM_TEMPLATES;
  const fits = state.size === 1024;
  const opt = el('wallSource').querySelector('option[value=tpl]');
  opt.disabled = !hasT;
  el('tplHint').hidden = !(state.wallSource === 'tpl' && !fits);
  el('densityRow').style.display = state.wallSource === 'proc' ? '' : 'none';
}

function bindUI(){
  el('reroll').onclick = () => { state.seed = (Math.random()*1e9)|0; el('seed').value = state.seed; regen(); };
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
  el('lockSprites').onchange = e => { state.lockSprites = e.target.checked; };

  el('uploadBtn').onclick = () => el('spriteUpload').click();
  el('spriteUpload').onchange = e => { handleFiles(e.target.files); e.target.value = ''; };
  el('clearUploads').onclick = clearUploads;

  el('tileUploadBtn').onclick = () => el('tileUpload').click();
  el('tileUpload').onchange = e => { handleTileFiles(e.target.files); e.target.value = ''; };
  el('clearTiles').onclick = clearTiles;
  // tile drop zone: dropping on this row adds tiles (and not sprites)
  const trow = el('tileUploadRow');
  trow.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); });
  trow.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer?.files?.length) handleTileFiles(e.dataTransfer.files); });
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

  // decode every embedded png into an <img> once
  const jobs = [];
  A.tilesets.forEach(t => t.variants.forEach(v => jobs.push(loadImg(v.src).then(im => v._img = im))));
  A.wallsets.forEach(w => Object.values(w.roles).forEach(r => jobs.push(loadImg(r.src).then(im => r._img = im))));
  A.glass.forEach(g => jobs.push(loadImg(g.src).then(im => g._img = im)));
  A.sprites.forEach(s => jobs.push(loadImg(s.src).then(im => s._img = im)));
  await Promise.all(jobs);

  state.spriteCfg = A.sprites.map(() => ({ enabled: true, freq: 2, boxScale: 0.7 }));
  await loadPersistedUploads();   // re-attach sprites uploaded in this browser before
  await loadPersistedTiles();     // ...and any uploaded floor tiles

  // default glass = the "...2" pane the game uses, if present (set once)
  const g2 = A.glass.findIndex(g => /2\b|2$|glass-?0?2/i.test(g.name));
  state.glassIdx = g2 >= 0 ? g2 : 0;

  buildSelects();
  buildSpriteList();
  buildTileThumbs();
  bindUI();
  refreshTplAvailability();

  el('seed').value = state.seed;
  el('sizeOut').textContent = state.size;
  el('zoomOut').textContent = state.zoom.toFixed(2)+'×';

  regen();
  fitZoom();
}

if (!A.tilesets.length && !A.wallsets.length){
  document.getElementById('stageInner').innerHTML =
    '<p style="color:#c7f59a;max-width:30em">No assets loaded. Run <code>scan-assets.bat</code> to build <code>assets.js</code>, then refresh.</p>';
} else {
  init();
}
