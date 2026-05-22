import * as THREE from 'three';

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
scene.add(new THREE.AmbientLight(0xfff0d8, 0.45));
const key = new THREE.DirectionalLight(0xfff4dc, 0.95);
key.position.set(-6, 8, 10);
scene.add(key);
const fill = new THREE.DirectionalLight(0xffc488, 0.22);
fill.position.set(0, -6, 6);
scene.add(fill);

// --- Procedural maple bookshelf wall: wood frame only (top/bottom planks +
// side dividers), cubby interiors alpha=0 so the recessed-box geometry
// behind shows through. Drawn at full grid resolution into one canvas (not
// a repeated tile) so the divider between A5 and B5 can be selectively
// omitted — those two cells merge into one tall doorway opening onto the
// outside scene.
const TPX = 256, PLANK = 22, SIDE = 8;
const top = PLANK, bottom = TPX - PLANK;
const left = SIDE, right = TPX - SIDE;

// Merged-cubby spec — A5+B5 share one tall opening at col 4, rows 2-3
// (row 0 = top in the row-indexed grid).
const MERGED_TOP_ROW = 2, MERGED_BOT_ROW = 3, MERGED_COL = 4;
const isMergedTop = (r, c) => r === MERGED_TOP_ROW && c === MERGED_COL;
const isMergedBot = (r, c) => r === MERGED_BOT_ROW && c === MERGED_COL;

const WALL_PX_W = COLS * TPX;
const WALL_PX_H = ROWS * TPX;
const tc = document.createElement('canvas');
tc.width = WALL_PX_W; tc.height = WALL_PX_H;
const tx = tc.getContext('2d');
tx.imageSmoothingEnabled = false;

// Cut openings per tile via an evenodd clip, then fill the remaining wood
// frame. The merged top half's opening extends down through the bottom
// half; the bottom half is skipped so the divider plank between them never
// gets cut as a separate hole.
tx.save();
tx.beginPath();
tx.rect(0, 0, WALL_PX_W, WALL_PX_H);
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (isMergedBot(r, c)) continue;
    const x0 = c * TPX + SIDE;
    const y0 = r * TPX + PLANK;
    const x1 = (c + 1) * TPX - SIDE;
    const y1 = isMergedTop(r, c)
      ? (r + 2) * TPX - PLANK
      : (r + 1) * TPX - PLANK;
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
// Per-tile plank highlights (light top edge, dark bottom edge). Skip the
// edges of the removed divider between A5 and B5.
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const ox = c * TPX, oy = r * TPX;
    if (!isMergedBot(r, c)) {
      tx.fillStyle = 'rgba(255,232,188,0.35)';
      tx.fillRect(ox, oy, TPX, 2);
    }
    if (!isMergedTop(r, c)) {
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

// Black border quads around the 6×4 bookshelf so the outside scene only
// shows through the hallway opening — not in the negative space around the
// shelf when the screen is wider than the grid. Sit just behind the wall
// plane (z = -0.01) and write depth, occluding sky/ground there.
{
  const M = 60;
  const mat = new THREE.MeshBasicMaterial({ color: 0x1a1410 });
  const add = (w, h, x, y) => {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    q.position.set(x, y, -0.01);
    scene.add(q);
  };
  add(M * 2, M, 0,  (GRID_H + M) / 2);
  add(M * 2, M, 0, -(GRID_H + M) / 2);
  add(M, GRID_H, -(GRID_W + M) / 2, 0);
  add(M, GRID_H,  (GRID_W + M) / 2, 0);
}

// --- Recessed cubby box: 5 inward-facing panels (back + top + bottom + 2
// sides, no front). Vertex colors fake painted shading — dark back, lit
// bottom plank where things would sit. Brighter than the castle's dungeon
// shading because this scene has no fog/atmosphere to wade through.
const CUBBY_W = TILE_W * (right - left) / TPX;       // ~1.875m opening
const CUBBY_H = TILE_H * (bottom - top) / TPX;       // ~1.656m opening
const CUBBY_D = 0.7;                                 // depth into the wall
const FRONT_INSET = 0.006;                           // recess opening behind wall plane to dodge z-fighting
// Merged A5+B5 opening: two tiles tall, divider plank gone. Adds two
// plank-widths of vertical space on top of 2 × CUBBY_H.
const MERGED_H = 2 * CUBBY_H + 2 * TILE_H * PLANK / TPX;     // ~3.656m opening

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
// Merged cubby reads as a small indoor hallway: cream-painted ceiling,
// warm beige plaster walls, dark hardwood floor — so the (now open) back
// clearly looks like a DOORWAY onto the outside, not a deeper cubby hole.
const mergedCubbyGeom = makeCubbyGeom(CUBBY_W, MERGED_H, {
  omitBack: true,
  colors: {
    top:    [0.78, 0.74, 0.66],
    bottom: [0.32, 0.20, 0.10],
    sides:  [0.68, 0.60, 0.48],
  },
});
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
    if (isMergedBot(row, col)) {
      // Bottom half of the merged A5+B5 cubby — alias the same Group as
      // the top half so cubbies.A5 and .B5 both resolve to it.
      cubbies[row].push(cubbies[MERGED_TOP_ROW][col]);
      continue;
    }
    const cellX =  (col + 0.5) * TILE_W - GRID_W / 2;
    const cellY = -((row + 0.5) * TILE_H - GRID_H / 2);
    const merged = isMergedTop(row, col);
    const cubbyGroup = new THREE.Group();
    // Merged group sits at the midpoint between the two cells it spans, so
    // its local origin is the front-center of the combined opening.
    cubbyGroup.position.set(cellX, merged ? cellY - TILE_H / 2 : cellY, 0);
    // World-space clipping planes confine every material in this cubby's
    // subtree (panels + child meshes like the hallway's sky/ground) to its
    // own footprint — no leakage into neighbors regardless of how the
    // parallax shader tilts the back.
    const halfW = CUBBY_W / 2 + 0.002;
    const halfH = (merged ? MERGED_H : CUBBY_H) / 2 + 0.002;
    const wx = cubbyGroup.position.x;
    const wy = cubbyGroup.position.y;
    const clippingPlanes = [
      new THREE.Plane(new THREE.Vector3( 1, 0, 0), -wx + halfW),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0),  wx + halfW),
      new THREE.Plane(new THREE.Vector3( 0, 1, 0), -wy + halfH),
      new THREE.Plane(new THREE.Vector3( 0,-1, 0),  wy + halfH),
    ];
    const cubbyMesh = new THREE.Mesh(
      merged ? mergedCubbyGeom : cubbyGeom,
      makeCubbyMat(clippingPlanes),
    );
    cubbyGroup.add(cubbyMesh);
    cubbyGroup.userData.cubbyMesh      = cubbyMesh;     // for per-frame uBackOffset updates
    cubbyGroup.userData.merged         = merged;
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

