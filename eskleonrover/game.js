// eskleon rover — v0: the mill.
// A 3-lane × 4-row treadmill. The belt scrolls far→near; the grid painted
// above it is static — grid cells are logical positions, the belt just flows
// under whatever will one day occupy them.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createScenery } from './scenery.js';

// ------------------------------------------------------------ constants

const COLS = 3, ROWS = 4, TILE = 1;          // grid cells are 1×1 world units
const BELT_W = 3.3;                          // belt is a little wider than the grid
const BELT_L = 5.0;                          // and longer (margin beyond rows 1/4)
const BELT_Y = 1.0;                          // height of the belt surface
const ROLLER_R = 0.22;

const SLATE_BG = 0x3a4254;
const CREAM = 0xf3dcb0;

let beltSpeed = 1;                           // world units / second

// ------------------------------------------------------------ renderer

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(SLATE_BG);

// environment map so metals have something to reflect
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);

function layout() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  // three-quarter view; back the camera off further in narrow/portrait views
  const fit = Math.max(1, 1.15 / camera.aspect);
  const R = 8.8 * Math.pow(fit, 0.85);
  camera.position.set(0, R * 0.66, R * 0.75);
  camera.lookAt(0, 0.75, 0);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', layout);

// ------------------------------------------------------------ lights

scene.add(new THREE.HemisphereLight(0xbcc7e0, 0x2a2e38, 0.9));

const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
sun.position.set(4, 8, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -5; sun.shadow.camera.right = 5;
sun.shadow.camera.top = 5; sun.shadow.camera.bottom = -5;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 20;
scene.add(sun);

// ------------------------------------------------------------ textures

function makeCanvas(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// one 1×1-unit tile of sun-baked desert hardpan: mottled sand, cracked earth,
// pebbles — plus a faint seam that admits it's still a belt. Features are
// stamped 5-way (center + 4 wrap offsets) so the tile loops in both axes.
const beltTex = makeCanvas(256, 256, (g, w, h) => {
  g.fillStyle = '#8a7355'; g.fillRect(0, 0, w, h);
  const stamp = (draw) => {
    for (const [ox, oy] of [[0, 0], [-w, 0], [w, 0], [0, -h], [0, h]]) {
      g.save(); g.translate(ox, oy); draw(); g.restore();
    }
  };
  for (let i = 0; i < 22; i++) {                     // mottled sand patches
    const x = Math.random() * w, y = Math.random() * h, r = 10 + Math.random() * 26;
    const tone = Math.random() < 0.5 ? '138,110,78' : '156,133,98';
    const rot = Math.random() * Math.PI;
    stamp(() => {
      g.fillStyle = 'rgba(' + tone + ',.28)';
      g.beginPath(); g.ellipse(x, y, r, r * 0.6, rot, 0, Math.PI * 2); g.fill();
    });
  }
  g.strokeStyle = 'rgba(74,58,40,.5)'; g.lineWidth = 1.5;   // cracked earth
  for (let i = 0; i < 9; i++) {
    const pts = [[Math.random() * w, Math.random() * h]];
    for (let s = 0; s < 4; s++) {
      const [px, py] = pts[pts.length - 1];
      pts.push([px + (Math.random() - 0.5) * 34, py + Math.random() * 22]);
    }
    stamp(() => {
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (const [px, py] of pts.slice(1)) g.lineTo(px, py);
      g.stroke();
    });
  }
  for (let i = 0; i < 320; i++) {                    // pebbles + pale glints
    g.fillStyle = Math.random() < 0.6 ? 'rgba(60,48,34,.35)' : 'rgba(240,225,195,.25)';
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  g.fillStyle = 'rgba(40,32,22,.5)'; g.fillRect(0, 0, w, 4);   // belt seam
  g.fillStyle = 'rgba(200,175,135,.4)'; g.fillRect(0, 4, w, 1);
});
beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping;
beltTex.repeat.set(BELT_W, BELT_L);                  // 1 canvas per world unit

// roller drum: axial seam stripes so the spin is visible
const rollerTex = makeCanvas(256, 64, (g, w, h) => {
  g.fillStyle = '#1f242e'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 64) {
    g.fillStyle = '#0e1116'; g.fillRect(x, 0, 6, h);
    g.fillStyle = '#454e61'; g.fillRect(x + 6, 0, 2, h);
  }
});
rollerTex.wrapS = THREE.RepeatWrapping;

// static grid overlay: cream cell borders with a soft glow, transparent elsewhere
const gridTex = makeCanvas(768, 1024, (g, w, h) => {
  const cw = w / COLS, ch = h / ROWS;
  g.clearRect(0, 0, w, h);
  g.strokeStyle = 'rgba(243,220,176,.9)';
  g.shadowColor = 'rgba(243,220,176,.9)';
  g.lineWidth = 3;
  for (const blur of [14, 0]) {                      // glow pass, then crisp pass
    g.shadowBlur = blur;
    for (let c = 0; c <= COLS; c++) {
      const x = Math.min(Math.max(c * cw, 2), w - 2);
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      const y = Math.min(Math.max(r * ch, 2), h - 2);
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
  }
});

// ------------------------------------------------------------ the mill

const mill = new THREE.Group();
scene.add(mill);

function box(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
  );
  m.position.set(x, y, z);
  m.castShadow = true;
  mill.add(m);
  return m;
}

// belt surface (texture scrolls; the mesh never moves)
const belt = new THREE.Mesh(
  new THREE.PlaneGeometry(BELT_W, BELT_L),
  new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.95 })
);
belt.rotation.x = -Math.PI / 2;
belt.position.y = BELT_Y;
mill.add(belt);

