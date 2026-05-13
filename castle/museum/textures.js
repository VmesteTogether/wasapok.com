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

const cache = {};

export function getWallTexture(kind = 'stone') {
  const key = 'w_' + kind;
  if (cache[key]) return cache[key];
  const c = makeCanvas(TILE, TILE);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  drawStoneBlocks(ctx, 1, null);
  cache[key] = nearestTex(c, [1, 1]); return cache[key];
}

export function getFloorTexture(kind = 'cobble') {
  const key = 'f_' + kind;
  if (cache[key]) return cache[key];
  const c = makeCanvas(TILE, TILE);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  drawCobblestone(ctx);
  cache[key] = nearestTex(c, [1, 1]); return cache[key];
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
