// Fair-value model: match state -> probability Argentina wins.
//
// This is what the bot swarm trades toward, and what the LLM agents are shown as
// a reference. It does not need to be a good football model. It needs two
// properties, both of which are about how the demo reads on a projector:
//
//   1. A goal moves it hard and immediately.
//   2. It converges toward certainty as the clock runs out, so the line walks to
//      0 or 100 by the whistle instead of hanging at 60¢ and settling abruptly.
//
// Anything past that is invisible to an audience watching for three minutes.

// Expected goals per team across a full match. Poisson-ish intuition: with ~1.3
// goals left to play, a one-goal lead is meaningful but not safe; with 0.1 left,
// it is decisive.
const GOALS_PER_MATCH = 1.3;

// How much shot pressure is allowed to move the line. Deliberately small -- it
// adds life between goals without letting a flurry of shots outweigh an actual
// goal, which would look broken.
const PRESSURE_WEIGHT = 0.35;

const clamp01 = (x) => Math.min(Math.max(x, 0.001), 0.999);

/**
 * @param {object} state
 * @param {number} state.argScore
 * @param {number} state.espScore
 * @param {number} state.minute        elapsed match minutes (0..90)
 * @param {number} [state.argPossession] 0..1, defaults to even
 * @param {number} [state.argShots]    shots on target so far
 * @param {number} [state.espShots]
 * @returns {number} probability Argentina wins, in (0, 1)
 */
export function fairValue({
  argScore = 0,
  espScore = 0,
  minute = 0,
  argPossession = 0.5,
  argShots = 0,
  espShots = 0,
} = {}) {
  const timeLeft = Math.max(0, 1 - minute / 90);
  const lead = argScore - espScore;

  // Territorial pressure skews each side's scoring rate. Bounded so a shot
  // flurry can never outweigh an actual goal, which would look broken.
  const shotEdge = (argShots - espShots) * 0.12;
  const possessionEdge = (argPossession - 0.5) * 2;
  const skew = clampAbs((shotEdge + possessionEdge) * PRESSURE_WEIGHT, 0.6);

  // Goals each side is still expected to score. Both shrink toward zero as the
  // clock runs out, which is what makes the line converge on its own.
  const lambdaArg = GOALS_PER_MATCH * timeLeft * (1 + skew);
  const lambdaEsp = GOALS_PER_MATCH * timeLeft * (1 - skew);

  // Argentina wins if the remaining goals leave them ahead. Summing the joint
  // Poisson distribution handles the draw correctly for free: a level match with
  // no time left has essentially no winning paths, so the price decays toward
  // zero rather than hanging at even money and snapping at the whistle.
  let pWin = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    const pArg = poisson(i, lambdaArg);
    for (let j = 0; j <= MAX_GOALS; j++) {
      if (lead + i - j > 0) pWin += pArg * poisson(j, lambdaEsp);
    }
  }

  return clamp01(pWin);
}

// Remaining goals per side never realistically exceeds this, and the Poisson
// tail past it is worth far less than a cent.
const MAX_GOALS = 8;

function poisson(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * lambda ** k) / factorial(k);
}

const FACTORIALS = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];
const factorial = (k) => FACTORIALS[k];

const clampAbs = (x, max) => Math.min(Math.max(x, -max), max);

// Convenience for the settlement path: at the final whistle the answer is no
// longer probabilistic.
export function finalOutcome(argScore, espScore) {
  return argScore > espScore ? 'YES' : 'NO';
}
