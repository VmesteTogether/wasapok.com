// Wasapok Castle — HALLWAY 4 ROOM entry.
// Reuses hallway2's scene.js so the room is visually identical. Reached by
// standing on the last tile of hallway 4 (the west corridor) in main hall
// for several seconds.
import * as THREE from 'three';
import { createPlayer } from '../museum/player.js?v=10';
import { buildScene } from '../hallway2/scene.js?v=30';
import { setupSceneNav } from '../nav.js?v=5';

const opts = {
  pixelation: 3,
  fogDistance: 20,
  headbob: true,
  sprintFov: true,
  chamber: false, // hallway 4 has no central object
  floor: 'grass',  // rolling grassy knoll instead of glass-over-water
  daylight: true,  // warm radial daylight at room center, dim corners
  chandelier: 'eskleohell', // swap the procedural ring-of-orbs for eskleohell-01.glb
  spikyMountains: true, // Adventure-Time style mountains hugging the interior perimeter
  sandDunes: true, // low sand mounds scattered across the rolling grass
  roomShape: 'circle', // carve a circular floor plan instead of the default square
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
  sceneUrl: 'hallway-4-room.html',
  player, camera,
  spawnTile: layout.spawn,
  forwardTriggers: [],
  defaultReturnScene: 'main-hall.html',
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
// INPUT — keyboard + on-screen D-pad
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
  void chamberMsgEl.offsetWidth;
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

function handleAction(act) {
  switch (act) {
    case 'forward': if (bumpsChamber(0)) showChamberMsg(); player.tryMove(0); break;
    case 'back':    if (bumpsChamber(2)) showChamberMsg(); player.tryMove(2); break;
    case 'left':    player.tryTurn(-1); break;
    case 'right':   player.tryTurn(1); break;
    case 'strafeL': if (bumpsChamber(3)) showChamberMsg(); player.tryMove(3); break;
    case 'strafeR': if (bumpsChamber(1)) showChamberMsg(); player.tryMove(1); break;
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

let lastMoveAttempt = 0;
function tickHold(now) {
  if (player.state.anim) return;
  if (now - lastMoveAttempt < 140) return;
  if (keyDown['w'] || keyDown['arrowup'] || dpadHeld.forward)     { handleAction('forward'); lastMoveAttempt = now; }
  else if (keyDown['s'] || keyDown['arrowdown'] || dpadHeld.back) { handleAction('back'); lastMoveAttempt = now; }
}

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

// ===========================================================
// LOOP
// ===========================================================
// Chandelier rotation cycle: wait 15s (timer begins the moment the user spawns),
// then perform one full revolution at the existing 0.18 rad/s speed (~35s), repeat.
const CHAND_SPEED = 0.18;
const CHAND_WAIT  = 15;
const CHAND_FULL  = Math.PI * 2;
const CHAND_DUR   = CHAND_FULL / CHAND_SPEED;
const chandT0     = performance.now() / 1000;
let chandPhase    = 'wait';
let chandPhaseT0  = chandT0;

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const t = now / 1000;

  tickHold(now);
  player.update(now);
  player.applyToCamera(camera, { bobEnabled: opts.headbob, fovEnabled: opts.sprintFov, baseFov: 72 });
  nav.check();

  if (built.playerLight) {
    built.playerLight.position.set(camera.position.x, 1.6, camera.position.z);
  }
  if (built.waterMat) built.waterMat.uniforms.uTime.value = t;
  if (built.chandelier && built.chandelier.obj) {
    const e = t - chandPhaseT0;
    if (chandPhase === 'wait') {
      if (e >= CHAND_WAIT) { chandPhase = 'spin'; chandPhaseT0 = t; }
    } else {
      if (e >= CHAND_DUR) {
        built.chandelier.obj.rotation.y = 0;
        chandPhase = 'wait'; chandPhaseT0 = t;
      } else {
        built.chandelier.obj.rotation.y = e * CHAND_SPEED;
      }
    }
  }

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
  const safety = setTimeout(dismiss, 10000);
  (built.ready || Promise.resolve()).then(() => { clearTimeout(safety); dismiss(); });
}

animate();
window.__hallway4 = { layout, built, player, opts };
