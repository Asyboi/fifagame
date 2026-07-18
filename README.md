# FABLE CUP — 3D Browser Football

A polished, playable 3D football (soccer) vertical slice built with **Three.js**.
Upload a photo of yourself, become a customized 3D player, and play a full
console-style match in the fictional **FABLE CUP** tournament — kickoff to
full time, with AI teammates, opponents, goalkeepers, replays, and rematches.
A built-in **FABLE MARKET** prediction exchange (Polymarket-style) lets you
bet fun-money on the match with odds that move live with the game.

All teams, branding, and assets are original / procedurally generated.
No FIFA, EA Sports, or other proprietary assets are used.

---

## Quick start

```bash
npm install
npm run dev        # open http://localhost:5173
```

Other commands:

```bash
npm test           # unit tests for match logic (vitest)
npm run test:smoke # headless end-to-end flow test (needs `npm run dev` running + MS Edge)
npm run build      # production build into dist/
npm run preview    # serve the production build
```

Requirements: Node 18+, a desktop browser with WebGL2. Tested on Chromium/Edge.

---

## How to play

1. **Create your player** — upload a clear front-facing photo (it is mapped
   onto a stylized 3D head; tune the crop with the sliders). Pick your name,
   number, team, opponent, position, kit, skin tone, hairstyle, hair colour,
   and difficulty. Drag the preview to rotate it.
   *Your photo stays in memory for the session only, unless you tick
   "Keep photo in this browser" (stored in localStorage, removable by unticking).*
2. **Kick off** from the lineup screen and play both halves.
3. Score, watch the replay, finish the match, and hit **REMATCH**.
4. **Bet on yourself** — click the **FABLE MARKET** chip in the top-right
   corner to open the prediction exchange (see below).

### FABLE MARKET (prediction exchange)

A Polymarket-style corner panel with binary YES/NO share markets priced in
cents; winning shares pay out 1.00 FC (FableCoins — fictional fun-money,
balance persists in your browser):

| Market | Resolves |
| --- | --- |
| Match winner (Home / Draw / Away) | at full time |
| Next goal: which team scores next? | on each goal (a fresh market spawns after) |
| *Your player* to score anytime | instantly when you score, else NO at full time |
| Over 2.5 total goals | early YES at 3 goals, else at full time |

- Prices come from a live Poisson goal model fed by score, match clock,
  territory (ball position), possession, and difficulty — so odds swing as
  you attack, concede, or park the bus.
- Buy YES or NO, watch the sparkline, and **cash out** open positions at the
  current price before resolution.
- Rematches void unresolved markets and refund open stakes. A faucet gives
  you 500 FC if you go broke. Bet responsibly, it is not real money.

### Keyboard controls

| Action | Key |
| --- | --- |
| Move | WASD / Arrow keys |
| Sprint | Shift |
| Pass | Space |
| Through pass | E |
| Shoot (hold to charge) | F |
| Tackle | R |
| Switch player | Q / Tab |
| Knock-on / skill burst | C |
| Pause | Esc / P |

### Gamepad (standard Xbox/PS mapping via the browser Gamepad API)

| Action | Button |
| --- | --- |
| Move | Left stick / D-pad |
| Sprint | RT |
| Pass | A / Cross |
| Shoot (hold to charge) | B / Circle |
| Through pass | Y / Triangle |
| Tackle | X / Square |
| Switch player | LB / L1 |
| Knock-on | LT / L2 |
| Pause | Start |

The HUD shows `GAMEPAD` in the top-right corner when a controller is detected.

---

## Architecture

```
src/
  main.js               bootstrap + app flow (onboarding → lineup → match → results)
  config.js             pure data: pitch dims, teams, formation, name generator
  style.css             all UI styling
  avatar/
    face.js             photo → stylized face texture (oval crop, skin-tone blend)
  market/
    model.js            PURE Poisson win/next-goal/over-under probability model (unit-tested)
    market.js           wallet, YES/NO share trading, cash-out, resolution, void/refund
  game/
    rules.js            PURE match logic: goals, out-of-bounds, clock, score (unit-tested)
    ball.js             ball physics: gravity, bounce, friction, rolling, spin
    player.js           player entity: movement, procedural animation, ball actions
    playerMesh.js       low-poly rig factory (shared geometry/materials, kits, hair, face)
    ai.js               outfield AI, pass selection, shooting, pressing + goalkeeper AI
    input.js            unified keyboard + Gamepad API input with edge events
    cameraRig.js        broadcast / intro / goal / replay camera behaviours
    stadium.js          pitch, markings, goals, stands, instanced crowd, lighting
    audio.js            fully synthesized WebAudio: crowd, whistle, kicks, goal cheer
    replay.js           ring-buffer transform recorder for goal replays
    match.js            orchestrator: teams, state machine, possession, rules, markers
  ui/
    onboarding.js       photo upload + customization + rotatable 3D preview
    hud.js              scoreboard, clock, radar minimap, power bar, toasts
    screens.js          lineup, goal banner, halftime, pause, results overlays
    marketPanel.js      Polymarket-style corner panel: markets, bet slips, positions
tests/
  rules.test.js         23 unit tests for the pure match logic
  market.test.js        21 unit tests for the odds model and trading engine
  smoke.mjs             automated E2E: create player → play → bet → fulltime → rematch
  shots.mjs             screenshot capture for visual verification
```

