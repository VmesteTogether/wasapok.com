// Wasapok Castle — OUTSIDE scene.
// Loads Temmys-Castle-01.glb, derives a tile-based layout from the
// "Walkable_Plane" mesh, treats "Wall L", "Wall R", "Gate 1", and
// "Building 1" as solid boundary hitboxes, and emits a list of trigger
// tiles on the walkable plane directly in front of "Building 1". Stepping
// onto any of those tiles loads main hall.
//
// All object names are preserved exactly as authored in Blender so that
// future edits can reference them.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

export const CELL = 2; // tile size, matches main hall

const GLB_URL = 'outside/Temmys-Castle-01.glb';

// Names of the 4 solid boundary objects in the glb
const BOUNDARY_NAMES = ['Wall L', 'Wall R', 'Gate 1', 'Building 1'];
// Names of the 4 textured planes that define the visible ground
const GROUND_NAMES = ['ocean texture 1', 'ocean texture 2', 'ocean texture 3', 'grass texture'];

export async function buildScene() {
  const scene = new THREE.Scene();

  // ----- Cool daylight sky -----
  scene.background = new THREE.Color(0x8aaabf);

  // Hemisphere: cool blue sky above, slightly warmer ground bounce below
  const hemi = new THREE.HemisphereLight(0xbcd4ee, 0x5a6072, 0.95);
  scene.add(hemi);

  // Directional sun, slightly cool
  const sun = new THREE.DirectionalLight(0xf6ecd6, 1.35);
  sun.position.set(60, 110, 40);
  scene.add(sun);

  // Soft ambient for shadow fill
  scene.add(new THREE.AmbientLight(0x4a5868, 0.30));

  // ----- Load GLB -----
  const loader = new GLTFLoader();
  const gltf = await new Promise((resolve, reject) => {
    loader.load(GLB_URL, resolve, undefined, reject);
  });
  const root = gltf.scene;

  // Force pixelated texture filtering across every material in the glb.
  // This makes the outside scene's surface aesthetic match the pixel-art
  // feel of main hall (sharp texels, no bilinear blur).
  root.traverse(obj => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m) continue;
      for (const slot of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap']) {
        const tex = m[slot];
        if (tex) {
          tex.magFilter = THREE.NearestFilter;
          tex.minFilter = THREE.NearestFilter;
          tex.generateMipmaps = false;
          tex.needsUpdate = true;
        }
      }
    }
  });

  // Bbox helper (world-space, after parent transforms resolve)
  function bboxOf(obj) { return new THREE.Box3().setFromObject(obj); }
  function find(name) { return root.getObjectByName(name); }

  root.updateMatrixWorld(true);

  // ----- Locate required objects -----
  const walkable = find('Walkable_Plane');
  if (!walkable) {
    throw new Error("GLB is missing required mesh 'Walkable_Plane'");
  }
  const boundaries = BOUNDARY_NAMES
    .map(n => ({ name: n, obj: find(n) }))
    .filter(b => b.obj);
  const groundPlanes = GROUND_NAMES
    .map(n => find(n))
    .filter(Boolean);

  // ----- Translate root so the walkable surface aligns with engine coords -----
  // Player camera is at world Y = 1.55. Translate so the top of Walkable_Plane
  // sits at Y = 0, and its min-corner sits at world X=0, Z=0. Then tile (tx,ty)
  // maps to world position (tx*CELL, _, ty*CELL) directly via player.js.
  const wb0 = bboxOf(walkable);
  root.position.x -= wb0.min.x;
  root.position.z -= wb0.min.z;
  root.position.y -= wb0.max.y;
  root.updateMatrixWorld(true);
  scene.add(root);

  // Re-read bboxes after translation
  const walkableBox = bboxOf(walkable);
  const boundaryBoxes = boundaries.map(b => ({ name: b.name, box: bboxOf(b.obj) }));
  const building1Box = boundaryBoxes.find(b => b.name === 'Building 1')?.box || null;

  // ----- Apply portcullis-style gate texture to "Gate 1" -----
  // Vertical iron bars with transparent gaps so the grass shows through.
  const gateObj = find('Gate 1');
  if (gateObj) {
    const gateTex = makeGateTexture();
    gateTex.repeat.set(6, 1);
    gateObj.traverse(child => {
      if (!child.isMesh) return;
      child.material = new THREE.MeshStandardMaterial({
        map: gateTex,
        alphaTest: 0.5,            // hard pixel edge, no transparency sorting
        side: THREE.DoubleSide,
        color: 0xb8a890,
        metalness: 0.55,
        roughness: 0.45,
      });
    });
  }

  // ----- Build tile grid covering the walkable plane -----
  const W = Math.max(2, Math.ceil(walkableBox.max.x / CELL));
  const H = Math.max(2, Math.ceil(walkableBox.max.z / CELL));

  const STD_CEIL = 20; // open sky — large value
  const grid    = Array.from({length: H}, () => new Array(W).fill(-1));
  const ceilH   = Array.from({length: H}, () => new Array(W).fill(STD_CEIL));
  const roomId  = Array.from({length: H}, () => new Array(W).fill(null));

  function tileOverlaps2D(tx, ty, box) {
    const x0 = tx * CELL, x1 = (tx + 1) * CELL;
    const z0 = ty * CELL, z1 = (ty + 1) * CELL;
    return !(x0 >= box.max.x || x1 <= box.min.x ||
             z0 >= box.max.z || z1 <= box.min.z);
  }
  function pointInBox2D(x, z, box) {
    return x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z;
  }

  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      const cx = (tx + 0.5) * CELL;
      const cz = (ty + 0.5) * CELL;
      const insideWalk = pointInBox2D(cx, cz, walkableBox);

      let blockedBy = null;
      for (const b of boundaryBoxes) {
        if (tileOverlaps2D(tx, ty, b.box)) { blockedBy = b.name; break; }
      }

      if (blockedBy) {
        grid[ty][tx] = 1;
        roomId[ty][tx] = blockedBy;
      } else if (insideWalk) {
        grid[ty][tx] = 0;
        roomId[ty][tx] = 'outside';
      } else {
        grid[ty][tx] = -1;
        roomId[ty][tx] = null;
      }
    }
  }

  // ----- Spawn anchor: the walkable tile nearest the centre of the plane.
  // Only used to derive the spawn position; not the actual trigger pad. -----
  const wbcX = (walkableBox.min.x + walkableBox.max.x) * 0.5;
  const wbcZ = (walkableBox.min.z + walkableBox.max.z) * 0.5;
  const ctrX = Math.floor(wbcX / CELL);
  const ctrY = Math.floor(wbcZ / CELL);
  let centerTile = null;
  {
    let bestD = Infinity;
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        if (grid[ty][tx] !== 0) continue;
        const d = (tx - ctrX) * (tx - ctrX) + (ty - ctrY) * (ty - ctrY);
        if (d < bestD) { bestD = d; centerTile = { x: tx, y: ty }; }
      }
    }
  }

  // ----- Spawn: back against the gate, centered across the walkable plane,
  // facing the castle. Derived from the centre anchor as before. -----
  let spawn = null;
  if (centerTile) {
    let maxDX = 0, maxDY = 0;
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        if (grid[ty][tx] !== 0) continue;
        const adx = Math.abs(tx - centerTile.x);
        const ady = Math.abs(ty - centerTile.y);
        if (adx > maxDX) maxDX = adx;
        if (ady > maxDY) maxDY = ady;
      }
    }
    const useX = maxDX > maxDY;
    const extremeMax = useX ? maxDX : maxDY;

    let best = null, bestPerp = Infinity;
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        if (grid[ty][tx] !== 0) continue;
        const extreme = useX ? Math.abs(tx - centerTile.x) : Math.abs(ty - centerTile.y);
        if (extreme !== extremeMax) continue;
        const perp = useX ? Math.abs(ty - centerTile.y) : Math.abs(tx - centerTile.x);
        if (perp < bestPerp) { bestPerp = perp; best = { x: tx, y: ty }; }
      }
    }

    if (best) {
      const dxn = centerTile.x - best.x;
      const dyn = centerTile.y - best.y;
      let dir;
      if (Math.abs(dxn) > Math.abs(dyn)) dir = dxn > 0 ? 1 : 3;
      else                                dir = dyn > 0 ? 2 : 0;
      spawn = { x: best.x, y: best.y, dir };
    }
  }
  if (!spawn) {
    spawn = { x: Math.floor(W / 2), y: Math.floor(H / 2), dir: 0 };
  }

  // Trigger pad: 10 tiles forward of spawn (5 past the previous position,
  // i.e. closer to the castle). Falls back to the farthest valid tile if
  // that exact tile is blocked or off-grid.
  const FORWARD_TILES = 12;
  const fwdDx = [0, 1, 0, -1][spawn.dir];
  const fwdDy = [-1, 0, 1, 0][spawn.dir];
  let triggerTile = null;
  for (let n = FORWARD_TILES; n >= 1; n--) {
    const tx = spawn.x + fwdDx * n;
    const ty = spawn.y + fwdDy * n;
    if (ty < 0 || ty >= H || tx < 0 || tx >= W) continue;
    if (grid[ty][tx] !== 0) continue;
    triggerTile = { x: tx, y: ty };
    break;
  }
  const triggerTiles = triggerTile ? [triggerTile] : [];

  // ----- Visible red trigger pad on the walkable plane -----
  const triggerMarkerGroup = new THREE.Group();
  if (triggerTile) {
    const padGeom = new THREE.BoxGeometry(CELL * 0.9, 0.06, CELL * 0.9);
    const padMat = new THREE.MeshBasicMaterial({ color: 0xff2030 });
    const pad = new THREE.Mesh(padGeom, padMat);
    pad.position.set(
      (triggerTile.x + 0.5) * CELL,
      0.03,
      (triggerTile.y + 0.5) * CELL,
    );
    triggerMarkerGroup.add(pad);
    scene.add(triggerMarkerGroup);
  }

  console.log('[outside] walkable bbox', walkableBox);
  console.log('[outside] spawn=', spawn, ' triggerTile=', triggerTile);

  scene.fog = new THREE.FogExp2(0x8aaabf, 0.018);

  // ----- Floating vase sculpture (Eskleo-Vase-01.obj) at walkable-plane centre -----
  const vaseGroup = new THREE.Group();
  const vaseBaseY = 2.6;
  {
    const vaseX = wbcX;
    const vaseZ = wbcZ;
    vaseGroup.position.set(vaseX, vaseBaseY, vaseZ);
    scene.add(vaseGroup);

    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x9cd6ff, emissive: 0x4080ff, emissiveIntensity: 1.4,
      metalness: 0.25, roughness: 0.18, transparent: true, opacity: 0.65,
      side: THREE.DoubleSide,
    });

    const innerLight = new THREE.PointLight(0x6aa8ff, 2.2, 8, 1.6);
    vaseGroup.add(innerLight);
    vaseGroup.userData.innerLight = innerLight;

    new OBJLoader().load('outside/Eskleo-Vase-01.obj', (loaded) => {
      const bbox = new THREE.Box3().setFromObject(loaded);
      const size = bbox.getSize(new THREE.Vector3());
      const maxD = Math.max(size.x, size.y, size.z);
      const TARGET = 5.4; // 3× the base 1.8 size
      const s = maxD > 0 ? TARGET / maxD : 1;
      const MIN_RATIO = 0.7;
      loaded.scale.set(
        s * Math.max(1, MIN_RATIO * maxD / Math.max(1e-4, size.x)),
        s * Math.max(1, MIN_RATIO * maxD / Math.max(1e-4, size.y)),
        s * Math.max(1, MIN_RATIO * maxD / Math.max(1e-4, size.z)),
      );
      const ctr = new THREE.Box3().setFromObject(loaded).getCenter(new THREE.Vector3());
      loaded.position.sub(ctr);
      loaded.traverse(o => { if (o.isMesh) o.material = crystalMat; });
      vaseGroup.add(loaded);
    }, undefined, err => console.warn('[outside] Eskleo-Vase-01.obj failed', err));

    const ringGeom = new THREE.TorusGeometry(0.85, 0.09, 16, 64);
    ringGeom.attributes.position.usage = THREE.DynamicDrawUsage;
    const _rOrig = new Float32Array(ringGeom.attributes.position.array);
    const _rNorm = ringGeom.attributes.normal.array;
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x9cd6ff, emissive: 0x4080ff, emissiveIntensity: 1.5,
      metalness: 0.30, roughness: 0.20, transparent: true, opacity: 0.75,
    });
    const baseRing = new THREE.Mesh(ringGeom, ringMat);
    baseRing.rotation.x = -Math.PI / 2;
    baseRing.position.set(vaseX, 0.12, vaseZ);
    baseRing.onBeforeRender = () => {
      const t = performance.now() * 0.001;
      const pa = ringGeom.attributes.position.array;
      const n = pa.length / 3;
      for (let i = 0; i < n; i++) {
        const tu = (Math.floor(i / 17) / 64) * Math.PI * 2;
        const d = Math.sin(tu * 5 - t * 3) * 0.025;
        pa[i*3]   = _rOrig[i*3]   + _rNorm[i*3]   * d;
        pa[i*3+1] = _rOrig[i*3+1] + _rNorm[i*3+1] * d;
        pa[i*3+2] = _rOrig[i*3+2] + _rNorm[i*3+2] * d;
      }
      ringGeom.attributes.position.needsUpdate = true;
    };
    scene.add(baseRing);
  }

  // Layout in the same shape as museum/layout.js so player.js consumes it directly
  const layout = {
    grid, ceilH, roomId,
    width: W, height: H,
    spawn,
    lights: [], signs: [], rooms: [],
    placements: [], torches: [],
  };

  return {
    scene,
    CELL,
    layout,
    triggerTiles,
    triggerMarkerGroup,
    walkableBox,
    boundaryBoxes,
    building1Box,
    fog: null,
    sun, hemi,
    vaseGroup, vaseBaseY,
  };
}

