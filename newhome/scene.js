import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// 6×4 maple-frame bookshelf cubby grid, head-on static view. Same pixelated
// wood-tile + recessed-cubby-box construction as castle/hallway2/scene.js
// shelfWalls (Wasapok room). Each cubby is its own Group, addressable two
// ways via window.cubbies:
//   - window.cubbies[row][col]      // row 0 = top, col 0 = left
//   - window.cubbies.A1 .. .D6      // letters A–D row from BOTTOM up,
//                                   //   numbers 1–6 col from LEFT to right
// e.g. A1 = bottom-left, D6 = top-right. Child meshes added to a cubby sit
// inside its local frame (origin at front-center of opening, +x right,
// +y up, -z into the wall).

const PIXELATION = 3;
const COLS = 6, ROWS = 4;
const TILE_W = 2, TILE_H = 2;
const GRID_W = COLS * TILE_W;
const GRID_H = ROWS * TILE_H;

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(1);
renderer.setClearColor(0x1a1410, 1);
renderer.localClippingEnabled = true;     // each merged-cubby material gets world-space clip planes to its own footprint so the hallway's sky/ground can't bleed into adjacent cubby openings

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1410);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
camera.position.set(0, 0, 20);
camera.lookAt(0, 0, 0);

// Lighting for future user-added shaded meshes (MeshStandardMaterial,
// MeshToonMaterial, etc.). Cubby walls themselves use MeshBasicMaterial
// with vertex colors and aren't affected. Three lights mimic the
// pixel-art shading convention: soft ambient base, key from front-upper-left,
// faint warm bottom-fill to echo the lit bottom plank of each cubby.
// Trophy Gallery lighting — warmer amber ambient, soft directional key,
// gentle bottom fill from the carpet, plus an off-screen-right lamp glow
// pooling onto the metallic objects (diamond / manifold / turntable).
// Only standard-material objects pick up the lamp; the bookshelf wall is
// MeshBasic so its tone is baked in.
scene.add(new THREE.AmbientLight(0xffd6a0, 0.55));
const key = new THREE.DirectionalLight(0xfff0c8, 0.85);
key.position.set(-6, 8, 10);
scene.add(key);
const fill = new THREE.DirectionalLight(0xffc488, 0.20);
fill.position.set(0, -6, 6);
scene.add(fill);
const lamp = new THREE.PointLight(0xffb060, 1.8, 22, 1.5);
lamp.position.set(10, 2, 3);
scene.add(lamp);

// --- Procedural maple bookshelf wall: wood frame only (top/bottom planks +
// side dividers), cubby interiors alpha=0 so the recessed-box geometry
// behind shows through. Drawn at full grid resolution into one canvas (not
// a repeated tile) so the divider between A5 and B5 can be selectively
// omitted — those two cells merge into one tall doorway opening onto the
// outside scene.
const TPX = 256, PLANK = 22, SIDE = 8;
const top = PLANK, bottom = TPX - PLANK;
const left = SIDE, right = TPX - SIDE;

// Merged-cubby spec — each entry defines a rectangular block of grid cells
// that share one combined opening (inner plank/side dividers removed). The
// top-left cell of each block is the "anchor": all cells in the block alias
// the same THREE.Group, so cubbies.A5 === cubbies.B5, etc. Row indexing has
// row 0 = top, ROWS-1 = bottom; col 0 = left.
// omitBack=true leaves the back panel off (used by the A5+B5 doorway so
// the outside scene shows through).
const MERGES = [
  { rowMin: 2, rowMax: 3, colMin: 4, colMax: 4, omitBack: true  },  // A5+B5 doorway
  { rowMin: 0, rowMax: 1, colMin: 3, colMax: 4, omitBack: false },  // C4+C5+D4+D5 square
];
function mergeAt(r, c) {
  for (const m of MERGES) {
    if (r >= m.rowMin && r <= m.rowMax && c >= m.colMin && c <= m.colMax) return m;
  }
  return null;
}
const isMergeAnchor    = (r, c) => { const m = mergeAt(r, c); return !!m && r === m.rowMin && c === m.colMin; };
const isMergeNonAnchor = (r, c) => { const m = mergeAt(r, c); return !!m && !(r === m.rowMin && c === m.colMin); };

const WALL_PX_W = COLS * TPX;
const WALL_PX_H = ROWS * TPX;
const tc = document.createElement('canvas');
tc.width = WALL_PX_W; tc.height = WALL_PX_H;
const tx = tc.getContext('2d');
tx.imageSmoothingEnabled = false;

// Cut openings via an evenodd clip, then fill the remaining wood frame.
// Each MERGES entry contributes one rectangle spanning all its rows × cols
// (inner dividers consumed); non-anchor merge cells are skipped so the
// dividers between them aren't recut as separate holes.
tx.save();
tx.beginPath();
tx.rect(0, 0, WALL_PX_W, WALL_PX_H);
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (isMergeNonAnchor(r, c)) continue;
    const m = mergeAt(r, c);
    const rMin = m ? m.rowMin : r, rMax = m ? m.rowMax : r;
    const cMin = m ? m.colMin : c, cMax = m ? m.colMax : c;
    const x0 = cMin * TPX + SIDE;
    const y0 = rMin * TPX + PLANK;
    const x1 = (cMax + 1) * TPX - SIDE;
    const y1 = (rMax + 1) * TPX - PLANK;
    tx.rect(x0, y0, x1 - x0, y1 - y0);
  }
}
tx.clip('evenodd');
tx.fillStyle = '#d2a574';
tx.fillRect(0, 0, WALL_PX_W, WALL_PX_H);
// Wood grain — scaled to the full canvas area so density matches the
// original per-tile look.
for (let i = 0; i < 28 * ROWS * COLS; i++) {
  const gy = Math.random() * WALL_PX_H;
  const rr = 125 + (Math.random() * 35 | 0);
  const gg =  82 + (Math.random() * 22 | 0);
  const bb =  42 + (Math.random() * 22 | 0);
  tx.strokeStyle = `rgba(${rr},${gg},${bb},0.22)`;
  tx.lineWidth = 1;
  tx.beginPath();
  tx.moveTo(0, gy);
  tx.lineTo(WALL_PX_W, gy + (Math.random() - 0.5) * 5);
  tx.stroke();
}
tx.restore();
// Per-tile plank highlights (light top edge, dark bottom edge). Skip
// edges that fall inside a merged region (i.e., a same-merge cell is
// directly above for the top edge, or directly below for the bottom edge).
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const ox = c * TPX, oy = r * TPX;
    const m = mergeAt(r, c);
    const topInsideMerge = m && r > m.rowMin;
    const botInsideMerge = m && r < m.rowMax;
    if (!topInsideMerge) {
      tx.fillStyle = 'rgba(255,232,188,0.35)';
      tx.fillRect(ox, oy, TPX, 2);
    }
    if (!botInsideMerge) {
      tx.fillStyle = 'rgba(30,15,5,0.65)';
      tx.fillRect(ox, oy + TPX - 3, TPX, 3);
    }
  }
}

const shelfTex = new THREE.CanvasTexture(tc);
shelfTex.magFilter = THREE.NearestFilter;
shelfTex.minFilter = THREE.NearestFilter;
shelfTex.needsUpdate = true;

const wallMat = new THREE.MeshBasicMaterial({
  map: shelfTex, alphaTest: 0.5, side: THREE.FrontSide, transparent: true,
});
const wall = new THREE.Mesh(new THREE.PlaneGeometry(GRID_W, GRID_H), wallMat);
scene.add(wall);

// Trophy Gallery room context — dark mahogany wood paneling on three
// sides + plush burgundy carpet below, framing the bookshelf as if it's
// mounted on the wall of a quiet, warm den. Sits just behind the wall
// plane (z = -0.01) and writes depth, occluding the outside scene
// everywhere except through the hallway opening. A brass-warm baseboard
// trim sits at the bookshelf/carpet seam for that "real room" detail.
{
  const M = 60;
  const wallMat2 = new THREE.MeshBasicMaterial({ color: 0x281208 });   // dark mahogany
  const floorMat = new THREE.MeshBasicMaterial({ color: 0x4a1418 });   // deep burgundy carpet
  const trimMat  = new THREE.MeshBasicMaterial({ color: 0x5a3a1a });   // warm wood baseboard
  const add = (mat, w, h, x, y, z = -0.01) => {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    q.position.set(x, y, z);
    scene.add(q);
  };
  add(wallMat2, M * 2, M,    0,  (GRID_H + M) / 2);                    // wall above
  add(floorMat, M * 2, M,    0, -(GRID_H + M) / 2);                    // carpet below
  add(wallMat2, M, GRID_H, -(GRID_W + M) / 2, 0);                      // left wall
  add(wallMat2, M, GRID_H,  (GRID_W + M) / 2, 0);                      // right wall
  add(trimMat,  GRID_W + 2, 0.3, 0, -GRID_H / 2 - 0.15, -0.005);       // baseboard
}

// --- Recessed cubby box: 5 inward-facing panels (back + top + bottom + 2
// sides, no front). Vertex colors fake painted shading — dark back, lit
// bottom plank where things would sit. Brighter than the castle's dungeon
// shading because this scene has no fog/atmosphere to wade through.
const CUBBY_W = TILE_W * (right - left) / TPX;       // ~1.875m opening
const CUBBY_H = TILE_H * (bottom - top) / TPX;       // ~1.656m opening
const CUBBY_D = 0.7;                                 // depth into the wall
const FRONT_INSET = 0.006;                           // recess opening behind wall plane to dodge z-fighting
// Inner-divider widths (in world units) that get absorbed when cells merge.
const INNER_SIDE_W  = 2 * TILE_W * SIDE  / TPX;   // ~0.125m horizontal divider between adjacent cells
const INNER_PLANK_H = 2 * TILE_H * PLANK / TPX;   // ~0.344m vertical divider between stacked cells
// Augment each MERGES entry with its combined opening size + front-center
// world position.
for (const m of MERGES) {
  const nCols = m.colMax - m.colMin + 1;
  const nRows = m.rowMax - m.rowMin + 1;
  m.width   = nCols * CUBBY_W + (nCols - 1) * INNER_SIDE_W;
  m.height  = nRows * CUBBY_H + (nRows - 1) * INNER_PLANK_H;
  m.centerX = ((m.colMin + m.colMax) / 2 + 0.5) * TILE_W - GRID_W / 2;
  m.centerY = -(((m.rowMin + m.rowMax) / 2 + 0.5) * TILE_H - GRID_H / 2);
}
// Back-compat: MERGED_H = height of the A5+B5 doorway, still referenced
// by the outside scene's ground placement below.
const MERGED_H = MERGES[0].height;

