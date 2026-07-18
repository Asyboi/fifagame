// Trader ledger: cash, share positions, and settlement.
//
// Everyone -- audience phones, statistical bots, LLM agents -- is a trader here.
// The market does not care which is which; only `kind` differs, and that is
// purely so the dashboard can style them differently.

export const STARTING_CASH = 100;

export function createLedger() {
  return { traders: new Map() };
}

export function addTrader(ledger, { id, name, kind = 'human', cash = STARTING_CASH }) {
  // startingCash is per-trader, not the global constant: bots are seeded with
  // more capital than humans, and measuring their P&L against the human figure
  // showed all forty of them up $50 before a ball was kicked.
  const trader = { id, name, kind, cash, startingCash: cash, yes: 0, no: 0, trades: 0 };
  ledger.traders.set(id, trader);
  return trader;
}

export function getTrader(ledger, id) {
  return ledger.traders.get(id);
}

// Credit a filled order to a trader. `fill` is what lmsr.buy returned.
//
// We debit fill.spent rather than the requested budget: the bisection lands a
// hair under, and that remainder belongs to the trader.
export function applyFill(trader, fill) {
  trader.cash -= fill.spent;
  if (fill.side === 'YES') trader.yes += fill.shares;
  else trader.no += fill.shares;
  trader.trades += 1;
  return trader;
}

// What a trader can afford right now. Callers must clamp bet size to this --
// nobody goes negative, there is no margin in a paper-money demo.
export function maxBet(trader) {
  return Math.max(0, trader.cash);
}

// Mark-to-market value: cash plus what the current price says the position is
// worth. This is what drives the live leaderboard mid-match.
export function equity(trader, priceYes) {
  return trader.cash + trader.yes * priceYes + trader.no * (1 - priceYes);
}

export function pnl(trader, priceYes) {
  return equity(trader, priceYes) - trader.startingCash;
}

// Final settlement: winning shares pay $1, losing shares pay nothing.
export function settle(ledger, outcome) {
  const winning = outcome === 'YES' ? 'yes' : 'no';
  for (const trader of ledger.traders.values()) {
    trader.cash += trader[winning];
    trader.yes = 0;
    trader.no = 0;
  }
}

// Leaderboard, richest first. `limit` keeps the projector readable -- top 10 is
// about what fits before the text gets too small for a room to read.
//
// `kinds` filters to particular trader types. The projector board deliberately
// excludes bots: they are seeded with more capital and there are forty of them,
// so they swept the entire top eight and hid both the audience and the AI
// agents -- the only two groups anyone in the room cares about.
export function leaderboard(ledger, priceYes, { kinds = null, limit = 10 } = {}) {
  return [...ledger.traders.values()]
    .filter((t) => (kinds ? kinds.includes(t.kind) : true))
    .map((t) => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      equity: equity(t, priceYes),
      pnl: pnl(t, priceYes),
      trades: t.trades,
    }))
    .sort((a, b) => b.equity - a.equity)
    .slice(0, limit);
}
