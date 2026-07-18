# World Stars Cup — Be The Star

A browser-based 3D arcade football game. Upload a photo of yourself, get a
personalized low-poly footballer, and play a World-Cup-style 7v7 match with
original fictional branding. Built with Three.js + Vite, no licensed assets.

## Run it

```bash
npm install
npm run dev        # → http://localhost:5173
```

Other scripts:

```bash
npm test           # node --test: ball physics, referee rules, AI targeting,
                   # photo sampler, market feed (36 tests)
npm run build      # production bundle in dist/
npm run preview    # serve the production build
```

Desktop Chrome/Edge/Firefox recommended. No build step or server logic is
required for the photo features — everything runs 100% client-side.

## Onboarding flow

**Title → Photo upload (or skip) → Customize avatar → Your team → Opponent →
Match settings → Kickoff.**

- **Photo → avatar:** the uploaded portrait is sampled entirely in-browser
  (skin tone from the central face region, hair color from the top band) and
  applied to your player. The photo never leaves your device.
- **Fallbacks:** if no photo is provided, or colors can't be detected
  confidently (e.g. bald/bright background, non-skin pixels), safe default
  colors are used and every option — name, shirt number, position, hair
  style/color, skin tone — stays manually customizable. You can also skip
  the photo entirely (Quick Match).
- **Teams:** Argentina, Spain, Brazil, France, Germany, Netherlands — original
  national-team-*inspired* kits (colors/patterns only, no crests or logos).
- **Settings:** 3 / 5 / 8 minute match, Amateur / Pro / Legend difficulty
  (scales AI speed, reactions, pass error, tackling and keeper skill).

## Controls

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

## The match

7v7 on a compressed 96×60 m pitch: kickoff, goals with nets, throw-ins,
corners, goal kicks, countdown clock, full time. Third-person broadcast camera
that follows the ball and pushes in on goals. Procedural player animation
(run/kick/dive/celebrate), instanced crowd that swells with excitement, and
fully synthesized WebAudio sound (whistle, kicks, crowd bed, goal cheer — no
audio files). AI covers teammates and opponents: formation shifting, pressing,
dribbling, passing under pressure, shooting in range, and a goalkeeper who
positions, rushes loose balls, dives, parries and distributes.

## Prediction market hook (optional)

If the companion market service (see `market/`) is running, point the game at
it and real match events will drive the odds:

```bash
VITE_MARKET_URL=http://localhost:8787 npm run dev
```

Events are POSTed to `{VITE_MARKET_URL}/event` **fire-and-forget** — never
awaited, all errors swallowed, so a down market server can never stutter a
frame:

- `{type:'goal', team, minute}` — on every goal
- `{type:'shot', team, onTarget, minute}` — on every shot
- `{type:'possession', arg, minute}` — every ~10s (ARG's share)
- `{type:'tick', minute}` — every ~5s
- `{type:'final', argScore, espScore}` — at the full-time whistle (settles bets)

The market tracks ARG vs ESP, so the feed only activates for that exact
matchup (either side home/away); other pairings no-op and the market's own
simulation runs instead. `minute` is scaled from match elapsed to a 90-minute
football clock.

## Verification

Automated (`npm test`, 36 tests): ball physics (gravity, drag, bounce, post /
net collision), goal-line and out-of-bounds classification, corner/goal-kick/
throw-in rules, clock and scorers, pass targeting, player switching, formation
anchors, shoot aim, photo color sampler (detection + fallbacks), market feed
(payloads, throttling, ARG/ESP gating, dead-server safety).

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

## Project layout

```
src/
  main.js             entry: renderer, screen flow, match lifecycle
  config.js           tuning constants (pitch, ball, players, difficulty)
  teams.js            fictional teams + original kits
  market.js           fire-and-forget market event feed
  avatar/sampler.js   photo → skin/hair color sampling (client-side only)
  game/
    ball.js           arcade ball physics (pure)
    referee.js        goals / out / restarts / clock (pure)
    aicore.js         pass targeting, switching, anchors, shot aim (pure)
    match.js          orchestrator: gameplay, AI, camera, flow
    rig.js            low-poly player mesh + procedural animation
    stadium.js        pitch, goals+nets, stands, crowd, boards, floodlights
    audio.js          WebAudio-synthesized match sound
    input.js          keyboard + gamepad
    hud.js            scorebug, player tag, power bar, overlays
  ui/screens.js       onboarding, pause, result screens
tests/                node --test unit tests
```

`market/` is a **separate project** (its own package.json, port 8787) — the
prediction market service. The game only talks to it over HTTP via the feed
above.

## Legal

All branding is fictional ("World Stars Cup", "Star Ball", "Nova Sports").
Kits are original designs using national-team-inspired color schemes only —
no crests, logos, fonts, or licensed assets of any kind. Player names are
invented.
