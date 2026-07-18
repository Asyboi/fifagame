// The LLM trading agents.
//
// Three personas read live match state, place real bets against the same market
// as the audience, and explain each trade in one line. Those explanations are
// the demo: a price ticking is abstract, "Spain's press is collapsing and
// Argentina is still cheap at 62c" is not.
//
// Everything here is best-effort and fully isolated from the market. Agents run
// off the tick loop, never block it, and swallow their own failures. If the API
// is slow, rate-limited, or the key is missing, the agents simply go quiet and
// the 40 statistical bots keep the price moving. Nothing an audience can see
// depends on this file working.

import { placeBet, pushFeed, currentPrice, currentFair } from './market.js';
import { join } from './market.js';

const MODEL = process.env.MARKET_AGENT_MODEL || 'claude-opus-4-8';

// One decision per agent per this interval, staggered so the feed reads as a
// conversation rather than three simultaneous bursts.
const DECISION_MS = 10000;

// A hard ceiling on calls per match, so a stuck loop or a restarted match can
// never produce a surprising bill.
const MAX_CALLS = 80;

const PERSONAS = [
  {
    id: 'agent:momentum',
    name: 'Momentum',
    system:
      'You are a momentum trader on a live football prediction market. You believe '
      + 'goals and territorial pressure carry forward, and you buy the team with the '
      + 'run of play even when the price has already moved. You are decisive and a '
      + 'little breathless. You distrust mean reversion.',
  },
  {
    id: 'agent:contrarian',
    name: 'Contrarian',
    system:
      'You are a value trader on a live football prediction market. You fade '
      + 'overreactions. When the market price has run far from the statistical model '
      + 'fair value, you take the other side and wait for it to come back. You are dry, '
      + 'precise, and slightly condescending about the crowd.',
  },
  {
    id: 'agent:degen',
    name: 'Degen',
    system:
      'You are a reckless gambler on a live football prediction market. You bet big on '
      + 'gut feeling, you love an underdog, and you are allergic to sitting out. You are '
      + 'funny and overconfident. You never explain yourself with statistics.',
  },
];

// Structured output means we never have to parse free text, and the model cannot
// return a malformed trade in front of an audience.
const DECISION_SCHEMA = {
  type: 'object',
  properties: {
    team: {
      type: 'string',
      enum: ['ARG', 'ESP', 'PASS'],
      description: 'Team to buy, or PASS to sit this one out.',
    },
    size: {
      // Capped at 15, not 25. An agent gets roughly eighteen decisions in a
      // match on $100; at $25 a head they were broke by the half hour and spent
      // the rest of the game narrating their own bankruptcy.
      type: 'integer',
      enum: [0, 5, 10, 15],
      description: 'Dollars to bet. Use 0 when passing.',
    },
    reason: {
      type: 'string',
      description: 'One short sentence, under 20 words, in your voice. No preamble.',
    },
  },
  required: ['team', 'size', 'reason'],
  additionalProperties: false,
};

export async function startAgents(marketRef) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[agents] no ANTHROPIC_API_KEY — LLM agents disabled');
    return { stop: () => {} };
  }

  let Anthropic;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch {
    console.log('[agents] @anthropic-ai/sdk not installed — LLM agents disabled');
    return { stop: () => {} };
  }

  // Two retries and a short timeout: a slow call is worse than a skipped one,
  // because the match has moved on by the time a late answer arrives.
  const client = new Anthropic({ maxRetries: 2, timeout: 8000 });

  let calls = 0;
  const timers = [];
  const busy = new Set();

  for (const [i, persona] of PERSONAS.entries()) {
    const market = marketRef();
    join(market, { id: persona.id, name: persona.name, kind: 'agent' });

    // Stagger so the three of them speak in turn.
    const offset = (DECISION_MS / PERSONAS.length) * i;
    timers.push(setTimeout(() => {
      timers.push(setInterval(() => {
        const m = marketRef();
        if (m.match.status !== 'live') return;
        if (calls >= MAX_CALLS) return;
        // Skip rather than queue: a backed-up agent would trade on stale state.
        if (busy.has(persona.id)) return;

        busy.add(persona.id);
        calls += 1;
        decide(client, m, persona)
          .catch((err) => console.error(`[agents] ${persona.name} failed:`, err.message))
          .finally(() => busy.delete(persona.id));
      }, DECISION_MS));
    }, offset));
  }

  console.log(`[agents] ${PERSONAS.length} personas live on ${MODEL}`);
  return {
    stop: () => { for (const t of timers) { clearTimeout(t); clearInterval(t); } },
  };
}

