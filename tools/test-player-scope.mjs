/* Exercise the page's real delegated controls against a small offline snapshot.
   Only event dispatch and HTML sinks are simulated. No browser or npm package
   is required, and no screenshot or layout assertions are made here. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const day = 86400000;
const end = Date.parse("2026-09-04T12:00:00Z");
const when = daysAgo => new Date(end - daysAgo * day).toISOString();
const person = { profileId: 7, name: "Aster", country: "cz", ladders: {
  rm_team: { rating: 1721, peak: 1800, wins: 60, losses: 40, games: 100, winRate: 60, rankCountry: 16, rank: 200 },
  rm_1v1: { rating: 1520, peak: 1600, wins: 9, losses: 11, games: 20, winRate: 45 },
  qp_rm_team: { rating: 1240, games: 4 }
} };
function game(id, daysAgo, ladder, won, map, ai = false) {
  return { matchId: id, ladder, started: when(daysAgo + 1 / 48), finished: when(daysAgo), map,
    players: [
      { profileId: 7, name: "Aster", team: 1, civ: "Goths", won, ratingDiff: won == null ? null : won ? 7 : -5 },
      { profileId: 8, name: ai ? "AI" : "Opponent", team: 2, won: won == null ? null : !won }
    ] };
}
const matches = [
  game(1, -1, "rm_team", true, "Future map"),
  game(2, 0, "rm_team", null, "Pending map"),
  game(3, 1, "rm_team", false, "AI map", true),
  ...[true, false, true, true, false, false].map((won, n) => game(4 + n, 2 + n, "rm_team", won, n < 4 ? "Arena" : "Nomad")),
  game(10, 30, "rm_team", true, "Border map"),
  game(11, 31, "rm_team", false, "Older map"),
  game(12, 400, "rm_team", true, "Oldest map"),
  game(13, 0, "rm_1v1", false, "Arabia"),
  game(14, 60, "unranked", null, "Unknown outcome")
];
const partner = { profileId: 9, name: "Birch", country: "sk", ladders: {} };
for (const entry of matches.filter(m => [2, 3, 4, 5, 11].includes(m.matchId))) {
  entry.players.push({ profileId: partner.profileId, name: partner.name, team: 1, civ: "Huns", won: entry.players[0].won });
}
// Imported lineups can disagree within a team or omit one player's result.
matches.find(m => m.matchId === 4).players.push(
  { profileId: 10, name: "Other", team: 2, won: true },
  { profileId: 11, name: "Third", team: 3, won: false },
  { profileId: 12, name: "Fourth", team: 3, won: null }
);
const points = dates => dates.sort((a, b) => b - a).map((d, n) => ({ date: when(d), rating: 1000 + n, ratingDiff: 1 }));
let releasePlayer;
const delayedPlayer = new Promise(resolve => { releasePlayer = resolve; });
let failHistory;
const firstHistory = new Promise(resolve => { failHistory = () => resolve({ ok: false, status: 503 }); });
const blobs = {
  "meta.json": { clanTag: "lggl", ladders: ["rm_team", "rm_1v1", "unranked"].map(id => ({ id })), matches: matches.length, updatedAt: when(0), historyComplete: true },
  "roster.json": [person, partner], "profiles.json": {}, "countries.json": {}, "feed.json": { matches },
  // Intentionally empty sample. Civilisation/map breakdowns must come from the
  // full scoped match feed. Career ladder totals and Elo histories are separate.
  "players/7.json": { detail: { name: "Aster", boards: {}, historyByLadder: {
    rm_team: points([400, 31, 30, 2, -1]), rm_1v1: points([0]), unranked: []
  } }, matches: [], historyComplete: true }
};

const sinks = new Map();
const listeners = new Map();
let profile = "";
function element(selector) {
  if (!sinks.has(selector)) {
    const n = {
      children: [], options: [], parentElement: {}, textContent: "", dataset: {}, isConnected: true,
      classList: { toggle() {}, add() {}, remove() {} },
      set innerHTML(value) {
        this.markup = value;
        if (selector === ".pf-mode-content" || selector === ".player__detail") profile = value;
      },
      get innerHTML() { return this.markup || ""; },
      addEventListener(type, fn) {
        const key = selector + "/" + type;
        if (!listeners.has(key)) listeners.set(key, []);
        listeners.get(key).push(fn);
      },
      contains: () => false, focus() {}, getBoundingClientRect: () => ({ top: 0 }),
      querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, removeAttribute() {}
    };
    sinks.set(selector, n);
  }
  return sinks.get(selector);
}
const panel = element(".player__detail");
panel.querySelector = element;
panel.closest = () => ({ remove() {} });
const playerRow = element("row");
playerRow.parentElement = { classList: { toggle() {} }, querySelector: () => panel };
playerRow.querySelector = element;
playerRow.dataset.lineupRow = "7";
element("clanPeriod").dataset.periodControls = "ledger";
const document = {
  querySelector(sel) {
    if (sel.endsWith(".chart-wrap")) return null;
    if (sel === "#clanFeed [aria-expanded=true]") return null;
    if (sel.endsWith(" .player__detail")) return panel;
    if (sel.includes("[data-lineup-row=")) return playerRow;
    return element(sel);
  },
  querySelectorAll: sel => sel === "[data-period-controls]" ? [element("period"), element("clanPeriod")] : [],
  addEventListener() {}, activeElement: null
};
function press(host, attribute, value) {
  const camel = attribute.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  const target = { ...(attribute === "data-lineup-row" ? playerRow : element("target")), dataset: { [camel]: value },
    closest: selector => selector.split(", ").includes("[" + attribute + "]") ? target : null,
    hasAttribute: key => key === attribute, getAttribute: key => key === attribute ? value : null };
  const handlers = listeners.get(host + "/click");
  assert.ok(handlers, "No click handler on " + host);
  handlers.forEach(fn => fn({ target, detail: 1 }));
}
const requests = [];
const context = { document, console, Date, Map, Set,
  location: { hash: "", protocol: "https:" }, addEventListener() {}, matchMedia: () => ({ matches: true }),
  fetch: async url => {
    const name = url.replace(/^data\/public\//, "");
    assert.ok(Object.hasOwn(blobs, name), "Unexpected request: " + url);
    const firstFeed = name === "feed.json" && !requests.includes(name);
    requests.push(name);
    if (firstFeed) return firstHistory;
    if (name === "players/7.json") await delayedPlayer;
    return { ok: true, json: async () => blobs[name] };
  }
};
context.window = context;
vm.createContext(context);
const files = ["data", "snapshot", "aoe", "main"];
for (const script of files) {
  const url = new URL("../assets/js/" + script + ".js", import.meta.url);
  vm.runInContext(await readFile(url, "utf8"), context, { filename: script + ".js" });
}
const settle = () => new Promise(resolve => setImmediate(resolve));
await settle();
assert.ok(!requests.includes("players/7.json"), "Player histories should load on demand.");
press("#rosterTable", "data-lineup-row", "7");
assert.match(profile, /data-profile-period="30" aria-pressed="true"/);
assert.match(profile, /data-profile-ladder="qp_rm_team"/);
assert.match(profile, /Loading match results/);
failHistory();
await settle();
assert.match(profile, /Period results unavailable/);
listeners.get("#ledgerMore/click")[0]({ target: { closest: selector => selector === "#ledgerMoreBtn" } });
assert.match(profile, /Loading match results/);
await settle();

// Read published number targets so an animation's intermediate frame cannot
// masquerade as a data error. Static text still has to show the same numbers.
function metric(markup, key) {
  const match = [...markup.matchAll(/<span\b([^>]*\bdata-count-key="[^"]+"[^>]*)>\s*<span\b[^>]*>([^<]*)<\/span>/g)]
    .find(([, attrs]) => attrs.includes('data-count-key="' + key + '"'));
  assert.ok(match, "Missing displayed metric " + key);
  const number = Number(match[1].match(/data-count-value="([^"]+)"/)[1]);
  if (!match[1].includes('data-count-format="duration"')) {
    assert.equal(Number(match[2].replace(/[,%]/g, "")), Math.round(number), "The displayed text must match its final value.");
  }
  return number;
}
function expectProfile(count, wins, losses, change) {
  assert.equal(metric(profile, "profile-7-matches"), count);
  assert.ok(profile.includes('<dd class="pf-win">' + wins + '</dd>'));
  assert.ok(profile.includes('<dd class="pf-loss">' + losses + '</dd>'));
  if (change != null) assert.equal(metric(profile, "profile-7-change"), change);
}
function expectRoster(count) {
  const row = element("#rosterTable").innerHTML.match(/data-lineup-row="7"[\s\S]*?<\/tr>/)?.[0];
  assert.ok(row?.includes('<td class="lineup-matches">' + count + '</td>'));
}
function expectChart(days, points, firstDate) {
  const date = value => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const dates = profile.match(/class="chart-dates">([\s\S]*?)<\/div>/)?.[1] || "";
  assert.match(profile, new RegExp("over " + points + " recorded ratings"));
  assert.ok(dates.includes(date(firstDate || when(days))) && dates.includes(date(when(0))));
}
expectRoster(9);
expectProfile(9, 4, 3, 13);
assert.match(profile, /Border map/);
assert.doesNotMatch(profile, /Future map|Pending map|AI map|Older map|Oldest map|<select|<details/);
assert.match(profile, /All maps<\/th><td>7<\/td><td>4–3/);
assert.equal((profile.match(/class="pf-match-delta"/g) || []).length, 5);
assert.match(profile, /World rank<\/dt><dd>#200/);
assert.match(profile, /CZ rank<\/dt><dd>#16/);
assert.equal((profile.match(/data-count-key=/g) || []).length, 6);
assert.match(element("#ladderSwitch").innerHTML, /data-ladder="qp_rm_team"/);

// Change the two scopes independently while the history request is in flight.
const originalTable = element("#rosterTable").innerHTML;
press("#rosterTable", "data-profile-period", "90");
expectProfile(10, 4, 4, 8);
assert.equal(element("#rosterTable").innerHTML, originalTable);
press("#rosterTable", "data-profile-ladder", "rm_1v1");
press("period", "data-period", "365");
expectRoster(10);
releasePlayer();
await settle();
expectProfile(1, 0, 1, -5);
assert.match(profile, /All maps<\/th><td>1<\/td><td>0–1/);
assert.match(profile, /One recorded rating, 1000 Elo/);
assert.doesNotMatch(profile, /class="chart-line"/);
assert.equal(metric(profile, "profile-7-career-rate"), 45);
assert.equal(metric(profile, "profile-7-peak"), 1600);

press("#ladderSwitch", "data-ladder", "unranked");
expectRoster(1);
expectProfile(1, 0, 1, -5);
press("#rosterTable", "data-profile-ladder", "unranked");
expectProfile(1, 0, 0, null);
assert.match(profile, /No Elo ratings in this period/);
assert.doesNotMatch(profile, /NaN|Infinity|data-count-key="profile-7-(percentage|change)"/);
press("#rosterTable", "data-profile-period", "30");
expectProfile(0, 0, 0, null);
press("#rosterTable", "data-profile-ladder", "rm_team");
expectChart(30, 2);
press("#rosterTable", "data-profile-period", "365");
expectProfile(10, 4, 4, 8);
expectChart(365, 3);
press("#rosterTable", "data-profile-period", "all");
expectProfile(11, 5, 4, 15);
expectChart(null, 4, when(400));
assert.match(profile, /Oldest map/);
assert.doesNotMatch(profile, /Future map/);
assert.equal(metric(profile, "profile-7-career-rate"), 60);
const rosterBeforeClanChange = element("#rosterTable").innerHTML;
const rosterDates = element("#rosterCoverage").textContent;
press("#ledgerTabs", "data-ledger", "qp_rm_team");
press("clanPeriod", "data-period", "all");
assert.equal(element("#rosterTable").innerHTML, rosterBeforeClanChange);
assert.equal(element("#rosterCoverage").textContent, rosterDates);
assert.notEqual(element("#ledgerCoverage").textContent, rosterDates);
expectRoster(1);
expectProfile(11, 5, 4, 15);
press("#rosterTable", "data-lineup-row", "7");
press("#rosterTable", "data-lineup-row", "7");
expectProfile(1, 0, 0, null);
assert.match(profile, /data-profile-ladder="unranked" aria-pressed="true"/);
assert.match(profile, /data-profile-period="365" aria-pressed="true"/);
const clanBeforeRosterChange = element("#ledgerStats").innerHTML;
const clanDates = element("#ledgerCoverage").textContent;
press("#ladderSwitch", "data-ladder", "qp_rm_team");
press("period", "data-period", "90");
assert.equal(element("#ledgerStats").innerHTML, clanBeforeRosterChange);
assert.equal(element("#ledgerCoverage").textContent, clanDates);
press("#rosterTable", "data-lineup-row", "7");
press("#rosterTable", "data-lineup-row", "7");
expectProfile(0, 0, 0, null);
assert.match(profile, /data-profile-ladder="qp_rm_team" aria-pressed="true"/);
assert.match(profile, /data-profile-period="90" aria-pressed="true"/);
assert.equal(metric(profile, "profile-7-elo"), 1240);
assert.equal(requests.filter(name => name === "feed.json").length, 2, "Only the initial request and explicit retry fetch history");
assert.equal(requests.filter(name => name === "players/7.json").length, 1);
console.log("PASS: independent profile filters, inherited selections, six headline counters, flagged ranks, optional modes and delayed history.");

press("#ledgerTabs", "data-ledger", "rm_team");
press("clanPeriod", "data-period", "30");
assert.equal(metric(element("#ledgerStats").innerHTML, "clan-matches"), 9);
expectRoster(0);
press("#breakdownViews", "data-view", "map");
assert.match(element("#clanBreakdown").innerHTML, /Arena<\/span><\/th><td>4<\/td><td>3–1/);
press("#breakdownViews", "data-view", "duos");
press("#clanBreakdown", "data-duo-row", "7|9");
const duoMetric = k => metric(element("#ledgerStats").innerHTML, "duo-7|9-" + k);
assert.equal(duoMetric("matches"), 3); // Two results and one pending game.
assert.equal(duoMetric("rate"), 50);
press("clanPeriod", "data-period", "90");
assert.equal(duoMetric("matches"), 4);
assert.equal(Math.round(duoMetric("rate")), 33);
assert.match(element("#clanFeed").innerHTML, /Older map/);
assert.doesNotMatch(element("#clanFeed").innerHTML, /AI map/);
press("#breakdownViews", "data-view", "civ");
assert.match(element("#clanBreakdown").innerHTML, /Aster<\/th><th[^>]*>Birch<\/th>/);
assert.match(element("#clanBreakdown").innerHTML, /Goths<\/td><td[^>]*>Huns<\/td><td>3<\/td>/);
press("#ledgerTabs", "data-ledger", "rm_1v1");
assert.equal(duoMetric("matches"), 0);
assert.match(element("#clanFeed").innerHTML, /No shared matches/);
press("#backToDuos", "data-back", "");
assert.equal(metric(element("#ledgerStats").innerHTML, "clan-matches"), 9);
assert.match(element("#clanBreakdown").innerHTML, /data-pair="7\|9"/);
assert.equal(requests.filter(name => name === "feed.json").length, 2, "Duo filters reuse the recovered history");
console.log("PASS: unique clan matches, independent duo scope, assigned civ pairings, unknown results, empty states and return to clan.");

const matchButton = element("match button");
const matchPanel = element("match detail");
matchButton.dataset.match = "4";
matchButton.parentElement = { classList: { toggle() {} }, querySelector: () => matchPanel.markup ? matchPanel : null };
matchButton.insertAdjacentHTML = (_, html) => { matchPanel.innerHTML = html; };
listeners.get("#clanFeed/click")[0]({ target: { closest: () => matchButton } });
assert.match(matchPanel.innerHTML, /Team 1<\/span><em>Won<\/em>/);
assert.match(matchPanel.innerHTML, /Team 2<\/span><\/p>/, "Conflicting results leave the team outcome undecided");
assert.match(matchPanel.innerHTML, /Team 3<\/span><\/p>/, "Partial results leave the team outcome undecided");
