// Wasapok Castle — dark stone medieval textures (cobblestone, blocks, wood, torches).
import * as THREE from 'three';

const TILE = 128;

// Medieval palette
export const CAST = {
  stoneL:  '#5a544a',   // warm grey stone
  stoneM:  '#3e3a32',   // mid stone
  stoneD:  '#231f1a',   // deep shadow
  mortar:  '#1c1812',
  mossy:   '#48563a',
  woodL:   '#7a4c20',
  woodM:   '#4a2e14',
  woodD:   '#2a1808',
  iron:    '#3a3530',
  brass:   '#b88a3a',
  brassLt: '#e0b860',
  gold:    '#d4a64c',
  flame:   '#ffae5a',
  flameHot:'#ffe89a',
  parchment:'#d8c896',
  banner:  '#7a1818',  // crimson
  bannerLt:'#a83030',
  bannerGold:'#d4a64c',
  blood:   '#3a0a0a',
};

function rng(seed) {
  let s = seed | 0;
  return () => { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 0) / 4294967296); };
}
function makeCanvas(w = TILE, h = TILE) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function nearestTex(canvas, repeat = [1,1]) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ===== WALL: irregular stone blocks — semi-matte chrome =====
function drawStoneBlocks(ctx, seed = 1, accent = null) {
  const r = rng(seed);
  // cool dark mortar
  ctx.fillStyle = '#0e1012';
  ctx.fillRect(0, 0, TILE, TILE);
  // staggered courses of blocks
  const courseH = 22;
  for (let y = 0; y < TILE; y += courseH) {
    const off = ((y / courseH) % 2) * 24;
    for (let x = -32; x < TILE + 32; x += 36) {
      const bx = x + off + r() * 2 - 1;
      const by = y + r() * 2 - 1;
      const bw = 32 + r() * 4;
      const bh = courseH - 2 - r() * 2;
      // chrome: cool blue-grey, varied per block
      const base = 88 + Math.floor(r() * 42);
      const tint = accent && r() < 0.05;
      ctx.fillStyle = tint ? accent : `rgb(${base}, ${base + 5}, ${base + 12})`;
      ctx.fillRect(bx, by, bw, bh);
      // sharp chrome highlight on top edge (overhead light catch)
      ctx.fillStyle = `rgba(215,230,255,0.38)`;
      ctx.fillRect(bx, by, bw, 2);
      // subtle mid-band reflection
      ctx.fillStyle = `rgba(170,195,220,0.10)`;
      ctx.fillRect(bx, by + Math.floor(bh * 0.35), bw, 1);
      // shadow bottom (matte absorption)
      ctx.fillStyle = `rgba(0,0,0,0.55)`;
      ctx.fillRect(bx, by + bh - 2, bw, 2);
      // left-edge directional glint
      ctx.fillStyle = `rgba(200,220,245,0.13)`;
      ctx.fillRect(bx, by, 1, bh);
      // surface micro-variation for matte quality
      for (let k = 0; k < 8; k++) {
        const px = bx + r() * bw;
        const py = by + r() * bh;
        ctx.fillStyle = r() > 0.5 ? `rgba(255,255,255,0.07)` : `rgba(0,0,0,0.07)`;
        ctx.fillRect(px, py, 1 + Math.floor(r() * 2), 1);
      }
      // oxidation streak (dark blue-grey run, replaces moss)
      if (r() < 0.18) {
        const sx = bx + r() * (bw - 3);
        ctx.fillStyle = `rgba(70,85,105,0.38)`;
        ctx.fillRect(sx, by + 2, 2, bh - 3);
      }
    }
  }
  // cool vignette
  const grad = ctx.createLinearGradient(0, 0, 0, TILE);
  grad.addColorStop(0, 'rgba(0,0,0,0.06)');
  grad.addColorStop(1, 'rgba(0,0,0,0.36)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TILE, TILE);
}

// ===== FLOOR: cobblestone =====
function drawCobblestone(ctx, seed = 10) {
  const r = rng(seed);
  // dark mortar base
  ctx.fillStyle = CAST.mortar;
  ctx.fillRect(0, 0, TILE, TILE);
  // worley-ish cobbles
  const points = [];
  for (let i = 0; i < 22; i++) points.push([r() * TILE, r() * TILE, 50 + r() * 30]);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let best = Infinity, bi = 0;
      for (let i = 0; i < points.length; i++) {
        const dx = x - points[i][0], dy = y - points[i][1];
        const d = dx*dx + dy*dy;
        if (d < best) { best = d; bi = i; }
      }
      const p = points[bi];
      const edge = Math.sqrt(best) > 11 ? 0 : 1;
      ctx.fillStyle = edge
        ? `rgb(${p[2]-10}, ${p[2]-14}, ${p[2]-22})`
        : 'rgb(20, 18, 14)';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // wear / shine on tops
  for (let i = 0; i < points.length; i++) {
    const [px, py] = points[i];
    ctx.fillStyle = 'rgba(255,230,200,0.06)';
    ctx.beginPath(); ctx.ellipse(px, py - 4, 8, 3, 0, 0, Math.PI*2); ctx.fill();
  }
}

// ===== CEILING: dark wood beams + plaster =====
function drawWoodCeiling(ctx, seed = 20) {
  const r = rng(seed);
  // dark plaster between beams
  ctx.fillStyle = '#1c1612';
  ctx.fillRect(0, 0, TILE, TILE);
  // 2 horizontal beams
  const beamH = 18;
  for (const y of [16, 92]) {
    ctx.fillStyle = CAST.woodM;
    ctx.fillRect(0, y, TILE, beamH);
    // grain
    for (let i = 0; i < 14; i++) {
      const gy = y + 2 + r() * (beamH - 4);
      ctx.fillStyle = `rgba(0,0,0,${0.15 + r()*0.2})`;
      ctx.fillRect(0, gy, TILE, 1);
    }
    // bottom edge shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, y + beamH - 1, TILE, 1);
    // top hint
    ctx.fillStyle = 'rgba(255,200,140,0.07)';
    ctx.fillRect(0, y, TILE, 1);
  }
}

// ===== PORTAL-STYLE WALL PANEL — beveled white chrome panels with thin dark seams =====
function drawPortalPanels(ctx, seed = 30) {
  const r = rng(seed);
  // Dark seam base showing through the gaps
  ctx.fillStyle = '#15171b';
  ctx.fillRect(0, 0, TILE, TILE);

  const cells = 2;            // 2x2 panels per tile
  const cell  = TILE / cells; // 64
  const gap   = 2;            // pixels of dark seam around each panel

  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const px = cx * cell + gap;
      const py = cy * cell + gap;
      const w  = cell - gap * 2;

      // Vertical gradient — slightly brighter top, dimmer bottom (matte chrome)
      const grd = ctx.createLinearGradient(0, py, 0, py + w);
      grd.addColorStop(0,   '#eef0f4');
      grd.addColorStop(0.5, '#dde1e6');
      grd.addColorStop(1,   '#c4c8d0');
      ctx.fillStyle = grd;
      ctx.fillRect(px, py, w, w);

      // Top + left bevel highlight (sharp white edge, then softer secondary)
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillRect(px, py, w, 1);
      ctx.fillRect(px, py, 1, w);
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      ctx.fillRect(px, py + 1, w - 1, 1);
      ctx.fillRect(px + 1, py, 1, w - 1);

      // Bottom + right bevel shadow
      ctx.fillStyle = 'rgba(0,0,0,0.50)';
      ctx.fillRect(px, py + w - 1, w, 1);
      ctx.fillRect(px + w - 1, py, 1, w);
      ctx.fillStyle = 'rgba(0,0,0,0.20)';
      ctx.fillRect(px + 1, py + w - 2, w - 2, 1);
      ctx.fillRect(px + w - 2, py + 1, 1, w - 2);

      // Faint chrome reflection band near the top
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(px + 2, py + 14, w - 4, 1);

      // Small surface scuffs
      for (let k = 0; k < 4; k++) {
        const sx = px + 3 + r() * (w - 6);
        const sy = py + 3 + r() * (w - 6);
        const sw = 1 + Math.floor(r() * 3);
        ctx.fillStyle = `rgba(180,185,195,${0.08 + r() * 0.10})`;
        ctx.fillRect(sx, sy, sw, 1);
      }

      // Corner screws/markers
      const cps = [[4, 4], [w - 6, 4], [4, w - 6], [w - 6, w - 6]];
      for (const [dx, dy] of cps) {
        ctx.fillStyle = 'rgba(75, 80, 90, 0.7)';
        ctx.fillRect(px + dx, py + dy, 2, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(px + dx + 1, py + dy + 1, 1, 1);
      }
    }
  }
}

