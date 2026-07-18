import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMarketFeed } from '../src/market.js';

function captureFetch() {
  const calls = [];
  const prev = globalThis.fetch;
  globalThis.fetch = (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return { catch: () => {} };
  };
  return { calls, restore: () => { globalThis.fetch = prev; } };
}

test('disabled without a URL or for a non ARG/ESP matchup — total no-op', () => {
  const { calls, restore } = captureFetch();
  const noUrl = createMarketFeed({ url: undefined, homeCode: 'ARG', awayCode: 'ESP', durationSec: 300 });
  const wrongTeams = createMarketFeed({ url: 'http://x', homeCode: 'BRA', awayCode: 'FRA', durationSec: 300 });
  noUrl.update(30, 0.5); noUrl.goal('home', 30); noUrl.final(1, 0);
  wrongTeams.update(30, 0.5); wrongTeams.goal('home', 30); wrongTeams.shot('away', true, 31); wrongTeams.final(2, 2);
  restore();
  assert.equal(noUrl.enabled, false);
  assert.equal(wrongTeams.enabled, false);
  assert.equal(calls.length, 0, 'never fires when disabled');
});

test('emits contract payloads, ARG-centric possession/final, 90-minute clock', () => {
  const { calls, restore } = captureFetch();
  const f = createMarketFeed({ url: 'http://market.test', homeCode: 'ESP', awayCode: 'ARG', durationSec: 300 });
  assert.equal(f.enabled, true);
  f.update(150, 0.7);            // half of a 5-min match => 45'; home(ESP) share 0.7 => ARG 0.3
  f.goal('away', 160);           // away is ARG
  f.shot('home', true, 165);
  f.final(1, 3);                 // home ESP 1, away ARG 3
  restore();

  assert.equal(calls[0].url, 'http://market.test/event');
  assert.deepEqual(calls[0].body, { type: 'tick', minute: 45 });
  assert.deepEqual(calls[1].body, { type: 'possession', arg: 0.3, minute: 45 });
  assert.deepEqual(calls[2].body, { type: 'goal', team: 'ARG', minute: 48 });
  assert.deepEqual(calls[3].body, { type: 'shot', team: 'ESP', onTarget: true, minute: 49 });
  assert.deepEqual(calls[4].body, { type: 'final', argScore: 3, espScore: 1 });
});

test('update self-throttles tick (~5s) and possession (~10s)', () => {
  const { calls, restore } = captureFetch();
  const f = createMarketFeed({ url: 'http://m', homeCode: 'ARG', awayCode: 'ESP', durationSec: 300 });
  for (let t = 0; t <= 21; t += 1) f.update(t, 0.5);
  restore();
  const ticks = calls.filter((c) => c.body.type === 'tick').length;
  const poss = calls.filter((c) => c.body.type === 'possession').length;
  assert.ok(ticks >= 4 && ticks <= 6, `ticks=${ticks}`);
  assert.ok(poss >= 2 && poss <= 4, `possessions=${poss}`);
});

test('a throwing fetch never propagates — the frame loop is untouchable', () => {
  const prev = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('server down'); };
  const f = createMarketFeed({ url: 'http://down', homeCode: 'ARG', awayCode: 'ESP', durationSec: 300 });
  assert.doesNotThrow(() => { f.update(1, 0.5); f.goal('home', 2); f.final(0, 0); });
  globalThis.fetch = prev;
});
