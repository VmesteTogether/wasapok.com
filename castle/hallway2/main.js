// Wasapok Castle — HALLWAY 2 ROOM entry.
// Standalone scene reached by stepping on the red trigger pad at the east
// end of the main hall library. Player spawns at the west end of a 2-tile
// hallway, facing east; walking forward opens into a single 9x9 room with
// no other exits.
import * as THREE from 'three';
import { createPlayer } from '../museum/player.js?v=10';
import { buildScene } from './scene.js?v=83';
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
    return;
  }
  confirmShownAt = now;
  showConfirmMsg();
}

function handleAction(act) {
  if (sitting) {
    if (act === 'sprint_on') player.setSprint(true);
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
  if (sitting && SITTING_POSE) {
    camera.position.set(SITTING_POSE.x, SITTING_POSE.y, SITTING_POSE.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(SITTING_POSE.pitch, SITTING_POSE.yaw, 0);
  }
  nav.check();

  if (built.playerLight) {
    built.playerLight.position.set(camera.position.x, 1.6, camera.position.z);
  }
  if (built.waterMat) built.waterMat.uniforms.uTime.value = t;

  // Dreidel-vases bouncing around the wasapok room
  if (built.dreidelVases && built.dreidelBounds) {
    const b = built.dreidelBounds;
    const VASE_RADIUS = 1.25;
    const HIT_DIST = VASE_RADIUS + PLAYER_RADIUS;
    const HIT_DIST_SQ = HIT_DIST * HIT_DIST;
    const px = camera.position.x, pz = camera.position.z;
    let hitThisFrame = false;
    for (let i = 0; i < built.dreidelVases.length; i++) {
      const v = built.dreidelVases[i];
      v.position.x += v.userData.vel.x * dt;
      v.position.z += v.userData.vel.z * dt;
      if (v.position.x < b.xMin) { v.position.x = b.xMin; v.userData.vel.x = -v.userData.vel.x; }
      else if (v.position.x > b.xMax) { v.position.x = b.xMax; v.userData.vel.x = -v.userData.vel.x; }
      if (v.position.z < b.zMin) { v.position.z = b.zMin; v.userData.vel.z = -v.userData.vel.z; }
      else if (v.position.z > b.zMax) { v.position.z = b.zMax; v.userData.vel.z = -v.userData.vel.z; }

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
            if (dxLo < dxHi) { v.position.x = xLo; if (v.userData.vel.x > 0) v.userData.vel.x = -v.userData.vel.x; }
            else { v.position.x = xHi; if (v.userData.vel.x < 0) v.userData.vel.x = -v.userData.vel.x; }
          } else {
            if (dzLo < dzHi) { v.position.z = zLo; if (v.userData.vel.z > 0) v.userData.vel.z = -v.userData.vel.z; }
            else { v.position.z = zHi; if (v.userData.vel.z < 0) v.userData.vel.z = -v.userData.vel.z; }
          }
        }
      }
      const p = v.userData.phase;
      v.rotation.y = t * 8.0 + p;
      v.rotation.x = Math.sin(t * 2.5 + p) * 0.10;
      v.rotation.z = Math.cos(t * 2.5 + p) * 0.10;
      const il = v.userData.innerLight;
      if (il) il.intensity = 1.0 + Math.sin(t * 1.8 + p) * 0.3;

      const dx = v.position.x - px;
      const dz = v.position.z - pz;
      const overlapping = (dx * dx + dz * dz) < HIT_DIST_SQ;
      if (overlapping && !v.userData.touchingPlayer && !sitting) {
        v.userData.touchingPlayer = true;
        hitThisFrame = true;
      } else if (!overlapping && v.userData.touchingPlayer) {
        v.userData.touchingPlayer = false;
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