// Re-register the agents against a fresh match after /reset.
export function rejoinAgents(market) {
  for (const p of PERSONAS) {
    join(market, { id: p.id, name: p.name, kind: 'agent' });
  }
}

async function decide(client, market, persona) {
  const trader = market.ledger.traders.get(persona.id);
  if (!trader) return;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: persona.system,
    output_config: {
      // Low effort: this is a small, well-specified judgement call on a 10-second
      // cadence. Thinking is left off entirely for latency.
      effort: 'low',
      format: { type: 'json_schema', schema: DECISION_SCHEMA },
    },
    messages: [{ role: 'user', content: buildPrompt(market, trader) }],
  });

  if (response.stop_reason === 'refusal') return;

  const block = response.content.find((b) => b.type === 'text');
  if (!block) return;

  let decision;
  try {
    decision = JSON.parse(block.text);
  } catch {
    return; // structured outputs make this near-impossible, but never throw on stage
  }

  applyDecision(market, persona, decision);
}

/**
 * Turn a model decision into a bet and a line in the feed.
 *
 * Separated from the API call so it can be tested without credentials, and
 * because this is where a bad response would actually do damage -- everything
 * above it either works or throws.
 */
export function applyDecision(market, persona, decision) {
  if (!decision || typeof decision.reason !== 'string') return null;

  if (decision.team === 'PASS' || !decision.size) {
    pushFeed(market, { type: 'agent', trader: persona.name, text: decision.reason });
    return null;
  }

  if (decision.team !== 'ARG' && decision.team !== 'ESP') return null;

  const fill = placeBet(market, {
    traderId: persona.id,
    team: decision.team,
    budget: decision.size,
  });

  // The commentary goes in whether or not the bet filled -- an agent that is out
  // of cash still has an opinion, and silence would read as a broken agent.
  pushFeed(market, {
    type: 'agent',
    trader: persona.name,
    text: fill
      ? `${decision.team} $${decision.size} — ${decision.reason}`
      : decision.reason,
  });
  return fill;
}

export { PERSONAS, buildPrompt };

function buildPrompt(market, trader) {
  const m = market.match;
  const price = currentPrice(market);
  const fair = currentFair(market);
  const c = (p) => `${Math.round(p * 100)}c`;

  const recent = market.feed
    .filter((f) => f.type === 'goal' || f.type === 'trade')
    .slice(0, 6)
    .map((f) => (f.type === 'goal'
      ? `${f.minute}' GOAL ${f.team}`
      : `${f.trader} bought ${f.team} $${f.spent.toFixed(0)}`))
    .join('; ') || 'nothing yet';

  return [
    // Teams are named on both sides of the score. Written as "score 1-0" an
    // agent occasionally read the lead backwards and narrated a comeback for
    // the team that was winning.
    `Argentina vs Spain, ${m.minute | 0} minutes played.`,
    `SCORE: Argentina ${m.argScore} - ${m.espScore} Spain.`
      + ` ${m.argScore === m.espScore ? 'Level.'
        : `${m.argScore > m.espScore ? 'Argentina' : 'Spain'} lead by `
          + `${Math.abs(m.argScore - m.espScore)}.`}`,
    `Shots on target: Argentina ${m.argShots}, Spain ${m.espShots}.`,
    `Possession: Argentina ${Math.round(m.argPossession * 100)}%.`,
    '',
    `Market: "Argentina wins" trades at ${c(price)}. A draw settles as No.`,
    `Statistical model fair value: ${c(fair)}.`,
    `Recent activity: ${recent}.`,
    '',
    `You have $${trader.cash.toFixed(2)} cash, ${trader.yes.toFixed(0)} Argentina shares, `
      + `${trader.no.toFixed(0)} Spain shares.`,
    // Agents get roughly one decision every ten seconds for the whole match and
    // cannot be topped up, so pacing has to be stated outright.
    'This is your entire stack for the match — there is no more money coming. '
      + 'You get a decision roughly every ten seconds until full time, so keep '
      + 'enough back to react to a late goal.',
    '',
    'Make one trading decision now, in character. PASS is a legitimate choice when '
      + 'nothing has changed. Your reason is shown live on a big screen to an audience '
      + 'watching the match, so make it vivid and specific to what just happened. '
      + 'Talk about the football, not your bankroll — never mention being broke, out '
      + 'of cash, or unable to bet. If you cannot trade, give your read on the match.',
  ].join('\n');
}