const DEFAULT_CUBBY_COLORS = {
  back:   [0.04, 0.025, 0.012],
  top:    [0.06, 0.04,  0.02 ],
  bottom: [0.20, 0.13,  0.07 ],
  sides:  [0.06, 0.04,  0.02 ],
};
const makeCubbyGeom = (w, h, opts = {}) => {
  const w2 = w / 2, h2 = h / 2;
  const zF = -FRONT_INSET, zB = -CUBBY_D - FRONT_INSET;
  const positions = [], normals = [], colors = [], isBack = [], indices = [];
  const palette = { ...DEFAULT_CUBBY_COLORS, ...(opts.colors ?? {}) };
  // isBack: 1.0 for vertices at the back of the recessed box (z == zB),
  // 0.0 for front-facing vertices. The vertex shader shifts back verts by
  // uBackOffset.xy so each cubby's vanishing point tilts toward the cursor.
  const addQuad = (verts, n, col) => {
    const base = positions.length / 3;
    for (const v of verts) {
      positions.push(...v);
      isBack.push(Math.abs(v[2] - zB) < 1e-4 ? 1.0 : 0.0);
    }
    for (let i = 0; i < 4; i++) normals.push(...n);
    for (let i = 0; i < 4; i++) colors.push(...col);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  // opts.omitBack=true skips the back panel entirely, leaving the rear
  // wide open — the merged hallway uses this so the page bg shows through
  // its whole back.
  if (!opts.omitBack) {
    addQuad([[-w2,-h2,zB],[ w2,-h2,zB],[ w2, h2,zB],[-w2, h2,zB]], [0,0,1], palette.back);
  }
  addQuad([[-w2, h2,zB],[ w2, h2,zB],[ w2, h2,zF],[-w2, h2,zF]], [0,-1,0], palette.top);
  addQuad([[-w2,-h2,zF],[ w2,-h2,zF],[ w2,-h2,zB],[-w2,-h2,zB]], [0, 1,0], palette.bottom);
  addQuad([[-w2,-h2,zF],[-w2,-h2,zB],[-w2, h2,zB],[-w2, h2,zF]], [1, 0,0], palette.sides);
  addQuad([[ w2,-h2,zF],[ w2, h2,zF],[ w2, h2,zB],[ w2,-h2,zB]], [-1,0,0], palette.sides);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('isBack',   new THREE.Float32BufferAttribute(isBack, 1));
  g.setIndex(indices);
  return g;
};
const cubbyGeom = makeCubbyGeom(CUBBY_W, CUBBY_H);
// One recessed-box geometry per merge, sized to its combined opening.
// omitBack=true (A5+B5 doorway) leaves the back open so the outside scene
// shows through; everything else gets a normal back panel and reads as a
// deeper cubby box.
for (const m of MERGES) {
  m.geom = makeCubbyGeom(m.width, m.height, { omitBack: m.omitBack });
}
// Shader: shifts vertices flagged isBack=1 by per-cubby uBackOffset.xy.
// Forwards the color attribute manually since ShaderMaterial doesn't auto-wire
// the vertexColors flag like MeshBasicMaterial does.
const makeCubbyMat = (clippingPlanes) => new THREE.ShaderMaterial({
  uniforms: { uBackOffset: { value: new THREE.Vector2(0, 0) } },
  vertexShader: `
    uniform vec2 uBackOffset;
    attribute float isBack;
    attribute vec3 color;
    varying vec3 vColor;
    void main() {
      vec3 p = position + vec3(uBackOffset * isBack, 0.0);
      vColor = color;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vColor;
    void main() { gl_FragColor = vec4(vColor, 1.0); }
  `,
  side: THREE.DoubleSide,
  clippingPlanes,
});

// Build the 7×4 grid. cubbies[0] is the top row, cubbies[ROWS-1] the bottom.
const cubbies = [];
window.cubbies = cubbies;
for (let row = 0; row < ROWS; row++) {
  cubbies.push([]);
  for (let col = 0; col < COLS; col++) {
    const m = mergeAt(row, col);
    if (m && !(row === m.rowMin && col === m.colMin)) {
      // Non-anchor cell of a merge — alias the anchor's Group so all keys
      // for this merge (e.g., A5/B5, or C4/C5/D4/D5) resolve to one Group.
      cubbies[row].push(cubbies[m.rowMin][m.colMin]);
      continue;
    }
    const cellX     = m ? m.centerX : (col + 0.5) * TILE_W - GRID_W / 2;
    const cellY     = m ? m.centerY : -((row + 0.5) * TILE_H - GRID_H / 2);
    const openingW  = m ? m.width  : CUBBY_W;
    const openingH  = m ? m.height : CUBBY_H;
    const geom      = m ? m.geom   : cubbyGeom;
    const cubbyGroup = new THREE.Group();
    cubbyGroup.position.set(cellX, cellY, 0);
    // World-space clipping planes confine every material in this cubby's
    // subtree to its own footprint — no leakage into neighbors regardless
    // of how the parallax shader tilts the back.
    const halfW = openingW / 2 + 0.002;
    const halfH = openingH / 2 + 0.002;
    const wx = cubbyGroup.position.x;
    const wy = cubbyGroup.position.y;
    const clippingPlanes = [
      new THREE.Plane(new THREE.Vector3( 1, 0, 0), -wx + halfW),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0),  wx + halfW),
      new THREE.Plane(new THREE.Vector3( 0, 1, 0), -wy + halfH),
      new THREE.Plane(new THREE.Vector3( 0,-1, 0),  wy + halfH),
    ];
    const cubbyMesh = new THREE.Mesh(geom, makeCubbyMat(clippingPlanes));
    cubbyGroup.add(cubbyMesh);
    cubbyGroup.userData.cubbyMesh      = cubbyMesh;     // for per-frame uBackOffset updates
    cubbyGroup.userData.merge          = m || null;
    cubbyGroup.userData.openingW       = openingW;
    cubbyGroup.userData.openingH       = openingH;
    cubbyGroup.userData.clippingPlanes = clippingPlanes; // reused by the hallway's sky/ground
    scene.add(cubbyGroup);
    cubbies[row].push(cubbyGroup);
  }
}
// Label aliases: A–D rows from BOTTOM up, 1–6 cols from LEFT to right.
// Lets you write `cubbies.A1` instead of `cubbies[ROWS-1][0]`.
const ROW_LETTERS = 'ABCD';
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    cubbies[ROW_LETTERS[ROWS - 1 - row] + (col + 1)] = cubbies[row][col];
  }
}

// === Outside scene behind the merged A5+B5 hallway — rolling hills under a
// pale sky. Visible ONLY through the hallway opening: every other cubby
// has an opaque back panel that depth-occludes the sky/ground behind it,
// the front maple wall occludes everything outside the cubby openings,
// and the border mask quads above kill the negative space around the
// shelf. So the hills end up framed by the single hole that has nothing
// in front of them — the hallway.
const outsideScene = new THREE.Group();
outsideScene.position.set(0, 0, -CUBBY_D - FRONT_INSET);
cubbies.A5.add(outsideScene);

// --- Sky backdrop: pale blue → hazy horizon gradient on a vertical plane
// well behind the ground. Sized generously so the hallway's perspective
// never reveals its edges.
const skyTex = (() => {
  const W = 256, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0,    '#9bc4e2');
  grad.addColorStop(0.65, '#c8dfee');
  grad.addColorStop(1,    '#e3ebec');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
})();
const SKY_Z = -36;
const sky = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 60),
  new THREE.MeshBasicMaterial({ map: skyTex }),
);
sky.position.set(0, 0, SKY_Z);
outsideScene.add(sky);

// --- Ground: subdivided plane rotated horizontal, vertex y displaced by a
// sum-of-sines hills function for organic rolling terrain. Vertex colors
// bake in slope shading (skyward-facing flat tops brighter than side
// slopes) and a distance haze mixing toward sky color at the far edge so
// hills blend smoothly into the horizon.
const GROUND_W = 36;
const GROUND_D = 32;
const GROUND_SEGS = 80;
const groundGeom = new THREE.PlaneGeometry(GROUND_W, GROUND_D, GROUND_SEGS, GROUND_SEGS);
groundGeom.rotateX(-Math.PI / 2);

const groundPos = groundGeom.attributes.position;
const bigHills = (x, z) =>
   1.00 * Math.sin(x * 0.30 + 1.2) +
   0.75 * Math.cos(z * 0.28 - 0.5) +
   1.20 * Math.sin(x * 0.13 + z * 0.18 + 2.4) +
   0.40 * Math.cos(x * 0.55 + z * 0.42 + 1.0);
const smallHills = (x, z) =>
   0.12 * Math.sin(x * 1.70 + 3.1) +
   0.10 * Math.cos(z * 1.90 + 1.8) +
   0.09 * Math.sin(x * 2.50 + z * 2.30 + 0.7);
const smallContrib = new Float32Array(groundPos.count);
for (let i = 0; i < groundPos.count; i++) {
  const x = groundPos.getX(i);
  const z = groundPos.getZ(i);
  // 0 at far edge → 1 at near edge, squared so small hills concentrate
  // in the closer foreground and fade out before the horizon.
  const t = (z + GROUND_D / 2) / GROUND_D;
  const nearW = Math.max(0, Math.min(1, t)) ** 2;
  const small = smallHills(x, z) * nearW;
  groundPos.setY(i, bigHills(x, z) + small);
  smallContrib[i] = Math.abs(small);
}
groundPos.needsUpdate = true;
groundGeom.computeVertexNormals();

const groundNorm = groundGeom.attributes.normal;
const groundColors = new Float32Array(groundPos.count * 3);
const BASE_R = 0.28, BASE_G = 0.70, BASE_B = 0.18;     // saturated ACME grass
const HAZE_R = 0.78, HAZE_G = 0.87, HAZE_B = 0.92;     // approach sky color
const quant = (v, steps) => Math.round(v * steps) / steps;
for (let i = 0; i < groundPos.count; i++) {
  const dist = 0.5 - groundPos.getZ(i) / GROUND_D;
  const distMix = quant(Math.pow(Math.max(0, Math.min(1, dist)), 1.4), 5);
  const ny = Math.max(0, groundNorm.getY(i));
  const lit = quant(0.60 + 0.40 * ny, 4);
  const tint = quant(1 - Math.min(0.55, smallContrib[i] * 3.0), 4);
  groundColors[i*3]     = (BASE_R + (HAZE_R - BASE_R) * distMix) * lit * tint;
  groundColors[i*3 + 1] = (BASE_G + (HAZE_G - BASE_G) * distMix) * lit * tint;
  groundColors[i*3 + 2] = (BASE_B + (HAZE_B - BASE_B) * distMix) * lit * tint;
}
groundGeom.setAttribute('color', new THREE.BufferAttribute(groundColors, 3));

const ground = new THREE.Mesh(
  groundGeom,
  new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
);
ground.position.set(0, -MERGED_H / 2, -GROUND_D / 2);
outsideScene.add(ground);

// --- Auto-fit: pick the camera distance that makes the grid fully visible
// on both axes (letterboxing on whichever axis is shorter than the grid's
// 14:8 ratio). Low-res render buffer + CSS pixelated upscaling gives the
// chunky pixel-art look.
const onResize = () => {
  const w = window.innerWidth, h = window.innerHeight;
  const aspect = w / h;
  camera.aspect = aspect;
  const fovV = camera.fov * Math.PI / 180;
  const distH = (GRID_H / 2) / Math.tan(fovV / 2);
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * aspect);
  const distW = (GRID_W / 2) / Math.tan(fovH / 2);
  camera.position.z = Math.max(distH, distW) * 1.02;
  camera.updateProjectionMatrix();
  renderer.setSize(Math.floor(w / PIXELATION), Math.floor(h / PIXELATION), false);
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
};
window.addEventListener('resize', onResize);
onResize();

// === Top-left cubby: same floating-diamond sculpture as the main hall of
// /castle — cel-shaded WasaDiminds-02 crystal with inverted-hull outline,
// hanging below the biopunk-manifold base. The whole base is scaled down
// and flipped (rotation.x = π) so the manifold mounts to the cubby's
// CEILING instead of the floor, with its respirator hoses plunging up into
// the wood frame above. Diamond gradually bobs ±6cm on a 4s cycle, no
// rotation.
const topLeftCubby = cubbies.D1;     // top row (D), leftmost column (1)
const SCULPT_Z   = -CUBBY_D * 0.5;
const CEILING_Y  =  CUBBY_H / 2;
const BASE_SCALE =  0.22;

// --- Biopunk manifold: stacked collar + hub + cap + port + 4 reinforced
// hoses, lifted straight from castle/museum/scene.js.
const baseGroup = new THREE.Group();
baseGroup.scale.setScalar(BASE_SCALE);
baseGroup.rotation.x = Math.PI;
baseGroup.position.set(0, CEILING_Y, SCULPT_Z);
baseGroup.renderOrder = 5;
topLeftCubby.add(baseGroup);
// renderOrder applies per-Mesh in Three.js (Groups don't propagate it), so we
// also stamp it on every child as they're added below via baseGroup.traverse.

