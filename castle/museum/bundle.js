(function(){
const THREE = window.THREE;

// ===== textures.js =====
// Garden Grove Museum — clean retro-civic textures (navy/gold/marble).

const TILE = 128;

// Garden Grove brand palette
const GG = {
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

function getWallTexture(kind = 'navy') {
  const key = 'w_' + kind;
  if (cache[key]) return cache[key];
  const c = makeCanvas(TILE, TILE);
  const ctx = c.getContext('2d');
  drawNavyWall(ctx);
  const tex = canvasToTex(c, [1, 1]);
  cache[key] = tex; return tex;
}

function getFloorTexture(kind = 'marble') {
  const key = 'f_' + kind;
  if (cache[key]) return cache[key];
  const c = makeCanvas(TILE, TILE);
  const ctx = c.getContext('2d');
  drawMarbleFloor(ctx);
  const tex = canvasToTex(c, [1, 1]);
  cache[key] = tex; return tex;
}

function getCeilingTexture() {
  if (cache.ceil) return cache.ceil;
  const c = makeCanvas(TILE, TILE);
  const ctx = c.getContext('2d');
  drawCeiling(ctx);
  const tex = canvasToTex(c, [1, 1]);
  cache.ceil = tex; return tex;
}

// ---- WALL SCONCE (gold fixture + warm bulb) ----
function makeSconceTexture() {
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
function makeTorchTexture() { return makeSconceTexture(); }

// ---- PORTRAIT FRAME (clean civic gold w/ navy mat) ----
function makeFrameTexture() {
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
function makePlaqueTexture(title, subtitle = '') {
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
function makeSignTexture(label, arrow = '') {
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
function makeSealTexture() {
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


// ===== layout.js =====
// Garden Grove Museum layout — central hub with two named gallery rooms.
// grid[y][x]: 0 = floor, 1 = wall, -1 = void (outside, no render, no collision)
// Direction: 0=N (−Y), 1=E (+X), 2=S (+Y), 3=W (−X)

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

// Layout shape (cells):
//
//                     ┌───────────────┐
//                     │               │
//                     │               │
//                     │   MAP HALL    │     (West)
//                     │  9 wide × 7   │
//                     │               │
//                     │               │
//                     └────┐     ┌────┘
//                          │     │
//                          │ HUB │
//                          │ 5×5 │   ← spawn here, facing N
//                          │     │
//                     ┌────┘     └────┐
//                     │               │
//                     │               │
//                     │  MAYORS HALL  │     (East)
//                     │  13 wide × 7  │  (long gallery for 19 portraits)
//                     │               │
//                     │               │
//                     └───────────────┘
//
// Corridors are 1 tile, hub openings on N (→ Map Hall) and S (→ Mayors Hall)
// We rotate so player spawns facing the central axis.

function buildLayout(mayors, mapWallSlot) {
  const HUB = 5;
  const MAP_W = 13, MAP_H = 7;
  // Long single-wall gallery: 18 portraits at every-other-tile = ~37 tiles wide
  const portraitCount = (mayors && mayors.length) || 18;
  const MAYOR_W = Math.max(15, portraitCount * 2 + 5);
  const MAYOR_H = 6;
  const CORR = 2;

  // Position rooms in abstract coords (cell-units), hub centered on (0,0).
  const halfHub = (HUB - 1) / 2;

  // Map Hall sits to the NORTH of hub.
  // Its south edge is `halfHub + CORR + 1` cells north of hub center.
  const mapCY = -(halfHub + CORR + 1 + (MAP_H - 1) / 2);
  const mapCX = 0;

  // Mayors Hall sits to the SOUTH of hub.
  const mayCY = (halfHub + CORR + 1 + (MAYOR_H - 1) / 2);
  const mayCX = 0;

  const rooms = [
    { id: 'hub', cx: 0, cy: 0, w: HUB, h: HUB, isHub: true },
    { id: 'map', cx: mapCX, cy: mapCY, w: MAP_W, h: MAP_H, isHub: false },
    { id: 'mayors', cx: mayCX, cy: mayCY, w: MAYOR_W, h: MAYOR_H, isHub: false },
  ];

  // Compute grid size with padding.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const r of rooms) {
    const hw = (r.w - 1) / 2, hh = (r.h - 1) / 2;
    minX = Math.min(minX, r.cx - hw);
    maxX = Math.max(maxX, r.cx + hw);
    minY = Math.min(minY, r.cy - hh);
    maxY = Math.max(maxY, r.cy + hh);
  }
  const pad = 2;
  const width  = (maxX - minX) + 1 + pad * 2;
  const height = (maxY - minY) + 1 + pad * 2;
  const offX = -minX + pad;
  const offY = -minY + pad;

  // Init full of walls.
  const grid = Array.from({ length: height }, () => new Array(width).fill(1));

  // Carve rooms.
  for (const r of rooms) {
    const hw = (r.w - 1) / 2, hh = (r.h - 1) / 2;
    const x0 = r.cx - hw + offX, y0 = r.cy - hh + offY;
    for (let dy = 0; dy < r.h; dy++) {
      for (let dx = 0; dx < r.w; dx++) {
        grid[y0 + dy][x0 + dx] = 0;
      }
    }
    r.x0 = x0; r.y0 = y0;  // store world tile origin
  }

  // Carve a corridor between two rooms along a cardinal direction.
  function carveCorridor(fromR, dir) {
    const hw = (fromR.w - 1) / 2, hh = (fromR.h - 1) / 2;
    const ex = fromR.cx + DX[dir] * hw + offX;
    const ey = fromR.cy + DY[dir] * hh + offY;
    for (let i = 1; i <= CORR; i++) {
      const gx = ex + DX[dir] * i;
      const gy = ey + DY[dir] * i;
      if (gx >= 0 && gy >= 0 && gx < width && gy < height) grid[gy][gx] = 0;
    }
  }

  const hub = rooms[0];
  carveCorridor(hub, 0); // north → Map Hall
  carveCorridor(hub, 2); // south → Mayors Hall

  // ---------- ARTWORK PLACEMENTS ----------

  // Map Hall: ONE huge artwork on the NORTH wall, centered.
  const mapRoom = rooms[1];
  const mapNorthY = mapRoom.y0;          // top row of floor
  const mapCenterX = mapRoom.x0 + Math.floor(MAP_W / 2);
  const placements = [];
  if (mapWallSlot) {
    placements.push({
      x: mapCenterX, y: mapNorthY, wall: 0,
      ...mapWallSlot,
      large: true, // signal scene to render extra-large
    });
  }

  // Mayors Hall: portraits along NORTH and SOUTH walls in a chronological
  // serpentine — N wall left→right, then S wall left→right (so visitors walk
  // a counter-clockwise loop to read them in order).
  const mayRoom = rooms[2];
  const northRow = mayRoom.y0;
  const southRow = mayRoom.y0 + MAYOR_H - 1;
  // Use every other tile so portraits aren't shoulder-to-shoulder.
  // Skip the center column (door from corridor lands there).
  const doorCol = mayRoom.x0 + Math.floor(MAYOR_W / 2);

  // Single chronological wall: SOUTH wall, west → east, every other tile.
  const slots = [];
  for (let dx = 1; dx < MAYOR_W - 1; dx += 2) {
    const gx = mayRoom.x0 + dx;
    if (gx === doorCol || gx === doorCol - 1 || gx === doorCol + 1) continue;
    slots.push({ x: gx, y: southRow, wall: 2 });
  }

  for (let i = 0; i < mayors.length && i < slots.length; i++) {
    placements.push({ ...slots[i], ...mayors[i] });
  }

  // ---------- LIGHTING SLOTS (ceiling-mounted sconces) ----------
  // Fewer, brighter, evenly spaced — clean museum lighting, no torches.
  const lights = [];
  // Hub: 4 corners
  lights.push({ x: hub.x0 + 1,           y: hub.y0 + 1,           kind: 'sconce' });
  lights.push({ x: hub.x0 + HUB - 2,     y: hub.y0 + 1,           kind: 'sconce' });
  lights.push({ x: hub.x0 + 1,           y: hub.y0 + HUB - 2,     kind: 'sconce' });
  lights.push({ x: hub.x0 + HUB - 2,     y: hub.y0 + HUB - 2,     kind: 'sconce' });
  // Hub center: chandelier
  lights.push({ x: hub.x0 + halfHub, y: hub.y0 + halfHub, kind: 'chandelier' });

  // Map hall: 3 chandeliers along the centerline
  for (const fx of [0.25, 0.5, 0.75]) {
    lights.push({
      x: mapRoom.x0 + Math.floor(MAP_W * fx),
      y: mapRoom.y0 + Math.floor(MAP_H / 2),
      kind: 'chandelier'
    });
  }
  // Mayors hall: chandeliers along centerline, one every ~5 tiles
  const mayChCount = Math.max(4, Math.floor(MAYOR_W / 5));
  for (let i = 0; i < mayChCount; i++) {
    const fx = (i + 0.5) / mayChCount;
    lights.push({
      x: mayRoom.x0 + Math.floor(MAYOR_W * fx),
      y: mayRoom.y0 + Math.floor(MAYOR_H / 2),
      kind: 'chandelier'
    });
  }

  // ---------- DIRECTIONAL SIGNS ----------
  // Sign hangs above each corridor mouth in the hub, pointing OUT.
  // North corridor mouth = (hub.cx, hub.y0 - 1) tile, sign on N wall facing S into hub.
  const signs = [
    {
      // Above N corridor — visible facing south (room: MAP HALL)
      x: hub.cx + offX,
      y: hub.y0,           // first floor row of hub
      wall: 0,
      label: 'MAP HALL',
      arrow: '↑',
    },
    {
      // Above S corridor — visible facing north (room: MAYORS HALL)
      x: hub.cx + offX,
      y: hub.y0 + HUB - 1,
      wall: 2,
      label: "MAYORS' HALL",
      arrow: '↓',
    },
  ];

  // Spawn: hub center, facing north (toward Map Hall to start).
  let spawn = { x: hub.cx + offX, y: hub.cy + offY, dir: 0 };

  // ---------- TRIM ----------
  const keep = Array.from({ length: height }, () => new Array(width).fill(false));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] === 0) {
        keep[y][x] = true;
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d], ny = y + DY[d];
          if (nx >= 0 && ny >= 0 && nx < width && ny < height) keep[ny][nx] = true;
        }
      }
    }
  }
  let tMinX = width, tMaxX = -1, tMinY = height, tMaxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (keep[y][x]) {
        if (x < tMinX) tMinX = x; if (x > tMaxX) tMaxX = x;
        if (y < tMinY) tMinY = y; if (y > tMaxY) tMaxY = y;
      }
    }
  }
  const newW = tMaxX - tMinX + 1;
  const newH = tMaxY - tMinY + 1;
  const newGrid = Array.from({ length: newH }, () => new Array(newW).fill(0));
  for (let y = 0; y < newH; y++) {
    for (let x = 0; x < newW; x++) {
      const ox = x + tMinX, oy = y + tMinY;
      newGrid[y][x] = keep[oy][ox] ? grid[oy][ox] : -1;
    }
  }
  // Shift coords.
  spawn.x -= tMinX; spawn.y -= tMinY;
  for (const p of placements) { p.x -= tMinX; p.y -= tMinY; }
  for (const l of lights)     { l.x -= tMinX; l.y -= tMinY; }
  for (const s of signs)      { s.x -= tMinX; s.y -= tMinY; }

  // Build a "rooms" descriptor with shifted bounds (for floor zones, ambient color, etc).
  const roomsOut = rooms.map(r => ({
    id: r.id,
    cx: r.cx + offX - tMinX,
    cy: r.cy + offY - tMinY,
    w: r.w, h: r.h,
    x0: r.x0 - tMinX,
    y0: r.y0 - tMinY,
  }));

  return {
    grid: newGrid, width: newW, height: newH,
    spawn, placements, lights, signs, rooms: roomsOut,
    // Legacy alias so existing scene code still finds light slots:
    torches: lights,
  };
}


