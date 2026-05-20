// Wasapok Castle — HALLWAY 2 ROOM entry.
// Standalone scene reached by stepping on the red trigger pad at the east
// end of the main hall library. Player spawns at the west end of a 2-tile
// hallway, facing east; walking forward opens into a single 9x9 room with
// no other exits.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createPlayer } from '../museum/player.js?v=10';
import { buildScene } from './scene.js?v=88';
import { setupSceneNav } from '../nav.js?v=6';

const opts = {
  pixelation: 3,
  fogDistance: 20,
  headbob: true,
  sprintFov: true,
  // Wasapok Room reuses this entry but skips the central chrome chamber
  // and doubles the floor plan.
  chamber: !/wasapok-room\.html/i.test(window.location.pathname),
  bigRoom: /wasapok-room\.html/i.test(window.location.pathname),
};

// ---- Renderer ----
const gameEl = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.45;
renderer.setPixelRatio(1);
gameEl.appendChild(renderer.domElement);

const built = buildScene(opts);
const scene = built.scene;
const layout = built.layout;

// ---- Camera ----
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 200);
const player = createPlayer(layout, built.CELL);
player.applyToCamera(camera);

const nav = setupSceneNav({
  sceneUrl: 'hallway-2-room.html',
  player, camera,
  spawnTile: layout.spawn,
  forwardTriggers: [], // no forward triggers in this room
  defaultReturnScene: 'main-hall.html',
  returnLoadingMsg: "You weren't ready",
});

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const px = Math.max(1, opts.pixelation | 0);
  const rw = Math.max(160, Math.floor(w / px));
  const rh = Math.max(120, Math.floor(h / px));
  renderer.setSize(rw, rh, false);
  renderer.domElement.style.width = w + 'px';
  renderer.domElement.style.height = h + 'px';
  renderer.domElement.style.imageRendering = 'pixelated';
  camera.aspect = rw / rh;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// ===========================================================
// INPUT — keyboard + on-screen D-pad (mirrors museum/main.js)
// ===========================================================
const keyDown = {};

// ----- Chamber hitbox proximity message -----
const CHAMBER_TILES = new Set(['6,4', '7,4', '8,4']);
const _DX = [0, 1, 0, -1], _DY = [-1, 0, 1, 0];
const chamberMsgEl = document.getElementById('chamber-msg');
let chamberMsgTimer = null;
function showChamberMsg() {
  if (!chamberMsgEl) return;
  chamberMsgEl.classList.remove('show');
  void chamberMsgEl.offsetWidth; // restart transition
  chamberMsgEl.classList.add('show');
  if (chamberMsgTimer) clearTimeout(chamberMsgTimer);
  chamberMsgTimer = setTimeout(() => chamberMsgEl.classList.remove('show'), 2200);
}
function bumpsChamber(relDir) {
  const wd = (player.state.dir + relDir) % 4;
  const tx = player.state.tx + _DX[wd];
  const ty = player.state.ty + _DY[wd];
  return CHAMBER_TILES.has(`${tx},${ty}`);
}

// ----- Desk-bump → Confirm? → sit -----
const DESK_TILE = opts.bigRoom
  ? { x: built.layout.roomCx - 1, y: built.layout.roomCy }
  : null;
const SITTING_POSE = opts.bigRoom ? {
  x: (built.layout.roomCx - 1) * built.CELL - 0.3,
  y: 1.32,
  z: built.layout.roomCy * built.CELL,
  yaw: -Math.PI / 2,
  pitch: 0.12,
} : null;
// Convergence point: 3 tiles east of the seated player (they face east).
const CENTER_X = SITTING_POSE ? SITTING_POSE.x + 3 * built.CELL : 0;
const CENTER_Z = SITTING_POSE ? SITTING_POSE.z : 0;
const CENTER_Y_BASE = 1.25;
const ABSORB_DIST = 0.6;
const HOMING_BLEND = 1.8;
let centralVase = null;

// Zoom-in state machine: forward arrow advances camera toward the central vase
// after dreidel mode. 4 poses, eased lerp between adjacent steps.
const ZOOM_POSES = SITTING_POSE ? [
  { x: SITTING_POSE.x, y: SITTING_POSE.y, z: SITTING_POSE.z, yaw: SITTING_POSE.yaw, pitch: SITTING_POSE.pitch },
  { x: 21.00, y: 1.30, z: SITTING_POSE.z, yaw: SITTING_POSE.yaw, pitch: 0.08 },
  { x: 22.00, y: 1.27, z: SITTING_POSE.z, yaw: SITTING_POSE.yaw, pitch: 0.04 },
  { x: 22.80, y: 1.25, z: SITTING_POSE.z, yaw: SITTING_POSE.yaw, pitch: 0.00 },
] : null;
const ZOOM_DUR = 0.7;
let zoomStep = 0;
let zoomAnim = null; // { fromIdx, toIdx, startT }
function easeInOutCubicLocal(p) {
  return p < 0.5 ? 4*p*p*p : 1 - Math.pow(-2*p + 2, 3) / 2;
}
function currentZoomPose(tNow) {
  if (!ZOOM_POSES) return null;
  if (zoomAnim) {
    const phase = Math.min(1, (tNow - zoomAnim.startT) / ZOOM_DUR);
    if (phase >= 1) {
      zoomStep = zoomAnim.toIdx;
      const target = ZOOM_POSES[zoomStep];
      zoomAnim = null;
      return target;
    }
    const e = easeInOutCubicLocal(phase);
    const a = ZOOM_POSES[zoomAnim.fromIdx];
    const b = ZOOM_POSES[zoomAnim.toIdx];
    return {
      x: a.x + (b.x - a.x) * e,
      y: a.y + (b.y - a.y) * e,
      z: a.z + (b.z - a.z) * e,
      yaw: a.yaw + (b.yaw - a.yaw) * e,
      pitch: a.pitch + (b.pitch - a.pitch) * e,
    };
  }
  return ZOOM_POSES[zoomStep];
}
function tryAdvanceZoom() {
  if (!ZOOM_POSES) return false;
  if (zoomAnim) return false;
  if (zoomStep >= ZOOM_POSES.length - 1) return false;
  if (!centralVase || !built.dreidelVases || built.dreidelVases.length !== 1) return false;
  zoomAnim = { fromIdx: zoomStep, toIdx: zoomStep + 1, startT: performance.now() / 1000 };
  return true;
}

