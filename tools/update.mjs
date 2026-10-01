#!/usr/bin/env node
/* ============================================================
   GG CLAN — database updater  (API  ->  SQLite)
   ------------------------------------------------------------
   Fetches recorded clan history into SQLite on the server, so visitors
   read published files instead of requesting source data on page load.

   Run it:
     node tools/update.mjs           incremental — page 1 per player,
                                     stopping at a fully stored page
                                     (~1 match request per inactive player)
     node tools/update.mjs --full    re-walk every player's whole history

   The committed seed makes the first database usable offline. New
   players and --full runs walk history; routine refreshes are incremental.

   The database is changed in one transaction after the refresh succeeds.
   A failed refresh leaves the last successful snapshot available.

   A match is stored under its own id, so re-fetching a game overwrites rather than duplicates,
   and a game two members played together is stored once.

   No dependencies. Node 24+ (fetch and SQLite built in).
   ============================================================ */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
import { openStore, DATABASE_PATH } from "./store.mjs";
let database;
let requestFetch = fetch;

const API = "https://data.aoe2companion.com/api";
const MATCH_PAGE = 300;      // the largest page the service will serve
const MAX_MATCH_PAGES = 40;  // abort before committing if the upstream walk never ends

const args = process.argv.slice(2);
const FULL = args.includes("--full");
const DELAY = numberArg("--delay", 250);   // ms between requests; be a good citizen
const RETRIES = numberArg("--retries", 4);
const RATE_LIMIT_WAIT = numberArg("--cooldown", 15000);  // ms to sit out a 429

function numberArg(name, fallback) {
  const hit = args.find((a) => a.startsWith(name + "="));
  const value = hit ? Number(hit.slice(name.length + 1)) : fallback;
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) throw new Error("Invalid " + name + " value");
  return value;
}

/* ---------- plumbing ---------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let requests = 0;

async function api(url) {
  for (let attempt = 1; ; attempt++) {
    let wait = DELAY * attempt * 4;
    try {
      if (requests++) await sleep(DELAY);
      const res = await requestFetch(url, {
        headers: { "user-agent": "gg-clan-site/snapshot" },
        signal: AbortSignal.timeout(30000)
      });
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

function readJson(file, fallback) {
  return database.getJson(file, fallback);
}

const log = (...parts) => console.log(...parts);

/* CLAN lives in a plain browser script; there is no build step and no
   module system to borrow, so it is read as source and evaluated. */
async function loadClan() {
  const src = await readFile(path.join(ROOT, "assets", "js", "data.js"), "utf8");
  return new Function(src + "\nreturn CLAN;")();
}

/* Matches are keyed by ID in SQLite. Artwork stays in a separate document
   so repeated URLs do not bloat every stored match. */

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
      if (!Array.isArray(payload.players)) throw new Error("Invalid leaderboard payload");
      players = payload.players;
      reached++;
    } catch (err) {
      throw new Error("Leaderboard " + id + " failed: " + err.message);
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

  if (!reached || !members.size) throw new Error("Empty roster — refusing to overwrite the database");
  return [...members.values()];
}

const STEAM_BLANK = "fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb";

function avatarUrl(profile) {
  const hash = profile.avatarhash;
  if (!hash || profile.platform !== "steam" || hash === STEAM_BLANK) return null;
  if (!/^[a-f0-9]{40}$/i.test(hash)) return null;
  return "https://avatars.steamstatic.com/" + hash + "_full.jpg";
}

const toNumber = (v) => (v != null && v !== "" && isFinite(Number(v)) ? Number(v) : null);

async function pullProfiles(ids) {
  const cards = {};
  if (!ids.length) return cards;
  const payload = await api(API + "/profiles?profile_ids=" + ids.join(",") + "&language=en");
  if (!Array.isArray(payload.profiles)) throw new Error("Invalid profile cards payload");
  for (const profile of payload.profiles) {
    cards[profile.profileId] = {
      avatar: avatarUrl(profile),
      platform: profile.platformName || null,
      games: toNumber(profile.games),
      drops: toNumber(profile.drops)
    };
  }
  if (ids.some(id => !cards[id])) throw new Error("Missing profile cards");
  return cards;
}

/* The heavy one: rating history for every ladder this player has games on.
   386 KB for a five-thousand-game account, which is exactly why the site
   should be reading it from disk. */
