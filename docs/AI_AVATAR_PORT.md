# AI Avatar Generation (ported from FABLE CUP handoff)

Source of truth for the architecture: `fifagame/handoff/README.md` +
`RUNBOOK.md` in the sibling repo. This file records only what differs here.

## What was added

| File | Role |
|---|---|
| `scripts/lib/avatar_service.mjs` | The brain: Cerebras spec + codegen + dry-run validation + cache |
| `vite.config.js` | Dev middleware: `POST /generate-avatar` |
| `api/generate-avatar.js` + `vercel.json` | Same endpoint as a Vercel function |
| `src/avatar/generated.js` | Client gate + `buildCustomOrStandard()` fallback wrapper |
| `src/ui/screens.js` | Upload fires AI request; customize screen applies spec/code async |
| `src/game/match.js` | User slot builds via `buildCustomOrStandard` |

## Differences from the FABLE CUP implementation

1. **Free-hex skin/hair** — this game supports arbitrary hex (photo sampler),
   so the spec asks for hex + regex sanitisation instead of palette enums.
   Result: noticeably better colour fidelity.
2. **Rig contract** — `parts.head` (not `headPivot`), pivots at
   arms (±0.31, 1.38) / legs (±0.13, 0.62), torso mesh y=1.12 with a
   canvas kit TEXTURE. Generated code must NOT recolour/replace the torso.
3. **Local sampler kept** — `src/avatar/sampler.js` still runs instantly and
   offline; the AI result lands asynchronously and overrides when ready.
   Skip button = fully local, no upload (privacy copy updated honestly).
4. **Team matching** — spec `team_id` (arg/esp/bra/fra/ger/ned) sets
   `app.homeTeamId` when the AI resolves.

## Run

```powershell
$env:CEREBRAS_API_KEY = 'csk-...'
npm run dev
# test:
python ../fifagame/handoff/test_generate.py --url http://localhost:5173
```

Deploy: `vercel link`, add `CEREBRAS_API_KEY` env (production), `vercel --prod`.
