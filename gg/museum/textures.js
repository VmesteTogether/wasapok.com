// Garden Grove Museum — clean retro-civic textures (navy/gold/marble).
import * as THREE from 'three';

const TILE = 128;

// Garden Grove brand palette
export const GG = {
  navy:      '#003a67',
  navyDark:  '#002744',
  navyDeep:  '#001a30',
  gold:      '#d4a64c',
  goldLight: '#f0c878',
  goldDark:  '#8a6020',
  cream:     '#f6efdc',
  marble:    '#e9e3d2',
  marbleDk:  '#bfb8a4',
  ink:       '#1a1a1a',
};

function rng(seed) {
  let s = seed | 0;
  return () => { s = (s * 1664525 + 1013904223) | 0; return ((s >>> 0) / 4294967296); };
}
function makeCanvas(w = TILE, h = TILE) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function canvasToTex(canvas, repeat = [1, 1], filter = 'linear') {
  const tex = new THREE.CanvasTexture(canvas);
  if (filter === 'nearest') {
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestMipmapLinearFilter;
  } else {
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  }
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---- WALL: navy plaster with gold dado rail ----
function drawNavyWall(ctx, seed = 1) {
  const r = rng(seed);
  // Subtle plaster gradient navy
  const grad = ctx.createLinearGradient(0, 0, 0, TILE);
  grad.addColorStop(0, '#004a82');
  grad.addColorStop(0.5, GG.navy);
  grad.addColorStop(1, GG.navyDark);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TILE, TILE);
  // very faint plaster noise
  for (let i = 0; i < 600; i++) {
    const x = r() * TILE, y = r() * TILE;
    ctx.fillStyle = `rgba(255,255,255,${0.015 + r()*0.025})`;
    ctx.fillRect(x, y, 1, 1);
  }
  for (let i = 0; i < 400; i++) {
    const x = r() * TILE, y = r() * TILE;
    ctx.fillStyle = `rgba(0,0,0,${0.04 + r()*0.05})`;
    ctx.fillRect(x, y, 1, 1);
  }
  // Gold dado rail at ~70% height (so its position varies by tile -> we use a non-tiling rail elsewhere)
  // Keep texture clean — rail is a separate geometry.
}

// ---- FLOOR: large marble tiles with gold inlay grid ----
function drawMarbleFloor(ctx, seed = 10) {
  const r = rng(seed);
  // Cream marble base
  ctx.fillStyle = GG.marble;
  ctx.fillRect(0, 0, TILE, TILE);
  // Marble veining — soft curves, light gray + gold
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 12; i++) {
    ctx.strokeStyle = `rgba(120,110,90,${0.10 + r() * 0.18})`;
    ctx.beginPath();
    let x = r() * TILE, y = r() * TILE;
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (r() - 0.5) * 60;
      y += (r() - 0.5) * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = `rgba(212,166,76,${0.12 + r() * 0.15})`;
    ctx.beginPath();
    let x = r() * TILE, y = r() * TILE;
    ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      x += (r() - 0.5) * 80;
      y += (r() - 0.5) * 80;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Speckles
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = `rgba(${60+r()*60},${50+r()*50},${30+r()*40},${0.05 + r()*0.1})`;
    ctx.fillRect(r() * TILE, r() * TILE, 1, 1);
  }
  // 2x2 tile grid with gold inlay seams (large luxe tiles)
  ctx.strokeStyle = GG.gold;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(212,166,76,0.55)';
  ctx.beginPath();
  ctx.moveTo(TILE / 2, 0); ctx.lineTo(TILE / 2, TILE);
  ctx.moveTo(0, TILE / 2); ctx.lineTo(TILE, TILE / 2);
  ctx.stroke();
  // Tile borders
  ctx.strokeStyle = 'rgba(120,110,90,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, TILE - 1, TILE - 1);
}

