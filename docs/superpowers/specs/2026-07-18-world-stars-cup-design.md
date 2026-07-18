# World Stars Cup — Design Spec (2026-07-18)

Browser-based 3D arcade football vertical slice. Upload a photo → get a personalized
low-poly footballer → play a 7v7 World-Cup-style match. Original fictional branding
("World Stars Cup"), national-team-inspired original kits, no licensed assets.

## Approved decisions
- **Stack:** Three.js + Vite (vanilla JS, ES modules). No physics/audio/art deps.
- **Art:** Smooth low-poly (capsule/sphere primitives, smooth shading), perf-first:
  pixel-ratio cap, single shadow-casting light, instanced crowd, merged stadium geometry.
- **Photo→avatar:** 100% client-side color sampling (skin tone from central face region,
  hair color from top band). Manual customization always available; presets as fallback.
  Photo never leaves the browser.

## Format
- 7v7 (GK + 6 outfield), compressed pitch (~96×60 m), single timed period (3/5/8 min).
- 6 teams (Argentina, Spain, Brazil, France, Germany, Netherlands) with original
  inspired kits (colors/patterns only, no crests/logos).
- Difficulty (Amateur/Pro/Legend) scales AI speed, reaction, pass error, tackle and GK skill.

## Systems
- **Ball:** custom arcade physics (gravity, drag, roll friction, bounce, post/bar/net
  collision). Pure step function, unit-tested.
- **Players:** accel-based movement, sprint + stamina, procedural run/kick/celebrate/dive
  animation on a ~10-mesh rig.
- **Possession:** ball owner dribbles; pass = targeted ground/aerial ball to best teammate
  in input direction; shoot = hold-to-charge with aim assist; tackle = press near carrier,
  difficulty-scaled steal chance.
- **AI:** formation anchors shift with ball; nearest defenders press; carrier dribbles /
  passes under pressure / shoots in range; GK positions + dives on predicted shots.
- **Referee:** kickoff, goals, sideline restarts (quick throw-style), corners/goal kicks,
  clock, full time. Pure boundary-event detection, unit-tested.
- **Camera:** broadcast side view following ball with lead, damped; push-in on goals.
- **Input:** keyboard (WASD/arrows, Shift sprint, J pass/tackle, K hold-shoot/slide,
  L/Q switch, Esc pause, M mute) + standard gamepad (stick, A pass, X shoot, RT sprint,
  LB switch, Start pause).
- **Audio:** WebAudio-synthesized whistle, kicks, crowd bed with excitement swells,
  goal cheer, UI. No audio files. Mute toggle persisted.

## Onboarding flow
Title → photo upload (or skip) → avatar preview/customize (name, number, position,
hair style/color, skin tone, detected colors applied) → team select → opponent select →
match settings (duration, difficulty) → match intro → kickoff.

## Verification
- `node --test` unit tests: ball physics, goal/out detection, photo color sampler,
  pass targeting/AI helpers.
- `npm run build` must pass; dev server smoke via curl.
- Manual checklist in README: avatar creation, keyboard, gamepad, scoring, AI, restart.

## Out of scope (YAGNI)
Fouls/cards, offside, substitutions, weather, career/tournament persistence, online play,
halves/intervals, licensed likenesses or logos.