// ===== scene.js =====
// Garden Grove Museum — clean civic interior (navy walls, marble floor, gold trim).


const CELL = 2;
const WALL_H = 3.4;
const TRIM_H = 0.18;        // baseboard + dado heights
const DADO_Y  = 1.05;       // dado rail height
const SIGN_Y  = 2.55;       // signage hangs near ceiling

function buildScene(layout, opts) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1424);
  scene.fog = new THREE.Fog(0x0a1424, 6, opts.fogDistance ?? 28);

  // BRIGHT museum lighting — clean and readable.
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  scene.add(new THREE.HemisphereLight(0xfff2c8, 0x162033, 0.55));

  // Soft player follow light so close-up surfaces always read.
  const playerLight = new THREE.PointLight(0xfff0c8, 0.6, 6, 2);
  playerLight.position.set(0, 1.8, 0);
  scene.add(playerLight);

  const wallTex  = getWallTexture('navy');
  const floorTex = getFloorTexture('marble');
  const ceilTex  = getCeilingTexture();

  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTex, roughness: 0.85, metalness: 0,
  });
  const ceilMat = new THREE.MeshStandardMaterial({
    map: ceilTex, roughness: 0.95, metalness: 0,
  });
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex.clone(), roughness: 0.55, metalness: 0.05,
  });
  // floor tex repeats by tile count
  floorMat.map.wrapS = floorMat.map.wrapT = THREE.RepeatWrapping;
  floorMat.map.repeat.set(layout.width, layout.height);
  floorMat.map.needsUpdate = true;

  const goldMat = new THREE.MeshStandardMaterial({
    color: GG.gold, roughness: 0.35, metalness: 0.85,
    emissive: 0x3a2810, emissiveIntensity: 0.15,
  });
  const goldDarkMat = new THREE.MeshStandardMaterial({
    color: GG.goldDark, roughness: 0.55, metalness: 0.7,
  });

  const group = new THREE.Group();
  scene.add(group);

  // ----- FLOOR & CEILING (one big plane each) -----
  const W = layout.width * CELL, H = layout.height * CELL;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2 - CELL / 2, 0, H / 2 - CELL / 2);
  floor.receiveShadow = true;
  group.add(floor);

  // Ceiling — repeat per ~2 tiles for a coffered grid feel
  const ceilMatI = ceilMat.clone();
  ceilMatI.map = ceilTex.clone();
  ceilMatI.map.wrapS = ceilMatI.map.wrapT = THREE.RepeatWrapping;
  ceilMatI.map.repeat.set(layout.width / 2, layout.height / 2);
  ceilMatI.map.needsUpdate = true;
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, H), ceilMatI);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(W / 2 - CELL / 2, WALL_H, H / 2 - CELL / 2);
  group.add(ceil);

  // ----- WALLS as solid boxes (only those adjacent to floor) -----
  const wallCells = [];
  for (let y = 0; y < layout.height; y++) {
    for (let x = 0; x < layout.width; x++) {
      if (layout.grid[y][x] !== 1) continue;
      let nearFloor = false;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= layout.width || ny >= layout.height) continue;
        if (layout.grid[ny][nx] === 0) { nearFloor = true; break; }
      }
      if (!nearFloor) continue;
      wallCells.push({ x, y });
    }
  }
  const wallGeom = new THREE.BoxGeometry(CELL, WALL_H, CELL);
  const walls = new THREE.InstancedMesh(wallGeom, wallMat, wallCells.length);
  walls.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const m4 = new THREE.Matrix4();
  const v3 = new THREE.Vector3();
  const q  = new THREE.Quaternion();
  const sc = new THREE.Vector3(1, 1, 1);
  wallCells.forEach((c, i) => {
    v3.set(c.x * CELL, WALL_H / 2, c.y * CELL);
    m4.compose(v3, q, sc);
    walls.setMatrixAt(i, m4);
  });
  walls.instanceMatrix.needsUpdate = true;
  group.add(walls);

  // ----- BASEBOARD + DADO RAIL + CROWN MOLDING -----
  // Build per-floor-tile thin gold strips that hug only the SIDE of a wall
  // facing the floor. We make planes (one per exposed wall face) for trims.
  const trimSegs = [];   // {x,y,wall} where wall points from floor → wall cell
  for (let y = 0; y < layout.height; y++) {
    for (let x = 0; x < layout.width; x++) {
      if (layout.grid[y][x] !== 0) continue;
      for (let d = 0; d < 4; d++) {
        const nx = x + [0,1,0,-1][d], ny = y + [-1,0,1,0][d];
        if (nx < 0 || ny < 0 || nx >= layout.width || ny >= layout.height) continue;
        if (layout.grid[ny][nx] === 1) trimSegs.push({ x, y, wall: d });
      }
    }
  }
  const trimGeom = new THREE.PlaneGeometry(CELL, TRIM_H);
  const dadoGeom = new THREE.PlaneGeometry(CELL, 0.06);
  const baseGeom = new THREE.PlaneGeometry(CELL, 0.22);
  const crownGeom= new THREE.PlaneGeometry(CELL, 0.28);
  const baseMat  = new THREE.MeshStandardMaterial({ color: GG.navyDeep, roughness: 0.7 });
  const dadoMat  = goldMat;
  const crownMat = new THREE.MeshStandardMaterial({ color: GG.cream, roughness: 0.7 });

  const baseI  = new THREE.InstancedMesh(baseGeom,  baseMat,  trimSegs.length);
  const dadoI  = new THREE.InstancedMesh(dadoGeom,  dadoMat,  trimSegs.length);
  const crownI = new THREE.InstancedMesh(crownGeom, crownMat, trimSegs.length);
  trimSegs.forEach((s, i) => {
    const wx = s.x * CELL, wz = s.y * CELL;
    const ox = [0,1,0,-1][s.wall] * (CELL / 2 - 0.02);
    const oz = [-1,0,1,0][s.wall] * (CELL / 2 - 0.02);
    const yaw = [0, -Math.PI/2, Math.PI, Math.PI/2][s.wall];
    // Each trim plane faces back into the room (opposite wall direction).
    const setAt = (mesh, h) => {
      v3.set(wx + ox, h, wz + oz);
      q.setFromEuler(new THREE.Euler(0, yaw, 0));
      m4.compose(v3, q, sc);
      mesh.setMatrixAt(i, m4);
    };
    setAt(baseI,  0.12);
    setAt(dadoI,  DADO_Y);
    setAt(crownI, WALL_H - 0.18);
  });
  baseI.instanceMatrix.needsUpdate = true;
  dadoI.instanceMatrix.needsUpdate = true;
  crownI.instanceMatrix.needsUpdate = true;
  group.add(baseI); group.add(dadoI); group.add(crownI);

  // ----- LIGHTING: ceiling chandeliers + wall sconces -----
  const sconceTex = makeSconceTexture();
  const torchLights = []; // keep field name so main.js loop works
  const sconceSprites = [];

  // CHANDELIER builder: gold cap + warm bulb + halo, on a chain
  function addChandelier(wx, wz) {
    const ch = new THREE.Group();
    ch.position.set(wx, WALL_H, wz);
    // chain
    const chain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6),
      goldDarkMat
    );
    chain.position.y = -0.25;
    ch.add(chain);
    // disc / cap
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.42, 0.12, 16),
      goldMat
    );
    cap.position.y = -0.55;
    ch.add(cap);
    // glass globe (slightly emissive)
    const globeMat = new THREE.MeshStandardMaterial({
      color: 0xfff5d0, emissive: 0xffd680, emissiveIntensity: 0.9,
      transparent: true, opacity: 0.92, roughness: 0.25,
    });
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 14), globeMat);
    globe.position.y = -0.78;
    ch.add(globe);
    // light source
    const pl = new THREE.PointLight(0xffe6b0, 1.5, 9, 1.6);
    pl.position.y = -0.78;
    ch.add(pl);
    group.add(ch);
    torchLights.push({ light: pl, baseIntensity: 1.5, kind: 'chandelier' });
  }

  // SCONCE: gold backplate + warm light, mounted on wall
  function addSconce(t) {
    const wx = t.x * CELL, wz = t.y * CELL;
    const ox = [0,1,0,-1][t.wall] * (CELL / 2 - 0.05);
    const oz = [-1,0,1,0][t.wall] * (CELL / 2 - 0.05);
    const sprMat = new THREE.SpriteMaterial({
      map: sconceTex, transparent: true, depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const spr = new THREE.Sprite(sprMat);
    spr.scale.set(0.65, 1.0, 1);
    spr.position.set(wx + ox, 2.1, wz + oz);
    group.add(spr);
    sconceSprites.push(spr);

    const pl = new THREE.PointLight(0xffd9a0, 0.9, 6, 1.6);
    pl.position.set(wx + ox * 0.6, 2.1, wz + oz * 0.6);
    group.add(pl);
    torchLights.push({ light: pl, baseIntensity: 0.9, kind: 'sconce' });
  }

  for (const l of layout.lights || layout.torches || []) {
    if (l.kind === 'sconce' && l.wall != null) addSconce(l);
    else addChandelier(l.x * CELL, l.y * CELL);
  }

  // ----- HUB CENTERPIECE: GG seal medallion on the floor -----
  const hub = (layout.rooms || []).find(r => r.id === 'hub');
  if (hub) {
    const sealTex = makeSealTexture();
    const sealMat = new THREE.MeshStandardMaterial({
      map: sealTex, transparent: true, roughness: 0.4, metalness: 0.4,
    });
    const seal = new THREE.Mesh(new THREE.CircleGeometry(1.6, 64), sealMat);
    seal.rotation.x = -Math.PI / 2;
    seal.position.set(hub.cx * CELL, 0.005, hub.cy * CELL);
    group.add(seal);
  }

  // ----- DIRECTIONAL SIGNS -----
  const signs = layout.signs || [];
  for (const s of signs) {
    const wx = s.x * CELL, wz = s.y * CELL;
    const ox = [0,1,0,-1][s.wall] * (CELL / 2 - 0.02);
    const oz = [-1,0,1,0][s.wall] * (CELL / 2 - 0.02);
    const yaw = [0, -Math.PI/2, Math.PI, Math.PI/2][s.wall];
    const tex = makeSignTexture(s.label, s.arrow || '');
    const mat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.5, metalness: 0.3,
      emissive: 0x0a1830, emissiveIntensity: 0.3,
      side: THREE.DoubleSide,
    });
    const w2 = 1.7, h2 = 0.55;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w2, h2), mat);
    mesh.position.set(wx + ox, SIGN_Y, wz + oz);
    mesh.rotation.y = yaw;
    group.add(mesh);
    // little gold bar above
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w2 + 0.1, 0.05, 0.05), goldMat);
    bar.position.set(wx + ox, SIGN_Y + h2/2 + 0.04, wz + oz);
    bar.rotation.y = yaw;
    group.add(bar);
  }

  // ----- ARTWORKS (framed paintings + plaques) -----
  const frameTex = makeFrameTexture();
  const artObjects = [];
  for (const p of layout.placements) {
    const wx = p.x * CELL, wz = p.y * CELL;
    const dx = [0, 1, 0, -1][p.wall] * (CELL / 2);
    const dz = [-1, 0, 1, 0][p.wall] * (CELL / 2);
    const faceY = [0, -Math.PI / 2, Math.PI, Math.PI / 2][p.wall];

    const pivot = new THREE.Group();
    pivot.position.set(wx + dx * 0.985, 0, wz + dz * 0.985);
    pivot.rotation.y = faceY;
    group.add(pivot);

    // Sizing: large map artwork is wider & taller; portraits are tall rectangles
    const isLarge = !!p.large;
    const fW = isLarge ? 8.4 : 0.95;
    const fH = isLarge ? 2.6 : 1.25;
    const centerY = isLarge ? 1.85 : 1.7;

    const frameMat = new THREE.MeshStandardMaterial({
      map: frameTex, roughness: 0.5, metalness: 0.4,
    });
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(fW, fH), frameMat);
    frame.position.set(0, centerY, 0.01);
    pivot.add(frame);

    // inner art plane (slightly smaller; aspect-corrected after image loads)
    const innerW = fW - 0.18;
    const innerH = fH - 0.18;
    const artMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a, roughness: 0.95,
      emissive: 0x080808, emissiveIntensity: 0.05,
    });
    const artMesh = new THREE.Mesh(new THREE.PlaneGeometry(innerW, innerH), artMat);
    artMesh.position.set(0, centerY, 0.025);
    pivot.add(artMesh);

    loadArtTexture(p.src).then(tex => {
      if (!tex) return;
      tex.needsUpdate = true;
      artMat.map = tex;
      artMat.color.set(0xffffff);
      artMat.emissive.set(0x0a0a0a);
      artMat.needsUpdate = true;
      const img = tex.image;
      if (img && img.width && img.height) {
        const ar = img.width / img.height;
        const meshAR = innerW / innerH;
        if (ar > meshAR) artMesh.scale.set(1, meshAR / ar, 1);
        else artMesh.scale.set(ar / meshAR, 1, 1);
      }
    }).catch(() => {});

    // plaque under frame
    const plaqueTex = makePlaqueTexture(p.title || '', p.years || p.subtitle || '');
    const plaqueMat = new THREE.MeshStandardMaterial({
      map: plaqueTex, roughness: 0.4, metalness: 0.55,
    });
    const plW = isLarge ? 3.2 : 0.95;
    const plH = isLarge ? 0.55 : 0.28;
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(plW, plH), plaqueMat);
    plaque.position.set(0, centerY - fH/2 - plH/2 - 0.06, 0.02);
    pivot.add(plaque);

    // tiny accent gold pin-light over the frame (subtle)
    const accent = new THREE.PointLight(0xfff0c8, 0.35, 3, 2);
    accent.position.set(wx + dx * 0.6, centerY + fH/2 + 0.4, wz + dz * 0.6);
    group.add(accent);

    artObjects.push({
      pivot, artMesh, frameMesh: frame, plaqueMesh: plaque,
      tile: { x: p.x, y: p.y }, wall: p.wall,
      src: p.src, title: p.title || '', subtitle: p.years || p.subtitle || '',
    });
  }

  return {
    scene, group,
    walls, floorMesh: floor, ceilMesh: ceil,
    torchLights, torchSprites: sconceSprites,
    artObjects,
    floorMat, ceilMat: ceilMatI, wallMat,
    playerLight,
    CELL, WALL_H,
  };
}

