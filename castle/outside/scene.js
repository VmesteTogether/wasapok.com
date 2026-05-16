// Wasapok Castle — OUTSIDE scene.
// Loads Temmys-Castle-01.glb, derives a tile-based layout from the
// "Walkable_Plane" mesh, treats "Wall L", "Wall R", "Gate_1", and
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
const BOUNDARY_NAMES = ['Wall L', 'Wall R', 'Gate_1', 'Building 1'];
// Names of the 4 textured planes that define the visible ground
const GROUND_NAMES = ['ocean texture 1', 'ocean texture 2', 'ocean texture 3', 'grass texture'];

export async function buildScene() {
  const scene = new THREE.Scene();

  // Async loads tracked here; `ready` in the returned object resolves when all complete.
  const pendingLoads = [];

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


  // ----- Replace Gate_1 mesh with procedural portcullis -----
  const gateObj = find('Gate_1');
  const gateBb  = boundaryBoxes.find(b => b.name === 'Gate_1')?.box;
  if (gateObj) gateObj.parent?.remove(gateObj);
  if (gateBb) {
    const gW   = gateBb.max.x - gateBb.min.x;
    const gD   = gateBb.max.z - gateBb.min.z;
    const gH   = gateBb.max.y - gateBb.min.y;
    const spanX = gW >= gD;
    const span  = spanX ? gW : gD;
    const gateCX = (gateBb.min.x + gateBb.max.x) / 2;
    const gateCZ = (gateBb.min.z + gateBb.max.z) / 2;
    const ironMat  = new THREE.MeshStandardMaterial({ color: 0x22222a, roughness: 0.50, metalness: 0.90 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x484440, roughness: 0.90, metalness: 0.05 });
    const FRAME = 0.20, BAR = 0.058, SPIKE = 0.34;
    const portGroup = new THREE.Group();
    portGroup.position.set(gateCX, gateBb.min.y, gateCZ);
    if (!spanX) portGroup.rotation.y = Math.PI / 2;
    for (const sx of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(FRAME, gH + SPIKE, FRAME), stoneMat);
      pillar.position.set(sx * (span / 2 + FRAME / 2), (gH + SPIKE) / 2, 0);
      portGroup.add(pillar);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span + FRAME * 2, FRAME, FRAME), stoneMat);
    beam.position.set(0, gH + SPIKE - FRAME / 2, 0);
    portGroup.add(beam);
    const numBars = Math.max(3, Math.round(span / 0.44));
    const barStep = span / numBars;
    for (let i = 0; i < numBars; i++) {
      const bx = -span / 2 + barStep * (i + 0.5);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(BAR, gH, BAR), ironMat);
      bar.position.set(bx, gH / 2, 0);
      portGroup.add(bar);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(BAR * 1.1, SPIKE, 4), ironMat);
      spike.rotation.y = Math.PI / 4;
      spike.position.set(bx, gH + SPIKE / 2, 0);
      portGroup.add(spike);
    }
    for (const frac of [0.28, 0.58, 0.82]) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(span, BAR * 0.85, BAR * 0.85), ironMat);
      cross.position.set(0, gH * frac, 0);
      portGroup.add(cross);
    }
    scene.add(portGroup);
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

  // ----- Spawn: nearest walkable tile to Gate_1, facing the castle (centerTile) -----
  let spawn = null;
  if (gateBb && centerTile) {
    const gcx = (gateBb.min.x + gateBb.max.x) / (2 * CELL);
    const gcz = (gateBb.min.z + gateBb.max.z) / (2 * CELL);
    let best = null, bestD = Infinity;
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        if (grid[ty][tx] !== 0) continue;
        const d = (tx - gcx) ** 2 + (ty - gcz) ** 2;
        if (d < bestD) { bestD = d; best = { x: tx, y: ty }; }
      }
    }
    if (best) {
      const dxn = centerTile.x - best.x;
      const dyn = centerTile.y - best.y;
      const dir = Math.abs(dxn) > Math.abs(dyn) ? (dxn > 0 ? 1 : 3) : (dyn > 0 ? 2 : 0);
      spawn = { x: best.x, y: best.y, dir };
    }
  }
  if (!spawn) spawn = { x: Math.floor(W / 2), y: Math.floor(H / 2), dir: 0 };

  // Trigger pad: 10 tiles forward of spawn (5 past the previous position,
  // i.e. closer to the castle). Falls back to the farthest valid tile if
  // that exact tile is blocked or off-grid.
  const FORWARD_TILES = 13;
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
  const perpDx = fwdDy, perpDy = -fwdDx;
  const triggerTiles = [];
  if (triggerTile) {
    for (const s of [-1, 0, 1]) {
      const tx2 = triggerTile.x + perpDx * s;
      const ty2 = triggerTile.y + perpDy * s;
      if (ty2 >= 0 && ty2 < H && tx2 >= 0 && tx2 < W && grid[ty2][tx2] === 0)
        triggerTiles.push({ x: tx2, y: ty2 });
    }
  }

  // ----- Visible red trigger pad on the walkable plane -----
  const triggerMarkerGroup = new THREE.Group();
  const padMat = new THREE.MeshBasicMaterial({ color: 0xff2030, transparent: true, opacity: 0 });
  for (const t of triggerTiles) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.9, 0.06, CELL * 0.9), padMat);
    pad.position.set((t.x + 0.5) * CELL, 0.03, (t.y + 0.5) * CELL);
    triggerMarkerGroup.add(pad);
  }
  if (triggerTiles.length) scene.add(triggerMarkerGroup);

  // ===== 3-TILE PORTAL DOOR on Building 1 — replica of the main-hall door =====
  if (triggerTile) {
    // Door dimensions: 2 trigger tiles wide (was 3, shortened by one tile on the right),
    // human-scale height.
    const PW = 2 * CELL;
    const PH = 2.2;
    const FT = 0.18;
    const fDx = [0, 1, 0, -1][spawn.dir];
    const fDy = [-1, 0, 1, 0][spawn.dir];
    // Player-relative perpendicular axis: perp(+1) is the player's left.
    const pDx = fDy, pDy = -fDx;
    // Anchor the door directly on the invisible trigger tiles, with a
    // +0.5-tile left offset so the 2-tile-wide door covers the centre +
    // right-of-centre trigger tiles.
    const wallX = (triggerTile.x + 0.5) * CELL + pDx * 0.85 * CELL;
    const wallZ = (triggerTile.y + 0.5) * CELL + pDy * 0.85 * CELL;
    console.log('[outside] portal door:', { spawn, triggerTile, wallX, wallZ });
    const portalMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform float uTime; varying vec2 vUv;
        void main(){
          vec2 p = vUv - 0.5;
          float r = length(p);
          float a = atan(p.y, p.x);
          float ripple = sin(r * 18.0 - uTime * 1.1) * 0.22 + 0.5;
          float swirl  = sin(a * 4.0 + uTime * 0.40 - r * 8.0) * 0.18 + 0.5;
          float n = mix(ripple, swirl, 0.55);
          vec3 col = mix(vec3(0.25,0.50,1.00), vec3(0.61,0.84,1.00), n);
          col = mix(col, vec3(0.92,0.97,1.00), smoothstep(0.62, 0.88, n));
          float edge = clamp(min(min(vUv.x, 1.-vUv.x), min(vUv.y, 1.-vUv.y)) * 8.0, 0.0, 1.0);
          gl_FragColor = vec4(col, 0.88 * edge);
        }
      `,
      transparent: true, side: THREE.DoubleSide, depthWrite: false,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xd6dadf, roughness: 0.18, metalness: 0.95,
    });
    const pivot = new THREE.Group();
    pivot.position.set(wallX - fDx * 0.05, PH / 2, wallZ - fDy * 0.05);
    pivot.rotation.y = [0, -Math.PI / 2, Math.PI, Math.PI / 2][spawn.dir];
    const portalMesh = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), portalMat);
    portalMesh.onBeforeRender = (_r, _s, cam) => {
      portalMat.uniforms.uTime.value = performance.now() / 1000;
      const dx = cam.position.x - pivot.position.x;
      const dz = cam.position.z - pivot.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const open = Math.max(0, Math.min(1, (10.0 - dist) / 5.0));
      portalMesh.scale.y = Math.max(0.001, 1 - open);
      portalMesh.position.y = (PH / 2) * open;
      lineMat.opacity = 0.8 * open;
    };
    pivot.add(portalMesh);
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(PW + FT, FT, FT), chromeMat);
    topBar.position.set(0, PH / 2 + FT / 2, 0);
    pivot.add(topBar);
    const sideGeom = new THREE.BoxGeometry(FT, PH + FT, FT);
    const lBar = new THREE.Mesh(sideGeom, chromeMat);
    lBar.position.set(-PW / 2 - FT / 2, FT / 2, 0);
    pivot.add(lBar);
    const rBar = new THREE.Mesh(sideGeom, chromeMat);
    rBar.position.set(PW / 2 + FT / 2, FT / 2, 0);
    pivot.add(rBar);

    // Faux interior hallway behind the door — masked by stencil so it only
    // shows through the portal frame. Side-on views never see it.
    const STENCIL_REF = 1;
    const stencilTest = (m) => {
      m.stencilWrite = true;
      m.stencilFunc = THREE.EqualStencilFunc;
      m.stencilRef = STENCIL_REF;
      m.stencilFail = THREE.KeepStencilOp;
      m.stencilZFail = THREE.KeepStencilOp;
      m.stencilZPass = THREE.KeepStencilOp;
    };
    const tMat = new THREE.MeshBasicMaterial({
      color: 0x0c0d10, side: THREE.DoubleSide,
      fog: false, depthTest: false, depthWrite: false,
    });
    stencilTest(tMat);
    const tBackMat = new THREE.MeshBasicMaterial({
      color: 0x020204, side: THREE.DoubleSide,
      fog: false, depthTest: false, depthWrite: false,
    });
    stencilTest(tBackMat);
    // Invisible front-facing mask plane at the door — writes stencil=1 only
    // where the portal opening is actually visible to the camera.
    const maskMat = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      depthTest: true,
      side: THREE.FrontSide,
      stencilWrite: true,
      stencilFunc: THREE.AlwaysStencilFunc,
      stencilRef: STENCIL_REF,
      stencilFail: THREE.KeepStencilOp,
      stencilZFail: THREE.KeepStencilOp,
      stencilZPass: THREE.ReplaceStencilOp,
    });
    const maskMesh = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), maskMat);
    maskMesh.renderOrder = 5; // before the tunnel (10)
    pivot.add(maskMesh);
    // Cross-section matches the door opening exactly so the tunnel never
    // pokes outside the chrome U-frame.
    const TDP = 6.0;
    const tunnelPanels = [
      [PW, TDP, [0, -PH/2, -TDP/2], [-Math.PI/2, 0, 0], tMat], // floor
      [PW, TDP, [0,  PH/2, -TDP/2], [ Math.PI/2, 0, 0], tMat], // ceiling
      [TDP, PH, [-PW/2, 0, -TDP/2], [0,  Math.PI/2, 0], tMat], // left
      [TDP, PH, [ PW/2, 0, -TDP/2], [0, -Math.PI/2, 0], tMat], // right
      [PW, PH, [0, 0, -TDP], [0, 0, 0], tBackMat],             // far wall (darker)
    ];
    const tunnelGroup = new THREE.Group();
    pivot.add(tunnelGroup);
    for (const [w, h, p, r, mat] of tunnelPanels) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(p[0], p[1], p[2]);
      m.rotation.set(r[0], r[1], r[2]);
      m.renderOrder = 10;
      tunnelGroup.add(m);
    }
    // One-point-perspective "vanishing" lines from each front corner to the
    // matching back-wall corner — the four long edges of the tunnel box.
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x1c1e22, fog: false, depthTest: false, depthWrite: false,
      transparent: true, opacity: 0, // ramps with portal animation
    });
    stencilTest(lineMat);
    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute('position', new THREE.Float32BufferAttribute([
      -PW/2,  PH/2, 0,   -PW/2,  PH/2, -TDP, // top-left
       PW/2,  PH/2, 0,    PW/2,  PH/2, -TDP, // top-right
      -PW/2, -PH/2, 0,   -PW/2, -PH/2, -TDP, // bottom-left
       PW/2, -PH/2, 0,    PW/2, -PH/2, -TDP, // bottom-right
    ], 3));
    const vlines = new THREE.LineSegments(lineGeom, lineMat);
    vlines.renderOrder = 15;
    tunnelGroup.add(vlines);
    // Keep portal + chrome frame on top of the tunnel.
    portalMesh.renderOrder = 20;
    topBar.renderOrder = 20;
    lBar.renderOrder = 20;
    rBar.renderOrder = 20;

    scene.add(pivot);
  }

  console.log('[outside] walkable bbox', walkableBox);
  console.log('[outside] spawn=', spawn, ' triggerTile=', triggerTile);

  scene.fog = new THREE.FogExp2(0x8aaabf, 0.018);

  // ----- Animated cel-shaded ocean with animated whitecap particles -----
  {
    // Toon gradient: deep shadow → original blue → highlight
    const gradCanvas = document.createElement('canvas');
    gradCanvas.width = 3; gradCanvas.height = 1;
    const gc = gradCanvas.getContext('2d');
    gc.fillStyle = '#0a2a3a'; gc.fillRect(0, 0, 1, 1);
    gc.fillStyle = '#1a5070'; gc.fillRect(1, 0, 1, 1);
    gc.fillStyle = '#2a7898'; gc.fillRect(2, 0, 1, 1);
    const gradMap = new THREE.CanvasTexture(gradCanvas);
    gradMap.minFilter = THREE.NearestFilter;
    gradMap.magFilter = THREE.NearestFilter;

    // Whitecap particle system — redrawn every frame
    const WC = 256;
    const wcCanvas = document.createElement('canvas');
    wcCanvas.width = WC; wcCanvas.height = WC;
    const wg = wcCanvas.getContext('2d');
    const caps = [];
    function spawnCap(startAge) {
      caps.push({
        x: Math.random() * WC, y: Math.random() * WC,
        len: 7 + Math.random() * 18,
        angle: (Math.random() - 0.5) * 0.5,
        bow: (Math.random() - 0.5) * 0.35,
        age: startAge ?? 0,
        life: 1.8 + Math.random() * 2.4,
      });
    }
    for (let i = 0; i < 20; i++) spawnCap(Math.random() * 4);

    const foamTex = new THREE.CanvasTexture(wcCanvas);
    foamTex.wrapS = foamTex.wrapT = THREE.RepeatWrapping;
    foamTex.repeat.set(6, 6);
    foamTex.magFilter = THREE.NearestFilter;
    foamTex.minFilter = THREE.NearestFilter;

    const SEG = 64, SIZE = 500;
    const oceanGeom = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    oceanGeom.rotateX(-Math.PI / 2);
    oceanGeom.attributes.position.usage = THREE.DynamicDrawUsage;
    oceanGeom.attributes.normal.usage   = THREE.DynamicDrawUsage;
    const _oOrig = new Float32Array(oceanGeom.attributes.position.array);

    const oceanMat = new THREE.MeshToonMaterial({
      color: 0x1a5070,
      gradientMap: gradMap,
      emissive: 0xffffff,
      emissiveMap: foamTex,
      emissiveIntensity: 0.55,
    });
    const oceanMesh = new THREE.Mesh(oceanGeom, oceanMat);
    oceanMesh.position.set(wbcX, -2.50, wbcZ);

    let _prevT = -1;
    oceanMesh.onBeforeRender = () => {
      const t = performance.now() * 0.001;
      const dt = _prevT < 0 ? 0 : Math.min(t - _prevT, 0.1);
      _prevT = t;

      // Wave geometry
      const pa = oceanGeom.attributes.position.array;
      for (let i = 0, n = pa.length / 3; i < n; i++) {
        const x = _oOrig[i * 3], z = _oOrig[i * 3 + 2];
        pa[i * 3 + 1] = _oOrig[i * 3 + 1]
          + Math.sin(x * 0.14 + t * 0.90) * 0.45
          + Math.sin(z * 0.11 + t * 0.65) * 0.35
          + Math.sin((x + z) * 0.07 + t * 1.30) * 0.22
          + Math.sin((x - z) * 0.09 + t * 0.50) * 0.18;
      }
      oceanGeom.attributes.position.needsUpdate = true;
      oceanGeom.computeVertexNormals();
      oceanGeom.attributes.normal.needsUpdate = true;

      // Whitecap particles
      wg.clearRect(0, 0, WC, WC);
      wg.lineCap = 'round';
      wg.lineWidth = 1.2;
      wg.globalAlpha = 1;
      for (let i = caps.length - 1; i >= 0; i--) {
        caps[i].age += dt;
        if (caps[i].age >= caps[i].life) { caps.splice(i, 1); spawnCap(); continue; }
        const p = caps[i].age / caps[i].life;
        const b = Math.round(Math.sin(p * Math.PI) * 190);
        wg.strokeStyle = `rgb(${Math.round(b*0.84)},${Math.round(b*0.88)},${b})`;
        const cx = Math.cos(caps[i].angle), cy = Math.sin(caps[i].angle);
        const hl = caps[i].len * 0.5;
        const cpx = caps[i].x - cy * (caps[i].len * caps[i].bow);
        const cpy = caps[i].y + cx * (caps[i].len * caps[i].bow);
        wg.beginPath();
        wg.moveTo(caps[i].x - cx * hl, caps[i].y - cy * hl);
        wg.quadraticCurveTo(cpx, cpy, caps[i].x + cx * hl, caps[i].y + cy * hl);
        wg.stroke();
      }
      foamTex.needsUpdate = true;
      foamTex.offset.x = t * 0.003;
      foamTex.offset.y = t * 0.001;
    };
    scene.add(oceanMesh);
  }

  // ----- Floating vase sculpture (Eskleo-Vase-01.obj) at walkable-plane centre -----
  const vaseGroup = new THREE.Group();
  const vaseBaseY = 2.6;
  {
    const vaseX = wbcX - fwdDx * CELL;
    const vaseZ = wbcZ - fwdDy * CELL;
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

    pendingLoads.push(new Promise((resolve) => {
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
        resolve();
      }, undefined, err => { console.warn('[outside] Eskleo-Vase-01.obj failed', err); resolve(); });
    }));

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

  // ----- Monumental flanking vase sculptures rising from the water on either side of the path -----
  const monuments = [];
  const monumentBaseY = 4;
  {
    const fwdDist = -5 * CELL; // behind spawn — flanking the entry, away from the institute
    const pathMidX = (spawn.x + 0.5) * CELL + fwdDx * fwdDist;
    const pathMidZ = (spawn.y + 0.5) * CELL + fwdDy * fwdDist;
    const perpHalf = perpDx !== 0
      ? (walkableBox.max.x - walkableBox.min.x) * 0.5
      : (walkableBox.max.z - walkableBox.min.z) * 0.5;
    const monumentOffset = perpHalf + 9 * CELL; // well clear of walls/gate to avoid clipping
    for (const sgn of [-1, 1]) {
      const mGroup = new THREE.Group();
      mGroup.position.set(
        pathMidX + perpDx * monumentOffset * sgn,
        monumentBaseY,
        pathMidZ + perpDy * monumentOffset * sgn,
      );
      scene.add(mGroup);
      const inner = new THREE.PointLight(0x6aa8ff, 4.5, 28, 1.6);
      mGroup.add(inner);
      mGroup.userData.innerLight = inner;
      monuments.push(mGroup);
    }
    pendingLoads.push(new Promise((resolve) => {
      new OBJLoader().load('outside/Eskleo-Vase-01.obj', (loaded) => {
        const mat = new THREE.MeshStandardMaterial({
          color: 0x9cd6ff, emissive: 0x4080ff, emissiveIntensity: 1.4,
          metalness: 0.25, roughness: 0.18, transparent: true, opacity: 0.65,
          side: THREE.DoubleSide,
        });
        const bbox = new THREE.Box3().setFromObject(loaded);
        const size = bbox.getSize(new THREE.Vector3());
        const maxD = Math.max(size.x, size.y, size.z);
        const TARGET = 12; // welcome-monument scale
        const s = maxD > 0 ? TARGET / maxD : 1;
        for (const mGroup of monuments) {
          const c = loaded.clone(true);
          c.scale.setScalar(s);
          const cb = new THREE.Box3().setFromObject(c);
          const cc = cb.getCenter(new THREE.Vector3());
          c.position.sub(cc);
          c.traverse(o => { if (o.isMesh) o.material = mat; });
          mGroup.add(c);
        }
        resolve();
      }, undefined, err => { console.warn('[outside] monument vases failed', err); resolve(); });
    }));
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
    monuments, monumentBaseY,
    ready: Promise.all(pendingLoads),
  };
}
