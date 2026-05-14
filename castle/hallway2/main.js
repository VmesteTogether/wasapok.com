// Wasapok Castle — HALLWAY 2 ROOM entry.
// Standalone scene reached by stepping on the red trigger pad at the east
// end of the main hall library. Player spawns at the west end of a 2-tile
// hallway, facing east; walking forward opens into a single 9x9 room with
// no other exits.
import * as THREE from 'three';
import { createPlayer } from '../museum/player.js?v=10';
import { buildScene } from './scene.js?v=3';

const opts = {
  pixelation: 3,
  fogDistance: 20,
  headbob: true,
  sprintFov: true,
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

// ===========================================================
// LOOP
// ===========================================================
let lastTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const t = now / 1000;
  lastTime = now;

  tickHold(now);
  player.update(now);
  player.applyToCamera(camera, { bobEnabled: opts.headbob, fovEnabled: opts.sprintFov, baseFov: 72 });

  if (built.playerLight) {
    built.playerLight.position.set(camera.position.x, 1.6, camera.position.z);
  }
  if (built.waterMat) built.waterMat.uniforms.uTime.value = t;

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

document.getElementById('loading').style.transition = 'opacity 0.4s';
document.getElementById('loading').style.opacity = '0';
setTimeout(() => { document.getElementById('loading').style.display = 'none'; }, 500);

animate();
window.__hallway2 = { layout, built, player, opts };