// ---- CEILING: cream coffered look ----
function drawCeiling(ctx, seed = 20) {
  const r = rng(seed);
  ctx.fillStyle = GG.cream;
  ctx.fillRect(0, 0, TILE, TILE);
  // soft yellowish wash
  ctx.fillStyle = 'rgba(220,190,120,0.08)';
  ctx.fillRect(0, 0, TILE, TILE);
  // coffered panel inset
  const m = 12;
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.fillRect(m, m, TILE - m*2, TILE - m*2);
  // gold rim
  ctx.strokeStyle = 'rgba(212,166,76,0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(m + 0.5, m + 0.5, TILE - m*2 - 1, TILE - m*2 - 1);
  // outer ridge
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.strokeRect(0.5, 0.5, TILE - 1, TILE - 1);
  // very subtle noise
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = `rgba(120,100,60,${r() * 0.04})`;
    ctx.fillRect(r() * TILE, r() * TILE, 1, 1);
  }
}

const cache = {};

export function getWallTexture(kind = 'navy') {
  const key = 'w_' + kind;
  if (cache[key]) return cache[key];
  const c = makeCanvas(TILE, TILE);
  const ctx = c.getContext('2d');
  drawNavyWall(ctx);
  const tex = canvasToTex(c, [1, 1]);
  cache[key] = tex; return tex;
}

export function getFloorTexture(kind = 'marble') {
  const key = 'f_' + kind;
  if (cache[key]) return cache[key];
  const c = makeCanvas(TILE, TILE);
  const ctx = c.getContext('2d');
  drawMarbleFloor(ctx);
  const tex = canvasToTex(c, [1, 1]);
  cache[key] = tex; return tex;
}

export function getCeilingTexture() {
  if (cache.ceil) return cache.ceil;
  const c = makeCanvas(TILE, TILE);
  const ctx = c.getContext('2d');
  drawCeiling(ctx);
  const tex = canvasToTex(c, [1, 1]);
  cache.ceil = tex; return tex;
}

// ---- WALL SCONCE (gold fixture + warm bulb) ----
export function makeSconceTexture() {
  if (cache.sconce) return cache.sconce;
  const w = 64, h = 96;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  // backplate
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, w, h);
  // gold wall plate
  ctx.fillStyle = GG.gold;
  ctx.fillRect(24, 50, 16, 30);
  ctx.fillStyle = GG.goldDark;
  ctx.fillRect(24, 78, 16, 2);
  // arm
  ctx.fillStyle = GG.goldDark;
  ctx.fillRect(30, 38, 4, 14);
  ctx.fillStyle = GG.gold;
  ctx.fillRect(31, 38, 2, 14);
  // bowl/cup
  ctx.fillStyle = GG.gold;
  ctx.beginPath(); ctx.ellipse(32, 36, 14, 5, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = GG.goldDark;
  ctx.beginPath(); ctx.ellipse(32, 38, 14, 3, 0, 0, Math.PI); ctx.fill();
  // glow / bulb
  const glow = ctx.createRadialGradient(32, 22, 1, 32, 22, 22);
  glow.addColorStop(0, 'rgba(255,240,200,1)');
  glow.addColorStop(0.4, 'rgba(255,210,140,0.7)');
  glow.addColorStop(1, 'rgba(255,180,80,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, 50);
  // bulb core
  ctx.fillStyle = 'rgba(255,250,220,1)';
  ctx.beginPath(); ctx.ellipse(32, 22, 6, 8, 0, 0, Math.PI * 2); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.sconce = tex; return tex;
}

// Legacy alias used by main.js (keeps the API stable)
export function makeTorchTexture() { return makeSconceTexture(); }

// ---- PORTRAIT FRAME (clean civic gold w/ navy mat) ----
export function makeFrameTexture() {
  if (cache.frame) return cache.frame;
  const size = 256;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  // navy mat
  ctx.fillStyle = GG.navyDark;
  ctx.fillRect(0, 0, size, size);
  // outer gold frame
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, GG.goldLight);
  grad.addColorStop(0.5, GG.gold);
  grad.addColorStop(1, GG.goldDark);
  ctx.fillStyle = grad;
  // 12px frame
  ctx.fillRect(0, 0, size, 14);
  ctx.fillRect(0, size - 14, size, 14);
  ctx.fillRect(0, 0, 14, size);
  ctx.fillRect(size - 14, 0, 14, size);
  // bevels
  ctx.strokeStyle = 'rgba(255,240,200,0.7)'; ctx.lineWidth = 1;
  ctx.strokeRect(1.5, 1.5, size - 3, size - 3);
  ctx.strokeStyle = 'rgba(80,50,15,0.7)';
  ctx.strokeRect(13.5, 13.5, size - 27, size - 27);
  // inner navy bevel
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.strokeRect(15.5, 15.5, size - 31, size - 31);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.frame = tex; return tex;
}

