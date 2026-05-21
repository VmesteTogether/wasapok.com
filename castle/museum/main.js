// Wasapok Castle — main entry. Mobile-first D-pad controls, room discovery,
// and seamless wasapok.com iframe transition at the portal room.
import * as THREE from 'three';
import { buildLayout } from './layout.js?v=14';
import { buildScene } from './scene.js?v=131';
import { createPlayer } from './player.js?v=10';
import { createMinimap } from './minimap.js?v=10';
import { setupSceneNav, consumeLoadingMsg } from '../nav.js?v=6';

// Override the loading label if the previous scene set a custom message (e.g. return from a sub-room).
{
  const msg = consumeLoadingMsg();
  if (msg) {
    const el = document.querySelector('#loading .label');
    if (el) el.textContent = msg;
  }
}

const layout = buildLayout();

const opts = {
  pixelation: 3,
  fogDistance: 14,
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

const built = buildScene(layout, opts);
const scene = built.scene;

// ---- Camera ----
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 200);
const player = createPlayer(layout, built.CELL);
player.applyToCamera(camera);

// Hallway 4 hold trigger: stand on the last west-corridor tile for 4s to
// transport to hallway 4 room. Return arrival lands one tile east of it
// (one tile closer to the hub / hallway 2).
const _hubR = layout.rooms.find(r => r.id === 'hub');
const _CORR_LEN = 2;
const hallway4TriggerTile = _hubR
  ? { x: _hubR.x0 - _CORR_LEN, y: _hubR.cy }
  : null;

// Vein overlay control — fades in and re-runs the path-draw animation each
// time the player steps onto the hold tile; aborts on early exit.
const _veinEl = document.getElementById('vein-overlay');
function showVeins() {
  if (!_veinEl) return;
  _veinEl.classList.remove('active');
  void _veinEl.offsetWidth; // restart animation
  _veinEl.classList.add('active');
  document.body.classList.add('shake');
}
function hideVeins() {
  if (_veinEl) _veinEl.classList.remove('active');
  document.body.classList.remove('shake');
}

