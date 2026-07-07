// eskleon rover — scenery: the anti-western rolling past.
// A decrepit metal-saloon desert that also happens to be the year 3001.
// Two streams of set dressing:
//   • belt props — 2D sprites that pop up at the far end of the belt, ride it
//     at exactly belt speed, and drop away past the front, like anything
//     standing on a treadmill would.
//   • side lots — platforms hanging off the left/right edges, each usually
//     carrying a building sprite that faces the center (sometimes the
//     platform passes by bare). They run slightly SLOWER than the belt
//     (cfg.sideParallax) so the roadside lags the floor — cheap parallax.
//
// All art here is PLACEHOLDER canvas drawing. When the real Blender renders
// arrive: load them with THREE.TextureLoader and swap the entries in PROPS /
// BUILDINGS below ({ tex, w, h } — w/h in world units); nothing else changes.

import * as THREE from 'three';

// ---------------------------------------------------------- tunables
// Quantities are meant to be dialed: "every" numbers are belt-units of travel
// between spawns [min, max] — smaller = denser desert.

const cfg = {
  propEvery: [1.0, 2.6],        // gap between belt props
  sideEvery: [2.6, 6.0],        // gap between side lots, per side
  barePlatformChance: 0.3,      // side lot arrives with no building on it
  sideParallax: 0.85,           // side-lot speed as a fraction of belt speed
  sideX: 2.6,                   // how far off-center the side lots hang
  sideYaw: THREE.MathUtils.degToRad(52), // buildings turn toward the center
                                // (90° would face it dead-on but read as a
                                // sliver from the fixed camera — this cheats
                                // them open enough to be legible)
  maxItems: 60
};

const R = (range) => range[0] + Math.random() * (range[1] - range[0]);

// ---------------------------------------------------------- canvas art

function tex(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// mirror-polished metal: the one honest material of 3001
function chrome(g, x0, y0, x1, y1) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, '#e8eef4'); gr.addColorStop(0.35, '#9fb0bd');
  gr.addColorStop(0.5, '#55626e'); gr.addColorStop(0.65, '#c7d3dc');
  gr.addColorStop(1, '#7e8c98');
  return gr;
}

function rustStreaks(g, x, y, w, h, n) {
  for (let i = 0; i < n; i++) {
    const sx = x + Math.random() * w;
    g.fillStyle = 'rgba(120,50,25,' + (0.15 + Math.random() * 0.3).toFixed(2) + ')';
    g.fillRect(sx, y, 2 + Math.random() * 4, h * (0.3 + Math.random() * 0.7));
  }
}

// --- buildings (256×256, transparent bg, drawn to be read at ~1.5 units)

const saloonTex = tex(256, 256, (g) => {
  g.fillStyle = '#6b4530'; g.fillRect(28, 74, 200, 182);      // rusted face
  g.fillRect(16, 96, 24, 160); g.fillRect(216, 96, 24, 160);  // parapet wings
  g.fillStyle = '#7d5238'; g.fillRect(40, 58, 176, 34);       // raised crown
  g.fillStyle = chrome(g, 0, 50, 0, 62);                      // chrome cornice
  g.fillRect(34, 50, 188, 12);
  g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2;         // corrugation
  for (let x = 38; x < 222; x += 10) {
    g.beginPath(); g.moveTo(x, 94); g.lineTo(x, 254); g.stroke();
  }
  rustStreaks(g, 30, 94, 196, 150, 9);
  g.fillStyle = '#16120e'; g.fillRect(62, 100, 132, 32);      // dead sign box
  g.strokeStyle = '#ffa056'; g.lineWidth = 3;                 // neon glyphs
  g.shadowColor = '#ffa056'; g.shadowBlur = 8;
  for (const [x0, x1] of [[72, 96], [104, 116], [124, 148], [156, 184]]) {
    g.beginPath(); g.moveTo(x0, 116); g.lineTo(x1, 116); g.stroke();
  }
  g.shadowBlur = 0;
  g.fillStyle = '#100d0a'; g.fillRect(106, 178, 44, 78);      // doorway
  g.fillStyle = '#f3dcb0';                                    // batwing doors
  g.fillRect(109, 196, 17, 34); g.fillRect(130, 196, 17, 34);
  for (const wx of [52, 186]) {                               // glowing windows
    g.fillStyle = '#2a1c10'; g.fillRect(wx - 4, 172, 34, 46);
    g.fillStyle = '#ffb974'; g.fillRect(wx, 176, 26, 38);
    g.fillStyle = 'rgba(43,28,16,.9)'; g.fillRect(wx + 11, 176, 4, 38);
  }
  g.fillStyle = chrome(g, 0, 148, 0, 160);                    // porch canopy
  g.fillRect(40, 148, 176, 10);
  g.fillStyle = '#3a2c20';
  g.fillRect(48, 158, 6, 98); g.fillRect(202, 158, 6, 98);    // porch posts
});

