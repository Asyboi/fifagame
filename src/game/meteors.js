// Meteor storm — pure logic, no three.js. Unit-testable.
// After METEOR.START_AT seconds of match time, medium speed / medium sized
// meteors start falling onto the pitch. A direct hit kills a player; the
// shockwave knocks nearby players down.

import { PITCH, METEOR } from '../config.js';
import { clamp } from '../utils.js';

export function createStorm() {
  return { active: false, spawnT: 0, nextId: 1, meteors: [] };
}

function spawnMeteor(storm, targetPos, rng) {
  const gl = PITCH.LENGTH / 2 - 2;
  const tl = PITCH.WIDTH / 2 - 2;
  const t = targetPos ? targetPos() : null;
  const tx = t ? t.x + (rng() * 2 - 1) * METEOR.TARGET_JITTER : (rng() * 2 - 1) * gl;
  const tz = t ? t.z + (rng() * 2 - 1) * METEOR.TARGET_JITTER : (rng() * 2 - 1) * tl;
  const driftA = rng() * Math.PI * 2;
  const drift = rng() * METEOR.DRIFT;
  return {
    id: storm.nextId++,
    x: clamp(tx, -gl, gl),
    z: clamp(tz, -tl, tl),
    y: METEOR.SPAWN_HEIGHT,
    vx: Math.cos(driftA) * drift,
    vy: -METEOR.SPEED,
    vz: Math.sin(driftA) * drift,
    r: METEOR.RADIUS,
  };
}

/**
 * Advance the storm by dt seconds of *match* time.
 * elapsed: total seconds of play so far (storm starts at METEOR.START_AT).
 * targetPos: optional () => ({x, z} | null) strike bias (e.g. near a player).
 * Returns events: { started, spawned: [meteor], impacted: [meteor] }.
 */
export function updateStorm(storm, elapsed, dt, targetPos = null, rng = Math.random) {
  const ev = { started: false, spawned: [], impacted: [] };
  if (!storm.active) {
    if (elapsed < METEOR.START_AT) return ev;
    storm.active = true;
    storm.spawnT = METEOR.FIRST_DELAY;
    ev.started = true;
  }

  storm.spawnT -= dt;
  if (storm.spawnT <= 0) {
    storm.spawnT = METEOR.SPAWN_MIN + rng() * (METEOR.SPAWN_MAX - METEOR.SPAWN_MIN);
    const m = spawnMeteor(storm, targetPos, rng);
    storm.meteors.push(m);
    ev.spawned.push(m);
  }

  for (const m of storm.meteors) {
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    m.z += m.vz * dt;
  }
  for (let i = storm.meteors.length - 1; i >= 0; i--) {
    if (storm.meteors[i].y <= 0) {
      ev.impacted.push(storm.meteors[i]);
      storm.meteors.splice(i, 1);
    }
  }
  return ev;
}

/**
 * Who gets hit by a meteor landing at (x, z)?
 * Returns { killed: [...], downed: [...] } — alive players only.
 */
export function resolveImpact(x, z, players) {
  const killed = [];
  const downed = [];
  for (const p of players) {
    if (!p.alive) continue;
    const d = Math.hypot(p.pos.x - x, p.pos.z - z);
    if (d < METEOR.KILL_RADIUS) killed.push(p);
    else if (d < METEOR.DOWN_RADIUS) downed.push(p);
  }
  return { killed, downed };
}
