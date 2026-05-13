// Garden Grove Museum layout — central hub + tall cathedral Map Hall (north)
// + long Mayors' Hall (south).
// grid[y][x]: 0 = floor, 1 = wall, -1 = void (outside, no render, no collision)

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

// Standard ceiling height (in world meters); rooms can override.
export const STD_CEIL = 3.4;
export const TALL_CEIL = 11.5;   // map hall: cathedral — taller for grandeur

export function buildLayout(mayors, mapWallSlot) {
  const HUB = 5;
  // Map Hall — bigger so the giant map reveals as you walk in (boss-room scale).
  // 17×17 cells = 34m × 34m floor, 11.5m ceiling — true cathedral.
  const MAP_W = 17, MAP_H = 15;
  // Mayors Hall — long single-wall gallery for 19 portraits, every other tile
  const portraitCount = (mayors && mayors.length) || 19;
  const MAYOR_W = Math.max(15, portraitCount * 2 + 5);
  const MAYOR_H = 6;
  const CORR = 2;

  const halfHub = (HUB - 1) / 2;

  // Rooms positioned in cell-units; hub centered on (0,0).
  const mapCY = -(halfHub + CORR + 1 + (MAP_H - 1) / 2);
  const mapCX = 0;
  const mayCY = (halfHub + CORR + 1 + (MAYOR_H - 1) / 2);
  const mayCX = 0;

  const rooms = [
    { id: 'hub',    cx: 0,     cy: 0,     w: HUB,     h: HUB,     ceilH: STD_CEIL, isHub: true  },
    { id: 'map',    cx: mapCX, cy: mapCY, w: MAP_W,   h: MAP_H,   ceilH: TALL_CEIL              },
    { id: 'mayors', cx: mayCX, cy: mayCY, w: MAYOR_W, h: MAYOR_H, ceilH: STD_CEIL               },
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
  // Per-cell ceiling height (for floor tiles only)
  const ceilH = Array.from({ length: height }, () => new Array(width).fill(STD_CEIL));
  // Per-cell room id
  const roomId = Array.from({ length: height }, () => new Array(width).fill(null));

  // Carve rooms.
  for (const r of rooms) {
    const hw = (r.w - 1) / 2, hh = (r.h - 1) / 2;
    const x0 = r.cx - hw + offX, y0 = r.cy - hh + offY;
    for (let dy = 0; dy < r.h; dy++) {
      for (let dx = 0; dx < r.w; dx++) {
        const gx = x0 + dx, gy = y0 + dy;
        grid[gy][gx] = 0;
        ceilH[gy][gx] = r.ceilH;
        roomId[gy][gx] = r.id;
      }
    }
    r.x0 = x0; r.y0 = y0;
  }

  // Carve a corridor between two rooms along a cardinal direction.
  function carveCorridor(fromR, dir) {
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
  carveCorridor(hub, 0); // north → Map Hall
  carveCorridor(hub, 2); // south → Mayors Hall

  // ---------- ARTWORK PLACEMENTS ----------

  const placements = [];

  // Map Hall: ONE huge artwork on the NORTH wall, centered.
  const mapRoom = rooms[1];
  const mapNorthY = mapRoom.y0;
  const mapCenterX = mapRoom.x0 + Math.floor(MAP_W / 2);
  if (mapWallSlot) {
    placements.push({
      x: mapCenterX, y: mapNorthY, wall: 0,
      ...mapWallSlot,
      cathedral: true, // signal scene to render full-wall, full-height
    });
  }

  // Mayors Hall: portraits along SOUTH wall, west → east, every other tile,
  // skipping center column where the corridor enters.
  const mayRoom = rooms[2];
  const southRow = mayRoom.y0 + MAYOR_H - 1;
  const doorCol = mayRoom.x0 + Math.floor(MAYOR_W / 2);
  const slots = [];
  for (let dx = 1; dx < MAYOR_W - 1; dx += 2) {
    const gx = mayRoom.x0 + dx;
    if (gx === doorCol || gx === doorCol - 1 || gx === doorCol + 1) continue;
    slots.push({ x: gx, y: southRow, wall: 2 });
  }
  for (let i = 0; i < mayors.length && i < slots.length; i++) {
    placements.push({ ...slots[i], ...mayors[i] });
  }

  // ---------- LIGHTING SLOTS ----------
  const lights = [];
  // Hub: 4 sconces + central chandelier
  lights.push({ x: hub.x0 + 1,         y: hub.y0 + 1,         kind: 'sconce', wall: 0 });
  lights.push({ x: hub.x0 + HUB - 2,   y: hub.y0 + 1,         kind: 'sconce', wall: 0 });
  lights.push({ x: hub.x0 + 1,         y: hub.y0 + HUB - 2,   kind: 'sconce', wall: 2 });
  lights.push({ x: hub.x0 + HUB - 2,   y: hub.y0 + HUB - 2,   kind: 'sconce', wall: 2 });
  lights.push({ x: hub.x0 + halfHub,   y: hub.y0 + halfHub,   kind: 'chandelier', ceilH: STD_CEIL });

  // Map hall: tall room — chandeliers high, plus uplights along the side walls
  // grid: 3×3 chandeliers
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const fx = (i + 0.5) / 3, fy = (j + 0.5) / 3;
      lights.push({
        x: mapRoom.x0 + Math.floor(MAP_W * fx),
        y: mapRoom.y0 + Math.floor(MAP_H * fy),
        kind: 'chandelier',
        ceilH: TALL_CEIL,
      });
    }
  }

  // Map hall side-wall sconces — flank the player's path to the map.
  // East and west walls; spaced every ~3 cells.
  for (let j = 1; j < MAP_H - 1; j += 3) {
    lights.push({ x: mapRoom.x0,         y: mapRoom.y0 + j, kind: 'sconce', wall: 3 });
    lights.push({ x: mapRoom.x0 + MAP_W - 1, y: mapRoom.y0 + j, kind: 'sconce', wall: 1 });
  }

  // Mayors hall: chandeliers along centerline
  const mayChCount = Math.max(4, Math.floor(MAYOR_W / 5));
  for (let i = 0; i < mayChCount; i++) {
    const fx = (i + 0.5) / mayChCount;
    lights.push({
      x: mayRoom.x0 + Math.floor(MAYOR_W * fx),
      y: mayRoom.y0 + Math.floor(MAYOR_H / 2),
      kind: 'chandelier',
      ceilH: STD_CEIL,
    });
  }

  // ---------- DIRECTIONAL SIGNS ----------
  const signs = [
    { x: hub.cx + offX, y: hub.y0,           wall: 0, label: 'MAP HALL',     arrow: '↑' },
    { x: hub.cx + offX, y: hub.y0 + HUB - 1, wall: 2, label: "MAYORS' HALL", arrow: '↓' },
  ];

  // Spawn: hub center, facing north (toward Map Hall)
  let spawn = { x: hub.cx + offX, y: hub.cy + offY, dir: 0 };

  // ---------- TRIM (keep only cells touching the floor) ----------
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
  const newGrid  = Array.from({ length: newH }, () => new Array(newW).fill(0));
  const newCeilH = Array.from({ length: newH }, () => new Array(newW).fill(STD_CEIL));
  const newRoomId = Array.from({ length: newH }, () => new Array(newW).fill(null));
  for (let y = 0; y < newH; y++) {
    for (let x = 0; x < newW; x++) {
      const ox = x + tMinX, oy = y + tMinY;
      newGrid[y][x] = keep[oy][ox] ? grid[oy][ox] : -1;
      newCeilH[y][x] = ceilH[oy][ox];
      newRoomId[y][x] = roomId[oy][ox];
    }
  }
  // Shift coords.
  spawn.x -= tMinX; spawn.y -= tMinY;
  for (const p of placements) { p.x -= tMinX; p.y -= tMinY; }
  for (const l of lights)     { l.x -= tMinX; l.y -= tMinY; }
  for (const s of signs)      { s.x -= tMinX; s.y -= tMinY; }

  const roomsOut = rooms.map(r => ({
    id: r.id, ceilH: r.ceilH,
    cx: r.cx + offX - tMinX,
    cy: r.cy + offY - tMinY,
    w: r.w, h: r.h,
    x0: r.x0 - tMinX,
    y0: r.y0 - tMinY,
  }));

  return {
    grid: newGrid, ceilH: newCeilH, roomId: newRoomId,
    width: newW, height: newH,
    spawn, placements, lights, signs, rooms: roomsOut,
    torches: lights, // legacy alias
  };
}
