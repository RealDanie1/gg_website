# GG Clan website

A static Age of Empires II site for the `lggl` clan tag. Plain HTML, CSS and JavaScript, backed by a SQLite database refreshed on GitHub’s servers. Visitors read published JSON files; page loads, filters, dossiers and retries never contact the AoE2 Companion or Discord data APIs.

## Run and verify

```sh
node tools/build.mjs         # SQLite -> data/public, offline (imports seed on first run)
node tools/package.mjs       # publishable files only -> dist
python3 -m http.server 4173 --directory dist # local preview
node tools/test-data.mjs     # offline browser data checks (build first)
node tools/test-store.mjs --delay=0 --retries=0 # offline updater/database checks
node --check assets/js/main.js
node --check assets/js/aoe.js
```

Use Node 24 or newer for the tools; SQLite and fetch are built in, with no npm installation required. Open `http://localhost:4173`. You can also open `index.html` directly after building. Local `file://` previews load generated script copies of the saved JSON; hosted pages load the JSON files. Both use the same database snapshot, with no live API fallback.

## Data display

- **Period controls:** 30 days, 90 days, Year (365 days), All recorded history. Roster activity and the clan ledger share the period, ending at the server snapshot date. Pages load automatically until the selected boundary is covered or the source is exhausted. Changing period during loading changes the next boundary. Loaded pages are cached. Incomplete periods are labelled and failures offer a retry. All means all recorded history available from the source, not guaranteed complete career coverage.
- **Roster:** choose a ladder and sort by rating, rating change or recent activity. Current rating and win rate are lifetime ladder figures. Change sums recorded Elo adjustments within the selected period/ladder, excluding AI and unknown results; it is not a difference between official rating snapshots. The sparkline shows up to 20 recent ratings. Last played uses the ladder last-match date with a loaded-feed fallback. Form follows the selected period and ladder, newest first. Missing change data displays a dash.
- **Dossiers:** expand a player for their profile, linked accounts, peak, rating history and civ/map tables. Dossier mode and rating-chart controls are independent of the roster. Chart windows remain 1M / 6M / 1Y / All. Player tables initially cover their latest 300 matches; Show all stored games displays the saved history without an API request. Captions state the local coverage. Unknown results and AI games are excluded from result tables and duration summaries.
- **Ledger:** the mode filter controls all panels. Summary cards show match win rate, unique matches, active roster accounts and average/median duration. Alternate accounts remain separate accounts. The previous sum of lifetime ladder games was removed from this period summary because it counted shared matches repeatedly.
- **Civs/maps:** labelled tables with artwork, quiet volume bars, picks/appearances, percentages and W/L totals. Most played is the default. Highest win rate requires at least 10 appearances. Small sample means fewer than 10; the threshold is a browsing aid, not a confidence claim.
- **Warband:** six most-played pairs appear first, with Show all pairs for the rest. Select a pair to see favourite shared maps and filter Latest games. Clear pair restores the clan feed. Other panels retain the clan-wide scope. Date/mode changes clear pair selection. Shared match lists include unknown results, while pair W/L totals require agreed recorded results.
- **Freshness:** the roster and ledger show the last successful server refresh date. Period and chart windows end at that date. Discord shows who was online at its own snapshot date, including bots exposed by the widget. If a transient widget failure retains an older snapshot, its original date is preserved; a disabled widget hides the panel.

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
| `assets/js/snapshot.js` | Shared JSON reader with direct-file snapshot loading |
| `assets/js/aoe.js` | Published snapshot reads and aggregations |
| `assets/js/main.js` | Rendering and interactions |
| `assets/js/discord.js` | Stored Discord widget |
| `tools/update.mjs` | Server-only incremental API -> SQLite; `--full` rechecks all history |
| `tools/build.mjs` | SQLite -> public JSON, restoring artwork and paginating matches |
| `tools/store.mjs` | SQLite schema, seed migration and atomic commits |
| `tools/package.mjs` | Publishable assets and JSON -> `dist/` |
| `tools/test-store.mjs` | Offline refresh, failure and transaction checks |
| `.github/workflows/pages.yml` | Daily server refresh, persistence, validation and Pages deployment |
| `tools/test-data.mjs` | Offline regression checks |