// static 3×4 grid floating just above the belt
const grid = new THREE.Mesh(
  new THREE.PlaneGeometry(COLS * TILE, ROWS * TILE),
  new THREE.MeshBasicMaterial({ map: gridTex, transparent: true, depthWrite: false })
);
grid.rotation.x = -Math.PI / 2;
grid.position.y = BELT_Y + 0.006;
mill.add(grid);

// rollers at each end, tops flush with the belt surface
const rollerGeo = new THREE.CylinderGeometry(ROLLER_R, ROLLER_R, BELT_W + 0.12, 28);
rollerGeo.rotateZ(Math.PI / 2);                      // axis along X
const rollers = [];
for (const z of [-BELT_L / 2, BELT_L / 2]) {
  const r = new THREE.Mesh(
    rollerGeo,
    new THREE.MeshStandardMaterial({ map: rollerTex, roughness: 0.7 })
  );
  r.position.set(0, BELT_Y - ROLLER_R, z);
  r.castShadow = true;
  mill.add(r);
  rollers.push(r);
}

// housing: deck under the belt, low side rails, legs, end caps over roller axles
box(3.6, 0.5, 4.6, 0x2b3040, 0, BELT_Y - 0.14 - 0.25, 0);            // deck
box(0.16, 0.34, BELT_L + 0.4, 0x545e75, -(BELT_W / 2 + 0.12), BELT_Y - 0.06, 0); // rails
box(0.16, 0.34, BELT_L + 0.4, 0x545e75, (BELT_W / 2 + 0.12), BELT_Y - 0.06, 0);
for (const z of [-BELT_L / 2, BELT_L / 2]) {                          // axle caps
  box(0.22, 0.3, 0.3, 0x545e75, -(BELT_W / 2 + 0.12), BELT_Y - ROLLER_R, z);
  box(0.22, 0.3, 0.3, 0x545e75, (BELT_W / 2 + 0.12), BELT_Y - ROLLER_R, z);
}
for (const [x, z] of [[-1.4, -1.8], [1.4, -1.8], [-1.4, 1.8], [1.4, 1.8]]) {
  box(0.28, 0.36, 0.28, 0x232735, x, 0.18, z);                        // legs
}

// the anti-western desert rolling past (belt props + side lots — scenery.js)
const scenery = createScenery(scene, { BELT_W, BELT_L, BELT_Y });