// Artwork loader (handles animated GIFs).
async function loadArtTexture(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const isGif = /\.gif(\?|$)/i.test(src);
      if (isGif) {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.userData = { img, canvas: c, ctx, animated: true };
        resolve(tex);
      } else {
        const tex = new THREE.Texture(img);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        resolve(tex);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}


// ===== player.js =====
// Tile-based movement + wall collision.

// Direction 0=N 1=E 2=S 3=W
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

function createPlayer(layout, CELL) {
  const spawn = layout.spawn;
  const state = {
    // Tile coords (integers) — these are the COMMITTED position.
    tx: spawn.x,
    ty: spawn.y,
    dir: spawn.dir,
    // Animated (fractional) values — where the camera actually is right now.
    x: spawn.x,
    y: spawn.y,
    yaw: dirToYaw(spawn.dir),
    // Tween state
    anim: null, // { type, startTime, duration, from, to }
  };

  function dirToYaw(d) {
    // yaw 0 looks toward -Z (north = yaw 0)
    // E = yaw = -PI/2 (we turn right)
    // Actually: facing north (d=0) → looking at -Z → camera.rotation.y = 0 (default lookAt(-Z)? No.)
    // Three.js camera's default forward is -Z when rotation.y=0.
    // Turning to East (d=1) → should look at +X → rotation.y = -PI/2
    // Turning to South (d=2) → look at +Z → rotation.y = PI
    // Turning to West (d=3) → look at -X → rotation.y = PI/2
    const map = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
    return map[d];
  }

  function canMoveTo(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= layout.width || ty >= layout.height) return false;
    return layout.grid[ty][tx] === 0; // floor only (walls=1, void=-1 both block)
  }

  function tryMove(relDir) {
    if (state.anim) return;
    // relDir: 0=forward, 1=right(strafe), 2=back, 3=left(strafe)
    const worldDir = (state.dir + relDir) % 4;
    const ntx = state.tx + DX[worldDir];
    const nty = state.ty + DY[worldDir];
    if (!canMoveTo(ntx, nty)) {
      // Bump animation
      state.anim = {
        type: 'bump',
        startTime: performance.now(),
        duration: 180,
        from: { x: state.x, y: state.y },
        to: { x: state.x + DX[worldDir] * 0.15, y: state.y + DY[worldDir] * 0.15 },
        back: true,
      };
      return;
    }
    state.tx = ntx; state.ty = nty;
    state.anim = {
      type: 'move',
      startTime: performance.now(),
      duration: 220,
      from: { x: state.x, y: state.y },
      to: { x: ntx, y: nty },
    };
  }

  function tryTurn(deltaDir) {
    if (state.anim) return;
    const newDir = (state.dir + deltaDir + 4) % 4;
    state.dir = newDir;
    const fromYaw = state.yaw;
    let toYaw = dirToYaw(newDir);
    // Shortest path
    let delta = toYaw - fromYaw;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    state.anim = {
      type: 'turn',
      startTime: performance.now(),
      duration: 200,
      fromYaw,
      toYaw: fromYaw + delta,
    };
  }

  function update(now) {
    if (!state.anim) return;
    const t = Math.min(1, (now - state.anim.startTime) / state.anim.duration);
    const ease = easeInOutCubic(t);
    if (state.anim.type === 'move' || state.anim.type === 'bump') {
      if (state.anim.type === 'bump') {
        // Ping-pong: 0 -> 1 -> 0
        const ee = ease < 0.5 ? easeInOutCubic(ease * 2) : easeInOutCubic((1 - ease) * 2);
        state.x = state.anim.from.x + (state.anim.to.x - state.anim.from.x) * ee;
        state.y = state.anim.from.y + (state.anim.to.y - state.anim.from.y) * ee;
      } else {
        state.x = state.anim.from.x + (state.anim.to.x - state.anim.from.x) * ease;
        state.y = state.anim.from.y + (state.anim.to.y - state.anim.from.y) * ease;
      }
    } else if (state.anim.type === 'turn') {
      state.yaw = state.anim.fromYaw + (state.anim.toYaw - state.anim.fromYaw) * ease;
    }
    if (t >= 1) {
      if (state.anim.type === 'turn') state.yaw = dirToYaw(state.dir);
      if (state.anim.type === 'move') { state.x = state.tx; state.y = state.ty; }
      if (state.anim.type === 'bump') { state.x = state.anim.from.x; state.y = state.anim.from.y; }
      state.anim = null;
    }
  }

  function applyToCamera(cam) {
    cam.position.set(state.x * CELL, 1.55, state.y * CELL);
    cam.rotation.set(0, state.yaw, 0);
  }

  function frontTile() {
    const d = state.dir;
    return { x: state.tx + DX[d], y: state.ty + DY[d] };
  }

  return {
    state,
    tryMove, tryTurn, update, applyToCamera,
    canMoveTo, frontTile,
  };
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}


