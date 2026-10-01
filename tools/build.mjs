#!/usr/bin/env node
/* ============================================================
   GG CLAN — snapshot build  (SQLite  ->  data/public)
   ------------------------------------------------------------
   Turns the store into the exact shapes the browser asks for, so
   assets/js/aoe.js can read a file where it used to make a request.

     node tools/build.mjs

   Pure and offline: it touches no network, so the output can be
   re-shaped as often as you like without going back to the API.

   Two things happen here rather than in the browser:

   1. Paging. The clan feed is cut into pages of 300 in the same
      order the API serves them, so "Load 300 more games" walks
      local files and behaves exactly as it always did.
   2. Artwork. Civ and map image URLs are deduped in the store and
      pasted back on here, which keeps the store small without the
      page needing to know that happened.
   ============================================================ */
import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
import { openStore } from "./store.mjs";
let database;
const PUBLIC = path.join(ROOT, "data", "public");

const PAGE_SIZE = 300;   // matches assets/js/aoe.js MATCH_PAGE

function readJson(file, fallback) {
  return database.getJson(file, fallback);
}

async function writeJson(file, value) {
  const full = path.join(PUBLIC, file);
  await mkdir(path.dirname(full), { recursive: true });
  const json = JSON.stringify(value);
  await writeFile(full, json + "\n");
  // Script copies make local previews work without enabling file:// fetch.
  // JSON.parse preserves JSON semantics, including keys named __proto__.
  const url = "data/public/" + file.split(path.sep).join("/");
  const encoded = JSON.stringify(json).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  await writeFile(full.replace(/\.json$/, ".js"),
    "window.GG_SNAPSHOT.register(" + JSON.stringify(url) + ", JSON.parse(" + encoded + "));\n");
}

const dateOf = (m) => m.finished || m.started || null;

function durationOf(match) {
  if (!match.started || !match.finished) return null;
  const minutes = (new Date(match.finished) - new Date(match.started)) / 60000;
  return isFinite(minutes) && minutes > 0 ? minutes : null;
}

/* Store shape -> the shape the page reads, artwork reattached. */
function hydrate(match, images) {
  return {
    matchId: match.matchId,
    ladder: match.ladder,
    started: match.started,
    finished: match.finished,
    map: match.map,
    mapImage: (match.map && images.maps[match.map]) || null,
    players: match.players.map((p) => ({
      profileId: p.profileId,
      name: p.name,
      country: p.country,
      team: p.team,
      civ: p.civ,
      civImage: (p.civ && images.civs[p.civ]) || null,
      rating: p.rating,
      ratingDiff: p.ratingDiff,
      won: p.won
    }))
  };
}

/* One row per game this player was in — the same shape the dossier's
   charts, form strips and civ/map tallies already expect. */
function playerRow(match, profileId, images) {
  const player = match.players.find((p) => p.profileId === profileId);
  if (!player) return null;
  return {
    id: match.matchId,
    ladder: match.ladder,
    date: dateOf(match),
    durationMinutes: durationOf(match),
    map: match.map,
    mapImage: (match.map && images.maps[match.map]) || null,
    civ: player.civ,
    civImage: (player.civ && images.civs[player.civ]) || null,
    won: player.won == null ? null : Boolean(player.won),
    vsAI: match.players.some((p) => (p.name || "").toUpperCase() === "AI"),
    rating: player.rating,
    ratingDiff: player.ratingDiff
  };
}

async function main() {
  const started = Date.now();
  database = await openStore();
  try {

    const meta = await readJson("meta.json");
    const images = await readJson("images.json", { civs: {}, maps: {} });
    const roster = await readJson("roster.json");
    const profiles = await readJson("profiles.json", {});
    const countries = await readJson("countries.json", {});
    const stored = [...database.loadMatches().values()];

    // Rebuilt from scratch every time: a stale page file would be served as truth.
    await rm(PUBLIC, { recursive: true, force: true });

    const memberIds = new Set(roster.map((m) => m.profileId));

    // Newest first, restricted to games involving the current roster.
    const clanMatches = stored
      .filter((m) => m.players.some((p) => memberIds.has(p.profileId)))
      .sort((a, b) => new Date(dateOf(b)) - new Date(dateOf(a)));

    const pages = Math.max(1, Math.ceil(clanMatches.length / PAGE_SIZE));
    for (let page = 1; page <= pages; page++) {
      const slice = clanMatches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      await writeJson(path.join("feed", page + ".json"), {
        page,
        pages,
        // End of the stored feed; history coverage is reported separately.
        exhausted: page === pages,
        matches: slice.map((m) => hydrate(m, images))
      });
    }

    let playerFiles = 0;
    let deepest = { name: null, games: 0 };
    for (const member of roster) {
      const detail = await readJson(path.join("players", member.profileId + ".json"), null);
      if (!detail) continue;

      const matches = stored
        .map((m) => playerRow(m, member.profileId, images))
        .filter(Boolean)
        .sort((a, b) => new Date(b.date) - new Date(a.date));

      await writeJson(path.join("players", member.profileId + ".json"), {
        detail, matches, historyComplete: Boolean(meta.players && meta.players[member.profileId] && meta.players[member.profileId].historyComplete)
      });
      playerFiles++;
      if (matches.length > deepest.games) deepest = { name: member.name, games: matches.length };
    }

    await writeJson("roster.json", roster);
    await writeJson("profiles.json", profiles);
    await writeJson("countries.json", countries);
    await writeJson("discord.json", readJson("discord.json", null));
    await writeJson("meta.json", {
      clanTag: meta.clanTag,
      ladders: meta.ladders || [],
      /* When the data was PULLED, not when it was reshaped — that is the
         number the page prints, and re-running build must not make a
         week-old snapshot look fresh. */
      updatedAt: meta.updatedAt,
      generatedAt: new Date().toISOString(),
      pageSize: PAGE_SIZE,
      pages,
      matches: clanMatches.length,
      members: roster.length,
      historyComplete: roster.every(member => meta.players && meta.players[member.profileId] && meta.players[member.profileId].historyComplete)
    });

    console.log("built data/public · " + clanMatches.length + " clan matches in " + pages +
                " page" + (pages === 1 ? "" : "s") + " · " + playerFiles + " player files" +
                (deepest.name ? " · deepest " + deepest.name + " " + deepest.games + " games" : ""));
    console.log("serve it: python -m http.server 4173");
    console.log("(" + ((Date.now() - started) / 1000).toFixed(1) + "s)");
  } finally { database.close(); }
}

main().catch((err) => {
  console.error("build failed: " + err.message);
  process.exit(1);
});
