// Wasapok Castle — HALLWAY 2 ROOM scene.
// Layout: a 2-tile west-east hallway opening east into a 9x9 square room.
// No other exits. Aesthetic: matches main hall (glow LED walls, glass floor
// over animated water, neon-green orb sconces + chandelier).
//
// Coordinate system (tiles):
//   y = 0 (north) ... y = 8 (south)
//   x = 0 (west)  ... x = 10 (east)
//   Hallway:   (0,4) and (1,4)
//   Room:      x=2..10, y=0..8 (81 floor tiles)
//   Spawn:     (0,4) facing east
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  getWallTexture, getFloorTexture, getCeilingTexture,
} from '../museum/textures.js?v=33';

const CELL = 2;
const STD_CEIL = 3.6;
const ROOM_CEIL = 5.6; // tall like the main hub

// ---- Layout (handcrafted, no procedural carving) ----
// opts.roomShape === 'circle' carves a circular room inscribed in the 9x9 area
// instead of the default square; the west hallway entrance is preserved either way.
function buildLayout(opts) {
  const big = opts && opts.bigRoom;
  // Default: 11×9 grid with a 9×9 room. bigRoom: 21×19 grid with a 19×19 room
  // (true 2× linear, ~4× area). Hallway is always 2 tiles long, x=0..1.
  const W = big ? 21 : 11;
  const H = big ? 19 : 9;
  const hallY = big ? 9 : 4;       // hallway row
  const roomXMax = W - 1;          // east edge of room
  const cx = big ? 11 : 6;         // tile-center x of the room
  const cy = hallY;                // tile-center y of the room (centered on hallway row)
  const R = big ? 8.0 : 4.0;
  const R2 = R * R;
  const grid = [];
  const ceilH = [];
  const circle = opts && opts.roomShape === 'circle';
  for (let y = 0; y < H; y++) {
    grid[y] = new Array(W).fill(1);
    ceilH[y] = new Array(W).fill(STD_CEIL);
    for (let x = 0; x < W; x++) {
      const inHall = (y === hallY && x <= 1);
      let inRoom;
      if (circle) {
        const dx = x - cx, dy = y - cy;
        inRoom = x >= 2 && (dx * dx + dy * dy) <= R2;
      } else {
        inRoom = (x >= 2 && x <= roomXMax);
      }
      if (inHall || inRoom) {
        grid[y][x] = 0;
        ceilH[y][x] = inHall ? STD_CEIL : ROOM_CEIL;
      }
    }
  }
  return {
    grid, ceilH, width: W, height: H,
    spawn: { x: 0, y: hallY, dir: 1 }, // west end of hallway, facing east
    roomCx: cx, roomCy: cy,
  };
}

