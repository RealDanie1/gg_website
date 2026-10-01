#!/usr/bin/env node
/* ============================================================
   GG CLAN — snapshot updater  (API  ->  data/raw)
   ------------------------------------------------------------
   Pulls every match every clan member has ever played and keeps
   it in a local store, so the site can render lifetime numbers
   from disk instead of paying for them on every page load.

   Run it:
     node tools/update.mjs           incremental — page 1 per player,
                                     stopping at the first game already
                                     in the store (~1 request each)
     node tools/update.mjs --full    re-walk every player's whole history

   The FIRST run is the expensive one: it pages each account back to
   its first recorded game, roughly 16 pages for a 4,500-game account.
   After that the store carries the weight and this is nearly free.

   Nothing here is clever about correctness: a match is stored under
   its own id, so re-fetching a game overwrites rather than duplicates,
   and a game two members played together is stored once.

   No dependencies. Node 18+ (fetch built in).
   ============================================================ */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RAW = path.join(ROOT, "data", "raw");

const API = "https://data.aoe2companion.com/api";
const MATCH_PAGE = 300;      // the largest page the service will serve
const MAX_MATCH_PAGES = 40;  // guard, same as assets/js/aoe.js

const args = process.argv.slice(2);
const FULL = args.includes("--full");
const DELAY = numberArg("--delay", 250);   // ms between requests; be a good citizen
const RETRIES = numberArg("--retries", 4);
const RATE_LIMIT_WAIT = numberArg("--cooldown", 15000);  // ms to sit out a 429

function numberArg(name, fallback) {
  const hit = args.find((a) => a.startsWith(name + "="));
  return hit ? Number(hit.slice(name.length + 1)) : fallback;
}

/* ---------- plumbing ---------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let requests = 0;

async function api(url) {
  for (let attempt = 1; ; attempt++) {
    let wait = DELAY * attempt * 4;
    try {
      if (requests++) await sleep(DELAY);
      const res = await fetch(url, { headers: { "user-agent": "gg-clan-site/snapshot" } });
      if (!res.ok) {
        /* 429 is the one worth waiting properly for. A full history walk is
           sixteen quick pages and the service will say when it has had
           enough; a one-second retry just spends the next refusal. */
        if (res.status === 429) {
          const after = Number(res.headers.get("retry-after"));
          wait = (isFinite(after) && after > 0 ? after * 1000 : RATE_LIMIT_WAIT * attempt);
        }
        throw new Error("HTTP " + res.status);
      }
      return await res.json();
    } catch (err) {
      if (attempt > RETRIES) throw new Error(url + " -> " + err.message);
      // Backing off rather than hammering: the far end is somebody else's free service.
      await sleep(wait);
    }
  }
}

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(path.join(RAW, file), "utf8")); }
  catch { return fallback; }
}

async function writeJson(file, value) {
  const full = path.join(RAW, file);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, JSON.stringify(value, null, 2) + "\n");
}

const log = (...parts) => console.log(...parts);

/* CLAN lives in a plain browser script; there is no build step and no
   module system to borrow, so it is read as source and evaluated. */
async function loadClan() {
  const src = await readFile(path.join(ROOT, "assets", "js", "data.js"), "utf8");
  return new Function(src + "\nreturn CLAN;")();
}

/* ---------- the match store ----------
   One match per line, newest first. Line-oriented so a day of new games
   is a handful of added lines in a diff rather than a rewritten file,
   and so the store stays greppable. Civ and map artwork is deduped into
   images.json — the same two dozen URLs would otherwise repeat on every
   one of twenty thousand rows. */

async function loadMatches() {
  const store = new Map();
  let text = "";
  try { text = await readFile(path.join(RAW, "matches.ndjson"), "utf8"); }
  catch { return store; }

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const match = JSON.parse(line);
    store.set(String(match.matchId), match);
  }
  return store;
}

async function saveMatches(store) {
  const rows = [...store.values()].sort(
    (a, b) => dateOf(b) - dateOf(a) || String(b.matchId).localeCompare(String(a.matchId))
  );
  await mkdir(RAW, { recursive: true });
  await writeFile(
    path.join(RAW, "matches.ndjson"),
    rows.map((m) => JSON.stringify(m)).join("\n") + "\n"
  );
  return rows.length;
}

const dateOf = (m) => new Date(m.finished || m.started || 0).getTime() || 0;

/* An API match record, kept down to the fields the site actually reads.
   Mirrors the flattening in assets/js/aoe.js — teams collapse into one
   player list, since `player.team` already says which side each is on. */