// depthTest/depthWrite off + high renderOrder so the manifold always reads
// over the cubby panels — when the cursor tilts the perspective, the top
// panel rotates inward and would otherwise cut through the ring base.
const gunmetal  = new THREE.MeshStandardMaterial({
  color: 0x96a8b8, metalness: 0.85, roughness: 0.40,
  depthTest: false, depthWrite: false,
});
const bandSteel = new THREE.MeshStandardMaterial({
  color: 0xccdce8, metalness: 1.0,  roughness: 0.22,
  depthTest: false, depthWrite: false,
});

const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.92, 0.18, 32), gunmetal);
collar.position.y = 0.09;
baseGroup.add(collar);

const collarBand = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.025, 8, 48), bandSteel);
collarBand.rotation.x = -Math.PI / 2;
collarBand.position.y = 0.18;
baseGroup.add(collarBand);

const centralHub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.60, 0.30, 28), gunmetal);
centralHub.position.y = 0.32;
baseGroup.add(centralHub);

const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.05, 24), bandSteel);
cap.position.y = 0.50;
baseGroup.add(cap);

const port = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.20, 0.18, 18), gunmetal);
port.position.y = 0.62;
baseGroup.add(port);

const TUBE_R = 0.105;
const HOSE_DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
const bandRingGeom = new THREE.TorusGeometry(TUBE_R + 0.022, 0.022, 8, 14);
for (const [dx, dz] of HOSE_DIRS) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(dx * 0.45,  0.30, dz * 0.45),
    new THREE.Vector3(dx * 0.85,  0.27, dz * 0.85),
    new THREE.Vector3(dx * 1.20, -0.05, dz * 1.20),
    new THREE.Vector3(dx * 1.45, -0.75, dz * 1.45),
    new THREE.Vector3(dx * 1.55, -1.40, dz * 1.55),
  ]);
  const hose = new THREE.Mesh(new THREE.TubeGeometry(curve, 36, TUBE_R, 12, false), gunmetal);
  baseGroup.add(hose);
  const SEGMENTS = 8;
  for (let i = 1; i < SEGMENTS; i++) {
    const t = i / SEGMENTS;
    const p = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    const band = new THREE.Mesh(bandRingGeom, bandSteel);
    band.position.copy(p);
    band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
    baseGroup.add(band);
  }
}
baseGroup.traverse(o => { if (o.isMesh) o.renderOrder = 5; });

// --- Polished metallic diamond — full metalness, low roughness so every
// facet throws sharp specular highlights from the warm directional key
// and the blue point light nested inside the diamond group. Base color is
// brushed silver; the surrounding lighting tints it cool from inside and
// warm from above for a chrome-jewelry read.
// Generate a soft studio cube map via PMREM from RoomEnvironment, then
// attach it only to the diamond material so other PBR meshes (turntable,
// manifold, easels) aren't disturbed by global lighting changes.
const pmrem = new THREE.PMREMGenerator(renderer);
const diamondEnvMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();

const crystalMat = new THREE.MeshStandardMaterial({
  color: 0xd6dde6,
  metalness: 1.0,
  roughness: 0.10,
  envMap: diamondEnvMap,
  envMapIntensity: 3.7,
  side: THREE.DoubleSide,
});

let diamondMesh = null;       // assigned when WasaDiminds-02.obj finishes loading
let diamondDrag = null;       // { lastX } while user is dragging to spin
let diamondSpinVel = 0;       // angular velocity (rad/frame) — gives the spin inertia after release

const diamondGroup = new THREE.Group();
const DIAMOND_BASE_Y = 0.015;       // anchor — bob oscillates around this
diamondGroup.position.set(0, DIAMOND_BASE_Y, SCULPT_Z);
diamondGroup.rotation.x = Math.PI / 2;   // 90° tilt
topLeftCubby.add(diamondGroup);
diamondGroup.add(new THREE.PointLight(0x6aa8ff, 1.8, 1.6, 1.7));

// Soft blue spotlight from the manifold base ring shining down onto the
// diamond — short throw, wide cone, heavy penumbra so it reads as a
// glow halo rather than a sharp beam. Parented to the cubby (not the
// bobbing diamond) so the light source stays anchored at the base.
const baseSpot = new THREE.SpotLight(0x8ec4ff, 16.0, 1.4, Math.PI / 5, 0.7, 1.2);
baseSpot.position.set(0, CEILING_Y - 0.18, SCULPT_Z);
baseSpot.target.position.set(0, -CUBBY_H / 2 + 0.2, SCULPT_Z);
topLeftCubby.add(baseSpot);
topLeftCubby.add(baseSpot.target);

// Minimal inline OBJ parser — read vertex (v) and face (f) lines, triangulate
// quads via fan, build a BufferGeometry. Skips materials/textures/normals
// from the file (we recompute normals and override the material below). Used
// instead of the addon OBJLoader to keep the load path simple and surface
// errors directly.
fetch('WasaDiminds-02.obj').then(r => {
  if (!r.ok) throw new Error('OBJ fetch ' + r.status);
  return r.text();
}).then(text => {
  const verts = [];
  const indices = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('v ')) {
      const p = line.split(/\s+/);
      verts.push(+p[1], +p[2], +p[3]);
    } else if (line.startsWith('f ')) {
      const t = line.slice(2).trim().split(/\s+/);
      const idxs = t.map(x => parseInt(x.split('/')[0], 10) - 1);
      for (let i = 1; i < idxs.length - 1; i++) {
        indices.push(idxs[0], idxs[i], idxs[i + 1]);
      }
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  geom.computeBoundingBox();
  const size = geom.boundingBox.getSize(new THREE.Vector3());
  const ctr  = geom.boundingBox.getCenter(new THREE.Vector3());
  const maxD = Math.max(size.x, size.y, size.z) || 1;
  geom.translate(-ctr.x, -ctr.y, -ctr.z);
  const s = 1.20 / maxD;
  geom.scale(s, s, s);
  diamondMesh = new THREE.Mesh(geom, crystalMat);
  diamondGroup.add(diamondMesh);
  console.log('[newhome] WasaDiminds-02 parsed: verts=' + (verts.length / 3) + ' tris=' + (indices.length / 3));
}).catch(err => { console.error('[newhome] WasaDiminds-02.obj failed:', err); });

const _sculptT0 = performance.now();
function updateSculpture() {
  const t = (performance.now() - _sculptT0) / 1000;
  diamondGroup.position.y = DIAMOND_BASE_Y + Math.sin(t * Math.PI * 2 / 4.0) * 0.06;
  // Carry-over spin after the user releases the drag — multiplicative decay
  // (0.95 per 30fps frame ≈ ~2s glide before fully stopping).
  if (!diamondDrag && Math.abs(diamondSpinVel) > 0.0005) {
    diamondGroup.rotateOnWorldAxis(_diamondYAxis, diamondSpinVel);
    diamondSpinVel *= 0.95;
  }
}

// === Album covers — single-pocket sleeves that "open like a book toward
// the user" when clicked.
//
// Per-album hierarchy (built inside the cubby):
//   cubby
//     albumRoot                  — pops forward + scales up when opening
//       coverPivot               — Group hinged on the cover's LEFT edge,
//                                  rotation.y lerps 0 → ~-110° to swing open
//         front (cover image)    — mesh shifted +ALBUM_SIZE/2 so its left
//                                  edge sits at the pivot origin
//       inside (blank panel)     — paperboard interior of the sleeve, sits
//                                  where the cover was, revealed when open
//       vinylGroup (record)      — black disc + colored label, peeking out
//                                  the right of the sleeve when open
//
// Position stays anchored in the cubby — opening only pops forward (Z) and
// scales up. No left-shift; the cover doesn't unfold into a wide spread.
//
// Click handling:
//   - click hits a front cover           → toggle that album's open state
//   - click hits an open album's interior → no-op (stays open, future hook
//                                            for vinyl interactions)
//   - click misses every album entirely  → close all open albums
const ALBUM_SIZE   = 1.4;
const INSIDE_COLOR = 0x1f1810;       // raw paperboard color for the blank inside
const VINYL_COLOR  = 0x080808;
const LABEL_COLOR  = 0xb8651a;
const HOVER_SCALE    = 1.08;
const HOVER_TIP_RAD  = 0.25;
const HOVER_LERP     = 0.30;
const OPEN_LERP      = 0.20;
const OPEN_SCALE     = 1.45;         // albumRoot scale when fully open
const OPEN_Z_POP     = 0.55;         // albumRoot Z translation toward camera
const OPEN_COVER_ROT = -1.95;        // ~-112°, cover swings open toward the user
const VINYL_PEEK_X   = ALBUM_SIZE * 0.40;   // vinyl peeks out far enough that a slice of the orange label shows past the sleeve edge
const VINYL_OUT_X    = ALBUM_SIZE * 0.95;   // fully popped out (label visible past the sleeve)
// Lean: when closed, the cover leans back ~12° with its bottom edge
// resting on the cubby floor — like a record on display. Lerps to flat
// as the cover opens so the book-swing reads cleanly.
const LEAN_ANGLE     = 0.21;                // rad (~12° back tilt)
const LEAN_Y         = -0.143;              // y shift so the rotated cover's bottom touches the cubby floor

