// Tile-based movement + wall collision.
import * as THREE from 'three';

// Direction 0=N 1=E 2=S 3=W
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

export function createPlayer(layout, CELL) {
  const spawn = layout.spawn;
  const state = {
    // Tile coords (integers) — these are the COMMITTED position.
    tx: spawn.x,
    ty: spawn.y,
    dir: spawn.dir,
    // Animated (fractional) values — where the camera actually is right now.
    x: spawn.x,
    y: spawn.y,
    yaw: dirToYaw(spawn.dir),
    pitch: 0,           // up/down look (radians) — used in cathedral hall
    pitchTarget: 0,
    // Bob + sprint
    bobPhase: 0,
    bobAmp: 0,         // smoothed amplitude (eases up while moving, down while idle)
    sprintEnergy: 0,   // 0..1, builds while sprinting / stays high during dash
    sprintHeld: false,
    lastForwardTap: 0, // for double-tap dash detection
    // Tween state
    anim: null, // { type, startTime, duration, from, to }
  };

  function setPitchTarget(p) {
    state.pitchTarget = Math.max(-0.2, Math.min(0.9, p));
  }
  function nudgePitch(dp) { setPitchTarget(state.pitchTarget + dp); }
  function resetPitch() { state.pitchTarget = 0; }

  function dirToYaw(d) {
    // yaw 0 looks toward -Z (north = yaw 0)
    // E = yaw = -PI/2 (we turn right)
    // Actually: facing north (d=0) → looking at -Z → camera.rotation.y = 0 (default lookAt(-Z)? No.)
    // Three.js camera's default forward is -Z when rotation.y=0.
    // Turning to East (d=1) → should look at +X → rotation.y = -PI/2
    // Turning to South (d=2) → look at +Z → rotation.y = PI
    // Turning to West (d=3) → look at -X → rotation.y = PI/2
    const map = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
    return map[d];
  }

  function canMoveTo(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= layout.width || ty >= layout.height) return false;
    return layout.grid[ty][tx] === 0; // floor only (walls=1, void=-1 both block)
  }

  function tryMove(relDir) {
    if (state.anim) return;
    // Detect double-tap forward (within 250ms) for dash burst
    const now = performance.now();
    if (relDir === 0) {
      if (now - state.lastForwardTap < 250) {
        state.sprintEnergy = Math.min(1, state.sprintEnergy + 0.6);
      }
      state.lastForwardTap = now;
    }
    const worldDir = (state.dir + relDir) % 4;
    const ntx = state.tx + DX[worldDir];
    const nty = state.ty + DY[worldDir];
    if (!canMoveTo(ntx, nty)) {
      state.anim = {
        type: 'bump',
        startTime: now,
        duration: 180,
        from: { x: state.x, y: state.y },
        to: { x: state.x + DX[worldDir] * 0.15, y: state.y + DY[worldDir] * 0.15 },
        back: true,
      };
      return;
    }
    state.tx = ntx; state.ty = nty;
    // Sprint shortens the move duration; energy rises while held
    const sprintFactor = 1 - 0.45 * state.sprintEnergy;
    state.anim = {
      type: 'move',
      startTime: now,
      duration: Math.max(110, 220 * sprintFactor),
      from: { x: state.x, y: state.y },
      to: { x: ntx, y: nty },
    };
    // Build a small amount of bob/energy on each step
    state.bobAmp = Math.min(1, state.bobAmp + 0.5);
    if (state.sprintHeld) {
      state.sprintEnergy = Math.min(1, state.sprintEnergy + 0.18);
    }
  }

  function setSprint(held) { state.sprintHeld = !!held; }

  function tryTurn(deltaDir) {
    if (state.anim) return;
    const newDir = (state.dir + deltaDir + 4) % 4;
    state.dir = newDir;
    const fromYaw = state.yaw;
    let toYaw = dirToYaw(newDir);
    // Shortest path
    let delta = toYaw - fromYaw;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    state.anim = {
      type: 'turn',
      startTime: performance.now(),
      duration: 200,
      fromYaw,
      toYaw: fromYaw + delta,
    };
  }

  function update(now) {
    if (!state.anim) return;
    const t = Math.min(1, (now - state.anim.startTime) / state.anim.duration);
    const ease = easeInOutCubic(t);
    if (state.anim.type === 'move' || state.anim.type === 'bump') {
      if (state.anim.type === 'bump') {
        // Ping-pong: 0 -> 1 -> 0
        const ee = ease < 0.5 ? easeInOutCubic(ease * 2) : easeInOutCubic((1 - ease) * 2);
        state.x = state.anim.from.x + (state.anim.to.x - state.anim.from.x) * ee;
        state.y = state.anim.from.y + (state.anim.to.y - state.anim.from.y) * ee;
      } else {
        state.x = state.anim.from.x + (state.anim.to.x - state.anim.from.x) * ease;
        state.y = state.anim.from.y + (state.anim.to.y - state.anim.from.y) * ease;
      }
    } else if (state.anim.type === 'turn') {
      state.yaw = state.anim.fromYaw + (state.anim.toYaw - state.anim.fromYaw) * ease;
    }
    if (t >= 1) {
      if (state.anim.type === 'turn') state.yaw = dirToYaw(state.dir);
      if (state.anim.type === 'move') { state.x = state.tx; state.y = state.ty; }
      if (state.anim.type === 'bump') { state.x = state.anim.from.x; state.y = state.anim.from.y; }
      state.anim = null;
    }
  }

  function applyToCamera(cam, opts = {}) {
    // Smooth pitch toward target
    state.pitch += (state.pitchTarget - state.pitch) * 0.18;

    // Sprint energy decays when not held & not animating forward
    if (!state.sprintHeld && !state.anim) {
      state.sprintEnergy = Math.max(0, state.sprintEnergy - 0.025);
    }
    // Bob amplitude eases toward 0 when idle, grows during movement
    const moving = !!state.anim && state.anim.type === 'move';
    state.bobAmp += ((moving ? 1 : 0) - state.bobAmp) * 0.12;
    state.bobPhase += moving ? (0.32 + 0.25 * state.sprintEnergy) : 0.05;

    // Headbob: vertical sine + lateral tilt sine (Mirror's Edge restraint)
    const bobOn = opts.bobEnabled !== false ? 1 : 0;
    const bobY = bobOn * state.bobAmp * (0.04 + 0.04 * state.sprintEnergy) * Math.sin(state.bobPhase * 2);
    const bobRoll = bobOn * state.bobAmp * 0.018 * Math.sin(state.bobPhase);

    // Bank into turns
    const turning = !!state.anim && state.anim.type === 'turn';
    let bank = 0;
    if (turning) {
      const dy = (state.anim.toYaw - state.anim.fromYaw);
      const t = Math.min(1, (performance.now() - state.anim.startTime) / state.anim.duration);
      bank = -Math.sign(dy) * 0.05 * Math.sin(t * Math.PI);
    }

    cam.position.set(state.x * CELL, 1.55 + bobY, state.y * CELL);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(state.pitch, state.yaw, bobRoll + bank);

    // FOV widens with sprint energy (Quake / Mirror's Edge kinetic feel)
    if (opts.fovEnabled !== false && cam.isPerspectiveCamera) {
      const baseFov = opts.baseFov || 72;
      const targetFov = baseFov + 10 * state.sprintEnergy;
      cam.fov += (targetFov - cam.fov) * 0.12;
      cam.updateProjectionMatrix();
    }
  }

  function frontTile() {
    const d = state.dir;
    return { x: state.tx + DX[d], y: state.ty + DY[d] };
  }

  return {
    state,
    tryMove, tryTurn, update, applyToCamera,
    canMoveTo, frontTile,
    setPitchTarget, nudgePitch, resetPitch,
    setSprint,
  };
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
