// Cross-scene navigation: forward triggers, return tiles, and the return stack.
//
// USAGE (per scene main.js)
//
//   const nav = setupSceneNav({
//     sceneUrl: 'this-scene.html',           // for pushReturn on forward triggers
//     player, camera,
//     spawnTile: layout.spawn,                // optional; used as the return tile
//     forwardTriggers: built.triggerTiles,    // [{ x, y, target: 'other-scene.html' }, ...]
//     holdTriggers: [                          // [{ x, y, target, holdMs, returnTile?, returnDir? }]
//       // Stand on (x,y) for holdMs and you're transported to target.
//       // On return, you land at returnTile (defaults to the trigger tile)
//       // facing returnDir (defaults to (player.dir+2)%4 at the moment of trigger).
//     ],
//   });
//
//   // gate input:
//   if (nav.isTransitioning()) return;
//
//   // in the animate loop:
//   nav.check();
//
// SEMANTICS
//   * On scene load, any pending arrival override (set by the previous scene's
//     return tile) is applied — overriding the default spawn position+dir.
//   * Stepping on a forward trigger pushes { scene, tile, dir+2 } onto the
//     stack, then navigates to `t.target`.
//   * The spawnTile is treated as the return tile. Once armed (the player has
//     stepped off it at least once), stepping back on pops the stack and
//     navigates to the recorded scene with an arrival override.
//   * Forward triggers self-arm: if a return arrival lands on a forward
//     trigger tile, it won't fire until the player has moved off first.

const STACK_KEY   = 'castle:returnStack';
const ARRIVAL_KEY = 'castle:arrivalOverride';
const LOADING_KEY = 'castle:loadingMsg';
const YAW = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

// ---- Stack + arrival primitives (also exported for advanced use) ----
function readStack() {
  try { return JSON.parse(sessionStorage.getItem(STACK_KEY) || '[]'); }
  catch { return []; }
}
function writeStack(arr) { sessionStorage.setItem(STACK_KEY, JSON.stringify(arr)); }

export function pushReturn(scene, tile, dir) {
  const s = readStack();
  s.push({ scene, tile, dir });
  writeStack(s);
}
export function popReturn() {
  const s = readStack();
  const top = s.length ? s.pop() : null;
  writeStack(s);
  return top;
}
export function setArrival(tile, dir) {
  sessionStorage.setItem(ARRIVAL_KEY, JSON.stringify({ tile, dir }));
}
export function consumeLoadingMsg() {
  const m = sessionStorage.getItem(LOADING_KEY);
  if (m) sessionStorage.removeItem(LOADING_KEY);
  return m;
}
export function applyArrival(player, camera) {
  const v = sessionStorage.getItem(ARRIVAL_KEY);
  if (!v) return false;
  sessionStorage.removeItem(ARRIVAL_KEY);
  let a; try { a = JSON.parse(v); } catch { return false; }
  player.state.tx = a.tile.x;
  player.state.ty = a.tile.y;
  player.state.x  = a.tile.x;
  player.state.y  = a.tile.y;
  player.state.dir = a.dir;
  player.state.yaw = YAW[a.dir];
  if (camera) player.applyToCamera(camera);
  return true;
}

// ---- High-level scene wire-up ----
export function setupSceneNav({
  sceneUrl,
  player, camera,
  spawnTile,
  forwardTriggers = [],
  holdTriggers = [],
  defaultReturnScene = null, // fallback target when the return stack is empty (deep-link / refresh)
  returnLoadingMsg = null,   // optional loading-screen label shown on the destination after the return tile fires
}) {
  applyArrival(player, camera);

  const RETURN_TILE = spawnTile ? { x: spawnTile.x, y: spawnTile.y } : null;
  let returnArmed = false;
  const armedForward = new Set();
  const armedHold = new Set();
  let holdState = null; // { key, startedAt }
  let transitioning = false;

  function check() {
    if (transitioning) return;
    const tx = player.state.tx, ty = player.state.ty;

    // Return tile
    if (RETURN_TILE) {
      if (!returnArmed && (tx !== RETURN_TILE.x || ty !== RETURN_TILE.y)) returnArmed = true;
      if (returnArmed && tx === RETURN_TILE.x && ty === RETURN_TILE.y) {
        const ret = popReturn();
        if (returnLoadingMsg) sessionStorage.setItem(LOADING_KEY, returnLoadingMsg);
        if (ret) {
          setArrival(ret.tile, ret.dir);
          transitioning = true;
          window.location.href = ret.scene;
          return;
        } else if (defaultReturnScene) {
          // Stack empty (likely deep-linked into this scene). Send the player
          // to the fallback without an arrival override → that scene's default spawn.
          transitioning = true;
          window.location.href = defaultReturnScene;
          return;
        }
      }
    }

    // Forward triggers — arm tiles the player isn't on so return arrivals
    // that land on a trigger don't fire immediately.
    for (const t of forwardTriggers) {
      const k = `${t.x},${t.y}`;
      if (!armedForward.has(k) && (t.x !== tx || t.y !== ty)) armedForward.add(k);
    }
    for (const t of forwardTriggers) {
      if (t.x === tx && t.y === ty && armedForward.has(`${t.x},${t.y}`)) {
        if (!t.target) { console.warn('[nav] forward trigger missing target', t); return; }
        pushReturn(sceneUrl, { x: tx, y: ty }, (player.state.dir + 2) % 4);
        transitioning = true;
        window.location.href = t.target;
        return;
      }
    }

    // Hold triggers — stand on the tile for holdMs ms continuously to fire.
    // Each trigger may declare onEnter()/onLeave() callbacks that fire on
    // tile entry/exit, useful for UI such as fade-in animations.
    for (const h of holdTriggers) {
      const k = `${h.x},${h.y}`;
      if (!armedHold.has(k) && (h.x !== tx || h.y !== ty)) armedHold.add(k);
    }
    let active = null;
    for (const h of holdTriggers) {
      if (h.x === tx && h.y === ty && armedHold.has(`${h.x},${h.y}`)) { active = h; break; }
    }
    const now = performance.now();
    if (active) {
      const key = `${active.x},${active.y}`;
      if (!holdState || holdState.key !== key) {
        holdState = { key, startedAt: now, trigger: active };
        if (typeof active.onEnter === 'function') active.onEnter();
      } else if (now - holdState.startedAt >= (active.holdMs || 4000)) {
        if (!active.target) { console.warn('[nav] hold trigger missing target', active); return; }
        const arrivalTile = active.returnTile || { x: active.x, y: active.y };
        const arrivalDir = active.returnDir != null ? active.returnDir : (player.state.dir + 2) % 4;
        pushReturn(sceneUrl, arrivalTile, arrivalDir);
        transitioning = true;
        window.location.href = active.target;
        return;
      }
    } else {
      if (holdState) {
        const prev = holdState.trigger;
        holdState = null;
        if (prev && typeof prev.onLeave === 'function') prev.onLeave();
      }
    }
  }

  return { check, isTransitioning: () => transitioning };
}