// Procedural vinyl texture — dark base with faint concentric grooves so the
// disc reads as a record rather than a flat black circle. One canvas shared
// across every vinyl mesh.
const vinylTex = (() => {
  const size = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;
  const maxR = size / 2;
  const minR = maxR * 0.32;            // grooves start outside the label area
  const N = 26;
  ctx.lineWidth = 1.4;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const r = minR + t * (maxR - minR);
    // Alternate slightly brighter / darker so adjacent grooves catch the eye
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(46,46,46,0.55)' : 'rgba(24,24,24,0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Short bright shine arcs scattered at varying radii + angles. Concentric
  // grooves are rotationally symmetric (invisible when spinning), so these
  // asymmetric highlights are what actually sells the rotation — they read
  // as the iridescent reflections real vinyl catches.
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = 'rgba(140, 145, 165, 0.38)';
  const shines = [
    { rT: 0.18, a0: 0.08, span: 0.18 },
    { rT: 0.36, a0: 0.55, span: 0.14 },
    { rT: 0.58, a0: 1.15, span: 0.20 },
    { rT: 0.74, a0: 1.62, span: 0.16 },
    { rT: 0.90, a0: 0.32, span: 0.12 },
  ];
  for (const s of shines) {
    const r = minR + s.rT * (maxR - minR);
    ctx.beginPath();
    ctx.arc(cx, cy, r, s.a0 * Math.PI * 2, (s.a0 + s.span) * Math.PI * 2);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
})();

const albumCoverMeshes = [];         // front-cover meshes (toggle-on-click targets)
const albumVinylMeshes = [];         // vinyl + label meshes (hover-to-spin targets)
const albumAllMeshes   = [];         // every interactive album mesh (hit-test "outside?")
const albumStates      = [];
const _hoverLocal      = new THREE.Vector3();

function placeAlbumCover(cubbyKey, texPath, audioSrc, labelColor = LABEL_COLOR) {
  const cubby = cubbies[cubbyKey];
  const tex = new THREE.TextureLoader().load(texPath);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 1;

  // transparent:true forces these materials into the transparent render queue
  // (after the opaque + transparent wall plane), so the album can draw OVER
  // the wooden cubby frame when it pops forward — without it, the wall's
  // wood pixels render after the album and cover it.
  const matOpts = { depthTest: false, depthWrite: false, side: THREE.DoubleSide, transparent: true };

  const albumRoot = new THREE.Group();
  albumRoot.position.set(0, LEAN_Y, -CUBBY_D * 0.55);
  albumRoot.rotation.x = -LEAN_ANGLE;
  cubby.add(albumRoot);

  // Easel — two thin diagonal back-supports flanking the cover, leaning at
  // the same angle. Lives in the cubby (not albumRoot), so it stays put
  // when the album pops forward to open, like a plate stand left on the
  // shelf. Legs sit 0.10m outside the cover's edges (clear of the hover
  // scale-up) and 0.025m behind the cover plane, so they read as a back
  // support without poking through the front.
  const EASEL_R = 0.025;
  const easelGeom = new THREE.CylinderGeometry(EASEL_R, EASEL_R, ALBUM_SIZE, 12);
  // depthTest/depthWrite off + renderOrder=5 so the tilting cubby side
  // walls never sweep over the easel during cursor parallax (same trick
  // the biopunk manifold uses). Stays under album covers (renderOrder 8).
  const easelMat = new THREE.MeshStandardMaterial({
    color: 0x6b4423, metalness: 0.05, roughness: 0.75,
    depthTest: false, depthWrite: false,
  });
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(easelGeom, easelMat);
    leg.position.set(sx * 0.80, LEAN_Y, -CUBBY_D * 0.55 - EASEL_R);
    leg.rotation.x = -LEAN_ANGLE;
    leg.renderOrder = 5;
    cubby.add(leg);
  }

  // Cover pivot at the cover's LEFT edge. The cover mesh is shifted +x by
  // half its size so its center sits at the cubby cover position when closed,
  // with its left edge at the pivot.
  const coverPivot = new THREE.Group();
  coverPivot.position.x = -ALBUM_SIZE / 2;
  albumRoot.add(coverPivot);
  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(ALBUM_SIZE, ALBUM_SIZE),
    new THREE.MeshBasicMaterial({ map: tex, ...matOpts }),
  );
  front.position.x = ALBUM_SIZE / 2;
  front.renderOrder = 8;             // top of the stack so it covers vinyl/inside when closed
  front.userData.kind = 'albumCover';
  coverPivot.add(front);

  // Vinyl record (built BEFORE inside so render order can layer inside on
  // top — inside panel must occlude the vinyl when it's tucked in).
  const vinylGroup = new THREE.Group();
  vinylGroup.position.set(0, 0, -0.01);
  albumRoot.add(vinylGroup);
  const vinyl = new THREE.Mesh(
    new THREE.CircleGeometry(ALBUM_SIZE * 0.46, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff, map: vinylTex, ...matOpts }),
  );
  vinyl.renderOrder = 5;
  vinyl.userData.kind = 'albumVinyl';
  vinylGroup.add(vinyl);
  const label = new THREE.Mesh(
    new THREE.CircleGeometry(ALBUM_SIZE * 0.13, 24),
    new THREE.MeshBasicMaterial({ color: labelColor, ...matOpts }),
  );
  label.position.z = 0.001;
  label.renderOrder = 6;
  label.userData.kind = 'albumLabel';
  vinylGroup.add(label);
  // Spindle hole at the label center. Hits register as the label so clicks
  // / hover-spin on the dead-center still behave the same as the label.
  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(ALBUM_SIZE * 0.013, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, ...matOpts }),
  );
  hole.position.z = 0.002;
  hole.renderOrder = 7;
  hole.userData.kind = 'albumLabel';
  vinylGroup.add(hole);

  // Inside panel — paperboard interior of the sleeve. renderOrder=7 so it
  // sits ON TOP of the vinyl/label, hiding whatever portion of the vinyl is
  // still inside the sleeve. Only the part of the vinyl that's slid past the
  // panel's right edge stays visible.
  const inside = new THREE.Mesh(
    new THREE.PlaneGeometry(ALBUM_SIZE, ALBUM_SIZE),
    new THREE.MeshBasicMaterial({ color: INSIDE_COLOR, ...matOpts }),
  );
  inside.position.set(0, 0, -0.015);
  inside.renderOrder = 7;
  inside.userData.kind = 'albumInside';
  albumRoot.add(inside);

  cubby.userData.albumCover = front;
  cubby.userData.albumRoot  = albumRoot;
  albumCoverMeshes.push(front);
  albumVinylMeshes.push(vinyl, label, hole);
  albumAllMeshes.push(front, inside, vinyl, label, hole);
  const state = {
    albumRoot, coverPivot, front, inside, vinylGroup, vinyl, label,
    isOpen: false, openness: 0,
    vinylOut: false, vinylness: 0,
    audioSrc, labelColor, audio: null,   // audio lazy-initialized on first play
  };
  // Back-references so the click handler can find a state from any of its
  // meshes without a search.
  front.userData.albumState = state;
  inside.userData.albumState = state;
  vinyl.userData.albumState = state;
  label.userData.albumState = state;
  hole.userData.albumState = state;
  albumStates.push(state);
}
// Audio + label color per album. Drop matching MP3 (or OGG) files into
// newhome/ when you have clips ready — they'll loop on the turntable when
// the record is loaded. Until the files exist, .play() fails silently.
placeAlbumCover('C2', 'BiomePlain_Album.png',   'BiomePlain.mp3',    0x4ea84e);   // forest green
placeAlbumCover('C3', 'PalmTreeSyrup_Cover.png','PalmTreeSyrup.mp3', 0xe8a730);   // amber
placeAlbumCover('B3', 'Periphsisha_Cover.png',  'Periphsisha.mp3',   0xb8651a);   // burnt orange (default)

// === Cubby B2: harman/kardon T25 turntable. Procedurally modeled to match
// reference photos — light champagne plinth, bright aluminum platter rim,
// black felt mat with cross spoke marks, polished silver center disc + spindle,
// BLACK plastic tonearm housing (not chrome), chrome arm, cream/white headshell
// with a reddish-brown cartridge and stylus + finger lift, two silver knobs +
// rectangular power button on the front face, four dark rubber feet, and a
// clear acrylic dust cover hinged at the back lifted open. Tilted forward ~63°
// so the top reads cleanly to the head-on camera.
function buildRecordPlayer() {
  const player = new THREE.Group();
  const W = 1.5, H = 0.12, D = 0.60;
  const platterR = 0.30;
  const platterTopY = H / 2 + 0.018;
  const platterX = -0.18;
  const armPivotX = 0.42;
  const armPivotZ = -0.20;

  const matOpts = { depthTest: false, depthWrite: false, transparent: true };

  const plinthMat    = new THREE.MeshStandardMaterial({ color: 0xc7c2b3, metalness: 0.35, roughness: 0.45, ...matOpts });
  const rimMat       = new THREE.MeshStandardMaterial({ color: 0xd6d3c8, metalness: 0.90, roughness: 0.20, ...matOpts });
  const feltMat      = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, metalness: 0.05, roughness: 0.95, ...matOpts });
  const spokeMat     = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.10, roughness: 0.85, ...matOpts });
  const centerDiscMat = new THREE.MeshStandardMaterial({ color: 0xb8b3a4, metalness: 0.95, roughness: 0.18, ...matOpts });
  const chromeMat    = new THREE.MeshStandardMaterial({ color: 0xb8b3a4, metalness: 0.92, roughness: 0.22, ...matOpts });
  const blackPlastic = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, metalness: 0.15, roughness: 0.55, ...matOpts });
  const headshellMat = new THREE.MeshStandardMaterial({ color: 0xeae3d1, metalness: 0.15, roughness: 0.45, ...matOpts });
  const cartridgeMat = new THREE.MeshStandardMaterial({ color: 0x6b3a26, metalness: 0.30, roughness: 0.50, ...matOpts });
  const rubberMat    = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.00, roughness: 0.85, ...matOpts });
  const dustCoverMat = new THREE.MeshStandardMaterial({
    color: 0xdde8f4, metalness: 0.00, roughness: 0.05,
    opacity: 0.14, side: THREE.DoubleSide, ...matOpts,
  });
  const recordVinylMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: vinylTex, side: THREE.DoubleSide, ...matOpts });
  const labelMat     = new THREE.MeshBasicMaterial({ color: LABEL_COLOR, side: THREE.DoubleSide, ...matOpts });

  const ro = (m, n) => { m.renderOrder = n; player.add(m); return m; };

  // Plinth — light champagne / brushed silver rectangle
  ro(new THREE.Mesh(new THREE.BoxGeometry(W, H, D), plinthMat), 5);

  // Rubber feet at 4 corners
  for (const [sx, sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.04, 16), rubberMat);
    foot.position.set(sx * (W / 2 - 0.10), -H / 2 - 0.02, sz * (D / 2 - 0.10));
    ro(foot, 5);
  }

  // Platter rim — bright aluminum
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(platterR, platterR, 0.030, 48), rimMat);
  rim.position.set(platterX, platterTopY, 0);
  ro(rim, 6);
  // Black felt mat sitting on top of the rim
  const feltR = platterR * 0.96;
  const felt = new THREE.Mesh(new THREE.CylinderGeometry(feltR, feltR, 0.010, 48), feltMat);
  felt.position.set(platterX, platterTopY + 0.020, 0);
  ro(felt, 7);
  // Cross spoke marks across the felt (2 perpendicular thin strips)
  for (let i = 0; i < 2; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(feltR * 1.85, 0.0025, 0.010), spokeMat);
    spoke.position.set(platterX, platterTopY + 0.026, 0);
    spoke.rotation.y = i * Math.PI / 2;
    spoke.renderOrder = 8;
    player.add(spoke);
  }
  // Polished silver center disc — where the harman/kardon emblem sits IRL
  const centerDisc = new THREE.Mesh(new THREE.CylinderGeometry(feltR * 0.33, feltR * 0.33, 0.005, 32), centerDiscMat);
  centerDisc.position.set(platterX, platterTopY + 0.027, 0);
  ro(centerDisc, 9);

  // Vinyl record loaded on top (uses the shared grooved texture). Wrapped in
  // a spin-group so the playback loop can rotate the record+label around
  // their shared center while music is playing.
  const spinGroup = new THREE.Group();
  spinGroup.position.set(platterX, platterTopY + 0.029, 0);
  player.add(spinGroup);
  const record = new THREE.Mesh(new THREE.CircleGeometry(feltR * 0.94, 48), recordVinylMat);
  record.rotation.x = -Math.PI / 2;
  record.renderOrder = 10;
  spinGroup.add(record);
  const recordLabel = new THREE.Mesh(new THREE.CircleGeometry(feltR * 0.30, 24), labelMat);
  recordLabel.rotation.x = -Math.PI / 2;
  recordLabel.position.y = 0.0005;
  recordLabel.renderOrder = 11;
  spinGroup.add(recordLabel);
  // Spindle hole — slightly wider than the chrome spindle (r=0.010) so a
  // black ring reads around the spindle's base where it meets the disc.
  const recordHole = new THREE.Mesh(
    new THREE.CircleGeometry(0.020, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, ...matOpts }),
  );
  recordHole.rotation.x = -Math.PI / 2;
  recordHole.position.y = 0.0008;
  recordHole.renderOrder = 12;
  spinGroup.add(recordHole);
  spinGroup.visible = false;        // empty turntable until a record is loaded
  player.userData.spinGroup         = spinGroup;
  player.userData.recordLabel       = recordLabel;
  player.userData.defaultLabelColor = LABEL_COLOR;

  // Spindle through the record's center hole — renderOrder 13 keeps it on
  // top of the black spindle-hole disc (renderOrder 12) so chrome reads in
  // the middle of the hole instead of the hole overpainting it.
  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.060, 16), chromeMat);
  spindle.position.set(platterX, platterTopY + 0.055, 0);
  ro(spindle, 13);

  // Tonearm BASE — black plastic housing on the back-right
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.080, 0.080, 24), blackPlastic);
  housing.position.set(armPivotX, H / 2 + 0.040, armPivotZ);
  ro(housing, 7);
  const bearing = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.050, 0.030, 24), blackPlastic);
  bearing.position.set(armPivotX, H / 2 + 0.095, armPivotZ);
  ro(bearing, 8);

  // Tonearm group — pivots above the bearing, sweeps over the record
  const tonearmGroup = new THREE.Group();
  tonearmGroup.position.set(armPivotX, H / 2 + 0.115, armPivotZ);
  tonearmGroup.rotation.y = 0.55;
  player.add(tonearmGroup);
  // Black counterweight at the back
  const cw = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.060, 16), blackPlastic);
  cw.rotation.z = Math.PI / 2;
  cw.position.x = 0.07;
  cw.renderOrder = 8;
  tonearmGroup.add(cw);
  // Chrome arm
  const armLen = 0.48;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, armLen, 12), chromeMat);
  arm.rotation.z = Math.PI / 2;
  arm.position.x = -armLen / 2;
  arm.renderOrder = 8;
  tonearmGroup.add(arm);
  // Cream/white headshell
  const headshell = new THREE.Mesh(new THREE.BoxGeometry(0.060, 0.025, 0.038), headshellMat);
  headshell.position.x = -armLen;
  headshell.renderOrder = 9;
  tonearmGroup.add(headshell);
  // Reddish-brown cartridge under the headshell
  const cartridge = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.018, 0.032), cartridgeMat);
  cartridge.position.set(-armLen, -0.020, 0);
  cartridge.renderOrder = 9;
  tonearmGroup.add(cartridge);
  // Stylus needle
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.001, 0.014, 8), chromeMat);
  needle.position.set(-armLen, -0.035, 0);
  needle.renderOrder = 10;
  tonearmGroup.add(needle);
  // Finger lift — small tab off the headshell
  const lift = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.010, 0.026), chromeMat);
  lift.position.set(-armLen + 0.030, 0, 0.025);
  lift.renderOrder = 9;
  tonearmGroup.add(lift);

  // Tonearm rest clip near the front-right of the arm area
  const rest = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.045, 16), blackPlastic);
  rest.position.set(W / 2 - 0.13, H / 2 + 0.022, 0.06);
  ro(rest, 7);

  // Front controls: two chrome knobs (speed / control) + rectangular power button
  for (let i = 0; i < 2; i++) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.014, 24), chromeMat);
    knob.position.set(0.22 + i * 0.10, H / 2 + 0.007, D / 2 - 0.08);
    ro(knob, 7);
  }
  const power = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.012, 0.046), chromeMat);
  power.position.set(W / 2 - 0.10, H / 2 + 0.006, D / 2 - 0.08);
  ro(power, 7);

  // Dust cover — clear acrylic box that hinges at a height above the plinth
  // top (so when closed it sits ABOVE the platter + tonearm, not through
  // them). Starts CLOSED (horizontal) and lerps OPEN (lifted nearly vertical
  // with a small backward lean) while the cursor hovers anywhere on the
  // turntable.
  const COVER_CLOSED_Y = 0.20;
  const coverPanelD    = D * 0.95;
  const coverThickness = 0.018;
  const coverHinge = new THREE.Group();
  coverHinge.position.set(0, COVER_CLOSED_Y, -D / 2);
  coverHinge.rotation.x = 0;                                // start closed (horizontal)
  player.add(coverHinge);
  const cover = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.97, coverThickness, coverPanelD),
    dustCoverMat,
  );
  cover.position.z = coverPanelD / 2;                       // back edge sits at the hinge
  cover.renderOrder = 13;
  coverHinge.add(cover);
  player.userData.coverHinge = coverHinge;
  player.userData.coverClosedRot = 0;
  player.userData.coverOpenRot   = -Math.PI / 2 + 0.20;     // ~80° from horizontal, slight lean back

  return player;
}
const recordPlayer = buildRecordPlayer();
recordPlayer.rotation.x = 0;                                                // flat — viewed straight-on like an actual bookshelf turntable
recordPlayer.position.set(0, -CUBBY_H / 2 + (0.12 / 2) + 0.04, -CUBBY_D * 0.40);
cubbies.B2.add(recordPlayer);
cubbies.B2.userData.recordPlayer = recordPlayer;

