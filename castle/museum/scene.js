// Wasapok Castle — scene builder.
// Variable per-cell ceiling height, room-specific props, portal location exposed.
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {
  getWallTexture, getFloorTexture, getCeilingTexture,
  makeTorchTexture, makeSignTexture, makeBannerTexture,
  makePortalTexture, makeStainedGlass, CAST,
} from './textures.js?v=33';

RectAreaLightUniformsLib.init();

const CELL = 2;
const STD_CEIL = 3.6;

export function buildScene(layout, opts) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040e08);
  scene.fog = new THREE.Fog(0x000000, 3, opts.fogDistance ?? 14);

  scene.add(new THREE.AmbientLight(0x020402, 0.15));
  scene.add(new THREE.HemisphereLight(0x060e08, 0x020402, 0.08));

  // Player-follow green light
  const playerLight = new THREE.PointLight(0x40ff80, 0.5, 5, 2);
  playerLight.position.set(0, 1.6, 0);
  scene.add(playerLight);

  // Materials
  // Walls: glowing cool LED-blue panels. Use kind='chrome' for Portal panels,
  // or 'stone' to restore the original medieval brick masonry.
  const wallTex = getWallTexture('glow');
  // Floor: Portal-style white chrome panels. Use 'glow' for LED panels, or
  // 'cobble' to restore the original cobblestone.
  const floorTex = getFloorTexture('chrome');
  const ceilTex = getCeilingTexture();

  // Walls — glow: same texture is used as both color and emissive map so the
  // bright panel pixels emit cool LED-blue light, dark seams stay dark.
  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTex,
    emissive: 0xffffff,
    emissiveMap: wallTex,
    emissiveIntensity: 1.8,
    roughness: 0.45, metalness: 0.20,
  });
  const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.95, metalness: 0 });

  // Floor — glass panels: transparent with grey/blue rivets. Water plane sits below.
  const glassTex = getFloorTexture('glass');
  const glassMap = glassTex.clone();
  glassMap.wrapS = glassMap.wrapT = THREE.RepeatWrapping;
  glassMap.repeat.set(layout.width, layout.height);
  glassMap.needsUpdate = true;
  const floorMat = new THREE.MeshStandardMaterial({
    map: glassMap,
    color: 0x9ab8d0,
    transparent: true,
    opacity: 0.18,
    roughness: 0.04,
    metalness: 0.05,
    depthWrite: false,
  });

  const ironMat = new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 0.6, metalness: 0.8 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a2e14, roughness: 0.85, metalness: 0 });
  const woodDarkMat = new THREE.MeshStandardMaterial({ color: 0x2a1808, roughness: 0.9, metalness: 0 });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xb88a3a, roughness: 0.35, metalness: 0.9, emissive: 0x3a2810, emissiveIntensity: 0.15,
  });
  const crimsonMat = new THREE.MeshStandardMaterial({ color: 0x7a1818, roughness: 0.8, metalness: 0 });

  const group = new THREE.Group();
  scene.add(group);
  const W = layout.width * CELL, H = layout.height * CELL;

  // WATER — animated rough water visible through glass floor above
  const waterMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
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
        for (int i = 0; i < 5; i++) {
          v += vnoise(p) * a; p = p * 2.1 + vec2(1.7, 9.2); a *= 0.5;
        }
        return v;
      }

      void main() {
        float t = uTime;
        vec2 uv = vUv * 7.0;
        vec2 q = vec2(fbm(uv + vec2(t*0.09, t*0.07)),
                      fbm(uv + vec2(t*0.11, t*0.06) + 5.2));
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

  // FLOOR — glass panels sit above the water, renderOrder after water so alpha blends correctly
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W/2 - CELL/2, 0, H/2 - CELL/2);
  floor.renderOrder = 1;
  group.add(floor);

  // CEILING — dark backing plane (near-invisible against fog) gives chandeliers
  // something to mount to and prevents seeing into the void above.
  const ceilGeom = new THREE.PlaneGeometry(CELL, CELL);
  const ceilMatI = new THREE.MeshStandardMaterial({
    color: 0x070b08, roughness: 1, metalness: 0,
  });
  const floorCells = [];
  for (let y = 0; y < layout.height; y++) for (let x = 0; x < layout.width; x++) {
    if (layout.grid[y][x] === 0) floorCells.push({ x, y, ceilH: layout.ceilH[y][x] });
  }
  const ceilInst = new THREE.InstancedMesh(ceilGeom, ceilMatI, floorCells.length);
  const m4 = new THREE.Matrix4(), v3 = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1,1,1);
  const flipEuler = new THREE.Euler(Math.PI/2, 0, 0);
  floorCells.forEach((c, i) => {
    v3.set(c.x * CELL, c.ceilH, c.y * CELL);
    q.setFromEuler(flipEuler);
    m4.compose(v3, q, sc);
    ceilInst.setMatrixAt(i, m4);
  });
  ceilInst.instanceMatrix.needsUpdate = true;
  group.add(ceilInst);

  // STALACTITES — metallic-white blades hanging like grass from every floor cell,
  // skipping the chandelier cell at each room's centre so nothing pokes through them.
  {
    const skipCells = new Set();
    for (const r of layout.rooms || []) skipCells.add(`${r.cx},${r.cy}`);

    const PER_CELL = 8;
    const stalGeom = new THREE.CylinderGeometry(0.055, 0.0, 1, 6);
    stalGeom.translate(0, -0.5, 0); // base at y=0 (ceiling), tip at y=-1
    const stalMat = new THREE.MeshStandardMaterial({
      color: 0xeaeaea, metalness: 0.95, roughness: 0.22,
    });
    let stalCells = 0;
    for (const c of floorCells) if (!skipCells.has(`${c.x},${c.y}`)) stalCells++;
    const stalInst = new THREE.InstancedMesh(stalGeom, stalMat, stalCells * PER_CELL);

    // Seeded RNG so the stalactite layout is stable across reloads.
    let seed = 0xc0ffee;
    const rand = () => { seed = (seed * 1664525 + 1013904223) | 0; return ((seed >>> 0) / 4294967296); };

    const eu = new THREE.Euler();
    let i = 0;
    for (const c of floorCells) {
      if (skipCells.has(`${c.x},${c.y}`)) continue;
      for (let n = 0; n < PER_CELL; n++) {
        const rx = (rand() - 0.5) * (CELL - 0.18);
        const rz = (rand() - 0.5) * (CELL - 0.18);
        const len = 0.43 + rand() * 1.02;       // 0.43 – 1.45 m  (−80%)
        const thick = 0.55 + rand() * 0.85;
        const tiltX = (rand() - 0.5) * 0.32;
        const tiltZ = (rand() - 0.5) * 0.32;
        const yaw = rand() * Math.PI * 2;
        v3.set(c.x * CELL + rx, c.ceilH, c.y * CELL + rz);
        eu.set(tiltX, yaw, tiltZ);
        q.setFromEuler(eu);
        sc.set(thick, len, thick);
        m4.compose(v3, q, sc);
        stalInst.setMatrixAt(i++, m4);
      }
    }
    sc.set(1, 1, 1); // reset for the wall section below
    stalInst.instanceMatrix.needsUpdate = true;
    group.add(stalInst);
  }

  // WALLS as boxes — height = max ceiling of any adjacent floor
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

  // ===== LIGHTS =====
  const torchTex = makeTorchTexture();
  const torchLights = [];

  function addTorch(t) {
    const wx = t.x * CELL, wz = t.y * CELL;
    const nx = [0,1,0,-1][t.wall], nz = [-1,0,1,0][t.wall];
    const ox = nx * (CELL/2 - 0.02), oz = nz * (CELL/2 - 0.02);

    const grp = new THREE.Group();
    grp.position.set(wx + ox, 1.95, wz + oz);
    grp.rotation.y = [0, -Math.PI/2, Math.PI, Math.PI/2][t.wall];

    // Iron ring sconce (wall mount)
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.13, 0.022, 8, 16), ironMat
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0, 0.06);
    grp.add(ring);
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.035, 0.14), ironMat
    );
    arm.position.set(0, 0, 0.03);
    grp.add(arm);

    // Glowing orb core
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0x20ff60, emissive: 0x40ff80, emissiveIntensity: 4.5,
      roughness: 0.08, metalness: 0.0,
    });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), orbMat);
    orb.position.set(0, 0, 0.17);
    grp.add(orb);
    // Outer glow halo
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x40ff80, transparent: true, opacity: 0.13, depthWrite: false,
    });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), haloMat);
    halo.position.set(0, 0, 0.17);
    grp.add(halo);

    group.add(grp);

    // Point light — neon green
    const pl = new THREE.PointLight(0x40ff80, 1.8, 7, 1.7);
    pl.position.set(wx + nx * 0.45, 2.2, wz + nz * 0.45);
    group.add(pl);
    torchLights.push({ light: pl, baseIntensity: 1.8, orb, halo, kind: 'torch' });
  }

  function addChandelier(wx, wz, ceilH) {
    const ch = new THREE.Group();
    ch.position.set(wx, ceilH, wz);
    const chainLen = ceilH > 4.5 ? 1.4 : 0.5;
    // chain
    const chain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, chainLen, 6), ironMat
    );
    chain.position.y = -chainLen/2;
    ch.add(chain);
    // ring crown
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.45, 0.04, 8, 24), ironMat
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -chainLen - 0.05;
    ch.add(ring);
    // Floating orbs around the ring
    const orbCount = 8;
    const smallOrbMat = new THREE.MeshStandardMaterial({
      color: 0x20ff60, emissive: 0x40ff80, emissiveIntensity: 4.5,
      roughness: 0.1, metalness: 0,
    });
    for (let i = 0; i < orbCount; i++) {
      const a = (i / orbCount) * Math.PI * 2;
      const cx = Math.cos(a) * 0.42, cz = Math.sin(a) * 0.42;
      const smallOrb = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 10, 8), smallOrbMat
      );
      smallOrb.position.set(cx, -chainLen + 0.08, cz);
      ch.add(smallOrb);
      const sh = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0x40ff80, transparent: true, opacity: 0.10, depthWrite: false })
      );
      sh.position.set(cx, -chainLen + 0.08, cz);
      ch.add(sh);
    }
    // central point light — neon green
    const intensity = ceilH > 4.5 ? 2.0 : 1.4;
    const range = ceilH > 4.5 ? 11 : 8;
    const pl = new THREE.PointLight(0x40ff80, intensity, range, 1.7);
    pl.position.y = -chainLen + 0.05;
    ch.add(pl);
    group.add(ch);
    torchLights.push({ light: pl, baseIntensity: intensity, kind: 'chandelier' });
  }

  // ===== ORGANIC ORANGE-GLASS SEA-ANEMONE CHANDELIER — upside-down, ceiling-hung.
  // ~40 randomly-distributed tapered tentacles emerging from a small fused glass
  // body, in iconic Half-Life HEV-suit orange. A faint internal glow + soft
  // surrounding light make the whole organic form clearly visible.
  function addUmbrellaChandelier(wx, wz, ceilH) {
    const grp = new THREE.Group();
    grp.position.set(wx, ceilH, wz);

    // Ceiling mount
    const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.06, 12), ironMat);
    mount.position.y = -0.03;
    grp.add(mount);

    // Iron stem — longer in tall hub so the form drops into view
    const stemLen = ceilH > 4.5 ? 0.85 : 0.18;
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.030, stemLen, 8), ironMat
    );
    stem.position.y = -stemLen / 2;
    grp.add(stem);

    // Anemone group — origin at the bottom of the stem (top of the body)
    const anem = new THREE.Group();
    anem.position.y = -stemLen;
    anem.scale.set(2, 2, 2); // 100% larger diameter (uniform scale)
    grp.add(anem);

    // ---- Half-Life iconic HEV-orange palette ----
    const HL_ORANGE = 0xff6800;   // canonical HEV / Lambda orange
    const HL_HOT    = 0xff4400;   // deeper hot emissive
    const HL_BRIGHT = 0xffb060;   // tip highlight

    // Solid glass material — opaque + high emissive + near-zero roughness reads
    // visually as glowing orange glass. Avoids the z-sort artifacts that plague
    // overlapping transparent meshes.
    const glassMat = new THREE.MeshStandardMaterial({
      color: HL_ORANGE, emissive: HL_HOT, emissiveIntensity: 5.0,
      roughness: 0.05, metalness: 0.0,
    });
    const tipMat = new THREE.MeshStandardMaterial({
      color: HL_BRIGHT, emissive: 0xff7800, emissiveIntensity: 7.0,
      roughness: 0.04, metalness: 0.0,
    });

    // Custom tapered-tube builder — TubeGeometry uses a constant radius, but
    // anemone tentacles need to taper from thick base to thin tip.
    function buildTaperedTube(curve, tubularSegs, radialSegs, radiusFn) {
      const positions = [];
      const normals = [];
      const indices = [];
      const frames = curve.computeFrenetFrames(tubularSegs, false);
      const P = new THREE.Vector3();

      for (let i = 0; i <= tubularSegs; i++) {
        const t = i / tubularSegs;
        curve.getPointAt(t, P);
        const r = radiusFn(t);
        const N = frames.normals[i];
        const B = frames.binormals[i];
        for (let j = 0; j <= radialSegs; j++) {
          const v = (j / radialSegs) * Math.PI * 2;
          const sin = Math.sin(v), cos = -Math.cos(v);
          const nx = cos * N.x + sin * B.x;
          const ny = cos * N.y + sin * B.y;
          const nz = cos * N.z + sin * B.z;
          positions.push(P.x + nx * r, P.y + ny * r, P.z + nz * r);
          normals.push(nx, ny, nz);
        }
      }
      for (let i = 1; i <= tubularSegs; i++) {
        for (let j = 1; j <= radialSegs; j++) {
          const a = (radialSegs + 1) * (i - 1) + (j - 1);
          const b = (radialSegs + 1) *  i      + (j - 1);
          const c = (radialSegs + 1) *  i      +  j;
          const d = (radialSegs + 1) * (i - 1) +  j;
          indices.push(a, b, d, b, c, d);
        }
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,   3));
      geom.setIndex(indices);
      return geom;
    }

    // Seeded RNG so the layout is stable across reloads
    let seed = 0xa1cef00d;
    const rand = () => { seed = (seed * 1664525 + 1013904223) | 0; return ((seed >>> 0) / 4294967296); };

    // ---- Central body ----
    // Cluster of overlapping fused spheres — reads as an organic glass blob
    // rather than a clean geometric shape. All in HL orange glass.
    const BODY_BLOBS = 7;
    for (let i = 0; i < BODY_BLOBS; i++) {
      const r = 0.075 + rand() * 0.05;
      const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), glassMat);
      blob.position.set(
        (rand() - 0.5) * 0.10,
        -0.06 + (rand() - 0.5) * 0.06,
        (rand() - 0.5) * 0.10,
      );
      anem.add(blob);
    }

    // ---- Tentacle mass ----
    // ~40 tentacles, each emerging from a slightly randomized point near the
    // body, sweeping outward and down with organic S-curves and tapering radius.
    const TENTACLES = 42;
    for (let i = 0; i < TENTACLES; i++) {
      // Origin slightly jittered around the body centre
      const oa = rand() * Math.PI * 2;
      const oR = 0.04 + rand() * 0.07;
      const ox = Math.cos(oa) * oR;
      const oz = Math.sin(oa) * oR;
      const oy = -0.05 + (rand() - 0.5) * 0.07;

      // Exit angle roughly follows origin direction (radial flow), with jitter
      const a   = oa + (rand() - 0.5) * 0.5;
      const cs  = Math.cos(a), sn = Math.sin(a);

      // Length / shape varies — some short & stubby, some long & trailing
      const lengthBias = rand();           // 0..1
      const reach = 0.20 + lengthBias * 0.70;   // 0.20 – 0.90 m outward
      const drop  = 0.35 + lengthBias * 0.55 + rand() * 0.20;  // 0.35 – 1.10 m down

      // Mid-curve organic wobble for non-uniform paths
      const wob1X = (rand() - 0.5) * 0.12;
      const wob1Z = (rand() - 0.5) * 0.12;
      const wob1Y = (rand() - 0.5) * 0.10;
      const wob2X = (rand() - 0.5) * 0.08;
      const wob2Z = (rand() - 0.5) * 0.08;

      // Tapered radii — base thick (anemone arm), tip thin
      const baseR = 0.038 + rand() * 0.025;     // 0.038 – 0.063
      const tipR  = 0.008 + rand() * 0.012;     // 0.008 – 0.020

      const pts = [
        new THREE.Vector3(ox,                             oy,                          oz),
        new THREE.Vector3(ox + cs * 0.10,                 oy - drop * 0.12,            oz + sn * 0.10),
        new THREE.Vector3(cs * (reach * 0.45) + wob1X,    oy - drop * 0.45 + wob1Y,    sn * (reach * 0.45) + wob1Z),
        new THREE.Vector3(cs * (reach * 0.78) + wob2X,    oy - drop * 0.78,            sn * (reach * 0.78) + wob2Z),
        new THREE.Vector3(cs * reach,                     oy - drop,                   sn * reach),
      ];
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.45);
      // Smooth taper with slight power-curve bias toward thinner tips
      const radiusFn = (t) => baseR + (tipR - baseR) * Math.pow(t, 1.25);
      const geom = buildTaperedTube(curve, 16, 7, radiusFn);
      anem.add(new THREE.Mesh(geom, glassMat));

      // Bright nematocyst tip bulb
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(tipR * 2.4, 8, 6), tipMat
      );
      bulb.position.copy(curve.getPoint(1));
      anem.add(bulb);
    }

    // Single transparent halo — visible orange aura around the form
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 18, 12),
      new THREE.MeshBasicMaterial({
        color: HL_ORANGE, transparent: true, opacity: 0.08, depthWrite: false,
      })
    );
    halo.position.y = -0.30;
    anem.add(halo);

    // ---- Lighting ----
    // Three layers: an internal point light makes the form self-illuminate so
    // every tentacle reads, a soft RectAreaLight casts a faint orange wash on
    // the floor below, and a wider PointLight tints the surrounding walls.
    const anemY = ceilH - stemLen;

    // Internal — small range, illuminates the tentacle mass from within
    const inner = new THREE.PointLight(0xff8030, 4.0, 2.2, 1.4);
    inner.position.set(wx, anemY - 0.10, wz);
    group.add(inner);

    // Soft downward area wash — 6000 K cool daylight
    const area = new THREE.RectAreaLight(0xcce8ff, 14.0, 3.0, 3.0);
    area.position.set(wx, anemY - 0.50, wz);
    area.lookAt(wx, 0, wz);
    group.add(area);

    // Faint room-wide orange glow — drives the gentle 'umbrella' flicker
    const glow = new THREE.PointLight(HL_ORANGE, 4.0, 14, 1.7);
    glow.position.set(wx, anemY - 0.30, wz);
    group.add(glow);
    torchLights.push({ light: glow, baseIntensity: 4.0, kind: 'umbrella' });
  }

  for (const l of layout.lights || []) {
    if (l.kind === 'chandelier') addChandelier(l.x * CELL, l.y * CELL, l.ceilH || STD_CEIL);
    else addTorch(l);
  }

  // ===== SALOON DOORS =====
  const saloonDoors = [];

  const doorWoodMat = new THREE.MeshStandardMaterial({ color: 0x5c3520, roughness: 0.88, metalness: 0.02 });
  const doorIronMat = new THREE.MeshStandardMaterial({ color: 0x252018, roughness: 0.55, metalness: 0.90 });

  function addSaloonDoor(doorCX, doorCZ, doorYaw) {
    // Classic western batwing: mid-height panel, hinge edge taller than inner,
    // concave curve across the top that dips toward the inner edge.
    const THICK      = 0.09;
    const PANEL_BASE = 0.60;   // bottom of panel off the floor (leave foot gap)
    const OUTER_H    = 1.18;   // panel height at the hinge edge
    const INNER_H    = 0.80;   // panel height at the inner (centre) edge
    const DIP        = 0.28;   // how far the top curve dips below INNER_H
    const leafW      = CELL / 2 - 0.04;

    const doorGrp = new THREE.Group();
    doorGrp.position.set(doorCX, 0, doorCZ);
    doorGrp.rotation.y = doorYaw;

    function makeLeaf(side) {
      const leaf = new THREE.Group();
      leaf.position.x = side * (CELL / 2);   // hinge pivot at outer edge

      // sx: direction the panel extends from the hinge (+1 left leaf, −1 right leaf)
      const sx = -side;

      // Batwing silhouette — 2-D shape in the XY plane, extruded in Z for thickness.
      // Hinge is at x=0; inner edge is at x = sx*leafW.
      // Top edge: straight inner corner, then a deep concave bezier arc up to the
      // tall hinge corner — that concave dip is the "batwing" detail.
      const shape = new THREE.Shape();
      shape.moveTo(0, PANEL_BASE);                         // hinge bottom
      shape.lineTo(sx * leafW, PANEL_BASE);                // inner bottom
      shape.lineTo(sx * leafW, PANEL_BASE + INNER_H);      // inner top corner
      shape.bezierCurveTo(
        sx * leafW * 0.72, PANEL_BASE + INNER_H - DIP * 0.6,   // ctrl 1: near inner, dipping
        sx * leafW * 0.28, PANEL_BASE + INNER_H - DIP,          // ctrl 2: toward hinge, max dip
        0, PANEL_BASE + OUTER_H                                   // hinge top corner
      );
      shape.closePath();

      const panelGeom = new THREE.ExtrudeGeometry(shape, { depth: THICK, bevelEnabled: false });
      panelGeom.translate(0, 0, -THICK / 2);   // centre panel around z=0
      leaf.add(new THREE.Mesh(panelGeom, doorWoodMat));

      // Two horizontal iron cross-braces at safe heights inside the panel
      for (const by of [PANEL_BASE + 0.13, PANEL_BASE + INNER_H * 0.52]) {
        const brace = new THREE.Mesh(
          new THREE.BoxGeometry(leafW * 0.88, 0.048, THICK + 0.014), doorIronMat
        );
        brace.position.set(sx * leafW * 0.44, by, 0);
        leaf.add(brace);
      }

      // Hinge plates (top and bottom, on the hinge side)
      for (const hy of [PANEL_BASE + 0.10, PANEL_BASE + OUTER_H - 0.10]) {
        const hinge = new THREE.Mesh(
          new THREE.BoxGeometry(leafW * 0.36, 0.11, 0.032), doorIronMat
        );
        hinge.position.set(sx * leafW * 0.18, hy, THICK / 2 + 0.016);
        leaf.add(hinge);
      }

      return leaf;
    }

    const leftLeaf  = makeLeaf(-1);
    const rightLeaf = makeLeaf(1);
    doorGrp.add(leftLeaf);
    doorGrp.add(rightLeaf);
    group.add(doorGrp);

    return { leftLeaf, rightLeaf, doorCX, doorCZ, doorYaw, leftAngle: 0, rightAngle: 0, swingDir: 1 };
  }

  // ===== DOORS =====
  for (const s of layout.signs || []) {
    const wx = s.x * CELL, wz = s.y * CELL;
    const ox = [0,1,0,-1][s.wall] * (CELL/2 - 0.02);
    const oz = [-1,0,1,0][s.wall] * (CELL/2 - 0.02);
    const isPortalSign = s.toRoom === 'portal';

    // Saloon doors at every passage opening
    {
      const doorDX = [0, CELL/2, 0, -CELL/2][s.wall];
      const doorDZ = [-CELL/2, 0, CELL/2, 0][s.wall];
      const doorYaw = [0, Math.PI/2, 0, Math.PI/2][s.wall];
      saloonDoors.push(addSaloonDoor(wx + doorDX, wz + doorDZ, doorYaw));
    }

    // Beacon glow for the portal door — visible from across the hall
    if (isPortalSign) {
      const beacon = new THREE.PointLight(0x6090ff, 1.8, 8, 1.5);
      beacon.position.set(wx + ox * 0.6, 2.6, wz + oz * 0.6);
      group.add(beacon);
      torchLights.push({ light: beacon, baseIntensity: 1.8, kind: 'portalBeacon' });
    }
  }

  // ===== ROOM PROPS =====
  const portalInfo = { tile: null, world: null, faceDir: 0 };

  for (const room of layout.rooms || []) {
    const rx0 = room.x0 * CELL, rz0 = room.y0 * CELL;
    const rcx = room.cx * CELL, rcz = room.cy * CELL;

    addUmbrellaChandelier(rcx, rcz, room.ceilH || STD_CEIL);

    if (room.kind === 'throne') {
      // Throne against the NORTH wall (room.y0 + ~0.5 cell from wall, facing south)
      const throneZ = (room.y0 + 0.5) * CELL;
      const throneX = rcx;
      // Dais (raised platform)
      const dais = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.25, 1.6),
        new THREE.MeshStandardMaterial({ color: 0x3a322a, roughness: 0.9 })
      );
      dais.position.set(throneX, 0.125, throneZ + 0.4);
      group.add(dais);
      // Throne seat
      const seat = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.4, 0.7), woodDarkMat
      );
      seat.position.set(throneX, 0.55, throneZ + 0.5);
      group.add(seat);
      // Throne back (tall)
      const back = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 1.6, 0.15), woodDarkMat
      );
      back.position.set(throneX, 1.45, throneZ + 0.25);
      group.add(back);
      // Gold crown on top of back
      const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.32, 0.12, 8), brassMat
      );
      crown.position.set(throneX, 2.32, throneZ + 0.25);
      group.add(crown);
      // Crimson banners flanking — on the north wall
      const bannerTex = makeBannerTexture('⚜');
      for (const sx of [-1.6, 1.6]) {
        const banner = new THREE.Mesh(
          new THREE.PlaneGeometry(0.9, 2.2),
          new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.8, side: THREE.DoubleSide })
        );
        banner.position.set(throneX + sx, 1.9, room.y0 * CELL + 0.02);
        group.add(banner);
      }
    }

    if (room.kind === 'library') {
      // Bookshelves along east + west walls (interior columns)
      const shelfMat = new THREE.MeshStandardMaterial({ color: 0x2a1808, roughness: 0.9 });
      const bookMat = (col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 });
      const palette = [0x6a1818, 0x18482a, 0x1a3a6a, 0x6a4a18, 0x18484a, 0x4a1818, 0x483a18];
      for (const wall of [3, 1]) { // west then east
        const isWest = wall === 3;
        const wallX = isWest ? room.x0 * CELL : (room.x0 + room.w - 1) * CELL;
        const offSide = isWest ? CELL/2 - 0.3 : -(CELL/2 - 0.3);
        for (let dy = 1; dy < room.h - 1; dy++) {
          const z = (room.y0 + dy) * CELL;
          // Shelf cabinet (box)
          const cabinet = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 2.2, 1.6), shelfMat
          );
          cabinet.position.set(wallX + offSide, 1.1, z);
          group.add(cabinet);
          // 3 shelves of books per cabinet (planes of varied color)
          for (let s = 0; s < 3; s++) {
            const sy = 0.4 + s * 0.65;
            for (let i = 0; i < 5; i++) {
              const bw = 0.06 + Math.random() * 0.06;
              const bh = 0.32 + Math.random() * 0.15;
              const book = new THREE.Mesh(
                new THREE.BoxGeometry(0.15, bh, bw),
                bookMat(palette[i % palette.length])
              );
              book.position.set(
                wallX + offSide - (isWest ? 0.3 : -0.3),
                sy + bh/2 - 0.05,
                z - 0.6 + i * 0.25
              );
              group.add(book);
            }
          }
        }
      }
      // Reading podium in the center
      const podiumBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.32, 1.1, 8), woodDarkMat
      );
      podiumBase.position.set(rcx, 0.55, rcz);
      group.add(podiumBase);
      const podiumTop = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.06, 0.5), woodDarkMat
      );
      podiumTop.position.set(rcx, 1.13, rcz);
      podiumTop.rotation.x = -Math.PI / 12;
      group.add(podiumTop);
      // Glowing parchment on top of the podium
      const parchment = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.36),
        new THREE.MeshStandardMaterial({
          color: 0xd8c896, emissive: 0xffd680, emissiveIntensity: 0.3, roughness: 0.7,
        })
      );
      parchment.rotation.x = -Math.PI / 2 + Math.PI / 12;
      parchment.position.set(rcx, 1.18, rcz - 0.04);
      group.add(parchment);
      // Stained glass on the north wall (lit from behind)
      const sgTex = makeStainedGlass(7);
      const sg = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 2.4),
        new THREE.MeshStandardMaterial({
          map: sgTex, transparent: true, side: THREE.DoubleSide,
          emissive: 0xffffff, emissiveIntensity: 0.6, emissiveMap: sgTex,
        })
      );
      sg.position.set(rcx, 2.0, room.y0 * CELL + 0.05);
      group.add(sg);
    }

    if (room.kind === 'armory') {
      // Two suits of armor (stacked geometry) flanking the west/east entry; weapon racks on north
      function makeArmor(px, pz) {
        const grp = new THREE.Group();
        grp.position.set(px, 0, pz);
        const matSteel = new THREE.MeshStandardMaterial({
          color: 0x9a9aa0, roughness: 0.4, metalness: 0.85,
        });
        // legs
        const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.35), matSteel);
        legs.position.y = 0.45; grp.add(legs);
        // torso
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.4), matSteel);
        torso.position.y = 1.25; grp.add(torso);
        // helmet
        const helm = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), matSteel);
        helm.position.y = 1.78; grp.add(helm);
        // visor slot
        const visor = new THREE.Mesh(
          new THREE.BoxGeometry(0.32, 0.04, 0.02),
          new THREE.MeshStandardMaterial({ color: 0x000000 })
        );
        visor.position.set(0, 1.78, 0.22); grp.add(visor);
        // crest
        const crest = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.4), crimsonMat);
        crest.position.y = 1.98; grp.add(crest);
        // shoulder spikes
        for (const sx of [-0.32, 0.32]) {
          const sh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), matSteel);
          sh.position.set(sx, 1.5, 0); grp.add(sh);
        }
        // sword in front
        const sword = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.02), matSteel);
        sword.position.set(0, 0.55, 0.28); grp.add(sword);
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.06), brassMat);
        guard.position.set(0, 1.0, 0.28); grp.add(guard);
        const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.07), woodMat);
        hilt.position.set(0, 1.15, 0.28); grp.add(hilt);
        return grp;
      }
      group.add(makeArmor((room.x0 + 1.5) * CELL, (room.cy) * CELL));
      group.add(makeArmor((room.x0 + room.w - 2.5) * CELL, (room.cy) * CELL));
      // Weapon rack on north wall — horizontal beam with sword silhouettes
      const rack = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 0.12, 0.16), woodDarkMat
      );
      rack.position.set(rcx, 1.8, room.y0 * CELL + 0.15);
      group.add(rack);
      // hanging weapons
      const matSteel = new THREE.MeshStandardMaterial({
        color: 0xc8c8d0, roughness: 0.3, metalness: 0.9,
      });
      for (let i = 0; i < 5; i++) {
        const ix = rcx - 1.4 + i * 0.7;
        // sword
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.2, 0.02), matSteel);
        blade.position.set(ix, 1.2, room.y0 * CELL + 0.18);
        group.add(blade);
        const cguard = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.05), brassMat);
        cguard.position.set(ix, 1.78, room.y0 * CELL + 0.2);
        group.add(cguard);
        const chilt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.05), woodMat);
        chilt.position.set(ix, 1.88, room.y0 * CELL + 0.2);
        group.add(chilt);
      }
    }

    if (room.kind === 'portal') {
      // The portal sits on the SOUTH wall of the portal room (far wall from entry).
      // Entry corridor comes from NORTH, so player walks INTO the room facing south.
      // Portal location: tile (room.cx, room.y0 + room.h - 1), wall = south = 2
      const ptx = room.cx;
      const pty = room.y0 + room.h - 1;
      const wx = ptx * CELL, wz = pty * CELL;
      const wallY = 0; // floor reference
      // Stone archway frame (two pillars + lintel)
      const archStone = new THREE.MeshStandardMaterial({
        color: 0x4a423a, roughness: 0.9, metalness: 0.1,
      });
      const pillarH = 2.8, pillarW = 0.35;
      const archGap = 1.6;
      for (const sx of [-archGap/2 - pillarW/2, archGap/2 + pillarW/2]) {
        const pillar = new THREE.Mesh(
          new THREE.BoxGeometry(pillarW, pillarH, 0.4), archStone
        );
        pillar.position.set(wx + sx, pillarH/2, wz + CELL/2 - 0.25);
        group.add(pillar);
        // base + cap
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), archStone);
        cap.position.set(wx + sx, pillarH, wz + CELL/2 - 0.25);
        group.add(cap);
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.5), archStone);
        base.position.set(wx + sx, 0.09, wz + CELL/2 - 0.25);
        group.add(base);
      }
      const lintel = new THREE.Mesh(
        new THREE.BoxGeometry(archGap + pillarW * 2 + 0.4, 0.45, 0.4), archStone
      );
      lintel.position.set(wx, pillarH + 0.22, wz + CELL/2 - 0.25);
      group.add(lintel);
      // Keystone (decorative)
      const keystone = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.5, 0.42), archStone
      );
      keystone.position.set(wx, pillarH + 0.25, wz + CELL/2 - 0.22);
      group.add(keystone);

      // Inner glowing portal — vertical plane between the pillars
      const portalTex = makePortalTexture();
      const portalMat = new THREE.MeshBasicMaterial({
        map: portalTex, transparent: true, depthWrite: false,
      });
      const portalH = pillarH - 0.2;
      const portalGeom = new THREE.PlaneGeometry(archGap + 0.1, portalH);
      const portal = new THREE.Mesh(portalGeom, portalMat);
      // Face the player (north). Wall = south, so plane facing -Z (toward player) means rotation 180.
      portal.position.set(wx, portalH/2 + 0.1, wz + CELL/2 - 0.05);
      portal.rotation.y = Math.PI; // face north (toward entry)
      group.add(portal);

      // Animated point light at the portal
      const ppl = new THREE.PointLight(0x6090ff, 1.4, 9, 1.6);
      ppl.position.set(wx, portalH/2 + 0.5, wz + CELL/2 - 0.5);
      group.add(ppl);

      // Banner above the portal
      const bannerTex = makeBannerTexture('W');
      const bn = new THREE.Mesh(
        new THREE.PlaneGeometry(0.7, 1.4),
        new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.8, side: THREE.DoubleSide })
      );
      bn.position.set(wx, pillarH + 0.6, wz + CELL/2 - 0.2);
      bn.rotation.y = Math.PI;
      group.add(bn);

      // Floor approach mat (carpet runner) leading to portal
      const matRunner = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, room.h * CELL - 0.3),
        new THREE.MeshStandardMaterial({ color: 0x6a1818, roughness: 0.9 })
      );
      matRunner.rotation.x = -Math.PI/2;
      matRunner.position.set(wx, 0.01, room.cy * CELL);
      group.add(matRunner);

      // Expose portal info for main.js (used to fade in iframe)
      portalInfo.tile = { x: ptx, y: pty };
      portalInfo.world = { x: wx, z: wz };
      portalInfo.faceDir = 2; // wall direction (south)
      portalInfo.mesh = portal;
      portalInfo.light = ppl;
    }
  }

  // ===== DECORATIVE WALL PIPES =====
  {
    const pipeMat = new THREE.MeshStandardMaterial({
      color: 0xb8d8f8, emissive: 0x5a8ec0, emissiveIntensity: 0.22,
      roughness: 0.45, metalness: 0.55,
    });

    function pipeSeg(p1, p2, r) {
      const d = p2.clone().sub(p1);
      const len = d.length();
      if (len < 0.01) return;
      d.normalize();
      const geom = new THREE.CylinderGeometry(r, r, len, 8, 1);
      const mesh = new THREE.Mesh(geom, pipeMat);
      mesh.position.lerpVectors(p1, p2, 0.5);
      const cross = new THREE.Vector3(0, 1, 0).cross(d);
      if (cross.length() > 1e-5) {
        mesh.quaternion.setFromAxisAngle(cross.normalize(),
          Math.acos(Math.max(-1, Math.min(1, d.y))));
      } else if (d.y < 0) {
        mesh.rotation.z = Math.PI;
      }
      group.add(mesh);
    }

    function pJoint(p, r) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r * 1.22, 8, 5), pipeMat);
      m.position.copy(p);
      group.add(m);
    }

    function pipe(pts, r) {
      for (let i = 0; i < pts.length - 1; i++) {
        pipeSeg(new THREE.Vector3(...pts[i]), new THREE.Vector3(...pts[i + 1]), r);
      }
      for (let i = 1; i < pts.length - 1; i++) {
        pJoint(new THREE.Vector3(...pts[i]), r);
      }
    }

    const G  = 0.072;
    const R1 = 0.054;
    const R2 = 0.037;
    const R3 = 0.024;

    for (const room of layout.rooms) {
      const N  = room.y0 * CELL - CELL / 2;
      const S  = (room.y0 + room.h - 1) * CELL + CELL / 2;
      const W  = room.x0 * CELL - CELL / 2;
      const E  = (room.x0 + room.w - 1) * CELL + CELL / 2;
      const cx = room.cx * CELL;
      const cz = room.cy * CELL;
      const CH = room.ceilH;
      const CT = CH - 0.05; // just inside ceiling

      if (room.kind === 'hub') {
        const DH = 1.35; // half-gap clearance for 1-tile corridors

        // ── North wall (throne door at cx) ──
        // Left: 3-pipe low cluster + a single tall riser + mid branch
        const nz = N + G;
        pipe([[W - 0.25, 0.38, nz], [cx - DH, 0.38, nz]], R1);
        pipe([[W - 0.25, 0.56, nz], [cx - DH, 0.56, nz]], R2);
        pipe([[W - 0.25, 0.74, nz], [W + 2.8,  0.74, nz]], R3);
        pipe([[W + 0.30, 0.38, nz], [W + 0.30, CT,   nz]], R1);         // tall riser
        pipe([[W + 0.30, CT,   nz], [cx - DH,  CT,   nz]], R1);         // ceiling run
        pipe([[W + 0.60, 0.56, nz], [W + 0.60, 2.20, nz]], R2);         // mid riser
        pipe([[W + 0.60, 2.20, nz], [cx - DH,  2.20, nz]], R2);
        // Right: asymmetric — only 1 low pipe + tall riser on far side + mid-height branch
        pipe([[cx + DH,  0.38, nz], [E + 0.25, 0.38, nz]], R1);
        pipe([[E - 2.2,  0.66, nz], [E + 0.25, 0.66, nz]], R2);
        pipe([[E - 0.30, 0.38, nz], [E - 0.30, CT,   nz]], R1);
        pipe([[cx + DH,  CT,   nz], [E - 0.30, CT,   nz]], R1);
        pipe([[cx + DH,  3.00, nz], [E - 0.30, 3.00, nz]], R2);
        // NW corner wrap: one pipe sweeps from north wall around to west wall
        pipe([[cx - DH - 0.5, 0.56, nz], [W + G, 0.56, nz], [W + G, 0.56, N + 1.4]], R2);
        // NE corner wrap: a thinner pipe hooks around the east corner
        pipe([[cx + DH + 0.4, 0.74, nz], [E - G, 0.74, nz], [E - G, 0.74, N + 0.9]], R3);

        // ── South wall (portal door at cx) ──
        // Left: single main + tall riser offset from corner + small detail pipe
        const sz = S - G;
        pipe([[W - 0.25, 0.50, sz], [cx - DH, 0.50, sz]], R2);
        pipe([[W - 0.25, 1.40, sz], [W + 3.50, 1.40, sz]], R3);
        pipe([[W + 0.45, 0.50, sz], [W + 0.45, CT,   sz]], R1);
        pipe([[W + 0.45, CT,   sz], [cx - DH,  CT,   sz]], R1);
        pipe([[cx - DH - 0.6, 0.50, sz], [cx - DH - 0.6, CT, sz]], R2);
        // Right: two low parallels + riser at far end only + mid-level cross
        pipe([[cx + DH,  0.50, sz], [E + 0.25, 0.50, sz]], R1);
        pipe([[cx + DH,  0.80, sz], [E + 0.25, 0.80, sz]], R3);
        pipe([[E - 1.80, 1.80, sz], [E + 0.25, 1.80, sz]], R2);
        pipe([[E - 0.30, 0.50, sz], [E - 0.30, CT,   sz]], R1);
        pipe([[E - 0.65, 0.80, sz], [E - 0.65, 3.60, sz]], R2);
        pipe([[cx + DH,  3.60, sz], [E - 0.65, 3.60, sz]], R2);
        pipe([[cx + DH,  CT,   sz], [E - 0.30, CT,   sz]], R1);

        // ── West wall (armory door at cz) ──
        // North half: two low runs + tall riser near north end + ceiling arm
        const wx = W + G;
        pipe([[wx, 0.44, N + 0.2], [wx, 0.44, cz - DH]], R1);
        pipe([[wx, 0.70, N + 0.5], [wx, 0.70, cz - DH]], R2);
        pipe([[wx, 0.44, N + 0.8], [wx, CT,   N + 0.8]], R1);
        pipe([[wx, CT,   N + 0.8], [wx, CT,   cz - DH]], R1);
        // South half: lower single run + L-riser stopping at 2.8 + different ceiling connection
        pipe([[wx, 0.60, cz + DH], [wx, 0.60, S - 0.2]], R2);
        pipe([[wx, 1.10, cz + DH], [wx, 1.10, S - 1.2]], R3);
        pipe([[wx, 0.60, S - 0.9], [wx, 2.80, S - 0.9]], R2);
        pipe([[wx, 2.80, cz + DH], [wx, 2.80, S - 0.9]], R2);
        pipe([[wx, 0.60, cz + DH + 0.4], [wx, CT, cz + DH + 0.4]], R1);
        pipe([[wx, CT,   cz + DH + 0.4], [wx, CT, S - 0.3]], R1);

        // ── East wall (library door at cz) ──
        // North half: thin run + riser close to north end + horizontal at 1.6
        const ex = E - G;
        pipe([[ex, 0.55, N + 0.2], [ex, 0.55, cz - DH]], R2);
        pipe([[ex, 0.90, N + 0.2], [ex, 0.90, N + 2.5]], R3);
        pipe([[ex, 0.55, N + 0.4], [ex, CT,   N + 0.4]], R1);
        pipe([[ex, CT,   N + 0.4], [ex, CT,   cz - DH]], R1);
        pipe([[ex, 1.60, N + 0.4], [ex, 1.60, cz - DH]], R2);
        // South half: main conduit + riser at far south end + ceiling stretch
        pipe([[ex, 0.44, cz + DH], [ex, 0.44, S - 0.2]], R1);
        pipe([[ex, 1.30, cz + DH + 0.5], [ex, 1.30, S - 0.2]], R2);
        pipe([[ex, 0.44, S - 0.35], [ex, CT,   S - 0.35]], R1);
        pipe([[ex, CT,   cz + DH], [ex, CT,   S - 0.35]], R1);
        pipe([[ex, 2.10, cz + DH], [ex, 2.10, S - 1.5]], R3);

      } else if (room.kind === 'throne') {
        // Door is on south wall (parentDir=0 → doorWall=2). Throne room is 7×7, CH=3.6.

        // ── North wall (opposite throne, no door) ──
        const nz = N + G;
        pipe([[W - 0.2, 0.42, nz], [E + 0.2, 0.42, nz]], R1);         // full-width low main
        pipe([[W - 0.2, 0.62, nz], [W + 4.5, 0.62, nz]], R2);         // left 3/4
        pipe([[W + 0.35, 0.42, nz], [W + 0.35, CT,  nz]], R1);        // tall riser near W
        pipe([[W + 0.35, CT,   nz], [E - 0.35, CT,  nz]], R1);        // ceiling span
        pipe([[E - 0.35, 0.42, nz], [E - 0.35, CT,  nz]], R1);        // tall riser near E
        pipe([[W + 0.35, 1.50, nz], [cx - 1.5, 1.50, nz]], R2);       // offset mid branch

        // ── East wall (no door) ──
        const ex = E - G;
        pipe([[ex, 0.44, N - 0.2], [ex, 0.44, S + 0.2]], R1);         // floor-level full run
        pipe([[ex, 0.75, N + 0.5], [ex, 0.75, S - 0.5]], R2);
        pipe([[ex, 0.44, N + 0.8], [ex, CT,   N + 0.8]], R2);         // riser near north
        pipe([[ex, CT,   N + 0.8], [ex, CT,   S - 0.8]], R1);         // ceiling arm
        pipe([[ex, 0.44, S - 0.8], [ex, CT,   S - 0.8]], R1);         // tall riser near south
        pipe([[ex, 1.80, N + 0.8], [ex, 1.80, S - 0.8]], R3);         // mid cross

        // ── West wall (no door) ──
        const wx = W + G;
        pipe([[wx, 0.55, N - 0.2], [wx, 0.55, S + 0.2]], R2);         // full run at different height
        pipe([[wx, 0.85, N + 1.0], [wx, 0.85, cz],       ], R3);      // partial, stops at centre
        pipe([[wx, 0.55, cz],      [wx, CT,   cz]],          R1);      // riser from centre up
        pipe([[wx, CT,   N + 0.5], [wx, CT,   cz]], R1);               // ceiling arm (north side)
        pipe([[wx, 2.20, cz],      [wx, 2.20, S - 0.5]], R2);         // south mid horizontal

        // ── South wall (door wall — flanking only) ──
        const sz = S - G;
        pipe([[W - 0.2, 0.50, sz], [cx - 1.35, 0.50, sz]], R2);
        pipe([[W - 0.2, 0.75, sz], [W + 1.50,  0.75, sz]], R3);
        pipe([[W + 0.4, 0.50, sz], [W + 0.4,   2.40, sz]], R2);       // riser left flank
        pipe([[cx + 1.35, 0.50, sz], [E + 0.2, 0.50, sz]], R2);
        pipe([[E - 0.4,   0.50, sz], [E - 0.4, CT,   sz]], R1);       // tall riser right flank
        pipe([[cx + 1.35, CT,   sz], [E - 0.4, CT,   sz]], R1);

      } else if (room.kind === 'library') {
        // Door is on west wall (parentDir=1 → doorWall=3). Library is 7×7, CH=3.6.

        // ── North wall (no door) ──
        const nz = N + G;
        pipe([[W - 0.2, 0.46, nz], [E + 0.2, 0.46, nz]], R1);
        pipe([[E - 3.5, 0.72, nz], [E + 0.2, 0.72, nz]], R2);        // right-half secondary
        pipe([[W + 0.3, 0.46, nz], [W + 0.3, CT,   nz]], R2);
        pipe([[E - 0.3, 0.46, nz], [E - 0.3, CT,   nz]], R1);
        pipe([[W + 0.3, CT,   nz], [E - 0.3, CT,   nz]], R1);
        pipe([[W + 0.3, 2.00, nz], [cx + 0.5, 2.00, nz]], R2);       // mid arm (left-biased)

        // ── East wall (no door) ──
        const ex = E - G;
        pipe([[ex, 0.50, N - 0.2], [ex, 0.50, S + 0.2]], R2);
        pipe([[ex, 0.80, N + 0.6], [ex, 0.80, cz]], R3);
        pipe([[ex, 0.50, N + 0.5], [ex, CT,   N + 0.5]], R1);
        pipe([[ex, CT,   N + 0.5], [ex, CT,   cz + 1.5]], R1);        // ceiling arm (partial)
        pipe([[ex, 0.50, S - 0.5], [ex, 3.00, S - 0.5]], R2);        // south riser stops short

        // ── South wall (no door) ──
        const sz = S - G;
        pipe([[W - 0.2,  0.48, sz], [E + 0.2, 0.48, sz]], R1);
        pipe([[W + 1.0,  0.70, sz], [W + 4.0, 0.70, sz]], R2);       // centre section only
        pipe([[W + 0.3,  0.48, sz], [W + 0.3, CT,   sz]], R2);
        pipe([[W + 1.0,  0.70, sz], [W + 1.0, CT,   sz]], R1);
        pipe([[W + 0.3,  CT,   sz], [E - 0.3, CT,   sz]], R1);
        pipe([[E - 0.3,  0.48, sz], [E - 0.3, CT,   sz]], R1);

        // ── West wall (door wall — flanking only) ──
        const wx = W + G;
        pipe([[wx, 0.55, N + 0.2], [wx, 0.55, cz - 1.35]], R2);
        pipe([[wx, 0.55, N + 1.2], [wx, CT,   N + 1.2]], R1);         // riser near north
        pipe([[wx, CT,   N + 1.2], [wx, CT,   cz - 1.35]], R1);
        pipe([[wx, 0.55, cz + 1.35], [wx, 0.55, S - 0.2]], R2);

      } else if (room.kind === 'armory') {
        // Door is on east wall (parentDir=3 → doorWall=1). Armory is 7×7, CH=3.6.

        // ── North wall (no door) — asymmetric treatment ──
        const nz = N + G;
        pipe([[W - 0.2, 0.44, nz], [E + 0.2, 0.44, nz]], R1);
        pipe([[cx - 1.0, 0.64, nz], [E + 0.2, 0.64, nz]], R2);       // right-biased secondary
        pipe([[W + 0.4,  0.44, nz], [W + 0.4, 1.80, nz]], R2);       // short riser (left)
        pipe([[W + 0.4,  1.80, nz], [cx,      1.80, nz]], R2);        // mid arm going right
        pipe([[E - 0.35, 0.44, nz], [E - 0.35, CT,  nz]], R1);       // single tall riser (right)
        pipe([[cx,       CT,   nz], [E - 0.35, CT,  nz]], R1);        // ceiling arm (right half)

        // ── South wall (no door) — centre-riser motif ──
        const sz = S - G;
        pipe([[W - 0.2, 0.56, sz], [E + 0.2, 0.56, sz]], R2);
        pipe([[W - 0.2, 0.80, sz], [W + 2.0, 0.80, sz]], R3);
        pipe([[cx,      0.56, sz], [cx,      CT,   sz]], R1);         // centre riser
        pipe([[cx,      CT,   sz], [W + 0.5, CT,   sz]], R1);         // ceiling arm (left)
        pipe([[cx - 2.0, 2.2, sz], [cx,      2.2,  sz]], R2);

        // ── West wall (no door) — riser at south, ceiling spans to north ──
        const wx = W + G;
        pipe([[wx, 0.46, N - 0.2], [wx, 0.46, S + 0.2]], R1);
        pipe([[wx, 1.00, N + 0.8], [wx, 1.00, cz + 1.0]], R2);
        pipe([[wx, 0.46, N + 0.5], [wx, CT,   N + 0.5]], R1);
        pipe([[wx, CT,   N + 0.5], [wx, CT,   S - 0.5]], R1);
        pipe([[wx, 0.46, S - 0.5], [wx, CT,   S - 0.5]], R2);

        // ── East wall (door wall — flanking only) ──
        const ex = E - G;
        pipe([[ex, 0.52, N + 0.2], [ex, 0.52, cz - 1.35]], R2);
        pipe([[ex, 0.52, N + 0.7], [ex, 2.60, N + 0.7]], R1);        // L-riser north flank
        pipe([[ex, 2.60, N + 0.7], [ex, 2.60, cz - 1.35]], R1);
        pipe([[ex, 0.52, cz + 1.35], [ex, 0.52, S - 0.2]], R3);

      } else if (room.kind === 'portal') {
        // Door is on north wall (parentDir=2 → doorWall=0). Portal room is 5×5, CH=4.4.

        // ── South wall (flanks portal arch at cx ± ~1.3 m) ──
        const sz = S - G;
        pipe([[W - 0.2,  0.46, sz], [cx - 1.6, 0.46, sz]], R2);
        pipe([[W + 0.3,  0.46, sz], [W + 0.3,  CT,   sz]], R1);
        pipe([[W + 0.3,  CT,   sz], [cx - 1.6, CT,   sz]], R1);
        pipe([[cx + 1.6, 0.46, sz], [E + 0.2,  0.46, sz]], R2);
        pipe([[E - 0.3,  0.46, sz], [E - 0.3,  CT,   sz]], R1);
        pipe([[cx + 1.6, CT,   sz], [E - 0.3,  CT,   sz]], R1);

        // ── East wall (no door) ──
        const ex = E - G;
        pipe([[ex, 0.50, N - 0.2], [ex, 0.50, S + 0.2]], R1);
        pipe([[ex, 0.80, N + 0.5], [ex, 0.80, cz]], R2);
        pipe([[ex, 0.50, N + 0.8], [ex, CT,   N + 0.8]], R1);
        pipe([[ex, CT,   N + 0.8], [ex, CT,   S - 0.8]], R1);
        pipe([[ex, 0.50, S - 0.8], [ex, 3.20, S - 0.8]], R2);        // south riser stops at 3.2

        // ── West wall (no door) — different riser positions from east ──
        const wx = W + G;
        pipe([[wx, 0.60, N + 0.3], [wx, 0.60, S - 0.3]], R2);
        pipe([[wx, 0.90, cz - 1.5], [wx, 0.90, S - 0.3]], R3);
        pipe([[wx, 0.60, S - 0.6], [wx, CT,   S - 0.6]], R1);
        pipe([[wx, CT,   N + 0.6], [wx, CT,   S - 0.6]], R1);
        pipe([[wx, 0.60, N + 0.6], [wx, 2.80, N + 0.6]], R2);
        pipe([[wx, 2.80, N + 0.6], [wx, 2.80, cz]], R2);

        // ── North wall (door wall — flanking only) ──
        const nz = N + G;
        pipe([[W - 0.2,  0.55, nz], [cx - 1.35, 0.55, nz]], R2);
        pipe([[W - 0.2,  0.90, nz], [W + 0.8,   0.90, nz]], R3);
        pipe([[cx + 1.35, 0.55, nz], [E + 0.2,  0.55, nz]], R2);
        pipe([[E - 0.35,  0.55, nz], [E - 0.35, 2.80, nz]], R1);
        pipe([[cx + 1.35, 2.80, nz], [E - 0.35, 2.80, nz]], R1);
      }
    }

    // ── Corridor pipes + extra hub density ──────────────────────────────────
    const hubR    = layout.rooms.find(r => r.kind === 'hub');
    const throneR = layout.rooms.find(r => r.kind === 'throne');
    const libR    = layout.rooms.find(r => r.kind === 'library');
    const portalR = layout.rooms.find(r => r.kind === 'portal');
    const armoryR = layout.rooms.find(r => r.kind === 'armory');

    if (hubR) {
      const hcx = hubR.cx * CELL, hcz = hubR.cy * CELL;
      const hN  = hubR.y0 * CELL - CELL / 2;
      const hS  = (hubR.y0 + hubR.h - 1) * CELL + CELL / 2;
      const hW  = hubR.x0 * CELL - CELL / 2;
      const hE  = (hubR.x0 + hubR.w - 1) * CELL + CELL / 2;
      const HCH = hubR.ceilH;
      const DH  = 1.35;

      // North corridor (hub ↔ throne) — west & east passage walls
      if (throneR) {
        const tS  = (throneR.y0 + throneR.h - 1) * CELL + CELL / 2;
        const wpx = hcx - CELL / 2 + G, epx = hcx + CELL / 2 - G;
        pipe([[wpx, 0.44, tS], [wpx, 0.44, hN]], R1);
        pipe([[wpx, 0.66, tS], [wpx, 0.66, hN]], R2);
        pipe([[wpx, 1.05, tS + 0.2], [wpx, 1.05, hN - 0.2]], R3);
        pipe([[epx, 0.44, tS], [epx, 0.44, hN]], R2);
        pipe([[epx, 0.72, tS], [epx, 0.72, hN]], R1);
        pipe([[epx, 0.44, tS + 0.4], [epx, throneR.ceilH, tS + 0.4]], R2);
        pipe([[wpx, 0.44, hN - 0.5], [wpx, HCH, hN - 0.5]], R1);
      }

      // South corridor (hub ↔ portal)
      if (portalR) {
        const pN  = portalR.y0 * CELL - CELL / 2;
        const wpx = hcx - CELL / 2 + G, epx = hcx + CELL / 2 - G;
        pipe([[wpx, 0.52, hS], [wpx, 0.52, pN]], R2);
        pipe([[wpx, 0.88, hS], [wpx, 0.88, pN]], R3);
        pipe([[epx, 0.44, hS], [epx, 0.44, pN]], R1);
        pipe([[epx, 0.70, hS], [epx, 0.70, pN]], R2);
        pipe([[epx, 0.44, hS + 0.4], [epx, HCH, hS + 0.4]], R1);
        pipe([[wpx, 0.88, pN - 0.4], [wpx, portalR.ceilH, pN - 0.4]], R2);
      }

      // East corridor (hub ↔ library) — north & south passage walls
      if (libR) {
        const lW  = libR.x0 * CELL - CELL / 2;
        const npz = hcz - CELL / 2 + G, spz = hcz + CELL / 2 - G;
        pipe([[hE, 0.48, npz], [lW, 0.48, npz]], R1);
        pipe([[hE, 0.74, npz], [lW, 0.74, npz]], R2);
        pipe([[hE, 0.44, spz], [lW, 0.44, spz]], R2);
        pipe([[hE, 0.82, spz], [lW, 0.82, spz]], R3);
        pipe([[lW - 0.5, 0.44, spz], [lW - 0.5, libR.ceilH, spz]], R1);
        pipe([[hE + 0.5, 0.74, npz], [hE + 0.5, HCH, npz]], R2);
      }

      // West corridor (hub ↔ armory)
      if (armoryR) {
        const aE  = (armoryR.x0 + armoryR.w - 1) * CELL + CELL / 2;
        const npz = hcz - CELL / 2 + G, spz = hcz + CELL / 2 - G;
        pipe([[aE, 0.44, npz], [hW, 0.44, npz]], R2);
        pipe([[aE, 0.78, npz], [hW, 0.78, npz]], R3);
        pipe([[aE, 0.44, spz], [hW, 0.44, spz]], R1);
        pipe([[aE, 0.64, spz], [hW, 0.64, spz]], R2);
        pipe([[aE, 0.95, spz], [hW + 0.6, 0.95, spz]], R3);
        pipe([[aE + 0.4, 0.44, npz], [aE + 0.4, armoryR.ceilH, npz]], R1);
        pipe([[hW - 0.4, 0.78, spz], [hW - 0.4, HCH, spz]], R2);
      }

      // Extra hub wall density — fills mid-height gaps left by the main loop
      const hnz = hN + G, hsz = hS - G, hwx = hW + G, hex = hE - G;
      pipe([[hW - 0.2, 1.50, hnz], [hcx - DH, 1.50, hnz]], R3);        // N wall mid-left
      pipe([[hcx + DH, 2.80, hnz], [hE + 0.2, 2.80, hnz]], R2);        // N wall mid-right
      pipe([[hW - 0.2, 2.00, hsz], [hcx - DH, 2.00, hsz]], R3);        // S wall mid-left
      pipe([[hex, 3.80, hN], [hex, 3.80, hS]], R2);                     // E wall cross at 3.8 m
      pipe([[hwx, HCH - 0.40, hcz + DH], [hwx, HCH - 0.40, hS]], R3); // W wall near-ceiling S

      // Hub ceiling pipes — horizontal conduits suspended just below ceiling face
      const cy1 = HCH - G, cy2 = HCH - G - 0.22;
      pipe([[hW, cy1, hN + 1.0], [hE, cy1, hN + 1.0]], R2);
      pipe([[hW, cy2, hN + 2.0], [hE, cy2, hN + 2.0]], R3);
      pipe([[hE - 1.1, cy1, hN], [hE - 1.1, cy1, hS]], R2);
      pipe([[hE, cy2, hcz + 0.7], [hcx, cy2, hcz + 0.7], [hcx, cy2, hS]], R3);
    }
  }

  return {
    scene, group,
    walls, floorMesh: floor, ceilMesh: ceilInst,
    torchLights, torchSprites: [],
    artObjects: [],
    floorMat, ceilMat: ceilMatI, wallMat,
    playerLight,
    waterMat,
    saloonDoors,
    portal: portalInfo,
    CELL, WALL_H: STD_CEIL,
  };
}
