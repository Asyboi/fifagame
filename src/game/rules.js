// ── Pure match-rules logic (no three.js — fully unit-testable) ──
import { PITCH, MATCH } from '../config.js';

const HALF_L = PITCH.length / 2;
const HALF_W = PITCH.width / 2;

/**
 * Detect a goal. Teams attack along x: home attacks +x, away attacks -x.
 * @returns {'home'|'away'|null} scoring team
 */
export function checkGoal(ballPos) {
  const inMouth =
    Math.abs(ballPos.z) < PITCH.goalWidth / 2 && ballPos.y < PITCH.goalHeight;
  if (!inMouth) return null;
  if (ballPos.x > HALF_L) return 'home';   // home scores in +x goal
  if (ballPos.x < -HALF_L) return 'away';
  return null;
}

/**
 * Out-of-bounds detection.
 * @returns {null | {type:'throwIn'|'goalKick'|'corner', restart:{x,y,z}, side:'home'|'away'}}
 */
export function checkOut(ballPos, lastTouchTeam) {
  if (Math.abs(ballPos.z) > HALF_W) {
    return {
      type: 'throwIn',
      side: lastTouchTeam === 'home' ? 'away' : 'home',
      restart: {
        x: clamp(ballPos.x, -HALF_L + 2, HALF_L - 2),
        y: 0.11,
        z: Math.sign(ballPos.z) * (HALF_W - 0.5),
      },
    };
  }
  if (Math.abs(ballPos.x) > HALF_L && !checkGoal(ballPos)) {
    const overHomeGoalLine = ballPos.x < 0; // -x is home goal line
    const defendingTeam = overHomeGoalLine ? 'home' : 'away';
    const attackerTouched = lastTouchTeam !== defendingTeam;
    if (attackerTouched) {
      return {
        type: 'goalKick',
        side: defendingTeam,
        restart: { x: Math.sign(ballPos.x) * (HALF_L - 6), y: 0.11, z: 0 },
      };
    }
    return {
      type: 'corner',
      side: defendingTeam === 'home' ? 'away' : 'home',
      restart: {
        x: Math.sign(ballPos.x) * (HALF_L - 1),
        y: 0.11,
        z: Math.sign(ballPos.z || 1) * (HALF_W - 1),
      },
    };
  }
  return null;
}

/** Convert elapsed real seconds into a simulated match clock string. */
export function matchClock(elapsed, half) {
  const perHalf = MATCH.halfLengthSeconds;
  const simMin = MATCH.simMinutesPerHalf;
  const t = Math.min(elapsed, perHalf);
  const minutes = Math.floor((t / perHalf) * simMin) + (half === 2 ? simMin : 0);
  const seconds = Math.floor(((t / perHalf) * simMin * 60) % 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** True when the current half has fully elapsed. */
export function isHalfOver(elapsed) {
  return elapsed >= MATCH.halfLengthSeconds;
}

/** Score keeping helper. */
export function createScore() {
  return { home: 0, away: 0 };
}

export function addGoal(score, side) {
  return { ...score, [side]: score[side] + 1 };
}

export function resultText(score, homeName, awayName) {
  if (score.home > score.away) return `${homeName} WIN`;
  if (score.away > score.home) return `${awayName} WIN`;
  return 'DRAW';
}

/** Kickoff placement: ball dead centre, kicking team gets possession. */
export function kickoffState(kickingSide) {
  return { ball: { x: 0, y: 0.11, z: 0 }, possession: kickingSide };
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Keep a point inside the field of play (small margin). */
export function clampToPitch(p, margin = 0.5) {
  return {
    x: clamp(p.x, -HALF_L + margin, HALF_L - margin),
    z: clamp(p.z, -HALF_W + margin, HALF_W - margin),
  };
}