// === Turntable record-loading + playback. One record may be on the platter
// at a time. A temporary "flying" vinyl mesh tweens between the source
// album's slot and the platter — arcing slightly forward so it passes in
// front of the maple wall instead of getting clipped behind it. Audio
// starts on arrival (load) or stops immediately (unload, then animates
// the return flight).
let currentRecord = null;     // { state } when a record is loaded; null otherwise
let flightAnim = null;        // active fly tween; clicks are locked out while non-null
const FLIGHT_MS = 600;
const TURNTABLE_VINYL_SCALE = 0.42;   // album-vinyl geom ÷ turntable-vinyl geom radius

const easeInOutCubic = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;

function buildFlyingRecord(labelColor) {
  // Stand-alone copy of the album's vinyl + label, parented to the scene so
  // it can travel between the cubby and the turntable in world coordinates.
  // depthTest off + high renderOrder so it always reads in front of the
  // maple wall and any cubby panels during the arc.
  const matOpts = { depthTest: false, depthWrite: false, transparent: true, side: THREE.DoubleSide };
  const g = new THREE.Group();
  const vinyl = new THREE.Mesh(
    new THREE.CircleGeometry(ALBUM_SIZE * 0.46, 48),
    new THREE.MeshBasicMaterial({ color: 0xffffff, map: vinylTex, ...matOpts }),
  );
  vinyl.renderOrder = 20;
  g.add(vinyl);
  const label = new THREE.Mesh(
    new THREE.CircleGeometry(ALBUM_SIZE * 0.13, 24),
    new THREE.MeshBasicMaterial({ color: labelColor, ...matOpts }),
  );
  label.position.z = 0.001;
  label.renderOrder = 21;
  g.add(label);
  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(ALBUM_SIZE * 0.013, 16),
    new THREE.MeshBasicMaterial({ color: 0x000000, ...matOpts }),
  );
  hole.position.z = 0.002;
  hole.renderOrder = 22;
  g.add(hole);
  return g;
}

function startFlight(fromVec, toVec, fromRotX, toRotX, fromScale, toScale, labelColor, onArrive) {
  const mesh = buildFlyingRecord(labelColor);
  mesh.position.copy(fromVec);
  mesh.rotation.x = fromRotX;
  mesh.scale.setScalar(fromScale);
  scene.add(mesh);
  flightAnim = { mesh, fromVec: fromVec.clone(), toVec: toVec.clone(),
                 fromRotX, toRotX, fromScale, toScale, startMs: performance.now(), onArrive };
}

function updateFlight() {
  if (!flightAnim) return;
  const t = Math.min(1, (performance.now() - flightAnim.startMs) / FLIGHT_MS);
  const e = easeInOutCubic(t);
  flightAnim.mesh.position.lerpVectors(flightAnim.fromVec, flightAnim.toVec, e);
  flightAnim.mesh.position.z += Math.sin(e * Math.PI) * 0.35;   // forward arc to clear the maple wall
  flightAnim.mesh.rotation.x = THREE.MathUtils.lerp(flightAnim.fromRotX, flightAnim.toRotX, e);
  flightAnim.mesh.rotation.z = e * Math.PI * 0.6;               // gentle spin during flight
  const s = THREE.MathUtils.lerp(flightAnim.fromScale, flightAnim.toScale, e);
  flightAnim.mesh.scale.setScalar(s);
  if (t >= 1) {
    flightAnim.onArrive?.();
    scene.remove(flightAnim.mesh);
    flightAnim = null;
  }
}

function loadRecord(state) {
  if (flightAnim || currentRecord) return;
  currentRecord = { state };
  recordPlayer.userData.recordLabel.material.color.set(state.labelColor);
  const fromVec  = state.vinyl.getWorldPosition(new THREE.Vector3());
  const toVec    = recordPlayer.userData.spinGroup.getWorldPosition(new THREE.Vector3());
  const fromScl  = state.vinyl.getWorldScale(new THREE.Vector3()).x;
  state.vinylGroup.visible = false;
  startFlight(fromVec, toVec, 0, -Math.PI / 2, fromScl, TURNTABLE_VINYL_SCALE, state.labelColor, () => {
    recordPlayer.userData.spinGroup.visible = true;
    if (!state.audioSrc) return;
    if (!state.audio) { state.audio = new Audio(state.audioSrc); state.audio.loop = true; }
    state.audio.currentTime = 0;
    state.audio.play().catch(err => console.warn('[turntable] play failed', state.audioSrc, err.message));
  });
}

function unloadRecord() {
  if (flightAnim || !currentRecord) return;
  const { state } = currentRecord;
  if (state.audio) { state.audio.pause(); state.audio.currentTime = 0; }
  const fromVec = recordPlayer.userData.spinGroup.getWorldPosition(new THREE.Vector3());
  const toVec   = state.vinyl.getWorldPosition(new THREE.Vector3());
  const toScl   = state.vinyl.getWorldScale(new THREE.Vector3()).x;
  recordPlayer.userData.spinGroup.visible = false;
  currentRecord = null;
  startFlight(fromVec, toVec, -Math.PI / 2, 0, TURNTABLE_VINYL_SCALE, toScl, state.labelColor, () => {
    state.vinylGroup.visible = true;
    recordPlayer.userData.recordLabel.material.color.set(recordPlayer.userData.defaultLabelColor);
  });
}

function updateTurntable() {
  if (currentRecord && !flightAnim) recordPlayer.userData.spinGroup.rotation.y -= 0.06;
}

// === Top-right cubby D6: shrunk Temmys-Castle3 icon GLB, sitting on the
// shelf like a trophy. Fit by bbox to ~85% of the cubby's tightest dimension,
// re-center horizontally and depth-wise, drop so bbox.min.y rests on the
// cubby floor with a hair of padding to avoid z-fighting.
// The GLB ships with surrounding terrain (dirt_block, grass_texture,
// ocean_texture_1/2/3). On a shelf we only want the castle structure, so
// hide the terrain meshes AND exclude them from the bbox so the fit-to-cubby
// scale is driven by the castle silhouette alone, not a 300m-wide ocean.
const D6_HIDE_NAMES = /^(dirt_block|grass_texture|ocean_texture_\d+|walkable_plane|cube017|cube018|gate[ _]?0?1)$/i;
new GLTFLoader().load('Temmys-Castle3-ICON.q.glb', (gltf) => {
  const castle = gltf.scene;
  const box = new THREE.Box3();
  const planes = cubbies.D6.userData.clippingPlanes;
  castle.traverse(o => {
    if (!o.isMesh) return;
    if (D6_HIDE_NAMES.test(o.name)) { o.visible = false; return; }
    box.expandByObject(o);
    // Apply cubby's world-space X/Y clipping planes so any overflow past the
    // cubby opening is masked instead of poking into adjacent cubbies.
    // DoubleSide so reversed-normal roof panels don't render as holes.
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      m.clippingPlanes = planes;
      m.side = THREE.DoubleSide;
    }
  });
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  // Generous in-plane margin (X/Y overflow is clipped to the cubby footprint
  // by the planes above), tighter depth margin so the castle doesn't poke
  // through the front maple wall.
  const fit = Math.min(
    (CUBBY_W * 1.25) / size.x,
    (CUBBY_H * 1.25) / size.y,
    (CUBBY_D * 0.9)  / size.z,
  ) * 2;
  castle.scale.setScalar(fit);
  const X_NUDGE = 0.22;     // visual centering — bbox center reads slightly left of cubby midline
  castle.position.set(
    -center.x * fit + X_NUDGE,
    -box.min.y * fit - CUBBY_H / 2 + 0.005,
    -center.z * fit - CUBBY_D * 0.5,
  );
  cubbies.D6.add(castle);
  cubbies.D6.userData.castle = castle;
});

