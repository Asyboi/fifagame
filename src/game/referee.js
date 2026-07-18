// Boundary / restart / clock rules — pure functions. Unit-testable.
// Home defends the goal at x = -L/2 and attacks +x; away mirrors.

import { PITCH } from '../config.js';

/**
 * Did the ball cross a goal line (between posts, under bar) this step?
 * Returns the SCORING side: 'home' | 'away' | null.
 */
export function crossedGoalLine(prev, cur) {
  const gl = PITCH.LENGTH / 2;
  for (const s of [1, -1]) {
    const line = s * gl;
    const wasInside = s === 1 ? prev.x <= line : prev.x >= line;
    const isBeyond = s === 1 ? cur.x > line : cur.x < line;
    if (!wasInside || !isBeyond) continue;
    if (Math.abs(cur.z) < PITCH.GOAL_WIDTH / 2 && cur.y < PITCH.GOAL_HEIGHT) {
      return s === 1 ? 'home' : 'away'; // ball in +x goal => home scored
    }
  }
  return null;
}

/**
 * Ball fully out of bounds (and not a goal).
 * Returns 'goalLine-home' (behind home's own line, x<0), 'goalLine-away',
 * 'touch-top' (z>0) | 'touch-bottom' | null.
 */
export function outOfBounds(cur) {
  const gl = PITCH.LENGTH / 2; const tl = PITCH.WIDTH / 2;
  if (cur.x > gl) return 'goalLine-away';
  if (cur.x < -gl) return 'goalLine-home';
  if (cur.z > tl) return 'touch-top';
  if (cur.z < -tl) return 'touch-bottom';
  return null;
}

/**
 * Decide the restart from an out event and who touched the ball last.
 * lastTouch: 'home' | 'away' (falls back to the attacking side if unknown).
 * Returns { type:'corner'|'goalkick'|'throwin', forSide:'home'|'away' }.
 */
export function classifyRestart(outKind, lastTouch) {
  const other = (s) => (s === 'home' ? 'away' : 'home');
  if (outKind === 'touch-top' || outKind === 'touch-bottom') {
    return { type: 'throwin', forSide: other(lastTouch || 'home') };
  }
  // Behind a goal line with no goal. Defending side = the side whose line it is.
  const defense = outKind === 'goalLine-home' ? 'home' : 'away';
  if (!lastTouch || lastTouch === defense) {
    return { type: 'corner', forSide: other(defense) };
  }
  return { type: 'goalkick', forSide: defense };
}

/** Where the ball is placed for a restart. attackDir: +1 home attacks +x. */
export function restartSpot(type, forSide, outPos = { x: 0, z: 0 }) {
  const gl = PITCH.LENGTH / 2; const tl = PITCH.WIDTH / 2;
  const atk = forSide === 'home' ? 1 : -1;
  if (type === 'throwin') {
    return { x: Math.max(-gl + 1, Math.min(gl - 1, outPos.x)), z: Math.sign(outPos.z || 1) * tl };
  }
  if (type === 'corner') {
    // Attacking side shoots at the opponent's line, nearest corner.
    return { x: atk * (gl - 0.6), z: Math.sign(outPos.z || 1) * (tl - 0.6) };
  }
  // goalkick: edge of the goal area on the defending side's line
  return { x: -atk * (gl - 5.5), z: 0 };
}

export function createReferee({ homeId, awayId, duration }) {
  return {
    homeId, awayId, duration,
    clock: duration,
    score: { home: 0, away: 0 },
    scorers: [], // { name, side, minute }
    over: false,
  };
}

/** Tick the match clock; returns true exactly when time expires. */
export function tickClock(ref, dt) {
  if (ref.over) return false;
  ref.clock = Math.max(0, ref.clock - dt);
  if (ref.clock === 0) { ref.over = true; return true; }
  return false;
}

export function awardGoal(ref, side, scorerName) {
  ref.score[side] += 1;
  const minute = Math.max(1, Math.round(((ref.duration - ref.clock) / ref.duration) * 90));
  ref.scorers.push({ name: scorerName || 'Unknown', side, minute });
  return ref.score[side];
}

/**
 * Full-time winner. Goals first; if level, the side with more players left
 * alive wins (meteor survival); still level -> draw.
 * Returns { winner: 'home'|'away'|null, decidedBy: 'goals'|'survivors'|'draw' }.
 */
export function decideWinner(ref, homeAlive, awayAlive) {
  if (ref.score.home > ref.score.away) return { winner: 'home', decidedBy: 'goals' };
  if (ref.score.away > ref.score.home) return { winner: 'away', decidedBy: 'goals' };
  if (homeAlive > awayAlive) return { winner: 'home', decidedBy: 'survivors' };
  if (awayAlive > homeAlive) return { winner: 'away', decidedBy: 'survivors' };
  return { winner: null, decidedBy: 'draw' };
}
