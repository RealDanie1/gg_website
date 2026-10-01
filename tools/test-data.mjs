/* Regression checks for public data contracts. No network or dependencies. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './store.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotSource = await readFile(path.join(root, 'assets/js/snapshot.js'), 'utf8');
const source = await readFile(path.join(root, 'assets/js/aoe.js'), 'utf8');
function apiFor(fetcher) {
  const context = { window: {}, fetch: fetcher, console, Map, Set, Date };
  vm.runInNewContext(snapshotSource, context);
  vm.runInNewContext(source, context);
  return context.window.AOE;
}
function member(id, won, team = 1) { return { profileId: id, name: 'Player ' + id, won, team, civ: 'Malians', rating: 1000, ratingDiff: 10 }; }
function match(id, players, vsAI = false) {
  return { matchId: id, ladder: 'rm_team', started: '2026-08-10T10:00:00Z', finished: '2026-08-10T10:20:00Z', map: 'Arabia', players: vsAI ? players.concat({ profileId: 99, name: 'AI', team: 2, won: false }) : players };
}
const fixtures = [
  match(1, [member(1, null), member(2, null)]),
  match(2, [member(1, true), member(2, true)]),
  match(3, [member(1, false), member(2, false)]),
  match(4, [member(1, true), member(2, false, 2)]),
  match(5, [member(1, true), member(2, true)], true),
  match(6, [member(1, true, null), member(2, true, null)]),
  match(7, [member(1, true), member(2, false)]),
  match(8, [member(1, null), member(2, true), member(3, true)])
];
const fixtureAPI = apiFor(async (url) => ({ ok: true, json: async () => url.endsWith('meta.json') ? { matches: fixtures.length } : { matches: fixtures, exhausted: true } }));
const feed = await fixtureAPI.fetchClanFeed([1, 2, 3]);
assert.equal(feed.games.length, 8, 'Shared games remain one match');
assert.equal(feed.rows.find(r => r.matchId === 1).won, null, 'Unknown appearance is not a loss');
assert.equal(feed.games[0].members[0].won, null, 'Unknown teammate result stays unknown');
const pairs = fixtureAPI.warband(feed.games, 1);
assert.equal(pairs.find(p => p.key === '1|2').games, 2, 'Only agreed, decided human team results count');
assert.equal(pairs.find(p => p.key === '1|2').winRate, 50);
assert.equal(pairs.find(p => p.key === '2|3').games, 1, 'An unknown earlier teammate must not suppress other valid pairs');
const tally = fixtureAPI.tally([{ civ: 'Malians', won: true }, { civ: 'Malians', won: null }, { civ: 'Malians', won: false }, { civ: 'Malians', won: true, vsAI: true }], 'civ', 'civImage', 8);
assert.equal(tally[0].games, 2);
assert.equal(tally[0].winRate, 50, 'AI and unknown results do not inflate the denominator');
const fileLoads = [];
const filesAPI = apiFor(async url => {
  fileLoads.push(url);
  return { ok: true, json: async () => JSON.parse(await readFile(path.join(root, url), 'utf8')) };
});
const roster = JSON.parse(await readFile(path.join(root, 'data/public/roster.json'), 'utf8'));
const meta = JSON.parse(await readFile(path.join(root, 'data/public/meta.json'), 'utf8'));
const all = (await filesAPI.fetchClanFeed(roster.map(p => p.profileId))).games;
assert.equal(all.length, meta.matches);
assert.equal(new Set(all.map(g => g.matchId)).size, all.length, 'Snapshot contains unique matches');
assert.equal((await filesAPI.fetchClanFeed(roster.map(p => p.profileId))).games.length, meta.matches);
assert.equal(fileLoads.filter(url => url.endsWith('/feed.json')).length, 1, 'Complete history is loaded once and cached');
assert.ok(!fileLoads.some(url => url.includes('/feed/')), 'Periods do not walk feed pages');
const database = await openStore();
const raw = [...database.loadMatches().values()];
database.close();
for (const days of [30, 90, 365]) {
  const end = new Date('2026-09-05T00:00:00Z').getTime();
  const start = end - days * 86400000;
  const ids = new Set(roster.map(p => p.profileId));
  const expected = raw.filter(m => ['rm_team', 'rm_1v1'].includes(m.ladder) && m.players.some(p => ids.has(p.profileId)) && new Date(m.finished || m.started).getTime() >= start && new Date(m.finished || m.started).getTime() <= end).length;
  const actual = all.filter(g => ['rm_team', 'rm_1v1'].includes(g.ladder) && new Date(g.date).getTime() >= start && new Date(g.date).getTime() <= end).length;
  assert.equal(actual, expected);
  console.log(days + '-day ranked matches: ' + actual);
}
const failedAPI = apiFor(async () => { throw new Error('Offline'); });
await assert.rejects(failedAPI.fetchClanFeed([1]), /Offline/, 'Failure must not invent data');
console.log('PASS: unknown results, pairs, AI exclusions, snapshot uniqueness, date totals, offline failure.');

assert.equal(fixtureAPI.sourceNow(), 'snapshot');
const requested = [];
const missingAPI = apiFor(async url => {
  requested.push(url);
  if (!url.startsWith('data/public/')) throw new Error('Upstream request forbidden: ' + url);
  if (url.endsWith('meta.json')) return { ok: true, json: async () => ({ matches: 1, clanTag: 'test', ladders: [{ id: 'rm_team' }] }) };
  throw new Error('Missing snapshot file');
});
await assert.rejects(missingAPI.fetchClanFeed([1]), /Missing snapshot/);
await assert.rejects(missingAPI.fetchPlayerDetail(1), /Missing snapshot/);
await assert.rejects(missingAPI.fetchFullHistory(1), /Missing snapshot/);
await assert.rejects(missingAPI.fetchRoster('test', ['rm_team']), /Missing snapshot/);
assert.equal(await missingAPI.fetchCountryTotal('rm_team', 'cz'), null);
assert.equal((await missingAPI.fetchProfiles([1])).size, 0);
await assert.rejects(missingAPI.fetchRoster('different', ['rm_team']), /another clan/);
assert.ok(requested.every(url => url.startsWith('data/public/')), 'Failures and retries must never fetch external APIs');
const dossier = await filesAPI.fetchPlayerDetail(roster[0].profileId);
const history = await filesAPI.fetchFullHistory(roster[0].profileId);
assert.equal(dossier.storedMatches, history.length);
assert.equal(dossier.matches.length, Math.min(300, history.length));
assert.ok(dossier.historyComplete, 'Seed player coverage stays available');
assert.equal((await filesAPI.fetchClanFeed([])).games.length, 0);
let truncated = true;
const incompleteAPI = apiFor(async url => ({ ok: true, json: async () => url.endsWith('meta.json') ? { matches: 2 } : { matches: fixtures.slice(0, truncated ? 1 : 2) } }));
await assert.rejects(incompleteAPI.fetchClanFeed([1]), /history is incomplete/, 'A truncated feed must not claim complete period coverage');
truncated = false;
assert.equal((await incompleteAPI.fetchClanFeed([1])).games.length, 2, 'Retry must reread a previously truncated snapshot');
const partialAPI = apiFor(async url => ({ ok: true, json: async () => url.endsWith('meta.json') ? { matches: fixtures.length, historyComplete: false } : { matches: fixtures } }));
assert.equal((await partialAPI.fetchClanFeed([1])).historyComplete, false, 'Incomplete source history stays labelled even after the saved feed is fully loaded');
const emptyAPI = apiFor(async url => ({ ok: true, json: async () => url.endsWith('meta.json') ? { matches: 0, historyComplete: true } : { matches: [] } }));
assert.equal((await emptyAPI.fetchClanFeed([1])).games.length, 0, 'An empty saved feed is valid');
const discordSource = await readFile(path.join(root, 'assets/js/discord.js'), 'utf8');
const discordCalls = [];
const discordContext = { window: {}, fetch: async url => {
  discordCalls.push(url);
  return { ok: true, json: async () => ({ guildId: 'test', updatedAt: '2026-09-04T00:00:00Z', payload: { members: [], presence_count: 2 } }) };
}};
vm.runInNewContext(snapshotSource, discordContext);
vm.runInNewContext(discordSource, discordContext);
assert.equal((await discordContext.window.DISCORD.fetchWidget('test')).online, 2);
assert.deepEqual(discordCalls, ['data/public/discord.json'], 'Discord must also read only the published snapshot');
console.log('PASS: complete history loaded once, honest coverage, stored dossiers, and no upstream requests on missing data.');

// Exercise the generated script copies with fetch disabled, as on file://.
const localLoads = [];
const localContext = { window: { location: { protocol: 'file:' } }, console, Map, Set, Date,
  fetch: () => { throw new Error('File preview must not fetch JSON or upstream data'); }
};
localContext.document = {
  createElement: () => ({}),
  head: { appendChild(script) {
    localLoads.push(script.src);
    readFile(path.join(root, script.src), 'utf8').then(text => {
      vm.runInNewContext(text, localContext);
      script.onload();
    }).catch(() => script.onerror());
  } }
};
vm.runInNewContext(snapshotSource, localContext);
vm.runInNewContext(source, localContext);
vm.runInNewContext(discordSource, localContext);
const localAPI = localContext.window.AOE;
const localRoster = await localAPI.fetchRoster(meta.clanTag, meta.ladders.map(ladder => ladder.id));
assert.deepEqual(JSON.parse(JSON.stringify(localRoster)), roster);
const localMatches = (await localAPI.fetchClanFeed(localRoster.map(player => player.profileId))).games.length;
assert.equal(localMatches, meta.matches, 'Local script snapshots contain the same complete clan feed');
assert.equal(localLoads.filter(url => url.endsWith('/feed.js')).length, 1, 'Direct-file previews load the full feed in one script');
const localDetail = await localAPI.fetchPlayerDetail(roster[0].profileId);
const beforeFull = localLoads.length;
assert.equal((await localAPI.fetchFullHistory(roster[0].profileId)).length, localDetail.storedMatches);
assert.equal(localLoads.length, beforeFull, 'Full-history display reuses the saved player file');
await assert.rejects(localContext.window.GG_SNAPSHOT.getJson('https://example.com/api.json'), /Invalid snapshot path/);
await assert.rejects(localAPI.fetchPlayerDetail(999999999), /Stored snapshot file is unavailable/);
assert.ok(localLoads.every(url => url.startsWith('data/public/') && url.endsWith('.js')));
console.log('PASS: direct-file preview loads the same stored roster, feed and player history with fetch disabled.');