// ===== minimap.js =====
// Minimap renderer — bird's-eye view with player position + discovered tiles.
function createMinimap(canvas, layout) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = canvas.width, H = canvas.height;
  const scale = Math.floor(Math.min(W / layout.width, H / layout.height));
  const offX = Math.floor((W - layout.width * scale) / 2);
  const offY = Math.floor((H - layout.height * scale) / 2);
  const visited = new Set();

  function markVisited(tx, ty) {
    visited.add(`${tx},${ty}`);
    // also mark neighbors within line-of-sight in 4 cardinals until wall
    for (let d = 0; d < 4; d++) {
      const dx = [0,1,0,-1][d], dy = [-1,0,1,0][d];
      let x = tx, y = ty;
      for (let i = 0; i < 6; i++) {
        x += dx; y += dy;
        if (x < 0 || y < 0 || x >= layout.width || y >= layout.height) break;
        visited.add(`${x},${y}`);
        if (layout.grid[y][x] === 1) break;
      }
    }
  }

  function draw(player, artObjects) {
    markVisited(player.state.tx, player.state.ty);
    ctx.clearRect(0, 0, W, H);
    // grid
    for (let y = 0; y < layout.height; y++) {
      for (let x = 0; x < layout.width; x++) {
        const cell = layout.grid[y][x];
        const seen = visited.has(`${x},${y}`);
        if (!seen) continue;
        const px = offX + x * scale, py = offY + y * scale;
        if (cell === 0) {
          ctx.fillStyle = '#3a2410';
          ctx.fillRect(px, py, scale, scale);
          ctx.fillStyle = 'rgba(244,215,137,0.05)';
          ctx.fillRect(px, py, scale, 1);
        } else if (cell === 1) {
          // walls only if adjacent to seen floor
          let adjSeen = false;
          for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            if (visited.has(`${x+dx},${y+dy}`) && layout.grid[y+dy]?.[x+dx] === 0) { adjSeen = true; break; }
          }
          if (adjSeen) {
            ctx.fillStyle = '#b8914a';
            ctx.fillRect(px, py, scale, scale);
          }
        }
        // cell === -1 is void, don't draw
      }
    }
    // art markers
    for (const a of artObjects) {
      if (!visited.has(`${a.tile.x},${a.tile.y}`)) continue;
      const px = offX + a.tile.x * scale, py = offY + a.tile.y * scale;
      ctx.fillStyle = '#5ce4ff';
      ctx.fillRect(px + Math.floor(scale/3), py + Math.floor(scale/3), Math.max(2, Math.floor(scale/3)), Math.max(2, Math.floor(scale/3)));
    }
    // player
    const px = offX + player.state.x * scale + scale / 2;
    const py = offY + player.state.y * scale + scale / 2;
    ctx.save();
    ctx.translate(px, py);
    // yaw=0 faces north (-Z world → up on minimap). Canvas rotate is CW-positive,
    // world yaw is CCW-positive (about Y), so negate it to get canvas-correct rotation.
    ctx.rotate(-player.state.yaw);
    ctx.fillStyle = '#ffd860';
    ctx.beginPath();
    ctx.moveTo(0, -scale * 0.7);
    ctx.lineTo(-scale * 0.45, scale * 0.5);
    ctx.lineTo(0, scale * 0.2);
    ctx.lineTo(scale * 0.45, scale * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#1a0c04';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  return { draw, markVisited };
}


