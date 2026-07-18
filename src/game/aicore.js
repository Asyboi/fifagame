// AI + targeting helpers — pure functions over plain {pos:{x,z}, vel:{x,z}} players.
import { PITCH, PLAYER } from '../config.js';
import { clamp } from '../utils.js';

const len = (x, z) => Math.hypot(x, z) || 1;

/**
 * Best pass target. dirX/dirZ = desired direction (0,0 = no preference).
 * Returns { p, lob } or null. `lob` when the lane is crowded or the pass is long.
 */
export function pickPassTarget(mates, opps, carrier, dirX, dirZ) {
  const mag = Math.hypot(dirX, dirZ);
  const hasDir = mag > 0.3;
  const ndx = hasDir ? dirX / mag : 0; const ndz = hasDir ? dirZ / mag : 0;
  let best = null; let bestScore = -Infinity;
  for (const m of mates) {
    if (m === carrier || m.role === 'GK') continue;
    const dx = m.pos.x - carrier.pos.x; const dz = m.pos.z - carrier.pos.z;
    const d = len(dx, dz);
    if (d < 2 || d > 34) continue;
    const nx = dx / d; const nz = dz / d;
    const align = hasDir ? nx * ndx + nz * ndz : 0.4;
    if (hasDir && align < 0.15) continue;
    // openness: nearest opponent to the passing lane
    let lane = Infinity;
    for (const o of opps) {
      const t = clamp(((o.pos.x - carrier.pos.x) * nx + (o.pos.z - carrier.pos.z) * nz) / d, 0, 1);
      const px = carrier.pos.x + nx * d * t; const pz = carrier.pos.z + nz * d * t;
      lane = Math.min(lane, len(o.pos.x - px, o.pos.z - pz));
    }
    let mark = Infinity;
    for (const o of opps) mark = Math.min(mark, len(o.pos.x - m.pos.x, o.pos.z - m.pos.z));
    const distScore = 1 - Math.abs(d - 13) / 24;
    const score = align * 2.2 + distScore + Math.min(lane, 6) * 0.35 + Math.min(mark, 6) * 0.25;
    if (score > bestScore) { bestScore = score; best = { p: m, lob: d > 20 || lane < 1.6 }; }
  }
  return best;
}

/** Nearest teammate to the ball for player-switching (outfielders preferred). */
export function pickSwitchTarget(mates, ballPos, currentId) {
  let best = null; let bd = Infinity;
  for (const m of mates) {
    if (m.id === currentId || m.role === 'GK') continue;
    const d = (m.pos.x - ballPos.x) ** 2 + (m.pos.z - ballPos.z) ** 2;
    if (d < bd) { bd = d; best = m; }
  }
  if (best) return best;
  for (const m of mates) { // allow GK as last resort
    if (m.id === currentId) continue;
    const d = (m.pos.x - ballPos.x) ** 2 + (m.pos.z - ballPos.z) ** 2;
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

/**
 * Formation anchor for an off-ball player, shifted by ball position and phase.
 * base: kickoff spot; ballX in [-L/2, L/2]; attackDir ±1; hasBall = own team in possession.
 */
export function formationAnchor(base, role, ballX, ballZ, attackDir, hasBall) {
  const push = clamp(ballX * 0.3 * attackDir, -9, 9);
  const zShift = clamp(ballZ * 0.22, -5, 5);
  let x = base.x + push * attackDir + (hasBall ? attackDir * 3.5 : -attackDir * 1.5);
  if (role === 'GK') x = base.x;
  const gl = PITCH.LENGTH / 2;
  x = clamp(x, -gl + 2, gl - 2);
  return { x, z: clamp(base.z + zShift, -PITCH.WIDTH / 2 + 2, PITCH.WIDTH / 2 - 2) };
}

/** In shooting range: ahead of the ball toward the opponent's goal. */
export function inShootingRange(p, attackDir, maxDist = 23) {
  const gx = attackDir * (PITCH.LENGTH / 2);
  const dx = gx - p.pos.x;
  if (dx * attackDir <= 0) return false; // goal behind
  return Math.hypot(dx, p.pos.z) < maxDist && Math.abs(p.pos.z) < 24;
}

/**
 * Aim point inside the goal mouth. biasZ in [-1,1] (0 = smart: shoot away from GK).
 * charge in [0,1] controls height; very high charge can balloon it over.
 */
export function shootAim(attackDir, biasZ, charge, gkZ = 0) {
  const half = PITCH.GOAL_WIDTH / 2 - 0.55;
  let zAim;
  if (Math.abs(biasZ) > 0.25) zAim = clamp(biasZ, -1, 1) * half;
  else zAim = (gkZ >= 0 ? -1 : 1) * half * 0.85; // far corner from the keeper
  let yAim = charge < 0.45 ? 0.5 + charge * 0.8 : 0.9 + (charge - 0.45) * (PITCH.GOAL_HEIGHT - 0.9) * 1.6;
  if (charge > 0.95) yAim += (charge - 0.95) * 26; // punish overcharging
  return { x: attackDir * (PITCH.LENGTH / 2), y: yAim, z: zAim };
}

/** Ballistic shot velocity from ball pos to an aim point at the given speed. */
export function shotVelocity(from, aim, speed, gravity) {
  const dx = aim.x - from.x; const dz = aim.z - from.z;
  const dh = Math.hypot(dx, dz) || 1e-4;
  const ux = dx / dh; const uz = dz / dh;
  const t = dh / speed;
  const vy = clamp((aim.y - from.y + 0.5 * gravity * t * t) / t, -4, 15);
  return { vx: ux * speed, vy, vz: uz * speed };
}

/** Should the AI carrier pull the trigger? */
export function aiShouldShoot(p, attackDir, gkReach, diff) {
  if (!inShootingRange(p, attackDir, 22)) return false;
  const dx = attackDir * (PITCH.LENGTH / 2) - p.pos.x;
  const dist = Math.hypot(dx, p.pos.z);
  const angleOk = Math.abs(p.pos.z) < 17 || dist < 11;
  return angleOk && gkReach < 9 + diff.reaction * 10;
}

export { PLAYER };
