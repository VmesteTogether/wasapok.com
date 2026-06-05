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
  // Eerie hallway-door for one shelf wall (bigRoom only). main.js picks the
  // targeted wall by FOV order, calls shelfDoor.materialize() once (off-screen)
  // to build it open, then shelfDoor.setOpen(bool) to flip hallway<->shelf on
  // every later look-away. shelfDoor.open is the current state; shelfDoor.barrier
  // is the live collision descriptor main.js reads (null while closed).
  const shelfDoor = { materialize: null, setOpen: null, barrier: null, open: false };
  if (opts && opts.bigRoom) {
    const SHELF_H = 80;       // very tall — fog handles the upper fade
    const OFFSET = 13.8;      // 4 tiles (8m) back from where the set walls land flat (~5.6m)
    const xMin = 3, xMax = 41, zMin = -1, zMax = 37;
    const midZ = (zMin + zMax) / 2;
    // East wall spans corner-to-corner; north/south extend east to meet it at the NE + SE corners.
    const eastLen   = (zMax + OFFSET) - (zMin - OFFSET);
    const nsLen     = (xMax + OFFSET) - xMin;
    const nsCenterX = (xMin + (xMax + OFFSET)) / 2;

    // Procedural maple bookshelf tile: wood frame only (top/bottom planks +
    // side dividers). Cubby interior is left transparent so the real
    // recessed-box geometry behind it shows through.
    const PLANK = 22;   // top/bottom shelf plank thickness (texture pixels)
    const SIDE  = 8;    // vertical side divider thickness
    const TPX = 256;
    const top = PLANK, bottom = TPX - PLANK;
    const left = SIDE, right = TPX - SIDE;

    const c = document.createElement('canvas');
    c.width = TPX; c.height = TPX;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // Clip to frame region (everything except cubby) so maple + grain only
    // paint the planks/dividers; cubby stays alpha=0.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, TPX, TPX);
    ctx.rect(left, top, right - left, bottom - top);
    ctx.clip('evenodd');
    ctx.fillStyle = '#d2a574';
    ctx.fillRect(0, 0, TPX, TPX);
    for (let i = 0; i < 28; i++) {
      const gy = Math.random() * TPX;
      const rr = 125 + (Math.random() * 35 | 0);
      const gg =  82 + (Math.random() * 22 | 0);
      const bb =  42 + (Math.random() * 22 | 0);
      ctx.strokeStyle = `rgba(${rr},${gg},${bb},0.22)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(TPX, gy + (Math.random() - 0.5) * 5);
      ctx.stroke();
    }
    ctx.restore();
    // Plank edge accents (lit top edge of upper plank, shadow under lower plank).
    // These rows lie inside the plank bands so they don't spill into the cubby.
    ctx.fillStyle = 'rgba(255,232,188,0.35)';
    ctx.fillRect(0, 0, TPX, 2);
    ctx.fillStyle = 'rgba(30,15,5,0.65)';
    ctx.fillRect(0, TPX - 3, TPX, 3);

    const shelfTex = new THREE.CanvasTexture(c);
    shelfTex.wrapS = shelfTex.wrapT = THREE.RepeatWrapping;
    shelfTex.magFilter = THREE.NearestFilter;
    shelfTex.needsUpdate = true;

    // Recessed cubby box: 5 inward-facing panels (back + top + bottom + 2 sides,
    // no front). Stamped behind every cell of the wood frame as an InstancedMesh
    // — same recessed-box trick the outside portal door uses for its faux
    // hallway, just instanced across a wall. Vertex colors fake the painted
    // shading the old parallax shader used to do (dark back, under-plank shadow,
    // lit bottom plank where books would sit).
    const TILE_W = 2.0, TILE_H = 2.0;                    // 2m per shelf cell
    const CUBBY_W = TILE_W * (right - left) / TPX;       // ~1.875m opening
    const CUBBY_H = TILE_H * (bottom - top) / TPX;       // ~1.656m opening
    const CUBBY_D = 1.25;                                // depth into the wall
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
      addQuad([[-w2,-h2,zB],[ w2,-h2,zB],[ w2, h2,zB],[-w2, h2,zB]], [0,0,1],  [0.04,0.025,0.012]);
      // top (under-plank shadow)
      addQuad([[-w2, h2,zB],[ w2, h2,zB],[ w2, h2,zF],[-w2, h2,zF]], [0,-1,0], [0.06,0.04, 0.02 ]);
      // bottom (lit — where books would sit)
      addQuad([[-w2,-h2,zF],[ w2,-h2,zF],[ w2,-h2,zB],[-w2,-h2,zB]], [0, 1,0], [0.20,0.13, 0.07 ]);
      // left
      addQuad([[-w2,-h2,zF],[-w2,-h2,zB],[-w2, h2,zB],[-w2, h2,zF]], [1, 0,0], [0.06,0.04, 0.02 ]);
      // right
      addQuad([[ w2,-h2,zF],[ w2, h2,zF],[ w2, h2,zB],[ w2,-h2,zB]], [-1,0,0], [0.06,0.04, 0.02 ]);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      g.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
      g.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
      g.setIndex(indices);
      return g;
    })();
    const cubbyMat = new THREE.MeshBasicMaterial({
      vertexColors: true, fog: true, side: THREE.DoubleSide,
    });

    // Each wall = group(alpha-cut wood plane + InstancedMesh of cubby boxes).
    // Plane normal is +z in local frame; cubbies recess to -z (into the wall).
    const makeShelfWall = (len) => {
      const tex = shelfTex.clone();
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.magFilter = THREE.NearestFilter;
      tex.repeat.set(len / TILE_W, SHELF_H / TILE_H);
      tex.needsUpdate = true;
      const wallMat = new THREE.MeshBasicMaterial({
        map: tex, alphaTest: 0.5, side: THREE.FrontSide, fog: true,
      });
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, SHELF_H), wallMat);

      const nx = Math.round(len / TILE_W);
      const ny = Math.round(SHELF_H / TILE_H);
      const cubbies = new THREE.InstancedMesh(cubbyGeom, cubbyMat, nx * ny);
      const m = new THREE.Matrix4();
      for (let iy = 0; iy < ny; iy++) {
        for (let ix = 0; ix < nx; ix++) {
          const x = (ix + 0.5) * TILE_W - len / 2;
          const y = (iy + 0.5) * TILE_H - SHELF_H / 2;
          m.makeTranslation(x, y, 0);
          cubbies.setMatrixAt(iy * nx + ix, m);
        }
      }
      cubbies.instanceMatrix.needsUpdate = true;
      cubbies.frustumCulled = false;   // big spread, conservative bounds aren't worth recomputing

      const pivot = new THREE.Group();
      pivot.add(wall);
      pivot.add(cubbies);
      pivot.userData.shelf = { cubbies, wall, len, nx, ny };
      pivot.visible = false;
      return pivot;
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

    // ===== EERIE SHELF DOOR — the two bottom-centre cubbies of one wall flip
    // between an intact shelf and a short walkable hallway. main.js builds it once
    // (off-screen) then toggles setOpen() on every later look-away, so the wall is
    // never seen changing — each glance back shows the opposite of last time.
    // Stub corridor: runs CORRIDOR_LEN back into the void and dead-ends; the
    // `corridorEnd` panel + the group are the clean hook to extend it later.
    const CORRIDOR_LEN = 12;       // metres the hallway runs back from the wall
    const DOOR_ROWS = 2;           // two stacked bottom cubbies (floor → ~3.3m up)
    const doorStone = new THREE.MeshStandardMaterial({
      color: 0x141014, roughness: 1, metalness: 0, side: THREE.DoubleSide,
    });
    const doorMask = new THREE.MeshBasicMaterial({ color: 0x0a0708, fog: true, side: THREE.DoubleSide });

    shelfDoor.materialize = (wallKey) => {
      if (shelfDoor._built) return;
      const pivot = shelfWalls[wallKey];
      if (!pivot || !pivot.userData.shelf) return;
      pivot.updateMatrixWorld(true);
      const { cubbies, len, nx } = pivot.userData.shelf;
      const ix0 = Math.floor(nx / 2);                  // centre column — natural sightline
      const cxL = (ix0 + 0.5) * TILE_W - len / 2;      // local x of the door centre
      const yBot = -SHELF_H / 2;                       // local y of the floor (world y = 0)
      const yTop = yBot + DOOR_ROWS * TILE_H;          // top of the 2-cubby opening
      const yMid = (yBot + yTop) / 2, hw = TILE_W / 2;

      // Remember the two cubby instances we flip, plus their original matrices, so
      // the CLOSED state can restore the intact shelf exactly.
      const indices = [], orig = [];
      for (let iy = 0; iy < DOOR_ROWS; iy++) {
        const idx = iy * nx + ix0, m = new THREE.Matrix4();
        cubbies.getMatrixAt(idx, m);
        indices.push(idx); orig.push(m);
      }

      // Corridor in the wall's LOCAL frame (inherits its transform). Local +z
      // faces the room; the wall recesses to -z, so the hallway runs -z.
      const corridor = new THREE.Group();
      const panel = (w, h, mat) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      const floor = panel(TILE_W, CORRIDOR_LEN, doorStone);
      floor.rotation.x = -Math.PI / 2; floor.position.set(cxL, yBot, -CORRIDOR_LEN / 2);
      corridor.add(floor);
      const ceil = panel(TILE_W, CORRIDOR_LEN, doorStone);
      ceil.rotation.x = Math.PI / 2; ceil.position.set(cxL, yTop, -CORRIDOR_LEN / 2);
      corridor.add(ceil);
      const sL = panel(CORRIDOR_LEN, yTop - yBot, doorStone);
      sL.rotation.y = Math.PI / 2; sL.position.set(cxL - hw, yMid, -CORRIDOR_LEN / 2);
      corridor.add(sL);
      const sR = panel(CORRIDOR_LEN, yTop - yBot, doorStone);
      sR.rotation.y = -Math.PI / 2; sR.position.set(cxL + hw, yMid, -CORRIDOR_LEN / 2);
      corridor.add(sR);
      const back = panel(TILE_W, yTop - yBot, doorStone);       // dead-end (extend hook)
      back.position.set(cxL, yMid, -CORRIDOR_LEN);
      corridor.userData.corridorEnd = back; corridor.add(back);
      // mask the maple plank between the two stacked cubbies so the opening reads
      // as one clean 2-tall passage instead of a barred shelf.
      const midPlank = panel(TILE_W, 0.5, doorMask);
      midPlank.position.set(cxL, yBot + TILE_H, 0.012);
      corridor.add(midPlank);
      // faint cold glow deep in the hall — "somewhere leads off"
      const glow = new THREE.PointLight(0x6fbf9f, 0.6, CORRIDOR_LEN * 1.4, 2);
      glow.position.set(cxL, yMid, -CORRIDOR_LEN * 0.65);
      corridor.add(glow);
      // Slate-navy shag welcome mat on the floor in front of the opening — same
      // shade as the doormat at newhome's A5 hallway (0x485266).
      const mat = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.06, 1.5),
        new THREE.MeshStandardMaterial({
          color: 0x485266, roughness: 0.98, metalness: 0,
          emissive: 0x485266, emissiveIntensity: 0.3,   // faint self-glow so it reads in the dim room (same shade)
        }),
      );
      mat.position.set(cxL, yBot + 0.03, 0.6);   // room-side of the threshold, resting on the floor
      corridor.add(mat);
      corridor.visible = false;                  // setOpen() reveals it
      pivot.add(corridor);

      // World-space collision descriptor: solid wall except across the door's tile
      // channel, walkable to the corridor end. Applied only while the door is OPEN.
      const wallPt = pivot.localToWorld(new THREE.Vector3(cxL, yMid, 0));
      const endPt  = pivot.localToWorld(new THREE.Vector3(cxL, yMid, -CORRIDOR_LEN));
      const e1 = pivot.localToWorld(new THREE.Vector3(cxL - hw, yMid, 0));
      const e2 = pivot.localToWorld(new THREE.Vector3(cxL + hw, yMid, 0));
      const normalX = Math.abs(endPt.x - wallPt.x) > Math.abs(endPt.z - wallPt.z);
      const tan1 = normalX ? e1.z : e1.x, tan2 = normalX ? e2.z : e2.x;
      shelfDoor._barrierDesc = {
        normalX,
        wallCoord: normalX ? wallPt.x : wallPt.z,
        endCoord:  normalX ? endPt.x  : endPt.z,
        doorMin: Math.min(tan1, tan2),
        doorMax: Math.max(tan1, tan2),
      };
      shelfDoor._cubbies = cubbies;
      shelfDoor._indices = indices;
      shelfDoor._orig = orig;
      shelfDoor._corridor = corridor;
      shelfDoor._zero = new THREE.Matrix4().makeScale(0, 0, 0);
      shelfDoor._built = true;
      shelfDoor.setOpen(true);
    };

    // Flip between hallway (open) and intact shelf (closed). Always invoked by
    // main.js while the wall is off-screen, so the swap itself is never seen.
    shelfDoor.setOpen = (isOpen) => {
      if (!shelfDoor._built) return;
      const { _cubbies, _indices, _orig, _zero, _corridor, _barrierDesc } = shelfDoor;
      for (let i = 0; i < _indices.length; i++) {
        _cubbies.setMatrixAt(_indices[i], isOpen ? _zero : _orig[i]);
      }
      _cubbies.instanceMatrix.needsUpdate = true;
      _corridor.visible = isOpen;
      shelfDoor.barrier = isOpen ? _barrierDesc : null;
      shelfDoor.open = isOpen;
    };
  }

  // ===== BLACK ROOM — pitch-black extension WEST of (behind) the hallway wall.
  // Same scale as the bookshelf enclosure (as wide + as tall), running back the
  // room's own depth (~52m) to a bottomless, green-lit pit at the far end.
  // Reached through the two open strips that flank the hallway wall (N + S of it,
  // beyond its Z 0..36 span); the wall itself stays as the divider. Revealed
  // together with the shelf walls on the 3rd plate press (see main.js).
  // Half-Life / Portal read: near-black surfaces, the only colour is the green
  // glow rising out of the chasm. The card-table scene at the pit edge is future work.
  let blackRoom = null;
  let blackRoomPit = null;   // world-space pit bounds {xMin,xMax,zMin,zMax} for movement blocking
  let blackRoomTable = null; // world-space table footprint {x,z,r} for movement blocking
  if (opts && opts.bigRoom) {
    const BR_H   = 80;                  // match bookshelf height / high ceiling (Y = 0..80)
    const OFFSET = 13.8;
    const zMin = -1, zMax = 37;         // set-wall box edges the bookshelves offset from
    const zN = zMin - OFFSET;           // -14.8  north bookshelf line
    const zS = zMax + OFFSET;           //  50.8  south bookshelf line
    const eastX = 1;                    // back (west face) of the hallway wall — the entry/spawn side
    // ---- Pit footprint (computed first; the far wall is then placed to enclose it) ----
    // As wide as the bookshelf span minus 8m ledges N/S, and SQUARE. The pit sits
    // against the far wall and grows AWAY from spawn, so the entry-side approach
    // stays the same length no matter how big the pit gets.
    const pzMin = zN + 8, pzMax = zS - 8;   // -6.8 .. 42.8   (pit width)
    const pitW  = pzMax - pzMin;            // 49.6 — square: depth == width
    const APPROACH = 41;                    // black floor between the entry and the pit's near edge
    const pxMax = eastX - APPROACH;         // -40    pit near (spawn-facing) edge
    const pxMin = pxMax - pitW;             // -89.6  pit far edge — extends away from spawn
    const westX = pxMin;                    // far wall hard against the pit's far (west) edge
    const pitCx = (pxMin + pxMax) / 2, pitCz = (pzMin + pzMax) / 2;
    blackRoomPit = { xMin: pxMin, xMax: pxMax, zMin: pzMin, zMax: pzMax };

    const br = new THREE.Group();
    br.visible = false;

    // Walls + ceiling: pure black + unlit — identical to the scene background, so
    // the shell dissolves into the atmospheric fog and never reads as a lit surface.
    const blackMat = new THREE.MeshBasicMaterial({
      color: 0x000000, side: THREE.DoubleSide,
    });
    // Floor: faintly LIT near-black, so the green player-follow light reveals the
    // ground underfoot as you walk. Without this the room is an unreadable void
    // (pure-black walls + no light + fogged-out pit = a screen that looks crashed).
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x070707, roughness: 1, metalness: 0, side: THREE.DoubleSide,
    });

    // (Pit footprint + far wall computed above.)

    // ---- FLOOR (Y=0), with the pit cut out — three border slabs around the chasm ----
    const addFloor = (x0, x1, z0, z1) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), floorMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
      br.add(m);
    };
    addFloor(pxMax, eastX, zN, zS);      // main slab, east of the chasm
    addFloor(westX, pxMax, zN, pzMin);   // north ledge beside the chasm
    addFloor(westX, pxMax, pzMax, zS);   // south ledge beside the chasm

    // ---- CEILING (Y=BR_H) ----
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(eastX - westX, zS - zN), blackMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set((eastX + westX) / 2, BR_H, (zN + zS) / 2);
    br.add(ceil);

    // ---- PERIMETER WALLS (N, S, far-W). East stays OPEN: the hallway wall is the
    // divider and the two strips flanking it (Z < 0 and Z > 36) are the walk-throughs. ----
    const addWall = (len, cx, cz, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, BR_H), blackMat);
      m.position.set(cx, BR_H / 2, cz);
      m.rotation.y = ry;
      br.add(m);
    };
    addWall(eastX - westX, (eastX + westX) / 2, zN, 0);     // north wall
    addWall(eastX - westX, (eastX + westX) / 2, zS, 0);     // south wall
    addWall(zS - zN, westX, (zN + zS) / 2, Math.PI / 2);    // far west wall

    // ---- BOTTOMLESS PIT: 4 inner-facing shaft walls dropping into darkness.
    // The metal is a procedural "ship inner-workings" greeble texture (grey, dim,
    // like the structure of a hull); a solid heroic/noble blue wells up from the
    // bottom and tapers off as it rises, so it reads as energy glowing from far
    // below. Portal / Star Wars vibe. ----
    const SHAFT = 60;                                       // visual depth of the shaft

    // Procedural greeble panel texture: base metal, large panels with seams, then
    // scattered boxes / vents / conduit lines + a few indicator dots.
    const techTex = (() => {
      const TPX = 512;                                                    // higher-res so big tiles stay crisp
      const c = document.createElement('canvas'); c.width = TPX; c.height = TPX;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
      x.fillStyle = '#5a606a'; x.fillRect(0, 0, TPX, TPX);                 // base metal
      // faint brushed-vertical variation
      for (let i = 0; i < TPX; i += 2) {
        const s = 86 + (Math.random() * 22 | 0);
        x.fillStyle = `rgba(${s},${s + 4},${s + 10},0.10)`; x.fillRect(i, 0, 1, TPX);
      }
      // large panels in a grid, each a slightly different shade, bevelled seams
      const cells = 6, step = TPX / cells;
      for (let gy = 0; gy < cells; gy++) for (let gx = 0; gx < cells; gx++) {
        const px = gx * step, py = gy * step, sh = 78 + (Math.random() * 36 | 0);
        x.fillStyle = `rgb(${sh},${sh + 5},${sh + 12})`;
        x.fillRect(px + 3, py + 3, step - 6, step - 6);
        x.strokeStyle = 'rgba(255,255,255,0.10)'; x.lineWidth = 1.5; x.strokeRect(px + 3.5, py + 3.5, step - 7, step - 7);
        x.strokeStyle = 'rgba(0,0,0,0.35)'; x.strokeRect(px + 5, py + 5, step - 10, step - 10);
      }
      // greebles: scattered boxes (recessed dark + raised light)
      for (let i = 0; i < 170; i++) {
        const gw = 6 + (Math.random() * 28 | 0), gh = 4 + (Math.random() * 16 | 0);
        const gx = Math.random() * (TPX - gw) | 0, gy = Math.random() * (TPX - gh) | 0;
        const v = (Math.random() < 0.5 ? 40 + (Math.random() * 20 | 0) : 120 + (Math.random() * 60 | 0));
        x.fillStyle = `rgb(${v},${v + 4},${v + 10})`; x.fillRect(gx, gy, gw, gh);
        x.strokeStyle = 'rgba(0,0,0,0.40)'; x.lineWidth = 1; x.strokeRect(gx + 0.5, gy + 0.5, gw - 1, gh - 1);
      }
      // horizontal conduit / pipe lines
      for (let i = 0; i < 10; i++) {
        const py = Math.random() * TPX | 0, h = 3 + (Math.random() * 5 | 0);
        x.fillStyle = 'rgba(20,24,30,0.70)'; x.fillRect(0, py, TPX, h);
        x.fillStyle = 'rgba(170,180,195,0.25)'; x.fillRect(0, py - 1, TPX, 1);
      }
      // small indicator dots
      for (let i = 0; i < 28; i++) {
        const gx = Math.random() * TPX | 0, gy = Math.random() * TPX | 0;
        x.fillStyle = 'rgba(200,210,225,0.50)'; x.fillRect(gx, gy, 3, 3);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.magFilter = THREE.NearestFilter;
      tex.needsUpdate = true;
      return tex;
    })();

    const pitGlowMat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: techTex }, uShaft: { value: SHAFT } },
      side: THREE.DoubleSide,
      fog: false,   // ignore the room fog so the shaft reads from across the dark room
      vertexShader: `
        varying vec2 vUv; varying float vH;
        uniform float uShaft;
        void main() {
          vUv = uv;                              // already tiled per-wall via geometry uv
          vH = position.y / uShaft + 0.5;        // 0 = deep bottom, 1 = rim
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uTex; varying vec2 vUv; varying float vH;
        void main() {
          vec3 metal = texture2D(uTex, vUv).rgb;            // grey ship inner-workings
          vec3 baseCol = metal * 0.55;                      // dim it — structure sits in shadow
          // Solid heroic/noble blue welling up from the bottom, tapering as it rises.
          vec3 blue = vec3(0.22, 0.55, 1.00);
          float rise = pow(clamp(1.0 - vH, 0.0, 1.0), 1.3); // 1 at bottom -> 0 at the rim
          vec3 col = baseCol + blue * rise * 1.7;           // glow lifts the metal
          col = mix(col, blue * 1.25, rise * 0.6);          // deep bottom reads as near-solid blue
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const addShaft = (len, cx, cz, ry) => {
      const geo = new THREE.PlaneGeometry(len, SHAFT);
      // Tile the greeble texture at a uniform ~18m per repeat — big tiles so the
      // pattern doesn't obviously repeat. Bake the repeat into the uvs.
      const TILE = 18;
      const ru = Math.max(1, Math.round(len / TILE)), rv = Math.max(1, Math.round(SHAFT / TILE));
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * rv);
      uv.needsUpdate = true;
      const m = new THREE.Mesh(geo, pitGlowMat);
      m.position.set(cx, -SHAFT / 2, cz);
      m.rotation.y = ry;
      br.add(m);
    };
    addShaft(pxMax - pxMin, pitCx, pzMin, 0);            // north shaft wall
    addShaft(pxMax - pxMin, pitCx, pzMax, 0);            // south shaft wall
    addShaft(pzMax - pzMin, pxMax, pitCz, Math.PI / 2);  // east shaft wall
    addShaft(pzMax - pzMin, pxMin, pitCz, Math.PI / 2);  // west shaft wall (in the far-wall plane)

    // Opaque black SHELL wrapping the well just OUTSIDE the green planes (+ a
    // bottom cap). The green is DoubleSide / fog:false, so its outer faces would
    // otherwise glow out through floor seams and sightlines into the main room.
    // The shell blocks all of that: green is only visible looking down into the
    // open top of the pit. Slightly oversized + offset so it always occludes.
    const SH = 0.1;                                       // outward offset of the shell from the green
    const addShell = (len, cx, cz, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len + 2 * SH, SHAFT + 2 * SH), blackMat);
      m.position.set(cx, -SHAFT / 2, cz);
      m.rotation.y = ry;
      br.add(m);
    };
    addShell(pxMax - pxMin, pitCx, pzMin - SH, 0);           // north
    addShell(pxMax - pxMin, pitCx, pzMax + SH, 0);           // south
    addShell(pzMax - pzMin, pxMax + SH, pitCz, Math.PI / 2); // east
    addShell(pzMax - pzMin, pxMin - SH, pitCz, Math.PI / 2); // west
    const pitCap = new THREE.Mesh(
      new THREE.PlaneGeometry(pxMax - pxMin + 2 * SH, pzMax - pzMin + 2 * SH), blackMat);
    pitCap.rotation.x = -Math.PI / 2;
    pitCap.position.set(pitCx, -SHAFT - SH, pitCz);          // bottom cap, below the green
    br.add(pitCap);

    // ---- HOLO STOP-SIGNS — a little emitter "base ring" (gunmetal + steel band,
    // like the main-hall emitter bases) on either side of the pit projects a
    // glowing red octagon: "PLEASE / don't go any further". Amusement-park
    // "NO PUBLIC ACCESS" vibe, same red-hologram look as the outside red-button
    // peg. Visual only — the pit collision already stops the player at the rim. ----
    {
      const gunmetal = new THREE.MeshStandardMaterial({ color: 0x96a8b8, metalness: 0.85, roughness: 0.40 });
      const steel    = new THREE.MeshStandardMaterial({ color: 0xccdce8, metalness: 1.0,  roughness: 0.22 });
      const emitMat  = new THREE.MeshBasicMaterial({ color: 0xff2a14, transparent: true, opacity: 0.6,
        blending: THREE.AdditiveBlending, depthWrite: false });
      const beamMat  = new THREE.MeshBasicMaterial({ color: 0xff2a14, transparent: true, opacity: 0.12,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

      // Octagon "stop sign" hologram texture: glowing red border + bloom, hot text.
      const signTex = (() => {
        const S = 512; const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
        const c = cv.getContext('2d'); const mid = S / 2, R = S * 0.46;
        c.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = Math.PI / 8 + i * Math.PI / 4;
          const px = mid + R * Math.cos(a), py = mid + R * Math.sin(a);
          i ? c.lineTo(px, py) : c.moveTo(px, py);
        }
        c.closePath();
        c.fillStyle = 'rgba(255,30,20,0.10)'; c.fill();                       // faint red wash
        c.shadowColor = 'rgba(255,30,20,0.95)'; c.shadowBlur = 26;
        c.lineWidth = 14; c.strokeStyle = 'rgba(255,40,28,0.95)'; c.stroke();  // outer bloomed border
        c.shadowBlur = 12; c.lineWidth = 7; c.strokeStyle = 'rgba(255,95,75,1)'; c.stroke(); // hot inner border
        // warning "!" glyph in the centre — bloomed pass then a hot core
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = '900 320px Arial, "Helvetica Neue", sans-serif';
        c.shadowColor = 'rgba(255,30,20,0.95)'; c.shadowBlur = 30;
        c.fillStyle = 'rgba(255,40,28,0.95)'; c.fillText('!', mid, mid + 8);   // outer bloom
        c.shadowBlur = 12;
        c.fillStyle = 'rgba(255,165,145,1)'; c.fillText('!', mid, mid + 8);    // hot core
        const t = new THREE.CanvasTexture(cv); t.minFilter = THREE.LinearFilter; t.anisotropy = 4; return t;
      })();
      const signMat = new THREE.MeshBasicMaterial({ map: signTex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide });

      const makeHoloStop = (px, pz) => {
        const g = new THREE.Group(); g.position.set(px, 0, pz);
        // base ring: metal torus + bright steel band + glowing red emitter disc/ring
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.055, 10, 36), gunmetal);
        ring.rotation.x = Math.PI / 2; ring.position.y = 0.055; g.add(ring);
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.02, 8, 36), steel);
        band.rotation.x = Math.PI / 2; band.position.y = 0.10; g.add(band);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.44, 36), emitMat);
        disc.rotation.x = -Math.PI / 2; disc.position.y = 0.045; g.add(disc);
        const emitRing = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 8, 36), emitMat);
        emitRing.rotation.x = Math.PI / 2; emitRing.position.y = 0.07; g.add(emitRing);
        // projector beam: cone widening from the ring up to the sign
        const SIGN_Y = 2.05, SIGN = 1.35, beamH = SIGN_Y - 0.1;
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(SIGN * 0.42, 0.1, beamH, 24, 1, true), beamMat);
        beam.position.y = 0.1 + beamH / 2; g.add(beam);
        // the octagon sign, facing the approach (+X / east, toward the incoming player)
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(SIGN, SIGN), signMat);
        sign.position.y = SIGN_Y; sign.rotation.y = Math.PI / 2; g.add(sign);
        // soft red glow at the emitter so the metal base + floor catch it
        const gl = new THREE.PointLight(0xff2a14, 0.8, 6, 2.2); gl.position.y = 0.35; g.add(gl);
        br.add(g);
      };
      const SX = pxMax + 0.6;             // just east of the pit's near edge (approach side)
      makeHoloStop(SX, pzMin - 1.4);      // north side of the hole
      makeHoloStop(SX, pzMax + 1.4);      // south side of the hole
    }

    // ---- CARD TABLE at the pit's near edge under a gentle spotlight. Props only
    // for now (cards, chips, a snack bowl); seated figures + eye-follow come later.
    // The player walks up and is stopped just in front of it (blackRoomTable
    // blocking in main.js), facing across the table with the chasm glowing behind. ----
    const tableC = (blackRoomTable = { x: pxMax + 2, z: pitCz, r: 1.15 });
    {
      const woodMat  = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.70, metalness: 0.05 });
      const darkWood = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.75, metalness: 0.05 });
      const feltMat  = new THREE.MeshStandardMaterial({ color: 0x215036, roughness: 0.90, metalness: 0.0 });
      const tg = new THREE.Group(); tg.position.set(tableC.x, 0, tableC.z);

      // round felt-topped table on a pedestal + foot
      const TOP_Y = 0.95, TOP_R = tableC.r;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(TOP_R, TOP_R, 0.08, 40), woodMat);
      top.position.y = TOP_Y; tg.add(top);
      const felt = new THREE.Mesh(new THREE.CylinderGeometry(TOP_R * 0.9, TOP_R * 0.9, 0.012, 40), feltMat);
      felt.position.y = TOP_Y + 0.046; tg.add(felt);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, TOP_Y - 0.08, 18), darkWood);
      ped.position.y = (TOP_Y - 0.08) / 2; tg.add(ped);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.50, 0.06, 24), darkWood);
      foot.position.y = 0.03; tg.add(foot);

      // four chairs facing the table
      const SEAT_Y = 0.50;
      const legGeo = new THREE.CylinderGeometry(0.025, 0.025, SEAT_Y, 8);
      const makeChair = (ang) => {
        const ch = new THREE.Group();
        ch.position.set(Math.cos(ang) * (TOP_R + 0.45), 0, Math.sin(ang) * (TOP_R + 0.45));
        ch.rotation.y = -ang + Math.PI / 2;                 // face the table centre
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.07, 0.44), darkWood);
        seat.position.y = SEAT_Y; ch.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.50, 0.06), darkWood);
        back.position.set(0, SEAT_Y + 0.28, -0.19); ch.add(back);
        for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) {
          const leg = new THREE.Mesh(legGeo, darkWood); leg.position.set(lx, SEAT_Y / 2, lz); ch.add(leg);
        }
        tg.add(ch);
      };
      [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach(makeChair);

      // props on the felt: a fanned hand per seat, a couple of chip stacks, a snack bowl
      const TY = TOP_Y + 0.06;
      const cardMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6 });
      const addCard = (x, z, rot) => {
        const card = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.004, 0.17), cardMat);
        card.position.set(x, TY, z); card.rotation.y = rot; tg.add(card);
      };
      for (const ang of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const hx = Math.cos(ang) * (TOP_R * 0.62), hz = Math.sin(ang) * (TOP_R * 0.62);
        for (let k = -1; k <= 1; k++) addCard(hx, hz, -ang + k * 0.22);
      }
      const chipCols = [0xc23b3b, 0x3b6cc2, 0xe0e0e0];
      let ci = 0;
      for (const [cxp, czp] of [[-0.22, 0.10], [0.05, -0.18], [0.24, 0.16]]) {
        const cm = new THREE.MeshStandardMaterial({ color: chipCols[ci++ % 3], roughness: 0.5 });
        for (let s = 0; s < 4; s++) {
          const chip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 16), cm);
          chip.position.set(cxp, TY + s * 0.013, czp); tg.add(chip);
        }
      }
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.10, 0.08, 20),
        new THREE.MeshStandardMaterial({ color: 0x888c92, roughness: 0.4, metalness: 0.5 }));
      bowl.position.set(0, TY + 0.04, 0); tg.add(bowl);
      const snackMat = new THREE.MeshStandardMaterial({ color: 0xd8a24a, roughness: 0.7 });
      for (let s = 0; s < 5; s++) {
        const sn = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), snackMat);
        sn.position.set((Math.random() - 0.5) * 0.12, TY + 0.085, (Math.random() - 0.5) * 0.12); tg.add(sn);
      }

      br.add(tg);

      // gentle warm spotlight from above onto the table (adds to, doesn't replace,
      // the pit glow + holo signs). Intensity matches this scene's light scale
      // (its other spotlights are ~28 @ decay 1.4) — lower values are invisible.
      const SPOT_Y = 7.5;
      const spot = new THREE.SpotLight(0xfff1d6, 34, 20, 0.5, 0.5, 1.4);
      spot.position.set(tableC.x, SPOT_Y, tableC.z);
      spot.target.position.set(tableC.x, TOP_Y, tableC.z);
      br.add(spot); br.add(spot.target);

      // visible soft light-cone so the beam reads as "shining down", fading out
      // before it reaches the table so there's no hard disc.
      const beamH = SPOT_Y - TOP_Y, halfH = beamH / 2;
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0xfff1d6, transparent: true, opacity: 0.07,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      coneMat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying float vBeamY;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBeamY = position.y;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vBeamY;')
          .replace('#include <dithering_fragment>',
            `gl_FragColor.a *= smoothstep(${(-halfH).toFixed(2)}, ${(-halfH + 1.6).toFixed(2)}, vBeamY);\n#include <dithering_fragment>`);
      };
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 2.6, beamH, 28, 1, true), coneMat);
      cone.position.set(tableC.x, TOP_Y + halfH, tableC.z);
      br.add(cone);
    }

    group.add(br);
    blackRoom = br;
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

        // ---- Convoluted cybertronian purple tube bundle ----
        // Tangled cable mass strung from the dome (or flat ceiling) down to the
        // top of the chandelier. Tubes are siblings of the pivot (NOT children)
        // so they stay anchored when the chandelier spins; their bottom ends
        // plunge a half-meter into the top of the chandelier silhouette so the
        // static attachment is hidden by the GLB's geometry.
        const chandTopY = pivotY + ss.y / 2;
        const ceilingY  = opts.cyberDome ? (ROOM_CEIL + 5.6) : (ROOM_CEIL + 0.1);
        const spread    = Math.max(ss.x, ss.z);
        const bottomR   = spread * 0.22;
        const ceilingR  = spread * (opts.cyberDome ? 0.55 : 0.35);
        // Each tube gets its own dark matte material with a distinct hue
        // sweeping from deep indigo through royal purple to wine-magenta, so
        // individual cables read separately in the tangle instead of melting
        // into one mass.
        const tubesGroup = new THREE.Group();
        const N_TUBES = 13;
        for (let i = 0; i < N_TUBES; i++) {
          const hue = (0.66 + (i / N_TUBES) * 0.32 + (Math.random() - 0.5) * 0.04 + 1) % 1;
          const baseCol = new THREE.Color().setHSL(hue, 0.82, 0.08 + Math.random() * 0.05);
          const emCol   = new THREE.Color().setHSL(hue, 1.0,  0.38);
          const tubeMat = new THREE.MeshStandardMaterial({
            color: baseCol, emissive: emCol, emissiveIntensity: 0.12,
            metalness: 0.05, roughness: 0.96,
          });
          const a0 = Math.random() * Math.PI * 2;
          const a1 = Math.random() * Math.PI * 2;
          const bot = new THREE.Vector3(
            ANCHOR_X + Math.cos(a0) * bottomR * Math.random(),
            chandTopY - 0.4 * Math.random(),
            ANCHOR_Z + Math.sin(a0) * bottomR * Math.random(),
          );
          const top = new THREE.Vector3(
            ANCHOR_X + Math.cos(a1) * ceilingR * (0.4 + Math.random() * 0.8),
            ceilingY + Math.random() * 0.4,
            ANCHOR_Z + Math.sin(a1) * ceilingR * (0.4 + Math.random() * 0.8),
          );
          // Intermediate control points: lateral wander peaks mid-run so the
          // tangle is densest in the middle, and tubes braid through each other.
          const N_CTRL = 5;
          const pts = [bot];
          for (let k = 1; k <= N_CTRL; k++) {
            const tt = k / (N_CTRL + 1);
            const wander = Math.sin(tt * Math.PI) * spread * 0.40;
            const wa = a0 + tt * (a1 - a0) + (Math.random() - 0.5) * 2.4;
            pts.push(new THREE.Vector3(
              ANCHOR_X + Math.cos(wa) * wander + (bot.x - ANCHOR_X) * (1 - tt) + (top.x - ANCHOR_X) * tt,
              bot.y + (top.y - bot.y) * tt + (Math.random() - 0.5) * 0.7,
              ANCHOR_Z + Math.sin(wa) * wander + (bot.z - ANCHOR_Z) * (1 - tt) + (top.z - ANCHOR_Z) * tt,
            ));
          }
          pts.push(top);
          const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.6);
          const radius = 0.055 + Math.random() * 0.045;
          const geom = new THREE.TubeGeometry(curve, 96, radius, 8, false);
          const tube = new THREE.Mesh(geom, tubeMat);
          tubesGroup.add(tube);
        }
        group.add(tubesGroup);

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
        // Reskin ship meshes in the diamond-base biopunk palette: bulk in
        // gunmetal, brightest GLB meshes in shinier bandSteel for accent
        // variation. Same materials the museum diamond manifold uses.
        const shipGunmetal = new THREE.MeshStandardMaterial({
          color: 0xb0c0d0, metalness: 0.85, roughness: 0.40,
        });
        const shipBandSteel = new THREE.MeshStandardMaterial({
          color: 0xccdce8, metalness: 1.0, roughness: 0.22,
        });
        proto.traverse(o => {
          if (!o.isMesh || !o.material) return;
          const c = o.material.color;
          const lum = c ? c.r * 0.299 + c.g * 0.587 + c.b * 0.114 : 1;
          o.material = lum > 0.6 ? shipBandSteel : shipGunmetal;
        });
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
    walls, setWalls, shelfWalls, shelfDoor, blackRoom, blackRoomPit, blackRoomTable, floorMesh: floor, ceilMesh: ceilInst,
    torchLights, playerLight,
    waterMat,
    CELL, WALL_H: ROOM_CEIL,
    chandelier,
    dreidelVases, dreidelVaseBaseY, dreidelBounds, furnitureBounds, furnitureGroup,
    ready: Promise.all(pendingLoads),
  };
}
