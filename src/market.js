// Prediction-market event feed — FIRE AND FORGET.
// Contract with the market service (separate app, lives in market/):
//   POST {url}/event  { type:'goal', team:'ARG'|'ESP', minute }
//                     { type:'shot', team:'ARG'|'ESP', onTarget, minute }
//                     { type:'possession', arg:0..1, minute }   ~every 10s
//                     { type:'tick', minute }                   ~every 5s
//                     { type:'final', argScore, espScore }
// Rules from the market owner: never await, never handle errors, and if the
// server is down the game must not stutter for a frame. So every call is
// wrapped, sync-safe, and .catch(()=>{})'d.
//
// The market is an ARG-vs-ESP market, so the feed only activates for that
// matchup (any other pairing just no-ops — the market's own simulation runs).
// `minute` is scaled from match elapsed to a 90-minute football clock.

const TICK_EVERY = 5;
const POSS_EVERY = 10;

export function createMarketFeed({ url, homeCode, awayCode, durationSec }) {
  const codes = [homeCode, awayCode];
  const enabled = Boolean(url) && codes.includes('ARG') && codes.includes('ESP');
  const minuteOf = (elapsed) =>
    Math.max(0, Math.min(90, Math.floor((elapsed / Math.max(1, durationSec)) * 90)));

  let lastTick = -Infinity;
  let lastPoss = -Infinity;

  function emit(payload) {
    if (!enabled) return;
    try {
      fetch(url + '/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch { /* never let the market touch the frame loop */ }
  }

  const codeOf = (side) => (side === 'home' ? homeCode : awayCode);

  return {
    enabled,

    /** Call every frame during live play. Self-throttles tick + possession. */
    update(elapsedSec, homeShare) {
      if (!enabled) return;
      if (elapsedSec - lastTick >= TICK_EVERY) {
        lastTick = elapsedSec;
        emit({ type: 'tick', minute: minuteOf(elapsedSec) });
      }
      if (elapsedSec - lastPoss >= POSS_EVERY) {
        lastPoss = elapsedSec;
        const argShare = homeCode === 'ARG' ? homeShare : 1 - homeShare;
        emit({ type: 'possession', arg: Math.round(argShare * 100) / 100, minute: minuteOf(elapsedSec) });
      }
    },

    goal(side, elapsedSec) {
      emit({ type: 'goal', team: codeOf(side), minute: minuteOf(elapsedSec) });
    },

    shot(side, onTarget, elapsedSec) {
      emit({ type: 'shot', team: codeOf(side), onTarget: Boolean(onTarget), minute: minuteOf(elapsedSec) });
    },

    final(homeScore, awayScore) {
      const argScore = homeCode === 'ARG' ? homeScore : awayScore;
      const espScore = homeCode === 'ESP' ? homeScore : awayScore;
      emit({ type: 'final', argScore, espScore });
    },
  };
}
