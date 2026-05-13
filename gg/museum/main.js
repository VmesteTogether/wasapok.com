// Garden Grove Virtual Museum — main entry.
import * as THREE from 'three';
import { buildLayout } from './layout.js?v=6';
import { buildScene } from './scene.js?v=7';
import { createPlayer } from './player.js?v=6';
import { createMinimap } from './minimap.js?v=5';

// ---- Read manifests ----
function readJson(id) {
  const el = document.getElementById(id);
  try { return JSON.parse(el.textContent); } catch { return null; }
}
const mayors = readJson('mayors-manifest') || [];
const mapWall = readJson('map-manifest') || null;

const layout = buildLayout(mayors, mapWall);

const opts = /*EDITMODE-BEGIN*/{
  "pixelation": 3,
  "fogDistance": 32,
  "headbob": true,
  "sprintFov": true,
  "aesthetic": "civic",
  "floor": "marble"
}/*EDITMODE-END*/;

// ---- Renderer ----
const gameEl = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setPixelRatio(1);
gameEl.appendChild(renderer.domElement);

const built = buildScene(layout, opts);
const scene = built.scene;

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
resize();

// ---- Minimap ----
const minimap = createMinimap(document.getElementById('minimap'), layout);

// ---- Input ----
const keyDown = {};
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  if (plaqueOpen) {
    if (e.key === 'Escape' || e.key === ' ') { closePlaque(); e.preventDefault(); }
    return;
  }
  const k = e.key.toLowerCase();
  keyDown[k] = true;
  if (k === 'w' || k === 'arrowup')        { player.tryMove(0); e.preventDefault(); }
  else if (k === 's' || k === 'arrowdown') { player.tryMove(2); e.preventDefault(); }
  else if (k === 'a' || k === 'arrowleft') { player.tryTurn(-1); e.preventDefault(); }
  else if (k === 'd' || k === 'arrowright'){ player.tryTurn(1);  e.preventDefault(); }
  else if (k === 'q')                      { player.tryMove(3); e.preventDefault(); }
  else if (k === 'e')                      { player.tryMove(1); e.preventDefault(); }
  else if (k === 'shift')                  { player.setSprint(true); e.preventDefault(); }
  else if (k === 'r')                      { if (currentRoomId === 'map') { player.nudgePitch(0.12); } e.preventDefault(); }
  else if (k === 'f')                      { if (currentRoomId === 'map') { player.nudgePitch(-0.12); } e.preventDefault(); }
  else if (k === ' ')                      { inspectFront(); e.preventDefault(); }
});
window.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  keyDown[k] = false;
  if (k === 'shift') player.setSprint(false); });

function clearHeldKeys() { for (const k in keyDown) keyDown[k] = false; }
window.addEventListener('blur', clearHeldKeys);
window.addEventListener('focus', clearHeldKeys);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearHeldKeys(); });
window.addEventListener('mousedown', clearHeldKeys);

// Hold-to-walk for forward/back
let lastMoveAttempt = 0;
function tickHold(now) {
  if (plaqueOpen) return;
  if (player.state.anim) return;
  if (now - lastMoveAttempt < 140) return;
  if (keyDown['w'] || keyDown['arrowup'])        { player.tryMove(0); lastMoveAttempt = now; }
  else if (keyDown['s'] || keyDown['arrowdown']) { player.tryMove(2); lastMoveAttempt = now; }
}

// ---- Plaque inspector ----
const plaqueView = document.getElementById('plaque-view');
const plaqueImg = document.getElementById('plaque-img');
const plaqueTitle = document.getElementById('plaque-title');
const plaqueSubtitle = document.getElementById('plaque-subtitle');
const plaqueBio = document.getElementById('plaque-bio');
let plaqueOpen = false;

function inspectFront() {
  const tile = { x: player.state.tx, y: player.state.ty };
  const wd = player.state.dir;
  const match = built.artObjects.find(a => a.tile.x === tile.x && a.tile.y === tile.y && a.wall === wd);
  if (match) {
    plaqueImg.src = match.src || '';
    plaqueImg.style.display = match.src ? 'block' : 'none';
    plaqueTitle.textContent = match.title || '—';
    plaqueSubtitle.textContent = match.subtitle || '';
    plaqueBio.textContent = match.bio || '';
    plaqueView.classList.add('open');
    plaqueOpen = true;
  }
}
function closePlaque() {
  plaqueView.classList.remove('open');
  plaqueOpen = false;
}
plaqueView.addEventListener('click', closePlaque);

