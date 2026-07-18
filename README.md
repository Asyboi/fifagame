# World Stars Cup — a 3D football game and the live prediction market that trades on it

Two products, one repo:

1. **The game** (`/`, this package) — a browser-based 3D arcade football game.
   Upload a photo of yourself, get a personalized low-poly footballer, and play
   a World-Cup-style 7v7 match with original fictional branding. Three.js +
   Vite, no licensed assets, no server.
2. **The market** (`market/`, its own package) — a live prediction market on
   that match. The audience scans a QR code, gets $100, and bets *"Argentina
   wins?"* against 40 statistical bots and three LLM trading personas while the
   game plays out on the projector. LMSR market maker, SSE price feed, phone
   and projector client from one HTML file.

They are deliberately decoupled: the game POSTs match events over HTTP,
fire-and-forget, and the market does everything else. No shared build, no
shared dependencies, no shared runtime. Kill either one and the other keeps
running.
hi
```
  game (Vite, browser)                market (Node, port 8787)
  ┌───────────────────┐   POST /event  ┌──────────────────────────┐
  │ 7v7 match engine  │ ─────────────> │ fair value model (Poisson)│
  │ goals/shots/clock │  fire & forget │ LMSR market maker         │
  └───────────────────┘                │ 40 bots + 3 LLM agents    │
                                       │ humans via QR + SSE       │
                                       └──────────────────────────┘
```

## Quick start

```bash
# the game
npm install
npm run dev                # -> http://localhost:5173

# the market (separate terminal, separate package)
cd market && npm start     # -> http://localhost:8787

# wire them together: real match events drive the odds
VITE_MARKET_URL=http://localhost:8787 npm run dev
```

Other scripts:

```bash
npm test                   # game: 47 node --test unit tests
npm run build              # production bundle in dist/
npm run preview            # serve the production build
cd market && npm test      # market: 18 tests (LMSR pricing, agents)
```

Desktop Chrome/Edge/Firefox recommended. The photo features run 100%
client-side — the portrait never leaves your device.

---

## Part 1 — the game

### Onboarding flow

**Title → Photo upload (or skip) → Customize avatar → Your team → Opponent →
Match settings → Kickoff.**

- **Photo → avatar:** the uploaded portrait is sampled entirely in-browser
  (skin tone from the central face region, hair color from the top band) and
  applied to your player.
- **Fallbacks:** if no photo is provided, or colors can't be detected
  confidently (bald/bright background, non-skin pixels), safe defaults are used
  and every option — name, shirt number, position, hair style/color, skin
  tone — stays manually customizable. You can also skip the photo entirely
  (Quick Match).
- **Teams:** Argentina, Spain, Brazil, France, Germany, Netherlands — original
  national-team-*inspired* kits (colors/patterns only, no crests or logos).
- **Settings:** 3 / 5 / 8 minute match, Amateur / Pro / Legend difficulty
  (scales AI speed, reactions, pass error, tackling and keeper skill).

### Controls

| Action | Keyboard | Gamepad (standard) |
| --- | --- | --- |
| Move | WASD / arrows | Left stick / D-pad |
| Sprint (stamina) | Shift | RT / RB |
| Pass · Tackle | J (or Z) | A / Cross |
| Shoot *(hold to charge)* · Slide | K (or X) | X / Square |
| Switch player | L (or Q) | LB / L1 |
| Pause | Esc | Start |
| Mute | M | — |

Passing is direction-assisted (aim with the move keys/stick); shooting charges
while held and aims at the far corner by default — steer with up/down.
Overcharging can balloon it over the bar.

### The match

7v7 on a compressed 96×60 m pitch: kickoff, goals with nets, throw-ins,
corners, goal kicks, countdown clock, full time. Third-person broadcast camera
that follows the ball and pushes in on goals. Procedural player animation
(run/kick/dive/celebrate), instanced crowd that swells with excitement, and
fully synthesized WebAudio sound (whistle, kicks, crowd bed, goal cheer — no
audio files). AI covers teammates and opponents: formation shifting, pressing,
dribbling, passing under pressure, shooting in range, and a goalkeeper who
positions, rushes loose balls, dives, parries and distributes.

### Meteor storm

Once the 1-minute mark hits (in any match length), meteors start falling onto
the pitch — red warning rings mark the strikes. A direct hit kills a player
(either side, keeper included), the shockwave knocks nearby players down, and
loose balls get blasted out of the crater. The dead stay dead. You can win
three ways: outscore the opposition, wipe out their entire team (instant win by
annihilation), or — if the score is level at full time — have more survivors
on the field. The scorebug tracks how many players each side has left.

---

## Part 2 — the market

A live binary market (*"Argentina wins?"*) that the audience and an AI swarm
trade against each other while the match plays out. Full docs, deploy guide
(Render) and demo runbook: **[`market/README.md`](market/README.md)**.

### Why it's interesting

- **The price is honest.** An LMSR market maker always quotes, has bounded
  loss (`b·ln2`), and needs no order book. All settlement math is real: cash in
  the system always closes to within the maker's subsidy bound.
- **The crowd can beat the machines.** A Poisson model turns match state into
  fair value instantly; the bot swarm only *trades toward* it over several
  seconds. After a goal, a human who watched it happen can beat the algorithms
  to the repricing. That gap is the entire demo.
