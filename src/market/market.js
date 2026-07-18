// ── FableMarket: wallet, markets, positions, resolution ─────────
// Polymarket-style binary shares: buy YES/NO at the quoted price,
// winning shares pay out 1.00 FC each. Prices track the live model.
import { computeProbs, positionGoalShare } from './model.js';

const WALLET_KEY = 'fablecup.wallet';
const START_BALANCE = 1000;
const HISTORY_LEN = 90;

let nextPosId = 1;

export class MarketHub {
  constructor() {
    this.balance = this._loadBalance();
    this.markets = [];
    this.positions = [];
    this.activity = [];
    this._listeners = new Set();
    this._nextGoalSeq = 0;
    this._info = null;
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit() {
    this._saveBalance();
    for (const fn of this._listeners) fn(this);
  }

  _loadBalance() {
    try {
      const v = parseFloat(localStorage.getItem(WALLET_KEY));
      return Number.isFinite(v) ? v : START_BALANCE;
    } catch {
      return START_BALANCE;
    }
  }

  _saveBalance() {
    try {
      localStorage.setItem(WALLET_KEY, String(this.balance));
    } catch { /* session only */ }
  }

  /** Free top-up when broke. */
  faucet() {
    if (this.balance >= 10) return false;
    this.balance += 500;
    this._log('Faucet: +500 FC. Bet responsibly, champ.');
    this._emit();
    return true;
  }

  // ── lifecycle ─────────────────────────────────────────────────
  startMatch(info) {
    // info: { homeName, homeShort, awayName, awayShort, userName, userRole, difficulty }
    this.voidOpenMarkets('New match — open bets refunded');
    this._info = info;
    this.markets = [];
    this._nextGoalSeq = 0;
    this._userScored = false;

    this._addMarket('winner', `Who wins ${info.homeName} vs ${info.awayName}?`, [
      { id: 'home', label: info.homeName },
      { id: 'draw', label: 'Draw' },
      { id: 'away', label: info.awayName },
    ]);
    this._spawnNextGoalMarket();
    this._addMarket('userscore', `${info.userName} to score anytime?`, [
      { id: 'yes', label: `${info.userName} scores` },
    ]);
    this._addMarket('over25', 'Over 2.5 total goals?', [
      { id: 'yes', label: 'Over 2.5 goals' },
    ]);
    this._emit();
  }

  _addMarket(id, question, outcomes) {
    this.markets.push({
      id,
      question,
      status: 'open',
      outcomes: outcomes.map((o) => ({ ...o, price: 0.5, prev: 0.5, history: [] })),
    });
  }

  _spawnNextGoalMarket() {
    this._nextGoalSeq += 1;
    const n = this._nextGoalSeq;
    const suffix = n === 1 ? 'First goal' : `Goal #${n}`;
    this._addMarket(`nextgoal-${n}`, `${suffix}: which team scores next?`, [
      { id: 'home', label: this._info.homeShort },
      { id: 'away', label: this._info.awayShort },
    ]);
  }

  get _openNextGoal() {
    return this.markets.find((m) => m.id === `nextgoal-${this._nextGoalSeq}` && m.status === 'open');
  }

  // ── live pricing ──────────────────────────────────────────────
  /** live: { scoreHome, scoreAway, tFrac, ballTilt, possession } */
  tick(live) {
    if (!this._info) return;
    const probs = computeProbs({
      ...live,
      difficulty: this._info.difficulty,
      userScored: this._userScored,
      userShare: positionGoalShare(this._info.userRole),
    });
    const map = {
      winner: { home: probs.home, draw: probs.draw, away: probs.away },
      [`nextgoal-${this._nextGoalSeq}`]: { home: probs.nextGoalHome, away: probs.nextGoalAway },
      userscore: { yes: probs.userScores },
      over25: { yes: probs.over25 },
    };
    for (const m of this.markets) {
      if (m.status !== 'open' || !map[m.id]) continue;
      for (const o of m.outcomes) {
        if (map[m.id][o.id] == null) continue;
        o.prev = o.price;
        o.price = map[m.id][o.id];
        o.history.push(o.price);
        if (o.history.length > HISTORY_LEN) o.history.shift();
      }
    }
    this._emit();
  }

  // ── trading ───────────────────────────────────────────────────
  /** Buy `amount` FC of YES or NO shares. Returns position or error string. */
  buy(marketId, outcomeId, side, amount) {
    const m = this.markets.find((x) => x.id === marketId);
    if (!m || m.status !== 'open') return 'Market closed';
    const o = m.outcomes.find((x) => x.id === outcomeId);
    if (!o) return 'Unknown outcome';
    amount = Math.floor(amount);
    if (!(amount > 0)) return 'Enter an amount';
    if (amount > this.balance) return 'Insufficient balance';
    const price = side === 'yes' ? o.price : 1 - o.price;
    const shares = amount / price;
    this.balance -= amount;
    const pos = {
      id: nextPosId++,
      marketId, outcomeId, side,
      shares, cost: amount,
      label: `${o.label} — ${side.toUpperCase()}`,
      question: m.question,
      status: 'open',
    };
    this.positions.push(pos);
    this._log(`Bought ${shares.toFixed(1)} ${side.toUpperCase()} "${o.label}" @ ${cents(price)}`);
    this._emit();
    return pos;
  }

  /** Current value of an open position at market price. */
  positionValue(pos) {
    const m = this.markets.find((x) => x.id === pos.marketId);
    if (!m) return 0;
    const o = m.outcomes.find((x) => x.id === pos.outcomeId);
    const price = pos.side === 'yes' ? o.price : 1 - o.price;
    return pos.shares * price;
  }

  /** Sell an open position back at the current price. */
  cashOut(posId) {
    const pos = this.positions.find((p) => p.id === posId && p.status === 'open');
    if (!pos) return false;
    const m = this.markets.find((x) => x.id === pos.marketId);
    if (!m || m.status !== 'open') return false;
    const value = this.positionValue(pos);
    this.balance += value;
    pos.status = 'cashed';
    pos.payout = value;
    this._log(`Cashed out "${pos.label}" for ${value.toFixed(0)} FC`);
    this._emit();
    return true;
  }

  // ── resolution ────────────────────────────────────────────────
  _resolveMarket(market, winners) {
    if (market.status !== 'open') return;
    market.status = 'resolved';
    market.winners = winners; // outcomeId[] whose YES pays out
    for (const o of market.outcomes) {
      o.prev = o.price;
      o.price = winners.includes(o.id) ? 1 : 0;
    }
    for (const pos of this.positions) {
      if (pos.marketId !== market.id || pos.status !== 'open') continue;
      const yesWon = winners.includes(pos.outcomeId);
      const won = pos.side === 'yes' ? yesWon : !yesWon;
      pos.status = won ? 'won' : 'lost';
      pos.payout = won ? pos.shares : 0;
      if (won) this.balance += pos.shares;
      this._log(
        won
          ? `WON "${pos.label}" — paid ${pos.shares.toFixed(0)} FC`
          : `Lost "${pos.label}" (-${pos.cost} FC)`
      );
    }
    this._emit();
  }

  /** A goal was scored. */
  onGoal(side, byUser = false) {
    const ng = this._openNextGoal;
    if (ng) this._resolveMarket(ng, [side]);
    if (byUser && !this._userScored) {
      this._userScored = true;
      const us = this.markets.find((m) => m.id === 'userscore');
      if (us) this._resolveMarket(us, ['yes']);
    }
    this._spawnNextGoalMarket();
    this._emit();
  }

  /** Total goals hit 3+: over 2.5 resolves early. */
  onTotalGoals(total) {
    if (total >= 3) {
      const m = this.markets.find((x) => x.id === 'over25');
      if (m && m.status === 'open') this._resolveMarket(m, ['yes']);
    }
  }

  onFullTime(score) {
    const winner = score.home > score.away ? 'home' : score.away > score.home ? 'away' : 'draw';
    const w = this.markets.find((m) => m.id === 'winner');
    if (w) this._resolveMarket(w, [winner]);
    const over = this.markets.find((m) => m.id === 'over25');
    if (over && over.status === 'open') {
      this._resolveMarket(over, score.home + score.away >= 3 ? ['yes'] : []);
    }
    const us = this.markets.find((m) => m.id === 'userscore');
    if (us && us.status === 'open') this._resolveMarket(us, []);
    const ng = this._openNextGoal;
    if (ng) this._resolveMarket(ng, []); // no more goals: both NO pay out
  }

  /** Refund open positions (rematch / abandoned match). */
  voidOpenMarkets(reason) {
    let refunded = 0;
    for (const pos of this.positions) {
      if (pos.status !== 'open') continue;
      pos.status = 'void';
      pos.payout = pos.cost;
      this.balance += pos.cost;
      refunded += pos.cost;
    }
    for (const m of this.markets) {
      if (m.status === 'open') m.status = 'void';
    }
    if (refunded > 0) this._log(`${reason}: refunded ${refunded} FC`);
  }

  _log(text) {
    this.activity.unshift({ text, at: Date.now() });
    if (this.activity.length > 30) this.activity.pop();
  }
}

export function cents(price) {
  return `${Math.round(price * 100)}\u00A2`;
}