// ---- Room discovery overlay (Souls-style) + room tracking ----
const ROOM_INFO = {
  hub:    { name: 'CIVIC ROTUNDA',    sub: 'Garden Grove Memorial Hall' },
  map:    { name: 'CARTOGRAPHY HALL', sub: 'A Map of the Civic Boundaries' },
  mayors: { name: 'MAYORS\u2019 GALLERY', sub: 'Every Mayor since Incorporation, 1956' },
};
let currentRoomId = null;
const visited = new Set();
const discoverEl = document.getElementById('discover');
const discoverName = document.getElementById('discover-name');
const discoverSub = document.getElementById('discover-sub');
const lookControls = document.getElementById('look-controls');

function onEnterRoom(rid) {
  currentRoomId = rid;
  // Toggle look-controls panel only in cathedral
  if (rid === 'map') {
    lookControls.classList.add('show');
  } else {
    lookControls.classList.remove('show');
  }
  // First-time discovery flourish
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
  // restart animation
  void discoverEl.offsetWidth;
  discoverEl.classList.add('show');
  if (discoverTimer) clearTimeout(discoverTimer);
  discoverTimer = setTimeout(() => discoverEl.classList.remove('show'), 4200);
}

// ---- Loop ----
let lastTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  const t = now / 1000;

  tickHold(now);
  // Track which room the player is in; auto-tilt + show look-controls only in cathedral.
  const rid = layout.roomId && layout.roomId[player.state.ty] && layout.roomId[player.state.ty][player.state.tx];
  if (rid && rid !== currentRoomId) {
    onEnterRoom(rid);
  }
  if (rid === 'map' && Math.abs(player.state.pitchTarget) < 0.01) {
    player.setPitchTarget(0.30);
  } else if (rid !== 'map' && Math.abs(player.state.pitchTarget - 0.30) < 0.02) {
    player.resetPitch();
  }
  player.update(now);
  player.applyToCamera(camera, { bobEnabled: opts.headbob !== false, fovEnabled: opts.sprintFov !== false, baseFov: 72 });
  if (built.playerLight) {
    built.playerLight.position.set(camera.position.x, 1.85, camera.position.z);
  }

  // Subtle chandelier shimmer (very gentle, museum-grade — not flicker)
  for (let i = 0; i < built.torchLights.length; i++) {
    const tl = built.torchLights[i];
    const breathe = 0.97 + Math.sin(t * 1.4 + i * 0.7) * 0.03;
    tl.light.intensity = tl.baseIntensity * breathe;
  }

  // Animated GIF redraw (if any)
  for (const a of built.artObjects) {
    const map = a.artMesh.material.map;
    if (map && map.userData && map.userData.animated) {
      const { ctx, canvas, img } = map.userData;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      map.needsUpdate = true;
    }
  }

  minimap.draw(player, built.artObjects);
  renderer.render(scene, camera);
}

document.getElementById('loading').style.transition = 'opacity 0.4s';
document.getElementById('loading').style.opacity = '0';
setTimeout(() => { document.getElementById('loading').style.display = 'none'; }, 400);

animate();
window.__museum = { layout, built, player, opts };

// =====================================================================
// AESTHETIC PRESETS — multiplicative tints over the base textures.
// =====================================================================
const PRESETS = {
  civic:  { name: 'Civic Classical', wall: 0xffffff, floor: 0xffffff, ceil: 0xffffff, fog: 0x001a30, exposure: 1.05 },
  ps1:    { name: 'PS1 Dungeon',     wall: 0x6a5a3a, floor: 0x8a7a5a, ceil: 0x6a5a3a, fog: 0x080606, exposure: 0.85 },
  atrium: { name: 'Sunlit Atrium',   wall: 0xfff0d4, floor: 0xffe8c0, ceil: 0xfff8e8, fog: 0xfff5e0, exposure: 1.25 },
  velvet: { name: 'Velvet Cathedral',wall: 0xb04030, floor: 0x6a3a20, ceil: 0x402418, fog: 0x1a0a08, exposure: 0.95 },
};

