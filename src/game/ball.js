// Arcade ball physics — pure functions, no three.js. Unit-testable.
// Conventions: pitch centered at origin, goal lines at x = ±PITCH.LENGTH/2,
// touchlines at z = ±PITCH.WIDTH/2, ground plane y = 0, ball radius BALL.R.

import { BALL, PITCH } from '../config.js';

export function createBall() {
  return {
    pos: { x: 0, y: BALL.R, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    owner: null,        // player object or null
    lastTouch: null,    // 'home' | 'away' | null
    freeT: 99,          // seconds since ball became loose (for AI reaction)
    lockId: null,       // player id temporarily barred from re-trapping (just kicked it)
    lockT: 0,
    shotT: 99,          // seconds since a shot was taken (for GK / on-target logic)
  };
}

export function ballSpeed(b) {
  return Math.hypot(b.vel.x, b.vel.y, b.vel.z);
}

export function ballSpeedXZ(b) {
  return Math.hypot(b.vel.x, b.vel.z);
}

/** Release the ball with a velocity. `side` = 'home'|'away' of the kicker. */
export function kickBall(b, vx, vy, vz, side, lockId = null) {
  b.vel.x = vx; b.vel.y = vy; b.vel.z = vz;
  b.owner = null;
  b.lastTouch = side;
  b.freeT = 0;
  b.lockId = lockId;
  b.lockT = lockId == null ? 0 : 0.28;
}

/** Give possession: ball stops and glues to the owner (match moves it). */
export function giveBall(b, player, side) {
  b.owner = player;
  b.lastTouch = side;
  b.vel.x = 0; b.vel.y = 0; b.vel.z = 0;
  b.freeT = 99;
  b.lockId = null;
  b.lockT = 0;
  b.pos.y = BALL.R;
}

const POSTS = [];
for (const gx of [-PITCH.LENGTH / 2, PITCH.LENGTH / 2]) {
  for (const pz of [-PITCH.GOAL_WIDTH / 2, PITCH.GOAL_WIDTH / 2]) {
    POSTS.push({ x: gx, z: pz });
  }
}

function collidePost(b, px, pz) {
  if (b.pos.y > PITCH.GOAL_HEIGHT + BALL.R) return false;
  const dx = b.pos.x - px; const dz = b.pos.z - pz;
  const rr = PITCH.POST_R + BALL.R;
  const d2 = dx * dx + dz * dz;
  if (d2 >= rr * rr || d2 === 0) return false;
  const d = Math.sqrt(d2);
  const nx = dx / d; const nz = dz / d;
  b.pos.x = px + nx * rr; b.pos.z = pz + nz * rr;
  const vn = b.vel.x * nx + b.vel.z * nz;
  if (vn < 0) {
    b.vel.x -= 1.6 * vn * nx;
    b.vel.z -= 1.6 * vn * nz;
  }
  return true;
}

function collideCrossbar(b, gx) {
  // Horizontal bar along z at (gx, GOAL_HEIGHT).
  if (Math.abs(b.pos.z) > PITCH.GOAL_WIDTH / 2 + BALL.R) return false;
  const dx = b.pos.x - gx; const dy = b.pos.y - PITCH.GOAL_HEIGHT;
  const rr = PITCH.POST_R + BALL.R;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr || d2 === 0) return false;
  const d = Math.sqrt(d2);
  const nx = dx / d; const ny = dy / d;
  b.pos.x = gx + nx * rr; b.pos.y = PITCH.GOAL_HEIGHT + ny * rr;
  const vn = b.vel.x * nx + b.vel.y * ny;
  if (vn < 0) {
    b.vel.x -= 1.6 * vn * nx;
    b.vel.y -= 1.6 * vn * ny;
  }
  return true;
}

function inMouth(b, margin = 0) {
  return Math.abs(b.pos.z) < PITCH.GOAL_WIDTH / 2 - margin && b.pos.y < PITCH.GOAL_HEIGHT - margin;
}

/** Net catch: once the ball is behind the goal line inside the mouth, smother it. */
function collideNet(b) {
  const gl = PITCH.LENGTH / 2;
  if (Math.abs(b.pos.x) <= gl) return;
  if (!inMouth(b, -0.3)) return;
  const depth = gl + PITCH.GOAL_DEPTH - BALL.R;
  b.vel.x *= 0.22; b.vel.z *= 0.4;
  if (Math.abs(b.pos.x) > depth) {
    b.pos.x = Math.sign(b.pos.x) * depth;
    b.vel.x = -b.vel.x * 0.2;
  }
  if (b.pos.y > PITCH.GOAL_HEIGHT - BALL.R * 0.5) {
    b.pos.y = PITCH.GOAL_HEIGHT - BALL.R * 0.5;
    b.vel.y = -Math.abs(b.vel.y) * 0.2;
  }
  if (Math.abs(b.pos.z) > PITCH.GOAL_WIDTH / 2 - BALL.R * 0.5) {
    b.pos.z = Math.sign(b.pos.z) * (PITCH.GOAL_WIDTH / 2 - BALL.R * 0.5);
    b.vel.z = -b.vel.z * 0.2;
  }
}

/**
 * Integrate one step. Only for a FREE ball (no owner) — the match moves
 * owned balls. Returns { hitPost:boolean } for audio.
 */
export function stepBall(b, dt) {
  if (b.lockT > 0) { b.lockT -= dt; if (b.lockT <= 0) b.lockId = null; }
  b.freeT += dt;
  b.shotT += dt;

  const onGround = b.pos.y <= BALL.R + 1e-4;

  if (!onGround || b.vel.y > 0) {
    b.vel.y -= BALL.GRAVITY * dt;
    const drag = 1 / (1 + BALL.AIR_DRAG * dt);
    b.vel.x *= drag; b.vel.z *= drag;
  } else {
    const fr = 1 / (1 + BALL.ROLL_FRICTION * dt);
    b.vel.x *= fr; b.vel.z *= fr;
    if (Math.abs(b.vel.x) + Math.abs(b.vel.z) < 0.08) { b.vel.x = 0; b.vel.z = 0; }
  }

  b.pos.x += b.vel.x * dt;
  b.pos.y += b.vel.y * dt;
  b.pos.z += b.vel.z * dt;

  if (b.pos.y < BALL.R) {
    b.pos.y = BALL.R;
    if (b.vel.y < 0) {
      b.vel.y = -b.vel.y * BALL.RESTITUTION;
      if (b.vel.y < BALL.STOP_SPEED) b.vel.y = 0;
    }
  }

  let hitPost = false;
  for (const p of POSTS) hitPost = collidePost(b, p.x, p.z) || hitPost;
  hitPost = collideCrossbar(b, -PITCH.LENGTH / 2) || hitPost;
  hitPost = collideCrossbar(b, PITCH.LENGTH / 2) || hitPost;
  collideNet(b);

  return { hitPost };
}

/**
 * Predict where a free ball crosses the plane x = goalX (ignore drag/bounces;
 * good enough at arcade distances). Returns { t, y, z } or null.
 */
export function predictCrossing(b, goalX) {
  const vx = b.vel.x;
  if (Math.abs(vx) < 1e-3) return null;
  const t = (goalX - b.pos.x) / vx;
  if (t <= 0 || t > 4) return null;
  const y = b.pos.y + b.vel.y * t - 0.5 * BALL.GRAVITY * t * t;
  const z = b.pos.z + b.vel.z * t;
  return { t, y: Math.max(BALL.R, y), z };
}