// === D6 castle waterfall: pixelated stream that spills from the castle
// entrance in D6 and falls 4 cubby-heights to the floor below the shelf.
// Lives at scene-level (not parented to a cubby) so it crosses cubby
// boundaries; sits forward of the maple wall (z > 0) so cubby dividers
// don't slice it into segments.
const WF_W = 0.40;
const WF_TOP_Y = cubbies.D6.position.y - CUBBY_H / 2 + 0.02;   // just above the D6 floor
const WF_BOT_Y = -GRID_H / 2 + 0.08;                           // anchor right under the cubbies (bottom plank)
const WF_FALL  = WF_TOP_Y - WF_BOT_Y;
const WF_X     = cubbies.D6.position.x + 0.22;                 // line up with castle (X_NUDGE)
const WF_Z     = 0.06;                                         // in front of the maple wall

// 16×128 pixelated canvas — pale cyan base with a few bright vertical streak
// columns and dark speckles for depth. NearestFilter keeps it chunky.
const wfCv = document.createElement('canvas');
wfCv.width = 16; wfCv.height = 128;
const wfCtx = wfCv.getContext('2d');
wfCtx.fillStyle = 'rgba(150, 200, 235, 0.45)';
wfCtx.fillRect(0, 0, 16, 128);
wfCtx.fillStyle = 'rgba(225, 240, 255, 0.92)';
for (const [x, w] of [[2, 1], [5, 2], [9, 1], [12, 2]]) wfCtx.fillRect(x, 0, w, 128);
wfCtx.fillStyle = 'rgba(80, 130, 180, 0.55)';
for (let i = 0; i < 36; i++) wfCtx.fillRect(Math.floor(Math.random() * 16), Math.floor(Math.random() * 128), 1, 2);
const wfTex = new THREE.CanvasTexture(wfCv);
wfTex.wrapS = wfTex.wrapT = THREE.RepeatWrapping;
wfTex.magFilter = THREE.NearestFilter;
wfTex.minFilter = THREE.NearestFilter;
wfTex.repeat.set(1, WF_FALL / 0.8);   // each texture tile ~0.8m tall over the full fall

const waterfall = new THREE.Mesh(
  new THREE.PlaneGeometry(WF_W, WF_FALL),
  new THREE.MeshBasicMaterial({ map: wfTex, transparent: true, depthWrite: false }),
);
waterfall.position.set(WF_X, (WF_TOP_Y + WF_BOT_Y) / 2, WF_Z);
scene.add(waterfall);

function updateWaterfall() {
  wfTex.offset.y -= 0.0015;   // scroll DOWN → streaks read as falling (meditative pace)
  puddleTex.offset.x += 0.0008;  // gentle horizontal ripple drift
  sprayTex.offset.y  -= 0.004;   // sparse droplets reading as rising spray
}

// === Waterfall splash at impact point. Two stacked pixelated elements:
// a wide horizontal puddle that ripples sideways, and a smaller spray
// patch just above with sparse bright droplets scrolling upward.

// --- Puddle: 32×8 canvas. Darker pool rows at the bottom, ripple pixels
// above. Horizontal-scrolling texture sells the spreading water.
const puddleCv = document.createElement('canvas');
puddleCv.width = 32; puddleCv.height = 8;
const puddleCtx = puddleCv.getContext('2d');
puddleCtx.fillStyle = 'rgba(70, 120, 175, 0.78)';
puddleCtx.fillRect(0, 4, 32, 4);                       // pool body
puddleCtx.fillStyle = 'rgba(170, 210, 240, 0.85)';
for (const x of [1, 5, 10, 15, 20, 25, 29]) puddleCtx.fillRect(x, 3, 2, 1);  // bright ripple crests
puddleCtx.fillStyle = 'rgba(220, 240, 255, 0.65)';
for (const x of [3, 7, 12, 17, 21, 26, 30]) puddleCtx.fillRect(x, 2, 1, 1);  // foam dots
const puddleTex = new THREE.CanvasTexture(puddleCv);
puddleTex.wrapS = puddleTex.wrapT = THREE.RepeatWrapping;
puddleTex.magFilter = THREE.NearestFilter;
puddleTex.minFilter = THREE.NearestFilter;
const puddle = new THREE.Mesh(
  new THREE.PlaneGeometry(WF_W * 2.2, 0.20),
  new THREE.MeshBasicMaterial({ map: puddleTex, transparent: true, depthWrite: false }),
);
puddle.position.set(WF_X, WF_BOT_Y + 0.05, WF_Z + 0.01);
scene.add(puddle);

// --- Spray: 32×24, mostly transparent with sparse bright pixels at varied
// heights. Scrolling UP gives the impression of droplets jumping out of
// the impact, the empty rows breaking it up so it doesn't read as a stream.
const sprayCv = document.createElement('canvas');
sprayCv.width = 32; sprayCv.height = 24;
const sprayCtx = sprayCv.getContext('2d');
sprayCtx.clearRect(0, 0, 32, 24);
sprayCtx.fillStyle = 'rgba(225, 240, 255, 0.90)';
for (let i = 0; i < 35; i++) {
  sprayCtx.fillRect(Math.floor(Math.random() * 32), Math.floor(Math.random() * 24), 1, 1);
}
sprayCtx.fillStyle = 'rgba(150, 195, 230, 0.70)';
for (let i = 0; i < 23; i++) {
  sprayCtx.fillRect(Math.floor(Math.random() * 32), Math.floor(Math.random() * 24), 1, 1);
}
const sprayTex = new THREE.CanvasTexture(sprayCv);
sprayTex.wrapS = sprayTex.wrapT = THREE.RepeatWrapping;
sprayTex.magFilter = THREE.NearestFilter;
sprayTex.minFilter = THREE.NearestFilter;
const spray = new THREE.Mesh(
  new THREE.PlaneGeometry(WF_W * 1.75, 0.375),
  new THREE.MeshBasicMaterial({ map: sprayTex, transparent: true, depthWrite: false }),
);
spray.position.set(WF_X, WF_BOT_Y + 0.22, WF_Z + 0.015);
scene.add(spray);

// Cursor over ANY part of the turntable → dust cover lifts open. Cursor off
// → cover lerps back closed. Raycaster tests the whole player subtree, so
// any mesh (plinth, platter, tonearm, even the cover itself) counts as a
// hover, keeping the cover stable while the cursor is anywhere on the model.
function updateRecordPlayerCover() {
  const ch = recordPlayer.userData.coverHinge;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(recordPlayer, true);
  const target = hits.length
    ? recordPlayer.userData.coverOpenRot
    : recordPlayer.userData.coverClosedRot;
  ch.rotation.x += (target - ch.rotation.x) * 0.20;
}

window.addEventListener('click', (e) => {
  if (flightAnim) return;                                     // lock input during fly-to/from animations
  const clickNdc = new THREE.Vector2(
     (e.clientX / window.innerWidth)  * 2 - 1,
    -((e.clientY / window.innerHeight) * 2 - 1),
  );
  raycaster.setFromCamera(clickNdc, camera);
  // Click anywhere on the turntable while a record is loaded → eject.
  if (currentRecord && raycaster.intersectObject(recordPlayer, true).length) {
    unloadRecord();
    return;
  }
  // Diamond clicks are handled by the drag interaction — ignore here so
  // an undrag click doesn't trigger the "close all open albums" path.
  if (diamondMesh && raycaster.intersectObject(diamondMesh, false).length) return;
  const anyHits = raycaster.intersectObjects(albumAllMeshes, false);
  if (!anyHits.length) {
    // Empty space — close every open album (vinyls retract along with covers).
    for (const s of albumStates) { s.isOpen = false; s.vinylOut = false; }
    return;
  }
  const hit = anyHits[0].object;
  const state = hit.userData.albumState;
  if (!state) return;
  if (hit.userData.kind === 'albumCover') {
    state.isOpen = !state.isOpen;
    if (!state.isOpen) state.vinylOut = false;     // closing cover pulls vinyl back in
  } else if (hit.userData.kind === 'albumVinyl' || hit.userData.kind === 'albumLabel') {
    if (!state.isOpen) return;
    // First click on the peeking vinyl slides it fully out; a second click
    // on the slid-out vinyl loads it onto the turntable and starts playback.
    if (state.vinylOut) loadRecord(state);
    else                state.vinylOut = true;
  }
  // Clicking the inside panel of an open album is a no-op for now.
});

function updateAlbumState() {
  // Hover only counts when the album is closed.
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(albumCoverMeshes, false);
  const hovered = hits.length ? hits[0].object : null;
  const hitPt   = hits.length ? hits[0].point  : null;
  // Separate raycast against the slid-out vinyl meshes for hover-spin preview.
  // Raycaster auto-skips hidden meshes, so a record loaded on the turntable
  // (source vinylGroup invisible) is naturally excluded.
  const vinylHits = raycaster.intersectObjects(albumVinylMeshes, false);
  const vinylHoveredState = vinylHits.length ? vinylHits[0].object.userData.albumState : null;

  for (const s of albumStates) {
    // --- Hover (closed only) — scale + nearest-corner tip on the cover mesh.
    let tScale = 1.0, tRotX = 0, tRotY = 0;
    if (!s.isOpen && s.front === hovered) {
      tScale = HOVER_SCALE;
      _hoverLocal.copy(hitPt);
      s.front.worldToLocal(_hoverLocal);
      const dx = _hoverLocal.x / (ALBUM_SIZE / 2);
      const dy = _hoverLocal.y / (ALBUM_SIZE / 2);
      tRotX =  HOVER_TIP_RAD * dy;
      tRotY = -HOVER_TIP_RAD * dx;
    }
    s.front.scale.x += (tScale - s.front.scale.x) * HOVER_LERP;
    s.front.scale.y += (tScale - s.front.scale.y) * HOVER_LERP;
    s.front.scale.z += (tScale - s.front.scale.z) * HOVER_LERP;
    s.front.rotation.x += (tRotX - s.front.rotation.x) * HOVER_LERP;
    s.front.rotation.y += (tRotY - s.front.rotation.y) * HOVER_LERP;

    // --- Open / close — pop forward, scale up, swing cover open like a book.
    const target = s.isOpen ? 1 : 0;
    s.openness += (target - s.openness) * OPEN_LERP;
    const o = s.openness;
    const ps = 1 + (OPEN_SCALE - 1) * o;
    s.albumRoot.scale.set(ps, ps, ps);
    s.albumRoot.position.z = -CUBBY_D * 0.55 + OPEN_Z_POP * o;
    // Lean rolls flat as the cover opens: full -12° back-tilt at closed,
    // 0° at fully open. Position.y follows so the bottom stays anchored
    // while leaned but the cover re-centers when flat.
    const lean = 1 - o;
    s.albumRoot.rotation.x = -LEAN_ANGLE * lean;
    s.albumRoot.position.y =  LEAN_Y     * lean;
    s.coverPivot.rotation.y = OPEN_COVER_ROT * o;

    // --- Vinyl pop-out (only meaningful when cover is open). When cover is
    // closed, vinyl x=0 keeps it hidden behind the cover. When open + tucked
    // in, vinyl sits at VINYL_PEEK_X with its right edge poking past the
    // inside panel. Click on the peek and it slides out to VINYL_OUT_X.
    const targetV = s.vinylOut ? 1 : 0;
    s.vinylness += (targetV - s.vinylness) * OPEN_LERP;
    const v = s.vinylness;
    s.vinylGroup.position.x = (VINYL_PEEK_X + (VINYL_OUT_X - VINYL_PEEK_X) * v) * o;

    // Hover-spin preview: when cursor is over the slid-out vinyl, spin it
    // around its own normal (Z axis in album-local space) at the same rate
    // as the turntable. Stops the instant the cursor leaves — last rotation
    // value persists so it doesn't snap back to zero.
    if (s.isOpen && s.vinylOut && s === vinylHoveredState) {
      s.vinylGroup.rotation.z -= 0.06;
    }
  }
}

