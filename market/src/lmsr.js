// Logarithmic Market Scoring Rule for a binary market.
//
// Two outcomes: YES (Argentina wins) and NO (Argentina does not win). The market
// maker always quotes a price, so there is never an empty book -- which is what
// we want on stage, where a dead ticker reads as a broken demo.
//
// b is the liquidity parameter. Lower b => the price swings harder per share
// bought. We deliberately run it loose so a goal visibly moves the line.

const YES = 'YES';
const NO = 'NO';

export function createBook(b = 120) {
  return { b, qYes: 0, qNo: 0 };
}

// C(q) = b * ln(e^(qYes/b) + e^(qNo/b))
// Computed around the max to avoid overflow when q/b gets large.
export function cost({ b, qYes, qNo }) {
  const hi = Math.max(qYes, qNo);
  return hi + b * Math.log(Math.exp((qYes - hi) / b) + Math.exp((qNo - hi) / b));
}

// Under extreme one-sided flow the exponential underflows and the price pins to
// exactly 0 or 1. At 0 that makes shares free, which sends sharesForBudget's
// bracket loop to its bail-out. Real prediction markets cap at 1¢/99¢ for the
// same reason, so we do too.
const MIN_PRICE = 0.001;

// Price of YES in dollars per share, always in (0, 1). This is also the market's
// implied probability, which is what we render as "62¢".
export function priceYes({ b, qYes, qNo }) {
  const p = 1 / (1 + Math.exp((qNo - qYes) / b));
  return Math.min(Math.max(p, MIN_PRICE), 1 - MIN_PRICE);
}

export function priceNo(book) {
  return 1 - priceYes(book);
}

export function priceOf(book, side) {
  return side === YES ? priceYes(book) : priceNo(book);
}

// Cost in dollars to buy `shares` of `side`. Always positive.
export function costToBuy(book, side, shares) {
  const after = applyShares(book, side, shares);
  return cost(after) - cost(book);
}

function applyShares({ b, qYes, qNo }, side, shares) {
  return side === YES
    ? { b, qYes: qYes + shares, qNo }
    : { b, qYes, qNo: qNo + shares };
}

// Inverse of costToBuy: how many shares does `budget` dollars buy?
//
// The cost function has no clean closed-form inverse for our purposes, so we
// bisect. Cost is strictly increasing in shares, so this always converges, and
// at ~40 iterations it is exact to well past cent precision while costing
// nothing we can measure.
export function sharesForBudget(book, side, budget) {
  if (budget <= 0) return 0;

  // Price is bounded below by 0, so budget dollars can never buy more than
  // budget/minPrice shares. Grow the bracket until it overshoots.
  let lo = 0;
  let hi = Math.max(budget, 1);
  while (costToBuy(book, side, hi) < budget) {
    hi *= 2;
    if (hi > 1e9) break; // pathological b; bail rather than hang the tick loop
  }

  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (costToBuy(book, side, mid) < budget) lo = mid;
    else hi = mid;
  }
  return lo;
}

// Execute a purchase, mutating the book. Returns the shares acquired and what
// they cost. Callers debit the trader's cash by `spent`, not by their intended
// budget -- bisection lands a hair under, and the difference should stay with
// the trader rather than vanishing.
export function buy(book, side, budget) {
  const shares = sharesForBudget(book, side, budget);
  const spent = costToBuy(book, side, shares);
  const priceBefore = priceYes(book);

  if (side === YES) book.qYes += shares;
  else book.qNo += shares;

  return {
    side,
    shares,
    spent,
    priceBefore,
    priceAfter: priceYes(book),
    avgPrice: shares > 0 ? spent / shares : 0,
  };
}

// Worst-case loss the market maker can take, i.e. what we subsidise the market
// with. Useful as a sanity check that our b is not absurd.
export function maxSubsidy(b) {
  return b * Math.log(2);
}

export { YES, NO };
