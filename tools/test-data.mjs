/* Regression checks for public data contracts. No network or dependencies. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'assets/js/aoe.js'), 'utf8');
function apiFor(fetcher) {
  const context = { window: {}, fetch: fetcher, console, Map, Set, Date };
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
const filesAPI = apiFor(async url => ({ ok: true, json: async () => JSON.parse(await readFile(path.join(root, url), 'utf8')) }));
const roster = JSON.parse(await readFile(path.join(root, 'data/public/roster.json'), 'utf8'));
const meta = JSON.parse(await readFile(path.join(root, 'data/public/meta.json'), 'utf8'));
const all = [];
for (let page = 1; page <= meta.pages; page++) {
  const result = await filesAPI.fetchClanFeed(roster.map(p => p.profileId), page);
  all.push(...result.games);
  assert.equal(result.exhausted, page === meta.pages);
}
assert.equal(all.length, meta.matches);
assert.equal(new Set(all.map(g => g.matchId)).size, all.length, 'Snapshot pages contain unique matches');
const raw = (await readFile(path.join(root, 'data/raw/matches.ndjson'), 'utf8')).trim().split('\n').map(JSON.parse);
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
let useFiles = true;
const mixedAPI = apiFor(async url => {
  if (url.endsWith('meta.json')) return { ok: true, json: async () => ({ matches: 1 }) };
  if (url.startsWith('data/public/') && !useFiles) throw new Error('Missing snapshot page');
  return { ok: true, json: async () => ({ matches: [], exhausted: true }) };
});
await mixedAPI.fetchClanFeed([1], 1);
assert.equal(mixedAPI.sourceNow(), 'snapshot');
useFiles = false;
await mixedAPI.fetchClanFeed([1], 2);
assert.equal(mixedAPI.sourceNow(), 'mixed', 'Snapshot fallback must not claim exclusively stored data');
console.log('PASS: snapshot and mixed-source status.');