// ===== main.js =====
// Garden Grove Virtual Museum — main entry.





// ---- Read manifests ----
function readJson(id) {
  const el = document.getElementById(id);
  try { return JSON.parse(el.textContent); } catch { return null; }
}
const mayors = readJson('mayors-manifest') || [];
const mapWall = readJson('map-manifest') || null;

const layout = buildLayout(mayors, mapWall);

const opts = {
  pixelation: 2,
  fogDistance: 28,
};

// ---- Renderer ----
const gameEl = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setPixelRatio(1);
gameEl.appendChild(renderer.domElement);

const built = buildScene(layout, opts);
const scene = built.scene;

// ---- Camera ----
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 200);
const player = createPlayer(layout, built.CELL);
player.applyToCamera(camera);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const px = Math.max(1, opts.pixelation | 0);
  const rw = Math.max(160, Math.floor(w / px));
  const rh = Math.max(120, Math.floor(h / px));
  renderer.setSize(rw, rh, false);
  renderer.domElement.style.width = w + 'px';
  renderer.domElement.style.height = h + 'px';
  renderer.domElement.style.imageRendering = 'pixelated';
  camera.aspect = rw / rh;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---- Minimap ----
const minimap = createMinimap(document.getElementById('minimap'), layout);

// ---- Input ----
const keyDown = {};
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  if (plaqueOpen) {
    if (e.key === 'Escape' || e.key === ' ') { closePlaque(); e.preventDefault(); }
    return;
  }
  const k = e.key.toLowerCase();
  keyDown[k] = true;
  if (k === 'w' || k === 'arrowup')        { player.tryMove(0); e.preventDefault(); }
  else if (k === 's' || k === 'arrowdown') { player.tryMove(2); e.preventDefault(); }
  else if (k === 'a' || k === 'arrowleft') { player.tryTurn(-1); e.preventDefault(); }
  else if (k === 'd' || k === 'arrowright'){ player.tryTurn(1);  e.preventDefault(); }
  else if (k === 'q')                      { player.tryMove(3); e.preventDefault(); }
  else if (k === 'e')                      { player.tryMove(1); e.preventDefault(); }
  else if (k === ' ')                      { inspectFront(); e.preventDefault(); }
});
window.addEventListener('keyup', e => { keyDown[e.key.toLowerCase()] = false; });