Design notes:

- **Performance**: one shared geometry set + cached materials for all 22 players,
  a single `InstancedMesh` for ~4,000 crowd members, canvas-generated pitch and
  number textures, capped pixel ratio, one shadow-casting light.
- **Modularity**: rules are pure functions (testable in Node without WebGL);
  AI, input, camera, audio, and UI are all independent modules the match
  orchestrator composes.
- **Match sim**: 2 halves of 150 real seconds mapped to 45 simulated minutes each
  (tweak `MATCH.halfLengthSeconds` in `src/config.js`).

---

## Implemented features

- Onboarding with photo upload, oval face crop + zoom/offset tuning, name,
  number, team, opponent, position (8 outfield roles), kit variant, skin tone,
  6 hairstyles, hair colours, difficulty, rotatable 3D preview.
- Session-only photo handling with explicit opt-in browser persistence.
- Full 11v11 match: formations (4-3-3), kickoffs, goals, throw-ins, corners,
  goal kicks, halftime with side swap, full time, pause, restart, rematch.
- Player-controlled movement, sprinting, passing, through passes, charged
  shooting, slide tackles, knock-ons, manual + automatic player switching.
- AI teammates (spacing, support runs, formation shape), AI opponents
  (pressing, passing, shooting, difficulty-scaled speed/aggression), and
  goalkeepers (positioning, diving saves, collecting, distribution).
- Ball physics with bounce, friction, loft, interceptions, and deflections.
- Broadcast camera with lookahead, stadium intro orbit, goal close-up,
  and cinematic replay camera.
- Presentation: lineup screen, animated goal banner, slow-motion replay,
  scoreboard, match clock, radar minimap, controlled-player indicator, "YOU"
  marker, crowd that bounces when excited, synthesized match audio.
- Keyboard + gamepad support with live input-source indicator.
- FABLE MARKET prediction exchange: four live markets, model-driven odds that
  react to score/time/territory/possession, YES/NO shares, cash-out,
  positions with live P&L, activity feed, persistent wallet, broke-faucet.

## Known limitations

- Avatar face is a photo-textured stylized head, not a reconstructed 3D face mesh
  (automatic single-photo 3D face generation isn't feasible fully client-side
  without heavyweight ML models).
- Simplified rules: no offside, fouls, cards, or set-piece walls; corners and
  throw-ins are quick-restart placements.
- Procedural skeletal animation (no motion-captured clips).
- Single fixed formation (4-3-3) and one stadium.
- Replay uses a 30 Hz transform buffer, so very fast ball motion can look stepped.
- Market prices track the model directly (no order book or trade impact);
  cash-out uses the model price rather than bid/ask spread.

## Recommended next improvements

1. Offside + foul detection with free kicks and penalties.
2. GLTF character models with mocap animation clips (shared `AnimationMixer` clips).
3. Formation/tactics selector and player attribute ratings.
4. Tournament mode: group stage + knockout bracket for the FABLE CUP.
5. ML-based face landmark fitting (e.g. MediaPipe) to shape the head mesh.
6. Networked multiplayer via WebRTC data channels.

---

## Manual gameplay verification checklist

- [ ] Launch `npm run dev`, page loads with the FABLE CUP onboarding.
- [ ] Upload a photo; face appears on the preview avatar; sliders adjust crop.
- [ ] Change name/number/team/kit/skin/hair — the preview updates immediately.
- [ ] "ENTER THE FABLE CUP" shows the lineup with your name highlighted.
- [ ] Kick off: whistle plays, clock runs, you control your player (yellow marker).
- [ ] WASD moves, Shift sprints, Space passes to a sensible teammate.
- [ ] Hold F: power bar fills; release: shot flies toward goal.
- [ ] Score: GOAL banner + celebration + crowd roar + slow-mo replay, then kickoff.
- [ ] Q/Tab switches to the teammate nearest the ball; "YOU" marker stays on your avatar.
- [ ] R slide tackles and can win the ball from a dribbling opponent.
- [ ] Opponents attack your goal; your keeper positions, dives, and distributes.
- [ ] Ball over a sideline gives the correct throw-in restart; over the goal line
      gives goal kick or corner.
- [ ] Halftime at 45:00 with side swap; second half kicks off correctly.
- [ ] Esc pauses; resume/restart/new-player all work.
- [ ] Full time shows the result screen; REMATCH starts a fresh match.
- [ ] Connect a controller: HUD shows GAMEPAD; all mapped buttons work.
- [ ] FABLE MARKET chip opens the exchange; prices tick while the match runs.
- [ ] Place a YES bet; balance drops; the position shows live value + P&L.
- [ ] Score a goal: next-goal market resolves, a new one spawns, your
      "to score" market pays out if you scored it.
- [ ] Cash out an open position; balance increases by the shown value.
- [ ] Full time settles every market; rematch refunds any open stakes.
