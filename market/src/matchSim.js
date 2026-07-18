// Simulated Argentina vs Spain, emitting exactly the events the real game emits.
//
// This is the demo's safety net and its primary development target: everything
// downstream is built and rehearsed against this, so whether Kimi's game is
// wired up on the day changes nothing about whether the market works.

const MATCH_MINUTES = 90;

// Per-minute scoring chance per side. Tuned upward from real football -- a
// genuine 90 minutes often has one goal or none, and a scoreless demo is a
// wasted demo. We want two to four goals in three minutes.
const GOAL_RATE = 0.022;
const SHOT_RATE = 0.09;

/**
 * Drives a match in compressed real time, calling `emit` with game events.
 *
 * @param {(event: object) => void} emit
 * @param {object} [opts]
 * @param {number} [opts.durationMs]  real time for the whole match
 * @param {number} [opts.tickMs]      how often the clock advances
 * @param {() => number} [opts.random] injectable for deterministic rehearsal
 * @returns {{ stop: () => void }}
 */
export function startMatchSim(emit, {
  durationMs = 3 * 60 * 1000,
  tickMs = 250,
  random = Math.random,
} = {}) {
  const minutesPerTick = MATCH_MINUTES / (durationMs / tickMs);
  let minute = 0;
  let argScore = 0;
  let espScore = 0;

  // Momentum wanders so possession and shot pressure trend in streaks rather
  // than flickering. Streaks are what make the agents' commentary look like it
  // is reading the game.
  let momentum = 0;

  const timer = setInterval(() => {
    minute = Math.min(MATCH_MINUTES, minute + minutesPerTick);

    momentum = clamp(momentum + (random() - 0.5) * 0.18, -1, 1);
    const argEdge = 0.5 + momentum * 0.18;

    const goalChance = GOAL_RATE * minutesPerTick;
    const shotChance = SHOT_RATE * minutesPerTick;

    if (random() < goalChance) {
      const team = random() < argEdge ? 'ARG' : 'ESP';
      if (team === 'ARG') argScore += 1;
      else espScore += 1;
      emit({ type: 'goal', team, minute: Math.round(minute) });
      // A goal swings the run of play toward the team that scored.
      momentum = clamp(momentum + (team === 'ARG' ? 0.35 : -0.35), -1, 1);
    } else if (random() < shotChance) {
      emit({
        type: 'shot',
        team: random() < argEdge ? 'ARG' : 'ESP',
        onTarget: random() < 0.45,
        minute: Math.round(minute),
      });
    }

    emit({ type: 'possession', arg: round2(argEdge), minute: Math.round(minute) });
    emit({ type: 'tick', minute: Math.round(minute) });

    if (minute >= MATCH_MINUTES) {
      clearInterval(timer);
      emit({ type: 'final', argScore, espScore });
    }
  }, tickMs);

  return { stop: () => clearInterval(timer) };
}

const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
const round2 = (x) => Math.round(x * 100) / 100;
