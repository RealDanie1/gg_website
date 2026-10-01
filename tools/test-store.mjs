/* Offline integration checks: seed migration, atomic rollback and an
   incremental refresh using API fixtures. Real upstream fetches are forbidden. */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openStore } from "./store.mjs";
import { main as update } from "./update.mjs";

const temporary = await mkdtemp(path.join(tmpdir(), "gg-store-test-"));
const databasePath = path.join(temporary, "gg.sqlite");
try {
  let store = await openStore(databasePath);
  const originalMeta = store.getJson("meta.json");
  const originalMatches = store.loadMatches();
  assert.equal(originalMatches.size, originalMeta.matches, "Import must preserve the saved match count");
  const changed = new Map(originalMatches);
  changed.set("invalid", { players: [] });
  assert.throws(() => store.commit({ "meta.json": { updatedAt: "invalid" } }, changed), /Invalid stored match/);
  assert.deepEqual(store.getJson("meta.json"), originalMeta, "Metadata rolls back with invalid matches");
  assert.equal(store.loadMatches().size, originalMatches.size);
  const roster = store.getJson("roster.json");
  const first = roster[0];
  const second = roster[1];
  const cards = store.getJson("profiles.json");
  store.close();

  // Failure after the updater has obtained a new roster and profile must
  // leave BOTH its freshness and matches identical to the prior database.
  const failureFetch = async url => {
    const parsed = new URL(url);
    if (parsed.pathname.includes("/leaderboards/")) return response({ players: [entry(first)] });
    if (parsed.pathname.endsWith("/profiles")) return response({ profiles: [profile(first)] });
    if (parsed.pathname.includes("/profiles/")) return response(profile(first));
    throw new Error("Fixture match outage");
  };
  await assert.rejects(update({ databasePath, fetcher: failureFetch }), /Fixture match outage/);
  store = await openStore(databasePath);
  assert.deepEqual(store.getJson("meta.json"), originalMeta, "Failed refresh must preserve last successful timestamp");
  assert.deepEqual([...store.loadMatches()], [...originalMatches], "Failed refresh must preserve every match");
  store.close();

  const newMatchId = 999999999999;
  const newMatch = {
    matchId: newMatchId,
    leaderboardId: "rm_team",
    started: "2026-10-01T08:00:00Z",
    finished: "2026-10-01T08:30:00Z",
    mapName: "Arabia",
    teams: [{ players: [first, second].map(member => ({ profileId: member.profileId, name: member.name, team: 1, won: null, civName: "Malians" })) }]
  };
  const requests = [];
  const sharedPage = Array.from({ length: 300 }, (_, index) => ({ ...newMatch, matchId: newMatchId + index }));
  const exclusiveMatch = { ...newMatch, matchId: newMatchId + 300, teams: [{ players: [newMatch.teams[0].players[1]] }] };
  const successFetch = async url => {
    requests.push(url);
    const parsed = new URL(url);
    if (parsed.hostname === "discord.com") return { ok: false, status: 403 };
    if (parsed.pathname.includes("/leaderboards/")) {
      return response(parsed.searchParams.has("country") ? { total: 123 } : { players: roster.map(entry) });
    }
    if (parsed.pathname.endsWith("/profiles")) return response({ profiles: roster.map(profile) });
    if (parsed.pathname.includes("/profiles/")) return response(profile(roster.find(member => String(member.profileId) === parsed.pathname.split("/").pop())));
    if (parsed.pathname.endsWith("/matches")) {
      const id = Number(parsed.searchParams.get("profile_ids"));
      const page = Number(parsed.searchParams.get("page"));
      if ([first.profileId, second.profileId].includes(id) && page === 1) return response({ matches: sharedPage });
      return response({ matches: id === second.profileId && page === 2 ? [exclusiveMatch] : [] });
    }
    throw new Error("Unexpected fixture URL: " + url);
  };
  await update({ databasePath, fetcher: successFetch });
  store = await openStore(databasePath);
  assert.equal(store.loadMatches().size, originalMatches.size + 301, "Shared matches are stored once, and later exclusive matches are retained");
  assert.equal(store.loadMatches().get(String(newMatchId)).players[0].won, null, "Unknown results survive SQLite round trips");
  assert.notEqual(store.getJson("meta.json").updatedAt, originalMeta.updatedAt);
  assert.ok(Object.values(store.getJson("meta.json").players).every(player => player.historyComplete));
  assert.equal(store.getJson("discord.json").payload, null, "Disabled widgets clear stale presence");
  store.close();
  assert.equal(requests.filter(url => url.includes("/matches?")).length, roster.length + 2, "Matches fetched for another player cannot prematurely stop this player's pagination");
  assert.ok(cards[first.profileId], "Seed includes identity cards");
  console.log("PASS: SQLite migration, transaction rollback, failed-refresh preservation and incremental deduplication.");
} finally {
  await rm(temporary, { recursive: true, force: true });
}

function response(value) { return { ok: true, json: async () => value }; }
function profile(member) {
  return { ...member, games: 10, ratings: [], leaderboards: [], linkedProfiles: [] };
}
function entry(member) {
  return { profileId: member.profileId, name: member.name, country: member.country, clan: member.clan, rating: 1000, games: 10, wins: 5, losses: 5 };
}
