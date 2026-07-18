# Prediction market — Argentina vs Spain

A live binary market (*"Argentina wins?"*) that the audience and an AI swarm
trade against each other while the match plays out.

Standalone service. It shares nothing with the game except one HTTP endpoint:
the game POSTs match events, the market does the rest. No shared build, no
shared dependencies, no shared runtime.

## Run locally

```bash
npm start                  # http://localhost:8787
npm test                   # LMSR pricing tests
```

No dependencies. Node 20+.

The match starts when the first client joins and runs for three minutes. State
is in memory: every process start is a fresh match.

## How it works

| File | Responsibility |
|---|---|
| `src/lmsr.js` | Binary market maker. Always quotes a price, bounded loss, no order book. |
| `src/fairValue.js` | Match state → P(Argentina wins), by summing the joint Poisson over remaining goals. |
| `src/traders.js` | Cash, positions, settlement — identical for humans, bots and agents. |
| `src/market.js` | Match state, bet routing, client snapshots. |
| `src/bots.js` | 40 statistical traders providing liquidity and price movement. |
| `src/matchSim.js` | Simulated match emitting the same events the real game does. |
| `src/server.js` | HTTP + SSE. |
| `public/index.html` | The whole client — phone and projector from one document. |

Prices are what traders pay. The dashed line on the chart is the model's fair
value, which the swarm trades toward but never exactly reaches. That gap is the
point: after a goal, fair value jumps instantly while the price takes several
seconds to catch up, so a human who watched the goal can beat the swarm to it.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | The trading page |
| `GET` | `/stream?traderId=` | SSE state feed |
| `GET` | `/state` | Current snapshot (debugging) |
| `GET` | `/me?traderId=` | One trader's position |
| `GET` | `/healthz` | Uptime ping |
| `POST` | `/join` | `{ id, name }` → issues a $100 balance |
| `POST` | `/bet` | `{ traderId, team, amount }`, capped at $25 |
| `POST` | `/event` | Match events from the game |
| `POST` | `/reset` | `{ token }` → new match, audience keeps their seats |

## Deploying to Render

Configure in the dashboard — **do not add a `render.yaml`**, the repo root
belongs to the game.

| Setting | Value |
|---|---|
| Root Directory | `market` |
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Health Check Path | `/healthz` |
| Environment | `RESET_TOKEN` = anything private |

`PORT` is supplied by Render and already respected. SSE works as-is; the
`X-Accel-Buffering: no` header stops proxy buffering from stalling the feed.

### The free tier will bite you

Free instances **spin down after ~15 minutes idle**, and cold start is 30–60
seconds. All match state is in memory, so a spin-down mid-demo loses the market.

Mitigations, in order of preference:

1. Point an uptime pinger (cron-job.org, UptimeRobot) at `/healthz` every 10
   minutes for the day.
2. Load the page yourself ~2 minutes before presenting and leave it open — an
   open SSE connection counts as traffic.
3. Pay for a starter instance for one month.

Do at least one of these. A cold start while thirty people are scanning a QR
code is the single most likely way this demo fails.

## Demo runbook

1. **T-15min** — open the Render URL, confirm the price is ticking. This also
   wakes the instance.
2. **T-5min** — `POST /reset` with your token so the room starts on a clean
   match with nothing already settled.
3. **Project the page wide**, game on the other half of the screen.
4. **QR up early.** People need time to scan, name themselves, and find the
   buttons before anything worth betting on happens.
5. **Kick off.** The market runs on its own simulation unless the game is
   sending events — the first `POST /event` hands over permanently.
6. **Call the goal.** When a goal lands, the price lags fair value by several
   seconds. Say so out loud: the room can beat the algorithms if they're fast.
7. **At full time**, the market settles and the leaderboard is final.

To run it again: `POST /reset`. Everyone keeps their seat and their name, and
gets a fresh $100.

```bash
curl -X POST https://YOUR-APP.onrender.com/reset \
  -H 'Content-Type: application/json' -d '{"token":"YOUR_TOKEN"}'
```

## Talking points

- **Why does Argentina start at 37¢, not 50¢?** A draw settles as *No*. It's a
  win market, not a match-result market, so the draw is priced in.
- **Why does my balance tick up right after I bet?** You pay the average price
  and are marked at the new marginal price. Standard for this kind of market
  maker; the bots arbitrage it away within a second or two.
- **Is the market rigged to be exciting?** The simulated match scores more than
  real football. The pricing, the money, and the settlement are not simulated —
  cash in the system always closes to within the maker's `b·ln2` subsidy bound.