function clearHeldKeys() { for (const k in keyDown) keyDown[k] = false; }
window.addEventListener('blur', clearHeldKeys);
window.addEventListener('focus', clearHeldKeys);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearHeldKeys(); });
window.addEventListener('mousedown', clearHeldKeys);

// Hold-to-walk for forward/back
let lastMoveAttempt = 0;
function tickHold(now) {
  if (plaqueOpen) return;
  if (player.state.anim) return;
  if (now - lastMoveAttempt < 140) return;
  if (keyDown['w'] || keyDown['arrowup'])        { player.tryMove(0); lastMoveAttempt = now; }
  else if (keyDown['s'] || keyDown['arrowdown']) { player.tryMove(2); lastMoveAttempt = now; }
}

// ---- Plaque inspector ----
const plaqueView = document.getElementById('plaque-view');
const plaqueImg = document.getElementById('plaque-img');
const plaqueTitle = document.getElementById('plaque-title');
const plaqueSubtitle = document.getElementById('plaque-subtitle');
const plaqueBio = document.getElementById('plaque-bio');
let plaqueOpen = false;

function inspectFront() {
  const tile = { x: player.state.tx, y: player.state.ty };
  const wd = player.state.dir;
  const match = built.artObjects.find(a => a.tile.x === tile.x && a.tile.y === tile.y && a.wall === wd);
  if (match) {
    plaqueImg.src = match.src || '';
    plaqueImg.style.display = match.src ? 'block' : 'none';
    plaqueTitle.textContent = match.title || '—';
    plaqueSubtitle.textContent = match.subtitle || '';
    plaqueBio.textContent = match.bio || '';
    plaqueView.classList.add('open');
    plaqueOpen = true;
  }
}
function closePlaque() {
  plaqueView.classList.remove('open');
  plaqueOpen = false;
}
plaqueView.addEventListener('click', closePlaque);

// ---- Loop ----
let lastTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  const t = now / 1000;

  tickHold(now);
  player.update(now);
  player.applyToCamera(camera);
  if (built.playerLight) {
    built.playerLight.position.set(camera.position.x, 1.85, camera.position.z);
  }

  // Subtle chandelier shimmer (very gentle, museum-grade — not flicker)
  for (let i = 0; i < built.torchLights.length; i++) {
    const tl = built.torchLights[i];
    const breathe = 0.97 + Math.sin(t * 1.4 + i * 0.7) * 0.03;
    tl.light.intensity = tl.baseIntensity * breathe;
  }

  // Animated GIF redraw (if any)
  for (const a of built.artObjects) {
    const map = a.artMesh.material.map;
    if (map && map.userData && map.userData.animated) {
      const { ctx, canvas, img } = map.userData;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      map.needsUpdate = true;
    }
  }

  minimap.draw(player, built.artObjects);
  renderer.render(scene, camera);
}

document.getElementById('loading').style.transition = 'opacity 0.4s';
document.getElementById('loading').style.opacity = '0';
setTimeout(() => { document.getElementById('loading').style.display = 'none'; }, 400);

animate();
window.__museum = { layout, built, player, opts };


})();
