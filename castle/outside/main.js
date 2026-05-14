// Wasapok Castle — OUTSIDE entry. Mirrors museum/main.js movement + input
// exactly so the feel is identical between the two scenes. When the player
// steps onto any of the trigger tiles (in front of Building 1), the scene
// fades and navigates to main-hall.html.
import * as THREE from 'three';
import { createPlayer } from '../museum/player.js?v=10';
import { buildScene } from './scene.js?v=24';

const opts = {
  pixelation: 3,
  headbob: true,
  sprintFov: true,
};

// ---- Renderer ----
const gameEl = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85; // brighter for daylight, still cinematic
renderer.setPixelRatio(1);
gameEl.appendChild(renderer.domElement);

// State (assigned after async scene build)
let scene = null;
let CELL = 2;
let player = null;
let camera = null;
let triggerTiles = [];
let booted = false;
let vaseGroup = null;
let vaseBaseY = 1.8;

const camPreview = new THREE.PerspectiveCamera(72, 1, 0.05, 500);

function resize() {
  const cam = camera || camPreview;
  const w = window.innerWidth, h = window.innerHeight;
  const px = Math.max(1, opts.pixelation | 0);
  const rw = Math.max(160, Math.floor(w / px));
  const rh = Math.max(120, Math.floor(h / px));
  renderer.setSize(rw, rh, false);
  renderer.domElement.style.width = w + 'px';
  renderer.domElement.style.height = h + 'px';
  renderer.domElement.style.imageRendering = 'pixelated';
  cam.aspect = rw / rh;
  cam.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// ===========================================================
// INPUT — keyboard + on-screen D-pad (mirrors museum/main.js)
// ===========================================================
const keyDown = {};
let transitioning = false;
function handleAction(act) {
  if (transitioning || !player) return;
  switch (act) {
    case 'forward': player.tryMove(0); break;
    case 'back':    player.tryMove(2); break;
    case 'left':    player.tryTurn(-1); break;
    case 'right':   player.tryTurn(1); break;
    case 'strafeL': player.tryMove(3); break;
    case 'strafeR': player.tryMove(1); break;
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
function clearHeldKeys() {
  for (const k in keyDown) keyDown[k] = false;
  if (player) player.setSprint(false);
}
window.addEventListener('blur', clearHeldKeys);
window.addEventListener('focus', clearHeldKeys);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearHeldKeys(); });

// Hold-to-walk
let lastMoveAttempt = 0;
function tickHold(now) {
  if (transitioning || !player || player.state.anim) return;
  if (now - lastMoveAttempt < 140) return;
  if (keyDown['w'] || keyDown['arrowup'] || dpadHeld.forward)     { handleAction('forward'); lastMoveAttempt = now; }
  else if (keyDown['s'] || keyDown['arrowdown'] || dpadHeld.back) { handleAction('back'); lastMoveAttempt = now; }
}

// ---- On-screen 4-arrow nav cross ----
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
// TRIGGER → main hall
// The red pad on the walkable plane is the trigger. Stepping onto its tile
// navigates immediately to main-hall.html.
// ===========================================================
function triggerMainHallTransition() {
  if (transitioning) return;
  transitioning = true;
  window.location.href = 'main-hall.html';
}

function checkTrigger() {
  if (!player || transitioning || triggerTiles.length === 0) return;
  const tx = player.state.tx, ty = player.state.ty;
  for (let i = 0; i < triggerTiles.length; i++) {
    const t = triggerTiles[i];
    if (t.x === tx && t.y === ty) {
      triggerMainHallTransition();
      return;
    }
  }
}

// ===========================================================
// BOOT
// ===========================================================
(async () => {
  try {
    const built = await buildScene();
    scene        = built.scene;
    CELL         = built.CELL;
    triggerTiles = built.triggerTiles || [];
    vaseGroup    = built.vaseGroup || null;
    vaseBaseY    = built.vaseBaseY ?? 1.8;

    camera = new THREE.PerspectiveCamera(72, 1, 0.05, 500);
    player = createPlayer(built.layout, CELL);
    player.applyToCamera(camera);
    resize();

    // Hide loading screen
    const loading = document.getElementById('loading');
    if (loading) {
      loading.style.transition = 'opacity 0.5s';
      loading.style.opacity = '0';
      setTimeout(() => { loading.style.display = 'none'; }, 600);
    }

    booted = true;
    console.log('[outside] booted. spawn=', built.layout.spawn, 'triggerTiles=', triggerTiles.length);
    window.__castleOutside = {
      scene, layout: built.layout,
      triggerTiles,
      triggerMarkerGroup: built.triggerMarkerGroup,
      walkableBox: built.walkableBox,
      boundaryBoxes: built.boundaryBoxes,
      building1Box: built.building1Box,
    };
  } catch (err) {
    console.error('Outside scene failed to load:', err);
    const label = document.querySelector('#loading .label');
    if (label) label.textContent = 'Failed to load castle: ' + (err.message || err);
  }
})();

// ===========================================================
// LOOP
// ===========================================================
let lastTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  if (!booted) { renderer.render(new THREE.Scene(), camPreview); return; }
  const now = performance.now();
  lastTime = now;

  tickHold(now);
  player.update(now);
  player.applyToCamera(camera, { bobEnabled: opts.headbob, fovEnabled: opts.sprintFov, baseFov: 72 });
  checkTrigger();

  if (vaseGroup) {
    const t = now * 0.001;
    vaseGroup.rotation.y = t * 0.32;
    vaseGroup.rotation.x = Math.sin(t * 0.6) * 0.08;
    vaseGroup.position.y = vaseBaseY + Math.sin(t * 1.1) * 0.14;
    const il = vaseGroup.userData.innerLight;
    if (il) il.intensity = 2.0 + Math.sin(t * 1.8) * 0.6 + Math.sin(t * 4.7) * 0.15;
  }

  renderer.render(scene, camera);
}
animate();