// ===== GLOWING FLOOR PANEL — single bright LED-blue square per tile, dark seams =====
function drawGlowPanel(ctx, seed = 50) {
  const r = rng(seed);
  // Dark seam base (the gaps between tiles)
  ctx.fillStyle = '#080a0e';
  ctx.fillRect(0, 0, TILE, TILE);

  const gap   = 4;
  const inner = TILE - gap * 2;

  // Panel base — dim cool blue (the unlit substrate)
  ctx.fillStyle = '#3a5878';
  ctx.fillRect(gap, gap, inner, inner);

  // Radial bright centre — the LED illumination falls off toward the edges
  const cx = TILE / 2, cy = TILE / 2;
  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, inner * 0.55);
  grd.addColorStop(0,    'rgba(230, 245, 255, 0.85)');
  grd.addColorStop(0.45, 'rgba(170, 215, 250, 0.55)');
  grd.addColorStop(1.0,  'rgba(80, 130, 180, 0.0)');
  ctx.fillStyle = grd;
  ctx.fillRect(gap, gap, inner, inner);

  // Inner shimmer band (slight overall lift in the middle)
  ctx.fillStyle = 'rgba(200, 230, 255, 0.20)';
  ctx.fillRect(gap + 12, gap + 12, inner - 24, inner - 24);

  // Bevel — top/left highlight, bottom/right shadow
  ctx.fillStyle = 'rgba(255, 255, 255, 0.30)';
  ctx.fillRect(gap, gap, inner, 1);
  ctx.fillRect(gap, gap, 1, inner);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(gap, gap + inner - 1, inner, 1);
  ctx.fillRect(gap + inner - 1, gap, 1, inner);

  // Slight surface noise (panels aren't perfectly uniform)
  for (let k = 0; k < 12; k++) {
    const sx = gap + 4 + r() * (inner - 8);
    const sy = gap + 4 + r() * (inner - 8);
    ctx.fillStyle = `rgba(70, 100, 140, ${0.10 + r() * 0.12})`;
    ctx.fillRect(sx, sy, 1 + Math.floor(r() * 2), 1);
  }

  // Bright pinpoint LEDs at corners
  const corners = [
    [gap + 6,         gap + 6],
    [TILE - gap - 8,  gap + 6],
    [gap + 6,         TILE - gap - 8],
    [TILE - gap - 8,  TILE - gap - 8],
  ];
  for (const [dx, dy] of corners) {
    ctx.fillStyle = 'rgba(230, 245, 255, 0.40)';
    ctx.fillRect(dx - 1, dy - 1, 4, 4);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(dx, dy, 2, 2);
  }
}