// === Cursor tracking → per-cubby perspective tilt.
// Mouse is unprojected onto the z=0 plane (where the cubby openings live);
// each cubby's uBackOffset is set proportional to (mouseWorld - cubbyPos) so
// the recessed box appears to look at the cursor. Distant cubbies need
// larger angular tilt, so their offsets are larger (clamped to keep the back
// from punching through the side panels). Lerped each frame for smooth glide.
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2(0, 0);
const mouseWorld = new THREE.Vector3(0, 0, 0);
let mouseSeen = false;
window.addEventListener('mousemove', (e) => {
  ndc.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  ndc.y = -((e.clientY / window.innerHeight) * 2 - 1);
  mouseSeen = true;
  if (diamondDrag) {
    const dx = e.clientX - diamondDrag.lastX;
    diamondDrag.lastX = e.clientX;
    const deltaRot = dx * 0.012;                                 // ~7° per 10px drag
    diamondGroup.rotateOnWorldAxis(_diamondYAxis, deltaRot);
    // Track a smoothed velocity from recent drag input — heavy weight on the
    // latest delta so a slow-down before release reduces the carry-over spin.
    diamondSpinVel = diamondSpinVel * 0.5 + deltaRot * 0.5;
  }
});
const _diamondYAxis = new THREE.Vector3(0, 1, 0);

// Drag-to-spin on the D1 diamond. Mousedown on the mesh starts the drag,
// horizontal cursor movement rotates the diamondGroup around world Y
// (so the existing 90° tilt is preserved), mouseup anywhere releases.
window.addEventListener('mousedown', (e) => {
  if (!diamondMesh) return;
  const downNdc = new THREE.Vector2(
     (e.clientX / window.innerWidth)  * 2 - 1,
    -((e.clientY / window.innerHeight) * 2 - 1),
  );
  raycaster.setFromCamera(downNdc, camera);
  if (raycaster.intersectObject(diamondMesh, false).length) {
    diamondDrag = { lastX: e.clientX };
  }
});
window.addEventListener('mouseup', () => { diamondDrag = null; });

const TILT_SCALE = 0.12;                     // how strongly each cubby tilts per meter of cursor offset
const TILT_MAX_X = CUBBY_W * 0.42;           // clamp so back stays inside the side panels
const TILT_MAX_Y = CUBBY_H * 0.42;
const _target = new THREE.Vector2();

function updateTilt() {
  if (mouseSeen) {
    raycaster.setFromCamera(ndc, camera);
    const ray = raycaster.ray;
    if (Math.abs(ray.direction.z) > 1e-6) {
      const t = -ray.origin.z / ray.direction.z;
      mouseWorld.copy(ray.origin).addScaledVector(ray.direction, t);
    }
  }
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      // Non-anchor merge cells share their Group with the anchor — tilt once.
      if (isMergeNonAnchor(row, col)) continue;
      const cg = cubbies[row][col];
      // D6 holds the castle model; tilting the back into it causes clipping.
      if (cg === cubbies.D6) continue;
      const dx = (mouseWorld.x - cg.position.x) * TILT_SCALE;
      const dy = (mouseWorld.y - cg.position.y) * TILT_SCALE;
      _target.set(
        Math.max(-TILT_MAX_X, Math.min(TILT_MAX_X, dx)),
        Math.max(-TILT_MAX_Y, Math.min(TILT_MAX_Y, dy)),
      );
      cg.userData.cubbyMesh.material.uniforms.uBackOffset.value.lerp(_target, 0.55);
    }
  }
}

// === Dust motes — slow-drifting warm specks suspended in front of the
// bookshelf, catching the amber lighting. Sells the hushed late-night
// trophy-room atmosphere. High renderOrder so they pass over every other
// layer (cubby panels, albums, manifold) instead of being occluded.
const DUST_COUNT = 30;
const dustGeom = new THREE.PlaneGeometry(0.026, 0.026);
const dustMat = new THREE.MeshBasicMaterial({
  color: 0xfff0c8, transparent: true, opacity: 0.32, depthWrite: false,
});
const dustMotes = [];
for (let i = 0; i < DUST_COUNT; i++) {
  const m = new THREE.Mesh(dustGeom, dustMat);
  m.position.set(
    (Math.random() - 0.5) * 14,
    (Math.random() - 0.5) * 9,
    (Math.random() - 0.5) * 3 + 4,                       // in front of the bookshelf
  );
  m.renderOrder = 20;
  m.userData = {
    vy:      -0.0033 - Math.random() * 0.0057,           // slow downward drift
    baseX:    m.position.x,                              // sway pivots around the spawn x
    swayAmp:  0.35 + Math.random() * 0.55,               // ~0.35–0.9 m peak-to-pivot horizontal swing
    rotAmp:   0.30 + Math.random() * 0.40,               // gentle tilt — leaf catching air
    phase:    Math.random() * Math.PI * 2,
    freq:     0.55 + Math.random() * 0.70,               // ~0.55–1.25 rad/s
  };
  scene.add(m);
  dustMotes.push(m);
}
function updateDust() {
  const t = performance.now() / 1000;
  for (const m of dustMotes) {
    const ud = m.userData;
    m.position.y += ud.vy;
    const swing = Math.sin(t * ud.freq + ud.phase);
    m.position.x   = ud.baseX + swing * ud.swayAmp;                       // swing around base x
    m.rotation.z   = Math.cos(t * ud.freq + ud.phase) * ud.rotAmp;        // tilt leads the swing by 90°
    if (m.position.y < -GRID_H / 2 - 1) {
      m.position.y = GRID_H / 2 + 1;
      ud.baseX     = (Math.random() - 0.5) * 14;
    }
  }
}

// === Stop-motion pigeon. Sits on a cubby's bottom edge, then arcs to
// another cubby and perches there. Edit BIRD_PERCHES to add/remove
// visitable cubbies — keys reference window.cubbies (A1..D6). Avoid
// A5 (hallway window), B2 (record player), D6 (castle) unless you want
// the bird overlapping those props.
//
// Wing flap is 4 discrete poses held for 1/BIRD_FPS sec each (no
// tweening) — the chop is what sells the paper-cutout stop-motion feel.
// Body scale.x flips so the bird always faces its travel direction.
const BIRD_PERCHES   = ['A1', 'A4', 'B1', 'C1', 'C5', 'D2', 'D3', 'D4', 'D5'];
const PERCH_MS_MIN   = 2800;
const PERCH_MS_MAX   = 5500;
const BIRD_FLIGHT_MS = 1900;
const BIRD_FPS       = 8;
const BIRD_ASSET_DIR = 'bird/';
// Parrot-sized. Body small; head comically huge attached on top. Total
// visible bird height ≈ BODY_H + HEAD_H − overlap.
const BIRD_BODY_H    = 0.22;
const BIRD_HEAD_H    = 0.55;
const BIRD_WING_H    = 0.16;
const BIRD_HEAD_Y    = 0.30;            // head center above body center; light overlap at neck

const bird = new THREE.Group();
scene.add(bird);

// Wing pivots — wing sprite geometry is shifted so its inner edge sits at
// pivot origin, so rotation.z behaves like a shoulder hinge.
const wingLPivot = new THREE.Group();
const wingRPivot = new THREE.Group();
wingLPivot.position.set(-0.12, 0.02, 0.005);
wingRPivot.position.set( 0.12, 0.02, 0.005);
bird.add(wingLPivot);
bird.add(wingRPivot);

const birdSprites = {};

function makeBirdSpriteMesh(tex, h, anchor) {
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  const w = h * (tex.image.width / tex.image.height);
  const geom = new THREE.PlaneGeometry(w, h);
  if (anchor === 'left')  geom.translate( w / 2, 0, 0);
  if (anchor === 'right') geom.translate(-w / 2, 0, 0);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, alphaTest: 0.5,
  });
  return new THREE.Mesh(geom, mat);
}

