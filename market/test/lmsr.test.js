import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createBook,
  priceYes,
  priceNo,
  costToBuy,
  sharesForBudget,
  buy,
  maxSubsidy,
  YES,
  NO,
} from '../src/lmsr.js';

const close = (a, b, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

test('a fresh book is a coin flip', () => {
  close(priceYes(createBook()), 0.5);
});

test('yes and no prices always sum to one', () => {
  const book = createBook();
  buy(book, YES, 250);
  close(priceYes(book) + priceNo(book), 1);
});

test('buying yes raises the yes price', () => {
  const book = createBook();
  const before = priceYes(book);
  buy(book, YES, 100);
  assert.ok(priceYes(book) > before);
});

test('buying no lowers the yes price', () => {
  const book = createBook();
  buy(book, NO, 100);
  assert.ok(priceYes(book) < 0.5);
});

test('price stays strictly inside 0 and 1 under lopsided flow', () => {
  const book = createBook();
  for (let i = 0; i < 200; i++) buy(book, YES, 100);
  const p = priceYes(book);
  assert.ok(p > 0 && p < 1, `price escaped bounds: ${p}`);
});

test('sharesForBudget inverts costToBuy', () => {
  const book = createBook();
  buy(book, YES, 137); // move off the symmetric point
  const shares = sharesForBudget(book, NO, 50);
  close(costToBuy(book, NO, shares), 50, 1e-4);
});

test('a buy spends no more than the budget offered', () => {
  const book = createBook();
  const fill = buy(book, YES, 25);
  assert.ok(fill.spent <= 25 + 1e-9, `overspent: ${fill.spent}`);
  assert.ok(fill.spent > 24.99, `underfilled badly: ${fill.spent}`);
});

test('average fill price sits between the pre and post price', () => {
  const book = createBook();
  const fill = buy(book, YES, 200);
  assert.ok(fill.avgPrice > fill.priceBefore, 'no slippage was charged');
  assert.ok(fill.avgPrice < fill.priceAfter, 'overcharged past the new price');
});

test('a zero or negative budget is a no-op', () => {
  const book = createBook();
  assert.equal(buy(book, YES, 0).shares, 0);
  assert.equal(buy(book, YES, -10).shares, 0);
  close(priceYes(book), 0.5);
});

test('smaller b means a harder price move for the same money', () => {
  const tight = createBook(400);
  const loose = createBook(60);
  buy(tight, YES, 100);
  buy(loose, YES, 100);
  assert.ok(priceYes(loose) > priceYes(tight));
});

test('max subsidy is bounded by b ln 2', () => {
  close(maxSubsidy(120), 120 * Math.LN2);
});