const nav = setupSceneNav({
  sceneUrl: 'main-hall.html',
  player, camera,
  spawnTile: layout.spawn,
  forwardTriggers: built.triggerTiles || [],
  holdTriggers: hallway4TriggerTile ? [{
    x: hallway4TriggerTile.x,
    y: hallway4TriggerTile.y,
    target: 'hallway-4-room.html',
    holdMs: 4000,
    returnTile: { x: hallway4TriggerTile.x + 1, y: hallway4TriggerTile.y },
    onEnter: showVeins,
    onLeave: hideVeins,
  }] : [],
  defaultReturnScene: 'index.html',
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

// ---- Minimap ----
const minimap = createMinimap(document.getElementById('minimap'), layout);

// ===========================================================
// INPUT — keyboard + on-screen D-pad (touch / click)
// ===========================================================
const keyDown = {};
function handleAction(act) {
  if (portalFullscreen) return; // wasapok takes over
  if (nav.isTransitioning()) return;
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
  else if (k === 'escape')                  { if (portalFullscreen) closePortal(); }
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

// Hold-to-walk: forward / back keys auto-repeat
let lastMoveAttempt = 0;
function tickHold(now) {
  if (portalFullscreen) return;
  if (player.state.anim) return;
  if (now - lastMoveAttempt < 140) return;
  if (keyDown['w'] || keyDown['arrowup'] || dpadHeld.forward)     { handleAction('forward'); lastMoveAttempt = now; }
  else if (keyDown['s'] || keyDown['arrowdown'] || dpadHeld.back) { handleAction('back'); lastMoveAttempt = now; }
}

// ---- On-screen D-pad ----
const dpadHeld = { forward: false, back: false, left: false, right: false };
function wireButton(id, action, isHold) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = (e) => {
    e.preventDefault();
    if (isHold) {
      dpadHeld[action] = true;
      handleAction(action);   // immediate first tick
    } else {
      handleAction(action);
    }
    el.classList.add('active');
  };
  const end = (e) => {
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
// sprint button toggle
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
// ROOM DISCOVERY OVERLAY
// ===========================================================
const ROOM_INFO = {
  hub:     { name: 'GREAT HALL',    sub: 'Heart of the Castle' },
  throne:  { name: 'THRONE ROOM',   sub: 'Seat of the Sovereign' },
  library: { name: 'LIBRARY',       sub: 'Tomes of the Realm' },
  armory:  { name: 'ARMORY',        sub: 'Steel and Crimson' },
  portal:  { name: 'PORTAL CHAMBER',sub: 'Step Through to Wasapok' },
};
let currentRoomId = null;
const visited = new Set();
const discoverEl = document.getElementById('discover');
const discoverName = document.getElementById('discover-name');
const discoverSub = document.getElementById('discover-sub');
function onEnterRoom(rid) {
  currentRoomId = rid;
  if (!visited.has(rid) && ROOM_INFO[rid]) {
    visited.add(rid);
    showDiscovery(ROOM_INFO[rid]);
  }
}
let discoverTimer = null;
function showDiscovery(info) {
  discoverName.textContent = info.name;
  discoverSub.textContent = info.sub;
  discoverEl.classList.remove('show');
  void discoverEl.offsetWidth;
  discoverEl.classList.add('show');
  if (discoverTimer) clearTimeout(discoverTimer);
  discoverTimer = setTimeout(() => discoverEl.classList.remove('show'), 3600);
}

// ===========================================================
// WASAPOK PORTAL — iframe transition
// ===========================================================
const WASAPOK_URL = 'https://wasapok.com/';
const portalIframe = document.getElementById('wasapok-frame');
const portalLayer  = document.getElementById('portal-layer');
const portalExit   = document.getElementById('portal-exit');

let iframeReady = false;
let iframePreloaded = false;
let portalFullscreen = false;

function preloadWasapok() {
  if (iframePreloaded) return;
  iframePreloaded = true;
  portalIframe.src = WASAPOK_URL;
  portalIframe.addEventListener('load', () => { iframeReady = true; }, { once: true });
  // Safety fallback if `load` never fires
  setTimeout(() => { iframeReady = true; }, 6000);
}

function closePortal() {
  portalLayer.classList.remove('fullscreen');
  portalLayer.style.opacity = '0';
  portalLayer.style.pointerEvents = 'none';
  portalFullscreen = false;
}
if (portalExit) {
  portalExit.addEventListener('click', closePortal);
}

// Compute distance from player to portal tile (in tile units, Manhattan-ish)
function portalDistance() {
  const p = built.portal;
  if (!p || !p.tile) return Infinity;
  const dx = Math.abs(player.state.tx - p.tile.x);
  const dy = Math.abs(player.state.ty - p.tile.y);
  // Effective distance: weighted Chebyshev (so the corridor approach reads as a smooth curve)
  return Math.max(dx, dy);
}

function updatePortalTransition() {
  const p = built.portal;
  if (!p || !p.tile) return;
  const d = portalDistance();

  // Begin pre-loading the iframe when player enters the portal room (within 4 tiles).
  if (d <= 4) preloadWasapok();

  // Visual fade: portal mesh glows brighter the closer you get.
  if (p.mesh && p.mesh.material) {
    const glow = Math.max(0, 1 - d / 4);
    p.mesh.material.opacity = 0.4 + 0.6 * glow;
  }
  if (p.light) {
    p.light.intensity = 1.0 + 1.6 * Math.max(0, 1 - d / 5);
  }

  // Iframe fade phases:
  //   d>=2 → invisible
  //   d=1  → fade in 25%
  //   d=0  & facing south → fullscreen
  let alpha = 0;
  if (d <= 1.5) alpha = Math.max(0, (1.5 - d) / 1.5) * 0.85; // up to 85% when on the tile but not facing
  // If standing on the portal tile AND facing south (toward the portal), go fullscreen.
  const facingPortal = (player.state.tx === p.tile.x &&
                        player.state.ty === p.tile.y - 1 &&
                        player.state.dir === 2)            // standing one tile north, facing south into portal
                     || (player.state.tx === p.tile.x &&
                         player.state.ty === p.tile.y &&
                         player.state.dir === 2);
  if (facingPortal && iframePreloaded) {
    portalLayer.classList.add('fullscreen');
    portalLayer.style.opacity = '1';
    portalLayer.style.pointerEvents = 'auto';
    portalFullscreen = true;
  } else if (!portalFullscreen) {
    portalLayer.style.opacity = alpha.toFixed(3);
    portalLayer.style.pointerEvents = 'none';
    portalLayer.classList.remove('fullscreen');
  }
}

// ===========================================================
// LOOP
// ===========================================================
const vignetteEl = document.getElementById('vignette');
const _vignVec = new THREE.Vector3();
const _camFwd = new THREE.Vector3();
let vignetteX = 50, vignetteY = 50, lastVX = -1, lastVY = -1;
let lastTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000); lastTime = now;
  const t = now / 1000;

  tickHold(now);
  const rid = layout.roomId && layout.roomId[player.state.ty] && layout.roomId[player.state.ty][player.state.tx];
  if (rid && rid !== currentRoomId) onEnterRoom(rid);

  player.update(now);
  player.applyToCamera(camera, { bobEnabled: opts.headbob, fovEnabled: opts.sprintFov, baseFov: 72 });
  yawOffset += (yawOffsetTarget - yawOffset) * 0.18;
  if (Math.abs(yawOffset) > 0.0005) camera.rotation.y += yawOffset;
  if (built.playerLight) {
    built.playerLight.position.set(camera.position.x, 1.6, camera.position.z);
  }
  if (built.waterMat) built.waterMat.uniforms.uTime.value = t;

  // Torch flicker (real flame-y)
  for (let i = 0; i < built.torchLights.length; i++) {
    const tl = built.torchLights[i];
    if (tl.kind === 'torch') {
      const f = 0.82 + Math.sin(t * 9 + i * 1.3) * 0.10 + Math.random() * 0.08;
      tl.light.intensity = tl.baseIntensity * f;
      if (tl.orb) tl.orb.material.emissiveIntensity = 1.8 + Math.sin(t * 7 + i * 1.1) * 0.5 + Math.random() * 0.25;
      if (tl.halo) tl.halo.material.opacity = 0.08 + Math.sin(t * 5 + i * 0.9) * 0.05 + Math.random() * 0.04;
    } else if (tl.kind === 'umbrella') {
      // Very gentle warm breathe — stable main light, barely moves
      const f = 0.93 + Math.sin(t * 0.9 + i * 0.6) * 0.07;
      tl.light.intensity = tl.baseIntensity * f;
    } else if (tl.kind === 'portalBeacon') {
      // Slow magical pulse
      const f = 0.7 + Math.sin(t * 2.1) * 0.25 + Math.sin(t * 5.3) * 0.05;
      tl.light.intensity = tl.baseIntensity * f;
    } else if (tl.kind === 'gnomGateOrb') {
      // Orange orb floats up/down and pulses; green eye breathes
      const bob = Math.sin(t * 1.3) * 0.06 + Math.sin(t * 0.45) * 0.025;
      if (tl.orbGroup) tl.orbGroup.position.y = tl.orbBaseY + bob;
      const f = 0.78 + Math.sin(t * 1.5) * 0.18 + Math.sin(t * 4.3) * 0.06;
      tl.light.intensity = tl.baseIntensity * f;
      if (tl.orbMat) tl.orbMat.emissiveIntensity = 1.9 + Math.sin(t * 1.5) * 0.55 + Math.random() * 0.10;
      if (tl.eyeMat) tl.eyeMat.emissiveIntensity = 7.5 + Math.sin(t * 2.7) * 2.5;
    } else if (tl.kind === 'gnomGateFlash') {
      // Discrete blinking — each light has its own frequency + phase
      const phase = Math.sin(t * tl.freq + tl.phase);
      const on = phase > 0.2 ? 1.0 : 0.15;
      tl.mat.emissiveIntensity = tl.base * (on * 0.85 + 0.15 + Math.random() * 0.08);
    } else {
      const f = 0.96 + Math.sin(t * 1.8 + i * 0.4) * 0.04;
      tl.light.intensity = tl.baseIntensity * f;
    }
  }

  // Saloon doors — swing open when player approaches, close after they pass
  const DOOR_OPEN_DIST = built.CELL * 2.0;
  const DOOR_MAX_ANGLE = Math.PI * 0.47;
  for (const sd of built.saloonDoors || []) {
    const dx = camera.position.x - sd.doorCX;
    const dz = camera.position.z - sd.doorCZ;
    const open = (dx * dx + dz * dz) < DOOR_OPEN_DIST * DOOR_OPEN_DIST;
    if (open) {
      const side = Math.sin(sd.doorYaw) * dx + Math.cos(sd.doorYaw) * dz;
      if (Math.abs(side) > 0.15) sd.swingDir = side > 0 ? 1 : -1;
      sd.leftAngle  = THREE.MathUtils.lerp(sd.leftAngle,  sd.swingDir * DOOR_MAX_ANGLE,  0.10);
      sd.rightAngle = THREE.MathUtils.lerp(sd.rightAngle, -sd.swingDir * DOOR_MAX_ANGLE, 0.10);
    } else {
      sd.leftAngle  = THREE.MathUtils.lerp(sd.leftAngle,  0, 0.07);
      sd.rightAngle = THREE.MathUtils.lerp(sd.rightAngle, 0, 0.07);
    }
    sd.leftLeaf.rotation.y  = sd.leftAngle;
    sd.rightLeaf.rotation.y = sd.rightAngle;
  }

  // Portal fade logic
  updatePortalTransition();

  // Hallway 2 room trigger
  nav.check();

  // Pulse the red trigger pads
  if (built.triggerPadGroup) {
    const pulse = 2.0 + Math.sin(t * 2.4) * 0.7;
    built.triggerPadGroup.traverse(o => {
      if (o.isMesh && o.material && 'emissiveIntensity' in o.material) {
        o.material.emissiveIntensity = pulse;
      }
    });
  }

  // Diamond sculpture animation
  if (built.diamondGroup) {
    const t = now * 0.001;
    built.diamondGroup.rotation.y = t * 0.32;
    built.diamondGroup.rotation.x = Math.sin(t * 0.6) * 0.08;
    built.diamondGroup.position.y = built.diamondBaseY + Math.sin(t * 1.1) * 0.14;
    const il = built.diamondGroup.userData.innerLight;
    if (il) il.intensity = 4.0 + Math.sin(t * 1.8) * 0.9 + Math.sin(t * 4.7) * 0.25;
  }

  // Vignette follows the floating diamonds (radial center tracks their screen position).
  // The target position is lerped smoothly to dampen any swing during turn animations,
  // and only pushed to the DOM when the rounded value actually changes, to avoid
  // flutter from rapid CSS gradient re-evaluations.
  if (vignetteEl && built.diamondGroup) {
    let targetX = 50, targetY = 50;
    built.diamondGroup.getWorldPosition(_vignVec);
    const dx = _vignVec.x - camera.position.x;
    const dy = _vignVec.y - camera.position.y;
    const dz = _vignVec.z - camera.position.z;
    const distSq = dx * dx + dz * dz;
    const INSIDE_R = 2.2;
    if (distSq >= INSIDE_R * INSIDE_R) {
      // Only project if the diamond is in front of the camera; otherwise
      // project() returns wildly off-screen NDC that flips the CSS radial
      // gradient and reads as broken lighting.
      _camFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
      const facing = dx * _camFwd.x + dy * _camFwd.y + dz * _camFwd.z;
      if (facing > 0.1) {
        _vignVec.project(camera);
        if (_vignVec.z > -1 && _vignVec.z < 1) {
          targetX = Math.max(-50, Math.min(150, (_vignVec.x + 1) * 50));
          targetY = Math.max(-50, Math.min(150, (1 - _vignVec.y) * 50));
        }
      }
    }
    // While turning, hold the vignette at its current position so it doesn't sweep.
    const turning = player.state.anim && player.state.anim.type === 'turn';
    if (!turning) {
      const k = 0.06;
      vignetteX += (targetX - vignetteX) * k;
      vignetteY += (targetY - vignetteY) * k;
    }
    const rx = Math.round(vignetteX);
    const ry = Math.round(vignetteY);
    if (rx !== lastVX || ry !== lastVY) {
      vignetteEl.style.setProperty('--vx', rx + '%');
      vignetteEl.style.setProperty('--vy', ry + '%');
      lastVX = rx; lastVY = ry;
    }
  }

  // Minimap
  minimap.draw(player, []);

  renderer.render(scene, camera);
}

{
  const loadingEl = document.getElementById('loading');
  loadingEl.style.transition = 'opacity 0.4s';
  const dismiss = () => {
    loadingEl.style.opacity = '0';
    setTimeout(() => { loadingEl.style.display = 'none'; }, 500);
  };
  // Wait for async sculpture loads to complete; safety fallback after 8s.
  const safety = setTimeout(dismiss, 8000);
  (built.ready || Promise.resolve()).then(() => { clearTimeout(safety); dismiss(); });
}

animate();
window.__museum = { layout, built, player, opts };
