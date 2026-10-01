# CLAUDE.md

Guidance for Claude Code working in this repo. `README.md` is the long-form
document and is kept genuinely current — read the section it points to before
changing behaviour it describes.

## What this is

A static site for the GG Age of Empires II clan (in-game tag `lggl`).
**No frontend build, no npm dependencies, no runtime backend.** SQLite is the
durable store; GitHub Actions refreshes it daily and publishes JSON snapshots.
Browsers read only `data/public/`; never add an external data API fallback.

## Commands

```bash
node tools/update.mjs        # server APIs -> SQLite (--full rechecks history)
node tools/build.mjs         # SQLite -> data/public (offline; initializes from seed)
node tools/package.mjs       # publishable files -> dist
python3 -m http.server 4173 --directory dist # serve the packaged website
```

Use Node 24+. Run `node tools/test-data.mjs` after building the snapshot and
`node tools/test-store.mjs --delay=0 --retries=0` for database/updater changes. There is no linter
or formatter. Verify UI changes by serving the site and looking at it. Also verify opening `index.html` directly: generated script copies load the
same snapshot over `file://`. Browser scripts remain plain scripts.

## Layout

```
index.html                page markup, all section ids the JS binds to
assets/css/styles.css     all styling; tokens in :root at the top
assets/js/data.js         global `CLAN` — the only content file
assets/js/snapshot.js     shared JSON/file-preview snapshot reader
assets/js/aoe.js          global `window.AOE` — stored ladder/match data
assets/js/discord.js      stored Discord widget with its own timestamp
assets/js/main.js         one IIFE, six numbered sections, all rendering
tools/update.mjs          server APIs -> SQLite
tools/build.mjs           SQLite -> data/public
tools/store.mjs           SQLite schema, migration and atomic writes
tools/package.mjs         safe Pages artifact -> dist
.github/workflows/pages.yml scheduled refresh, persistence and publication
data/raw/                 initial seed — COMMITTED, never served
data/gg.sqlite            local database — IGNORED; persisted on data-store branch
data/public/              generated, gitignored; published only through dist/
```

## Conventions

- **Browser JS is ES5 on purpose**: `var`, `function` expressions, no arrows, no
  `const`/`let`, no template literals, no modules. Match it. `tools/*.mjs` is
  modern ESM (Node 24+, built-in `fetch` and `node:sqlite`, zero deps) — keep it dependency-free.
- Files carry a block comment at the top explaining *why* the thing works the
  way it does, and inline comments explain decisions rather than syntax. New
  code should read the same way; when you change a decision a comment records,
  update the comment.
- `main.js` is organised as numbered sections (`1. Static content` …
  `6. Stored Discord presence`). Put new rendering in the section it belongs to.
- Escape anything interpolated into HTML with the local `esc()` in `main.js`.
- Colours, spacing, fonts and the type floor are CSS custom properties at the
  top of `styles.css`. Change tokens, not call sites. `--dim` is held at 5.6:1+
  contrast and `--fs-micro` (12px) is the smallest text on the page — don't
  regress either.

## Data flow

`aoe.js` exposes `AOE.{fetchRoster, fetchProfiles, fetchClanFeed,
fetchCountryTotal, fetchPlayerDetail, fetchFullHistory, warband, tally,
durationStats, form, snapshot, snapshotNow}`.

Every data fetch reads `data/public/`. HTTP pages use JSON; direct `file://`
previews load matching generated `.js` copies through `GG_SNAPSHOT`. Missing files, another clan tag or
missing ladder coverage must fail or omit optional decoration locally. Never
contact AoE2 Companion or Discord APIs from browser scripts, including retries,
profile expansion and full-history controls. Only `tools/update.mjs` fetches
upstream data. A refresh commits once after every required response succeeds;
failed jobs preserve the existing database and live deployment.

Only `dist/` is uploaded to Pages. Keep raw data, SQLite and tools out of it.
The `data-store` branch retains the database between scheduled runs; do not
replace it with an expiring cache. Source pushes publish without upstream
refresh; daily and manual refresh jobs update the data on GitHub's server.

`MATCH_PAGE = 300` in `aoe.js` and `PAGE_SIZE = 300` in `tools/build.mjs` must
stay equal, or automatic period loading stops lining up with local pages.

## Invariants — don't break these

- Never hardcode statistics or convert unknown results to losses.
- Keep player/clan result shapes consistent; unknown is null.
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
ranks, wins and countries are server-fetched and must never be typed there.

## Known dead ends

Checked already, don't re-check: aoe2insights.com (Cloudflare + no CORS),
aoestats.io (no CORS), `leaderboard_id` singular on `/matches` (silently
ignored), `rankLevel` (always `1`), any civ/map stats endpoint (doesn't exist),
`/api/civilizations` (returns AoE **IV** data). See README → Source limitations.