// ------------------------------------------------------------ ship
// One vehicle = one grid cell. Grid row centers sit at z = -1.5,-0.5,.5,1.5
// (row 1 nearest the camera); the ship starts center lane, two rows out.

const HOVER_Y = BELT_Y + 0.34;
const ship = new THREE.Mesh(
  new THREE.BoxGeometry(0.6, 0.16, 0.78),
  new THREE.MeshStandardMaterial({ color: 0x8d939c, metalness: 0.95, roughness: 0.28 })
);
ship.castShadow = true;
scene.add(ship);
belt.receiveShadow = true;

// logical grid position: gx 0..2 (left→right lanes), gz 0..3 (far→near rows)
const shipTile = { gx: 1, gz: 1 };
const tileX = (gx) => (gx - 1) * TILE;
const tileZ = (gz) => (gz - 1.5) * TILE;
ship.position.set(tileX(shipTile.gx), HOVER_Y, tileZ(shipTile.gz));

// undercarriage cannon port: dark circular inset with an orange energy ring
const ORANGE = 0xffa056;
const port = new THREE.Group();
port.add(new THREE.Mesh(
  new THREE.CylinderGeometry(0.1, 0.1, 0.035, 20),
  new THREE.MeshStandardMaterial({ color: 0x14171f, roughness: 0.55 })
));
const portRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.082, 0.013, 10, 28),
  new THREE.MeshBasicMaterial({ color: ORANGE })
);
portRing.rotation.x = Math.PI / 2;
portRing.position.y = -0.018;
port.add(portRing);
port.position.y = -0.09;               // centered on the belly
ship.add(port);

// ------------------------------------------------------------ input
// WASD never moves the ship — it only aims. Screen-up (W) is -z (the far end).

const KEYDIR = { w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
const held = [];                       // held WASD keys, most recent last

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (!(k in KEYDIR) || e.repeat) return;
  const i = held.indexOf(k);
  if (i >= 0) held.splice(i, 1);
  held.push(k);
});
window.addEventListener('keyup', (e) => {
  const i = held.indexOf(e.key.toLowerCase());
  if (i >= 0) held.splice(i, 1);
});
window.addEventListener('blur', () => { held.length = 0; });

// The most recent key wins its axis outright (holding A then D aims right);
// the most recent held key on the OTHER axis joins it for the 8 diagonals.
// Returns whole-tile steps [dx, dz], each -1/0/1.
function aimStep() {
  if (!held.length) return null;
  const latest = KEYDIR[held[held.length - 1]];
  const s = [latest[0], latest[1]];
  const latestIsX = latest[0] !== 0;
  for (let i = held.length - 2; i >= 0; i--) {
    const d = KEYDIR[held[i]];
    if ((d[0] !== 0) !== latestIsX) { s[0] += d[0]; s[1] += d[1]; break; }
  }
  return s;
}

function stepVec(step) {
  return new THREE.Vector3(step[0], 0, step[1]).normalize();
}

// ------------------------------------------------------------ jump
// Left click: parabolic hop. If aiming, the ship rolls about the horizontal
// axis perpendicular to the aim so its BELLY (and future cannon) faces the
// aimed tile at the apex, then rights itself on the way down.

const JUMP_H = 0.85, JUMP_DUR = 0.62;
const TILT = THREE.MathUtils.degToRad(62);
const DOWN = new THREE.Vector3(0, -1, 0);
const jump = { active: false, t: 0, tilt: 0, axis: new THREE.Vector3(1, 0, 0), step: null, fired: false };

// Asymmetric "gravity" arc, 0→1→0: a hard launch that decelerates into a
// hang at the apex, then a heavier, accelerating fall. kr = fraction of the
// move spent rising (< .5 means the fall takes longer and hits harder).
function arc(k, kr) {
  if (k < kr) { const t = k / kr; return 1 - Math.pow(1 - t, 2.4); }
  const t = (k - kr) / (1 - kr);
  return 1 - Math.pow(t, 2.6);
}