// Dungeon fade — scales fog far and crossfades scene background as zoomStep rises.
// At fade=1, dungeon geometry is hidden so only the central vase remains visible.
const FOG_FAR_DUNGEON = scene.fog ? scene.fog.far : 20;
const FOG_FAR_PAGE = 5;
const BG_DUNGEON = new THREE.Color(0x040e08);
const BG_PAGE = new THREE.Color(0x0a1a1f);
const FOG_DUNGEON = new THREE.Color(0x000000);
const FOG_PAGE = new THREE.Color(0x0a1a1f);
let dungeonHidden = false;
let navUIHidden = false;
let forwardArrowHidden = false;
function dungeonFadeValue() {
  if (!ZOOM_POSES) return 0;
  // Smooth fade across the three transitions. At step 0 → 0, step 3 → 1.
  let raw;
  if (zoomAnim) {
    const phase = Math.min(1, (performance.now() / 1000 - zoomAnim.startT) / ZOOM_DUR);
    raw = (zoomAnim.fromIdx + phase) / (ZOOM_POSES.length - 1);
  } else {
    raw = zoomStep / (ZOOM_POSES.length - 1);
  }
  return Math.max(0, Math.min(1, raw));
}
// Albums (ported from /index.html). currentAlbumKey is flipped by spin direction
// once spin is wired up; for now it's fixed at 'A'.
const ALBUMS = {
  A: {
    title:      'Biome .•.•.•:::Plain.',
    audioUrl:   '../soundtrackComp.mp3',
  },
  B: {
    title:      "‘°Palm Tree Syrup’°”",
    audioUrl:   '../soundtrackSyrup.mp3',
  },
};
let currentAlbumKey = 'A';

const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
// Floating 3D title text — one billboarded sprite per album, crossfaded by spin.
function makeTitleSprite(text) {
  const W = 1024, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.font = '700 96px Cinzel, serif';
  ctx.fillStyle = '#fff4c8';
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 22;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false });
  const s = new THREE.Sprite(m);
  s.scale.set(4.0, 1.0, 1);
  s.renderOrder = 9;
  return s;
}
let titleSprites = null;
function spawnTitleSprites() {
  if (titleSprites || !centralVase) return;
  const a = makeTitleSprite(ALBUMS.A.title);
  const b = makeTitleSprite(ALBUMS.B.title);
  const cx = centralVase.position.x, cy = centralVase.position.y, cz = centralVase.position.z;
  // Place ~2m behind the vase (east of vase, since camera is west and looks east).
  a.position.set(cx + 2.0, cy + 1.2, cz);
  b.position.set(cx + 2.0, cy + 1.2, cz);
  scene.add(a);
  scene.add(b);
  titleSprites = { A: a, B: b };
}
function updateTitleSprites() {
  if (!titleSprites) return;
  const f = dungeonFadeValue();
  const baseOpacity = Math.max(0, Math.min(1, (f - 0.66) * 3));
  titleSprites.A.material.opacity = baseOpacity * (currentAlbumKey === 'A' ? 1 : 0);
  titleSprites.B.material.opacity = baseOpacity * (currentAlbumKey === 'B' ? 1 : 0);
}

// Alt vase model (vaseNew.glb) — loaded lazily on sit, swapped in at step 3.
let altVase = null;
let altVaseMaterials = [];
let altVaseAdded = false;
let altVaseFadeStartT = 0; // 0 = not started
function loadAltVase() {
  if (altVase) return;
  new GLTFLoader().load('../vaseNew.glb', (g) => {
    altVase = g.scene;
    const bbox = new THREE.Box3().setFromObject(altVase);
    const sz = new THREE.Vector3();
    bbox.getSize(sz);
    const maxD = Math.max(sz.x, sz.y, sz.z);
    altVase.scale.setScalar(maxD > 0 ? 2.5 / maxD : 1);
    const ctr = new THREE.Box3().setFromObject(altVase).getCenter(new THREE.Vector3());
    altVase.position.sub(ctr);
    altVase.traverse(n => {
      if (n.isMesh) {
        const m = new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          metalness: 0.3, roughness: 0.05,
          transmission: 0.85, thickness: 0.6, ior: 1.5,
          clearcoat: 0.5, clearcoatRoughness: 0.1,
          emissive: 0x0a0820, emissiveIntensity: 0.1,
          transparent: true, opacity: 0,
          side: THREE.DoubleSide,
        });
        n.material = m;
        altVaseMaterials.push(m);
      }
    });
    altVase.visible = false;
  }, undefined, (err) => {
    console.warn('[wasapok] vaseNew.glb failed', err);
  });
}