// ---- PLAQUE (engraved gold, brand-faithful) ----
export function makePlaqueTexture(title, subtitle = '') {
  const w = 512, h = 128;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  // gold plate
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, GG.goldLight);
  grad.addColorStop(0.5, GG.gold);
  grad.addColorStop(1, GG.goldDark);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // border
  ctx.strokeStyle = GG.navyDeep; ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, w - 4, h - 4);
  ctx.strokeStyle = 'rgba(255,240,200,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  // title
  ctx.fillStyle = GG.navyDeep;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let fs = 36;
  ctx.font = `700 ${fs}px "Playfair Display", "Times New Roman", serif`;
  while (ctx.measureText(title).width > w - 30 && fs > 14) {
    fs -= 1;
    ctx.font = `700 ${fs}px "Playfair Display", "Times New Roman", serif`;
  }
  ctx.fillText(title, w / 2, subtitle ? h / 2 - 18 : h / 2);
  if (subtitle) {
    ctx.font = `500 22px "Inter", "Helvetica", sans-serif`;
    ctx.fillStyle = GG.navyDeep;
    ctx.fillText(subtitle, w / 2, h / 2 + 22);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- DIRECTIONAL SIGN (navy w/ gold text + arrow) ----
export function makeSignTexture(label, arrow = '') {
  const w = 512, h = 160;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  // navy plaque with gold trim
  ctx.fillStyle = GG.navy;
  ctx.fillRect(0, 0, w, h);
  // gold border
  ctx.strokeStyle = GG.gold;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.strokeStyle = GG.goldLight;
  ctx.lineWidth = 1;
  ctx.strokeRect(11, 11, w - 22, h - 22);
  // text — large, civic
  ctx.fillStyle = GG.goldLight;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 60px "Playfair Display", "Times New Roman", serif`;
  if (arrow) {
    ctx.fillText(`${arrow}  ${label}`, w / 2, h / 2 + 4);
  } else {
    ctx.fillText(label, w / 2, h / 2 + 4);
  }
  // subtle shine
  const shine = ctx.createLinearGradient(0, 0, 0, h);
  shine.addColorStop(0, 'rgba(255,255,255,0.08)');
  shine.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- HUB CENTERPIECE: GG city seal style emblem (procedural) ----
export function makeSealTexture() {
  if (cache.seal) return cache.seal;
  const size = 512;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  // transparent
  // outer gold ring
  ctx.strokeStyle = GG.gold; ctx.lineWidth = 14;
  ctx.beginPath(); ctx.arc(size/2, size/2, size/2 - 12, 0, Math.PI*2); ctx.stroke();
  ctx.strokeStyle = GG.goldDark; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(size/2, size/2, size/2 - 22, 0, Math.PI*2); ctx.stroke();
  // navy field
  ctx.fillStyle = GG.navy;
  ctx.beginPath(); ctx.arc(size/2, size/2, size/2 - 26, 0, Math.PI*2); ctx.fill();
  // big gold "GG" monogram
  ctx.fillStyle = GG.goldLight;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `900 240px "Playfair Display", serif`;
  ctx.fillText('GG', size/2, size/2 - 10);
  // ring text "GARDEN GROVE • CALIFORNIA •"
  ctx.fillStyle = GG.goldLight;
  ctx.font = `600 32px "Inter", sans-serif`;
  const text = 'GARDEN GROVE  ·  CALIFORNIA  ·  GARDEN GROVE  ·  CALIFORNIA  ·';
  const radius = size/2 - 50;
  ctx.save();
  ctx.translate(size/2, size/2);
  for (let i = 0; i < text.length; i++) {
    const ang = (i / text.length) * Math.PI * 2 - Math.PI/2;
    ctx.save();
    ctx.rotate(ang + Math.PI/2);
    ctx.translate(0, -radius);
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }
  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.seal = tex; return tex;
}
