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
  const W = 11, H = 9;
  const grid = [];
  const ceilH = [];
  const circle = opts && opts.roomShape === 'circle';
  const cx = 6, cy = 4, R = 4.0, R2 = R * R;
  for (let y = 0; y < H; y++) {
    grid[y] = new Array(W).fill(1);
    ceilH[y] = new Array(W).fill(STD_CEIL);
    for (let x = 0; x < W; x++) {
      const inHall = (y === 4 && x <= 1);
      let inRoom;
      if (circle) {
        const dx = x - cx, dy = y - cy;
        inRoom = x >= 2 && (dx * dx + dy * dy) <= R2;
      } else {
        inRoom = (x >= 2 && x <= 10);
      }
      if (inHall || inRoom) {
        grid[y][x] = 0;
        ceilH[y][x] = inHall ? STD_CEIL : ROOM_CEIL;
      }
    }
  }
  return {
    grid, ceilH, width: W, height: H,
    spawn: { x: 0, y: 4, dir: 1 }, // west end of hallway, facing east
  };
}

export function buildScene(opts) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040e08);
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
        vec3 deep  = vec3(0.01, 0.04, 0.11);
        vec3 mid   = vec3(0.04, 0.11, 0.24);
        vec3 crest = vec3(0.13, 0.24, 0.40);
        vec3 foam  = vec3(0.30, 0.40, 0.55);
        vec3 col = mix(deep, mid,   smoothstep(0.20, 0.58, wave));
        col       = mix(col, crest, smoothstep(0.50, 0.76, wave));
        col       = mix(col, foam,  smoothstep(0.73, 0.92, wave) * 0.55);
        col += vec3(0.4, 0.5, 0.6) * pow(max(0.0, wave - 0.85), 2.0) * 6.0;
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
  const floorCells = [];
  for (let y = 0; y < layout.height; y++) for (let x = 0; x < layout.width; x++) {
    if (layout.grid[y][x] === 0) floorCells.push({ x, y, ceilH: layout.ceilH[y][x] });
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
  // Seal the west end of the hallway (no grid tile exists at x=-1)
  wallCells.push({ x: -1, y: 4, h: STD_CEIL });
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
    } else {
      // Square room — three large planes along the player's N/E/W (world E/N/S).
      const ROOM_W_M = 9 * CELL;
      const ROOM_D_M = 9 * CELL;
      const cx = 6 * CELL, cz = 4 * CELL;
      const yMid = ROOM_CEIL / 2;
      const wE = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_D_M, ROOM_CEIL), oceanMat);
      wE.position.set(10 * CELL + CELL/2 - 0.01, yMid, cz);
      wE.rotation.y = -Math.PI / 2;
      group.add(wE);
      const wN = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W_M, ROOM_CEIL), oceanMat);
      wN.position.set(cx, yMid, -CELL/2 + 0.01);
      group.add(wN);
      const wS = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W_M, ROOM_CEIL), oceanMat);
      wS.position.set(cx, yMid, 8 * CELL + CELL/2 - 0.01);
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

  // 4 corner torches in the 9x9 room (mounted on outer N/S walls)
  addTorch(3,  0, 0);   // NW, north wall
  addTorch(9,  0, 0);   // NE, north wall
  addTorch(3,  8, 2);   // SW, south wall
  addTorch(9,  8, 2);   // SE, south wall
  // Two torches in the entry hallway (one on each side)
  addTorch(1, 4, 0);    // hallway north wall
  addTorch(1, 4, 2);    // hallway south wall

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
            sh.scale.multiplyScalar(1.05);
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
        const TARGET = 4.48; // 7/6 of the prior 3.84 m
        const s = maxD > 0 ? TARGET / maxD : 1;
        obj.scale.setScalar(s);
        const sb = new THREE.Box3().setFromObject(obj);
        const sc = sb.getCenter(new THREE.Vector3());
        const ss = sb.getSize(new THREE.Vector3());
        // Pivot wraps both GLB and corkscrew so they rotate together in place.
        const pivot = new THREE.Group();
        pivot.position.set(ANCHOR_X, ROOM_CEIL - 0.08 - ss.y / 2, ANCHOR_Z);
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
        const corkH = ss.y * 0.65;
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
        const corkGeom  = new THREE.TubeGeometry(corkCurve, segs, 0.05, 10, false);
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
    addChandelier(6 * CELL, 4 * CELL, ROOM_CEIL);
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
      dune.position.set(
        tx * CELL + (sR() - 0.5) * (CELL - 0.5), 0,
        ty * CELL + (sR() - 0.5) * (CELL - 0.5),
      );
      dune.rotation.y = sR() * Math.PI * 2;
      group.add(dune);
    }
  }

  // ===== HOVER SHIPS — miniature eskleoship GLB roaming the rolling hills =====
  if (opts.hoverShips) {
    const ROOM_CX = 6 * CELL, ROOM_CZ = 4 * CELL, ROOM_R = 6.0;
    const SHIP_N = 6, HOVER_Y = 0.45;
    pendingLoads.push(new Promise((resolve) => {
      new GLTFLoader().load('hallway4/eskleoship-01.glb', (gltf) => {
        const proto = gltf.scene;
        const bb = new THREE.Box3().setFromObject(proto);
        const sz = bb.getSize(new THREE.Vector3());
        const maxD = Math.max(sz.x, sz.y, sz.z);
        proto.scale.setScalar(maxD > 0 ? 0.32 / maxD : 1); // miniature ~0.32 m
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
        dust.onBeforeRender = () => {
          const now = performance.now();
          const dt = Math.min(0.06, (now - _last) / 1000); _last = now;
          for (const s of ships) {
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
        };
        resolve();
      }, undefined, err => { console.warn('[hallway2] eskleoship-01.glb failed', err); resolve(); });
    }));
  }

  return {
    scene, group, layout,
    walls, floorMesh: floor, ceilMesh: ceilInst,
    torchLights, playerLight,
    waterMat,
    CELL, WALL_H: ROOM_CEIL,
    chandelier,
    ready: Promise.all(pendingLoads),
  };
}