// PS1-style boombox — built from primitives, lives on the ground to the right
// of the vase. Tap to start/pause audio for the current album.
let boombox = null;
let boomboxLED = null;
let audioEl = null;
let audioIsPlaying = false;
function buildBoombox() {
  if (boombox || !centralVase) return;
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x8a8c92, roughness: 0.7, metalness: 0.15, flatShading: true });
  const navy = new THREE.MeshStandardMaterial({ color: 0x1a2860, roughness: 0.55, metalness: 0.25, flatShading: true });
  const navyDark = new THREE.MeshStandardMaterial({ color: 0x0e1840, roughness: 0.7, metalness: 0.2, flatShading: true });
  const coral = new THREE.MeshStandardMaterial({
    color: 0xff6a4d, emissive: 0xff5230, emissiveIntensity: 1.2,
    roughness: 0.4, metalness: 0.0, flatShading: true,
  });
  // Body slab — wide, short, deep enough to read as a boombox
  const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 0.28), body);
  bodyMesh.position.y = 0.21;
  g.add(bodyMesh);
  // Speakers (two circles done as low-segment cylinders to keep PS1 facets)
  const spkGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.03, 12);
  const spkL = new THREE.Mesh(spkGeo, navy);
  spkL.rotation.x = Math.PI / 2;
  spkL.position.set(-0.27, 0.21, 0.145);
  g.add(spkL);
  const spkR = spkL.clone();
  spkR.position.x = 0.27;
  g.add(spkR);
  // Speaker inner rings
  const spkInnerGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.035, 10);
  const spkInnerL = new THREE.Mesh(spkInnerGeo, navyDark);
  spkInnerL.rotation.x = Math.PI / 2;
  spkInnerL.position.set(-0.27, 0.21, 0.155);
  g.add(spkInnerL);
  const spkInnerR = spkInnerL.clone();
  spkInnerR.position.x = 0.27;
  g.add(spkInnerR);
  // Top handle — thin bar above body
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.04), body);
  handle.position.set(0, 0.5, 0);
  g.add(handle);
  const handlePostL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.04), body);
  handlePostL.position.set(-0.24, 0.46, 0);
  g.add(handlePostL);
  const handlePostR = handlePostL.clone();
  handlePostR.position.x = 0.24;
  g.add(handlePostR);
  // Cassette window — coral-trimmed dark inset
  const cassetteWin = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.02), navyDark);
  cassetteWin.position.set(0, 0.28, 0.15);
  g.add(cassetteWin);
  // Power LED (smoldering coral) — pulses when playing
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.025), coral);
  led.position.set(-0.35, 0.36, 0.145);
  g.add(led);
  boomboxLED = led;
  // Smaller and shifted further to camera-right (south = +Z)
  g.scale.setScalar(0.6);
  const cx = centralVase.position.x, cz = centralVase.position.z;
  g.position.set(cx - 0.5, 0, cz + 1.7);
  // Aim the boombox's +Z (its "front" with speakers) at the final seated camera.
  if (ZOOM_POSES) {
    const finalPose = ZOOM_POSES[ZOOM_POSES.length - 1];
    g.rotation.y = Math.atan2(finalPose.x - g.position.x, finalPose.z - g.position.z);
  }
  g.visible = false;
  scene.add(g);
  boombox = g;
}
function ensureAudio() {
  if (audioEl) return audioEl;
  audioEl = new Audio();
  audioEl.loop = true;
  audioEl.volume = 0.55;
  audioEl.src = ALBUMS[currentAlbumKey].audioUrl;
  return audioEl;
}
let _audioCurrentKey = null;
function setAudioForAlbum(key) {
  const a = ensureAudio();
  if (_audioCurrentKey === key) return;
  const wasPlaying = audioIsPlaying;
  a.src = ALBUMS[key].audioUrl;
  _audioCurrentKey = key;
  if (wasPlaying) a.play().catch(() => {});
}
function toggleAudio() {
  const a = ensureAudio();
  if (audioIsPlaying) {
    a.pause();
    audioIsPlaying = false;
  } else {
    a.play().then(() => { audioIsPlaying = true; }).catch(() => { audioIsPlaying = false; });
  }
}
function tryBoomboxClick(clientX, clientY) {
  if (!boombox) return false;
  if (!ZOOM_POSES || zoomStep !== ZOOM_POSES.length - 1 || zoomAnim) return false;
  const rect = renderer.domElement.getBoundingClientRect();
  _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_ndc, camera);
  const hits = _raycaster.intersectObject(boombox, true);
  if (!hits.length) return false;
  toggleAudio();
  return true;
}
function updateBoombox(tNow) {
  if (!boombox || !boomboxLED) return;
  // Reveal only once the dungeon has mostly faded
  boombox.visible = dungeonFadeValue() > 0.5;
  // LED pulse: brighter when playing, gentle smolder when idle
  const baseEm = audioIsPlaying ? 2.0 : 0.7;
  const pulse = audioIsPlaying ? 0.5 : 0.25;
  boomboxLED.material.emissiveIntensity = baseEm + Math.sin(tNow * (audioIsPlaying ? 5.5 : 2.0)) * pulse;
  // Subtle hover-cue bob before first interaction
  if (!audioIsPlaying) {
    boombox.position.y = Math.sin(tNow * 1.6) * 0.015;
  } else {
    boombox.position.y = 0;
  }
}

// Spin physics state (active at zoom step 3)
let vaseAngVel = 0;
let vaseTilt = 0;
let vaseWobble = 0;
let leanAzimuth = 0; // direction of slump, precesses slowly when idle
let snapping = false;
let snapStartT = 0;
let snapFromTilt = 0;
let spinDragging = false;
let spinLastX = 0;
let spinLastT = 0;
const SPIN_DAMPING = 0.997;
const SPIN_MIN = 0.2;
const SPIN_IMPULSE = 0.14;
const SPIN_FULL = 8.0;
const SNAP_DUR = 0.45;
const SNAP_TILT_THRESHOLD = THREE.MathUtils.degToRad(18);
const SNAP_ANGVEL_THRESHOLD = 4.5;
const SNAP_TARGET_TILT = THREE.MathUtils.degToRad(3);

// Sustained top-speed → shatter
const SHATTER_THRESHOLD = 7.0;
const SHATTER_DURATION = 10.0;
const SHARD_GRAVITY = 9.8;
let topSpeedTimer = 0;
let shattered = false;
const shards = [];

// Post-shatter: the orange pyro-circle (#nav-glow) becomes a 3-press button
// that snaps the wasapok room's set-walls (N/E/S) through static tilt states
// (30°, 60°, 90° outward). The third press also reveals the black void.
const DROP_MAX = 3;
let dropStep = 0;
function triggerShatter() {
  if (shattered || !centralVase) return;
  shattered = true;
  // Hide the vase meshes
  for (const child of centralVase.children) child.visible = false;
  // Stop audio
  if (audioEl && audioIsPlaying) {
    audioEl.pause();
    audioIsPlaying = false;
  }
  // Hide all UI
  if (titleSprites) {
    titleSprites.A.material.opacity = 0;
    titleSprites.B.material.opacity = 0;
  }
  // Activate the orange pyro-circle as a button (3 presses → tip set walls).
  // Hide the d-pad grid entirely — its empty grid cells default to
  // pointer-events: auto and would block clicks even with the container
  // itself set to pointer-events: none.
  const navGlowEl = document.getElementById('nav-glow');
  if (navGlowEl) navGlowEl.classList.add('active');
  const navCrossEl = document.getElementById('nav-cross');
  if (navCrossEl) navCrossEl.style.display = 'none';
  // Push fog out so the set walls (at room perimeter, ~18m from camera) are
  // clearly visible — otherwise the post-shatter tilt happens behind the fog
  // and the player sees no change.
  if (scene.fog) {
    scene.fog.near = 3;
    scene.fog.far = 60;
  }
  // Spawn shards exploding outward — mix of crystal shapes for shattered-glass feel
  const shardMat = new THREE.MeshPhysicalMaterial({
    color: 0xfafcff,
    metalness: 0.15, roughness: 0.02,
    transmission: 0.55, thickness: 0.2, ior: 1.55,
    clearcoat: 0.85, clearcoatRoughness: 0.06,
    emissive: 0x1a2030, emissiveIntensity: 0.18,
    transparent: true, opacity: 0.78,
    side: THREE.DoubleSide,
  });
  const cx = centralVase.position.x, cz = centralVase.position.z;
  const N = 55;
  for (let i = 0; i < N; i++) {
    let geo;
    const shapeRoll = Math.random();
    if (shapeRoll < 0.45) {
      // Pointy crystal speck (octahedron) — small + sharp
      geo = new THREE.OctahedronGeometry(0.035 + Math.random() * 0.07);
    } else if (shapeRoll < 0.78) {
      // Thin flat plate — looks like a real glass sliver
      const w = 0.05 + Math.random() * 0.10;
      const h = 0.09 + Math.random() * 0.14;
      geo = new THREE.BoxGeometry(w, h, 0.010);
    } else {
      // Sharp tetrahedron prism
      geo = new THREE.TetrahedronGeometry(0.045 + Math.random() * 0.09);
    }
    const m = new THREE.Mesh(geo, shardMat);
    // Position distributed along the vase column at random heights
    const ang = Math.random() * Math.PI * 2;
    const radius = Math.random() * 0.35;
    const yPos = 0.2 + Math.random() * 2.0;
    m.position.set(cx + Math.cos(ang) * radius, yPos, cz + Math.sin(ang) * radius);
    m.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
    // Radial explosion velocity + upward kick + random jitter
    const speed = 2.8 + Math.random() * 3.2;
    m.userData.vel = new THREE.Vector3(
      Math.cos(ang) * speed + (Math.random() - 0.5) * 1.8,
      Math.random() * 3.5 + 0.4,
      Math.sin(ang) * speed + (Math.random() - 0.5) * 1.8
    );
    m.userData.angVel = new THREE.Vector3(
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 14
    );
    m.userData.age = 0;
    scene.add(m);
    shards.push(m);
  }
}
function updateShards(dt) {
  for (let i = shards.length - 1; i >= 0; i--) {
    const s = shards[i];
    s.userData.vel.y -= SHARD_GRAVITY * dt;
    s.position.x += s.userData.vel.x * dt;
    s.position.y += s.userData.vel.y * dt;
    s.position.z += s.userData.vel.z * dt;
    s.rotation.x += s.userData.angVel.x * dt;
    s.rotation.y += s.userData.angVel.y * dt;
    s.rotation.z += s.userData.angVel.z * dt;
    if (s.position.y < 0.05) {
      s.position.y = 0.05;
      s.userData.vel.y *= -0.28;
      s.userData.vel.x *= 0.6;
      s.userData.vel.z *= 0.6;
      s.userData.angVel.multiplyScalar(0.6);
    }
  }
}