// ease-in-out with adjustable bite: p=1 is linear, higher = slower ends and
// a faster, snappier middle
function sigmoid(k, p) {
  const a = Math.pow(k, p), b = Math.pow(1 - k, p);
  return a / (a + b);
}

// landing settle: momentum carries the ship into a damped dip + rock
const SETTLE_DUR = 0.5;
const settle = { active: false, t: 0, amp: 0, axis: new THREE.Vector3(1, 0, 0) };

function land(axis, energy) {
  settle.active = true;
  settle.t = 0;
  settle.amp = energy;
  settle.axis.copy(axis);
}

// Double click: a second click while airborne converts the jump into a full
// 360° somersault onto the aimed tile, landing upright. The flip aims FRESH:
// whatever WASD is held at the second click wins, independent of the jump's
// tilt — so you can tilt-jump right, shoot, then flip away up-left. Any
// leftover tilt from the jump unwinds (about its own axis) while the flip
// spins up about the new one. Refused if the aimed tile is off the 3×4 grid
// (the jump just finishes normally).
const FLIP_DUR = 0.8, FLIP_H = 0.65;
const flip = {
  active: false, t: 0, theta0: 0, h0: 0,
  axis: new THREE.Vector3(1, 0, 0),      // spin axis, from the flip's own aim
  axis0: new THREE.Vector3(1, 0, 0),     // residual tilt axis inherited from the jump
  from: new THREE.Vector3(), to: new THREE.Vector3()
};
const flipResid = new THREE.Quaternion();

// Right click: the jut — a panic dodge. One tile, strict 4-way (the most
// recently pressed key alone decides, so diagonals degrade to their newest
// component), grounded only. Will eventually spend "juice" from the shared
// energy meter; free while that system doesn't exist.
const JUT_DUR = 0.25, JUT_LEAN = THREE.MathUtils.degToRad(22);
const jut = {
  active: false, t: 0, axis: new THREE.Vector3(1, 0, 0),
  from: new THREE.Vector3(), to: new THREE.Vector3()
};

// ------------------------------------------------------------ juice
// One shared energy pool for offense (cannon) and escape (jut); jumps and
// flips stay free. NO regen by design — energy will come back via physical
// pickups on the belt (future). A kill = 2 shots = 17.5, marked by the notch
// on the meter. Refusing an action (too low) double-blinks the bar.

const JUICE_MAX = 100, COST_SHOT = 8.75, COST_JUT = 5;
const juiceState = { v: JUICE_MAX, flash: 0, blink: 0 };
const juiceEl = document.getElementById('juice');
const juiceFill = document.getElementById('juicefill');
const juiceEdge = document.getElementById('juiceedge');

function spendJuice(cost) {
  if (juiceState.v < cost) {
    juiceState.blink = 0.4;            // can't afford it: double-blink
    return false;
  }
  juiceState.v -= cost;
  juiceState.flash = 0.35;             // receipt: edge flash while the fill dips
  return true;
}

// ------------------------------------------------------------ cannon
// Space fires the undercarriage cannon at the aimed tile — but only mid
// tilt-jump: the belly has to be presented. One shot per jump. A flat jump
// reserves space for the future vertical double-jump (nothing yet).

const glowTex = makeCanvas(128, 128, (g, w, h) => {
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,195,130,1)');
  r.addColorStop(0.4, 'rgba(255,150,80,.55)');
  r.addColorStop(1, 'rgba(255,140,70,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, w, h);
});

const BALL_GEO = new THREE.SphereGeometry(0.085, 16, 12);
const BALL_MAT = new THREE.MeshBasicMaterial({ color: 0xffc37e });
const BALL_GLOW = new THREE.SpriteMaterial({
  map: glowTex, color: ORANGE, transparent: true,
  blending: THREE.AdditiveBlending, depthWrite: false
});
const BALL_SPEED = 7;                  // world units / second

const shots = [];                      // in-flight energy balls
const effects = [];                    // bursts / scorches / port pulses