// ===== GLASS FLOOR PANEL — clear glass with grey/blue rivets and panel borders =====
function drawGlassPanel(ctx) {
  const S = TILE;
  ctx.clearRect(0, 0, S, S);

  const cells = 2, cell = S / cells, gap = 3;

  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const px = cx * cell + gap, py = cy * cell + gap, w = cell - gap * 2;

      // Very faint glass tint
      ctx.fillStyle = 'rgba(140, 175, 210, 0.08)';
      ctx.fillRect(px, py, w, w);

      // Panel border — grey-blue
      const bw = 2;
      ctx.fillStyle = 'rgba(85, 120, 160, 0.88)';
      ctx.fillRect(px, py, w, bw);
      ctx.fillRect(px, py + w - bw, w, bw);
      ctx.fillRect(px, py, bw, w);
      ctx.fillRect(px + w - bw, py, bw, w);

      // Inner bevel glint
      ctx.fillStyle = 'rgba(160, 200, 235, 0.40)';
      ctx.fillRect(px + bw, py + bw, w - bw * 2, 1);
      ctx.fillRect(px + bw, py + bw, 1, w - bw * 2);

      // Rivets at corners
      const rivetPts = [
        [px + 6, py + 6], [px + w - 7, py + 6],
        [px + 6, py + w - 7], [px + w - 7, py + w - 7],
      ];
      for (const [rx, ry] of rivetPts) {
        ctx.fillStyle = 'rgba(65, 100, 145, 0.95)';
        ctx.beginPath(); ctx.arc(rx, ry, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(155, 195, 230, 0.70)';
        ctx.beginPath(); ctx.arc(rx - 0.5, ry - 0.5, 1.2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // Seam cross at tile centre
  ctx.fillStyle = 'rgba(85, 120, 160, 0.55)';
  ctx.fillRect(S / 2 - 1, gap, 2, S - gap * 2);
  ctx.fillRect(gap, S / 2 - 1, S - gap * 2, 2);
}

const cache = {};

// Shared kind→draw dispatcher. Either getter below accepts any of these kinds.
//   'chrome' — Portal-style white chrome panels
//   'glass'  — clear glass panels with grey/blue rivets (floor)
//   'glow'   — glowing cool LED-blue panels (pair with an emissive material)
//   'stone'  — original medieval block masonry  (preserved for fallback)
//   'cobble' — original medieval cobblestone    (preserved for fallback)
function drawByKind(kind, ctx) {
  switch (kind) {
    case 'chrome': drawPortalPanels(ctx);        break;
    case 'glass':  drawGlassPanel(ctx);          break;
    case 'glow':   drawGlowPanel(ctx);           break;
    case 'stone':  drawStoneBlocks(ctx, 1, null); break;
    case 'cobble': drawCobblestone(ctx);         break;
    default:       drawPortalPanels(ctx);        break;
  }
}

// Wall texture — defaults to glowing LED panels (was chrome before the swap).
export function getWallTexture(kind = 'glow') {
  const key = 'w_' + kind;
  if (cache[key]) return cache[key];
  const c = makeCanvas(TILE, TILE);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  drawByKind(kind, ctx);
  cache[key] = nearestTex(c, [1, 1]);
  return cache[key];
}

// Floor texture — defaults to white chrome panels (was glow before the swap).
export function getFloorTexture(kind = 'chrome') {
  const key = 'f_' + kind;
  if (cache[key]) return cache[key];
  const c = makeCanvas(TILE, TILE);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  drawByKind(kind, ctx);
  cache[key] = nearestTex(c, [1, 1]);
  return cache[key];
}

export function getCeilingTexture() {
  if (cache.ceil) return cache.ceil;
  const c = makeCanvas(TILE, TILE);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  drawWoodCeiling(ctx);
  cache.ceil = nearestTex(c, [1, 1]); return cache.ceil;
}

// ===== TORCH SPRITE =====
export function makeTorchTexture() {
  if (cache.torch) return cache.torch;
  const w = 64, h = 128;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  // iron bracket
  ctx.fillStyle = CAST.iron;
  ctx.fillRect(26, 64, 12, 50);
  ctx.fillStyle = '#1a1612';
  ctx.fillRect(26, 110, 12, 4);
  // wooden handle
  ctx.fillStyle = CAST.woodM;
  ctx.fillRect(28, 50, 8, 22);
  ctx.fillStyle = CAST.woodD;
  for (let i = 0; i < 3; i++) ctx.fillRect(28, 54 + i*6, 8, 1);
  // cup
  ctx.fillStyle = CAST.iron;
  ctx.fillRect(22, 44, 20, 8);
  ctx.fillStyle = '#0a0806';
  ctx.fillRect(24, 44, 16, 3);
  // flame — layered
  const flame = [
    { col: '#5a1a04', rects: [[26,16,12,30],[24,28,16,16]] },
    { col: '#cc4a10', rects: [[27,20,10,24],[25,30,14,12]] },
    { col: CAST.flame, rects: [[28,24,8,18],[27,32,10,8]] },
    { col: '#ffd870', rects: [[29,28,6,12]] },
    { col: CAST.flameHot, rects: [[30,32,4,6]] },
  ];
  for (const { col, rects } of flame) {
    ctx.fillStyle = col;
    for (const [x,y,w2,h2] of rects) ctx.fillRect(x, y, w2, h2);
  }
  // hot core sparkles
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(31, 34, 2, 2);
  cache.torch = new THREE.CanvasTexture(c);
  cache.torch.magFilter = THREE.NearestFilter;
  cache.torch.minFilter = THREE.NearestFilter;
  cache.torch.colorSpace = THREE.SRGBColorSpace;
  return cache.torch;
}

// ===== DIRECTIONAL SIGN (engraved wood with iron studs) =====
export function makeSignTexture(label) {
  const w = 512, h = 160;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  // wood plank base
  ctx.fillStyle = CAST.woodM;
  ctx.fillRect(0, 0, w, h);
  // grain
  for (let y = 0; y < h; y += 6) {
    ctx.fillStyle = `rgba(0,0,0,${0.15 + Math.random()*0.15})`;
    ctx.fillRect(0, y, w, 1);
  }
  // iron border
  ctx.strokeStyle = CAST.iron; ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  // studs in corners
  const studs = [[24,24],[w-32,24],[24,h-32],[w-32,h-32]];
  for (const [sx, sy] of studs) {
    ctx.fillStyle = CAST.iron;
    ctx.fillRect(sx, sy, 14, 14);
    ctx.fillStyle = '#0a0806';
    ctx.fillRect(sx + 4, sy + 4, 6, 6);
    ctx.fillStyle = '#5a504a';
    ctx.fillRect(sx + 5, sy + 5, 2, 2);
  }
  // text (carved/burnt)
  ctx.fillStyle = '#0c0804';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 56px "MedievalSharp", "Cinzel", serif`;
  // shadow
  ctx.fillText(label, w/2 + 1, h/2 + 2);
  ctx.fillStyle = CAST.parchment;
  ctx.fillText(label, w/2, h/2);

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ===== BANNER (crimson with gold sigil) =====
export function makeBannerTexture(sigil = '✦') {
  const w = 256, h = 512;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  // banner background
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, CAST.blood);
  grad.addColorStop(0.5, CAST.banner);
  grad.addColorStop(1, CAST.blood);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // gold border
  ctx.strokeStyle = CAST.gold; ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.strokeStyle = CAST.brassLt; ctx.lineWidth = 1;
  ctx.strokeRect(14, 14, w - 28, h - 28);
  // sigil
  ctx.fillStyle = CAST.gold;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `900 180px "Cinzel", serif`;
  ctx.fillText(sigil, w/2, h * 0.36);
  // motto strip
  ctx.fillStyle = CAST.gold;
  ctx.fillRect(28, h * 0.62, w - 56, 4);
  ctx.fillRect(28, h * 0.78, w - 56, 4);
  ctx.fillStyle = CAST.parchment;
  ctx.font = `600 22px "Cinzel", serif`;
  ctx.fillText('WASAPOK', w/2, h * 0.70);
  // shadow folds (vertical streaks)
  for (let x = 0; x < w; x += 4) {
    ctx.fillStyle = `rgba(0,0,0,${0.05 + Math.random()*0.07})`;
    ctx.fillRect(x, 0, 1, h);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ===== PORTAL SHIMMER (animated glow for the wasapok doorway) =====
export function makePortalTexture() {
  const size = 256;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  // radial glow
  const grad = ctx.createRadialGradient(size/2, size/2, 10, size/2, size/2, size/2);
  grad.addColorStop(0, 'rgba(180,220,255,1)');
  grad.addColorStop(0.4, 'rgba(60,120,200,0.7)');
  grad.addColorStop(0.7, 'rgba(20,60,140,0.3)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  // ringed pattern (mystic)
  for (let r = 30; r < size/2; r += 18) {
    ctx.strokeStyle = `rgba(220,240,255,${0.3 - r*0.001})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(size/2, size/2, r, 0, Math.PI*2); ctx.stroke();
  }
  // sparkles
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI*2;
    const r = 20 + Math.random() * (size/2 - 30);
    const x = size/2 + Math.cos(a) * r;
    const y = size/2 + Math.sin(a) * r;
    ctx.fillStyle = `rgba(255,255,255,${0.4 + Math.random()*0.4})`;
    ctx.fillRect(x, y, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ===== STAINED GLASS WINDOW (placeholder, used in library/chapel) =====
export function makeStainedGlass(seed = 1) {
  const w = 256, h = 384;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const r = rng(seed);
  // lead grid background
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(0, 0, w, h);
  // panels
  const cols = 4, rows = 6;
  const palette = ['#2a4a8a', '#7a1a1a', '#1a6a3a', '#8a6a1a', '#4a2a8a', '#1a4a6a'];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * (w / cols), py = y * (h / rows);
      const pw = w / cols, ph = h / rows;
      ctx.fillStyle = palette[Math.floor(r() * palette.length)];
      ctx.fillRect(px + 2, py + 2, pw - 4, ph - 4);
      // highlight
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(px + 4, py + 4, pw - 8, 2);
    }
  }
  // arch crown
  ctx.fillStyle = '#0a0a14';
  ctx.beginPath(); ctx.arc(w/2, 30, w/2, Math.PI, 0); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
