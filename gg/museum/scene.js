// Garden Grove Museum — clean civic interior with variable ceiling heights.
// Map Hall is a tall cathedral; other rooms are standard height.
import * as THREE from 'three';
import {
  getWallTexture, getFloorTexture, getCeilingTexture,
  makeSconceTexture, makeFrameTexture, makePlaqueTexture,
  makeSignTexture, GG,
} from './textures.js';

const CELL = 2;
const STD_CEIL = 3.4;

export function buildScene(layout, opts) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a1424);
  scene.fog = new THREE.Fog(0x0a1424, 8, opts.fogDistance ?? 36);

  // BRIGHT museum lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  scene.add(new THREE.HemisphereLight(0xfff2c8, 0x162033, 0.55));

  // Soft player follow light
  const playerLight = new THREE.PointLight(0xfff0c8, 0.6, 6, 2);
  playerLight.position.set(0, 1.8, 0);
  scene.add(playerLight);

  const wallTex  = getWallTexture('navy');
  const floorTex = getFloorTexture('marble');
  const ceilTex  = getCeilingTexture();

  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTex, roughness: 0.85, metalness: 0,
  });
  const ceilMat = new THREE.MeshStandardMaterial({
    map: ceilTex, roughness: 0.95, metalness: 0,
  });
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex.clone(), roughness: 0.55, metalness: 0.05,
  });
  floorMat.map.wrapS = floorMat.map.wrapT = THREE.RepeatWrapping;
  floorMat.map.repeat.set(layout.width, layout.height);
  floorMat.map.needsUpdate = true;

  const goldMat = new THREE.MeshStandardMaterial({
    color: GG.gold, roughness: 0.35, metalness: 0.85,
    emissive: 0x3a2810, emissiveIntensity: 0.15,
  });
  const goldDarkMat = new THREE.MeshStandardMaterial({
    color: GG.goldDark, roughness: 0.55, metalness: 0.7,
  });

  const group = new THREE.Group();
  scene.add(group);

  // ----- FLOOR (one big plane) -----
  const W = layout.width * CELL, H = layout.height * CELL;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2 - CELL / 2, 0, H / 2 - CELL / 2);
  group.add(floor);

  // ----- CEILING per cell (variable height) -----
  // Group floor cells by ceiling height and build one ceiling plane per cell.
  // Cheap enough at this scale, and keeps the cathedral high while halls stay low.
  const ceilGeom = new THREE.PlaneGeometry(CELL, CELL);
  const ceilMatI = ceilMat.clone();
  ceilMatI.map = ceilTex.clone();
  ceilMatI.map.wrapS = ceilMatI.map.wrapT = THREE.RepeatWrapping;
  ceilMatI.map.repeat.set(1, 1);
  ceilMatI.map.needsUpdate = true;

  // Count floor cells
  const floorCells = [];
  for (let y = 0; y < layout.height; y++) {
    for (let x = 0; x < layout.width; x++) {
      if (layout.grid[y][x] === 0) floorCells.push({ x, y, ceilH: layout.ceilH[y][x] });
    }
  }
  const ceilInst = new THREE.InstancedMesh(ceilGeom, ceilMatI, floorCells.length);
  const m4 = new THREE.Matrix4();
  const v3 = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3(1, 1, 1);
  const exFlip = new THREE.Euler(Math.PI / 2, 0, 0);
  floorCells.forEach((c, i) => {
    v3.set(c.x * CELL, c.ceilH, c.y * CELL);
    q.setFromEuler(exFlip);
    m4.compose(v3, q, sc);
    ceilInst.setMatrixAt(i, m4);
  });
  ceilInst.instanceMatrix.needsUpdate = true;
  group.add(ceilInst);

  // ----- WALLS as solid boxes, height = max ceiling of any adjacent floor -----
  const wallCells = [];
  for (let y = 0; y < layout.height; y++) {
    for (let x = 0; x < layout.width; x++) {
      if (layout.grid[y][x] !== 1) continue;
      let nearFloor = false;
      let maxH = STD_CEIL;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= layout.width || ny >= layout.height) continue;
        if (layout.grid[ny][nx] === 0) {
          nearFloor = true;
          if (layout.ceilH[ny][nx] > maxH) maxH = layout.ceilH[ny][nx];
        }
      }
      if (!nearFloor) continue;
      wallCells.push({ x, y, h: maxH });
    }
  }
  // Use one box per wall cell with custom Y-scale (since heights vary).
  const wallGeom = new THREE.BoxGeometry(CELL, 1, CELL); // unit-height; scale Y per instance
  const walls = new THREE.InstancedMesh(wallGeom, wallMat, wallCells.length);
  walls.instanceMatrix.setUsage(THREE.StaticDrawUsage);
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

  // ----- BASEBOARD + DADO RAIL + CROWN MOLDING -----
  // Per exposed wall face. Crown molding height matches that wall's ceiling.
  const trimSegs = [];
  for (let y = 0; y < layout.height; y++) {
    for (let x = 0; x < layout.width; x++) {
      if (layout.grid[y][x] !== 0) continue;
      const localCeil = layout.ceilH[y][x];
      for (let d = 0; d < 4; d++) {
        const nx = x + [0,1,0,-1][d], ny = y + [-1,0,1,0][d];
        if (nx < 0 || ny < 0 || nx >= layout.width || ny >= layout.height) continue;
        if (layout.grid[ny][nx] === 1) trimSegs.push({ x, y, wall: d, ceilH: localCeil });
      }
    }
  }
  const dadoY = 1.05;
  const dadoGeom  = new THREE.PlaneGeometry(CELL, 0.06);
  const baseGeom  = new THREE.PlaneGeometry(CELL, 0.22);
  const crownGeom = new THREE.PlaneGeometry(CELL, 0.28);
  const baseMat   = new THREE.MeshStandardMaterial({ color: GG.navyDeep, roughness: 0.7 });
  const crownMat  = new THREE.MeshStandardMaterial({ color: GG.cream, roughness: 0.7 });

  const baseI  = new THREE.InstancedMesh(baseGeom,  baseMat,  trimSegs.length);
  const dadoI  = new THREE.InstancedMesh(dadoGeom,  goldMat,  trimSegs.length);
  const crownI = new THREE.InstancedMesh(crownGeom, crownMat, trimSegs.length);
  trimSegs.forEach((s, i) => {
    const wx = s.x * CELL, wz = s.y * CELL;
    const ox = [0,1,0,-1][s.wall] * (CELL / 2 - 0.02);
    const oz = [-1,0,1,0][s.wall] * (CELL / 2 - 0.02);
    const yaw = [0, -Math.PI/2, Math.PI, Math.PI/2][s.wall];
    const setAt = (mesh, h) => {
      v3.set(wx + ox, h, wz + oz);
      q.setFromEuler(new THREE.Euler(0, yaw, 0));
      m4.compose(v3, q, sc);
      mesh.setMatrixAt(i, m4);
    };
    setAt(baseI,  0.12);
    setAt(dadoI,  dadoY);
    setAt(crownI, s.ceilH - 0.18);
  });
  baseI.instanceMatrix.needsUpdate = true;
  dadoI.instanceMatrix.needsUpdate = true;
  crownI.instanceMatrix.needsUpdate = true;
  group.add(baseI); group.add(dadoI); group.add(crownI);

  // ----- LIGHTING -----
  const sconceTex = makeSconceTexture();
  const torchLights = [];
  const sconceSprites = [];

  function addChandelier(wx, wz, ceilH) {
    const ch = new THREE.Group();
    ch.position.set(wx, ceilH, wz);
    const isTall = ceilH > 5;
    const chainLen = isTall ? 1.8 : 0.5;
    const chain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, chainLen, 6),
      goldDarkMat
    );
    chain.position.y = -chainLen / 2;
    ch.add(chain);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.42, 0.12, 16), goldMat
    );
    cap.position.y = -chainLen - 0.05;
    ch.add(cap);
    const globeMat = new THREE.MeshStandardMaterial({
      color: 0xfff5d0, emissive: 0xffd680, emissiveIntensity: 0.9,
      transparent: true, opacity: 0.92, roughness: 0.25,
    });
    const globeR = isTall ? 0.32 : 0.22;
    const globe = new THREE.Mesh(new THREE.SphereGeometry(globeR, 18, 14), globeMat);
    globe.position.y = -chainLen - 0.28;
    ch.add(globe);
    const intensity = isTall ? 2.2 : 1.5;
    const range = isTall ? 14 : 9;
    const pl = new THREE.PointLight(0xffe6b0, intensity, range, 1.6);
    pl.position.y = -chainLen - 0.28;
    ch.add(pl);
    group.add(ch);
    torchLights.push({ light: pl, baseIntensity: intensity, kind: 'chandelier' });
  }

  function addSconce(t) {
    // Wall-mounted mini-chandelier (matches chandelier vocab, smaller).
    const wx = t.x * CELL, wz = t.y * CELL;
    const nx = [0,1,0,-1][t.wall];
    const nz = [-1,0,1,0][t.wall];
    const baseY = 2.05;
    const arm = 0.14; // how far it sticks out from the wall

    const sc = new THREE.Group();
    sc.position.set(wx + nx * (CELL/2 - 0.01), baseY, wz + nz * (CELL/2 - 0.01));
    sc.rotation.y = [0, -Math.PI/2, Math.PI, Math.PI/2][t.wall];

    // Wall plate (gilded back disc)
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.10, 0.03, 14),
      goldMat
    );
    plate.rotation.x = Math.PI / 2;
    sc.add(plate);

    // Arm bracket sticking outward
    const bracket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, arm, 6),
      goldDarkMat
    );
    bracket.rotation.x = Math.PI / 2;
    bracket.position.set(0, 0, arm/2);
    sc.add(bracket);

    // Cap above globe
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 0.04, 12), goldMat
    );
    cap.position.set(0, 0.04, arm);
    sc.add(cap);

    // Glowing globe
    const globeMat = new THREE.MeshStandardMaterial({
      color: 0xfff5d0, emissive: 0xffd680, emissiveIntensity: 0.9,
      transparent: true, opacity: 0.92, roughness: 0.25,
    });
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.10, 16, 12), globeMat);
    globe.position.set(0, -0.04, arm);
    sc.add(globe);

    group.add(sc);

    const pl = new THREE.PointLight(0xffd9a0, 0.9, 6, 1.6);
    pl.position.set(wx + nx * (CELL/2 - 0.4), baseY - 0.04, wz + nz * (CELL/2 - 0.4));
    group.add(pl);
    torchLights.push({ light: pl, baseIntensity: 0.9, kind: 'sconce' });
  }

  for (const l of layout.lights || layout.torches || []) {
    if (l.kind === 'sconce' && l.wall != null) addSconce(l);
    else addChandelier(l.x * CELL, l.y * CELL, l.ceilH || STD_CEIL);
  }

  // ----- HUB CENTERPIECE: real GG logo on the floor -----
  const hub = (layout.rooms || []).find(r => r.id === 'hub');
  if (hub) {
    const loader = new THREE.TextureLoader();
    loader.load('artworks/gg-logo.png', (logoTex) => {
      logoTex.colorSpace = THREE.SRGBColorSpace;
      logoTex.needsUpdate = true;
      // Outer gold ring
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.45, 1.6, 64),
        new THREE.MeshStandardMaterial({ color: GG.gold, roughness: 0.3, metalness: 0.85 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(hub.cx * CELL, 0.005, hub.cy * CELL);
      group.add(ring);
      // Navy disk
      const disk = new THREE.Mesh(
        new THREE.CircleGeometry(1.45, 64),
        new THREE.MeshStandardMaterial({ color: GG.navyDeep, roughness: 0.6 })
      );
      disk.rotation.x = -Math.PI / 2;
      disk.position.set(hub.cx * CELL, 0.004, hub.cy * CELL);
      group.add(disk);
      // Logo on top
      const logo = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 1.27),
        new THREE.MeshStandardMaterial({
          map: logoTex, transparent: true,
          roughness: 0.4, metalness: 0.2,
          emissive: 0x335577, emissiveIntensity: 0.25,
        })
      );
      logo.rotation.x = -Math.PI / 2;
      logo.position.set(hub.cx * CELL, 0.006, hub.cy * CELL);
      group.add(logo);
    });
  }

  // ----- DIRECTIONAL SIGNS -----
  for (const s of layout.signs || []) {
    const wx = s.x * CELL, wz = s.y * CELL;
    const ox = [0,1,0,-1][s.wall] * (CELL / 2 - 0.02);
    const oz = [-1,0,1,0][s.wall] * (CELL / 2 - 0.02);
    const yaw = [0, -Math.PI/2, Math.PI, Math.PI/2][s.wall];
    const tex = makeSignTexture(s.label, s.arrow || '');
    const mat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.5, metalness: 0.3,
      emissive: 0x0a1830, emissiveIntensity: 0.3,
      side: THREE.DoubleSide,
    });
    const w2 = 1.7, h2 = 0.55;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w2, h2), mat);
    mesh.position.set(wx + ox, 2.55, wz + oz);
    mesh.rotation.y = yaw;
    group.add(mesh);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w2 + 0.1, 0.05, 0.05), goldMat);
    bar.position.set(wx + ox, 2.55 + h2/2 + 0.04, wz + oz);
    bar.rotation.y = yaw;
    group.add(bar);
  }

  // ----- ARTWORKS -----
  const frameTex = makeFrameTexture();
  const artObjects = [];
  for (const p of layout.placements) {
    const wx = p.x * CELL, wz = p.y * CELL;
    const dx = [0, 1, 0, -1][p.wall] * (CELL / 2);
    const dz = [-1, 0, 1, 0][p.wall] * (CELL / 2);
    const faceY = [0, -Math.PI / 2, Math.PI, Math.PI / 2][p.wall];

    const pivot = new THREE.Group();
    pivot.position.set(wx + dx * 0.985, 0, wz + dz * 0.985);
    pivot.rotation.y = faceY;
    group.add(pivot);

    // Cathedral map: sized to artwork aspect — no black bars, no clipping.
    const isCathedral = !!p.cathedral;
    const mapRoom = layout.rooms.find(r => r.id === 'map');
    const mapW = mapRoom?.w || 11;
    const mapCeil = mapRoom?.ceilH || 9.0;
    // Cathedral map aspect (1023×662 source) ≈ 1.545
    const MAP_AR = 1023 / 662;
    // Maximum allowable footprint inside the cathedral wall
    const maxW = mapW * CELL - 1.2;        // wall width minus margin for torches/molding
    const maxH = mapCeil - 2.4;            // headroom under crown + room above plaque
    // Fit map aspect inside (maxW × maxH); scale frame to match
    let mapMeshW, mapMeshH;
    if (maxW / maxH > MAP_AR) {
      mapMeshH = maxH;
      mapMeshW = maxH * MAP_AR;
    } else {
      mapMeshW = maxW;
      mapMeshH = maxW / MAP_AR;
    }
    // Frame is artwork + ~0.35m gilded border on each side
    const fW = isCathedral ? (mapMeshW + 0.7) : 0.95;
    const fH = isCathedral ? (mapMeshH + 0.7) : 1.25;
    const centerY = isCathedral ? (1.5 + fH / 2) : 1.7;

    const frameMat = new THREE.MeshStandardMaterial({
      map: frameTex, roughness: 0.5, metalness: 0.4,
    });
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(fW, fH), frameMat);
    frame.position.set(0, centerY, 0.01);
    pivot.add(frame);

    // Art mesh: cathedral matches artwork aspect already (no scale-fit needed);
    // smaller artworks still letterbox inside their frames.
    const innerW = isCathedral ? mapMeshW : (fW - 0.30);
    const innerH = isCathedral ? mapMeshH : (fH - 0.30);
    const artMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a, roughness: 0.95,
      emissive: 0x080808, emissiveIntensity: 0.05,
    });
    const artMesh = new THREE.Mesh(new THREE.PlaneGeometry(innerW, innerH), artMat);
    artMesh.position.set(0, centerY, 0.025);
    pivot.add(artMesh);

    loadArtTexture(p.src, isCathedral).then(tex => {
      if (!tex) return;
      tex.needsUpdate = true;
      artMat.map = tex;
      artMat.color.set(0xffffff);
      artMat.emissive.set(0x0a0a0a);
      artMat.needsUpdate = true;
      if (!isCathedral) {
        const img = tex.image;
        if (img && img.width && img.height) {
          const ar = img.width / img.height;
          const meshAR = innerW / innerH;
          if (ar > meshAR) artMesh.scale.set(1, meshAR / ar, 1);
          else artMesh.scale.set(ar / meshAR, 1, 1);
        }
      }
    }).catch(() => {});

    // Plaque under frame
    const plaqueTex = makePlaqueTexture(p.title || '', p.years || p.subtitle || '');
    const plaqueMat = new THREE.MeshStandardMaterial({
      map: plaqueTex, roughness: 0.4, metalness: 0.55,
    });
    const plW = isCathedral ? 3.6 : 0.95;
    const plH = isCathedral ? 0.6  : 0.28;
    // Cathedral plaque sits low (~0.9m) since the frame is so high
    const plY = isCathedral ? 0.95 : centerY - fH/2 - plH/2 - 0.06;
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(plW, plH), plaqueMat);
    plaque.position.set(0, plY, 0.02);
    pivot.add(plaque);

    // Accent lights
    if (isCathedral) {
      // Two big directional accents above the map
      for (const sx of [-fW/3, fW/3]) {
        const accent = new THREE.PointLight(0xfff0c8, 1.2, 8, 1.8);
        accent.position.set(wx + sx * Math.cos(faceY) + dx * 0.6,
                            centerY + fH/2 + 0.6,
                            wz - sx * Math.sin(faceY) + dz * 0.6);
        group.add(accent);
      }
    } else {
      const accent = new THREE.PointLight(0xfff0c8, 0.35, 3, 2);
      accent.position.set(wx + dx * 0.6, centerY + fH/2 + 0.4, wz + dz * 0.6);
      group.add(accent);
    }

    artObjects.push({
      pivot, artMesh, frameMesh: frame, plaqueMesh: plaque,
      tile: { x: p.x, y: p.y }, wall: p.wall,
      src: p.src, title: p.title || '', subtitle: p.years || p.subtitle || '',
    });
  }

  return {
    scene, group,
    walls, floorMesh: floor, ceilMesh: ceilInst,
    torchLights, torchSprites: sconceSprites,
    artObjects,
    floorMat, ceilMat: ceilMatI, wallMat,
    playerLight,
    CELL, WALL_H: STD_CEIL,
  };
}

async function loadArtTexture(src, hiQuality = false) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const isGif = /\.gif(\?|$)/i.test(src);
      if (isGif) {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.userData = { img, canvas: c, ctx, animated: true };
        resolve(tex);
      } else {
        const tex = new THREE.Texture(img);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = hiQuality ? 16 : 4;
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        tex.needsUpdate = true;
        resolve(tex);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