function fireCannon(tx, tz) {
  const ball = new THREE.Mesh(BALL_GEO, BALL_MAT);
  const glow = new THREE.Sprite(BALL_GLOW);
  glow.scale.set(0.55, 0.55, 1);
  ball.add(glow);
  const from = port.getWorldPosition(new THREE.Vector3());
  const to = new THREE.Vector3(tileX(tx), BELT_Y + 0.03, tileZ(tz));
  ball.position.copy(from);
  scene.add(ball);
  shots.push({ mesh: ball, from, to, t: 0, dur: from.distanceTo(to) / BALL_SPEED });
  // muzzle pulse on the port ring
  effects.push({
    t: 0, dur: 0.25,
    update(k) { portRing.scale.setScalar(1 + 0.8 * (1 - k)); },
    end() { portRing.scale.setScalar(1); }
  });
}

function impact(pos) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.18, 0.28, 32),
    new THREE.MeshBasicMaterial({
      color: ORANGE, transparent: true, opacity: 0.9,
      side: THREE.DoubleSide, depthWrite: false
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pos.x, BELT_Y + 0.012, pos.z);
  scene.add(ring);
  effects.push({
    t: 0, dur: 0.35, mesh: ring,
    update(k) {
      const s = 1 + 2.2 * k;
      ring.scale.set(s, s, 1);
      ring.material.opacity = 0.9 * (1 - k);
    }
  });

  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffc98a, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  flash.position.set(pos.x, BELT_Y + 0.1, pos.z);
  flash.scale.set(0.9, 0.9, 1);
  scene.add(flash);
  effects.push({
    t: 0, dur: 0.22, mesh: flash,
    update(k) {
      const s = 0.9 + 0.8 * k;
      flash.scale.set(s, s, 1);
      flash.material.opacity = 1 - k;
    }
  });

  const scorch = new THREE.Mesh(
    new THREE.PlaneGeometry(0.66, 0.66),
    new THREE.MeshBasicMaterial({
      map: glowTex, color: 0xff7a3a, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false
    })
  );
  scorch.rotation.x = -Math.PI / 2;
  scorch.position.set(pos.x, BELT_Y + 0.004, pos.z);
  scene.add(scorch);
  effects.push({
    t: 0, dur: 1.2, mesh: scorch,
    update(k) { scorch.material.opacity = 0.8 * (1 - k); }
  });
}

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  e.preventDefault();
  if (!jump.active || jump.tilt === 0 || jump.fired || !jump.step) return;
  const tx = shipTile.gx + jump.step[0], tz = shipTile.gz + jump.step[1];
  if (tx < 0 || tx > 2 || tz < 0 || tz > 3) return;  // aiming off the belt
  if (!spendJuice(COST_SHOT)) return;                // tank's too low
  jump.fired = true;
  fireCannon(tx, tz);
});

canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 2) {
    if (jump.active || flip.active || jut.active || !held.length) return;
    const d = KEYDIR[held[held.length - 1]];
    const tx = shipTile.gx + d[0], tz = shipTile.gz + d[1];
    if (tx < 0 || tx > 2 || tz < 0 || tz > 3) return;   // no tile there — refuse
    if (!spendJuice(COST_JUT)) return;                  // tank's too low
    jut.active = true;
    jut.t = 0;
    settle.active = false;                              // a dodge outranks the wobble
    jut.axis.crossVectors(DOWN, stepVec(d)).normalize();
    jut.from.set(tileX(shipTile.gx), 0, tileZ(shipTile.gz));
    jut.to.set(tileX(tx), 0, tileZ(tz));
    shipTile.gx = tx;
    shipTile.gz = tz;
    return;
  }

  if (e.button !== 0 || flip.active || jut.active) return;

  if (!jump.active) {                              // first click: jump
    const step = aimStep();
    jump.active = true;
    jump.t = 0;
    jump.fired = false;                            // fresh cannon charge
    jump.step = step;
    jump.tilt = step ? TILT : 0;
    if (step) jump.axis.crossVectors(DOWN, stepVec(step)).normalize();
    return;
  }

  // second click, still airborne: try to convert into a flip
  const step = aimStep() || jump.step;             // keys held NOW win; else the jump's aim
  if (!step) return;                               // no direction — nothing to flip at
  const tx = shipTile.gx + step[0], tz = shipTile.gz + step[1];
  if (tx < 0 || tx > 2 || tz < 0 || tz > 3) return; // no tile there — refuse

  const k = Math.min(jump.t / JUMP_DUR, 1);
  flip.active = true;
  flip.t = 0;
  flip.h0 = JUMP_H * 4 * k * (1 - k);              // hand off current height…
  flip.theta0 = jump.tilt * Math.sin(Math.PI * k); // …and current tilt angle
  flip.axis.crossVectors(DOWN, stepVec(step)).normalize();
  flip.axis0.copy(jump.axis);
  flip.from.set(tileX(shipTile.gx), 0, tileZ(shipTile.gz));
  flip.to.set(tileX(tx), 0, tileZ(tz));
  shipTile.gx = tx;
  shipTile.gz = tz;
  jump.active = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// soft contact shadow on the (future hardwood) floor
