# CLAUDE.md

Guidance for Claude Code working in this repo. `README.md` is the long-form
document and is kept genuinely current — read the section it points to before
changing behaviour it describes.

## What this is

A static site for the GG Age of Empires II clan (in-game tag `lggl`).
**No build step, no dependencies, no backend, no package.json.** Every number on
the page is fetched at runtime — either from a generated snapshot under
`data/public/` or live from the AoE2 Companion public API.

## Commands

```bash
node tools/update.mjs        # API -> data/raw   (the only thing that goes out; --full re-walks history)
node tools/build.mjs         # data/raw -> data/public  (pure, offline, ~1s)
python -m http.server 4173   # serve; or use the "gg-site" launch.json config (npx serve, port 4321)
```

Run `node tools/test-data.mjs` after building the snapshot. There is no linter
or formatter. Verify UI changes by serving the site and looking at it. `index.html` also works opened directly over `file://`
— that constraint is why the browser scripts are plain scripts, not ES modules.

## Layout

```
index.html                page markup, all section ids the JS binds to
assets/css/styles.css     all styling; tokens in :root at the top
assets/js/data.js         global `CLAN` — the only content file
assets/js/aoe.js          global `window.AOE` — all ladder/match data
assets/js/discord.js      live "who's online" from the server widget
assets/js/main.js         one IIFE, six numbered sections, all rendering
tools/update.mjs          API -> data/raw
tools/build.mjs           data/raw -> data/public
data/raw/                 the store — COMMITTED, never served
data/public/              generated, gitignored (un-ignore if Pages deploys from a branch)
```

## Conventions

- **Browser JS is ES5 on purpose**: `var`, `function` expressions, no arrows, no
  `const`/`let`, no template literals, no modules. Match it. `tools/*.mjs` is
  modern ESM (Node 18+, built-in `fetch`, zero deps) — keep it dependency-free.
- Files carry a block comment at the top explaining *why* the thing works the
  way it does, and inline comments explain decisions rather than syntax. New
  code should read the same way; when you change a decision a comment records,
  update the comment.
- `main.js` is organised as numbered sections (`1. Static content` …
  `6. Live Discord presence`). Put new rendering in the section it belongs to.
- Escape anything interpolated into HTML with the local `esc()` in `main.js`.
- Colours, spacing, fonts and the type floor are CSS custom properties at the
  top of `styles.css`. Change tokens, not call sites. `--dim` is held at 5.6:1+
  contrast and `--fs-micro` (12px) is the smallest text on the page — don't
  regress either.

## Data flow

`aoe.js` exposes `AOE.{fetchRoster, fetchProfiles, fetchClanFeed,
fetchCountryTotal, fetchPlayerDetail, fetchFullHistory, warband, tally,
durationStats, form, snapshot, snapshotNow}`.

Every fetch goes through `preferSnapshot(fromFiles, fromApi)`: read
`data/public/` first, fall back to the live API if the probe of
`data/public/meta.json` fails, the snapshot is for a different clan tag, it
predates a ladder change, or a file read throws. **Both paths must hand back
identical shapes** — nothing downstream is allowed to know which one answered.
When you add a snapshot-backed endpoint, add its live counterpart too; the live
path is what runs on a fresh clone and over `file://`.

`MATCH_PAGE = 300` in `aoe.js` and `PAGE_SIZE = 300` in `tools/build.mjs` must
stay equal, or automatic period loading stops lining up with local pages.

## Invariants — don't break these

- Never hardcode statistics or convert unknown results to losses.
- Keep snapshot and live player/clan result shapes identical; unknown is null.
- Period labels must describe actual coverage. Label partial results and offer
  retry on failure. Read README → Data display before changing filters.
- Match summaries and formats count unique matches. Civ/maps count member
  appearances. Pair keys use IDs; results require agreed outcomes on known teams.
- Opponent-country totals count unique opposing profile IDs with known countries,
  excluding non-clan teammates. Latest games retains unknown and split outcomes.
- Keep README counting rules and the ledger footnote synchronized with code.
- Heavy profile histories remain deferred until a dossier opens.

## Editing content

Everything a non-developer would change lives in `assets/js/data.js`: `discord`,
`discordGuildId`, `clanTag`, `notes` (keyed by exact in-game name), `hidden`,
`cities`, `profileLinks`, `creed`, `warcry`, `motto`, `blurb`, `ladders`. Elo,
ranks, wins and countries are live and must never be typed there.

## Known dead ends

Checked already, don't re-check: aoe2insights.com (Cloudflare + no CORS),
aoestats.io (no CORS), `leaderboard_id` singular on `/matches` (silently
ignored), `rankLevel` (always `1`), any civ/map stats endpoint (doesn't exist),
`/api/civilizations` (returns AoE **IV** data). See README → Source limitations.