async function pullPlayerDetail(profileId) {
  const profile = await api(API + "/profiles/" + profileId + "?language=en&page=1");

  if (!profile || !profile.name) throw new Error("Invalid player profile " + profileId);
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

   Incremental runs stop on a page already complete before this refresh.
   New players are walked to the recorded end; hitting the page guard
   rejects the refresh instead of claiming that partial history is complete. */
async function pullPlayerMatches(profileId, store, images, complete, knownStore) {
  let fresh = 0;
  let page = 0;
  let reachedEnd = false;
  let failed = null;
  let stoppedAtKnown = false;
  // Compare against this player's history before this run, not matches just
  // fetched for another member. In-progress matches must be revisited.
  const known = new Set([...knownStore.values()].filter(match => match.finished &&
    match.players.some(player => player.profileId === profileId)).map(match => String(match.matchId)));

  while (page < MAX_MATCH_PAGES) {
    page++;
    let list;
    try {
      const payload = await api(
        API + "/matches?profile_ids=" + profileId +
        "&language=en&page=" + page + "&per_page=" + MATCH_PAGE
      );
      if (!Array.isArray(payload.matches)) throw new Error("Invalid match payload");
      list = payload.matches;
    } catch (err) {
      // The caller rejects the entire refresh before committing this store.
      failed = err.message;
      page--;
      break;
    }

    let newHere = 0;
    for (const match of list) {
      if (match.matchId == null || !Array.isArray(match.teams)) throw new Error("Invalid match record");
      const key = String(match.matchId);
      if (!store.has(key)) newHere++;
      // Overwrite: a game stored while still in progress gains its `finished`.
      store.set(key, trimMatch(match, images));
    }
    fresh += newHere;

    if (list.length < MATCH_PAGE) { reachedEnd = true; break; }
    if (!FULL && complete && list.every(match => known.has(String(match.matchId)))) {
      stoppedAtKnown = true;
      break;
    }
  }

  return { fresh, pages: page, complete: !failed && (reachedEnd || stoppedAtKnown), failed };
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

/* Discord is optional. Keep its own timestamp when a transient failure
   retains an older widget; a disabled widget clears the published panel. */
async function pullDiscord(guildId) {
  if (!guildId) return null;
  try {
    const response = await requestFetch("https://discord.com/api/guilds/" + encodeURIComponent(guildId) + "/widget.json", {
      signal: AbortSignal.timeout(30000)
    });
    if (response.status === 403 || response.status === 404) return { guildId, payload: null, updatedAt: new Date().toISOString() };
    if (!response.ok) throw new Error("HTTP " + response.status);
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.members)) throw new Error("Invalid Discord widget");
    return { guildId, payload, updatedAt: new Date().toISOString() };
  } catch (error) {
    log("  ! Discord widget: " + error.message);
    const previous = readJson("discord.json", null);
    return previous && previous.guildId === guildId ? previous : null;
  }
}

/* No database writes happen during requests. The only commit is after all
   required roster, profile and match requests succeed. */
export async function main({ databasePath = DATABASE_PATH, fetcher = fetch } = {}) {
  const started = Date.now();
  requests = 0;
  requestFetch = fetcher;
  database = await openStore(databasePath);
  try {
    const clan = await loadClan();
    const ladderIds = clan.ladders.map((l) => l.id);
    log("GG database · clan " + clan.clanTag + (FULL ? " · FULL re-walk" : " · incremental"));

    const meta = readJson("meta.json");
    const images = readJson("images.json");
    const store = database.loadMatches();
    const knownStore = new Map(store);
    log("  database opened: " + store.size + " matches");
    if (meta.clanTag !== clan.clanTag) throw new Error("Database belongs to another clan");

    const roster = await pullRoster(clan.clanTag, ladderIds);
    log("  roster: " + roster.length + " members");
    const ids = roster.map((m) => m.profileId);
    const profiles = await pullProfiles(ids);
    const documents = {};
    const players = {};
    for (const member of roster) {
      const was = meta.players ? meta.players[member.profileId] : null;
      const detail = await pullPlayerDetail(member.profileId);
      documents["players/" + member.profileId + ".json"] = detail;
      const walk = await pullPlayerMatches(member.profileId, store, images, Boolean(was && was.historyComplete), knownStore);
      if (walk.failed) throw new Error("Matches for " + member.name + " failed: " + walk.failed);
      if (!walk.complete) throw new Error("History page limit reached for " + member.name + "; database not changed");
      players[member.profileId] = {
        name: member.name,
        historyComplete: walk.complete,
        allTimeGames: detail.allTimeGames,
        updatedAt: new Date().toISOString()
      };
      log("  " + member.name + " +" + walk.fresh + " new (" + walk.pages + " pages)");
    }

    const countryTotals = await pullCountryTotals(roster, ladderIds);

    const total = store.size;
    Object.assign(documents, {
      "roster.json": roster,
      "profiles.json": profiles,
      "images.json": images,
      "countries.json": countryTotals,
      "discord.json": await pullDiscord(clan.discordGuildId),
      "meta.json": {
        clanTag: clan.clanTag,
        ladders: clan.ladders,
        updatedAt: new Date().toISOString(),
        matches: total,
        members: roster.length,
        players
      }
    });
    database.commit(documents, store);

    log("done · " + total + " matches · " + requests + " requests · " +
        ((Date.now() - started) / 1000).toFixed(1) + "s");
    log("next: node tools/build.mjs");
  } finally { database.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("update failed: " + err.message);
    process.exitCode = 1;
  });
}