// --- Cel-shaded crystal material + inverted-hull outline, same recipe as
// the main hall. 4-band cyan-blue toon gradient + ice-white outline.
const diamondToonCv = document.createElement('canvas');
diamondToonCv.width = 4; diamondToonCv.height = 1;
const dtctx = diamondToonCv.getContext('2d');
dtctx.fillStyle = '#1e3a78'; dtctx.fillRect(0, 0, 1, 1);
dtctx.fillStyle = '#4c84d0'; dtctx.fillRect(1, 0, 1, 1);
dtctx.fillStyle = '#84c6ff'; dtctx.fillRect(2, 0, 1, 1);
dtctx.fillStyle = '#c4e4ff'; dtctx.fillRect(3, 0, 1, 1);
const diamondToonGrad = new THREE.CanvasTexture(diamondToonCv);
diamondToonGrad.minFilter = THREE.NearestFilter;
diamondToonGrad.magFilter = THREE.NearestFilter;
diamondToonGrad.needsUpdate = true;

// Opaque toon material (main hall uses 0.62 alpha but that washes into the
// dark cubby back without the surrounding orb/fog). Bumped emissive too.
const crystalMat = new THREE.MeshToonMaterial({
  color: 0x84c6ff, emissive: 0x3070ff, emissiveIntensity: 2.0,
  gradientMap: diamondToonGrad,
  side: THREE.DoubleSide,
});
const diamondOutlineMat = new THREE.MeshBasicMaterial({
  color: 0xb8d8ff, side: THREE.BackSide,
});

const diamondGroup = new THREE.Group();
const DIAMOND_BASE_Y = 0.05;        // anchor — bob oscillates around this
diamondGroup.position.set(0, DIAMOND_BASE_Y, SCULPT_Z);
diamondGroup.rotation.x = Math.PI / 2;   // 90° tilt
topLeftCubby.add(diamondGroup);
diamondGroup.add(new THREE.PointLight(0x6aa8ff, 1.8, 1.6, 1.7));

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
  const s = 0.85 / maxD;
  geom.scale(s, s, s);
  diamondGroup.add(new THREE.Mesh(geom, crystalMat));
  console.log('[newhome] WasaDiminds-02 parsed: verts=' + (verts.length / 3) + ' tris=' + (indices.length / 3));
}).catch(err => { console.error('[newhome] WasaDiminds-02.obj failed:', err); });

