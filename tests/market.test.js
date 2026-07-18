import { describe, it, expect, beforeEach } from 'vitest';
import { computeProbs, poissonPmf, positionGoalShare, quote, teamRates } from '../src/market/model.js';
import { MarketHub } from '../src/market/market.js';

const base = {
  scoreHome: 0, scoreAway: 0, tFrac: 0, ballTilt: 0,
  possession: 'home', difficulty: 'normal', userScored: false, userShare: 0.3,
};

describe('probability model', () => {
  it('poisson pmf behaves', () => {
    expect(poissonPmf(0, 0)).toBe(1);
    expect(poissonPmf(2, 0)).toBe(0);
    const sum = [...Array(20).keys()].reduce((s, k) => s + poissonPmf(k, 1.5), 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('match-winner probs roughly sum to 1', () => {
    const p = computeProbs(base);
    expect(p.home + p.draw + p.away).toBeGreaterThan(0.97);
    expect(p.home + p.draw + p.away).toBeLessThan(1.03);
  });

  it('leading team becomes favourite as time runs out', () => {
    const early = computeProbs({ ...base, scoreHome: 1, tFrac: 0.1 });
    const late = computeProbs({ ...base, scoreHome: 1, tFrac: 0.95 });
    expect(late.home).toBeGreaterThan(early.home);
    expect(late.home).toBeGreaterThan(0.9);
  });

  it('territory tilt moves next-goal odds', () => {
    const neutral = computeProbs(base);
    const attacking = computeProbs({ ...base, ballTilt: 1, possession: 'home' });
    expect(attacking.nextGoalHome).toBeGreaterThan(neutral.nextGoalHome);
  });

  it('harder difficulty strengthens the away side', () => {
    const easy = computeProbs({ ...base, difficulty: 'easy' });
    const hard = computeProbs({ ...base, difficulty: 'hard' });
    expect(hard.away).toBeGreaterThan(easy.away);
    expect(teamRates('hard').away).toBeGreaterThan(teamRates('easy').away);
  });

  it('over 2.5 resolves certain once 3 goals exist', () => {
    const p = computeProbs({ ...base, scoreHome: 2, scoreAway: 1 });
    expect(p.over25).toBe(1);
  });

  it('user-scored flag pins the market at 1', () => {
    expect(computeProbs({ ...base, userScored: true }).userScores).toBe(1);
  });

  it('strikers carry more goal share than defenders', () => {
    expect(positionGoalShare('ST')).toBeGreaterThan(positionGoalShare('CB'));
  });

  it('quotes clamp into the 1c-99c band', () => {
    expect(quote(0)).toBe(0.01);
    expect(quote(1)).toBe(0.99);
    expect(quote(0.5)).toBe(0.5);
  });
});

describe('MarketHub trading', () => {
  let hub;
  const info = {
    homeName: 'Albion', homeShort: 'ALB', awayName: 'Iberis', awayShort: 'IBE',
    userName: 'You', userRole: 'ST', difficulty: 'normal',
  };
  const live = { scoreHome: 0, scoreAway: 0, tFrac: 0.2, ballTilt: 0, possession: 'home' };

  beforeEach(() => {
    hub = new MarketHub();
    hub.balance = 1000;
    hub.startMatch(info);
    hub.tick(live);
  });

  it('opens the four launch markets', () => {
    const ids = hub.markets.map((m) => m.id);
    expect(ids).toEqual(['winner', 'nextgoal-1', 'userscore', 'over25']);
  });

  it('buys YES shares and debits the wallet', () => {
    const pos = hub.buy('winner', 'home', 'yes', 100);
    expect(typeof pos).toBe('object');
    expect(hub.balance).toBe(900);
    const price = hub.markets[0].outcomes[0].price;
    expect(pos.shares).toBeCloseTo(100 / price, 5);
  });

  it('rejects bad orders', () => {
    expect(hub.buy('winner', 'home', 'yes', 0)).toBe('Enter an amount');
    expect(hub.buy('winner', 'home', 'yes', 99999)).toBe('Insufficient balance');
    expect(hub.buy('nope', 'home', 'yes', 10)).toBe('Market closed');
  });

  it('pays out winning YES shares at fulltime', () => {
    const pos = hub.buy('winner', 'home', 'yes', 100);
    hub.onFullTime({ home: 2, away: 0 });
    expect(pos.status).toBe('won');
    expect(hub.balance).toBeCloseTo(900 + pos.shares, 5);
  });

  it('NO shares win when the outcome fails', () => {
    const pos = hub.buy('userscore', 'yes', 'no', 50);
    hub.onFullTime({ home: 0, away: 0 });
    expect(pos.status).toBe('won');
    expect(hub.balance).toBeCloseTo(950 + pos.shares, 5);
  });

  it('resolves next-goal on a goal and spawns a fresh market', () => {
    const pos = hub.buy('nextgoal-1', 'away', 'yes', 40);
    hub.onGoal('away', false);
    expect(pos.status).toBe('won');
    expect(hub.markets.find((m) => m.id === 'nextgoal-2')?.status).toBe('open');
  });

  it('user goal resolves the personal market', () => {
    const pos = hub.buy('userscore', 'yes', 'yes', 25);
    hub.onGoal('home', true);
    expect(pos.status).toBe('won');
  });

  it('over 2.5 resolves early at three goals', () => {
    const pos = hub.buy('over25', 'yes', 'yes', 30);
    hub.onTotalGoals(3);
    expect(pos.status).toBe('won');
  });

  it('cash-out returns current value and closes the position', () => {
    const pos = hub.buy('winner', 'draw', 'yes', 60);
    const value = hub.positionValue(pos);
    const before = hub.balance;
    expect(hub.cashOut(pos.id)).toBe(true);
    expect(pos.status).toBe('cashed');
    expect(hub.balance).toBeCloseTo(before + value, 5);
  });

  it('voids open bets with a refund on rematch', () => {
    hub.buy('winner', 'home', 'yes', 100);
    expect(hub.balance).toBe(900);
    hub.startMatch(info); // rematch voids + refunds
    expect(hub.balance).toBe(1000);
    expect(hub.positions[0].status).toBe('void');
  });

  it('faucet only rescues the broke', () => {
    expect(hub.faucet()).toBe(false);
    hub.balance = 5;
    expect(hub.faucet()).toBe(true);
    expect(hub.balance).toBe(505);
  });

  it('prices move with the game state', () => {
    const before = hub.markets[0].outcomes[0].price;
    hub.tick({ ...live, scoreHome: 2, tFrac: 0.8 });
    const after = hub.markets[0].outcomes[0].price;
    expect(after).toBeGreaterThan(before);
  });
});
