import { describe, it, expect } from 'vitest';
import {
  checkGoal, checkOut, matchClock, isHalfOver,
  createScore, addGoal, resultText, kickoffState, clamp, clampToPitch,
} from '../src/game/rules.js';
import { PITCH, MATCH, generateName, makeRng, hashString, FORMATION } from '../src/config.js';

const HALF_L = PITCH.length / 2;
const HALF_W = PITCH.width / 2;

describe('checkGoal', () => {
  it('detects a home goal in the +x net', () => {
    expect(checkGoal({ x: HALF_L + 0.5, y: 1, z: 0 })).toBe('home');
  });
  it('detects an away goal in the -x net', () => {
    expect(checkGoal({ x: -HALF_L - 0.5, y: 1, z: 2 })).toBe('away');
  });
  it('rejects a shot over the bar', () => {
    expect(checkGoal({ x: HALF_L + 0.5, y: PITCH.goalHeight + 0.2, z: 0 })).toBeNull();
  });
  it('rejects a shot wide of the post', () => {
    expect(checkGoal({ x: HALF_L + 0.5, y: 1, z: PITCH.goalWidth / 2 + 0.5 })).toBeNull();
  });
  it('rejects a ball in open play', () => {
    expect(checkGoal({ x: 0, y: 0.11, z: 0 })).toBeNull();
  });
});

describe('checkOut', () => {
  it('awards a throw-in to the other team on the sideline', () => {
    const out = checkOut({ x: 10, y: 0.11, z: HALF_W + 1 }, 'home');
    expect(out.type).toBe('throwIn');
    expect(out.side).toBe('away');
    expect(Math.abs(out.restart.z)).toBeLessThan(HALF_W);
  });
  it('awards a goal kick when the attacker puts it over the goal line', () => {
    const out = checkOut({ x: HALF_L + 1, y: 0.11, z: 20 }, 'home');
    expect(out.type).toBe('goalKick');
    expect(out.side).toBe('away');
  });
  it('awards a corner when the defender puts it over their own line', () => {
    const out = checkOut({ x: HALF_L + 1, y: 0.11, z: 20 }, 'away');
    expect(out.type).toBe('corner');
    expect(out.side).toBe('home');
  });
  it('returns null while the ball is in play', () => {
    expect(checkOut({ x: 0, y: 0.11, z: 0 }, 'home')).toBeNull();
  });
  it('returns null for a ball inside the goal (goal takes precedence)', () => {
    expect(checkOut({ x: HALF_L + 0.5, y: 1, z: 0 }, 'home')).toBeNull();
  });
});

describe('matchClock', () => {
  it('starts at 00:00', () => {
    expect(matchClock(0, 1)).toBe('00:00');
  });
  it('reaches 45 simulated minutes at the end of half one', () => {
    expect(matchClock(MATCH.halfLengthSeconds, 1)).toBe('45:00');
  });
  it('starts the second half at 45 minutes', () => {
    expect(matchClock(0, 2)).toBe('45:00');
  });
  it('reaches 90 at full time', () => {
    expect(matchClock(MATCH.halfLengthSeconds, 2)).toBe('90:00');
  });
});

describe('half / score bookkeeping', () => {
  it('flags the half as over exactly at the limit', () => {
    expect(isHalfOver(MATCH.halfLengthSeconds - 0.01)).toBe(false);
    expect(isHalfOver(MATCH.halfLengthSeconds)).toBe(true);
  });
  it('adds goals immutably', () => {
    const s0 = createScore();
    const s1 = addGoal(s0, 'home');
    const s2 = addGoal(s1, 'away');
    expect(s0).toEqual({ home: 0, away: 0 });
    expect(s2).toEqual({ home: 1, away: 1 });
  });
  it('names the winner', () => {
    expect(resultText({ home: 2, away: 1 }, 'Albion', 'Iberis')).toBe('Albion WIN');
    expect(resultText({ home: 0, away: 3 }, 'Albion', 'Iberis')).toBe('Iberis WIN');
    expect(resultText({ home: 1, away: 1 }, 'Albion', 'Iberis')).toBe('DRAW');
  });
});

describe('kickoff & clamps', () => {
  it('places the ball at centre for kickoff', () => {
    const k = kickoffState('away');
    expect(k.ball).toEqual({ x: 0, y: 0.11, z: 0 });
    expect(k.possession).toBe('away');
  });
  it('clamps values', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
  });
  it('keeps points on the pitch', () => {
    const p = clampToPitch({ x: 999, z: -999 });
    expect(p.x).toBeLessThanOrEqual(HALF_L);
    expect(p.z).toBeGreaterThanOrEqual(-HALF_W);
  });
});

describe('squad generation helpers', () => {
  it('produces deterministic names per seed', () => {
    const a = generateName(makeRng(42));
    const b = generateName(makeRng(42));
    expect(a).toBe(b);
  });
  it('hashes team ids consistently', () => {
    expect(hashString('albion')).toBe(hashString('albion'));
    expect(hashString('albion')).not.toBe(hashString('iberis'));
  });
  it('fields exactly eleven players with one goalkeeper', () => {
    expect(FORMATION.length).toBe(11);
    expect(FORMATION.filter((s) => s.role === 'GK').length).toBe(1);
  });
});
