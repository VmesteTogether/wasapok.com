// Wasapok Castle — scene builder.
// Variable per-cell ceiling height, room-specific props, portal location exposed.
import * as THREE from 'three';
import {
  getWallTexture, getFloorTexture, getCeilingTexture,
  makeTorchTexture, makeSignTexture, makeBannerTexture,
  makePortalTexture, makeStainedGlass, CAST,
} from './textures.js';

const CELL = 2;
const STD_CEIL = 3.6;

export function buildScene(layout, opts) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040e08);
  scene.fog = new THREE.Fog(0x040e08, 4, opts.fogDistance ?? 22);

  // Dim ambient — orbs do the work
  scene.add(new THREE.AmbientLight(0x0a1e0e, 0.55));
  scene.add(new THREE.HemisphereLight(0x1a4a22, 0x040e08, 0.25));

  // Player-follow green light
  const playerLight = new THREE.PointLight(0x40ff80, 1.6, 8, 2);
  playerLight.position.set(0, 1.6, 0);
  scene.add(playerLight);

  // Materials
  const wallTex = getWallTexture('stone');
  const floorTex = getFloorTexture('cobble');
  const ceilTex = getCeilingTexture();
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.62, metalness: 0.35 });
  const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.95, metalness: 0 });
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex.clone(), roughness: 0.85, metalness: 0.05,
  });
  floorMat.map.wrapS = floorMat.map.wrapT = THREE.RepeatWrapping;
  floorMat.map.repeat.set(layout.width, layout.height);
  floorMat.map.needsUpdate = true;

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

  // FLOOR
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W/2 - CELL/2, 0, H/2 - CELL/2);
  group.add(floor);

  // CEILING per-cell (variable height)
  const ceilGeom = new THREE.PlaneGeometry(CELL, CELL);
  const ceilMatI = ceilMat.clone();
  ceilMatI.map = ceilTex.clone();
  ceilMatI.map.wrapS = ceilMatI.map.wrapT = THREE.RepeatWrapping;
  ceilMatI.map.repeat.set(1, 1);
  ceilMatI.map.needsUpdate = true;
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
      color: 0x20ff60, emissive: 0x40ff80, emissiveIntensity: 2.2,
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
      color: 0x20ff60, emissive: 0x40ff80, emissiveIntensity: 2.0,
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

  // ===== UMBRELLA GLASS CHANDELIER — ceiling-mounted dome, faint Half-Life orange =====
  function addUmbrellaChandelier(wx, wz, ceilH) {
    const grp = new THREE.Group();
    grp.position.set(wx, ceilH, wz);
    const domeR = 0.72;

    // Ceiling mount disc
    const mountMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.06, 12), ironMat
    );
    mountMesh.position.y = -0.03;
    grp.add(mountMesh);

    // Glass dome — top hemisphere, pole touches ceiling, rim hangs below
    // SphereGeometry top half: pole at y=+r, equator at y=0; position.y=-domeR puts pole at ceiling
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xFFAA60, emissive: 0xFF6820, emissiveIntensity: 0.38,
      transparent: true, opacity: 0.44,
      roughness: 0.04, metalness: 0.0,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(domeR, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      glassMat
    );
    dome.position.y = -domeR;
    grp.add(dome);

    // Inner glow shell — renders BackSide for a filled-glass look
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xFF7828, transparent: true, opacity: 0.14,
      side: THREE.BackSide, depthWrite: false,
    });
    const innerDome = new THREE.Mesh(
      new THREE.SphereGeometry(domeR * 0.91, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      innerMat
    );
    innerDome.position.y = -domeR;
    grp.add(innerDome);

    // Iron rim ring at the equator
    const rimRing = new THREE.Mesh(
      new THREE.TorusGeometry(domeR, 0.022, 8, 40), ironMat
    );
    rimRing.rotation.x = Math.PI / 2;
    rimRing.position.y = -domeR;
    grp.add(rimRing);

    // 8 iron ribs from pole (0,0,0) to rim points
    const ribCount = 8;
    const ribLen = domeR * Math.SQRT2;
    const upVec = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < ribCount; i++) {
      const a = (i / ribCount) * Math.PI * 2;
      const rimX = Math.cos(a) * domeR, rimZ = Math.sin(a) * domeR;
      const rib = new THREE.Mesh(
        new THREE.CylinderGeometry(0.009, 0.009, ribLen, 5), ironMat
      );
      rib.position.set(rimX * 0.5, -domeR * 0.5, rimZ * 0.5);
      const dir = new THREE.Vector3(rimX, -domeR, rimZ).normalize();
      rib.quaternion.setFromUnitVectors(upVec, dir);
      grp.add(rib);
    }

    group.add(grp);

    // Faint orange area light — below the dome opening, low intensity so green orbs dominate
    const pl = new THREE.PointLight(0xFF6820, 0.52, 14, 1.8);
    pl.position.set(wx, ceilH - domeR - 0.35, wz);
    group.add(pl);
    torchLights.push({ light: pl, baseIntensity: 0.52, kind: 'umbrella' });
  }

  for (const l of layout.lights || []) {
    if (l.kind === 'chandelier') addChandelier(l.x * CELL, l.y * CELL, l.ceilH || STD_CEIL);
    else addTorch(l);
  }

  // ===== DOOR SIGNS =====
  for (const s of layout.signs || []) {
    const wx = s.x * CELL, wz = s.y * CELL;
    const ox = [0,1,0,-1][s.wall] * (CELL/2 - 0.02);
    const oz = [-1,0,1,0][s.wall] * (CELL/2 - 0.02);
    const yaw = [0, -Math.PI/2, Math.PI, Math.PI/2][s.wall];
    const tex = makeSignTexture(s.label);
    // Portal sign gets a stronger emissive + magical blue rim glow
    const isPortalSign = s.toRoom === 'portal';
    const mat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide,
      emissive: isPortalSign ? 0x3060c0 : 0x1a0e08,
      emissiveIntensity: isPortalSign ? 0.6 : 0.2,
    });
    const w2 = 1.6, h2 = 0.5;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w2, h2), mat);
    mesh.position.set(wx + ox, 2.6, wz + oz);
    mesh.rotation.y = yaw;
    group.add(mesh);

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

  return {
    scene, group,
    walls, floorMesh: floor, ceilMesh: ceilInst,
    torchLights, torchSprites: [],
    artObjects: [],
    floorMat, ceilMat: ceilMatI, wallMat,
    playerLight,
    portal: portalInfo,
    CELL, WALL_H: STD_CEIL,
  };
}
