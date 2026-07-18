// The match market: one binary market ("Argentina wins?") plus the match state
// that drives it. Single instance, in memory, one match. No persistence -- a
// three-minute demo does not need durability, and a database at 2am is how
// hackathons die.

import { createBook, buy, priceYes, YES, NO } from './lmsr.js';
import {
  createLedger,
  addTrader,
  getTrader,
  applyFill,
  maxBet,
  settle,
  leaderboard,
  STARTING_CASH,
} from './traders.js';
import { fairValue, finalOutcome } from './fairValue.js';

const FEED_LIMIT = 40;
const HISTORY_LIMIT = 600;

export function createMatchMarket({ b = 120 } = {}) {
  return {
    book: createBook(b),
    ledger: createLedger(),
    match: {
      argScore: 0,
      espScore: 0,
      minute: 0,
      argShots: 0,
      espShots: 0,
      argPossession: 0.5,
      status: 'pending', // pending | live | settled
      outcome: null,
    },
    history: [], // price line for the dashboard chart
    feed: [], // newest first: trades, goals, agent chatter
    seq: 0,
  };
}

export function join(market, { id, name, kind = 'human' }) {
  const existing = getTrader(market.ledger, id);
  if (existing) return existing;
  return addTrader(market.ledger, { id, name, kind });
}

// Side is expressed as a team from the UI's point of view; the book only knows
// YES/NO. Argentina winning is YES, anything else (Spain, or a draw) is NO.
export function sideForTeam(team) {
  return team === 'ARG' ? YES : NO;
}

/**
 * Place a bet. Budget is clamped to the trader's cash -- no margin, nobody goes
 * negative. Returns null if the trader cannot or should not trade right now,
 * rather than throwing: bots fire constantly and a broke bot is not an error.
 */
export function placeBet(market, { traderId, team, budget }) {
  if (market.match.status === 'settled') return null;

  const trader = getTrader(market.ledger, traderId);
  if (!trader) return null;

  const amount = Math.min(budget, maxBet(trader));
  if (amount < 0.01) return null;

  const fill = buy(market.book, sideForTeam(team), amount);
  if (fill.shares <= 0) return null;

  applyFill(trader, fill);
  market.seq += 1;

  pushFeed(market, {
    type: 'trade',
    trader: trader.name,
    kind: trader.kind,
    team,
    spent: fill.spent,
    shares: fill.shares,
    price: fill.avgPrice,
  });
  recordPrice(market);

  return fill;
}

// Events arrive from either the real game or the match simulator. Both emit the
// same shapes, which is what lets the demo run with or without the game.
export function applyEvent(market, event) {
  const m = market.match;
  if (m.status === 'settled') return;
  if (m.status === 'pending' && event.type !== 'final') m.status = 'live';

  if (typeof event.minute === 'number') {
    m.minute = Math.max(m.minute, event.minute);
  }

  switch (event.type) {
    case 'goal':
      if (event.team === 'ARG') m.argScore += 1;
      else m.espScore += 1;
      pushFeed(market, { type: 'goal', team: event.team, minute: m.minute });
      break;

    case 'shot':
      if (event.onTarget) {
        if (event.team === 'ARG') m.argShots += 1;
        else m.espShots += 1;
      }
      break;

    case 'possession':
      if (typeof event.arg === 'number') m.argPossession = event.arg;
      break;

    case 'tick':
      break;

    case 'final':
      // Trust the game's scoreline over our own tally if they disagree; the game
      // is authoritative and a dropped event must not mis-settle real bets.
      if (typeof event.argScore === 'number') m.argScore = event.argScore;
      if (typeof event.espScore === 'number') m.espScore = event.espScore;
      m.minute = 90;
      m.status = 'settled';
      m.outcome = finalOutcome(m.argScore, m.espScore);
      settle(market.ledger, m.outcome);
      pushFeed(market, {
        type: 'final',
        argScore: m.argScore,
        espScore: m.espScore,
        outcome: m.outcome,
      });
      break;
  }

  market.seq += 1;
  recordPrice(market);
}

export function currentFair(market) {
  return fairValue(market.match);
}

export function currentPrice(market) {
  return priceYes(market.book);
}

function recordPrice(market) {
  market.history.push({
    minute: market.match.minute,
    price: currentPrice(market),
    fair: currentFair(market),
  });
  if (market.history.length > HISTORY_LIMIT) market.history.shift();
}

export function pushFeed(market, entry) {
  market.feed.unshift({ ...entry, at: Date.now() });
  if (market.feed.length > FEED_LIMIT) market.feed.pop();
}

// What every connected client renders from. Kept small enough to push on every
// tick without thinking about it.
export function snapshot(market) {
  const price = currentPrice(market);
  return {
    seq: market.seq,
    match: market.match,
    price,
    fair: currentFair(market),
    history: market.history.slice(-120),
    feed: market.feed.slice(0, 12),
    leaders: leaderboard(market.ledger, price, { limit: 8 }),
    humans: leaderboard(market.ledger, price, { kind: 'human', limit: 5 }),
    traderCount: market.ledger.traders.size,
  };
}

// A trader's own view, sent to their phone alongside the shared snapshot.
export function traderView(market, traderId) {
  const trader = getTrader(market.ledger, traderId);
  if (!trader) return null;
  const price = currentPrice(market);
  return {
    id: trader.id,
    name: trader.name,
    cash: trader.cash,
    yes: trader.yes,
    no: trader.no,
    trades: trader.trades,
    equity: trader.cash + trader.yes * price + trader.no * (1 - price),
    startingCash: STARTING_CASH,
  };
}

export { YES, NO };
