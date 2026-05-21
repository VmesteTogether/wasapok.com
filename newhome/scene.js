import * as THREE from 'three';

// 6×4 maple-frame bookshelf cubby grid, head-on static view. Same pixelated
// wood-tile + recessed-cubby-box construction as castle/hallway2/scene.js
// shelfWalls (Wasapok room). Each cubby is its own Group exposed via
// window.cubbies[row][col] — child meshes added to that group sit inside the
// cubby's local frame (origin at front-center of opening, +x right, +y up,
// -z into the wall).

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
  const positions = [], normals = [], colors = [], indices = [];
  const addQuad = (verts, n, col) => {
    const base = positions.length / 3;
    for (const v of verts) positions.push(...v);
    for (let i = 0; i < 4; i++) normals.push(...n);
    for (let i = 0; i < 4; i++) colors.push(...col);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  // back (darkest)
  addQuad([[-w2,-h2,zB],[ w2,-h2,zB],[ w2, h2,zB],[-w2, h2,zB]], [0,0,1],  [0.11,0.07,0.035]);
  // top (under-plank shadow)
  addQuad([[-w2, h2,zB],[ w2, h2,zB],[ w2, h2,zF],[-w2, h2,zF]], [0,-1,0], [0.15,0.10,0.05 ]);
  // bottom (lit — where things sit)
  addQuad([[-w2,-h2,zF],[ w2,-h2,zF],[ w2,-h2,zB],[-w2,-h2,zB]], [0, 1,0], [0.34,0.22,0.12 ]);
  // left
  addQuad([[-w2,-h2,zF],[-w2,-h2,zB],[-w2, h2,zB],[-w2, h2,zF]], [1, 0,0], [0.15,0.10,0.05 ]);
  // right
  addQuad([[ w2,-h2,zF],[ w2, h2,zF],[ w2, h2,zB],[ w2,-h2,zB]], [-1,0,0], [0.15,0.10,0.05 ]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  return g;
})();
const cubbyMat = new THREE.MeshBasicMaterial({
  vertexColors: true, side: THREE.DoubleSide,
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
    cubbyGroup.add(new THREE.Mesh(cubbyGeom, cubbyMat));
    scene.add(cubbyGroup);
    cubbies[row].push(cubbyGroup);
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
  camera.position.z = Math.max(distH, distW) * 1.08;
  camera.updateProjectionMatrix();
  renderer.setSize(Math.floor(w / PIXELATION), Math.floor(h / PIXELATION), false);
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
};
window.addEventListener('resize', onResize);
onResize();

function render() {
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();
