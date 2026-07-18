// ── Prediction-market probability model (pure, unit-testable) ───
// A lightweight Poisson goal model turns live match state into
// outcome probabilities, which the market quotes as prices.

const MAX_GOALS = 8; // truncation for Poisson sums

/** Expected goals for a full match per team, given AI difficulty. */
export function teamRates(difficulty) {
  const away = { easy: 0.9, normal: 1.25, hard: 1.65 }[difficulty] ?? 1.25;
  return { home: 1.45, away };
}

export function poissonPmf(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

/**
 * Live state → probabilities for every market.
 * state: {
 *   scoreHome, scoreAway,
 *   tFrac,        // 0..1 fraction of total match played
 *   ballTilt,     // -1..1, +1 = ball deep in AWAY half (home attacking)
 *   possession,   // 'home' | 'away'
 *   difficulty,
 *   userScored,   // has the user already scored?
 *   userShare,    // user's expected share of home goals (by position)
 * }
 */
export function computeProbs(state) {
  const {
    scoreHome, scoreAway, tFrac, ballTilt = 0, possession = 'home',
    difficulty = 'normal', userScored = false, userShare = 0.25,
  } = state;

  const rates = teamRates(difficulty);
  const remain = Math.max(0, 1 - tFrac);
  // momentum: territory + possession gently tilt remaining expectation
  const tilt = clamp01(0.5 + ballTilt * 0.18 + (possession === 'home' ? 0.06 : -0.06));
  const lamH = rates.home * remain * (0.7 + 0.6 * tilt);
  const lamA = rates.away * remain * (0.7 + 0.6 * (1 - tilt));

  // match result: sum over remaining-goal combinations
  let pHome = 0, pDraw = 0, pAway = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    const pi = poissonPmf(i, lamH);
    for (let j = 0; j <= MAX_GOALS; j++) {
      const pj = poissonPmf(j, lamA);
      const diff = scoreHome + i - (scoreAway + j);
      if (diff > 0) pHome += pi * pj;
      else if (diff < 0) pAway += pi * pj;
      else pDraw += pi * pj;
    }
  }
  const norm = pHome + pDraw + pAway || 1;
  pHome /= norm; pDraw /= norm; pAway /= norm;

  // next goal: relative rate, scaled by chance any goal comes at all
  const pAnyGoal = 1 - Math.exp(-(lamH + lamA));
  const totalRate = lamH + lamA || 1;
  const pNextHome = pAnyGoal * (lamH / totalRate);
  const pNextAway = pAnyGoal * (lamA / totalRate);

  // over 2.5 total goals
  const current = scoreHome + scoreAway;
  let pUnder = 0;
  const need = Math.max(0, 3 - current); // future goals that would break the under
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      if (i + j < need) pUnder += poissonPmf(i, lamH) * poissonPmf(j, lamA);
    }
  }
  const pOver = current >= 3 ? 1 : clamp01(1 - pUnder);

  // user to score (anytime)
  const pUser = userScored ? 1 : clamp01(1 - Math.exp(-lamH * userShare));

  return {
    home: quote(pHome),
    draw: quote(pDraw),
    away: quote(pAway),
    nextGoalHome: quote(pNextHome),
    nextGoalAway: quote(pNextAway),
    over25: current >= 3 ? 1 : quote(pOver),
    userScores: userScored ? 1 : quote(pUser),
  };
}

/** Expected goal share of the team's total, by playing position. */
export function positionGoalShare(role) {
  return {
    ST: 0.34, LW: 0.22, RW: 0.22, CM: 0.13, CDM: 0.07,
    LB: 0.05, RB: 0.05, CB: 0.05,
  }[role] ?? 0.15;
}

/** Clamp a probability into a tradeable price band (1c..99c). */
export function quote(p) {
  return Math.round(clamp(p, 0.01, 0.99) * 100) / 100;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
function clamp01(v) {
  return clamp(v, 0, 1);
}