- **The bots talk.** Three LLM trading personas — **Momentum** (buys the run
  of play, breathless), **Contrarian** (fades overreactions, condescending),
  and **Degen** (bets big on vibes, never cites statistics) — read live match
  state, place real bets through the same API as the audience, and explain
  every trade in one line on the feed. Structured output means a malformed
  trade can never reach the book; if the API is slow or the key is missing they
  simply go quiet and the 40 statistical bots keep the price moving.
- **Zero-friction audience.** `POST /join` issues a $100 balance — no
  accounts. Bets capped at $25. One HTML document serves both the phone UI and
  the projector view. `POST /reset` starts a fresh match and everyone keeps
  their seat.

### The bridge: game → market events

Set `VITE_MARKET_URL` and the game POSTs to `{VITE_MARKET_URL}/event`
**fire-and-forget** — never awaited, all errors swallowed, so a down market
server can never stutter a frame:

- `{type:'goal', team, minute}` — on every goal
- `{type:'shot', team, onTarget, minute}` — on every shot
- `{type:'possession', arg, minute}` — every ~10s (ARG's share)
- `{type:'tick', minute}` — every ~5s
- `{type:'final', argScore, espScore}` — at the full-time whistle (settles bets)

The market tracks ARG vs ESP, so the feed only activates for that exact
matchup (either side home/away); other pairings no-op and the market's own
simulated match runs instead. `minute` is scaled from match elapsed to a
90-minute football clock. Until the first real event arrives, the market runs
its own simulation — the first `POST /event` hands over permanently.

---

## Verification

Automated — 65 tests total, all passing:

- **Game (`npm test`, 47):** ball physics (gravity, drag, bounce, post/net
  collision), goal-line and out-of-bounds classification,
  corner/goal-kick/throw-in rules, clock and scorers, winner decision (goals →
  meteor survivors tiebreak), meteor storm (activation, spawn cadence,
  fall/impact, kill/shockwave resolution, strike targeting), pass targeting,
  player switching, formation anchors, shoot aim, photo color sampler
  (detection + fallbacks), market feed (payloads, throttling, ARG/ESP gating,
  dead-server safety).
- **Market (`cd market && npm test`, 18):** LMSR pricing (prices sum to one,
  bounded loss, budget-respecting fills, no-op guards) and the LLM agents
  (trade placement, commentary, malformed-decision and settled-market safety).

Headless browser harness (Puppeteer + system Chrome, not part of `npm test`):
drove the real game end-to-end — **25/25 checks**: title → photo upload with a
synthetic portrait (skin+hair detected) → customize → team pick → match start;
keyboard move/pass/charged-shoot; gamepad stick move + button pass (via a
mocked standard controller); goal detection with GOAL overlay; kickoff reset;
Esc pause/resume; AI opponents moving; full-time result screen; market
goal/shot/tick/possession/final events received by a capture server; rematch.
Zero console errors. A 40-second soak with a keyboard-driven bot produced a
competitive, end-to-end match.

Manual checklist (all covered by the harness above, re-checkable by hand):

- [x] Avatar creation — photo path and skip/fallback path
- [x] Keyboard controls — move, sprint, pass, charged shoot, tackle, switch
- [x] Controller input — stick move, A pass, X shoot, LB switch, Start pause
- [x] Scoring — goal detection, scorebug, celebration, scorer overlay
- [x] Restarts — kickoff after goals, throw-ins, corners, goal kicks
- [x] AI — teammates and opponents move, press, pass, shoot; GK dives/saves
- [x] Match restart — pause-menu restart and result-screen rematch
- [x] Market — join, bet, live repricing on goals, settlement at full time

## Project layout

```
src/                      THE GAME (Vite + Three.js)
  main.js                 entry: renderer, screen flow, match lifecycle
  config.js               tuning constants (pitch, ball, players, difficulty)
  teams.js                fictional teams + original kits
  market.js               fire-and-forget market event feed
  avatar/sampler.js       photo -> skin/hair color sampling (client-side only)
  game/
    ball.js               arcade ball physics (pure)
    referee.js            goals / out / restarts / clock / winner (pure)
    aicore.js             pass targeting, switching, anchors, shot aim (pure)
    meteors.js            meteor storm state, spawning, impact resolution (pure)
    meteorfx.js           meteor rocks, warning rings, explosions, scorch marks
    match.js              orchestrator: gameplay, AI, camera, flow
    rig.js                low-poly player mesh + procedural animation
    stadium.js            pitch, goals+nets, stands, crowd, boards, floodlights
    audio.js              WebAudio-synthesized match sound
    input.js              keyboard + gamepad
    hud.js                scorebug, player tag, power bar, overlays
  ui/screens.js           onboarding, pause, result screens
tests/                    game unit tests (node --test)

market/                   THE PREDICTION MARKET (standalone Node service)
  src/
    lmsr.js               binary market maker: always quotes, bounded loss
    fairValue.js          match state -> P(Argentina wins), joint Poisson
    traders.js            cash, positions, settlement (humans = bots = agents)
    market.js             match state, bet routing, client snapshots
    bots.js               40 statistical traders: liquidity + price movement
    agents.js             3 LLM trading personas with live commentary
    matchSim.js           simulated match emitting the same events as the game
    server.js             HTTP + SSE
  public/index.html       the whole client: phone and projector in one document
  test/                   LMSR + agent tests
```

## Legal

All branding is fictional ("World Stars Cup", "Star Ball", "Nova Sports").
Kits are original designs using national-team-inspired color schemes only —
no crests, logos, fonts, or licensed assets of any kind. Player names are
invented.
