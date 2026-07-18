// The statistical bot swarm.
//
// These are not the AI agents -- they are cheap liquidity. Their job is to keep
// the tape moving so the price ticks continuously (a frozen ticker reads as a
// broken demo) and to absorb audience bets so a single $25 wager does not throw
// the line 30 cents.
//
// Each bot trades toward fair value with its own noisy estimate of it, so they
// disagree with each other and with the market, which is what produces
// believable price action rather than a straight line.

import { placeBet } from './market.js';
import { join } from './market.js';

const BOT_COUNT = 40;
// Close enough to a human's $100 that the shared leaderboard reads as a fair
// fight, high enough that forty of them can absorb audience bets without the
// line lurching on a single $25 wager.
const BOT_CASH = 150;

const FIRST_NAMES = [
  'Nico', 'Vale', 'Dario', 'Iker', 'Paula', 'Tomas', 'Rocio', 'Bruno',
  'Elena', 'Mateo', 'Sofia', 'Diego', 'Lucia', 'Pablo', 'Ines', 'Javi',
];

export function spawnBots(market, { count = BOT_COUNT, random = Math.random } = {}) {
  const bots = [];
  for (let i = 0; i < count; i++) {
    const name = `${FIRST_NAMES[i % FIRST_NAMES.length]}${i}`;
    join(market, { id: `bot:${i}`, name, kind: 'bot' });
    market.ledger.traders.get(`bot:${i}`).cash = BOT_CASH;

    bots.push({
      id: `bot:${i}`,
      // How wrong this bot is about fair value, persistently, in log-odds.
      // Spread of opinion keeps the price from snapping straight to fair.
      //
      // Log-odds rather than a flat probability offset: a flat offset means an
      // optimistic bot still thinks a hopeless team is worth its bias, so it
      // keeps buying and the price floors there instead of decaying to zero.
      // In log-odds the same bias vanishes as the outcome becomes certain.
      bias: (random() - 0.5) * 1.1,
      // How much mispricing it needs before acting.
      threshold: 0.02 + random() * 0.06,
      // Bet size as a fraction of the edge it thinks it sees.
      aggression: 0.3 + random() * 1.2,
      // Not every bot is watching every tick.
      alertness: 0.15 + random() * 0.5,
    });
  }
  return bots;
}

/**
 * One trading round across the swarm. Called on a timer by the server.
 * Deliberately synchronous and allocation-light -- this runs several times a
 * second for the whole match.
 */
export function runBotRound(market, bots, { fair, price, random = Math.random } = {}) {
  const fills = [];

  for (const bot of bots) {
    if (random() > bot.alertness) continue;

    const believedFair = sigmoid(logit(fair) + bot.bias + (random() - 0.5) * 0.3);
    const edge = believedFair - price;
    if (Math.abs(edge) < bot.threshold) continue;

    // Buy the side the bot thinks is cheap: Argentina when it reads the market
    // as underpricing them, Spain when it reads the opposite.
    const team = edge > 0 ? 'ARG' : 'ESP';
    const budget = Math.abs(edge) * 100 * bot.aggression;

    const fill = placeBet(market, { traderId: bot.id, team, budget });
    if (fill) fills.push(fill);
  }

  return fills;
}

const clamp01 = (x) => Math.min(Math.max(x, 0.001), 0.999);
const logit = (p) => Math.log(clamp01(p) / (1 - clamp01(p)));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
