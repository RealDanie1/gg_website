/* ============================================================
   GG CLAN — ladder data
   ------------------------------------------------------------
   Two sources, in this order:

   1. A SNAPSHOT under data/public/, built by tools/update.mjs and
      tools/build.mjs. It holds every match every member has ever
      played, so lifetime civ, map and warband numbers cost one
      local file read instead of a paged walk over the network.
   2. The AoE2 Companion data service, live, exactly as before.
      That service sends `access-control-allow-origin: *`, so no
      backend or proxy is needed and the site stays static.

   The live path is the fallback, not dead weight: it is what runs
   on a fresh clone before the first update, over file:// where a
   browser refuses to read neighbouring files, and any time a
   snapshot file is missing. Both paths hand back the same shapes,
   so nothing downstream knows which one answered.

   Plain script rather than an ES module on purpose: modules are
   blocked over file://, and this way index.html still works when
   you just double-click it.

   Nothing here invents numbers. If both sources fail the UI is
   told so and shows a plain offline state instead of fake stats.
   ============================================================ */
window.AOE = (function () {
  "use strict";

  var API = "https://data.aoe2companion.com/api";

  /* Every match request on the page uses this. The endpoint defaults to a
     page of TWENTY — which is what the civ and map tallies used to be built
     from, leaving three or four games once narrowed to one ladder — and 300
     is the largest it will serve. Both the per-player feed and the clan feed
     page through it, so it lives up here rather than beside either one. */
  var MATCH_PAGE = 300;

  /* One in-flight request per URL, and results kept for the session. */
  var cache = new Map();

  function getJson(url) {
    if (!cache.has(url)) {
      var request = fetch(url)
        .then(function (response) {
          if (!response.ok) throw new Error("Ladder request failed (" + response.status + ")");
          return response.json();
        })
        .catch(function (error) {
          cache.delete(url); // let a later attempt retry rather than caching the failure
          throw error;
        });
      cache.set(url, request);
    }
    return cache.get(url);
  }

  /* ------------------------------------------------------------
     The snapshot.

     One probe on first use. If data/public/meta.json is not there
     — fresh clone, file://, nothing built yet — every call below
     goes straight out to the API and the site behaves as it did
     before any of this existed.
     ------------------------------------------------------------ */
  var SNAPSHOT_BASE = "data/public/";
  var snapshotProbe = null;
  var snapshotResolved = null;
  var usedSnapshot = false;
  var usedLive = false;

  function snapshotMeta() {
    if (!snapshotProbe) {
      snapshotProbe = getJson(SNAPSHOT_BASE + "meta.json")
        .then(function (meta) { return meta && meta.matches ? meta : null; })
        .catch(function () { return null; })
        .then(function (meta) { snapshotResolved = meta; return meta; });
    }
    return snapshotProbe;
  }

  /* Snapshot first, live second. A snapshot read that throws — a missing
     page file, a build half-written — falls through to the API rather
     than taking a panel down with it. */
  function preferSnapshot(fromFiles, fromApi) {
    return snapshotMeta().then(function (meta) {
      function live() { return Promise.resolve().then(fromApi).then(function (value) { usedLive = true; return value; }); }
      if (!meta) return live();
      return Promise.resolve()
        .then(function () { return fromFiles(meta); })
        .then(function (value) { usedSnapshot = true; return value; })
        .catch(live);
    });
  }

  /* ------------------------------------------------------------
     Roster — every member of the clan, merged across all ladders
     so someone who only plays unranked still shows up.
     ------------------------------------------------------------ */
  function fetchRoster(clanTag, ladderIds) {
    return preferSnapshot(function (meta) {
      // A snapshot built for another clan tag answers a different question.
      if (meta.clanTag !== clanTag) throw new Error("snapshot is for clan " + meta.clanTag);

      /* And one built before a ladder was added to CLAN.ladders has no rows
         for it, which would read as "nobody plays this" rather than as a
         stale file. Go live until the next update run catches up. */
      var built = (meta.ladders || []).map(function (l) { return l.id; });
      var missing = ladderIds.some(function (id) { return built.indexOf(id) === -1; });
      if (missing) throw new Error("snapshot predates a ladder change");

      return getJson(SNAPSHOT_BASE + "roster.json");
    }, function () {
      return fetchRosterLive(clanTag, ladderIds);
    });
  }

  function fetchRosterLive(clanTag, ladderIds) {
    return Promise.all(
      ladderIds.map(function (id) {
        var url = API + "/leaderboards/" + id +
                  "?clan=" + encodeURIComponent(clanTag) + "&page=1&per_page=100&language=en";
        return getJson(url)
          .then(function (payload) { return { id: id, players: payload.players || [] }; })
          .catch(function () { return { id: id, players: [], failed: true }; });
      })
    ).then(function (boards) {
      if (boards.every(function (b) { return b.failed; })) throw new Error("No ladder reachable");

      var members = new Map();

      boards.forEach(function (board) {
        board.players.forEach(function (entry) {
          var member = members.get(entry.profileId);
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
          // A name can differ slightly between boards; prefer the ranked one.
          if (board.id === "rm_team") member.name = entry.name;

          member.ladders[board.id] = {
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
        });
      });

      return Array.from(members.values());
    });
  }

  /* ------------------------------------------------------------
     Identity cards for the whole roster in ONE request.

     Note the PLURAL endpoint. /profiles/{id} carries that player's
     entire rating history — 386 KB for a five-thousand-game account —
     so reading nine avatars through it would cost megabytes. The
     plural form returns the identity fields alone: 2.7 KB for the
     whole clan.

     Avatars are decoration. A failure here resolves to an empty map
     rather than rejecting, so a Steam hiccup can't take the roster
     down with it.
     ------------------------------------------------------------ */

  /* Steam's placeholder avatar. Two members currently share it, and two
     identical grey silhouettes read as a broken image rather than as "no
     picture" — the roster draws an initial tile instead. */
  var STEAM_BLANK = "fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb";

  function avatarUrl(profile) {
    var hash = profile.avatarhash;
    if (!hash || profile.platform !== "steam" || hash === STEAM_BLANK) return null;
    // Third-party value heading straight into an <img src>; it is only ever a hash.
    if (!/^[a-f0-9]{40}$/i.test(hash)) return null;
    return "https://avatars.steamstatic.com/" + hash + "_full.jpg";
  }

  /* The payload sends these as strings. */
  function toNumber(value) {
    var n = Number(value);
    return isFinite(n) ? n : null;
  }

  function fetchProfiles(profileIds) {
    if (!profileIds.length) return Promise.resolve(new Map());

    return preferSnapshot(function () {
      return getJson(SNAPSHOT_BASE + "profiles.json").then(function (cards) {
        var out = new Map();
        profileIds.forEach(function (id) {
          if (cards[id]) out.set(id, cards[id]);
        });
        if (!out.size) throw new Error("no cards in snapshot");
        return out;
      });
    }, function () {
      return fetchProfilesLive(profileIds);
    });
  }

  function fetchProfilesLive(profileIds) {
    var url = API + "/profiles?profile_ids=" + profileIds.join(",") + "&language=en";

    return getJson(url).then(function (payload) {
      var cards = new Map();
      (payload.profiles || []).forEach(function (profile) {
        cards.set(profile.profileId, {
          avatar: avatarUrl(profile),
          platform: profile.platformName || null,
          /* Every mode ever played, so this sits well above the per-ladder
             totals the leaderboards report. */
          games: toNumber(profile.games),
          drops: toNumber(profile.drops)
        });
      });
      return cards;
    }).catch(function () { return new Map(); });
  }

  /* ------------------------------------------------------------
     Clan-wide match feed.

     The matches endpoint accepts a comma-separated list of profile
     ids, so the whole clan's recent games arrive in ONE request.
     Flattened to one row per clan-member appearance: a game with two
     members in it produces two rows, which is what the civ/map
     tallies and the per-player form strips both want.
     ------------------------------------------------------------ */
  /* An API match record, flattened to the shape the snapshot keeps on
     disk. Teams collapse into one player list because `player.team`
     already says which side each is on, and having one canonical shape
     means the two sources share every line of counting below. */
  function normalizeMatch(match) {
    var players = [];

    (match.teams || []).forEach(function (team, teamIndex) {
      (team.players || []).forEach(function (p) {
        players.push({
          profileId: p.profileId,
          name: p.name || null,
          country: p.country || null,
          team: p.team != null ? p.team : teamIndex,
          civ: p.civName || null,
          civImage: p.civImageUrl || null,
          rating: p.rating != null ? p.rating : null,
          ratingDiff: p.ratingDiff != null ? p.ratingDiff : null,
          won: p.won != null ? Boolean(p.won) : null
        });
      });
    });

    return {
      matchId: match.matchId,
      ladder: match.leaderboardId || null,
      started: match.started || null,
      finished: match.finished || null,
      map: match.mapName || null,
      mapImage: match.mapImageUrl || null,
      players: players
    };
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
              /* Kept for the atlas: 48 countries turn up across 300 games,
                 and every one of them already has a flag on this page. */
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

  function fetchClanFeed(profileIds, page) {
    if (!profileIds.length) return Promise.resolve({ rows: [], games: [], exhausted: true });
    var wanted = new Set(profileIds);
    page = page || 1;

    return preferSnapshot(function () {
      /* The build cuts the feed into pages of 300 in the same order the
         API serves them, so "Load 300 more games" walks local files and
         behaves exactly as it did over the network — instantly, and as
         deep as the store goes. */
      return getJson(SNAPSHOT_BASE + "feed/" + page + ".json").then(function (file) {
        var feed = feedFrom(file.matches || [], wanted);
        feed.exhausted = Boolean(file.exhausted);
        return feed;
      });
    }, function () {
      var url = API + "/matches?profile_ids=" + profileIds.join(",") +
                "&language=en&page=" + page + "&per_page=" + MATCH_PAGE;

      return getJson(url).then(function (payload) {
        var matches = (payload.matches || []).map(normalizeMatch);
        var feed = feedFrom(matches, wanted);
        /* A short page is the end of the road; the service reports no total. */
        feed.exhausted = matches.length < MATCH_PAGE;
        return feed;
      });
    });
  }

  /* ------------------------------------------------------------
     Pairs of members who queued on the SAME team, with how that
     went. This is the one view no public site can show you.
     ------------------------------------------------------------ */
  function warband(games, minGames) {
    var pairs = new Map();

    games.forEach(function (game) {
      if (game.vsAI || game.members.length < 2) return;
      for (var i = 0; i < game.members.length; i++) {
        for (var j = i + 1; j < game.members.length; j++) {
          var a = game.members[i], b = game.members[j];
          if (a.team == null || a.team !== b.team) continue;
          if (a.won == null || b.won == null || a.won !== b.won) continue;

          var names = [a.name, b.name].sort();
          var ids = [a.profileId, b.profileId].sort(function (x, y) { return x - y; });
          var key = ids.join("|");
          var row = pairs.get(key) || { key: key, ids: ids, a: names[0], b: names[1], games: 0, wins: 0 };
          row.games += 1;
          if (a.won) row.wins += 1;
          pairs.set(key, row);
        }
      }
    });

    return Array.from(pairs.values())
      .filter(function (row) { return row.games >= (minGames || 2); })
      .map(function (row) {
        row.winRate = Math.round((row.wins / row.games) * 100);
        return row;
      })
      .sort(function (x, y) { return y.games - x.games || y.winRate - x.winRate; });
  }

  /* ------------------------------------------------------------
     How many rated players a country has on a ladder, so a rank
     can be shown as "#19 of 875" instead of a bare number.
     ------------------------------------------------------------ */
  function fetchCountryTotal(ladderId, country) {
    return preferSnapshot(function () {
      return getJson(SNAPSHOT_BASE + "countries.json").then(function (totals) {
        var key = ladderId + "|" + String(country || "").toLowerCase();
        /* The build only knows the ladders in CLAN.ladders. A dossier
           opened on Quick Play asks about a ladder nobody snapshotted,
           and that question still has a live answer. */
        if (totals[key] == null) throw new Error("not in snapshot");
        return totals[key];
      });
    }, function () {
      var url = API + "/leaderboards/" + ladderId +
                "?country=" + encodeURIComponent(country) + "&page=1&per_page=1&language=en";
      return getJson(url)
        .then(function (payload) { return payload.total != null ? payload.total : null; })
        .catch(function () { return null; });
    });
  }

  /* ------------------------------------------------------------
     One player detail: rating history + their own match feed.
     ------------------------------------------------------------ */

  /* The service reports no total and caps a page at 300, so the end of an
     account's history is a page that comes back short. The guard is there
     purely so a misbehaving API can't spin forever. */
  var MAX_MATCH_PAGES = 40;

  function matchPageUrl(profileId, page) {
    return API + "/matches?profile_ids=" + profileId +
           "&language=en&page=" + page + "&per_page=" + MATCH_PAGE;
  }

  /* One row per game THIS player was in. */
  function playerRowsFrom(matches, profileId) {
    return matches.map(function (match) {
      var player = null;
      (match.players || []).forEach(function (entry) {
        if (entry.profileId === profileId) player = entry;
      });
      if (!player) return null;

      return {
        id: match.matchId,
        ladder: match.ladder,
        date: match.finished || match.started,
        durationMinutes: durationOf(match),
        map: match.map,
        mapImage: match.mapImage,
        civ: player.civ,
        civImage: player.civImage,
        won: player.won == null ? null : Boolean(player.won),
        vsAI: (match.players || []).some(function (p) { return (p.name || "").toUpperCase() === "AI"; }),
        rating: player.rating,
        ratingDiff: player.ratingDiff
      };
    }).filter(Boolean);
  }

  function mapPlayerMatches(payload, profileId) {
    return playerRowsFrom((payload.matches || []).map(normalizeMatch), profileId);
  }

  /* That player's whole stored history, newest first. The build already
     sorted and shaped it, so this is a file read and nothing else. */
  function snapshotPlayer(profileId) {
    return getJson(SNAPSHOT_BASE + "players/" + profileId + ".json").then(function (file) {
      if (!file || !file.detail) throw new Error("no player file");
      return file;
    });
  }

  /* Walks the feed back to the account's first recorded game. Sixteen pages
     and roughly 12 MB for a five-thousand-game account, which is why the UI
     asks before calling this rather than doing it on open. */
  function fetchFullHistory(profileId, onProgress) {
    return preferSnapshot(function () {
      return snapshotPlayer(profileId).then(function (file) {
        // Nothing to page through, but the caller still wants its count.
        if (onProgress) onProgress(file.matches.length);
        return file.matches;
      });
    }, function () {
      return fetchFullHistoryLive(profileId, onProgress);
    });
  }

  function fetchFullHistoryLive(profileId, onProgress) {
    var all = [];

    function nextPage(page) {
      return getJson(matchPageUrl(profileId, page)).then(function (payload) {
        var returned = (payload.matches || []).length;
        all = all.concat(mapPlayerMatches(payload, profileId));
        if (onProgress) onProgress(all.length);
        if (returned < MATCH_PAGE || page >= MAX_MATCH_PAGES) return all;
        return nextPage(page + 1);
      });
    }

    return nextPage(1);
  }

  function fetchPlayerDetail(profileId) {
    return preferSnapshot(function () {
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
          /* The same 300 the live call opens with. The rest is one click
             away on "Load all N games", which is now free — leaving the
             two paths identical instead of quietly changing what the
             panels count when a snapshot happens to exist. */
          matches: file.matches.slice(0, MATCH_PAGE)
        };
      });
    }, function () {
      return fetchPlayerDetailLive(profileId);
    });
  }

  function fetchPlayerDetailLive(profileId) {
    return Promise.all([
      getJson(API + "/profiles/" + profileId + "?language=en&page=1"),
      getJson(matchPageUrl(profileId, 1))
        .catch(function () { return { matches: [] }; })
    ]).then(function (results) {
      var profile = results[0];
      var matchPayload = results[1];

      var historyByLadder = {};
      (profile.ratings || []).forEach(function (entry) {
        var points = entry.ratings || [];
        // The feed arrives newest-first; charts want oldest-first.
        if (points.length) historyByLadder[entry.leaderboardId] = points.slice().reverse();
      });

      var matches = mapPlayerMatches(matchPayload, profileId);

      /* Each ladder entry carries its own `total` — the size of that whole
         leaderboard. It turns a bare "#576" into "#576 of 45,681" for free,
         on a request the dossier was making anyway. */
      var boards = {};
      (profile.leaderboards || []).forEach(function (entry) {
        boards[entry.leaderboardId] = {
          rank: entry.rank != null ? entry.rank : null,
          rating: entry.rating != null ? entry.rating : null,
          games: entry.games != null ? entry.games : null,
          total: entry.total != null ? entry.total : null,
          /* "QP 1v1" rather than "Quick Play 1v1 Random Map" — the long
             form is a tab label nobody can fit. */
          label: entry.abbreviation || entry.leaderboardName || entry.leaderboardId
        };
      });

      return {
        name: profile.name,
        country: profile.country,
        countryName: profile.countryName || null,
        platform: profile.platformName || null,
        allTimeGames: toNumber(profile.games),
        drops: toNumber(profile.drops),
        boards: boards,
        /* Alternate accounts the service has tied to this one. */
        linked: (profile.linkedProfiles || []).map(function (alt) {
          return {
            profileId: alt.profileId,
            name: alt.name,
            games: toNumber(alt.games)
          };
        }),
        historyByLadder: historyByLadder,
        matches: matches
      };
    });
  }

  function durationOf(match) {
    if (!match.started || !match.finished) return null;
    var minutes = (new Date(match.finished) - new Date(match.started)) / 60000;
    return isFinite(minutes) && minutes > 0 ? minutes : null;
  }

  /* ------------------------------------------------------------
     Aggregations over the recent match feed.
     These describe RECENT GAMES ONLY — the UI says so.
     ------------------------------------------------------------ */
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
    /* Resolves to the snapshot's meta — { updatedAt, matches, members, … } —
       or null when the page is running straight off the live API. The
       ledger prints it, because numbers that no longer move on their own
       have to say when they were taken. */
    snapshot: snapshotMeta,
    /* The same thing without the wait, for anything rendering after data
       has already arrived — by then the probe has long since settled. */
    snapshotNow: function () { return snapshotResolved; },
    fetchRoster: fetchRoster,
    fetchProfiles: fetchProfiles,
    fetchClanFeed: fetchClanFeed,
    sourceNow: function () { return usedSnapshot && usedLive ? "mixed" : usedSnapshot ? "snapshot" : "live"; },
    fetchCountryTotal: fetchCountryTotal,
    fetchPlayerDetail: fetchPlayerDetail,
    fetchFullHistory: fetchFullHistory,
    warband: warband,
    tally: tally,
    durationStats: durationStats,
    form: form
  };
})();
