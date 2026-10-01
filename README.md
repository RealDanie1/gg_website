# GG Clan website

A static Age of Empires II site for the `lggl` clan tag. Plain HTML, CSS and JavaScript; no frontend build, package install or backend.

## Run and verify

```sh
node tools/build.mjs         # data/raw -> data/public, offline
python -m http.server 4173   # local preview
node tools/test-data.mjs     # offline regression checks (build first)
node --check assets/js/main.js
node --check assets/js/aoe.js
```

Open `http://localhost:4173`. Opening `index.html` directly over `file://` falls back to the public API if the browser blocks local snapshot reads.

## Data display

- **Period controls:** 30 days, 90 days, Year (365 days), All recorded history. Roster activity and the clan ledger share the period, ending at page-load time. Pages load automatically until the selected boundary is covered or the source is exhausted. Changing period during loading changes the next boundary. Loaded pages are cached. Incomplete periods are labelled and failures offer a retry. All means all recorded history available from the source, not guaranteed complete career coverage.
- **Roster:** choose a ladder and sort by rating, rating change or recent activity. Current rating and win rate are lifetime ladder figures. Change sums recorded Elo adjustments within the selected period/ladder, excluding AI and unknown results; it is not a difference between official rating snapshots. The sparkline shows up to 20 recent ratings. Last played uses the ladder last-match date with a loaded-feed fallback. Form follows the selected period and ladder, newest first. Missing change data displays a dash.
- **Dossiers:** expand a player for their profile, linked accounts, peak, rating history and civ/map tables. Dossier mode and rating-chart controls are independent of the roster. Chart windows remain 1M / 6M / 1Y / All. Player tables initially cover their latest 300 matches; Load all games requests deeper history. Captions state the local coverage. Unknown results and AI games are excluded from result tables and duration summaries.
- **Ledger:** the mode filter controls all panels. Summary cards show match win rate, unique matches, active roster accounts and average/median duration. Alternate accounts remain separate accounts. The previous sum of lifetime ladder games was removed from this period summary because it counted shared matches repeatedly.
- **Civs/maps:** labelled tables with artwork, quiet volume bars, picks/appearances, percentages and W/L totals. Most played is the default. Highest win rate requires at least 10 appearances. Small sample means fewer than 10; the threshold is a browsing aid, not a confidence claim.
- **Warband:** six most-played pairs appear first, with Show all pairs for the rest. Select a pair to see favourite shared maps and filter Latest games. Clear pair restores the clan feed. Other panels retain the clan-wide scope. Date/mode changes clear pair selection. Shared match lists include unknown results, while pair W/L totals require agreed recorded results.
- **Freshness:** the roster and ledger show the snapshot date, Live data, or Snapshot + live fallback. Discord presence is independently live and includes bots exposed by the widget.

## Counting rules

`state.games` contains unique matches; `state.feed` contains roster-account appearances.

- Match win rate and duration exclude AI, unknown clan outcomes and split clan outcomes. Four members winning together count as one clan win.
- Civ/map tables count non-AI member appearances with recorded results. Two members picking two civs contribute two picks. Player dossier tables count one player's games.
- Formats count decided, balanced, two-sided matches once each.
- Pair results require a known shared team and matching non-null results; AI games are excluded. Keys use profile IDs so name changes do not split partnerships. Pairs need two decided games to appear.
- Opponent-country totals deduplicate profile IDs across selected games and exclude non-clan teammates, AI games, unknown teams and unknown countries. Captions identify known-country coverage.
- Latest games preserves unknown and split outcomes with neutral markers. Missing results remain null throughout clan and player data paths.

## Files and editable content

| File | Purpose |
| --- | --- |
| `index.html` | Structure and explanatory copy |
| `assets/css/styles.css` | Colour/type tokens and responsive layout |
| `assets/js/data.js` | Clan tag, Discord links, gallery captions, player notes and other copy |
| `assets/js/aoe.js` | Snapshot-first data access, API fallback and aggregations |
| `assets/js/main.js` | Rendering and interactions |
| `assets/js/discord.js` | Public Discord widget |
| `tools/update.mjs` | Incremental API -> raw snapshot; `--full` refreshes all history |
| `tools/build.mjs` | Raw -> public snapshot, restoring artwork and paginating matches |
| `tools/test-data.mjs` | Offline regression checks |

The visual identity uses black, bone and red, Bebas Neue headings, Inter body/data labels and selected IBM Plex Mono metadata. Win/loss indicators include W/L text. Gallery stories in `data.js` are flavour copy, not verified build credits.

## Snapshot and deployment

```sh
node tools/update.mjs
node tools/build.mjs
```

`data/raw` is committed. `data/public` is generated and ignored by Git; build before deployment. The first update walks every member's history, and later updates stop at stored matches. NDJSON stores matches once by ID, allowing small incremental Git changes.

A hosting workflow can update the raw snapshot on a schedule and build before deployment. For branch-based GitHub Pages without a build, remove `data/public/` from `.gitignore` and commit generated files. No remote or deployment destination is configured automatically.

If both sources fail, show unavailable/incomplete data rather than invented statistics. Discord requires Enable Server Widget in its server settings; if unavailable, its presence panel hides and the join link remains.

## Source limitations

AoE2 Companion supplies public ladder, profile and match data. The plural profiles endpoint provides lightweight identity cards; singular profile histories are deferred until a dossier opens. The Companion profile links are configured in `data.js`; the AoE2 Insights URL pattern remains unverified behind its bot check. The Discord widget may publish an invite different from the configured clan invite.

Previously investigated sources to avoid: aoe2insights.com blocks automated access, aoestats.io lacks usable CORS, the matches API ignores singular `leaderboard_id`, `rankLevel` is not useful, and `/api/civilizations` refers to AoE IV rather than AoE II.