// Glow-button: clickable only after shatter. Each press snaps the N/E/S walls
// to the next static tilt state (30°, 60°, 90° outward); the third press also
// pushes background + fog to black to reveal the void.
{
  const navGlowEl = document.getElementById('nav-glow');
  if (navGlowEl) {
    navGlowEl.addEventListener('pointerdown', (e) => {
      console.log('[wasapok] nav-glow tap', { shattered, dropStep, hasSetWalls: !!(built && built.setWalls) });
      if (!shattered || dropStep >= DROP_MAX) return;
      e.stopPropagation();
      const sw = built.setWalls;
      if (!sw) return;
      dropStep += 1;
      const angle = (dropStep / DROP_MAX) * (Math.PI / 2);
      for (const key of ['east', 'north', 'south']) {
        const w = sw[key];
        w.hinge.rotation[w.axis] = w.sign * angle;
      }
      console.log('[wasapok] tilt set to', angle.toFixed(3), 'rad', { dropStep });
      navGlowEl.classList.remove('darken-1', 'darken-2', 'darken-3');
      navGlowEl.classList.add(`darken-${dropStep}`);
      if (dropStep >= DROP_MAX) {
        scene.background = new THREE.Color(0x000000);
        if (scene.fog) {
          scene.fog.color.set(0x000000);
          scene.fog.near = 22;
          scene.fog.far = 80;
        }
      }
    });
  }
}

window.addEventListener('pointerdown', (e) => {
  if (shattered) return;
  if (!ZOOM_POSES) return;
  if (zoomStep !== ZOOM_POSES.length - 1 || zoomAnim) return;
  // Boombox tap → toggle audio; otherwise → spin drag
  if (tryBoomboxClick(e.clientX, e.clientY)) return;
  spinDragging = true;
  spinLastX = e.clientX;
  spinLastT = performance.now();
});
window.addEventListener('pointermove', (e) => {
  if (shattered || !spinDragging) return;
  const now = performance.now();
  const dx = e.clientX - spinLastX;
  const dt2 = Math.max(1, now - spinLastT);
  vaseAngVel += (dx / dt2) * SPIN_IMPULSE;
  spinLastX = e.clientX;
  spinLastT = now;
}, { passive: true });
window.addEventListener('pointerup', () => { spinDragging = false; }, { passive: true });

function applyDungeonFade() {
  // Room stays active — fog, background, and dungeon geometry are all preserved.
  // dungeonFadeValue() is still used below to gate icon/title/boombox opacity.
  // Spawn icons lazily once the central vase exists and we've started zooming.
  if (centralVase && !titleSprites && zoomStep >= 1) spawnTitleSprites();
  updateTitleSprites();
  if (centralVase && !boombox && zoomStep >= 1) buildBoombox();
  updateBoombox(performance.now() / 1000);

  // Vase model crossfade — OBJ → GLB during the step 2→3 zoom.
  if (centralVase && altVase && !altVaseAdded && zoomAnim && zoomAnim.toIdx === ZOOM_POSES.length - 1) {
    centralVase.add(altVase);
    altVase.visible = true;
    altVaseAdded = true;
    altVaseFadeStartT = performance.now() / 1000;
  }
  if (altVaseAdded) {
    const elapsed = performance.now() / 1000 - altVaseFadeStartT;
    const k = Math.min(1, elapsed / 0.7);
    const objChild = centralVase.children.find(c => c !== altVase);
    if (objChild && objChild.visible) {
      objChild.traverse(o => { if (o.isMesh && o.material) o.material.opacity = (1 - k) * 0.32; });
      if (k >= 1) objChild.visible = false;
    }
    for (const m of altVaseMaterials) m.opacity = k * 0.85;
  }

  // Hide combat UI once zoom starts — CSS handles the fade.
  if (zoomStep >= 1 || zoomAnim) {
    if (lifeBar) lifeBar.style.opacity = '0';
    if (damageOverlay) damageOverlay.style.opacity = '0';
  }

  // Hide all nav arrows except forward (+ the two look-up dots) once the
  // central vase drops into dreidel mode.
  if (!navUIHidden && centralVase && built.dreidelVases && built.dreidelVases.length === 1) {
    for (const id of ['dpad-left', 'dpad-right', 'dpad-down', 'dpad-upleft', 'dpad-upright']) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
    navUIHidden = true;
  }

  // Hide the forward arrow too once the vase becomes interactable (zoom step 3).
  if (!forwardArrowHidden && ZOOM_POSES && zoomStep === ZOOM_POSES.length - 1 && !zoomAnim) {
    const el = document.getElementById('dpad-up');
    if (el) el.style.display = 'none';
    forwardArrowHidden = true;
  }
}

