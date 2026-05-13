// Wasapok Castle layout — square central hall + 4 themed rooms.
// grid[y][x]: 0=floor, 1=wall, -1=void
// Direction: 0=N (−Y), 1=E (+X), 2=S (+Y), 3=W (−X)

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

export const STD_CEIL = 3.6;     // standard ceiling height (meters)
export const HALL_CEIL = 5.6;    // central hall — bigger
export const PORTAL_CEIL = 4.4;  // wasapok portal room

export function buildLayout() {
  // Rooms + their door directions (back-toward-hub)
  const HUB = 5;  // 5x5 hub
  const HUB_CEIL = HALL_CEIL;
  const CORR = 2; // corridor length

  // Each room: ROOM_W × ROOM_H, ceilH, kind, theme
  const rooms = [
    {
      id: 'hub', kind: 'hub',
      cx: 0, cy: 0, w: HUB, h: HUB, ceilH: HUB_CEIL,
    },
    {
      // Throne Room — NORTH
      id: 'throne', kind: 'throne',
      cx: 0, cy: -((HUB + 1)/2 + CORR + (7 - 1)/2 + 1), w: 7, h: 7, ceilH: STD_CEIL,
      parentDir: 0,
    },
    {
      // Library / Scriptorium — EAST
      id: 'library', kind: 'library',
      cx: ((HUB + 1)/2 + CORR + (7 - 1)/2 + 1), cy: 0, w: 7, h: 7, ceilH: STD_CEIL,
      parentDir: 1,
    },
    {
      // Wasapok Portal Room — SOUTH
      id: 'portal', kind: 'portal',
      cx: 0, cy: ((HUB + 1)/2 + CORR + (5 - 1)/2 + 1), w: 5, h: 5, ceilH: PORTAL_CEIL,
      parentDir: 2,
    },
    {
      // Armory — WEST
      id: 'armory', kind: 'armory',
      cx: -((HUB + 1)/2 + CORR + (7 - 1)/2 + 1), cy: 0, w: 7, h: 7, ceilH: STD_CEIL,
      parentDir: 3,
    },
  ];

  // Compute grid bbox
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const r of rooms) {
    const hw = (r.w - 1) / 2, hh = (r.h - 1) / 2;
    minX = Math.min(minX, r.cx - hw); maxX = Math.max(maxX, r.cx + hw);
    minY = Math.min(minY, r.cy - hh); maxY = Math.max(maxY, r.cy + hh);
  }
  const pad = 2;
  const width  = (maxX - minX) + 1 + pad * 2;
  const height = (maxY - minY) + 1 + pad * 2;
  const offX = -minX + pad;
  const offY = -minY + pad;

  const grid    = Array.from({length: height}, () => new Array(width).fill(1));
  const ceilH   = Array.from({length: height}, () => new Array(width).fill(STD_CEIL));
  const roomId  = Array.from({length: height}, () => new Array(width).fill(null));

  // Carve rooms
  for (const r of rooms) {
    const hw = (r.w - 1) / 2, hh = (r.h - 1) / 2;
    const x0 = r.cx - hw + offX, y0 = r.cy - hh + offY;
    for (let dy = 0; dy < r.h; dy++) {
      for (let dx = 0; dx < r.w; dx++) {
        grid[y0 + dy][x0 + dx] = 0;
        ceilH[y0 + dy][x0 + dx] = r.ceilH;
        roomId[y0 + dy][x0 + dx] = r.id;
      }
    }
    r.x0 = x0; r.y0 = y0;
  }

  // Corridors from hub to each room (1 tile wide)
  function carve(fromR, dir) {
    const hw = (fromR.w - 1) / 2, hh = (fromR.h - 1) / 2;
    const ex = fromR.cx + DX[dir] * hw + offX;
    const ey = fromR.cy + DY[dir] * hh + offY;
    for (let i = 1; i <= CORR; i++) {
      const gx = ex + DX[dir] * i;
      const gy = ey + DY[dir] * i;
      if (gx >= 0 && gy >= 0 && gx < width && gy < height) {
        grid[gy][gx] = 0;
        ceilH[gy][gx] = STD_CEIL;
        roomId[gy][gx] = 'corridor';
      }
    }
  }
  const hub = rooms[0];
  for (let d = 0; d < 4; d++) carve(hub, d);

  // Spawn: hub center, facing SOUTH (toward the PORTAL door — the headline feature)
  let spawn = { x: hub.cx + offX, y: hub.cy + offY, dir: 2 };

  // ====== Lights (torches on walls) ======
  // For each room, place a few torches; for hub place 4 in corners + 1 in center (chandelier).
  const lights = [];
  function torchAt(rx, ry, wall) {
    lights.push({ x: rx, y: ry, wall, kind: 'torch' });
  }
  for (const r of rooms) {
    if (r.kind === 'hub') {
      // 4 wall-mounted torches near corners
      torchAt(r.x0 + 1,         r.y0,             0);
      torchAt(r.x0 + r.w - 2,   r.y0,             0);
      torchAt(r.x0 + 1,         r.y0 + r.h - 1,   2);
      torchAt(r.x0 + r.w - 2,   r.y0 + r.h - 1,   2);
      // Central chandelier
      lights.push({ x: r.cx + offX, y: r.cy + offY, kind: 'chandelier', ceilH: r.ceilH });
    } else if (r.kind === 'throne' || r.kind === 'library' || r.kind === 'armory') {
      // Two side torches
      torchAt(r.x0,             r.y0 + Math.floor(r.h/2), 3);
      torchAt(r.x0 + r.w - 1,   r.y0 + Math.floor(r.h/2), 1);
      // Center chandelier
      lights.push({ x: r.cx + offX, y: r.cy + offY, kind: 'chandelier', ceilH: r.ceilH });
    } else if (r.kind === 'portal') {
      // Two flanking torches near the door, no chandelier (portal glow lights the room)
      torchAt(r.x0,             r.y0 + Math.floor(r.h/2), 3);
      torchAt(r.x0 + r.w - 1,   r.y0 + Math.floor(r.h/2), 1);
    }
  }

  // ====== Door signs (carved wood above each hub corridor mouth) ======
  const signs = [
    { x: hub.cx + offX, y: hub.y0,            wall: 0, label: 'THRONE',  toRoom: 'throne'  },
    { x: hub.x0 + hub.w - 1, y: hub.cy + offY, wall: 1, label: 'LIBRARY', toRoom: 'library' },
    { x: hub.cx + offX, y: hub.y0 + hub.h - 1, wall: 2, label: 'PORTAL',  toRoom: 'portal'  },
    { x: hub.x0,        y: hub.cy + offY, wall: 3, label: 'ARMORY',  toRoom: 'armory'  },
  ];

  // ====== Trim grid (drop unreachable padding) ======
  const keep = Array.from({length: height}, () => new Array(width).fill(false));
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
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (keep[y][x]) {
      if (x < tMinX) tMinX = x; if (x > tMaxX) tMaxX = x;
      if (y < tMinY) tMinY = y; if (y > tMaxY) tMaxY = y;
    }
  }
  const newW = tMaxX - tMinX + 1, newH = tMaxY - tMinY + 1;
  const newGrid  = Array.from({length: newH}, () => new Array(newW).fill(-1));
  const newCeilH = Array.from({length: newH}, () => new Array(newW).fill(STD_CEIL));
  const newRoom  = Array.from({length: newH}, () => new Array(newW).fill(null));
  for (let y = 0; y < newH; y++) for (let x = 0; x < newW; x++) {
    const ox = x + tMinX, oy = y + tMinY;
    newGrid[y][x]  = keep[oy][ox] ? grid[oy][ox] : -1;
    newCeilH[y][x] = ceilH[oy][ox];
    newRoom[y][x]  = roomId[oy][ox];
  }
  spawn.x -= tMinX; spawn.y -= tMinY;
  for (const l of lights) { l.x -= tMinX; l.y -= tMinY; }
  for (const s of signs)  { s.x -= tMinX; s.y -= tMinY; }
  const roomsOut = rooms.map(r => ({
    id: r.id, kind: r.kind, ceilH: r.ceilH,
    cx: r.cx + offX - tMinX, cy: r.cy + offY - tMinY,
    w: r.w, h: r.h, x0: r.x0 - tMinX, y0: r.y0 - tMinY,
    parentDir: r.parentDir,
  }));

  return {
    grid: newGrid, ceilH: newCeilH, roomId: newRoom,
    width: newW, height: newH,
    spawn, lights, signs, rooms: roomsOut,
    placements: [],   // legacy
    torches: lights,  // legacy
  };
}