// Procedural canvas texture for Gate 1: dark iron vertical bars on
// transparent background, with thicker top/bottom rails. Pixelated.
function makeGateTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);

  // Top + bottom rails (full opaque iron)
  g.fillStyle = '#241a10';
  g.fillRect(0, 0, c.width, 22);
  g.fillRect(0, c.height - 22, c.width, 22);
  // Rail highlights
  g.fillStyle = '#5a4428';
  g.fillRect(0, 2, c.width, 2);
  g.fillRect(0, c.height - 22, c.width, 2);

  // 6 vertical bars across, equal spacing
  const numBars = 6;
  const barW = 10;
  const totalBars = numBars * barW;
  const gap = (c.width - totalBars) / (numBars + 1);

  for (let i = 0; i < numBars; i++) {
    const x = Math.round(gap + i * (barW + gap));
    // Bar body
    g.fillStyle = '#2a1d10';
    g.fillRect(x, 0, barW, c.height);
    // Specular highlight (left side, 2px)
    g.fillStyle = '#6a5028';
    g.fillRect(x + 1, 0, 2, c.height);
    // Mid tone
    g.fillStyle = '#3c2c18';
    g.fillRect(x + 4, 0, barW - 6, c.height);
    // Rivets at top + bottom
    g.fillStyle = '#1a1208';
    g.fillRect(x + barW / 2 - 1, 26, 2, 2);
    g.fillRect(x + barW / 2 - 1, c.height - 28, 2, 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