const shackTex = tex(256, 256, (g) => {
  g.save();
  g.transform(1, 0, -0.09, 1, 22, 0);                         // the lean
  g.fillStyle = '#5c4a38'; g.fillRect(40, 96, 160, 160);      // hut body
  g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 2;         // corrugation
  for (let y = 108; y < 252; y += 12) {
    g.beginPath(); g.moveTo(42, y); g.lineTo(198, y); g.stroke();
  }
  g.fillStyle = '#6e5540'; g.fillRect(120, 132, 52, 44);      // mismatched patch
  g.strokeStyle = 'rgba(0,0,0,.25)';
  g.strokeRect(120, 132, 52, 44);
  rustStreaks(g, 44, 100, 150, 150, 7);
  g.fillStyle = chrome(g, 0, 84, 0, 100);                     // chrome roof sheet
  g.fillRect(30, 82, 182, 18);
  g.fillStyle = '#14100c'; g.fillRect(64, 180, 38, 76);       // dark doorway
  g.fillStyle = '#2a1c10'; g.fillRect(126, 190, 40, 34);      // window frame
  g.fillStyle = '#ffb974'; g.fillRect(130, 194, 32, 26);      // lit window
  g.restore();
  g.strokeStyle = '#4b5560'; g.lineWidth = 4;                 // antenna mast
  g.beginPath(); g.moveTo(196, 88); g.lineTo(204, 22); g.stroke();
  g.fillStyle = chrome(g, 186, 20, 222, 44);                  // chrome dish
  g.beginPath(); g.ellipse(206, 26, 18, 11, -0.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffa056';
  g.beginPath(); g.arc(206, 26, 3, 0, Math.PI * 2); g.fill(); // dish feed light
});

const storeTex = tex(256, 256, (g) => {
  g.fillStyle = '#6a4a34'; g.fillRect(12, 96, 232, 160);      // wide front
  g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = 2;
  for (let x = 16; x < 240; x += 12) {
    g.beginPath(); g.moveTo(x, 100); g.lineTo(x, 252); g.stroke();
  }
  rustStreaks(g, 14, 98, 228, 150, 10);
  g.fillStyle = '#7d5238'; g.fillRect(20, 66, 216, 34);       // signboard
  g.fillStyle = chrome(g, 0, 60, 0, 70); g.fillRect(16, 58, 224, 10);
  g.fillStyle = '#ffa056';                                    // glyph dots
  g.shadowColor = '#ffa056'; g.shadowBlur = 6;
  for (let x = 44; x <= 212; x += 24) {
    g.beginPath(); g.arc(x, 83, 4, 0, Math.PI * 2); g.fill();
  }
  g.shadowBlur = 0;
  for (let i = 0; i < 9; i++) {                               // tattered awning
    const x = 20 + i * 24;
    g.fillStyle = i % 2 ? '#8a4a2c' : '#c9b28a';
    g.beginPath();
    g.moveTo(x, 118); g.lineTo(x + 24, 118);
    g.lineTo(x + 20 - Math.random() * 6, 148 - Math.random() * 10);
    g.lineTo(x + 4, 144); g.closePath(); g.fill();
  }
  g.fillStyle = '#241812'; g.fillRect(30, 168, 132, 84);      // storefront glass
  g.fillStyle = 'rgba(255,185,116,.8)'; g.fillRect(36, 174, 120, 72);
  g.fillStyle = '#241812';                                    // mullions
  g.fillRect(74, 174, 5, 72); g.fillRect(116, 174, 5, 72);
  g.fillStyle = '#14100c'; g.fillRect(182, 172, 42, 84);      // doorway
  g.fillStyle = chrome(g, 226, 0, 240, 0);                    // exhaust pipe
  g.fillRect(228, 20, 10, 78);
  g.fillStyle = '#ffa056';
  g.beginPath(); g.arc(233, 16, 5, 0, Math.PI * 2); g.fill(); // pipe pilot light
});

// --- belt props (128×128)

const cactusTex = tex(128, 128, (g) => {
  const arm = (x, y, w, h) => { g.beginPath(); g.roundRect(x, y, w, h, 7); g.fill(); };
  g.fillStyle = chrome(g, 50, 0, 80, 0);
  arm(56, 26, 18, 96);                                        // trunk
  arm(30, 50, 14, 36); g.fillRect(38, 76, 22, 12);            // left arm
  arm(86, 38, 14, 42); g.fillRect(72, 68, 20, 12);            // right arm
  g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(61, 30, 3, 88);  // hot glint
  g.strokeStyle = 'rgba(243,220,176,.7)'; g.lineWidth = 1.5;  // spines
  for (let y = 36; y < 116; y += 12) {
    g.beginPath(); g.moveTo(52, y); g.lineTo(46, y - 4); g.stroke();
    g.beginPath(); g.moveTo(78, y + 6); g.lineTo(84, y + 2); g.stroke();
  }
});

const rocksTex = tex(128, 128, (g) => {
  const poly = (pts) => {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
    g.closePath(); g.fill();
  };
  g.fillStyle = '#565e70'; poly([[8, 112], [30, 72], [62, 64], [86, 86], [90, 112]]);
  g.fillStyle = '#6a7386'; poly([[30, 72], [62, 64], [70, 78], [40, 84]]);
  g.fillStyle = '#454c5c'; poly([[78, 112], [94, 84], [118, 90], [122, 112]]);
  g.strokeStyle = 'rgba(243,220,176,.5)'; g.lineWidth = 2;     // rim light
  g.beginPath(); g.moveTo(30, 72); g.lineTo(62, 64); g.lineTo(86, 86); g.stroke();
});

const canisterTex = tex(128, 128, (g) => {
  g.fillStyle = '#7a4326'; g.fillRect(44, 52, 40, 64);        // rusted drum
  g.fillStyle = '#8a5433';
  g.beginPath(); g.ellipse(64, 52, 20, 7, 0, 0, Math.PI * 2); g.fill();
  g.save();                                                   // faded hazard band
  g.beginPath(); g.rect(44, 74, 40, 16); g.clip();
  for (let x = 36; x < 92; x += 12) {
    g.fillStyle = x % 24 ? 'rgba(243,220,176,.5)' : 'rgba(30,24,18,.5)';
    g.beginPath(); g.moveTo(x, 90); g.lineTo(x + 8, 74); g.lineTo(x + 14, 74);
    g.lineTo(x + 6, 90); g.closePath(); g.fill();
  }
  g.restore();
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(44, 98, 40, 4); // dent shadow
  g.fillStyle = '#ffa056';
  g.beginPath(); g.arc(64, 62, 3, 0, Math.PI * 2); g.fill();  // status light
});

const signTex = tex(128, 128, (g) => {
  g.strokeStyle = '#4b5560'; g.lineWidth = 5;                 // tilted pole
  g.beginPath(); g.moveTo(70, 120); g.lineTo(58, 28); g.stroke();
  g.save();
  g.translate(58, 42); g.rotate(-0.12);
  g.fillStyle = '#6b4530'; g.beginPath(); g.roundRect(-34, -16, 72, 34, 5); g.fill();
  g.strokeStyle = '#ffa056'; g.lineWidth = 3;                 // dying neon glyphs
  g.shadowColor = '#ffa056'; g.shadowBlur = 6;
  g.beginPath(); g.moveTo(-24, 2); g.lineTo(-6, 2); g.stroke();
  g.beginPath(); g.moveTo(2, 2); g.lineTo(28, 2); g.stroke();
  g.shadowBlur = 0;
  g.fillStyle = chrome(g, -34, 0, 38, 0);                     // chrome bolts
  g.beginPath(); g.arc(-28, -10, 3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(32, -10, 3, 0, Math.PI * 2); g.fill();
  g.restore();
  g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 2;          // crack
  g.beginPath(); g.moveTo(40, 34); g.lineTo(52, 48); g.lineTo(48, 58); g.stroke();
});

// ---------------------------------------------------------- registries
// { tex, w, h } — w/h in world units, tuned against the 0.6×0.78 rover.
// Swap point for the Blender renders.

const BUILDINGS = [
  { tex: saloonTex, w: 1.5, h: 1.5 },
  { tex: shackTex, w: 1.15, h: 1.15 },
  { tex: storeTex, w: 1.7, h: 1.7 }
];
const PROPS = [
  { tex: cactusTex, w: 0.5, h: 0.5 },
  { tex: rocksTex, w: 0.55, h: 0.55 },
  { tex: canisterTex, w: 0.4, h: 0.4 },
  { tex: signTex, w: 0.55, h: 0.55 }
];

// ---------------------------------------------------------- factory

export function createScenery(scene, { BELT_W, BELT_L, BELT_Y }) {
  // bottom-origin unit shapes: scale.y grows things up out of the ground
  const PLANE = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const BOX = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

  const PROP_SPAWN_Z = -BELT_L / 2 + 0.15;   // right at the far roller
  const PROP_KILL_Z = BELT_L / 2 + 0.45;     // just off the front edge
  const SIDE_SPAWN_Z = -3.6;
  const SIDE_KILL_Z = 4.2;

  const items = [];
  let propGap = 0.3, gapL = 0.6, gapR = 2.2; // stagger the first arrivals

  const spriteMat = (t) => new THREE.MeshBasicMaterial({
    map: t, transparent: true, alphaTest: 0.08, side: THREE.DoubleSide
  });

  function track(group, opts) {
    const mats = [];
    group.traverse((o) => { if (o.material) mats.push(o.material); });
    scene.add(group);
    items.push({ g: group, mats, travel: 0, a: -1, ...opts });
  }

  // a belt prop: rides at exactly belt speed, pops up out of the far end
  function spawnProp(z, x) {
    if (items.length >= cfg.maxItems) return;
    const P = PROPS[(Math.random() * PROPS.length) | 0];
    const s = 0.8 + Math.random() * 0.5;
    const m = new THREE.Mesh(PLANE, spriteMat(P.tex));
    m.scale.set(P.w * s, 0.001, 1);
    m.position.y = BELT_Y;
    const g = new THREE.Group();
    g.add(m);
    const span = BELT_W - 0.6;
    g.position.set(x !== undefined ? x : (Math.random() - 0.5) * span, 0,
      z !== undefined ? z : PROP_SPAWN_Z);
    track(g, { side: false, mesh: m, targetH: P.h * s, killZ: PROP_KILL_Z });
  }

  // a side lot: platform (always) + building (usually), hanging off one edge
  // at cfg.sideX, running at cfg.sideParallax of belt speed
  function spawnSide(dir, z, bare) {
    if (items.length >= cfg.maxItems) return;
    if (bare === undefined) bare = Math.random() < cfg.barePlatformChance;
    const g = new THREE.Group();

    const slab = (sx, sy, sz, y, mat) => {
      const m = new THREE.Mesh(BOX, mat);
      m.scale.set(sx, sy, sz);
      m.position.y = y;
      m.castShadow = true;
      g.add(m);
      return m;
    };
    slab(1.35, 0.12, 1.9, BELT_Y - 0.2,                       // rusted base
      new THREE.MeshStandardMaterial({ color: 0x453a30, roughness: 0.9, transparent: true }));
    slab(1.45, 0.02, 2.0, BELT_Y - 0.08,                      // chrome trim line
      new THREE.MeshStandardMaterial({ color: 0xb9c4cd, metalness: 0.95, roughness: 0.25, transparent: true }));
    slab(1.4, 0.06, 1.95, BELT_Y - 0.06,                      // weathered deck
      new THREE.MeshStandardMaterial({ color: 0x5c4a38, roughness: 0.85, transparent: true }));

    if (!bare) {
      const B = BUILDINGS[(Math.random() * BUILDINGS.length) | 0];
      const s = 0.9 + Math.random() * 0.35;
      const m = new THREE.Mesh(PLANE, spriteMat(B.tex));
      m.scale.set(B.w * s, B.h * s, 1);
      m.position.y = BELT_Y;
      m.rotation.y = dir < 0 ? cfg.sideYaw : -cfg.sideYaw;    // face the center
      g.add(m);
    }
    g.position.set(dir * cfg.sideX, 0, z !== undefined ? z : SIDE_SPAWN_Z);
    track(g, { side: true, killZ: SIDE_KILL_Z });
  }

  // spawn cadence is measured in DISTANCE, not time, so a stopped belt means
  // a frozen desert (nothing pops in while the world isn't moving)
  function update(dt, beltSpeed) {
    const move = beltSpeed * dt;
    const sideMove = move * cfg.sideParallax;

    propGap -= move;
    if (propGap <= 0) { spawnProp(); propGap = R(cfg.propEvery); }
    gapL -= sideMove;
    if (gapL <= 0) { spawnSide(-1); gapL = R(cfg.sideEvery); }
    gapR -= sideMove;
    if (gapR <= 0) { spawnSide(1); gapR = R(cfg.sideEvery); }

    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const d = it.side ? sideMove : move;
      it.travel += d;
      it.g.position.z += d;
      // belt props pop up out of the belt over their first third-unit
      if (it.mesh) it.mesh.scale.y = it.targetH * Math.min(it.travel / 0.3, 1);
      // ease in on arrival, out again approaching the kill line
      const a = Math.min(it.travel / 0.4, 1) *
        THREE.MathUtils.clamp((it.killZ - it.g.position.z) / 0.6, 0, 1);
      if (a !== it.a) {
        it.a = a;
        for (const m of it.mats) m.opacity = a;
      }
      if (it.g.position.z > it.killZ) {
        scene.remove(it.g);
        for (const m of it.mats) m.dispose();  // textures/geos are shared, keep
        items.splice(i, 1);
      }
    }
  }

  return { update, items, cfg, spawnProp, spawnSide };
}