The visual identity uses black, bone and red, Bebas Neue headings, Inter body/data labels and selected IBM Plex Mono metadata. Win/loss indicators include W/L text. Gallery stories in `data.js` are flavour copy, not verified build credits.

## Database and daily refresh

```sh
node tools/update.mjs       # fetch new data on the server
node tools/build.mjs        # export the database, offline
node tools/package.mjs      # prepare the publishable website
```

`data/gg.sqlite` is the durable database. It contains deduplicated matches and JSON documents for roster, identities, player details, artwork, countries, metadata and the Discord widget. Existing committed `data/raw/` files seed the first database offline, preserving 9,038 saved matches and their original September 4, 2026 timestamp. Seed files are migration input, not the ongoing store. Override the database location with `GG_DATABASE_PATH` when needed.

Updates fetch current ladders, cards and player details, then walk each account’s new matches until a previously saved, completed page is reached. New members get a complete recorded-history walk. Rate limits use retries and backoff; requests have timeouts. A missing required response, malformed payload or history page limit aborts the refresh before its single SQLite transaction. Optional country totals may be omitted and Discord can retain its separately dated snapshot. A failed scheduled run does not deploy, so visitors keep the previous successful site.

`data/public/` contains JSON files and matching `.js` snapshot copies for direct-file previews. The browser loads only the files needed for the selected period or player. `data/public/` and `dist/` are generated and ignored by Git. Only `dist/` is published: it contains `index.html`, assets and public JSON, excluding the SQLite database, raw seed, source tools and Git files.

## GitHub Pages publication

The workflow `.github/workflows/pages.yml` validates pull requests offline. A push to `main` builds and publishes from the existing database without fetching new API data. The daily schedule runs at **04:17 UTC** (06:17 Europe/Prague during summer time, 05:17 in winter). GitHub schedules can be delayed and may be disabled after extended repository inactivity; check the Actions tab for failures or disabled schedules. See [GitHub’s schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

The database is restored from and saved to the dedicated `data-store` branch on every production run. It survives runner shutdown and does not depend on an expiring Actions cache or artifact. Each database commit keeps the previous commit as a parent, allowing recovery. Production jobs are serialized to avoid competing database writes. The branch is never included in the Pages deployment. Do not delete it unless you intend to reset the database to the committed seed.

To publish for the first time:

1. Create the public `RealDanie1/gg_website` GitHub repository and push this checkout’s `main` branch.
2. In repository **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source. See [GitHub’s Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
3. Let **Publish website and refresh daily** finish. If the first push ran before Pages was enabled, rerun the workflow.
4. In **Actions**, run that workflow manually with **Fetch fresh data before publishing** enabled to replace the seed immediately. Subsequent daily runs refresh automatically. **Recheck all recorded match history** is optional and slower; it implies selecting refresh too.

The normal project URL is `https://realdanie1.github.io/gg_website/` after deployment succeeds. There are no API keys or external database subscriptions. The workflow needs repository-content writes for its database branch, Pages writes and the Pages identity token, matching [GitHub’s custom Pages workflow requirements](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

To use the hosted database locally after scheduled updates:

```sh
git fetch origin data-store
git show origin/data-store:gg.sqlite > data/gg.sqlite
node tools/build.mjs
node tools/package.mjs
```

If a published file is missing, show unavailable/incomplete data and allow local-file retry. Never fall back to external APIs or trigger refresh from a visitor request. Discord requires Enable Server Widget in its server settings; if unavailable, its presence panel hides and the join link remains.

## Source limitations

AoE2 Companion supplies public ladder, profile and match data. The plural profiles endpoint provides lightweight identity cards; the server saves singular profile histories during scheduled refreshes, while browsers load those saved player files when a dossier opens. The Companion profile links are configured in `data.js`; the AoE2 Insights URL pattern remains unverified behind its bot check. The Discord widget may publish an invite different from the configured clan invite.

Previously investigated sources to avoid: aoe2insights.com blocks automated access, aoestats.io lacks usable CORS, the matches API ignores singular `leaderboard_id`, `rankLevel` is not useful, and `/api/civilizations` refers to AoE IV rather than AoE II.
