import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyDecision, PERSONAS, buildPrompt } from '../src/agents.js';
import { createMatchMarket, applyEvent, join } from '../src/market.js';

// These cover everything except the API call itself: what happens to the market
// when a decision comes back, including the shapes a model should never produce
// but must not be able to break the demo with.

function setup() {
  const market = createMatchMarket();
  const persona = PERSONAS[0];
  join(market, { id: persona.id, name: persona.name, kind: 'agent' });
  applyEvent(market, { type: 'tick', minute: 10 });
  return { market, persona };
}

test('a buy decision places a bet and posts commentary', () => {
  const { market, persona } = setup();
  const fill = applyDecision(market, persona, {
    team: 'ARG', size: 10, reason: 'Argentina are all over them.',
  });

  assert.ok(fill, 'expected a fill');
  assert.equal(market.ledger.traders.get(persona.id).trades, 1);
  const entry = market.feed.find((f) => f.type === 'agent');
  assert.match(entry.text, /ARG \$10 — Argentina are all over them\./);
});

test('PASS posts commentary without trading', () => {
  const { market, persona } = setup();
  const before = market.ledger.traders.get(persona.id).cash;

  applyDecision(market, persona, { team: 'PASS', size: 0, reason: 'Nothing has changed.' });

  assert.equal(market.ledger.traders.get(persona.id).cash, before);
  assert.equal(market.ledger.traders.get(persona.id).trades, 0);
  assert.equal(market.feed.find((f) => f.type === 'agent').text, 'Nothing has changed.');
});

test('a broke agent still gets its say', () => {
  const { market, persona } = setup();
  market.ledger.traders.get(persona.id).cash = 0;

  applyDecision(market, persona, { team: 'ARG', size: 25, reason: 'I would if I could.' });

  const entry = market.feed.find((f) => f.type === 'agent');
  assert.equal(entry.text, 'I would if I could.', 'commentary should survive a failed fill');
});

test('a nonsense team is ignored rather than thrown on', () => {
  const { market, persona } = setup();
  const before = market.ledger.traders.get(persona.id).cash;

  assert.equal(applyDecision(market, persona, { team: 'FRA', size: 10, reason: 'x' }), null);
  assert.equal(market.ledger.traders.get(persona.id).cash, before);
});

test('a malformed decision is ignored rather than thrown on', () => {
  const { market, persona } = setup();
  assert.equal(applyDecision(market, persona, null), null);
  assert.equal(applyDecision(market, persona, {}), null);
  assert.equal(applyDecision(market, persona, { team: 'ARG', size: 10 }), null);
});

test('agents cannot trade a settled market', () => {
  const { market, persona } = setup();
  applyEvent(market, { type: 'final', argScore: 1, espScore: 0 });

  assert.equal(
    applyDecision(market, persona, { team: 'ARG', size: 10, reason: 'late' }),
    null,
  );
});

test('the prompt carries the state an agent needs to be specific', () => {
  const { market, persona } = setup();
  applyEvent(market, { type: 'goal', team: 'ESP', minute: 12 });

  const prompt = buildPrompt(market, market.ledger.traders.get(persona.id));
  assert.match(prompt, /Argentina 0 - 1 Spain/, 'score missing or not team-labelled');
  assert.match(prompt, /Spain lead by 1/, 'who is ahead must be stated outright');
  assert.match(prompt, /trades at \d+c/, 'market price missing');
  assert.match(prompt, /fair value: \d+c/, 'model fair value missing');
  assert.match(prompt, /GOAL ESP/, 'recent goal missing');
  assert.match(prompt, /draw settles as No/i, 'draw rule missing');
});