// Procedural body — mustard ellipse with thick dark outline + small tail.
function makeBirdBodyTexture() {
  const W = 256, H = 192;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e0b233';
  ctx.strokeStyle = '#2e2412';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(W / 2 - 10, H / 2, W / 2 - 20, H / 2 - 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // tail nub poking back-right
  ctx.beginPath();
  ctx.moveTo(W - 36, H / 2 - 4);
  ctx.quadraticCurveTo(W - 8, H / 2 + 8, W - 20, H / 2 + 28);
  ctx.quadraticCurveTo(W - 40, H / 2 + 16, W - 36, H / 2 - 4);
  ctx.fill();
  ctx.stroke();
  return new THREE.CanvasTexture(c);
}

// Procedural wing — yellow paddle, pivot at the RIGHT edge of the canvas
// (the shoulder). `mirror` flips it horizontally for the right-side wing.
function makeBirdWingTexture(mirror) {
  const W = 192, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e0b233';
  ctx.strokeStyle = '#2e2412';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(W - 12, H / 2);
  ctx.quadraticCurveTo(W * 0.55, 10, 18, H * 0.5);
  ctx.quadraticCurveTo(W * 0.55, H - 14, W - 12, H / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (!mirror) return new THREE.CanvasTexture(c);
  const c2 = document.createElement('canvas');
  c2.width = W; c2.height = H;
  const ctx2 = c2.getContext('2d');
  ctx2.translate(W, 0);
  ctx2.scale(-1, 1);
  ctx2.drawImage(c, 0, 0);
  return new THREE.CanvasTexture(c2);
}

// Body + wings: built synchronously from canvas textures.
const bodyMesh = makeBirdSpriteMesh(makeBirdBodyTexture(), BIRD_BODY_H, 'center');
bodyMesh.renderOrder = 25;
bird.add(bodyMesh);
birdSprites.body = bodyMesh;

const wingLMesh = makeBirdSpriteMesh(makeBirdWingTexture(false), BIRD_WING_H, 'right');
wingLMesh.renderOrder = 26;
wingLPivot.add(wingLMesh);
birdSprites.wingL = wingLMesh;

const wingRMesh = makeBirdSpriteMesh(makeBirdWingTexture(true), BIRD_WING_H, 'left');
wingRMesh.renderOrder = 26;
wingRPivot.add(wingRMesh);
birdSprites.wingR = wingRMesh;

// Head: loaded from head.png (kept as the user-authored reference image).
new THREE.TextureLoader().load(
  BIRD_ASSET_DIR + 'head.png',
  tex => {
    const headMesh = makeBirdSpriteMesh(tex, BIRD_HEAD_H, 'center');
    headMesh.position.set(0.02, BIRD_HEAD_Y, 0.01);
    headMesh.renderOrder = 27;
    bird.add(headMesh);
    birdSprites.head = headMesh;
  },
  undefined,
  () => console.warn('[bird] missing', BIRD_ASSET_DIR + 'head.png'),
);

// Wing flap cycle (radians about z, mirrored per wing). Index 0 = tucked
// for idle perch. Flying cycles through all 4.
const WING_POSES = [-0.15, 0.55, 1.0, 0.55];
const BIRD_FRAME_MS = 1000 / BIRD_FPS;
let birdFrameIdx = 0;
let lastBirdTickMs = 0;

let birdState     = 'perch';
let birdPerchKey  = BIRD_PERCHES[0];
let perchUntilMs  = performance.now() + 1500;
let birdFlight    = null;

function birdPerchPosition(cubbyKey) {
  const cubby = cubbies[cubbyKey];
  const h     = cubby.userData.openingH;
  const wp = cubby.getWorldPosition(new THREE.Vector3());
  wp.y -= h / 2 - BIRD_BODY_H / 2 - 0.04;     // body feet ~on bottom plank
  wp.z  = 0.02;                                // just in front of maple wall
  return wp;
}

function birdPickNextPerch() {
  if (BIRD_PERCHES.length < 2) return birdPerchKey;
  let next;
  do { next = BIRD_PERCHES[(Math.random() * BIRD_PERCHES.length) | 0]; }
  while (next === birdPerchKey);
  return next;
}

try {
  bird.position.copy(birdPerchPosition(birdPerchKey));
} catch (err) {
  console.error('[bird] init failed', err);
}

function updateBird() {
  if (!cubbies[birdPerchKey]) return;
  const now = performance.now();

  // Stop-motion frame tick — pose held until interval elapses, no lerp.
  if (now - lastBirdTickMs >= BIRD_FRAME_MS) {
    lastBirdTickMs = now;
    birdFrameIdx = (birdFrameIdx + 1) % WING_POSES.length;
    const a = WING_POSES[birdState === 'fly' ? birdFrameIdx : 0];
    wingLPivot.rotation.z =  a;
    wingRPivot.rotation.z = -a;
  }

  if (birdState === 'perch') {
    if (now < perchUntilMs) return;
    const next = birdPickNextPerch();
    const toVec = birdPerchPosition(next);
    birdFlight = {
      fromVec: bird.position.clone(),
      toVec,
      startMs: now,
    };
    bird.scale.x = toVec.x < bird.position.x ? -1 : 1;
    birdPerchKey = next;
    birdState    = 'fly';
    return;
  }

  // 'fly' — arc forward & up, ease-in-out, stop-motion ticks the wings.
  const t = Math.min(1, (now - birdFlight.startMs) / BIRD_FLIGHT_MS);
  const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  bird.position.lerpVectors(birdFlight.fromVec, birdFlight.toVec, e);
  bird.position.z += Math.sin(e * Math.PI) * 0.6;
  bird.position.y += Math.sin(e * Math.PI) * 0.25;
  if (t >= 1) {
    bird.position.copy(birdFlight.toVec);
    perchUntilMs = now + PERCH_MS_MIN + Math.random() * (PERCH_MS_MAX - PERCH_MS_MIN);
    birdState    = 'perch';
    birdFlight   = null;
  }
}

// === Pin art toy hanging in the C4+C5+D4+D5 merged cubby. A backing plate
// holds a 32×32 grid of gunmetal pins; each pin's protrusion is a 0..1
// depth that lerps toward a per-frame target. The target is the sum of a
// faint idle ripple plus a soft bump that tracks the cursor when it hovers
// over the board (see updatePinArt). A future music driver can feed the
// same target via musicDepth() to visualize audio on the pins.
const PIN_COLS           = 32;
const PIN_ROWS           = 32;
const PIN_AREA_W         = 2.4;
const PIN_AREA_H         = 2.4;
const PIN_DIAMETER       = Math.min(PIN_AREA_W / PIN_COLS, PIN_AREA_H / PIN_ROWS);
const PIN_RADIUS         = PIN_DIAMETER * 0.42;     // slight gap between pins
const PIN_LENGTH         = 0.80;
const PIN_MAX_PROTRUSION = 0.66;                    // how far a fully-pricked pin shoots out front (back end still hides behind the plate)
const PLATE_THICKNESS    = 0.05;
const PIN_ART_CENTER_Y   = -0.10;                   // vertical offset within cubby (below center → leaves room for chains)
const PIN_ART_Z          = -0.32;                   // plate front Z within the cubby (in local space of cubbies.D4)

const pinArt = new THREE.Group();
pinArt.position.set(0, PIN_ART_CENTER_Y, PIN_ART_Z);
pinArt.scale.setScalar(1.20);
cubbies.D4.add(pinArt);

// Reuse the cubby's clipping planes so the pin art can't spill out of the
// merged opening if the parallax shader tilts the back. (Necessary because
// the StandardMaterials we use here are otherwise unclipped.)
const pinClipPlanes = cubbies.D4.userData.clippingPlanes;

// --- Backing plate. Slightly larger than the pin area; opaque dark so
// the back ends of the pins (which slide through it) stay hidden.
const plate = new THREE.Mesh(
  new THREE.BoxGeometry(PIN_AREA_W + 0.06, PIN_AREA_H + 0.06, PLATE_THICKNESS),
  new THREE.MeshStandardMaterial({
    color: 0x141414, roughness: 0.85, metalness: 0.1,
    clippingPlanes: pinClipPlanes,
  }),
);
plate.position.set(0, 0, -PLATE_THICKNESS / 2);
pinArt.add(plate);

// --- Pin grid. One InstancedMesh, ~1024 instances, gunmetal. Cylinder
// geometry is rotated so its axis aligns with +Z (pins point toward the
// camera). The pin's local Z is the only thing the animation moves.
const pinGeom = new THREE.CylinderGeometry(PIN_RADIUS, PIN_RADIUS * 0.85, PIN_LENGTH, 12);
pinGeom.rotateX(Math.PI / 2);
const pinMat = new THREE.MeshStandardMaterial({
  color: 0x4a4e54, roughness: 0.45, metalness: 0.85,
  clippingPlanes: pinClipPlanes,
});
const pins = new THREE.InstancedMesh(pinGeom, pinMat, PIN_COLS * PIN_ROWS);
pinArt.add(pins);

// Precompute each pin's base XY; only Z changes per frame.
const pinXY = [];
for (let row = 0; row < PIN_ROWS; row++) {
  for (let col = 0; col < PIN_COLS; col++) {
    const x = (col + 0.5) / PIN_COLS * PIN_AREA_W - PIN_AREA_W / 2;
    const y = (row + 0.5) / PIN_ROWS * PIN_AREA_H - PIN_AREA_H / 2;
    pinXY.push({ x, y, u: (col + 0.5) / PIN_COLS, v: (row + 0.5) / PIN_ROWS });
  }
}

// --- Hover-reactive depth field. The board idles with a faint breathing
// ripple, and the few pins directly under the cursor prick up sharply when
// it hovers over the plate — a tight bump plus a fast attack / slow release
// so each pin snaps up crisply and eases back down after the cursor passes.
const HOVER_RADIUS = 0.13;     // local-space falloff radius — a tight burst of pins under the cursor
const HOVER_PEAK   = 1.0;      // depth added at the bump center (0..1) — full prick
const IDLE_BASE    = 0.12;     // resting protrusion so pins aren't flush with the plate
const IDLE_AMP     = 0.05;     // amplitude of the idle breathing ripple
const PIN_ATTACK   = 0.85;     // near-instant rise — pins fire up the moment the cursor reaches them
const PIN_RELEASE  = 0.09;     // slow per-frame fall — pricked pins linger, leaving a tall trailing wake

const pinDepth = new Float32Array(PIN_COLS * PIN_ROWS);   // current protrusion per pin

// Cursor in pinArt-local space, plus a 0..1 envelope that fades the bump in
// while hovering and out when the cursor leaves, so it melts in place rather
// than snapping off.
let hoverX = 0, hoverY = 0, hoverAmp = 0;
const _pinHit = new THREE.Vector3();

// Music hook (future): return extra 0..1 depth for the pin at (u, v). Wire a
// Web Audio AnalyserNode here — feed playback through analyser.getByteFrequencyData()
// and map bins onto u (or radius from center). Returns 0 until implemented.
function musicDepth(u, v) { return 0; }

const _pinDummy = new THREE.Object3D();
function updatePinArt() {
  const t = performance.now() / 1000;

  // Cursor → board. Raycast only the flat backing plate (never the pins) so
  // we get a stable (x, y) on the board plane no matter how far the pins are
  // pushed out. A hit steers the bump toward the cursor and drives the
  // envelope up; a miss lets it fade so the bump dissolves where it sat.
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(plate, false)[0];
  if (hit) {
    _pinHit.copy(hit.point);
    pinArt.worldToLocal(_pinHit);
    hoverX = _pinHit.x;
    hoverY = _pinHit.y;
    hoverAmp += (1 - hoverAmp) * 0.45;
  } else {
    hoverAmp += (0 - hoverAmp) * 0.15;
  }

  // baseZ = pin position when depth=0 (tip flush with plate front at z=0).
  const baseZ = -PIN_LENGTH / 2 + 0.001;
  const r2 = HOVER_RADIUS * HOVER_RADIUS;
  for (let i = 0; i < pinXY.length; i++) {
    const p = pinXY[i];
    // Idle breathing ripple radiating from center — low amplitude, always on.
    const rad  = Math.sqrt(p.x * p.x + p.y * p.y);
    const idle = IDLE_BASE + IDLE_AMP * Math.sin(rad * 4.5 - t * 2.0);
    // Cursor bump — tight gaussian around the hover point so only the pin(s)
    // beneath the cursor lift, scaled by the hover envelope.
    const hx = p.x - hoverX, hy = p.y - hoverY;
    const bump = hoverAmp * HOVER_PEAK * Math.exp(-(hx * hx + hy * hy) / r2);
    const target = Math.max(0, Math.min(1, idle + bump + musicDepth(p.u, p.v)));
    // Asymmetric approach: snap up fast (the prick), settle down slow.
    const delta = target - pinDepth[i];
    pinDepth[i] += delta * (delta > 0 ? PIN_ATTACK : PIN_RELEASE);
    _pinDummy.position.set(p.x, p.y, baseZ + pinDepth[i] * PIN_MAX_PROTRUSION);
    _pinDummy.updateMatrix();
    pins.setMatrixAt(i, _pinDummy.matrix);
  }
  pins.instanceMatrix.needsUpdate = true;
}
updatePinArt();   // initial pose so it's not all stuck at z=0 before first tick

// --- Two thin chains from the upper corners of the plate up to the
// cubby's ceiling. Gunmetal cylinders — simple but reads as "hanging".
{
  const cubbyOpeningH = cubbies.D4.userData.openingH;
  // Ceiling Y in pinArt-local space: cubby ceiling minus pinArt's Y offset,
  // minus a small inset so the chain doesn't penetrate the cubby ceiling.
  const ceilingY     = cubbyOpeningH / 2 - PIN_ART_CENTER_Y - 0.04;
  const plateTopY    = PIN_AREA_H / 2 + 0.03;
  const chainLength  = ceilingY - plateTopY;
  const chainGeom    = new THREE.CylinderGeometry(0.014, 0.014, chainLength, 6);
  const chainMat     = new THREE.MeshStandardMaterial({
    color: 0x2a2c30, roughness: 0.6, metalness: 0.7,
    clippingPlanes: pinClipPlanes,
  });
  const chainOffsetX = PIN_AREA_W / 2 - 0.08;
  for (const sx of [-1, 1]) {
    const chain = new THREE.Mesh(chainGeom, chainMat);
    chain.position.set(sx * chainOffsetX, plateTopY + chainLength / 2, 0);
    pinArt.add(chain);
  }
}

// Throttle the full render loop to ~30fps so the tilt reads as chunky/pixel-y
// while staying responsive to fast cursor moves. The per-frame lerp factor
// below was bumped to ~0.55 so the cubbies catch up to the cursor in 2–3
// ticks rather than gliding sluggishly behind it.
const FRAME_MS = 1000 / 30;
let lastFrame = 0;
function render(now) {
  if (now - lastFrame >= FRAME_MS) {
    lastFrame = now;
    updateTilt();
    updateSculpture();
    updateAlbumState();
    updateRecordPlayerCover();
    updateTurntable();
    updateFlight();
    updateDust();
    updateWaterfall();
    updateBird();
    updatePinArt();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