const floorCatcher = new THREE.Mesh(
  new THREE.PlaneGeometry(16, 16),
  new THREE.ShadowMaterial({ opacity: 0.3 })
);
floorCatcher.rotation.x = -Math.PI / 2;
floorCatcher.receiveShadow = true;
scene.add(floorCatcher);

// ------------------------------------------------------------ run

document.getElementById('speed').addEventListener('input', function () {
  beltSpeed = parseFloat(this.value);
});

const clock = new THREE.Clock();
let now = 0;

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  now += dt;
  // increasing offset.v shifts the visible pattern toward +z: far → near
  beltTex.offset.y = (beltTex.offset.y + beltSpeed * dt) % 1;
  for (const r of rollers) r.rotation.x += (beltSpeed / ROLLER_R) * dt;
  scenery.update(dt, beltSpeed);

  if (flip.active) {
    flip.t += dt;
    const k = Math.min(flip.t / FLIP_DUR, 1);
    const move = sigmoid(k, 1.35);                 // near-ballistic travel
    const spin = sigmoid(k, 2.2);                  // windup → fast mid-spin → decisive finish
    ship.position.x = flip.from.x + (flip.to.x - flip.from.x) * move;
    ship.position.z = flip.from.z + (flip.to.z - flip.from.z) * move;
    ship.position.y = HOVER_Y + flip.h0 * Math.pow(1 - k, 1.5) + FLIP_H * arc(k, 0.42);
    // full turn about the flip's own axis, while the jump's leftover tilt
    // unwinds about ITS axis on the same easing (when the two axes coincide
    // the angles just add, reproducing the old single-axis handoff exactly)
    ship.quaternion.setFromAxisAngle(flip.axis, Math.PI * 2 * spin);
    if (flip.theta0 > 0) {
      ship.quaternion.multiply(flipResid.setFromAxisAngle(flip.axis0, flip.theta0 * (1 - spin)));
    }
    if (k >= 1) {
      flip.active = false;
      ship.position.y = HOVER_Y;
      ship.quaternion.identity();
      land(flip.axis, 1);                          // full-weight touchdown
    }
  } else if (jump.active) {
    jump.t += dt;
    const k = Math.min(jump.t / JUMP_DUR, 1);
    ship.position.y = HOVER_Y + JUMP_H * arc(k, 0.46);
    if (jump.tilt > 0) {
      ship.quaternion.setFromAxisAngle(jump.axis, jump.tilt * Math.sin(Math.PI * k));
    }
    if (k >= 1) {
      jump.active = false;
      ship.position.y = HOVER_Y;
      ship.quaternion.identity();
      land(jump.axis, jump.tilt > 0 ? 0.6 : 0.45); // lighter than a flip landing
    }
  } else if (jut.active) {
    jut.t += dt;
    const k = Math.min(jut.t / JUT_DUR, 1);
    const ease = 1 - Math.pow(1 - k, 2.4);         // hard launch, skidding arrival
    ship.position.x = jut.from.x + (jut.to.x - jut.from.x) * ease;
    ship.position.z = jut.from.z + (jut.to.z - jut.from.z) * ease;
    ship.position.y = HOVER_Y;
    // drone-style bank: top leans toward travel, level again before arrival
    ship.quaternion.setFromAxisAngle(jut.axis, -JUT_LEAN * Math.sin(Math.PI * Math.min(k * 1.25, 1)));
    if (k >= 1) {
      jut.active = false;
      ship.quaternion.identity();
      // skid stop: weight pitches toward travel, so rock opposite the flip's
      // carry direction (negate mutates jut.axis; it's reset on the next jut)
      land(jut.axis.negate(), 0.35);
    }
  } else if (settle.active) {
    settle.t += dt;
    const s = Math.min(settle.t / SETTLE_DUR, 1);
    const decay = Math.exp(-5 * s);
    ship.position.y = HOVER_Y - 0.10 * settle.amp * decay * Math.sin(Math.PI * 2.2 * s);
    ship.quaternion.setFromAxisAngle(settle.axis, 0.12 * settle.amp * decay * Math.sin(Math.PI * 3.2 * s));
    if (s >= 1) {
      settle.active = false;
      ship.position.y = HOVER_Y;
      ship.quaternion.identity();
    }
  } else {
    ship.position.y = HOVER_Y + Math.sin(now * 2.2) * 0.035;  // idle hover bob
  }

  // in-flight energy balls
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    s.t += dt;
    const k = Math.min(s.t / s.dur, 1);
    s.mesh.position.lerpVectors(s.from, s.to, k);
    if (k >= 1) {
      scene.remove(s.mesh);            // geometry/material are shared, keep them
      shots.splice(i, 1);
      impact(s.to);
    }
  }

  // transient effects (bursts, scorches, port pulses)
  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i];
    fx.t += dt;
    const k = Math.min(fx.t / fx.dur, 1);
    fx.update(k);
    if (k >= 1) {
      if (fx.end) fx.end();
      if (fx.mesh) {
        scene.remove(fx.mesh);
        fx.mesh.material.dispose();
        if (fx.mesh.geometry) fx.mesh.geometry.dispose();
      }
      effects.splice(i, 1);
    }
  }

  // juice meter: breathing pulse whose tempo and brightness track fullness —
  // slow confident glow when full, quick dim ember flicker when low
  const frac = juiceState.v / JUICE_MAX;
  const period = 0.55 + 1.05 * frac;
  const pulse = 0.5 + 0.5 * Math.sin(now * Math.PI * 2 / period);
  juiceFill.style.width = (frac * 100) + '%';
  juiceFill.style.filter = 'brightness(' + (0.55 + 0.45 * frac + pulse * (0.18 + 0.22 * frac)).toFixed(3) + ')';
  juiceEl.style.boxShadow = '0 0 ' + (2 + 10 * pulse * (0.3 + 0.7 * frac)).toFixed(1) + 'px ' +
    (pulse * 2).toFixed(1) + 'px rgba(255,150,80,' + (0.25 + 0.45 * pulse * frac).toFixed(3) + ')';
  if (juiceState.flash > 0) {
    juiceState.flash = Math.max(0, juiceState.flash - dt);
    juiceEdge.style.opacity = (juiceState.flash / 0.35).toFixed(2);
  }
  if (juiceState.blink > 0) {
    juiceState.blink -= dt;
    juiceEl.style.opacity = (Math.floor(Math.max(0, juiceState.blink) * 12) % 2) ? 0.15 : 1;
    if (juiceState.blink <= 0) juiceEl.style.opacity = 1;
  }
  // the belly port ring is the diegetic version of the same meter: it dims as
  // the tank drains, so opponents can read your charge off the vehicle itself
  portRing.material.color.setHex(ORANGE).multiplyScalar(0.3 + 0.7 * frac + 0.25 * pulse * frac);

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

layout();
tick();

// debug handle for headless tests (virtual time races ahead of THREE.Clock,
// so tests force-complete animations by poking jump.t / flip.t)
window.__rover = { ship, shipTile, jump, flip, jut, shots, effects, juiceState, scenery };
