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

// --- Procedural maple bookshelf tile: wood frame only (top/bottom planks +
// side dividers), cubby interior alpha=0 so the recessed-box geometry behind
// shows through. Same texture recipe as the castle bookshelf.
const TPX = 256, PLANK = 22, SIDE = 8;
const top = PLANK, bottom = TPX - PLANK;
const left = SIDE, right = TPX - SIDE;
const tc = document.createElement('canvas');
tc.width = TPX; tc.height = TPX;
const tx = tc.getContext('2d');
tx.imageSmoothingEnabled = false;
tx.save();
tx.beginPath();
tx.rect(0, 0, TPX, TPX);
tx.rect(left, top, right - left, bottom - top);
tx.clip('evenodd');
tx.fillStyle = '#d2a574';
tx.fillRect(0, 0, TPX, TPX);
for (let i = 0; i < 28; i++) {
  const gy = Math.random() * TPX;
  const rr = 125 + (Math.random() * 35 | 0);
  const gg =  82 + (Math.random() * 22 | 0);
  const bb =  42 + (Math.random() * 22 | 0);
  tx.strokeStyle = `rgba(${rr},${gg},${bb},0.22)`;
  tx.lineWidth = 1;
  tx.beginPath();
  tx.moveTo(0, gy);
  tx.lineTo(TPX, gy + (Math.random() - 0.5) * 5);
  tx.stroke();
}
tx.restore();
tx.fillStyle = 'rgba(255,232,188,0.35)';
tx.fillRect(0, 0, TPX, 2);
tx.fillStyle = 'rgba(30,15,5,0.65)';
tx.fillRect(0, TPX - 3, TPX, 3);

const shelfTex = new THREE.CanvasTexture(tc);
shelfTex.wrapS = shelfTex.wrapT = THREE.RepeatWrapping;
shelfTex.magFilter = THREE.NearestFilter;
shelfTex.minFilter = THREE.NearestFilter;
shelfTex.repeat.set(COLS, ROWS);
shelfTex.needsUpdate = true;

const wallMat = new THREE.MeshBasicMaterial({
  map: shelfTex, alphaTest: 0.5, side: THREE.FrontSide, transparent: true,
});
const wall = new THREE.Mesh(new THREE.PlaneGeometry(GRID_W, GRID_H), wallMat);
scene.add(wall);

// --- Recessed cubby box: 5 inward-facing panels (back + top + bottom + 2
// sides, no front). Vertex colors fake painted shading — dark back, lit
// bottom plank where things would sit. Brighter than the castle's dungeon
// shading because this scene has no fog/atmosphere to wade through.
const CUBBY_W = TILE_W * (right - left) / TPX;       // ~1.875m opening
const CUBBY_H = TILE_H * (bottom - top) / TPX;       // ~1.656m opening
const CUBBY_D = 0.7;                                 // depth into the wall
const FRONT_INSET = 0.006;                           // recess opening behind wall plane to dodge z-fighting
const cubbyGeom = (() => {
  const w2 = CUBBY_W / 2, h2 = CUBBY_H / 2;
  const zF = -FRONT_INSET, zB = -CUBBY_D - FRONT_INSET;
  const positions = [], normals = [], colors = [], isBack = [], indices = [];
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
  addQuad([[-w2,-h2,zB],[ w2,-h2,zB],[ w2, h2,zB],[-w2, h2,zB]], [0,0,1],  [0.04,0.025,0.012]);
  addQuad([[-w2, h2,zB],[ w2, h2,zB],[ w2, h2,zF],[-w2, h2,zF]], [0,-1,0], [0.06,0.04, 0.02 ]);
  addQuad([[-w2,-h2,zF],[ w2,-h2,zF],[ w2,-h2,zB],[-w2,-h2,zB]], [0, 1,0], [0.20,0.13, 0.07 ]);
  addQuad([[-w2,-h2,zF],[-w2,-h2,zB],[-w2, h2,zB],[-w2, h2,zF]], [1, 0,0], [0.06,0.04, 0.02 ]);
  addQuad([[ w2,-h2,zF],[ w2, h2,zF],[ w2, h2,zB],[ w2,-h2,zB]], [-1,0,0], [0.06,0.04, 0.02 ]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('isBack',   new THREE.Float32BufferAttribute(isBack, 1));
  g.setIndex(indices);
  return g;
})();
// Shader: shifts vertices flagged isBack=1 by per-cubby uBackOffset.xy.
// Forwards the color attribute manually since ShaderMaterial doesn't auto-wire
// the vertexColors flag like MeshBasicMaterial does.
const makeCubbyMat = () => new THREE.ShaderMaterial({
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
});

// Build the 7×4 grid. cubbies[0] is the top row, cubbies[ROWS-1] the bottom.
const cubbies = [];
window.cubbies = cubbies;
for (let row = 0; row < ROWS; row++) {
  cubbies.push([]);
  for (let col = 0; col < COLS; col++) {
    const cellX =  (col + 0.5) * TILE_W - GRID_W / 2;
    const cellY = -((row + 0.5) * TILE_H - GRID_H / 2);
    const cubbyGroup = new THREE.Group();
    cubbyGroup.position.set(cellX, cellY, 0);
    const cubbyMesh = new THREE.Mesh(cubbyGeom, makeCubbyMat());
    cubbyGroup.add(cubbyMesh);
    cubbyGroup.userData.cubbyMesh = cubbyMesh;     // for per-frame uBackOffset updates
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
    new THREE.MeshBasicMaterial({ color: VINYL_COLOR, ...matOpts }),
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
    renderer.render(scene, camera);
  }
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