// Pixelated 4-pointed star texture for absorption pulses.
// Two perpendicular tapered spines + a small diamond center glow,
// quantized so the pixel grid reads clearly. NearestFilter keeps it chunky.
const PULSE_TEX = (() => {
  const size = 24;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const cx = (size - 1) / 2;
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = Math.abs(x - cx) / r;
      const ny = Math.abs(y - cx) / r;
      // Horizontal spine: thin in y, reaches further along x
      const sh = Math.max(0, 1 - ny * 4.5) * Math.max(0, 1 - nx * 0.55);
      // Vertical spine: thin in x, reaches further along y
      const sv = Math.max(0, 1 - nx * 4.5) * Math.max(0, 1 - ny * 0.55);
      // Small diamond glow at the center
      const cg = Math.max(0, 1 - (nx + ny) * 1.4);
      let v = Math.max(sh, sv, cg * 0.7);
      v = Math.floor(v * 5) / 5; // chunky 5-step alpha
      ctx.fillStyle = `rgba(255, 240, 180, ${v})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
})();
const pulses = [];
const PULSE_HOT = new THREE.Color(0xfff7d4);
const PULSE_COOL = new THREE.Color(0xffa850);
function spawnPulse(pos, tNow) {
  const mat = new THREE.SpriteMaterial({
    map: PULSE_TEX,
    color: PULSE_HOT.clone(),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const s = new THREE.Sprite(mat);
  s.position.copy(pos);
  s.scale.setScalar(0.4);
  scene.add(s);
  pulses.push({ sprite: s, born: tNow, dur: 0.9 });
}
const confirmMsgEl = document.getElementById('confirm-msg');
const CONFIRM_WINDOW_MS = 2500;
let confirmShownAt = 0;
let sitting = false;
function showConfirmMsg() {
  if (!confirmMsgEl) return;
  confirmMsgEl.classList.remove('show');
  void confirmMsgEl.offsetWidth;
  confirmMsgEl.classList.add('show');
  setTimeout(() => confirmMsgEl.classList.remove('show'), CONFIRM_WINDOW_MS);
}
function hideConfirmMsg() {
  if (confirmMsgEl) confirmMsgEl.classList.remove('show');
}
function bumpsDesk(relDir) {
  if (!DESK_TILE) return false;
  const wd = (player.state.dir + relDir) % 4;
  const tx = player.state.tx + _DX[wd];
  const ty = player.state.ty + _DY[wd];
  return tx === DESK_TILE.x && ty === DESK_TILE.y;
}
function onDeskBump() {
  if (sitting) return;
  const now = performance.now();
  if (confirmShownAt > 0 && now - confirmShownAt < CONFIRM_WINDOW_MS) {
    sitting = true;
    confirmShownAt = 0;
    hideConfirmMsg();
    // 42 dynamic PointLights compile into every material's fragment shader and
    // tank framerate when the vases cluster. Cull them all on sit; the room is
    // still lit by the chandelier + torches.
    if (built.dreidelVases) {
      for (const v of built.dreidelVases) {
        const il = v.userData.innerLight;
        if (il) {
          if (il.parent) il.parent.remove(il);
          v.userData.innerLight = null;
        }
      }
    }
    // Kick off the alt vase load now so it's ready by the time the user zooms in.
    loadAltVase();
    return;
  }
  confirmShownAt = now;
  showConfirmMsg();
}

function handleAction(act) {
  if (shattered) return;
  if (sitting) {
    if (act === 'forward') tryAdvanceZoom();
    else if (act === 'sprint_on') player.setSprint(true);
    else if (act === 'sprint_off') player.setSprint(false);
    return;
  }
  switch (act) {
    case 'forward': if (bumpsChamber(0)) showChamberMsg(); if (bumpsDesk(0)) onDeskBump(); player.tryMove(0); break;
    case 'back':    if (bumpsChamber(2)) showChamberMsg(); if (bumpsDesk(2)) onDeskBump(); player.tryMove(2); break;
    case 'left':    player.tryTurn(-1); break;
    case 'right':   player.tryTurn(1); break;
    case 'strafeL': if (bumpsChamber(3)) showChamberMsg(); if (bumpsDesk(3)) onDeskBump(); player.tryMove(3); break;
    case 'strafeR': if (bumpsChamber(1)) showChamberMsg(); if (bumpsDesk(1)) onDeskBump(); player.tryMove(1); break;
    case 'sprint_on':  player.setSprint(true); break;
    case 'sprint_off': player.setSprint(false); break;
  }
}
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  keyDown[k] = true;
  if      (k === 'w' || k === 'arrowup')    { handleAction('forward'); e.preventDefault(); }
  else if (k === 's' || k === 'arrowdown')  { handleAction('back'); e.preventDefault(); }
  else if (k === 'a' || k === 'arrowleft')  { handleAction('left'); e.preventDefault(); }
  else if (k === 'd' || k === 'arrowright') { handleAction('right'); e.preventDefault(); }
  else if (k === 'q')                       { handleAction('strafeL'); e.preventDefault(); }
  else if (k === 'e')                       { handleAction('strafeR'); e.preventDefault(); }
  else if (k === 'shift')                   { handleAction('sprint_on'); e.preventDefault(); }
});
window.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  keyDown[k] = false;
  if (k === 'shift') handleAction('sprint_off');
});
function clearHeldKeys() { for (const k in keyDown) keyDown[k] = false; player.setSprint(false); }
window.addEventListener('blur', clearHeldKeys);
window.addEventListener('focus', clearHeldKeys);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearHeldKeys(); });

// Hold-to-walk
let lastMoveAttempt = 0;
function tickHold(now) {
  if (player.state.anim) return;
  if (now - lastMoveAttempt < 140) return;
  if (keyDown['w'] || keyDown['arrowup'] || dpadHeld.forward)     { handleAction('forward'); lastMoveAttempt = now; }
  else if (keyDown['s'] || keyDown['arrowdown'] || dpadHeld.back) { handleAction('back'); lastMoveAttempt = now; }
}

// ---- D-pad ----
const dpadHeld = { forward: false, back: false, left: false, right: false };
function wireButton(id, action, isHold) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = e => {
    e.preventDefault();
    if (isHold) { dpadHeld[action] = true; handleAction(action); }
    else { handleAction(action); }
    el.classList.add('active');
  };
  const end = e => {
    if (e) e.preventDefault();
    if (isHold) dpadHeld[action] = false;
    el.classList.remove('active');
  };
  el.addEventListener('pointerdown', start);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointerleave', end);
  el.addEventListener('pointercancel', end);
}
wireButton('dpad-up',    'forward', true);
wireButton('dpad-down',  'back',    true);
wireButton('dpad-left',  'left',    false);
wireButton('dpad-right', 'right',   false);
const sprintBtn = document.getElementById('dpad-sprint');
if (sprintBtn) {
  let on = false;
  sprintBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    on = !on;
    sprintBtn.classList.toggle('active', on);
    handleAction(on ? 'sprint_on' : 'sprint_off');
  });
}

// Diagonal tilt buttons — pitch +30° + yaw ±30°. Tap → auto-locks 1.75s; hold → stays tilted while held.
const TILT_PITCH = Math.PI / 6;
const TILT_YAW   = Math.PI / 6;
const TILT_TAP_MS  = 250;
const TILT_HOLD_MS = 1750;
let yawOffsetTarget = 0, yawOffset = 0;
let tiltReleaseTimer = null;
function wireTiltButton(id, sign) {
  const el = document.getElementById(id);
  if (!el) return;
  let downAt = 0;
  const release = () => {
    player.resetPitch();
    yawOffsetTarget = 0;
    el.classList.remove('active');
  };
  const begin = e => {
    e.preventDefault();
    if (tiltReleaseTimer) { clearTimeout(tiltReleaseTimer); tiltReleaseTimer = null; }
    document.querySelectorAll('.look-arrow.active').forEach(b => b.classList.remove('active'));
    downAt = performance.now();
    player.setPitchTarget(TILT_PITCH);
    yawOffsetTarget = sign * TILT_YAW;
    el.classList.add('active');
  };
  const end = e => {
    if (e) e.preventDefault();
    const dt = performance.now() - downAt;
    if (dt < TILT_TAP_MS) {
      if (tiltReleaseTimer) clearTimeout(tiltReleaseTimer);
      tiltReleaseTimer = setTimeout(() => { tiltReleaseTimer = null; release(); }, TILT_HOLD_MS);
    } else {
      release();
    }
  };
  el.addEventListener('pointerdown', begin);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointerleave', end);
  el.addEventListener('pointercancel', end);
}
wireTiltButton('dpad-upleft',  -1);
wireTiltButton('dpad-upright',  1);

// ===========================================================
// LOOP
// ===========================================================
// Vase-hit damage state (wasapok room only)
const damageOverlay = document.getElementById('damage-overlay');
const lifeBar = document.getElementById('life-bar');
const hearts = lifeBar ? Array.from(lifeBar.querySelectorAll('.heart')) : [];
const RED_DURATION = 2.5;
const PLAYER_RADIUS = 0.5;
let hitCount = 0;
let redUntil = 0;

function syncHearts() {
  if (!hearts.length) return;
  const lost = Math.min(hitCount, hearts.length);
  for (let i = 0; i < hearts.length; i++) {
    hearts[i].classList.toggle('lost', i >= hearts.length - lost);
  }
}

function resetToCastleSpawn() {
  try {
    sessionStorage.removeItem('castle:returnStack');
    sessionStorage.removeItem('castle:arrivalOverride');
    sessionStorage.removeItem('castle:loadingMsg');
  } catch {}
  window.location.href = 'index.html';
}

let lastTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const t = now / 1000;
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  tickHold(now);
  player.update(now);
  player.applyToCamera(camera, { bobEnabled: opts.headbob, fovEnabled: opts.sprintFov, baseFov: 72 });
  yawOffset += (yawOffsetTarget - yawOffset) * 0.18;
  if (Math.abs(yawOffset) > 0.0005) camera.rotation.y += yawOffset;
  if (sitting && ZOOM_POSES) {
    const pose = currentZoomPose(t);
    if (pose) {
      camera.position.set(pose.x, pose.y, pose.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(pose.pitch, pose.yaw, 0);
    }
    applyDungeonFade();
  }
  nav.check();

  if (built.playerLight) {
    built.playerLight.position.set(camera.position.x, 1.6, camera.position.z);
  }
  if (built.waterMat) built.waterMat.uniforms.uTime.value = t;
  // Set walls share the ocean shader but with their own uniform; sync until
  // the first button press (dropStep>=1) then freeze at the last value.
  if (built.setWalls && built.setWalls.uniform && dropStep === 0) {
    built.setWalls.uniform.value = t;
  }

  // Dreidel-vases bouncing around the wasapok room
  if (built.dreidelVases && built.dreidelBounds) {
    const b = built.dreidelBounds;
    const VASE_RADIUS = 1.25;
    const HIT_DIST = VASE_RADIUS + PLAYER_RADIUS;
    const HIT_DIST_SQ = HIT_DIST * HIT_DIST;
    const px = camera.position.x, pz = camera.position.z;
    let hitThisFrame = false;
    // Converge faster as fewer vases remain — keeps the long tail snappy.
    const convergeSpeedup = sitting
      ? Math.max(1, Math.min(5, 25 / built.dreidelVases.length))
      : 1;
    for (let i = built.dreidelVases.length - 1; i >= 0; i--) {
      const v = built.dreidelVases[i];
      const ud = v.userData;
      const p = ud.phase;

      if (sitting) {
        // Central vase: float + spin while others are still in flight,
        // then drop to the floor and spin like a dreidel once it's alone.
        if (v === centralVase) {
          v.position.x = CENTER_X;
          v.position.z = CENTER_Z;
          const inSpinMode = ZOOM_POSES && zoomStep === ZOOM_POSES.length - 1 && !zoomAnim;
          if (inSpinMode) {
            if (!ud.spinTookOver) {
              ud.spinTookOver = true;
              vaseAngVel = 14; // carry over the dreidel auto-spin rate
              // Carry over tilt magnitude + direction from dreidel for smooth transition
              vaseTilt = Math.hypot(v.rotation.x, v.rotation.z);
              leanAzimuth = Math.atan2(v.rotation.z, v.rotation.x);
              // Switch to bottom-pivot: shift children up by half-height and
              // root the group at the floor. Rotations now pivot on the tip.
              for (const child of v.children) child.position.y += CENTER_Y_BASE;
              v.position.y = 0;
            }
            v.position.y = 0;
            if (!spinDragging) {
              vaseAngVel *= Math.pow(SPIN_DAMPING, dt * 60);
              if (Math.abs(vaseAngVel) < SPIN_MIN) {
                vaseAngVel = (vaseAngVel >= 0 ? SPIN_MIN : -SPIN_MIN);
              }
            }
            const k = Math.min(1, Math.abs(vaseAngVel) / (SPIN_FULL * 1.2));
            // Snap trigger: aggressive spin from slumped position → punchy upright
            if (!snapping && Math.abs(vaseAngVel) > SNAP_ANGVEL_THRESHOLD && vaseTilt > SNAP_TILT_THRESHOLD) {
              snapping = true;
              snapStartT = t;
              snapFromTilt = vaseTilt;
            }
            // Jack-in-the-box slump at idle, pulled upright by gyroscopic stability
            const targetTilt = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(32, 3, k));
            if (snapping) {
              const e = t - snapStartT;
              if (e >= SNAP_DUR) {
                snapping = false;
                vaseTilt = SNAP_TARGET_TILT;
              } else {
                // easeOutBack — overshoots past upright then settles
                const p = e / SNAP_DUR;
                const c1 = 1.70158, c3 = c1 + 1;
                const eased = 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
                vaseTilt = snapFromTilt + (SNAP_TARGET_TILT - snapFromTilt) * eased;
              }
            } else {
              vaseTilt += (targetTilt - vaseTilt) * Math.min(1, dt * 1.5);
            }
            // Precession: heavy slow drift at idle, stops at full spin
            leanAzimuth += THREE.MathUtils.lerp(0.18, 0.0, k) * dt;
            const wobA = THREE.MathUtils.lerp(0.10, 0.02, k);
            const wobF = THREE.MathUtils.lerp(0.22, 4.0, k);
            vaseWobble += wobF * dt;
            v.rotation.y += vaseAngVel * dt;
            const leanX = vaseTilt * Math.cos(leanAzimuth);
            const leanZ = vaseTilt * Math.sin(leanAzimuth);
            v.rotation.x = leanX + Math.sin(vaseWobble) * wobA;
            v.rotation.z = leanZ + Math.cos(vaseWobble * 0.9) * (wobA * 0.85);
            // Album switch by spin direction
            const newKey = vaseAngVel < 0 ? 'B' : 'A';
            if (newKey !== currentAlbumKey) {
              currentAlbumKey = newKey;
              setAudioForAlbum(newKey);
            }
            // Sustained top-speed → shatter
            if (!shattered) {
              if (Math.abs(vaseAngVel) >= SHATTER_THRESHOLD) {
                topSpeedTimer += dt;
                if (topSpeedTimer >= SHATTER_DURATION) triggerShatter();
              } else {
                topSpeedTimer = 0;
              }
            }
            const ilc = ud.innerLight;
            if (ilc) ilc.intensity = 1.4 + Math.sin(t * 1.0) * 0.4;
            continue;
          }
          if (built.dreidelVases.length === 1) {
            if (!ud.dreidelStartT) {
              ud.dreidelStartT = t;
              ud.dreidelDropFromY = v.position.y;
            }
            const elapsed = t - ud.dreidelStartT;
            const dropPhase = Math.min(1, elapsed / 0.6);
            const eased = 1 - Math.pow(1 - dropPhase, 3);
            v.position.y = ud.dreidelDropFromY * (1 - eased) + CENTER_Y_BASE * eased;
            v.rotation.y = t * 14;
            v.rotation.x = 0.18 * Math.cos(elapsed * 4);
            v.rotation.z = 0.18 * Math.sin(elapsed * 4);
          } else {
            v.position.y = CENTER_Y_BASE + Math.sin(t * 1.2) * 0.18;
            v.rotation.y = t * 2.2;
            v.rotation.x = Math.sin(t * 0.7) * 0.08;
            v.rotation.z = Math.cos(t * 0.7) * 0.08;
          }
          const ilc = ud.innerLight;
          if (ilc) ilc.intensity = 1.4 + Math.sin(t * 1.0) * 0.4;
          continue;
        }

        const tgtX = centralVase ? centralVase.position.x : CENTER_X;
        const tgtY = centralVase ? centralVase.position.y : CENTER_Y_BASE;
        const tgtZ = centralVase ? centralVase.position.z : CENTER_Z;
        const dxT = tgtX - v.position.x;
        const dyT = tgtY - v.position.y;
        const dzT = tgtZ - v.position.z;
        const planarDist = Math.hypot(dxT, dzT);

        // Being absorbed: shrink + drift directly into the central vase, then remove
        if (ud.absorbing) {
          ud.absorbT = (ud.absorbT || 0) + dt * 4.0 * convergeSpeedup;
          const s = Math.max(0, 1 - ud.absorbT);
          v.scale.setScalar(s);
          const k = Math.min(1, 12 * dt * convergeSpeedup);
          v.position.x += dxT * k;
          v.position.y += dyT * k;
          v.position.z += dzT * k;
          v.rotation.y += dt * 18;
          if (ud.absorbT >= 1) {
            if (v.parent) v.parent.remove(v);
            built.dreidelVases.splice(i, 1);
            if (centralVase) spawnPulse(centralVase.position, t);
          }
          continue;
        }

        // Close enough: claim centrality or start absorption
        if (planarDist < ABSORB_DIST) {
          if (!centralVase) {
            centralVase = v;
            v.scale.setScalar(1);
          } else {
            ud.absorbing = true;
            ud.absorbT = 0;
          }
          continue;
        }

        // Steer current velocity toward the target, keep current speed for naturalness
        const speed = Math.max(1.5, Math.hypot(ud.vel.x, ud.vel.z));
        const targetVx = (dxT / planarDist) * speed;
        const targetVz = (dzT / planarDist) * speed;
        const alpha = Math.min(1, HOMING_BLEND * dt * convergeSpeedup);
        ud.vel.x += (targetVx - ud.vel.x) * alpha;
        ud.vel.z += (targetVz - ud.vel.z) * alpha;

        v.position.x += ud.vel.x * dt * convergeSpeedup;
        v.position.z += ud.vel.z * dt * convergeSpeedup;
        v.position.y += (CENTER_Y_BASE - v.position.y) * Math.min(1, 0.8 * dt * convergeSpeedup);

        // Wall containment only (skip furniture box; the seated player is past it)
        if (v.position.x < b.xMin) { v.position.x = b.xMin; ud.vel.x = -ud.vel.x; }
        else if (v.position.x > b.xMax) { v.position.x = b.xMax; ud.vel.x = -ud.vel.x; }
        if (v.position.z < b.zMin) { v.position.z = b.zMin; ud.vel.z = -ud.vel.z; }
        else if (v.position.z > b.zMax) { v.position.z = b.zMax; ud.vel.z = -ud.vel.z; }

        v.rotation.y = t * 8.0 + p;
        v.rotation.x = Math.sin(t * 2.5 + p) * 0.10;
        v.rotation.z = Math.cos(t * 2.5 + p) * 0.10;
        const ilh = ud.innerLight;
        if (ilh) ilh.intensity = 1.0 + Math.sin(t * 1.8 + p) * 0.3;
        continue;
      }

      // ===== Default bouncing behavior =====
      v.position.x += ud.vel.x * dt;
      v.position.z += ud.vel.z * dt;
      if (v.position.x < b.xMin) { v.position.x = b.xMin; ud.vel.x = -ud.vel.x; }
      else if (v.position.x > b.xMax) { v.position.x = b.xMax; ud.vel.x = -ud.vel.x; }
      if (v.position.z < b.zMin) { v.position.z = b.zMin; ud.vel.z = -ud.vel.z; }
      else if (v.position.z > b.zMax) { v.position.z = b.zMax; ud.vel.z = -ud.vel.z; }

      const fb = built.furnitureBounds;
      if (fb) {
        const xLo = fb.xMin - VASE_RADIUS, xHi = fb.xMax + VASE_RADIUS;
        const zLo = fb.zMin - VASE_RADIUS, zHi = fb.zMax + VASE_RADIUS;
        if (v.position.x > xLo && v.position.x < xHi && v.position.z > zLo && v.position.z < zHi) {
          const dxLo = v.position.x - xLo;
          const dxHi = xHi - v.position.x;
          const dzLo = v.position.z - zLo;
          const dzHi = zHi - v.position.z;
          const minX = Math.min(dxLo, dxHi);
          const minZ = Math.min(dzLo, dzHi);
          if (minX < minZ) {
            if (dxLo < dxHi) { v.position.x = xLo; if (ud.vel.x > 0) ud.vel.x = -ud.vel.x; }
            else { v.position.x = xHi; if (ud.vel.x < 0) ud.vel.x = -ud.vel.x; }
          } else {
            if (dzLo < dzHi) { v.position.z = zLo; if (ud.vel.z > 0) ud.vel.z = -ud.vel.z; }
            else { v.position.z = zHi; if (ud.vel.z < 0) ud.vel.z = -ud.vel.z; }
          }
        }
      }
      v.rotation.y = t * 8.0 + p;
      v.rotation.x = Math.sin(t * 2.5 + p) * 0.10;
      v.rotation.z = Math.cos(t * 2.5 + p) * 0.10;
      const il = ud.innerLight;
      if (il) il.intensity = 1.0 + Math.sin(t * 1.8 + p) * 0.3;

      const dx = v.position.x - px;
      const dz = v.position.z - pz;
      const overlapping = (dx * dx + dz * dz) < HIT_DIST_SQ;
      if (overlapping && !ud.touchingPlayer) {
        ud.touchingPlayer = true;
        hitThisFrame = true;
      } else if (!overlapping && ud.touchingPlayer) {
        ud.touchingPlayer = false;
      }
    }
    const nowSec = t;
    if (hitThisFrame) {
      hitCount = (nowSec < redUntil) ? hitCount + 1 : 1;
      redUntil = nowSec + RED_DURATION;
      if (lifeBar) lifeBar.style.opacity = '1';
      syncHearts();
      if (hitCount >= 3) {
        resetToCastleSpawn();
        return;
      }
    }
    if (damageOverlay) {
      const remaining = Math.max(0, redUntil - nowSec) / RED_DURATION;
      const intensityByHits = [0, 0.22, 0.55];
      const base = intensityByHits[Math.min(hitCount, intensityByHits.length - 1)];
      damageOverlay.style.opacity = (remaining * base).toString();
    }
    if (nowSec >= redUntil && hitCount > 0) {
      hitCount = 0;
      syncHearts();
    }
  }

  // Absorption pulses — pixelated star that emanates from the central vase.
  // Phase is quantized to PULSE_STEPS discrete frames so the animation reads
  // as low-fi sprite frames; ease-out scale + slow alpha decay + color shift
  // give it weight and a natural cooling curve.
  const PULSE_STEPS = 8;
  for (let i = pulses.length - 1; i >= 0; i--) {
    const p = pulses[i];
    const age = t - p.born;
    if (age >= p.dur) {
      scene.remove(p.sprite);
      p.sprite.material.dispose();
      pulses.splice(i, 1);
      continue;
    }
    const stepIdx = Math.floor((age / p.dur) * PULSE_STEPS);
    const phaseQ = stepIdx / PULSE_STEPS;
    // Ease-out scale: punchy initial expansion, lingering tail
    const scaleCurve = 1 - Math.pow(1 - phaseQ, 2);
    p.sprite.scale.setScalar(0.4 + scaleCurve * 2.4);
    // Slow alpha decay (power < 1.5 keeps it bright longer, then drops off)
    const alphaCurve = Math.pow(1 - phaseQ, 1.4);
    const pulsey = 0.85 + Math.sin(stepIdx * 1.7) * 0.15;
    p.sprite.material.opacity = alphaCurve * pulsey * 0.5;
    // Hot → cool color shift across the pulse's life
    p.sprite.material.color.copy(PULSE_HOT).lerp(PULSE_COOL, phaseQ);
  }

  if (shards.length) updateShards(dt);

  // Torch / chandelier flicker (matches museum aesthetic)
  for (let i = 0; i < built.torchLights.length; i++) {
    const tl = built.torchLights[i];
    if (tl.kind === 'torch') {
      const f = 0.82 + Math.sin(t * 9 + i * 1.3) * 0.10 + Math.random() * 0.08;
      tl.light.intensity = tl.baseIntensity * f;
      if (tl.orb) tl.orb.material.emissiveIntensity = 1.8 + Math.sin(t * 7 + i * 1.1) * 0.5 + Math.random() * 0.25;
      if (tl.halo) tl.halo.material.opacity = 0.08 + Math.sin(t * 5 + i * 0.9) * 0.05 + Math.random() * 0.04;
    } else {
      const f = 0.96 + Math.sin(t * 1.8 + i * 0.4) * 0.04;
      tl.light.intensity = tl.baseIntensity * f;
    }
  }

  renderer.render(scene, camera);
}

{
  const loadingEl = document.getElementById('loading');
  loadingEl.style.transition = 'opacity 0.4s';
  const dismiss = () => {
    loadingEl.style.opacity = '0';
    setTimeout(() => { loadingEl.style.display = 'none'; }, 500);
  };
  const safety = setTimeout(dismiss, 6000);
  (built.ready || Promise.resolve()).then(() => { clearTimeout(safety); dismiss(); });
}

animate();
window.__hallway2 = { layout, built, player, opts };