function trimMatch(match, images) {
  const players = [];

  (match.teams || []).forEach((team, teamIndex) => {
    (team.players || []).forEach((p) => {
      if (p.civName && p.civImageUrl) images.civs[p.civName] = p.civImageUrl;
      players.push({
        profileId: p.profileId,
        name: p.name || null,
        country: p.country || null,
        team: p.team != null ? p.team : teamIndex,
        civ: p.civName || null,
        rating: p.rating != null ? p.rating : null,
        ratingDiff: p.ratingDiff != null ? p.ratingDiff : null,
        /* null, not false: a scenario records no winner, and the site
           draws that as a dash rather than as a loss. */
        won: p.won != null ? Boolean(p.won) : null
      });
    });
  });

  if (match.mapName && match.mapImageUrl) images.maps[match.mapName] = match.mapImageUrl;

  return {
    matchId: match.matchId,
    ladder: match.leaderboardId || null,
    started: match.started || null,
    finished: match.finished || null,
    map: match.mapName || null,
    players
  };
}

/* ---------- pulls ---------- */

/* Same merge as AOE.fetchRoster: a member who only plays unranked still
   has to appear, so the three boards are unioned on profile id. */
async function pullRoster(clanTag, ladderIds) {
  const members = new Map();
  let reached = 0;

  for (const id of ladderIds) {
    let players = [];
    try {
      const payload = await api(
        API + "/leaderboards/" + id + "?clan=" + encodeURIComponent(clanTag) +
        "&page=1&per_page=100&language=en"
      );
      players = payload.players || [];
      reached++;
    } catch (err) {
      log("  ! leaderboard " + id + " failed: " + err.message);
      continue;
    }

    for (const entry of players) {
      let member = members.get(entry.profileId);
      if (!member) {
        member = {
          profileId: entry.profileId,
          name: entry.name,
          country: entry.country || null,
          clan: entry.clan || null,
          ladders: {}
        };
        members.set(entry.profileId, member);
      }
      if (id === "rm_team") member.name = entry.name;

      member.ladders[id] = {
        rating: entry.rating != null ? entry.rating : null,
        peak: entry.maxRating != null ? entry.maxRating : null,
        rank: entry.rank != null ? entry.rank : null,
        rankCountry: entry.rankCountry != null ? entry.rankCountry : null,
        wins: entry.wins != null ? entry.wins : null,
        losses: entry.losses != null ? entry.losses : null,
        games: entry.games != null ? entry.games : null,
        streak: entry.streak != null ? entry.streak : null,
        lastMatch: entry.lastMatchTime || null,
        winRate: entry.games ? Math.round((entry.wins / entry.games) * 100) : null
      };
    }
  }

  if (!reached) throw new Error("No ladder reachable — refusing to overwrite the store");
  return [...members.values()];
}

const STEAM_BLANK = "fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb";

function avatarUrl(profile) {
  const hash = profile.avatarhash;
  if (!hash || profile.platform !== "steam" || hash === STEAM_BLANK) return null;
  if (!/^[a-f0-9]{40}$/i.test(hash)) return null;
  return "https://avatars.steamstatic.com/" + hash + "_full.jpg";
}

const toNumber = (v) => (isFinite(Number(v)) ? Number(v) : null);

async function pullProfiles(ids) {
  const cards = {};
  if (!ids.length) return cards;
  const payload = await api(API + "/profiles?profile_ids=" + ids.join(",") + "&language=en");
  for (const profile of payload.profiles || []) {
    cards[profile.profileId] = {
      avatar: avatarUrl(profile),
      platform: profile.platformName || null,
      games: toNumber(profile.games),
      drops: toNumber(profile.drops)
    };
  }
  return cards;
}

/* The heavy one: rating history for every ladder this player has games on.
   386 KB for a five-thousand-game account, which is exactly why the site
   should be reading it from disk. */
async function pullPlayerDetail(profileId) {
  const profile = await api(API + "/profiles/" + profileId + "?language=en&page=1");

  const historyByLadder = {};
  for (const entry of profile.ratings || []) {
    const points = entry.ratings || [];
    // Arrives newest-first; charts want oldest-first.
    if (points.length) historyByLadder[entry.leaderboardId] = points.slice().reverse();
  }

  const boards = {};
  for (const entry of profile.leaderboards || []) {
    boards[entry.leaderboardId] = {
      rank: entry.rank != null ? entry.rank : null,
      rating: entry.rating != null ? entry.rating : null,
      games: entry.games != null ? entry.games : null,
      total: entry.total != null ? entry.total : null,
      label: entry.abbreviation || entry.leaderboardName || entry.leaderboardId
    };
  }

  return {
    profileId,
    name: profile.name,
    country: profile.country,
    countryName: profile.countryName || null,
    platform: profile.platformName || null,
    allTimeGames: toNumber(profile.games),
    drops: toNumber(profile.drops),
    boards,
    linked: (profile.linkedProfiles || []).map((alt) => ({
      profileId: alt.profileId,
      name: alt.name,
      games: toNumber(alt.games)
    })),
    historyByLadder
  };
}

/* Walks one player's feed. The service reports no total, so the end of an
   account's history is a page that comes back short.

   Incremental runs stop as soon as a page brings nothing new — the feed is
   newest-first, so everything past that point is already stored. A player
   whose history was never completed is walked to the end regardless, which
   is what makes the first run the only slow one. */