export function buildScene(opts) {
  const scene = new THREE.Scene();
  // Wasapok room stays pure black so the void behind the tipping set walls
  // doesn't read as a green tint through the gaps during the fall animation.
  // The chrome chamber (non-bigRoom) keeps the dark teal atmosphere.
  scene.background = new THREE.Color(opts.bigRoom ? 0x000000 : 0x040e08);
  scene.fog = new THREE.Fog(0x000000, 3, opts.fogDistance ?? 20);

  // Async loads collected here; `ready` in the returned object resolves when they all complete.
  const pendingLoads = [];

  scene.add(new THREE.AmbientLight(0x020402, 0.15));
  scene.add(new THREE.HemisphereLight(0x060e08, 0x020402, 0.08));

  // Player-follow green point light (same vibe as main hall)
  const playerLight = new THREE.PointLight(0x40ff80, 0.5, 5, 2);
  playerLight.position.set(0, 1.6, 0);
  scene.add(playerLight);

  const layout = buildLayout(opts);
  const W = layout.width * CELL;
  const H = layout.height * CELL;
  const group = new THREE.Group();
  scene.add(group);

  // ---- Materials (reuse main hall textures) ----
  const wallTex = getWallTexture('glow');
  const ceilTex = getCeilingTexture();
  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTex,
    emissive: 0xffffff,
    emissiveMap: wallTex,
    emissiveIntensity: 1.8,
    roughness: 0.45, metalness: 0.20,
  });
  const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.95, metalness: 0 });

  const glassTex = getFloorTexture('glass');
  const glassMap = glassTex.clone();
  glassMap.wrapS = glassMap.wrapT = THREE.RepeatWrapping;
  glassMap.repeat.set(layout.width, layout.height);
  glassMap.needsUpdate = true;
  const floorMat = new THREE.MeshStandardMaterial({
    map: glassMap,
    color: 0x9ab8d0,
    transparent: true, opacity: 0.18,
    roughness: 0.04, metalness: 0.05,
    depthWrite: false,
  });

  const ironMat = new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 0.6, metalness: 0.8 });

  // ---- WATER (animated, visible through glass floor) ----
  const waterMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      float hash21(vec2 p) {
        p = fract(p * vec2(234.34, 435.345));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash21(i), hash21(i + vec2(1,0)), f.x),
          mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x),
          f.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { v += vnoise(p) * a; p = p * 2.1 + vec2(1.7, 9.2); a *= 0.5; }
        return v;
      }
      void main() {
        float t = uTime;
        vec2 uv = vUv * 7.0;
        vec2 q = vec2(fbm(uv + vec2(t*0.09, t*0.07)), fbm(uv + vec2(t*0.11, t*0.06) + 5.2));
        float n = fbm(uv + 2.2 * q + vec2(t*0.04, -t*0.05));
        float w1 = sin(uv.x * 2.8 + t * 1.0 + n * 5.0) * 0.5 + 0.5;
        float w2 = sin(uv.y * 2.2 - t * 0.75 + n * 4.0) * 0.5 + 0.5;
        float w3 = sin((uv.x - uv.y) * 2.0 + t * 1.3 + q.x * 4.0) * 0.5 + 0.5;
        float wave = n * 0.45 + w1 * 0.22 + w2 * 0.20 + w3 * 0.13;
        ${opts.floorOrange ? `
        vec3 deep  = vec3(0.28, 0.08, 0.02);
        vec3 mid   = vec3(0.55, 0.20, 0.04);
        vec3 crest = vec3(0.80, 0.40, 0.08);
        vec3 foam  = vec3(0.85, 0.62, 0.28);
        ` : `
        vec3 deep  = vec3(0.01, 0.04, 0.11);
        vec3 mid   = vec3(0.04, 0.11, 0.24);
        vec3 crest = vec3(0.13, 0.24, 0.40);
        vec3 foam  = vec3(0.30, 0.40, 0.55);
        `}
        vec3 col = mix(deep, mid,   smoothstep(0.20, 0.58, wave));
        col       = mix(col, crest, smoothstep(0.50, 0.76, wave));
        col       = mix(col, foam,  smoothstep(0.73, 0.92, wave) * 0.55);
        col += ${opts.floorOrange ? 'vec3(0.6, 0.5, 0.4)' : 'vec3(0.4, 0.5, 0.6)'} * pow(max(0.0, wave - 0.85), 2.0) * 6.0;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.FrontSide,
  });
  const waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), waterMat);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.set(W/2 - CELL/2, -0.35, H/2 - CELL/2);
  waterMesh.renderOrder = -1;
  group.add(waterMesh);

  // ---- FLOOR ----
  let floor;
  if (opts.floor === 'grass') {
    // Rolling grassy hills: subdivided plane with stacked sine-wave octaves
    // to create many overlapping ridges and dips across the room.
    const g = new THREE.PlaneGeometry(W, H, 64, 56);
    g.rotateX(-Math.PI / 2);
    const pa = g.attributes.position.array;
    // Plaza-flatten mask: when a city sculpture is centred at (6*CELL, 4*CELL),
    // hills are damped to zero within an inner radius so the city's base reads.
    const PCX = 6 * CELL, PCZ = 4 * CELL, PR_IN = 2.4, PR_OUT = 3.6;
    for (let i = 0; i < pa.length; i += 3) {
      const x = pa[i], z = pa[i + 2];
      // Big rolling base waves
      let h = Math.sin(x * 0.55) * 0.22
            + Math.cos(z * 0.50) * 0.18
            + Math.sin((x + z) * 0.30) * 0.10;
      // Mid-frequency cross-hatched hills
      h += Math.sin(x * 1.10 + z * 0.7) * 0.10
         + Math.cos(z * 1.25 - x * 0.4) * 0.08;
      // Small bumps and dips to break up the surface
      h += Math.sin(x * 2.30 + z * 1.9) * 0.05
         + Math.cos((x - z) * 2.05) * 0.04;
      if (opts.eskleocity) {
        const dxC = x - PCX, dzC = z - PCZ;
        const d = Math.sqrt(dxC * dxC + dzC * dzC);
        const k = Math.max(0, Math.min(1, (d - PR_IN) / (PR_OUT - PR_IN)));
        h *= k * k * (3 - 2 * k); // smoothstep ramp; flat at d<PR_IN, full at d>PR_OUT
      }
      pa[i + 1] = h;
    }
    g.computeVertexNormals();
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0xd9b87a, roughness: 0.95, metalness: 0,
    });
    floor = new THREE.Mesh(g, grassMat);
    floor.position.set(W/2 - CELL/2, 0, H/2 - CELL/2);
  } else {
    floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W/2 - CELL/2, 0, H/2 - CELL/2);
    floor.renderOrder = 1;
  }
  group.add(floor);

  // ---- CEILING (instanced, per-cell flipped plane) ----
  const ceilGeom = new THREE.PlaneGeometry(CELL, CELL);
  const ceilBacking = new THREE.MeshStandardMaterial({ color: 0x070b08, roughness: 1, metalness: 0 });
  // When a cyber dome is requested, exclude cells under the dome footprint so
  // the curved dome geometry shows through instead of a flat lid.
  const DOME_CX = 6, DOME_CY = 4, DOME_TILE_R = 3.4;
  const cellInDome = (x, y) => Math.hypot(x - DOME_CX, y - DOME_CY) <= DOME_TILE_R;
  const floorCells = [];
  for (let y = 0; y < layout.height; y++) for (let x = 0; x < layout.width; x++) {
    if (layout.grid[y][x] !== 0) continue;
    if (opts.cyberDome && cellInDome(x, y)) continue;
    floorCells.push({ x, y, ceilH: layout.ceilH[y][x] });
  }
  const ceilInst = new THREE.InstancedMesh(ceilGeom, ceilBacking, floorCells.length);
  const m4 = new THREE.Matrix4(), v3 = new THREE.Vector3();
  const q = new THREE.Quaternion(), sc = new THREE.Vector3(1,1,1);
  const flipEuler = new THREE.Euler(Math.PI/2, 0, 0);
  floorCells.forEach((c, i) => {
    v3.set(c.x * CELL, c.ceilH, c.y * CELL);
    q.setFromEuler(flipEuler);
    m4.compose(v3, q, sc);
    ceilInst.setMatrixAt(i, m4);
  });
  ceilInst.instanceMatrix.needsUpdate = true;
  group.add(ceilInst);

  // ---- GREY CYBERNETIC DOME (replaces the flat lid over the circular room) ----
  if (opts.cyberDome) {
    const domeCX = DOME_CX * CELL, domeCZ = DOME_CY * CELL;
    const domeR = 6.4;
    const domeBaseY = ROOM_CEIL - 0.05;
    const domeGeom = new THREE.SphereGeometry(domeR, 48, 18, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMat = new THREE.MeshStandardMaterial({
      color: 0x556567, metalness: 0.35, roughness: 0.62, side: THREE.BackSide,
    });
    const dome = new THREE.Mesh(domeGeom, domeMat);
    dome.position.set(domeCX, domeBaseY, domeCZ);
    group.add(dome);
    // Panel seams — wireframe shell slightly inside the dome.
    const seamGeom = new THREE.SphereGeometry(domeR - 0.02, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const seamMat = new THREE.MeshBasicMaterial({ color: 0x2c3036, wireframe: true, transparent: true, opacity: 0.7 });
    const seams = new THREE.Mesh(seamGeom, seamMat);
    seams.position.copy(dome.position);
    group.add(seams);
    // Latitude accent rings — thin emissive cyan torii.
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xe8a85a, transparent: true, opacity: 0.7, toneMapped: false,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const _ringLow = new THREE.Color(0xe8a85a);
    const _ringHigh = new THREE.Color(0xffc070);
    const _ringT0 = performance.now();
    // Permanent fog-light blinkers in deep navy (#042B98) sprinkled on the dome.
    const deepCv = document.createElement('canvas');
    deepCv.width = 32; deepCv.height = 32;
    const dcx = deepCv.getContext('2d');
    const dHalo = dcx.createRadialGradient(16, 16, 3, 16, 16, 14);
    dHalo.addColorStop(0.0, 'rgba(40,90,220,0.8)');
    dHalo.addColorStop(1.0, 'rgba(4,43,152,0)');
    dcx.fillStyle = dHalo; dcx.fillRect(0, 0, 32, 32);
    dcx.fillStyle = 'rgba(80,140,255,1)';
    dcx.beginPath(); dcx.arc(16, 16, 2.6, 0, Math.PI * 2); dcx.fill();
    const deepTex = new THREE.CanvasTexture(deepCv);
    const DEEP_N = 6;
    const deepBlinks = [];
    for (let i = 0; i < DEEP_N; i++) {
      const u = Math.random();
      const phi = Math.acos(u);
      const theta = Math.random() * Math.PI * 2;
      const R = domeR - 0.045;
      const mat = new THREE.SpriteMaterial({
        map: deepTex, color: 0xffffff, transparent: true, depthWrite: false,
        toneMapped: false, opacity: 0,
        blending: THREE.AdditiveBlending,
      });
      const sp = new THREE.Sprite(mat);
      sp.scale.setScalar(0.13 + Math.random() * 0.08);
      sp.position.set(
        domeCX + Math.sin(phi) * Math.cos(theta) * R,
        domeBaseY + Math.cos(phi) * R,
        domeCZ + Math.sin(phi) * Math.sin(theta) * R,
      );
      group.add(sp);
      deepBlinks.push({
        mat,
        period: 1.1 + Math.random() * 0.6, // ~1.1–1.7s — faster than the pale-blue blinks
        phase: Math.random() * Math.PI * 2,
      });
    }
    // One deterministic blinker on the west face of the dome, in line with the
    // player's east-facing spawn so they see it the moment they load in.
    {
      const phi = 0.5;     // ~28° from the apex
      const theta = Math.PI; // west side of the dome → closest to spawn
      const R = domeR - 0.045;
      const mat = new THREE.SpriteMaterial({
        map: deepTex, color: 0xffffff, transparent: true, depthWrite: false,
        toneMapped: false, opacity: 0,
        blending: THREE.AdditiveBlending,
      });
      const sp = new THREE.Sprite(mat);
      sp.scale.setScalar(0.18);
      sp.position.set(
        domeCX + Math.sin(phi) * Math.cos(theta) * R,
        domeBaseY + Math.cos(phi) * R,
        domeCZ + Math.sin(phi) * Math.sin(theta) * R,
      );
      group.add(sp);
      deepBlinks.push({ mat, period: 1.25, phase: Math.PI * 0.35 });
    }
    dome.onBeforeRender = () => {
      const tt = (performance.now() - _ringT0) / 1000;
      const k = 0.5 - 0.5 * Math.cos(tt * Math.PI / 2.2); // ~4.4s breath cycle
      ringMat.color.copy(_ringLow).lerp(_ringHigh, k);
      ringMat.opacity = 0.7 + 0.3 * k;
      for (const b of deepBlinks) {
        const s = Math.sin(tt * Math.PI / b.period + b.phase);
        b.mat.opacity = s * s; // sin² fog-light bell, looping
      }
      // Schwing comets blink forward along each ring — discrete jumps every
      // BEAT seconds, leaving brief afterimages at recent slot positions.
      const STEP = Math.PI * 2 / 48; // 48 slots per revolution
      const BEATS_PER_SEC = 6;       // ~6 blinks/sec
      for (const sw of schwings) {
        const beat = Math.floor(tt * BEATS_PER_SEC + sw.phase) * (sw.speed >= 0 ? 1 : -1);
        const beatFrac = (tt * BEATS_PER_SEC + sw.phase) - Math.floor(tt * BEATS_PER_SEC + sw.phase);
        const head = beat * STEP;
        const N = sw.sprites.length;
        for (let i = 0; i < N; i++) {
          const a = head - i * STEP * (sw.speed >= 0 ? 1 : -1);
          const sp = sw.sprites[i].sp;
          sp.position.set(
            domeCX + Math.cos(a) * sw.rr,
            domeBaseY + sw.yy,
            domeCZ + Math.sin(a) * sw.rr,
          );
          // Head blinks bright then fades within the beat; tail slots are
          // dimmer afterimages of recent positions.
          const fade = Math.max(0, 1 - beatFrac);
          const tailDim = Math.max(0, 1 - i / N);
          sw.sprites[i].mat.opacity = (i === 0 ? 1.8 * fade : 1.4 * fade * tailDim * tailDim);
        }
      }
    };
    // Schwing comets — one little blue light flies around each ring, with a
    // trailing tail of dimmer sprites that fades off behind it.
    const schCv = document.createElement('canvas');
    schCv.width = 64; schCv.height = 64;
    const scx = schCv.getContext('2d');
    const sg = scx.createRadialGradient(32, 32, 0, 32, 32, 30);
    sg.addColorStop(0.0, 'rgba(140,190,255,1)');
    sg.addColorStop(0.20, 'rgba(80,140,255,0.95)');
    sg.addColorStop(0.55, 'rgba(30,100,250,0.55)');
    sg.addColorStop(1.0, 'rgba(10,60,210,0)');
    scx.fillStyle = sg; scx.fillRect(0, 0, 64, 64);
    scx.fillStyle = 'rgba(100,150,255,1)';
    scx.beginPath(); scx.arc(32, 32, 4, 0, Math.PI * 2); scx.fill();
    const schTex = new THREE.CanvasTexture(schCv);
    const schwings = [];
    const ringSpeeds = [0.9, -0.75, 1.05]; // rad/s, alternating direction
    let ringIdx = 0;
    for (const lat of [0.20, 0.45, 0.72]) {
      const phi = lat * Math.PI / 2;
      const rr = Math.cos(phi) * (domeR - 0.04);
      const yy = Math.sin(phi) * (domeR - 0.04);
      const torus = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.025, 6, 96), ringMat);
      torus.rotation.x = Math.PI / 2;
      torus.position.set(domeCX, domeBaseY + yy, domeCZ);
      group.add(torus);
      // Build the head + tail sprites for this ring.
      const TAIL_N = 14;
      const sprites = [];
      for (let i = 0; i < TAIL_N; i++) {
        const mat = new THREE.SpriteMaterial({
          map: schTex, color: 0x4a8eff, transparent: true, depthWrite: false,
          toneMapped: false, blending: THREE.AdditiveBlending,
          opacity: 0,
        });
        const sp = new THREE.Sprite(mat);
        const headScale = 0.26;
        const tailFrac = i / (TAIL_N - 1);
        sp.scale.setScalar(headScale * (1 - 0.55 * tailFrac));
        sp.position.set(domeCX + rr, domeBaseY + yy, domeCZ);
        if (ringIdx === 0 && i === 0) sp.frustumCulled = false;
        group.add(sp);
        sprites.push({ sp, mat });
      }
      schwings.push({
        rr, yy,
        sprites,
        speed: ringSpeeds[ringIdx % ringSpeeds.length],
        phase: Math.random() * Math.PI * 2,
        stride: 0.07, // radians between successive tail sprites
      });
      ringIdx++;
    }
    // Apex disc — small bright cap at the dome's crown.
    const apex = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 32),
      new THREE.MeshBasicMaterial({ color: 0xd8e0e6, transparent: true, opacity: 0.7, toneMapped: false })
    );
    apex.rotation.x = Math.PI / 2;
    apex.position.set(domeCX, domeBaseY + domeR - 0.06, domeCZ);
    group.add(apex);

    // ===== R2-D2 pale-blue blinking panel lights scattered on the dome interior.
    const blinkCv = document.createElement('canvas');
    blinkCv.width = 32; blinkCv.height = 32;
    const bctx = blinkCv.getContext('2d');
    // Soft halo — neutral stone tint, falling off to transparent.
    const bg = bctx.createRadialGradient(16, 16, 3, 16, 16, 14);
    bg.addColorStop(0.0, 'rgba(140,158,176,0.45)');
    bg.addColorStop(1.0, 'rgba(140,158,176,0)');
    bctx.fillStyle = bg; bctx.fillRect(0, 0, 32, 32);
    // Solid matte centre — saturated icy stone blue grey (#74A2C6).
    bctx.fillStyle = 'rgba(116,162,198,1)';
    bctx.beginPath();
    bctx.arc(16, 16, 2.2, 0, Math.PI * 2);
    bctx.fill();
    const blinkTex = new THREE.CanvasTexture(blinkCv);
    const BLINK_N = 12;
    const blinks = [];
    for (let i = 0; i < BLINK_N; i++) {
      // Per-sprite material clone so each blink can fade its own opacity.
      const mat = new THREE.SpriteMaterial({
        map: blinkTex, color: 0xffffff, transparent: true, depthWrite: false,
        toneMapped: false, opacity: 0,
      });
      const sp = new THREE.Sprite(mat);
      sp.scale.setScalar(0.0001);
      sp.position.set(domeCX, domeBaseY, domeCZ); // placeholder until first activation
      if (i === 0) sp.frustumCulled = false;
      group.add(sp);
      blinks.push({ sprite: sp, mat, alive: false, age: 0, life: 0, scaleMax: 0.3 });
    }
    let nextBlinkIn = 0.35; // seconds until the next spawn becomes eligible
    let _blinkLast = performance.now();
    const _blinkProbe = new THREE.Vector3();
    const pickDomePoint = (cam) => {
      const R = domeR - 0.05;
      let fallback = null;
      const TRIES = 10;
      for (let i = 0; i < TRIES; i++) {
        const u = Math.random();
        const phi = Math.acos(u);
        const theta = Math.random() * Math.PI * 2;
        const x = domeCX + Math.sin(phi) * Math.cos(theta) * R;
        const y = domeBaseY + Math.cos(phi) * R;
        const z = domeCZ + Math.sin(phi) * Math.sin(theta) * R;
        if (!cam) return { x, y, z };
        _blinkProbe.set(x, y, z).project(cam);
        const inView =
          _blinkProbe.z < 1 &&
          _blinkProbe.x > -1 && _blinkProbe.x < 1 &&
          _blinkProbe.y > -1 && _blinkProbe.y < 1;
        if (inView) return { x, y, z };
        if (!fallback) fallback = { x, y, z };
      }
      return fallback;
    };
    blinks[0].sprite.onBeforeRender = (renderer, _sceneRef, cam) => {
      const now = performance.now();
      const dt = Math.min(0.08, (now - _blinkLast) / 1000); _blinkLast = now;
      // Spawn one new blink when the staggered cooldown elapses.
      nextBlinkIn -= dt;
      if (nextBlinkIn <= 0) {
        const slot = blinks.find(b => !b.alive);
        if (slot) {
          const p = pickDomePoint(cam);
          slot.sprite.position.set(p.x, p.y, p.z);
          slot.alive = true;
          slot.age = 0;
          slot.life = 1.6 + Math.random() * 1.2; // gradual fog-light bell
          slot.scaleMax = 0.085 + Math.random() * 0.09;
          slot.sprite.scale.setScalar(slot.scaleMax);
        }
        nextBlinkIn = 0.30 + Math.random() * 0.55;
      }
      // Tick all active blinks: smooth bell-curve fade — gradual on, gradual off.
      for (const b of blinks) {
        if (!b.alive) { b.mat.opacity = 0; continue; }
        b.age += dt;
        const t = b.age / b.life;
        if (t >= 1) { b.alive = false; b.mat.opacity = 0; continue; }
        const s = Math.sin(Math.PI * t);
        b.mat.opacity = s * s; // sin²(π·t): fog-light ramp up & down
      }
    };
  }

  // ---- WALLS ----
  const wallCells = [];
  for (let y = 0; y < layout.height; y++) for (let x = 0; x < layout.width; x++) {
    if (layout.grid[y][x] !== 1) continue;
    let near = false, maxH = STD_CEIL;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x+dx, ny = y+dy;
      if (nx<0||ny<0||nx>=layout.width||ny>=layout.height) continue;
      if (layout.grid[ny][nx] === 0) {
        near = true;
        if (layout.ceilH[ny][nx] > maxH) maxH = layout.ceilH[ny][nx];
      }
    }
    if (!near) continue;
    wallCells.push({ x, y, h: maxH });
  }
  // (west-end seal removed — the portal-door faux hallway now occupies that gap)
  const wallGeom = new THREE.BoxGeometry(CELL, 1, CELL);
  const walls = new THREE.InstancedMesh(wallGeom, wallMat, wallCells.length);
  const idQ = new THREE.Quaternion();
  wallCells.forEach((c, i) => {
    v3.set(c.x * CELL, c.h / 2, c.y * CELL);
    sc.set(1, c.h, 1);
    m4.compose(v3, idQ, sc);
    walls.setMatrixAt(i, m4);
  });
  sc.set(1, 1, 1);
  walls.instanceMatrix.needsUpdate = true;
  group.add(walls);

  // ===== SET-WALLS (wasapok room): theatrical "wild walls" on the N/E/S edges
  // that hinge at their OUTER-bottom edge and tip OUTWARD like a stage set
  // collapsing. Each wall lives inside a hinge Group whose origin sits on the
  // outer-bottom-edge line; rotating the group pivots the wall cleanly. The
  // post-shatter pyro-circle (main.js) drives the rotation in 3 increments.
  let setWalls = null;
  if (opts && opts.bigRoom) {
    const THK = 0.2;
    const ROOM_H = ROOM_CEIL;
    const xMin = 3, xMax = 41, zMin = -1, zMax = 37;
    const lenX = xMax - xMin;    // 38 — N/S walls run along x
    const lenZ = zMax - zMin;    // 38 — E wall runs along z
    const midX = (xMin + xMax) / 2;
    const midZ = (zMin + zMax) / 2;
    const mkHinged = (boxGeo, mat, hingeX, hingeZ, meshOff) => {
      const hinge = new THREE.Group();
      hinge.position.set(hingeX, 0, hingeZ);
      const mesh = new THREE.Mesh(boxGeo, mat);
      mesh.position.set(meshOff.x, meshOff.y, meshOff.z);
      hinge.add(mesh);
      group.add(hinge);
      return hinge;
    };
    // Set-walls use the ocean+sky shader (matching the visual of the planes
    // they replace) with their OWN uTime uniform so main.js can freeze them
    // independently of the floor water on the first button press.
    const setWallUniform = { value: 0 };
    const setWallMat = new THREE.ShaderMaterial({
      uniforms: { uTime: setWallUniform },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        float h21(vec2 p){ p = fract(p*vec2(234.34,435.345)); p += dot(p,p+34.23); return fract(p.x*p.y); }
        float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
        float fbm(vec2 p){ float v=0., a=0.5; for(int i=0;i<4;i++){ v+=vn(p)*a; p=p*2.1; a*=0.5; } return v; }
        void main() {
          float H = 0.30;
          vec3 sky = mix(vec3(0.55,0.66,0.78), vec3(0.32,0.46,0.66), smoothstep(H, 1.0, vUv.y));
          float depth = max(0.001, H - vUv.y);
          vec2 suv = vec2(vUv.x * 5.0, depth * 10.0 + 1.0/depth * 0.04);
          float w = fbm(suv + vec2(uTime*0.15, uTime*0.08));
          vec3 deep  = vec3(0.02,0.07,0.16);
          vec3 mid   = vec3(0.06,0.16,0.30);
          vec3 crest = vec3(0.20,0.32,0.46);
          vec3 sea = mix(deep, mid, smoothstep(0.25, 0.60, w));
          sea = mix(sea, crest, smoothstep(0.60, 0.85, w) * 0.7);
          vec3 col = vUv.y > H ? sky : sea;
          col = mix(col, vec3(0.55,0.62,0.72), exp(-abs(vUv.y - H) * 35.0) * 0.5);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.DoubleSide,
    });
    // East wall: hinge at xMax+THK (outer bottom, +x side). Wall extends in -x.
    const east = mkHinged(
      new THREE.BoxGeometry(THK, ROOM_H, lenZ), setWallMat,
      xMax + THK, midZ, { x: -THK / 2, y: ROOM_H / 2, z: 0 },
    );
    // North wall: hinge at zMin-THK (outer bottom, -z side). Wall extends in +z.
    const north = mkHinged(
      new THREE.BoxGeometry(lenX, ROOM_H, THK), setWallMat,
      midX, zMin - THK, { x: 0, y: ROOM_H / 2, z: THK / 2 },
    );
    // South wall: hinge at zMax+THK (outer bottom, +z side). Wall extends in -z.
    const south = mkHinged(
      new THREE.BoxGeometry(lenX, ROOM_H, THK), setWallMat,
      midX, zMax + THK, { x: 0, y: ROOM_H / 2, z: -THK / 2 },
    );
    setWalls = {
      east:  { hinge: east,  axis: 'z', sign: -1, lenAlong: lenZ, edgeAxis: 'z' },
      north: { hinge: north, axis: 'x', sign: -1, lenAlong: lenX, edgeAxis: 'x' },
      south: { hinge: south, axis: 'x', sign:  1, lenAlong: lenX, edgeAxis: 'x' },
      height: ROOM_H, THK,
      uniform: setWallUniform,
    };
  }

  // ===== SHELF WALLS — the "true" walls revealed after the set walls fall flat.
  // Three tall maple-colored walls of square shelf compartments stretching far
  // up past the fog. Hidden until the third button press (main.js).
  let shelfWalls = null;
  if (opts && opts.bigRoom) {
    const SHELF_H = 80;       // very tall — fog handles the upper fade
    const OFFSET = 13.8;      // 4 tiles (8m) back from where the set walls land flat (~5.6m)
    const xMin = 3, xMax = 41, zMin = -1, zMax = 37;
    const midZ = (zMin + zMax) / 2;
    // East wall spans corner-to-corner; north/south extend east to meet it at the NE + SE corners.
    const eastLen   = (zMax + OFFSET) - (zMin - OFFSET);
    const nsLen     = (xMax + OFFSET) - xMin;
    const nsCenterX = (xMin + (xMax + OFFSET)) / 2;

    // Procedural maple bookshelf tile: one big empty cubby with thick
    // horizontal shelf planks above + below, thinner vertical dividers, and a
    // deep shadowed interior lit by a soft glow at the front edge of the
    // lower plank (as if light catches the wood where the books would sit).
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    // Maple base (the wood color of the planks/dividers)
    ctx.fillStyle = '#d2a574';
    ctx.fillRect(0, 0, 256, 256);
    // Subtle wood grain streaks
    for (let i = 0; i < 28; i++) {
      const gy = Math.random() * 256;
      const rr = 125 + (Math.random() * 35 | 0);
      const gg =  82 + (Math.random() * 22 | 0);
      const bb =  42 + (Math.random() * 22 | 0);
      ctx.strokeStyle = `rgba(${rr},${gg},${bb},0.22)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(256, gy + (Math.random() - 0.5) * 5);
      ctx.stroke();
    }
    // Cubby cutout: thick top + bottom planks, thinner side dividers.
    const PLANK = 22;   // top/bottom shelf plank thickness
    const SIDE  = 8;    // vertical side divider thickness
    const top = PLANK, bottom = 256 - PLANK;
    const left = SIDE, right = 256 - SIDE;
    // Dark interior fill
    ctx.fillStyle = '#0e0703';
    ctx.fillRect(left, top, right - left, bottom - top);
    // Depth gradient: deepest shadow at the top (under the plank above),
    // gently lifting toward the bottom (where ambient light catches the shelf).
    const grad = ctx.createLinearGradient(0, top, 0, bottom);
    grad.addColorStop(0.00, 'rgba(0,0,0,0.85)');
    grad.addColorStop(0.45, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1.00, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = grad;
    ctx.fillRect(left, top, right - left, bottom - top);
    // Under-plank ceiling shadow (the underside of the shelf above is darkest)
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(left, top, right - left, 4);
    // Front-edge highlight on the bottom plank — the lit top surface of the
    // shelf below, where the books would sit.
    ctx.fillStyle = 'rgba(255,232,188,0.55)';
    ctx.fillRect(0, bottom - 1, 256, 3);
    ctx.fillStyle = 'rgba(255,232,188,0.25)';
    ctx.fillRect(0, bottom + 2, 256, 2);
    // Top-of-plank highlight strip (the top edge of the top plank, lit)
    ctx.fillStyle = 'rgba(255,232,188,0.35)';
    ctx.fillRect(0, 0, 256, 2);
    // Bottom-of-plank deep shadow under the bottom plank
    ctx.fillStyle = 'rgba(30,15,5,0.65)';
    ctx.fillRect(0, 253, 256, 3);
    // Inner-edge highlight + shadow on the side dividers (a hint of depth)
    ctx.fillStyle = 'rgba(255,232,188,0.18)';
    ctx.fillRect(left, top, 1, bottom - top);
    ctx.fillStyle = 'rgba(20,10,4,0.5)';
    ctx.fillRect(right - 1, top, 1, bottom - top);

    const shelfTex = new THREE.CanvasTexture(c);
    shelfTex.wrapS = shelfTex.wrapT = THREE.RepeatWrapping;
    shelfTex.magFilter = THREE.NearestFilter;
    shelfTex.needsUpdate = true;

    // Height map for relief/parallax: wood (planks + dividers) = top of surface
    // (white = 1), cubby interior = bottom (black = 0). The shader marches the
    // sampled UV into this height to fake actual 3D depth on a flat plane.
    const hc = document.createElement('canvas');
    hc.width = 256; hc.height = 256;
    const hctx = hc.getContext('2d');
    hctx.imageSmoothingEnabled = false;
    hctx.fillStyle = '#ffffff';
    hctx.fillRect(0, 0, 256, 256);
    hctx.fillStyle = '#000000';
    hctx.fillRect(left, top, right - left, bottom - top);
    const shelfHeightTex = new THREE.CanvasTexture(hc);
    shelfHeightTex.wrapS = shelfHeightTex.wrapT = THREE.RepeatWrapping;
    shelfHeightTex.minFilter = THREE.LinearFilter;
    shelfHeightTex.magFilter = THREE.LinearFilter;
    shelfHeightTex.needsUpdate = true;

    // Relief-mapping shader: view direction is transformed to the plane's local
    // (tangent) space, then we march along it. Where the height map is dark
    // (cubby interior), the sample point shifts further "into" the wall — the
    // painted shading on the color map then sells the depth as you walk past.
    // Fog chunks below pull fogColor/fogNear/fogFar from scene.fog at render
    // time (because `fog: true` is set on the ShaderMaterial). Without these
    // includes, the bookshelves would ignore scene.fog and render crystal-clear
    // at any distance — even when everything around them fades into the haze.
    const shelfShaderVS = `
      #include <fog_pars_vertex>
      varying vec2 vUv;
      varying vec3 vViewLocal;
      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vec3 viewDirWorld = normalize(cameraPosition - worldPos.xyz);
        // modelMatrix here is pure rotation+translation (no scale on these walls),
        // so transpose of its 3x3 = inverse → transforms world dirs into local.
        mat3 worldToLocal = transpose(mat3(modelMatrix));
        vViewLocal = worldToLocal * viewDirWorld;
        vec4 mvPosition = viewMatrix * worldPos;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `;
    const shelfShaderFS = `
      precision highp float;
      #include <fog_pars_fragment>
      uniform sampler2D uMap;
      uniform sampler2D uHeight;
      uniform vec2 uRepeat;
      uniform float uDepth;
      varying vec2 vUv;
      varying vec3 vViewLocal;
      void main() {
        vec3 V = normalize(vViewLocal);
        vec2 baseUv = vUv * uRepeat;
        const int STEPS = 28;
        float dLayer = 1.0 / float(STEPS);
        // Cap V.z to avoid runaway shifts at grazing angles.
        vec2 dUv = -V.xy / max(V.z, 0.15) * uDepth / float(STEPS);
        vec2 curUv = baseUv;
        float layerDepth = 0.0;
        float surfaceDepth = 1.0 - texture2D(uHeight, curUv).r;
        for (int i = 0; i < STEPS; i++) {
          if (layerDepth >= surfaceDepth) break;
          curUv += dUv;
          layerDepth += dLayer;
          surfaceDepth = 1.0 - texture2D(uHeight, curUv).r;
        }
        vec4 color = texture2D(uMap, curUv);
        // Tunnel darkening: deeper march = closer to black, so the cubbies
        // read as infinitely deep tunnels rather than shallow boxes. The
        // painted shading on uMap still tints the near walls of the tunnel.
        float tunnel = exp(-2.6 * layerDepth);   // 1.0 at the surface, ~0.07 at full depth
        gl_FragColor = vec4(color.rgb * tunnel, 1.0);
        #include <fog_fragment>
      }
    `;

    // Each wall gets its own ShaderMaterial so uRepeat (length-dependent) can
    // differ. Textures are shared via uniforms — repeat is handled in-shader.
    // `fog: true` + merged UniformsLib.fog lets the renderer push scene.fog
    // values into the shader each frame.
    const makeShelfWall = (len) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
          uMap:    { value: shelfTex },
          uHeight: { value: shelfHeightTex },
          uRepeat: { value: new THREE.Vector2(len / 2, SHELF_H / 2) },
          uDepth:  { value: 0.9 },    // deep tunnels — ~1.8m apparent recession before tunnel-fade
        },
        vertexShader: shelfShaderVS,
        fragmentShader: shelfShaderFS,
        side: THREE.FrontSide,
        fog: true,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, SHELF_H), mat);
      mesh.visible = false;
      return mesh;
    };

    const east = makeShelfWall(eastLen);
    east.position.set(xMax + OFFSET, SHELF_H / 2, midZ);
    east.rotation.y = -Math.PI / 2;     // normal → -x (toward room)
    group.add(east);

    const north = makeShelfWall(nsLen);
    north.position.set(nsCenterX, SHELF_H / 2, zMin - OFFSET);
    // PlaneGeometry default normal is +z → already points toward room.
    group.add(north);

    const south = makeShelfWall(nsLen);
    south.position.set(nsCenterX, SHELF_H / 2, zMax + OFFSET);
    south.rotation.y = Math.PI;         // normal → -z (toward room)
    group.add(south);

    shelfWalls = { east, north, south };

    // High ceiling that meets the top of the bookshelf walls. The original
    // low ceiling (at ROOM_CEIL = 5.6m) gets hidden when this one is revealed.
    const HC_W = (xMax + OFFSET) - (-1);      // -1 → 46.8: full bookshelf-enclosed span
    const HC_D = (zMax + OFFSET) - (zMin - OFFSET);
    const ceilTexHi = getCeilingTexture().clone();
    ceilTexHi.wrapS = ceilTexHi.wrapT = THREE.RepeatWrapping;
    ceilTexHi.repeat.set(HC_W / 2, HC_D / 2);  // 2m per ceiling tile
    ceilTexHi.needsUpdate = true;
    const highCeilMat = new THREE.MeshStandardMaterial({
      map: ceilTexHi,
      emissive: 0xffffff,
      emissiveMap: ceilTexHi,
      emissiveIntensity: 0.4,
      roughness: 0.95,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const highCeiling = new THREE.Mesh(new THREE.PlaneGeometry(HC_W, HC_D), highCeilMat);
    highCeiling.position.set((-1 + xMax + OFFSET) / 2, SHELF_H, ((zMin - OFFSET) + (zMax + OFFSET)) / 2);
    highCeiling.rotation.x = Math.PI / 2;       // face -y (downward)
    highCeiling.visible = false;
    group.add(highCeiling);

    shelfWalls.highCeiling = highCeiling;
  }

  // ===== OCEAN VIEW WALLS — animated water/sky planes facing inward into the room.
  // Shares uTime with the floor water shader so animation is free.
  {
    const oceanMat = new THREE.ShaderMaterial({
      uniforms: { uTime: waterMat.uniforms.uTime },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        float h21(vec2 p){ p = fract(p*vec2(234.34,435.345)); p += dot(p,p+34.23); return fract(p.x*p.y); }
        float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
        float fbm(vec2 p){ float v=0., a=0.5; for(int i=0;i<4;i++){ v+=vn(p)*a; p=p*2.1; a*=0.5; } return v; }
        void main() {
          float H = 0.30;
          vec3 sky = mix(vec3(0.55,0.66,0.78), vec3(0.32,0.46,0.66), smoothstep(H, 1.0, vUv.y));
          float depth = max(0.001, H - vUv.y);
          vec2 suv = vec2(vUv.x * 5.0, depth * 10.0 + 1.0/depth * 0.04);
          float w = fbm(suv + vec2(uTime*0.15, uTime*0.08));
          vec3 deep  = vec3(0.02,0.07,0.16);
          vec3 mid   = vec3(0.06,0.16,0.30);
          vec3 crest = vec3(0.20,0.32,0.46);
          vec3 sea = mix(deep, mid, smoothstep(0.25, 0.60, w));
          sea = mix(sea, crest, smoothstep(0.60, 0.85, w) * 0.7);
          vec3 col = vUv.y > H ? sky : sea;
          col = mix(col, vec3(0.55,0.62,0.72), exp(-abs(vUv.y - H) * 35.0) * 0.5);
          gl_FragColor = vec4(col, 0.94);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    if (opts.roomShape === 'circle') {
      // Curved room — drop an ocean plane on every wall face that borders a
      // room floor tile, skipping the wall cells that flank the west hallway.
      const isNextToHallway = (wx, wy) => {
        // Treat (0,4), (1,4) hallway tiles plus (2,4) room-entrance tile as
        // "corridor", so the wall cells flanking the doorway stay non-ocean.
        for (const [ddx, ddy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
          const nx = wx + ddx, ny = wy + ddy;
          if (ny === 4 && nx <= 2) return true;
        }
        return false;
      };
      const planeGeom = new THREE.PlaneGeometry(CELL, ROOM_CEIL);
      for (let y = 0; y < layout.height; y++) for (let x = 0; x < layout.width; x++) {
        if (layout.grid[y][x] !== 1) continue;
        if (isNextToHallway(x, y)) continue;
        for (const [dx, dy, yaw] of [
          [ 0, -1, 0],          // floor north of wall → face -z
          [ 1,  0, Math.PI/2],  // floor east of wall  → face +x
          [ 0,  1, Math.PI],    // floor south of wall → face +z
          [-1,  0, -Math.PI/2], // floor west of wall  → face -x
        ]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= layout.width || ny >= layout.height) continue;
          if (layout.grid[ny][nx] !== 0) continue;
          const pl = new THREE.Mesh(planeGeom, oceanMat);
          pl.position.set(
            x * CELL + dx * (CELL/2 + 0.01),
            ROOM_CEIL / 2,
            y * CELL + dy * (CELL/2 + 0.01),
          );
          pl.rotation.y = yaw;
          group.add(pl);
        }
      }
    } else if (!(opts && opts.bigRoom)) {
      // Square room — three large planes along the player's N/E/W (world E/N/S).
      // Skipped in bigRoom (wasapok room) since the tipping set-walls live at
      // the same perimeter positions and would visually duplicate.
      const roomXMax = layout.width - 1;
      const ROOM_W_M = (roomXMax - 2 + 1) * CELL;
      const ROOM_D_M = layout.height * CELL;
      const cx = layout.roomCx * CELL;
      const cz = ((layout.height - 1) / 2) * CELL;
      const yMid = ROOM_CEIL / 2;
      const wE = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_D_M, ROOM_CEIL), oceanMat);
      wE.position.set(roomXMax * CELL + CELL/2 - 0.01, yMid, cz);
      wE.rotation.y = -Math.PI / 2;
      group.add(wE);
      const wN = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W_M, ROOM_CEIL), oceanMat);
      wN.position.set(cx, yMid, -CELL/2 + 0.01);
      group.add(wN);
      const wS = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W_M, ROOM_CEIL), oceanMat);
      wS.position.set(cx, yMid, (layout.height - 1) * CELL + CELL/2 - 0.01);
      wS.rotation.y = Math.PI;
      group.add(wS);
    }
  }

  // ===== TORCHES (neon-green orb sconces) =====
  const torchLights = [];
  function addTorch(tx, ty, wall) {
    const wx = tx * CELL, wz = ty * CELL;
    const nx = [0,1,0,-1][wall], nz = [-1,0,1,0][wall];
    const ox = nx * (CELL/2 - 0.02), oz = nz * (CELL/2 - 0.02);

    const grp = new THREE.Group();
    grp.position.set(wx + ox, 1.95, wz + oz);
    grp.rotation.y = [0, -Math.PI/2, Math.PI, Math.PI/2][wall];

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.022, 8, 16), ironMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0, 0.06);
    grp.add(ring);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.14), ironMat);
    arm.position.set(0, 0, 0.03);
    grp.add(arm);

    const orbMat = new THREE.MeshStandardMaterial({
      color: 0x20ff60, emissive: 0x40ff80, emissiveIntensity: 4.5,
      roughness: 0.08, metalness: 0,
    });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), orbMat);
    orb.position.set(0, 0, 0.17);
    grp.add(orb);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x40ff80, transparent: true, opacity: 0.13, depthWrite: false,
    });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), haloMat);
    halo.position.set(0, 0, 0.17);
    grp.add(halo);

    group.add(grp);

    const pl = new THREE.PointLight(0x40ff80, 1.8, 7, 1.7);
    pl.position.set(wx + nx * 0.45, 2.2, wz + nz * 0.45);
    group.add(pl);
    torchLights.push({ light: pl, baseIntensity: 1.8, orb, halo, kind: 'torch' });
  }

  // 4 corner torches in the 9x9 room (mounted on outer N/S walls).
  // Skipped in bigRoom since the y=0/y=8 positions are no longer on the walls.
  if (!(opts && opts.bigRoom)) {
    addTorch(3,  0, 0);   // NW, north wall
    addTorch(9,  0, 0);   // NE, north wall
    addTorch(3,  8, 2);   // SW, south wall
    addTorch(9,  8, 2);   // SE, south wall
  }
  // Two torches in the entry hallway (one on each side)
  {
    const hy = (opts && opts.bigRoom) ? 9 : 4;
    addTorch(1, hy, 0);   // hallway north wall
    addTorch(1, hy, 2);   // hallway south wall
  }

  // ===== CHANDELIER (matches main hub style — green orbs on iron ring) =====
  function addChandelier(wx, wz, ceilH) {
    const ch = new THREE.Group();
    ch.position.set(wx, ceilH, wz);
    const chainLen = ceilH > 4.5 ? 1.4 : 0.5;
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, chainLen, 6), ironMat);
    chain.position.y = -chainLen / 2;
    ch.add(chain);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.04, 8, 24), ironMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -chainLen - 0.05;
    ch.add(ring);
    const smallOrbMat = new THREE.MeshStandardMaterial({
      color: 0x20ff60, emissive: 0x40ff80, emissiveIntensity: 4.5,
      roughness: 0.1, metalness: 0,
    });
    const orbCount = 8;
    for (let i = 0; i < orbCount; i++) {
      const a = (i / orbCount) * Math.PI * 2;
      const cx = Math.cos(a) * 0.42, cz = Math.sin(a) * 0.42;
      const smallOrb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), smallOrbMat);
      smallOrb.position.set(cx, -chainLen + 0.08, cz);
      ch.add(smallOrb);
      const sh = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0x40ff80, transparent: true, opacity: 0.10, depthWrite: false }),
      );
      sh.position.set(cx, -chainLen + 0.08, cz);
      ch.add(sh);
    }
    const intensity = ceilH > 4.5 ? 2.0 : 1.4;
    const range = ceilH > 4.5 ? 11 : 8;
    const pl = new THREE.PointLight(0x40ff80, intensity, range, 1.7);
    pl.position.y = -chainLen + 0.05;
    ch.add(pl);
    group.add(ch);
    torchLights.push({ light: pl, baseIntensity: intensity, kind: 'chandelier' });
  }
  // Room center (x=6, y=4) — tall ceiling
  const chandelier = { obj: null };
  if (opts.chandelier === 'eskleohell') {
    // Visual replacement: hang the eskleohell GLB from the ceiling instead of
    // building the procedural orb-ring chandelier. The GLB owns its own
    // materials/textures; we only scale + position it.
    const ANCHOR_X = 6 * CELL, ANCHOR_Z = 4 * CELL;
    pendingLoads.push(new Promise((resolve) => {
      new GLTFLoader().load('hallway4/eskleohell-01.glb', (gltf) => {
        const obj = gltf.scene;
        // Give the dark meshes some volume: clone each as a slightly inflated
        // back-faced shell so the silhouette stays visible when rotating edge-on.
        // Also enable DoubleSide on every material so thin polys don't vanish.
        const shells = [];
        const sparkleMats = [];
        obj.traverse(o => {
          if (!o.isMesh || !o.material) return;
          o.material.side = THREE.DoubleSide;
          const c = o.material.color;
          const lum = c ? c.r * 0.299 + c.g * 0.587 + c.b * 0.114 : 1;
          if (lum < 0.40) {
            // Tint dark meshes obsidian-violet; crank metalness + animate
            // the emissive to twinkle in a brighter purple.
            o.material = o.material.clone();
            o.material.color.setHex(0x2a1638);
            o.material.metalness = 1.0;
            o.material.roughness = 0.12;
            if ('emissive' in o.material) {
              o.material.emissive = new THREE.Color(0xc060ff);
              o.material.emissiveIntensity = 0.4;
              sparkleMats.push(o.material);
            }
            const sh = o.clone();
            sh.material = o.material.clone();
            sh.material.side = THREE.BackSide;
            sh.scale.multiplyScalar(1.22);
            if ('emissive' in sh.material) sparkleMats.push(sh.material);
            shells.push([o.parent, sh]);
          }
        });
        shells.forEach(([p, sh]) => p.add(sh));
        // Twinkle driver — pick any mesh in the GLB and tick all sparkle materials.
        if (sparkleMats.length) {
          let twDr = null;
          obj.traverse(o => { if (!twDr && o.isMesh) twDr = o; });
          if (twDr) {
            twDr.frustumCulled = false;
            const _twT0 = performance.now();
            twDr.onBeforeRender = () => {
              const t = (performance.now() - _twT0) / 1000;
              for (let i = 0; i < sparkleMats.length; i++) {
                const f = 0.5 + 0.5 * Math.sin(t * 7.0 + i * 1.7) * Math.sin(t * 11.0 + i * 0.9);
                const flash = Math.pow(Math.max(0, Math.sin(t * 13 + i * 2.1)), 12) * 1.5;
                sparkleMats[i].emissiveIntensity = 0.25 + f * 2.0 + flash;
              }
            };
          }
        }
        const bbox = new THREE.Box3().setFromObject(obj);
        const size = bbox.getSize(new THREE.Vector3());
        const maxD = Math.max(size.x, size.y, size.z);
        const TARGET = opts.cyberDome ? 6.0 : 3.0; // epic scale inside the dome
        const s = maxD > 0 ? TARGET / maxD : 1;
        obj.scale.setScalar(s);
        const sb = new THREE.Box3().setFromObject(obj);
        const sc = sb.getCenter(new THREE.Vector3());
        const ss = sb.getSize(new THREE.Vector3());
        // Pivot wraps both GLB and corkscrew so they rotate together in place.
        const pivot = new THREE.Group();
        // Under a dome, push the chandelier up so its top sits ~3m into the
        // dome (epic hang); otherwise tuck it against the flat ceiling.
        const pivotY = opts.cyberDome
          ? (ROOM_CEIL + 3.0) - ss.y / 2
          : ROOM_CEIL - 0.08 - ss.y / 2;
        pivot.position.set(ANCHOR_X, pivotY, ANCHOR_Z);
        obj.position.set(-sc.x, -sc.y, -sc.z);
        pivot.add(obj);

        // Star-shaped blinking sparkles — billboarded Sprites with a canvas
        // cross-ray texture. Parented to the pivot so they spin with the
        // chandelier.
        const starCv = document.createElement('canvas');
        starCv.width = 64; starCv.height = 64;
        const sCtx = starCv.getContext('2d');
        const cg = sCtx.createRadialGradient(32, 32, 0, 32, 32, 28);
        cg.addColorStop(0, 'rgba(255,255,255,1)');
        cg.addColorStop(0.2, 'rgba(255,255,255,0.5)');
        cg.addColorStop(1, 'rgba(255,255,255,0)');
        sCtx.fillStyle = cg; sCtx.fillRect(0, 0, 64, 64);
        const hg = sCtx.createLinearGradient(0, 32, 64, 32);
        hg.addColorStop(0, 'rgba(255,255,255,0)');
        hg.addColorStop(0.5, 'rgba(255,255,255,1)');
        hg.addColorStop(1, 'rgba(255,255,255,0)');
        sCtx.fillStyle = hg; sCtx.fillRect(0, 30, 64, 4);
        const vg = sCtx.createLinearGradient(32, 0, 32, 64);
        vg.addColorStop(0, 'rgba(255,255,255,0)');
        vg.addColorStop(0.5, 'rgba(255,255,255,1)');
        vg.addColorStop(1, 'rgba(255,255,255,0)');
        sCtx.fillStyle = vg; sCtx.fillRect(30, 0, 4, 64);
        const starTex = new THREE.CanvasTexture(starCv);
        const spkMat = new THREE.SpriteMaterial({
          map: starTex, color: 0xffffff, transparent: true, depthWrite: false,
          blending: THREE.AdditiveBlending, toneMapped: false,
        });
        const SPK_N = 22;
        const spkS = [];
        for (let i = 0; i < SPK_N; i++) {
          const sp = new THREE.Sprite(spkMat);
          sp.position.set(
            (Math.random() - 0.5) * ss.x * 0.85,
            (Math.random() - 0.5) * ss.y * 0.85,
            (Math.random() - 0.5) * ss.z * 0.85,
          );
          sp.scale.setScalar(0.001);
          if (i === 0) sp.frustumCulled = false;
          pivot.add(sp);
          spkS.push({ sprite: sp, phase: Math.random() * 6.28, freq: 1.6 + Math.random() * 2.4 });
        }
        let _spkT0 = performance.now();
        spkS[0].sprite.onBeforeRender = () => {
          const tt = (performance.now() - _spkT0) / 1000;
          for (let i = 0; i < SPK_N; i++) {
            const p = spkS[i];
            const blink = Math.pow(Math.max(0, Math.sin(tt * p.freq + p.phase)), 16);
            p.sprite.scale.setScalar(Math.max(0.0005, blink * 0.42));
          }
        };

        // ---- Rainbow corkscrew at the middle of the darker geometry ----
        const corkH = ss.y * 0.4225; // 65% of the prior 0.65
        const corkR = Math.max(0.06, Math.min(ss.x, ss.z) * 0.18);
        const turns = 12;
        const segs  = 240;
        const pts = [];
        for (let i = 0; i <= segs; i++) {
          const tt = i / segs;
          const a = tt * turns * Math.PI * 2;
          pts.push(new THREE.Vector3(Math.cos(a) * corkR, (tt - 0.5) * corkH, Math.sin(a) * corkR));
        }
        const corkCurve = new THREE.CatmullRomCurve3(pts);
        const corkGeom  = new THREE.TubeGeometry(corkCurve, segs, 0.085, 10, false);
        // Horizontal rainbow texture that tiles along the spiral and scrolls
        // "downward" along the path over time.
        const rcv = document.createElement('canvas');
        rcv.width = 256; rcv.height = 1;
        const rctx = rcv.getContext('2d');
        for (let i = 0; i < 256; i++) {
          const c = new THREE.Color().setHSL(i / 256, 1.0, 0.55);
          rctx.fillStyle = `rgb(${(c.r*255)|0},${(c.g*255)|0},${(c.b*255)|0})`;
          rctx.fillRect(i, 0, 1, 1);
        }
        const rtex = new THREE.CanvasTexture(rcv);
        rtex.wrapS = THREE.RepeatWrapping;
        rtex.repeat.x = 60;
        const corkMat = new THREE.MeshBasicMaterial({ map: rtex, toneMapped: false });
        const cork = new THREE.Mesh(corkGeom, corkMat);
        const corkT0 = performance.now() / 1000;
        cork.onBeforeRender = () => { rtex.offset.x = (performance.now() / 1000 - corkT0) * 0.20; };
        pivot.add(cork); // local origin = pivot origin, so corkscrew sits dead-center
        group.add(pivot);
        chandelier.obj = pivot;

        resolve();
      }, undefined, err => { console.warn('[hallway2/scene] eskleohell-01.glb failed', err); resolve(); });
    }));
  } else {
    addChandelier(layout.roomCx * CELL, layout.roomCy * CELL, ROOM_CEIL);
  }

  // ===== 8 spinning dreidel-vases bouncing around the wasapok room =====
  const dreidelVases = [];
  let dreidelVaseBaseY = 0;
  let dreidelBounds = null;
  if (opts && opts.bigRoom) {
    const VASE_TARGET = 2.5;
    const VASE_RADIUS = VASE_TARGET / 2;
    const N = 42;
    dreidelVaseBaseY = VASE_TARGET / 2;
    dreidelBounds = {
      xMin: 1.5 * CELL + VASE_RADIUS,
      xMax: (layout.width - 0.5) * CELL - VASE_RADIUS,
      zMin: -0.5 * CELL + VASE_RADIUS,
      zMax: (layout.height - 0.5) * CELL - VASE_RADIUS,
    };
    const vaseMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.30,
      metalness: 0.375, roughness: 0.06, transparent: true, opacity: 0.32,
      side: THREE.DoubleSide,
    });

    pendingLoads.push(new Promise((resolve) => {
      new OBJLoader().load('outside/Eskleo-Vase-01.obj', (loaded) => {
        const bbox = new THREE.Box3().setFromObject(loaded);
        const size = bbox.getSize(new THREE.Vector3());
        const maxD = Math.max(size.x, size.y, size.z);
        loaded.scale.setScalar(maxD > 0 ? VASE_TARGET / maxD : 1);
        const ctr = new THREE.Box3().setFromObject(loaded).getCenter(new THREE.Vector3());
        loaded.position.sub(ctr);
        loaded.traverse(o => { if (o.isMesh) o.material = vaseMat; });

        for (let i = 0; i < N; i++) {
          const v = new THREE.Group();
          v.add(loaded.clone());
          const inner = new THREE.PointLight(0xffffff, 1.0, 5, 1.6);
          v.add(inner);
          v.userData.innerLight = inner;
          const px = dreidelBounds.xMin + Math.random() * (dreidelBounds.xMax - dreidelBounds.xMin);
          const pz = dreidelBounds.zMin + Math.random() * (dreidelBounds.zMax - dreidelBounds.zMin);
          v.position.set(px, dreidelVaseBaseY, pz);
          const dir = Math.random() * Math.PI * 2;
          const speed = 3.5;
          v.userData.vel = new THREE.Vector3(Math.cos(dir) * speed, 0, Math.sin(dir) * speed);
          v.userData.phase = Math.random() * Math.PI * 2;
          group.add(v);
          dreidelVases.push(v);
        }
        resolve();
      }, undefined, err => { console.warn('[wasapok] Eskleo-Vase-01.obj failed', err); resolve(); });
    }));
  }

  // ===== Desk + chair (wasapok room only), 3 tiles west of room centre, facing east =====
  let furnitureBounds = null;
  let furnitureGroup = null;
  if (opts && opts.bigRoom) {
    const wx = (layout.roomCx - 1) * CELL;
    const wz = layout.roomCy * CELL;
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x3a261a, roughness: 0.78, metalness: 0.08,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x1a1108, roughness: 0.55, metalness: 0.35,
    });

    furnitureGroup = new THREE.Group();
    group.add(furnitureGroup);

    // ---- Desk (front faces east) ----
    const DESK_H = 1.05;
    const DESK_TOP_W = 1.5;   // along z
    const DESK_TOP_D = 0.85;  // along x
    const DESK_TOP_T = 0.08;
    const deskX = wx + 0.42;
    const deskTop = new THREE.Mesh(
      new THREE.BoxGeometry(DESK_TOP_D, DESK_TOP_T, DESK_TOP_W),
      woodMat
    );
    deskTop.position.set(deskX, DESK_H, wz);
    furnitureGroup.add(deskTop);
    const legG = new THREE.BoxGeometry(0.08, DESK_H, 0.08);
    for (const [dx, dz] of [[ 0.36,  0.66], [ 0.36, -0.66], [-0.36,  0.66], [-0.36, -0.66]]) {
      const leg = new THREE.Mesh(legG, trimMat);
      leg.position.set(deskX + dx, DESK_H / 2, wz + dz);
      furnitureGroup.add(leg);
    }
    // Modesty panel on the user-facing (west) side of the desk
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, DESK_H * 0.62, DESK_TOP_W - 0.2),
      woodMat
    );
    panel.position.set(deskX - DESK_TOP_D / 2 + 0.04, DESK_H * 0.43, wz);
    furnitureGroup.add(panel);

    // ---- Chair (backrest on west, seat faces east) ----
    const SEAT_H = 0.55;
    const SEAT_SIZE = 0.5;
    const chairX = wx - 0.5;
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(SEAT_SIZE, 0.06, SEAT_SIZE),
      woodMat
    );
    seat.position.set(chairX, SEAT_H, wz);
    furnitureGroup.add(seat);
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.7, SEAT_SIZE),
      woodMat
    );
    back.position.set(chairX - SEAT_SIZE / 2 + 0.03, SEAT_H + 0.35, wz);
    furnitureGroup.add(back);
    const chairLegG = new THREE.BoxGeometry(0.06, SEAT_H, 0.06);
    for (const [dx, dz] of [[ 0.20,  0.20], [ 0.20, -0.20], [-0.20,  0.20], [-0.20, -0.20]]) {
      const leg = new THREE.Mesh(chairLegG, trimMat);
      leg.position.set(chairX + dx, SEAT_H / 2, wz + dz);
      furnitureGroup.add(leg);
    }

    furnitureBounds = {
      xMin: chairX - SEAT_SIZE / 2 - 0.06,
      xMax: deskX + DESK_TOP_D / 2,
      zMin: wz - DESK_TOP_W / 2,
      zMax: wz + DESK_TOP_W / 2,
    };
    // Block the player from walking onto the tile that holds the desk + chair.
    // Walls/floor are already built above, so this only affects player.canMoveTo.
    layout.grid[layout.roomCy][layout.roomCx - 1] = 1;
  }

  // ===== ESKLEO CHAMBER (center of room) =====
  // Loaded once from OBJ; we apply a placeholder material (aesthetics later).
  // opts.chamber === false skips the chamber + its spotlights, fill light, and hoses.
  if (opts.chamber !== false) {
  const chamberGroup = new THREE.Group();
  chamberGroup.position.set(7 * CELL, 0, 4 * CELL);
  for (const [dx, dz] of [[0,0],[-3,0],[3,0],[0,-3],[0,3]]) {
    const sp = new THREE.SpotLight(0xffffff, 28, 14, Math.PI / 3.2, 0.45, 1.4);
    sp.position.set(7 * CELL + dx, ROOM_CEIL - 0.1, 4 * CELL + dz);
    sp.target.position.set(7 * CELL, 0.4, 4 * CELL);
    group.add(sp);
    group.add(sp.target);
  }
  // Showroom fill light so the chamber's silhouette reads from any angle
  {
    const fill = new THREE.PointLight(0xfff6e6, 1.4, 10, 1.4);
    fill.position.set(7 * CELL, 1.2, 4 * CELL);
    group.add(fill);
  }

  // ===== BIOPUNK HOSES (front of chamber, hooking into the floor) =====
  {
    const blue = new THREE.MeshStandardMaterial({
      color: 0x101f3a, roughness: 0.55, metalness: 0.15,
      emissive: 0x06101e, emissiveIntensity: 0.45,
    });
    const black = new THREE.MeshStandardMaterial({
      color: 0x07070a, roughness: 0.85, metalness: 0.10,
    });
    const cx = 7 * CELL, cz = 4 * CELL;
    const sideZ = 0.63; // half-width along chamber's short axis (world Z)
    // s = ±1 picks which side (north / south). Hoses leave middle of side.
    const hoses = [
      { s: -1, dx: -0.30, y: 1.00, mat: blue,  ez: -1.6, r: 0.085 },
      { s: -1, dx:  0.30, y: 0.65, mat: black, ez: -1.0, r: 0.060 },
      { s: -1, dx:  0.00, y: 0.40, mat: black, ez: -0.7, r: 0.055 },
      { s:  1, dx: -0.30, y: 1.00, mat: blue,  ez:  1.6, r: 0.085 },
      { s:  1, dx:  0.30, y: 0.65, mat: black, ez:  1.0, r: 0.060 },
      { s:  1, dx:  0.00, y: 0.40, mat: black, ez:  0.7, r: 0.055 },
      { s: -1, dx:  0.10, y: 0.85, mat: blue,  ez: -2.3, r: 0.075 },
      { s:  1, dx:  0.10, y: 0.85, mat: blue,  ez:  2.3, r: 0.075 },
      { s: -1, dx:  0.70, y: 0.80, mat: black, ez: -2.3, r: 0.070 },
      { s:  1, dx:  0.70, y: 0.80, mat: black, ez:  2.3, r: 0.070 },
    ];
    for (const h of hoses) {
      const z0 = cz + h.s * sideZ;
      const zE = cz + h.ez;
      const a = new THREE.Vector3(cx + h.dx,        h.y,        z0);
      const b = new THREE.Vector3(cx + h.dx,        h.y - 0.05, z0 + h.s * 0.35);
      const c = new THREE.Vector3(cx + h.dx * 0.6,  0.25,       cz + h.ez * 0.85);
      const d = new THREE.Vector3(cx + h.dx * 0.3,  0.04,       zE);
      const curve = new THREE.CatmullRomCurve3([a, b, c, d], false, 'catmullrom', 0.4);
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, h.r, 8, false), h.mat));
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(h.r * 1.9, h.r * 2.2, 0.07, 12), h.mat,
      );
      cap.position.set(d.x, 0.035, d.z);
      group.add(cap);
    }

  }
  chamberGroup.rotation.y = -Math.PI / 2;
  group.add(chamberGroup);
  // Hitbox: block the 3 tiles the chamber spans along world-X.
  // Walls were built earlier so flipping these now only affects collision.
  for (const tx of [6, 7, 8]) layout.grid[4][tx] = 1;
  {
    const placeholderMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.28, metalness: 0.55,
      side: THREE.DoubleSide,
    });
    pendingLoads.push(new Promise((resolve) => {
      new OBJLoader().load('hallway2/eskleo-chamber-01.obj', (loaded) => {
        // Scale so longest axis ≈ TARGET m (life-sized, one rider can lie in cockpit)
        const bbox = new THREE.Box3().setFromObject(loaded);
        const size = bbox.getSize(new THREE.Vector3());
        const TARGET = 6.0; // metres — long axis
        const maxD = Math.max(size.x, size.y, size.z);
        const s = maxD > 0 ? TARGET / maxD : 1;
        loaded.scale.setScalar(s);
        // Re-measure after scaling, then center on chamberGroup and sit on floor
        const b2 = new THREE.Box3().setFromObject(loaded);
        const ctr = b2.getCenter(new THREE.Vector3());
        loaded.position.sub(ctr);
        loaded.position.y -= b2.min.y - ctr.y; // bottom -> y=0
        loaded.traverse(o => { if (o.isMesh) o.material = placeholderMat; });
        chamberGroup.add(loaded);
        resolve();
      }, undefined, err => { console.warn('[hallway2] eskleo-chamber-01.obj failed', err); resolve(); });
    }));
  }
  } // end chamber block

  // Centered warm daylight point light — natural radial falloff vignettes the corners.
  if (opts.daylight) {
    const dl = new THREE.PointLight(0xfff0c8, 45, 16, 1.8);
    dl.position.set(6 * CELL, ROOM_CEIL - 0.3, 4 * CELL);
    group.add(dl);
  }

  // ===== ADVENTURE-TIME SPIKY MOUNTAINS along interior perimeter =====
  if (opts.spikyMountains) {
    const W2 = layout.width, H2 = layout.height;
    const perim = [];
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      if (layout.grid[y][x] !== 0 || x < 2) continue;
      let dx = 0, dz = 0, touch = false;
      for (const [ddx, ddy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
        const nx = x + ddx, ny = y + ddy;
        if (nx < 0 || ny < 0 || nx >= W2 || ny >= H2 || layout.grid[ny][nx] === 1) {
          touch = true; dx = ddx; dz = ddy; break;
        }
      }
      if (touch) perim.push({ x, y, dx, dz });
    }
    let seed = 0xa1ce;
    const rng = () => { seed = (seed * 1664525 + 1013904223) | 0; return ((seed >>> 0) / 4294967296); };
    const mats = [0x4a3a5e, 0x5a4d7a, 0x3a5570, 0x4a6a78, 0x6a4f78].map(c =>
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, metalness: 0, flatShading: true })
    );
    const coneGeom = new THREE.ConeGeometry(1, 1, 5);
    const mtns = new THREE.Group();
    for (const p of perim) {
      const n = 2 + ((rng() * 2) | 0);
      for (let i = 0; i < n; i++) {
        const h = 1.4 + rng() * 3.0;
        const r = 0.45 + rng() * 0.55;
        const cone = new THREE.Mesh(coneGeom, mats[(rng() * mats.length) | 0]);
        cone.scale.set(r, h, r);
        const off = 0.30 + rng() * 0.40;
        const lat = (rng() - 0.5) * (CELL - 0.5);
        const lx = p.dx ? p.dx * off : lat;
        const lz = p.dz ? p.dz * off : lat;
        cone.position.set(p.x * CELL + lx, h / 2, p.y * CELL + lz);
        cone.rotation.y = rng() * Math.PI * 2;
        mtns.add(cone);
      }
    }
    group.add(mtns);
  }

  // ===== SAND DUNES scattered across the rolling grass =====
  if (opts.sandDunes) {
    let sd = 0xd0e5a;
    const sR = () => { sd = (sd * 1664525 + 1013904223) | 0; return ((sd >>> 0) / 4294967296); };
    const sandMat = new THREE.MeshStandardMaterial({
      color: 0x3f7a36, roughness: 0.95, metalness: 0, flatShading: true,
    });
    const dGeom = new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
    for (let i = 0; i < 16; i++) {
      const tx = 3 + ((sR() * 6) | 0);
      const ty = 1 + ((sR() * 7) | 0);
      if (!layout.grid[ty] || layout.grid[ty][tx] !== 0) continue;
      const dune = new THREE.Mesh(dGeom, sandMat);
      dune.scale.set(0.8 + sR() * 1.5, 0.18 + sR() * 0.22, 0.5 + sR() * 1.0);
      const dx_ = tx * CELL + (sR() - 0.5) * (CELL - 0.5);
      const dz_ = ty * CELL + (sR() - 0.5) * (CELL - 0.5);
      // Keep a clear central plaza for the eskleocity sculpture.
      if (opts.eskleocity) {
        const cdx = dx_ - 6 * CELL, cdz = dz_ - 4 * CELL;
        if (cdx * cdx + cdz * cdz < 2.8 * 2.8) continue;
      }
      dune.position.set(dx_, 0, dz_);
      dune.rotation.y = sR() * Math.PI * 2;
      group.add(dune);
    }
  }

  // ===== HOVER SHIPS — miniature eskleoship GLB roaming the rolling hills =====
  if (opts.hoverShips) {
    const ROOM_CX = 6 * CELL, ROOM_CZ = 4 * CELL, ROOM_R = 6.0;
    const SHIP_N = 9, HOVER_Y = 0.45;
    pendingLoads.push(new Promise((resolve) => {
      new GLTFLoader().load('hallway4/eskleoship-01.glb', (gltf) => {
        const proto = gltf.scene;
        const bb = new THREE.Box3().setFromObject(proto);
        const sz = bb.getSize(new THREE.Vector3());
        const maxD = Math.max(sz.x, sz.y, sz.z);
        proto.scale.setScalar(maxD > 0 ? 0.208 / maxD : 1); // miniature ~0.208 m (65% of prior 0.32)
        const whiteMat = new THREE.MeshStandardMaterial({
          color: 0xeeeae2, roughness: 0.95, metalness: 0.0,
        });
        proto.traverse(o => { if (o.isMesh) o.material = whiteMat; });
        const sb = new THREE.Box3().setFromObject(proto);
        const sc = sb.getCenter(new THREE.Vector3());
        const ships = [];
        let sd = 0xb1a5;
        const sR = () => { sd = (sd * 1664525 + 1013904223) | 0; return ((sd >>> 0) / 4294967296); };
        for (let i = 0; i < SHIP_N; i++) {
          const ship = proto.clone(true);
          ship.position.set(-sc.x, -sc.y, -sc.z); // recentre on wrapper
          const wrap = new THREE.Group();
          wrap.add(ship);
          const a = sR() * Math.PI * 2;
          const r = sR() * ROOM_R * 0.7;
          wrap.position.set(ROOM_CX + Math.cos(a) * r, HOVER_Y, ROOM_CZ + Math.sin(a) * r);
          const heading = sR() * Math.PI * 2;
          const speed = 1.6 + sR() * 1.4;
          wrap.rotation.y = heading;
          ships.push({
            wrap, speed,
            vx: Math.sin(heading) * speed, vz: Math.cos(heading) * speed,
            vy: 0, flutterT: 8 + sR() * 6, driftT: 3 + sR() * 5, phase: sR() * 6.28,
            orbitDir: sR() < 0.5 ? 1 : -1,
            targetR: ROOM_R * (0.45 + sR() * 0.35),
            ph: 'alive', phT: 0, expT: 22 + sR() * 35, // random explode every ~25-55 s
          });
          group.add(wrap);
        }
        // Dust trail — shared InstancedMesh, ring-buffer spawned behind grounded ships.
        const DUST_N = 32;
        const dustMat = new THREE.MeshBasicMaterial({
          color: 0x8a7a52, transparent: true, opacity: 0.42, depthWrite: false,
        });
        const dust = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4), dustMat, DUST_N);
        dust.frustumCulled = false;
        const dustS = [];
        const _zM = new THREE.Matrix4().makeScale(0, 0, 0);
        for (let i = 0; i < DUST_N; i++) { dustS.push({ life: 0, age: 0, x: 0, y: 0, z: 0 }); dust.setMatrixAt(i, _zM); }
        dust.instanceMatrix.needsUpdate = true;
        group.add(dust);
        const _dV = new THREE.Vector3(), _dQ = new THREE.Quaternion(), _dSc = new THREE.Vector3(), _dM = new THREE.Matrix4();
        // Orange explosion flame particles (the burst that precedes the ash).
        const FLM_N = 64;
        const flmMat = new THREE.MeshBasicMaterial({
          color: 0xff6020, transparent: true, opacity: 0.95, depthWrite: false,
          blending: THREE.AdditiveBlending, toneMapped: false,
        });
        const flm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 6, 5), flmMat, FLM_N);
        flm.frustumCulled = false;
        const flmS = [];
        for (let i = 0; i < FLM_N; i++) { flmS.push({ life: 0, age: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }); flm.setMatrixAt(i, _zM); }
        flm.instanceMatrix.needsUpdate = true;
        group.add(flm);
        let fCur = 0;
        const spawnFlame = (x, y, z, n) => {
          for (let k = 0; k < n; k++) {
            const i = fCur; fCur = (fCur + 1) % FLM_N;
            const p = flmS[i];
            p.life = 0.4 + Math.random() * 0.3;
            p.age = 0;
            p.x = x; p.y = y; p.z = z;
            const sp = 1.5 + Math.random() * 2.0;
            const a = Math.random() * Math.PI * 2;
            const v = Math.random() * Math.PI - Math.PI / 2;
            p.vx = Math.cos(a) * Math.cos(v) * sp;
            p.vy = Math.sin(v) * sp + 1.5;
            p.vz = Math.sin(a) * Math.cos(v) * sp;
          }
        };
        // Black ash particles (used by ship explosions).
        const ASH_N = 96;
        const ashMat = new THREE.MeshBasicMaterial({ color: 0x070708, transparent: true, opacity: 0.9, depthWrite: false });
        const ash = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 5, 4), ashMat, ASH_N);
        ash.frustumCulled = false;
        const ashS = [];
        for (let i = 0; i < ASH_N; i++) { ashS.push({ life: 0, age: 0, x: 0, y: 0, z: 0, vy: 0 }); ash.setMatrixAt(i, _zM); }
        ash.instanceMatrix.needsUpdate = true;
        group.add(ash);
        let aCur = 0;
        const spawnAsh = (x, y, z, n) => {
          for (let k = 0; k < n; k++) {
            const i = aCur; aCur = (aCur + 1) % ASH_N;
            const p = ashS[i];
            p.life = 1.0 + Math.random() * 0.9;
            p.age = 0;
            p.x = x + (Math.random() - 0.5) * 0.3;
            p.y = y + (Math.random() - 0.3) * 0.3;
            p.z = z + (Math.random() - 0.5) * 0.3;
            p.vy = 0.5 + Math.random() * 0.9;
          }
        };
        // Fine blood-red dust — lingers ~1s longer than the blast/ash.
        const RED_N = 128;
        const redMat = new THREE.MeshBasicMaterial({ color: 0x6a0410, transparent: true, opacity: 0.8, depthWrite: false });
        const red = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 4, 3), redMat, RED_N);
        red.frustumCulled = false;
        const redS = [];
        for (let i = 0; i < RED_N; i++) { redS.push({ life: 0, age: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }); red.setMatrixAt(i, _zM); }
        red.instanceMatrix.needsUpdate = true;
        group.add(red);
        let rCur = 0;
        const spawnRed = (x, y, z, n) => {
          for (let k = 0; k < n; k++) {
            const i = rCur; rCur = (rCur + 1) % RED_N;
            const p = redS[i];
            p.life = 2.6 + Math.random() * 0.5; // ash max ~1.9s → red lives ~1s longer
            p.age = 0;
            p.x = x + (Math.random() - 0.5) * 0.4;
            p.y = y + (Math.random() - 0.3) * 0.25;
            p.z = z + (Math.random() - 0.5) * 0.4;
            const a = Math.random() * Math.PI * 2;
            const sp = 0.7 + Math.random() * 1.1;
            p.vx = Math.cos(a) * sp;
            p.vz = Math.sin(a) * sp;
            p.vy = 0.6 + Math.random() * 0.5; // small upward kick, gravity takes over fast
          }
        };
        // Shared black-hole disc that appears under a respawning ship.
        const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, transparent: true, opacity: 0 });
        const hole = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), holeMat);
        hole.rotation.x = -Math.PI / 2;
        hole.visible = false;
        group.add(hole);
        let dCur = 0;
        const spawnDust = (s) => {
          const i = dCur; dCur = (dCur + 1) % DUST_N;
          const d = dustS[i];
          d.life = 0.7 + Math.random() * 0.4;
          d.age = 0;
          const sp = Math.hypot(s.vx, s.vz) || 1;
          d.x = s.wrap.position.x - (s.vx / sp) * 0.35 + (Math.random() - 0.5) * 0.12;
          d.z = s.wrap.position.z - (s.vz / sp) * 0.35 + (Math.random() - 0.5) * 0.12;
          d.y = HOVER_Y - 0.22;
        };
        // Drive ticks from the dust InstancedMesh (always-rendered, frustum-cull off).
        // Hooking on a child of a ship would freeze when that ship explodes and hides.
        let _last = performance.now();
        let kamikazeT = 25 + Math.random() * 35; // seconds until next chandelier strike attempt
        const _chandWorldPos = new THREE.Vector3();
        dust.onBeforeRender = () => {
          const now = performance.now();
          const dt = Math.min(0.06, (now - _last) / 1000); _last = now;
          kamikazeT -= dt;
          if (kamikazeT <= 0 && chandelier.obj) {
            const candidates = ships.filter(s => s.ph === 'alive');
            if (candidates.length) {
              const pick = candidates[(Math.random() * candidates.length) | 0];
              pick.ph = 'kamikaze'; pick.phT = 0;
            }
            kamikazeT = 25 + Math.random() * 35;
          }
          for (const s of ships) {
            if (s.ph === 'kamikaze') {
              chandelier.obj.getWorldPosition(_chandWorldPos);
              const dx = _chandWorldPos.x - s.wrap.position.x;
              const dy = _chandWorldPos.y - s.wrap.position.y;
              const dz = _chandWorldPos.z - s.wrap.position.z;
              const d = Math.hypot(dx, dy, dz);
              if (d < 2.5) {
                spawnFlame(s.wrap.position.x, s.wrap.position.y, s.wrap.position.z, 32);
                spawnAsh(s.wrap.position.x, s.wrap.position.y, s.wrap.position.z, 22);
                spawnRed(s.wrap.position.x, s.wrap.position.y, s.wrap.position.z, 40);
                s.wrap.visible = false;
                s.ph = 'gone'; s.phT = 0;
                continue;
              }
              const STRIKE_SPEED = 7.5;
              const inv = STRIKE_SPEED / Math.max(0.001, d);
              const tvx = dx * inv, tvy = dy * inv, tvz = dz * inv;
              s.vx = s.vx * 0.82 + tvx * 0.18;
              s.vy = s.vy * 0.82 + tvy * 0.18;
              s.vz = s.vz * 0.82 + tvz * 0.18;
              s.wrap.position.x += s.vx * dt;
              s.wrap.position.y += s.vy * dt;
              s.wrap.position.z += s.vz * dt;
              s.wrap.rotation.y = Math.atan2(s.vx, s.vz) + Math.PI;
              continue;
            }
            if (s.ph !== 'alive') {
              s.phT += dt;
              if (s.ph === 'gone' && s.phT > 2.0) {
                // Pick a new spot and start rising out of a black hole.
                const aa = Math.random() * Math.PI * 2;
                const rr = Math.random() * ROOM_R * 0.7;
                s.wrap.position.set(ROOM_CX + Math.cos(aa) * rr, -0.5, ROOM_CZ + Math.sin(aa) * rr);
                s.wrap.scale.setScalar(0.001);
                s.wrap.visible = true;
                hole.position.set(s.wrap.position.x, 0.02, s.wrap.position.z);
                hole.visible = true; holeMat.opacity = 1;
                s.ph = 'rise'; s.phT = 0;
              } else if (s.ph === 'rise') {
                const t = Math.min(1, s.phT / 1.2);
                s.wrap.position.y = -0.5 * (1 - t) + HOVER_Y * t;
                s.wrap.scale.setScalar(t);
                holeMat.opacity = 1 - t;
                if (t >= 1) {
                  s.ph = 'alive'; s.expT = 22 + Math.random() * 35;
                  hole.visible = false;
                  s.wrap.scale.setScalar(1);
                }
              }
              continue;
            }
            s.phase += dt * 2.5;
            // Steer velocity toward a loose orbital path around the room centre.
            {
              const rx = s.wrap.position.x - ROOM_CX;
              const rz = s.wrap.position.z - ROOM_CZ;
              const r = Math.hypot(rx, rz) || 0.001;
              const tx = -rz / r * s.orbitDir, tz = rx / r * s.orbitDir;
              const radErr = (r - s.targetR) / s.targetR;
              const dgX = tx - (rx / r) * radErr * 0.4;
              const dgZ = tz - (rz / r) * radErr * 0.4;
              const dMag = Math.hypot(dgX, dgZ) || 1;
              const sp = s.speed; // hold target speed; don't decay through the 94/6 blend
              const nvx = s.vx * 0.94 + (dgX / dMag) * sp * 0.06;
              const nvz = s.vz * 0.94 + (dgZ / dMag) * sp * 0.06;
              const nMag = Math.hypot(nvx, nvz) || 1;
              s.vx = nvx / nMag * sp;
              s.vz = nvz / nMag * sp;
            }
            s.wrap.position.x += s.vx * dt;
            s.wrap.position.z += s.vz * dt;
            // Bounce off the circular room boundary.
            const ox = s.wrap.position.x - ROOM_CX, oz = s.wrap.position.z - ROOM_CZ;
            const d = Math.sqrt(ox * ox + oz * oz);
            if (d > ROOM_R) {
              const nx = ox / d, nz = oz / d, dot = s.vx * nx + s.vz * nz;
              if (dot > 0) { s.vx -= 2 * dot * nx; s.vz -= 2 * dot * nz; }
              s.wrap.position.x = ROOM_CX + nx * ROOM_R;
              s.wrap.position.z = ROOM_CZ + nz * ROOM_R;
            }
            s.wrap.rotation.y = Math.atan2(s.vx, s.vz) + Math.PI;
            // Random handbrake drift — rotate velocity by ±~60° once in a while.
            s.driftT -= dt;
            if (s.driftT <= 0) {
              const a = (Math.random() - 0.5) * Math.PI * 0.7;
              const c = Math.cos(a), si = Math.sin(a);
              const nvx = s.vx * c - s.vz * si;
              const nvz = s.vx * si + s.vz * c;
              s.vx = nvx; s.vz = nvz;
              s.driftT = 5 + Math.random() * 7;
            }
            // Occasional upward flutter, gravity returns the ship to hover height.
            s.flutterT -= dt;
            if (s.flutterT <= 0) {
              s.vy = 2.0 + Math.random() * 1.6;
              s.flutterT = 10 + Math.random() * 8; // mostly driving (~15:1 ratio)
            }
            s.vy -= 8 * dt;
            let y = s.wrap.position.y + s.vy * dt;
            if (y < HOVER_Y) { y = HOVER_Y; if (s.vy < 0) s.vy = 0; }
            s.wrap.position.y = y + Math.sin(s.phase) * 0.04;
            // Off-road shake while grounded.
            const sh = s.wrap.position.y < HOVER_Y + 0.06 ? 1 : 0;
            s.wrap.rotation.x = (Math.random() - 0.5) * 0.07 * sh;
            s.wrap.rotation.z = (Math.random() - 0.5) * 0.07 * sh;
            // Spawn dust behind grounded ships.
            if (s.wrap.position.y < HOVER_Y + 0.12 && Math.random() < 0.35) spawnDust(s);
            // Random explosion → black ash → ship hidden → respawns later.
            s.expT -= dt;
            if (s.expT <= 0) {
              spawnFlame(s.wrap.position.x, s.wrap.position.y, s.wrap.position.z, 22);
              spawnAsh(s.wrap.position.x, s.wrap.position.y, s.wrap.position.z, 16);
              spawnRed(s.wrap.position.x, s.wrap.position.y, s.wrap.position.z, 32);
              s.wrap.visible = false;
              s.ph = 'gone'; s.phT = 0;
            }
          }
          // Advance dust particles + write matrices.
          for (let i = 0; i < DUST_N; i++) {
            const d = dustS[i];
            let sc = 0;
            if (d.age < d.life) {
              d.age += dt;
              const t = d.age / d.life;
              sc = t < 0.5 ? t * 2 : 2 * (1 - t);
              d.y += dt * 0.15;
            }
            _dV.set(d.x, d.y, d.z);
            _dSc.set(sc, sc, sc);
            _dM.compose(_dV, _dQ, _dSc);
            dust.setMatrixAt(i, _dM);
          }
          dust.instanceMatrix.needsUpdate = true;
          // Advance ash particles (rise + fade via triangular scale).
          for (let i = 0; i < ASH_N; i++) {
            const p = ashS[i];
            let sc = 0;
            if (p.age < p.life) {
              p.age += dt;
              const t = p.age / p.life;
              sc = t < 0.25 ? t * 4 : 1 - (t - 0.25) / 0.75;
              p.y += p.vy * dt;
              p.vy -= 0.5 * dt;
            }
            _dV.set(p.x, p.y, p.z);
            _dSc.set(sc, sc, sc);
            _dM.compose(_dV, _dQ, _dSc);
            ash.setMatrixAt(i, _dM);
          }
          ash.instanceMatrix.needsUpdate = true;
          // Advance flame particles (burst out then quickly fade).
          for (let i = 0; i < FLM_N; i++) {
            const p = flmS[i];
            let sc = 0;
            if (p.age < p.life) {
              p.age += dt;
              const t = p.age / p.life;
              sc = (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85) * (1.0 + (1 - t) * 1.0);
              p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
              p.vy -= 5 * dt;
              p.vx *= 0.92; p.vz *= 0.92;
            }
            _dV.set(p.x, p.y, p.z);
            _dSc.set(sc, sc, sc);
            _dM.compose(_dV, _dQ, _dSc);
            flm.setMatrixAt(i, _dM);
          }
          flm.instanceMatrix.needsUpdate = true;
          // Advance red dust (slow rise + outward drift, long gentle fade).
          for (let i = 0; i < RED_N; i++) {
            const p = redS[i];
            let sc = 0;
            if (p.age < p.life) {
              p.age += dt;
              const t = p.age / p.life;
              sc = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
              p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
              p.vx *= 0.94; p.vz *= 0.94;
              p.vy -= 2.2 * dt; // sprinkle downward — gravity-dominated
            }
            _dV.set(p.x, p.y, p.z);
            _dSc.set(sc, sc, sc);
            _dM.compose(_dV, _dQ, _dSc);
            red.setMatrixAt(i, _dM);
          }
          red.instanceMatrix.needsUpdate = true;
        };
        resolve();
      }, undefined, err => { console.warn('[hallway2] eskleoship-01.glb failed', err); resolve(); });
    }));
  }

  // ===== EXHIBIT LIGHTING — crossing spotlights aim at the chandelier + city.
  if (opts.eskleocity) {
    for (const p of [
      { x: 6 * CELL + 3.0, z: 4 * CELL + 3.0 },
      { x: 6 * CELL - 3.0, z: 4 * CELL - 3.0 },
    ]) {
      const sl = new THREE.SpotLight(0xfff2c8, 6, 14, Math.PI / 5, 0.45, 1.2);
      sl.position.set(p.x, ROOM_CEIL - 0.15, p.z);
      sl.target.position.set(6 * CELL, 1.6, 4 * CELL);
      group.add(sl); group.add(sl.target);
    }
  }

  // ===== Roads + roundabout into the eskleocity (N / E / W approach).
  if (opts.eskleocity) {
    const RW = 0.5;             // road width (~one ship)
    const RIN = 1.8, ROUT = RIN + RW;
    const CX_ = 6 * CELL, CZ_ = 4 * CELL;
    const roadMat = new THREE.MeshStandardMaterial({ color: 0xa0b4c8, roughness: 0.85, metalness: 0.06 });
    const dashMat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.7, metalness: 0.0 });
    // Each spoke: world-axis ('x' or 'z') from a far wall coord to ROUT from centre.
    const spokes = [
      { axis: 'z', from: 0,  to: CZ_ - ROUT }, // N → +z
      { axis: 'x', from: 20, to: CX_ + ROUT }, // E → -x
      { axis: 'z', from: 16, to: CZ_ + ROUT }, // S ("right" wall) → -z, replacing the W/hallway road
    ];
    for (const s of spokes) {
      const lo = Math.min(s.from, s.to), hi = Math.max(s.from, s.to);
      const len = hi - lo, mid = (lo + hi) / 2;
      const dW = s.axis === 'x' ? len : RW;
      const dD = s.axis === 'x' ? RW : len;
      const px = s.axis === 'x' ? mid : CX_;
      const pz = s.axis === 'x' ? CZ_ : mid;
      const road = new THREE.Mesh(new THREE.BoxGeometry(dW, 0.02, dD), roadMat);
      road.position.set(px, 0.01, pz);
      group.add(road);
      // Yellow centre-line dashes.
      const n = Math.floor(len / 0.55);
      for (let i = 0; i < n; i += 2) {
        const t = (i + 0.5) / n;
        const dx = s.axis === 'x' ? lo + t * len : CX_;
        const dz = s.axis === 'x' ? CZ_ : lo + t * len;
        const dw = s.axis === 'x' ? 0.22 : 0.05;
        const dd = s.axis === 'x' ? 0.05 : 0.22;
        const d = new THREE.Mesh(new THREE.BoxGeometry(dw, 0.025, dd), dashMat);
        d.position.set(dx, 0.02, dz);
        group.add(d);
      }
    }
    // Roundabout ring around the city.
    const ring = new THREE.Mesh(new THREE.RingGeometry(RIN, ROUT, 64), roadMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(CX_, 0.012, CZ_);
    group.add(ring);
    const rMid = (RIN + ROUT) / 2;
    for (let i = 0; i < 24; i += 2) {
      const a = (i / 24) * Math.PI * 2;
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.22), dashMat);
      d.position.set(CX_ + Math.cos(a) * rMid, 0.02, CZ_ + Math.sin(a) * rMid);
      d.rotation.y = -a;
      group.add(d);
    }
  }

  // ===== Skyscraper-window canvas texture shared by the city + pillar ring.
  let winTex = null;
  if (opts.eskleocity) {
    const wc = document.createElement('canvas');
    wc.width = 128; wc.height = 128;
    const wcx = wc.getContext('2d');
    wcx.fillStyle = '#fde910'; wcx.fillRect(0, 0, 128, 128);
    wcx.fillStyle = '#ffffe0';
    let wSd = 0xc17;
    const wR = () => { wSd = (wSd * 1664525 + 1013904223) | 0; return ((wSd >>> 0) / 4294967296); };
    for (let i = 0; i < 220; i++) wcx.fillRect((wR() * 128) | 0, (wR() * 128) | 0, 2, 2);
    winTex = new THREE.CanvasTexture(wc);
    winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  }

  // ===== Yellow low-poly pillar ring around the eskleocity base.
  if (opts.eskleocity) {
    const pillarGeom = new THREE.BoxGeometry(1, 1, 1);
    // Override BoxGeometry UVs so the window texture tiles densely on each pillar.
    {
      const pp = pillarGeom.attributes.position;
      const uv = new Float32Array(pp.count * 2);
      for (let i = 0; i < pp.count; i++) {
        uv[i * 2]     = pp.getX(i) * 6;
        uv[i * 2 + 1] = pp.getY(i) * 6;
      }
      pillarGeom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    // Distance-driven palette: edge pillars stay white-yellow, inner pillars get
    // increasingly gold + metallic, blending toward the central eskleocity GLB.
    const _outerR = 2.10, _innerR = 1.25;
    const _edgeColor = new THREE.Color(0xffffff);
    const _goldColor = new THREE.Color(0xffc850);
    const _tmpColor = new THREE.Color();
    let pSd = 0xea71;
    const pR = () => { pSd = (pSd * 1664525 + 1013904223) | 0; return ((pSd >>> 0) / 4294967296); };
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2 + (pR() - 0.5) * 0.20;
      for (const dr of [-0.10, 0.10]) {
        const r = 1.35 + pR() * 0.65 + dr;
        const h = 0.30 + pR() * 0.95;
        const w = 0.055 + pR() * 0.075;
        const k = Math.max(0, Math.min(1, (_outerR - r) / (_outerR - _innerR)));
        _tmpColor.copy(_edgeColor).lerp(_goldColor, k);
        const pillarMat = new THREE.MeshStandardMaterial({
          color: _tmpColor.clone(),
          roughness: 0.55 - k * 0.30,
          metalness: 0.15 + k * 0.65,
          emissive: _tmpColor.clone(),
          emissiveIntensity: 0.55 + k * 0.20,
          map: winTex, emissiveMap: winTex,
        });
        const m = new THREE.Mesh(pillarGeom, pillarMat);
        m.scale.set(w, h, w);
        m.position.set(6 * CELL + Math.cos(a) * r, h / 2, 4 * CELL + Math.sin(a) * r);
        m.rotation.y = a + (pR() - 0.5) * 0.4;
        group.add(m);
      }
    }
  }

  // ===== ESKLEOCITY sculpture — yellow tiled cybertronian city centred under the chandelier.
  if (opts.eskleocity) {
    pendingLoads.push(new Promise((resolve) => {
      new GLTFLoader().load('hallway4/eskleocity-01.glb', (gltf) => {
        const obj = gltf.scene;
        // Eskleocity is the center of the entity — fully golden, polished metallic.
        const cityMat = new THREE.MeshStandardMaterial({
          color: 0xffc850, roughness: 0.22, metalness: 0.85,
          emissive: 0xffc850, emissiveIntensity: 0.75,
          map: winTex, emissiveMap: winTex,
        });
        // GLB usually lacks suitable UVs for repeat tiling — synthesise per-vertex
        // UVs from local position so windows actually map across faces.
        obj.traverse(o => {
          if (!o.isMesh) return;
          o.material = cityMat;
          const pos = o.geometry.attributes.position;
          const uv = new Float32Array(pos.count * 2);
          for (let i = 0; i < pos.count; i++) {
            uv[i * 2]     = pos.getX(i) * 1.8;
            uv[i * 2 + 1] = pos.getY(i) * 1.8;
          }
          o.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        });
        const bb = new THREE.Box3().setFromObject(obj);
        const sz = bb.getSize(new THREE.Vector3());
        const maxD = Math.max(sz.x, sz.y, sz.z);
        const TARGET = 3.0; // max bbox dim (city tends to be wider than tall)
        obj.scale.setScalar(maxD > 0 ? TARGET / maxD : 1);
        const sb = new THREE.Box3().setFromObject(obj);
        const sc = sb.getCenter(new THREE.Vector3());
        // Centre horizontally on (6*CELL, 4*CELL) and sit the bbox bottom on the floor.
        obj.position.set(6 * CELL - sc.x, -sb.min.y, 4 * CELL - sc.z);
        group.add(obj);
        // Promote the tallest near-center mesh to solid polished gold.
        obj.updateMatrixWorld(true);
        const _meshBox = new THREE.Box3();
        const _meshCtr = new THREE.Vector3();
        const cityCenterX = 6 * CELL, cityCenterZ = 4 * CELL;
        let tallest = null, tallestTop = -Infinity;
        obj.traverse(o => {
          if (!o.isMesh) return;
          _meshBox.setFromObject(o);
          _meshBox.getCenter(_meshCtr);
          const horiz = Math.hypot(_meshCtr.x - cityCenterX, _meshCtr.z - cityCenterZ);
          if (horiz > 0.6) return; // restrict to near-center meshes
          if (_meshBox.max.y > tallestTop) { tallestTop = _meshBox.max.y; tallest = o; }
        });
        if (tallest) {
          tallest.material = new THREE.MeshStandardMaterial({
            color: 0xffd366, roughness: 0.22, metalness: 1.0,
            emissive: 0xffd366, emissiveIntensity: 0.95,
            toneMapped: false,
          });
          // Tiny gold sparklings sprinkled across the tower's surface.
          const sparkCv = document.createElement('canvas');
          sparkCv.width = 32; sparkCv.height = 32;
          const sx = sparkCv.getContext('2d');
          const sg = sx.createRadialGradient(16, 16, 0, 16, 16, 14);
          sg.addColorStop(0.0, 'rgba(255,240,180,1)');
          sg.addColorStop(0.35, 'rgba(255,200,90,0.55)');
          sg.addColorStop(1.0, 'rgba(255,200,90,0)');
          sx.fillStyle = sg; sx.fillRect(0, 0, 32, 32);
          const sparkTex = new THREE.CanvasTexture(sparkCv);
          const sparkMat = new THREE.SpriteMaterial({
            map: sparkTex, color: 0xffe080, transparent: true, depthWrite: false,
            blending: THREE.AdditiveBlending, toneMapped: false,
          });
          // Build sparkles in the tower's local frame so they stick to it.
          tallest.updateMatrixWorld(true);
          const localBox = tallest.geometry.boundingBox || tallest.geometry.computeBoundingBox() || tallest.geometry.boundingBox;
          const lb = tallest.geometry.boundingBox;
          const SP_N = 36;
          const spkArr = [];
          for (let i = 0; i < SP_N; i++) {
            const sp = new THREE.Sprite(sparkMat);
            sp.position.set(
              lb.min.x + Math.random() * (lb.max.x - lb.min.x),
              lb.min.y + Math.random() * (lb.max.y - lb.min.y),
              lb.min.z + Math.random() * (lb.max.z - lb.min.z),
            );
            sp.scale.setScalar(0.0001);
            if (i === 0) sp.frustumCulled = false;
            tallest.add(sp);
            spkArr.push({ sprite: sp, phase: Math.random() * 6.28, freq: 1.8 + Math.random() * 2.6 });
          }
          const _spkT0 = performance.now();
          spkArr[0].sprite.onBeforeRender = () => {
            const tt = (performance.now() - _spkT0) / 1000;
            for (let i = 0; i < SP_N; i++) {
              const p = spkArr[i];
              const blink = Math.pow(Math.max(0, Math.sin(tt * p.freq + p.phase)), 18);
              p.sprite.scale.setScalar(Math.max(0.00005, blink * 0.06));
            }
          };
        }
        resolve();
      }, undefined, err => { console.warn('[hallway2] eskleocity-01.glb failed', err); resolve(); });
    }));
  }

  // ===== PORTAL DOOR at the hallway-end return tile (mirrors the main-hall doors).
  {
    const portalMat = new THREE.ShaderMaterial({
      uniforms: { uTime: waterMat.uniforms.uTime },
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
    const tunnelMat = new THREE.MeshStandardMaterial({
      color: 0x16181b, roughness: 1, metalness: 0, side: THREE.DoubleSide,
    });
    const portalGeom = new THREE.PlaneGeometry(1.6, 2.8);
    const topGeom  = new THREE.BoxGeometry(1.76, 0.16, 0.16);
    const sideGeom = new THREE.BoxGeometry(0.16, 2.96, 0.16);
    const TDP = 8.0; // long enough to read as a hallway receding back to the hub
    // Cross-section matches the corridor — CELL wide x STD_CEIL tall — same as
    // the main-hall portal tunnels.
    const tunnelPlanes = [
      [CELL, TDP, [0, -1.40, -TDP/2], [-Math.PI/2, 0, 0]],
      [CELL, TDP, [0,  2.20, -TDP/2], [ Math.PI/2, 0, 0]],
      [TDP, STD_CEIL, [-CELL/2, 0.40, -TDP/2], [0,  Math.PI/2, 0]],
      [TDP, STD_CEIL, [ CELL/2, 0.40, -TDP/2], [0, -Math.PI/2, 0]],
      [CELL, STD_CEIL, [0, 0.40, -TDP], [0, 0, 0]],
    ];
    // Spawn tile = west end of the hallway; wall is one tile west.
    // Pivot sits on that wall face, facing +X back toward the player.
    const pivot = new THREE.Group();
    pivot.position.set(layout.spawn.x * CELL - (CELL/2 - 0.04), 1.40, layout.spawn.y * CELL);
    pivot.rotation.y = Math.PI / 2;
    for (const [w, h, [px, py, pz], [rx, ry, rz]] of tunnelPlanes) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), tunnelMat);
      m.position.set(px, py, pz);
      m.rotation.set(rx, ry, rz);
      pivot.add(m);
    }
    const portalMesh = new THREE.Mesh(portalGeom, portalMat);
    portalMesh.onBeforeRender = (_r, _s, cam) => {
      const dx = cam.position.x - pivot.position.x;
      const dz = cam.position.z - pivot.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const open = Math.max(0, Math.min(1, (4.5 - dist) / 3.0));
      portalMesh.scale.y = Math.max(0.001, 1 - open);
      portalMesh.position.y = 1.4 * open;
    };
    pivot.add(portalMesh);
    const tb = new THREE.Mesh(topGeom, chromeMat);  tb.position.set(0, 1.48, 0); pivot.add(tb);
    const lb = new THREE.Mesh(sideGeom, chromeMat); lb.position.set(-0.88, 0.08, 0); pivot.add(lb);
    const rb = new THREE.Mesh(sideGeom, chromeMat); rb.position.set( 0.88, 0.08, 0); pivot.add(rb);
    group.add(pivot);
  }

  return {
    scene, group, layout,
    walls, setWalls, shelfWalls, floorMesh: floor, ceilMesh: ceilInst,
    torchLights, playerLight,
    waterMat,
    CELL, WALL_H: ROOM_CEIL,
    chandelier,
    dreidelVases, dreidelVaseBaseY, dreidelBounds, furnitureBounds, furnitureGroup,
    ready: Promise.all(pendingLoads),
  };
}