function applyAesthetic(name) {
  const p = PRESETS[name] || PRESETS.civic;
  if (built.wallMat)  built.wallMat.color.setHex(p.wall);
  if (built.floorMat) built.floorMat.color.setHex(p.floor);
  if (built.ceilMat)  built.ceilMat.color.setHex(p.ceil);
  if (scene.fog)      scene.fog.color.setHex(p.fog);
  scene.background = new THREE.Color(p.fog);
  renderer.toneMappingExposure = p.exposure;
  opts.pixelation = (name === 'ps1') ? 5 : (name === 'atrium' ? 2 : 3);
  if (pixSlider) { pixSlider.value = opts.pixelation; pixVal.textContent = opts.pixelation; }
  resize();
}

// =====================================================================
// SPRINT SPEED-LINES — radial vignette tied to sprint energy
// =====================================================================
const speedLines = document.getElementById('speedlines');
function tickSpeedLines() {
  if (speedLines) {
    const e = player.state.sprintEnergy || 0;
    speedLines.style.opacity = (e * 0.7).toFixed(3);
  }
  requestAnimationFrame(tickSpeedLines);
}
tickSpeedLines();

// =====================================================================
// TWEAKS PANEL
// =====================================================================
let tweaksOpen = false;
const panel = document.getElementById('tweaks');
const panelClose = document.getElementById('tweaks-close');
function setPanel(open) {
  tweaksOpen = open;
  panel.classList.toggle('open', open);
}
window.addEventListener('message', (ev) => {
  const m = ev.data;
  if (!m || !m.type) return;
  if (m.type === '__activate_edit_mode')   setPanel(true);
  if (m.type === '__deactivate_edit_mode') setPanel(false);
});
window.parent.postMessage({type: '__edit_mode_available'}, '*');
if (panelClose) panelClose.addEventListener('click', () => {
  setPanel(false);
  window.parent.postMessage({type: '__edit_mode_dismissed'}, '*');
});
function persistKey(key, value) {
  opts[key] = value;
  window.parent.postMessage({type: '__edit_mode_set_keys', edits: { [key]: value }}, '*');
}

const pickAesthetic = document.getElementById('tw-aesthetic');
const pixSlider = document.getElementById('tw-pixel');
const pixVal    = document.getElementById('tw-pixel-val');
const bobToggle = document.getElementById('tw-bob');
const fovToggle = document.getElementById('tw-fov');
const fogSlider = document.getElementById('tw-fog');
const fogVal    = document.getElementById('tw-fog-val');

if (pickAesthetic) {
  pickAesthetic.value = opts.aesthetic || 'civic';
  pickAesthetic.addEventListener('change', () => {
    persistKey('aesthetic', pickAesthetic.value);
    applyAesthetic(pickAesthetic.value);
  });
}
if (pixSlider) {
  pixSlider.value = opts.pixelation;
  pixVal.textContent = opts.pixelation;
  pixSlider.addEventListener('input', () => {
    opts.pixelation = parseInt(pixSlider.value, 10);
    pixVal.textContent = opts.pixelation;
    resize();
  });
  pixSlider.addEventListener('change', () => persistKey('pixelation', parseInt(pixSlider.value, 10)));
}
if (bobToggle) {
  bobToggle.checked = opts.headbob !== false;
  bobToggle.addEventListener('change', () => persistKey('headbob', bobToggle.checked));
}
if (fovToggle) {
  fovToggle.checked = opts.sprintFov !== false;
  fovToggle.addEventListener('change', () => persistKey('sprintFov', fovToggle.checked));
}
if (fogSlider) {
  fogSlider.value = opts.fogDistance;
  fogVal.textContent = opts.fogDistance;
  fogSlider.addEventListener('input', () => {
    opts.fogDistance = parseInt(fogSlider.value, 10);
    fogVal.textContent = opts.fogDistance;
    if (scene.fog) scene.fog.far = opts.fogDistance;
  });
  fogSlider.addEventListener('change', () => persistKey('fogDistance', parseInt(fogSlider.value, 10)));
}

// Apply persisted aesthetic now that the panel & resize are wired.
applyAesthetic(opts.aesthetic || 'civic');
window.__museum.applyAesthetic = applyAesthetic;
