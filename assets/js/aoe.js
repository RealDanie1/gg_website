/* ============================================================
   GG CLAN — stored ladder data
   The scheduled server job fetches external data into SQLite and builds
   data/public/. Browsers read only these published files, including
   dossiers and older games. Missing files fail locally; page loads and
   retries never call an upstream API or trigger an update.
   Plain browser script, with the existing aggregation contracts preserved.
   ============================================================ */
window.AOE = (function () {
  "use strict";

  var MATCH_PAGE = 300;

  /* One in-flight request per URL, and results kept for the session. */
  var cache = new Map();

  function getJson(url) {
    if (!cache.has(url)) {
      var request = window.GG_SNAPSHOT.getJson(url)
        .catch(function (error) {
          cache.delete(url); // let a later attempt retry rather than caching the failure
          throw error;
        });
      cache.set(url, request);
    }
    return cache.get(url);
  }

  var SNAPSHOT_BASE = "data/public/";
  var snapshotProbe = null;
  var snapshotResolved = null;
  var usedSnapshot = false;

  function snapshotMeta() {
    if (!snapshotProbe) {
      snapshotProbe = getJson(SNAPSHOT_BASE + "meta.json").then(function (meta) {
        if (!meta || typeof meta.matches !== "number") throw new Error("Stored data is unavailable");
        snapshotResolved = meta;
        return meta;
      }).catch(function (error) {
        snapshotProbe = null;
        throw error;
      });
    }
    return snapshotProbe;
  }

  function fromSnapshot(read) {
    return snapshotMeta().then(read).then(function (value) {
      usedSnapshot = true;
      return value;
    });
  }

  function fetchRoster(clanTag, ladderIds) {
    return fromSnapshot(function (meta) {
      if (meta.clanTag !== clanTag) throw new Error("Stored data belongs to another clan");
      var built = (meta.ladders || []).map(function (ladder) { return ladder.id; });
      if (ladderIds.some(function (id) { return built.indexOf(id) === -1; })) {
        throw new Error("Stored data needs a refresh for the configured ladders");
      }
      return getJson(SNAPSHOT_BASE + "roster.json");
    });
  }

  function fetchProfiles(profileIds) {
    if (!profileIds.length) return Promise.resolve(new Map());
    return fromSnapshot(function () {
      return getJson(SNAPSHOT_BASE + "profiles.json").then(function (cards) {
        var out = new Map();
        profileIds.forEach(function (id) { if (cards[id]) out.set(id, cards[id]); });
        return out;
      });
    }).catch(function () { return new Map(); });
  }

  /* Canonical matches -> the two views the ledger wants: one row per
     member APPEARANCE for the tallies, one row per GAME for the cards. */
  function feedFrom(matches, wanted) {
    var rows = [];
    var games = [];

    matches.forEach(function (match) {
      var everyone = match.players || [];
      // Games against the computer shouldn't count towards a win rate.
      var vsAI = everyone.some(function (p) { return (p.name || "").toUpperCase() === "AI"; });
      var date = match.finished || match.started;
      var minutes = durationOf(match);

      var members = [];
      everyone.forEach(function (p) {
        if (!wanted.has(p.profileId)) return;
        members.push({
          profileId: p.profileId,
          name: p.name,
          team: p.team,
          won: p.won == null ? null : Boolean(p.won)
        });
        rows.push({
          matchId: match.matchId,
          profileId: p.profileId,
          playerName: p.name,
          ladder: match.ladder,
          date: date,
          durationMinutes: minutes,
          map: match.map,
          mapImage: match.mapImage,
          civ: p.civ,
          civImage: p.civImage,
          won: p.won == null ? null : Boolean(p.won),
          vsAI: vsAI,
          rating: p.rating,
          ratingDiff: p.ratingDiff
        });
      });

      if (members.length) {
        games.push({
          matchId: match.matchId,
          ladder: match.ladder,
          date: date,
          durationMinutes: minutes,
          map: match.map,
          mapImage: match.mapImage,
          vsAI: vsAI,
          members: members,
          /* Everyone in the game, opponents included — the expandable
             match card in the ledger shows both full teams, which is the
             one place the non-clan players are worth keeping. `won` stays
             null rather than false when the match records no winner. */
          lineup: everyone.map(function (p) {
            return {
              profileId: p.profileId,
              name: p.name,
              team: p.team,
              /* Opponent countries power the atlas for every period. */
              country: p.country,
              civ: p.civ,
              civImage: p.civImage,
              rating: p.rating,
              ratingDiff: p.ratingDiff,
              won: p.won,
              isMember: wanted.has(p.profileId)
            };
          })
        });
      }
    });

    // Newest first — the source already sorts, but appearances interleave.
    rows.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    return { rows: rows, games: games };
  }

  /* Every period reads the same complete snapshot, loaded once on page open. */
  function fetchClanFeed(profileIds) {
    if (!profileIds.length) return Promise.resolve({ rows: [], games: [], historyComplete: true });
    var wanted = new Set(profileIds);
    return fromSnapshot(function (meta) {
      return getJson(SNAPSHOT_BASE + "feed.json").then(function (file) {
        if (!file || !Array.isArray(file.matches) || file.matches.length !== meta.matches) {
          throw new Error("Stored clan history is incomplete");
        }
        var feed = feedFrom(file.matches, wanted);
        feed.historyComplete = meta.historyComplete;
        return feed;
      }).catch(function (error) {
        cache.delete(SNAPSHOT_BASE + "feed.json");
        throw error;
      });
    });
  }

  function durationOf(match) {
    if (!match.started || !match.finished) return null;
    var minutes = (new Date(match.finished) - new Date(match.started)) / 60000;
    return isFinite(minutes) && minutes > 0 ? minutes : null;
  }

  /* ------------------------------------------------------------
     Pairs of members who queued on the SAME team, with how that
     went. Every result, map and civ combination uses the same decided
     human-team sample. Player IDs keep partnerships and civ assignments
     stable when names change; chronology drives form and recorded runs.
     ------------------------------------------------------------ */
  function warband(games, minGames) {
    var pairs = new Map();

    games.slice().sort(function (a, b) {
      return new Date(b.date || 0) - new Date(a.date || 0) || b.matchId - a.matchId;
    }).forEach(function (game) {
      if (game.vsAI || game.members.length < 2) return;
      for (var i = 0; i < game.members.length; i++) {
        for (var j = i + 1; j < game.members.length; j++) {
          var a = game.members[i], b = game.members[j];
          if (a.team == null || a.team !== b.team) continue;
          if (a.won == null || b.won == null || a.won !== b.won) continue;

          var players = [a, b].sort(function (x, y) { return x.profileId - y.profileId; });
          var named = players.slice().sort(function (x, y) { return x.name.localeCompare(y.name); });
          var ids = players.map(function (p) { return p.profileId; });
          var key = ids.join("|");
          var row = pairs.get(key) || {
            key: key, ids: ids, a: named[0].name, b: named[1].name,
            players: named.map(function (p) { return { profileId: p.profileId, name: p.name }; }),
            games: 0, wins: 0, results: [], maps: new Map(), combinations: new Map()
          };
          row.games += 1;
          if (a.won) row.wins += 1;
          row.results.push({ matchId: game.matchId, date: game.date, won: a.won, map: game.map });
          if (game.map) {
            var map = row.maps.get(game.map) || { name: game.map, image: game.mapImage, games: 0, wins: 0 };
            map.games += 1;
            if (a.won) map.wins += 1;
            row.maps.set(game.map, map);
          }
          var civs = players.map(function (p) {
            return (game.lineup || []).filter(function (q) { return q.profileId === p.profileId; })[0] || p;
          });
          if (civs.every(function (p) { return Boolean(p.civ); })) {
            var comboKey = JSON.stringify(civs.map(function (p) { return p.civ; }));
            var combo = row.combinations.get(comboKey) || {
              civs: civs.map(function (p) { return { profileId: p.profileId, name: p.civ, image: p.civImage }; }),
              games: 0, wins: 0
            };
            combo.games += 1;
            if (a.won) combo.wins += 1;
            row.combinations.set(comboKey, combo);
          }
          pairs.set(key, row);
        }
      }
    });

    return Array.from(pairs.values())
      .filter(function (row) { return row.games >= (minGames || 2); })
      .map(function (row) {
        row.winRate = Math.round((row.wins / row.games) * 100);
        row.form = row.results.slice(0, 5).map(function (result) { return result.won ? "W" : "L"; });
        row.currentRun = 0;
        row.bestRun = 0;
        var run = 0;
        row.results.forEach(function (result, index) {
          run = result.won ? run + 1 : 0;
          row.bestRun = Math.max(row.bestRun, run);
          if (result.won && index === row.currentRun) row.currentRun += 1;
        });
        function ranked(items) {
          return Array.from(items.values()).map(function (item) {
            item.winRate = Math.round(item.wins / item.games * 100);
            return item;
          }).sort(function (x, y) { return y.games - x.games || y.wins - x.wins; });
        }
        row.maps = ranked(row.maps);
        row.combinations = ranked(row.combinations);
        return row;
      })
      .sort(function (x, y) { return y.games - x.games || y.winRate - x.winRate; });
  }

  /* ------------------------------------------------------------
     How many rated players a country has on a ladder, so a rank
     can be shown as "#19 of 875" instead of a bare number.
     ------------------------------------------------------------ */
  function fetchCountryTotal(ladderId, country) {
    return fromSnapshot(function () {
      return getJson(SNAPSHOT_BASE + "countries.json").then(function (totals) {
        var key = ladderId + "|" + String(country || "").toLowerCase();
        return totals[key] != null ? totals[key] : null;
      });
    }).catch(function () { return null; });
  }

  function snapshotPlayer(profileId) {
    if (!/^\d+$/.test(String(profileId))) return Promise.reject(new Error("Invalid player id"));
    return getJson(SNAPSHOT_BASE + "players/" + profileId + ".json").then(function (file) {
      if (!file || !file.detail || !Array.isArray(file.matches)) throw new Error("Stored player data unavailable");
      return file;
    });
  }

  function fetchFullHistory(profileId, onProgress) {
    return fromSnapshot(function () {
      return snapshotPlayer(profileId).then(function (file) {
        if (onProgress) onProgress(file.matches.length);
        return file.matches;
      });
    });
  }

  function fetchPlayerDetail(profileId) {
    return fromSnapshot(function () {
      return snapshotPlayer(profileId).then(function (file) {
        var detail = file.detail;
        return {
          name: detail.name,
          country: detail.country,
          countryName: detail.countryName,
          platform: detail.platform,
          allTimeGames: detail.allTimeGames,
          drops: detail.drops,
          boards: detail.boards,
          linked: detail.linked,
          historyByLadder: detail.historyByLadder,
          historyComplete: file.historyComplete,
          storedMatches: file.matches.length,
          matches: file.matches.slice(0, MATCH_PAGE)
        };
      });
    });
  }

  function tally(matches, field, imageField, limit) {
    var totals = new Map();
    matches.forEach(function (match) {
      if (match.won == null || match.vsAI) return;
      var key = match[field];
      if (!key) return;
      var row = totals.get(key) || { name: key, games: 0, wins: 0, image: null };
      row.games += 1;
      if (match.won) row.wins += 1;
      if (!row.image) row.image = match[imageField] || null;
      totals.set(key, row);
    });
    return Array.from(totals.values())
      .map(function (row) {
        row.winRate = Math.round((row.wins / row.games) * 100);
        return row;
      })
      .sort(function (a, b) { return b.games - a.games || b.winRate - a.winRate; })
      .slice(0, limit || 3);
  }

  /* ------------------------------------------------------------
     How long the games actually run. `durationOf` has always been
     computed per match and never used; this is what it feeds.

     Clan feed rows are one per MEMBER APPEARANCE, so a game two
     members played together would otherwise be measured twice and
     drag the average towards whatever the duos happen to play —
     hence the dedupe by match id. Player-detail rows key on `id`.
     ------------------------------------------------------------ */
  function durationStats(matches) {
    var seen = new Set();
    var lengths = [];
    var longest = null;

    matches.forEach(function (match) {
      var minutes = match.durationMinutes;
      if (minutes == null) return;

      var id = match.matchId != null ? match.matchId : match.id;
      if (id != null) {
        if (seen.has(id)) return;
        seen.add(id);
      }

      lengths.push(minutes);
      if (!longest || minutes > longest.minutes) {
        longest = { minutes: minutes, map: match.map || null };
      }
    });

    if (!lengths.length) return null;

    var sorted = lengths.slice().sort(function (a, b) { return a - b; });
    var middle = Math.floor(sorted.length / 2);
    var total = lengths.reduce(function (sum, n) { return sum + n; }, 0);

    return {
      games: lengths.length,
      average: total / lengths.length,
      median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
      shortest: sorted[0],
      longest: longest.minutes,
      longestMap: longest.map
    };
  }

  /* Last N results, newest first, as "W"/"L". */
  function form(matches, count) {
    return matches.slice(0, count || 5).map(function (match) { return match.won ? "W" : "L"; });
  }

  return {
    /* Freshness always records the server refresh, never the page load. */
    snapshot: snapshotMeta,
    /* The same thing without the wait, for anything rendering after data
       has already arrived — by then the probe has long since settled. */
    snapshotNow: function () { return snapshotResolved; },
    fetchRoster: fetchRoster,
    fetchProfiles: fetchProfiles,
    fetchClanFeed: fetchClanFeed,
    sourceNow: function () { return usedSnapshot ? "snapshot" : "unavailable"; },
    fetchCountryTotal: fetchCountryTotal,
    fetchPlayerDetail: fetchPlayerDetail,
    fetchFullHistory: fetchFullHistory,
    warband: warband,
    tally: tally,
    durationStats: durationStats,
    form: form
  };
})();