async function pullPlayerMatches(profileId, store, images, complete) {
  let fresh = 0;
  let page = 0;
  let reachedEnd = false;
  let failed = null;

  while (page < MAX_MATCH_PAGES) {
    page++;
    let list;
    try {
      const payload = await api(
        API + "/matches?profile_ids=" + profileId +
        "&language=en&page=" + page + "&per_page=" + MATCH_PAGE
      );
      list = payload.matches || [];
    } catch (err) {
      /* Whatever this walk already put in the store stays there and is
         reported. The player just keeps `historyComplete: false`, so the
         next run walks them again instead of trusting a partial history. */
      failed = err.message;
      page--;
      break;
    }

    let newHere = 0;
    for (const match of list) {
      const key = String(match.matchId);
      if (!store.has(key)) newHere++;
      // Overwrite: a game stored while still in progress gains its `finished`.
      store.set(key, trimMatch(match, images));
    }
    fresh += newHere;

    if (list.length < MATCH_PAGE) { reachedEnd = true; break; }
    if (!FULL && complete && newHere === 0) break;
  }

  return { fresh, pages: page, complete: !failed && (complete || reachedEnd), failed };
}

/* National field sizes, so a rank can read "#19 of 875 in CZ". Cheap, and
   it saves the page three requests on load. */
async function pullCountryTotals(roster, ladderIds) {
  const totals = {};
  const countries = [...new Set(
    roster.map((m) => m.country && m.country.toLowerCase()).filter(Boolean)
  )];

  for (const ladder of ladderIds) {
    for (const country of countries) {
      try {
        const payload = await api(
          API + "/leaderboards/" + ladder + "?country=" + encodeURIComponent(country) +
          "&page=1&per_page=1&language=en"
        );
        if (payload.total != null) totals[ladder + "|" + country] = payload.total;
      } catch { /* decoration; the page falls back to a bare rank */ }
    }
  }
  return totals;
}

/* ---------- run ---------- */

async function main() {
  const started = Date.now();
  const clan = await loadClan();
  const ladderIds = clan.ladders.map((l) => l.id);

  log("GG snapshot · clan " + clan.clanTag + (FULL ? " · FULL re-walk" : " · incremental"));

  const meta = await readJson("meta.json", { players: {} });
  const images = await readJson("images.json", { civs: {}, maps: {} });
  const store = await loadMatches();
  log("  store opened: " + store.size + " matches");

  const roster = await pullRoster(clan.clanTag, ladderIds);
  log("  roster: " + roster.length + " members");

  const ids = roster.map((m) => m.profileId);
  const profiles = await pullProfiles(ids).catch(() => ({}));

  const players = {};
  for (const member of roster) {
    const was = meta.players ? meta.players[member.profileId] : null;
    const complete = Boolean(was && was.historyComplete);

    let detail = null;
    try {
      detail = await pullPlayerDetail(member.profileId);
      await writeJson(path.join("players", member.profileId + ".json"), detail);
    } catch (err) {
      log("  ! profile " + member.name + " failed: " + err.message);
    }

    const walk = await pullPlayerMatches(member.profileId, store, images, complete);
    if (walk.failed) log("  ! matches " + member.name + " stopped: " + walk.failed);

    players[member.profileId] = {
      name: member.name,
      historyComplete: Boolean(walk.complete),
      allTimeGames: detail ? detail.allTimeGames : was ? was.allTimeGames : null,
      updatedAt: new Date().toISOString()
    };

    /* Flushed per player, not once at the end. The first run is a few
       minutes of somebody else's rate limits; a failure eight players in
       should cost the ninth, not the eight. Re-running picks up from the
       stored history flags. */
    await saveMatches(store);
    await writeJson("images.json", images);
    await writeJson("meta.json", {
      clanTag: clan.clanTag,
      ladders: clan.ladders,
      updatedAt: new Date().toISOString(),
      matches: store.size,
      members: roster.length,
      players: Object.assign({}, meta.players, players)
    });

    log("  " + String(member.name).padEnd(18) + " +" + String(walk.fresh).padStart(5) + " new" +
        "  (" + walk.pages + " page" + (walk.pages === 1 ? "" : "s") + ")" +
        (walk.complete ? "" : "  [history incomplete]"));
  }

  const countryTotals = await pullCountryTotals(roster, ladderIds);

  const total = await saveMatches(store);
  await writeJson("roster.json", roster);
  await writeJson("profiles.json", profiles);
  await writeJson("images.json", images);
  await writeJson("countries.json", countryTotals);
  await writeJson("meta.json", {
    clanTag: clan.clanTag,
    ladders: clan.ladders,
    updatedAt: new Date().toISOString(),
    matches: total,
    members: roster.length,
    players
  });

  log("done · " + total + " matches · " + requests + " requests · " +
      ((Date.now() - started) / 1000).toFixed(1) + "s");
  log("next: node tools/build.mjs");
}

main().catch((err) => {
  console.error("update failed: " + err.message);
  process.exit(1);
});
