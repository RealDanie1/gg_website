/* Offline regression checks for the shared-story duo aggregation. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../assets/js/aoe.js', import.meta.url), 'utf8');
const context = { window: {}, Map, Set, Date };
vm.runInNewContext(source, context);
const fixtureAPI = context.window.AOE;
// A duo's form, runs, map results and assigned civ combinations must agree
// even when the source is out of order and player name order differs from IDs.
function duoGame(id, won, swapped = false) {
  const players = [
    { profileId: 1, name: 'Zulu', team: 1, won, civ: swapped ? 'Teutons' : 'Franks', civImage: 'one.png' },
    { profileId: 2, name: 'Alpha', team: 1, won, civ: swapped ? 'Franks' : 'Teutons', civImage: 'two.png' }
  ];
  return { matchId: id, date: '2026-08-' + String(id).padStart(2, '0') + 'T12:00:00Z',
    map: id < 4 ? 'Arena' : 'Black Forest', mapImage: 'map.png', members: players, lineup: players, vsAI: false };
}
const duoGames = [duoGame(2, true), duoGame(7, true), duoGame(3, false, true),
  duoGame(4, null), duoGame(1, true), duoGame(6, true, true), duoGame(5, true)];
const aiDuo = duoGame(8, true); aiDuo.vsAI = true;
const oppositeDuo = duoGame(9, true); oppositeDuo.members[1].team = 2;
const unknownTeamDuo = duoGame(10, true); unknownTeamDuo.members[0].team = null;
const splitDuo = duoGame(11, true); splitDuo.members[1].won = false;
const story = fixtureAPI.warband(duoGames.concat(aiDuo, oppositeDuo, unknownTeamDuo, splitDuo), 2)[0];
assert.equal(story.games, 6, 'Every story statistic shares the agreed decided non-AI team sample');
assert.equal(story.wins, 5);
assert.deepEqual(Array.from(story.form), ['W', 'W', 'W', 'L', 'W'], 'Form is chronological, newest first');
assert.equal(story.currentRun, 3, 'Current run stops at the latest decided loss');
assert.equal(story.bestRun, 3);
assert.equal(story.a, 'Alpha');
assert.deepEqual(Array.from(story.players, p => p.profileId), [2, 1], 'Displayed identities retain their IDs');
assert.equal(story.maps.reduce((sum, map) => sum + map.games, 0), story.games);
assert.equal(story.maps.find(map => map.name === 'Arena').winRate, 67);
assert.equal(story.combinations.length, 2, 'Swapping player civ assignments creates a distinct combination');
assert.equal(story.combinations[0].games, 4);
assert.equal(story.combinations[0].civs.find(civ => civ.profileId === 1).name, 'Franks');
assert.equal(story.combinations[0].civs.find(civ => civ.profileId === 2).name, 'Teutons');
assert.equal(fixtureAPI.warband([duoGame(1, false), duoGame(2, false)], 2)[0].bestRun, 0);
console.log('PASS: duo chronology, form, win runs, map records, assigned civ combinations and exclusions.');