const _sculptT0 = performance.now();
function updateSculpture() {
  const t = (performance.now() - _sculptT0) / 1000;
  diamondGroup.position.y = DIAMOND_BASE_Y + Math.sin(t * Math.PI * 2 / 4.0) * 0.06;
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
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
})();

const albumCoverMeshes = [];         // front-cover meshes (toggle-on-click targets)
const albumAllMeshes   = [];         // every interactive album mesh (hit-test "outside?")
const albumStates      = [];
const _hoverLocal      = new THREE.Vector3();

function placeAlbumCover(cubbyKey, texPath) {
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
  albumRoot.position.set(0, 0, -CUBBY_D * 0.55);
  cubby.add(albumRoot);

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
    new THREE.MeshBasicMaterial({ color: LABEL_COLOR, ...matOpts }),
  );
  label.position.z = 0.001;
  label.renderOrder = 6;
  label.userData.kind = 'albumLabel';
  vinylGroup.add(label);

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
  albumAllMeshes.push(front, inside, vinyl, label);
  const state = {
    albumRoot, coverPivot, front, inside, vinylGroup, vinyl, label,
    isOpen: false, openness: 0,
    vinylOut: false, vinylness: 0,
  };
  // Back-references so the click handler can find a state from any of its
  // meshes without a search.
  front.userData.albumState = state;
  inside.userData.albumState = state;
  vinyl.userData.albumState = state;
  label.userData.albumState = state;
  albumStates.push(state);
}
placeAlbumCover('C2', 'BiomePlain_Album.png');
placeAlbumCover('C3', 'PalmTreeSyrup_Cover.png');
placeAlbumCover('B3', 'Periphsisha_Cover.png');

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

  // Vinyl record loaded on top (uses the shared grooved texture)
  const record = new THREE.Mesh(new THREE.CircleGeometry(feltR * 0.94, 48), recordVinylMat);
  record.rotation.x = -Math.PI / 2;
  record.position.set(platterX, platterTopY + 0.029, 0);
  ro(record, 10);
  const recordLabel = new THREE.Mesh(new THREE.CircleGeometry(feltR * 0.30, 24), labelMat);
  recordLabel.rotation.x = -Math.PI / 2;
  recordLabel.position.set(platterX, platterTopY + 0.0295, 0);
  ro(recordLabel, 11);

  // Spindle through the record's center hole
  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.060, 16), chromeMat);
  spindle.position.set(platterX, platterTopY + 0.055, 0);
  ro(spindle, 12);

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
  const clickNdc = new THREE.Vector2(
     (e.clientX / window.innerWidth)  * 2 - 1,
    -((e.clientY / window.innerHeight) * 2 - 1),
  );
  raycaster.setFromCamera(clickNdc, camera);
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
    if (state.isOpen) state.vinylOut = !state.vinylOut;
  }
  // Clicking the inside panel of an open album is a no-op for now.
});

function updateAlbumState() {
  // Hover only counts when the album is closed.
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(albumCoverMeshes, false);
  const hovered = hits.length ? hits[0].object : null;
  const hitPt   = hits.length ? hits[0].point  : null;

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
    s.coverPivot.rotation.y = OPEN_COVER_ROT * o;

    // --- Vinyl pop-out (only meaningful when cover is open). When cover is
    // closed, vinyl x=0 keeps it hidden behind the cover. When open + tucked
    // in, vinyl sits at VINYL_PEEK_X with its right edge poking past the
    // inside panel. Click on the peek and it slides out to VINYL_OUT_X.
    const targetV = s.vinylOut ? 1 : 0;
    s.vinylness += (targetV - s.vinylness) * OPEN_LERP;
    const v = s.vinylness;
    s.vinylGroup.position.x = (VINYL_PEEK_X + (VINYL_OUT_X - VINYL_PEEK_X) * v) * o;
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
});

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
      // Merged bottom half shares its Group with the top half — tilt it once.
      if (isMergedBot(row, col)) continue;
      const cg = cubbies[row][col];
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
    renderer.render(scene, camera);
  }
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
