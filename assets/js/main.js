/* ============================================================
   GG CLAN — behaviour
   Vanilla JS, no build step. Content from data.js, numbers from aoe.js.
   ============================================================ */
(function () {
  "use strict";

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(value) { return value == null ? "—" : String(value); }

  /* ============================================================
     1. Static content from data.js
     ============================================================ */
  $("[data-blurb]").textContent = CLAN.blurb;
  $("[data-lead]").textContent = CLAN.lead;
  $("[data-creed-title]").innerHTML = esc(CLAN.creedTitle) + '<span class="period">.</span>';
  $("[data-creed-lead]").textContent = CLAN.creedLead;
  $("[data-warcry]").textContent = CLAN.warcry;
  $("[data-motto-quote]").textContent = CLAN.motto + " Shape the battlefield.";
  $("[data-clantag]").textContent = CLAN.clanTag;
  $("[data-year]").textContent = new Date().getFullYear();

  $$("[data-discord]").forEach(function (a) {
    a.href = CLAN.discord;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });
  var discordLabel = $("[data-discord-label]");
  if (discordLabel) discordLabel.textContent = CLAN.discord.replace(/^https?:\/\//, "");

  $("#values").innerHTML = CLAN.creed.map(function (row) {
    return '<article class="value"><span>' + esc(row[0]) + "</span>" +
           "<div><h3>" + esc(row[1]) + "</h3><p>" + esc(row[2]) + "</p></div></article>";
  }).join("");

  /* ============================================================
     2. Header, nav, scroll spy, reveals
     ============================================================ */
  var header = $("#header"), nav = $("#nav"), burger = $("#burger");

  function onScroll() { header.classList.toggle("is-stuck", window.scrollY > 24); }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  burger.addEventListener("click", function () {
    var open = burger.getAttribute("aria-expanded") === "true";
    burger.setAttribute("aria-expanded", String(!open));
    nav.classList.toggle("is-open", !open);
  });
  nav.addEventListener("click", function (e) {
    if (e.target.closest("a")) {
      burger.setAttribute("aria-expanded", "false");
      nav.classList.remove("is-open");
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && nav.classList.contains("is-open")) {
      burger.setAttribute("aria-expanded", "false");
      nav.classList.remove("is-open");
      burger.focus();
    }
  });

  var navLinks = $$('.nav a[href^="#"]').filter(function (a) { return a.getAttribute("href").length > 1; });
  var sections = navLinks.map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); }).filter(Boolean);
  if (sections.length && "IntersectionObserver" in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (a) {
          a.classList.toggle("is-active", a.getAttribute("href") === "#" + entry.target.id);
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach(function (s) { spy.observe(s); });
  }

  var revealer = "IntersectionObserver" in window
    ? new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          obs.unobserve(entry.target);
        });
      }, { rootMargin: "0px 0px -10% 0px", threshold: 0.04 })
    : null;
  function watchReveals(root) {
    $$(".reveal", root).forEach(function (el) {
      if (revealer) revealer.observe(el); else el.classList.add("is-in");
    });
  }
  watchReveals(document);

  /* ============================================================
     3. Hero — embers + pointer parallax
     ============================================================ */
  if (!reduceMotion) {
    var embers = $("#embers");
    var html = "";
    for (var i = 0; i < 16; i++) {
      var left = Math.random() * 100;
      var dur = 9 + Math.random() * 11;
      var delay = -Math.random() * dur;
      var drift = (Math.random() - 0.35) * 90;
      var size = 1.5 + Math.random() * 2;
      html += '<i style="left:' + left.toFixed(2) + "%;" +
              "width:" + size.toFixed(1) + "px;height:" + size.toFixed(1) + "px;" +
              "animation-duration:" + dur.toFixed(1) + "s;animation-delay:" + delay.toFixed(1) + "s;" +
              "--drift:" + drift.toFixed(0) + 'px"></i>';
    }
    embers.innerHTML = html;

    var scene = $("#heroScene"), hero = $(".hero"), frame = null;
    hero.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      var box = hero.getBoundingClientRect();
      var x = ((e.clientX - box.left) / box.width - 0.5) * 2;
      var y = ((e.clientY - box.top) / box.height - 0.5) * 2;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(function () {
        scene.style.setProperty("--scene-x", (x * -9).toFixed(1) + "px");
        scene.style.setProperty("--scene-y", (y * -6).toFixed(1) + "px");
      });
    });
    hero.addEventListener("pointerleave", function () {
      cancelAnimationFrame(frame);
      scene.style.setProperty("--scene-x", "0px");
      scene.style.setProperty("--scene-y", "0px");
    });
  }

  /* ============================================================
     4. City gallery
     ============================================================ */
  (function gallery() {
    var cities = CLAN.cities;
    var index = 0;
    var image = $("#cityImage"), name = $("#cityName"), story = $("#cityStory");
    var idxEl = $("#cityIndex"), count = $("#cityCount"), thumbs = $("#cityThumbs");

    var pad = function (n) { return String(n + 1).padStart(2, "0"); };
    var full = function (n) { return "assets/img/cities/city-" + pad(n) + ".webp"; };

    thumbs.innerHTML = cities.map(function (city, n) {
      return '<button role="tab" aria-current="' + (n === 0) + '" data-city="' + n + '" ' +
             'aria-label="' + esc(city[0]) + '">' +
             '<img src="assets/img/cities/thumb-' + pad(n) + '.webp" width="480" height="270" loading="lazy" alt=""></button>';
    }).join("");

    function show(n) {
      index = (n + cities.length) % cities.length;
      image.src = full(index);
      image.alt = "Age of Empires II city built by GG Clan: " + cities[index][0];
      name.textContent = cities[index][0];
      story.textContent = cities[index][1];
      idxEl.textContent = pad(index) + " /";
      count.textContent = pad(index) + " — " + pad(cities.length - 1);
      $$("button", thumbs).forEach(function (b) {
        b.setAttribute("aria-current", String(Number(b.dataset.city) === index));
      });
    }

    $("#cityPrev").addEventListener("click", function () { show(index - 1); });
    $("#cityNext").addEventListener("click", function () { show(index + 1); });
    thumbs.addEventListener("click", function (e) {
      var b = e.target.closest("[data-city]");
      if (b) show(Number(b.dataset.city));
    });

    /* lightbox */
    $("#cityOpen").addEventListener("click", function () {
      var box = document.createElement("div");
      box.className = "lightbox";
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-modal", "true");
      box.setAttribute("aria-label", cities[index][0]);
      box.innerHTML =
        '<button class="lightbox__close">Close ×</button>' +
        "<div><img src=" + JSON.stringify(full(index)) + ' alt="">' +
        '<p class="lightbox__cap">' + esc(cities[index][0]) + "</p></div>";
      document.body.appendChild(box);
      document.body.style.overflow = "hidden";

      var close = function () {
        box.remove();
        document.body.style.overflow = "";
        document.removeEventListener("keydown", onKey);
      };
      var onKey = function (e) {
        if (e.key === "Escape") close();
        if (e.key === "ArrowRight") { show(index + 1); close(); }
        if (e.key === "ArrowLeft") { show(index - 1); close(); }
      };
      box.addEventListener("click", function (e) {
        if (e.target === box || e.target.closest(".lightbox__close")) close();
      });
      document.addEventListener("keydown", onKey);
      $(".lightbox__close", box).focus();
    });

    show(0);
  })();

  /* ============================================================
     5. Stored data
     ============================================================ */
  var state = {
    roster: [],
    period: "30",
    asOf: Date.now(),
    rosterSort: "rating",
    chartSort: { civ: "volume", map: "volume" },
    showPairs: false,
    pair: null,
    feedError: false,
    feed: [],            // one row per clan-member appearance
    games: [],           // one row per match, with the members in it
    ladder: CLAN.ladders[0].id,
    openPlayer: null,
    chartRange: null,          // null = let the chart pick its own window
    dossierLadder: null,       // mode tab inside the open dossier
    detailCache: new Map(),
    detailFailed: new Set(),   // profiles whose detail request came back empty
    fullHistory: new Map(),    // profileId -> every match the feed will give up
    fullLoading: new Set(),
    fullProgress: new Map(),   // profileId -> games fetched so far
    profileCards: new Map(),   // profileId -> { avatar, platform, games, drops }
    countryTotals: new Map(),  // "rm_team|cz" -> 875
    gamesById: new Map(),      // "match id" -> the game row, for the feed cards
    openMatch: null,
    ledgerFilter: "ranked",    // which mode the war ledger is showing
    feedPage: 0,               // how deep into the clan feed we have walked
    feedLoading: false,
    feedExhausted: false,
    feedHistoryComplete: true
  };

  var RANKED = ["rm_team", "rm_1v1"];

  /* "#19 of 875 in CZ" reads better than "#19". */
  function countryStanding(country, ladder, rankCountry) {
    if (!country || !rankCountry) return null;
    var total = state.countryTotals.get(ladder + "|" + country.toLowerCase());
    return "#" + rankCountry + (total ? " of " + total.toLocaleString("en-US") : "") +
           " in " + country.toUpperCase();
  }

  var LADDER_LABEL = {};
  CLAN.ladders.forEach(function (l) { LADDER_LABEL[l.id] = l.label; });

  /* A panel label and its icon. The icon does the work the trailing
     explainers used to do — "The warband · who actually queues together"
     is a heading apologising for itself. */
  function label(icon, text) {
    return '<p class="data-label data-label--ico">' +
      '<svg class="ico" aria-hidden="true"><use href="#i-' + icon + '"></use></svg>' +
      esc(text) + "</p>";
  }

  /* Snapshot dates reflect the daily server refresh. */
  function sourceLabel() {
    var meta = AOE.snapshotNow();
    return meta && meta.updatedAt ? "Updated " + shortDate(meta.updatedAt) + " · Daily snapshot" : "Stored data unavailable";
  }

  function statusOK(el, text) {
    el.innerHTML = '<span class="dot dot--live"></span> ' + esc(text);
  }
  function statusFail(el, text) {
    el.innerHTML = '<span class="dot dot--error"></span> ' + esc(text);
  }

  /* ---------- ladder switch ---------- */
  var switchEl = $("#ladderSwitch");
  switchEl.innerHTML = CLAN.ladders.map(function (l) {
    return '<button type="button" data-ladder="' + l.id + '" aria-pressed="' + (l.id === state.ladder) + '">' +
           esc(l.label) + "</button>";
  }).join("");
  switchEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-ladder]");
    if (!b) return;
    state.ladder = b.dataset.ladder;
    state.openPlayer = null;
    state.chartRange = null;
    $$("button", switchEl).forEach(function (x) {
      x.setAttribute("aria-pressed", String(x.dataset.ladder === state.ladder));
    });
    renderRoster();
    loadCountryTotals();
  });

  /* A date selection describes the data, never the number of pages fetched.
     Load until the requested boundary is covered; changing the selection while
     loading changes the next boundary, without starting a competing request. */
  var PERIODS = [{ key: "30", label: "30 days" }, { key: "90", label: "90 days" },
    { key: "365", label: "Year" }, { key: "all", label: "All recorded history" }];

  function shortDate(date) {
    return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function periodStart() { return state.period === "all" ? 0 : state.asOf - Number(state.period) * 86400000; }
  function inPeriod(row) {
    var date = new Date(row.date).getTime();
    return isFinite(date) && date >= periodStart() && date <= state.asOf;
  }
  function periodCovered() {
    if (state.feedExhausted && state.feedHistoryComplete) return true;
    if (state.period === "all" || !state.games.length) return false;
    return state.games.some(function (g) { return new Date(g.date).getTime() <= periodStart(); });
  }
  function renderPeriod() {
    $$("[data-period-controls]").forEach(function (group) {
      if (!group.children.length) group.innerHTML = PERIODS.map(function (p) {
        return '<button type="button" data-period="' + p.key + '" aria-pressed="' + (p.key === state.period) + '">' + p.label + '</button>';
      }).join("");
    });
    $$("[data-period]").forEach(function (button) { button.setAttribute("aria-pressed", String(button.dataset.period === state.period)); });
    var start = periodStart();
    if (!start && state.games.length) start = Math.min.apply(null, state.games.map(function (g) { return new Date(g.date).getTime(); }));
    var range = start ? shortDate(start) + " – " + shortDate(state.asOf) : "All recorded history";
    var status = state.feedExhausted && !state.feedHistoryComplete ? "Stored history is incomplete" : periodCovered() ? "Period loaded" : state.feedError ? "Incomplete period · could not load older games" : "Loading period…";
    $("#ledgerCoverage").textContent = range + " · " + status;
    $("#rosterCoverage").textContent = range + " · " + status + ". Rating and win rate are lifetime ladder figures; change and form follow this period and ladder. Change sums recorded Elo adjustments.";
    $$("[data-period-controls]").forEach(function (group) { group.setAttribute("aria-busy", String(state.feedLoading)); });
  }
  $$("[data-period-controls]").forEach(function (group) {
    group.addEventListener("click", function (e) {
      var button = e.target.closest("[data-period]");
      if (!button) return;
      state.period = button.dataset.period;
      state.pair = null;
      state.openMatch = null;
      state.feedError = false;
      renderPeriod(); renderRoster(); renderLedger();
      if (!periodCovered() && !state.feedExhausted && !state.feedLoading && state.roster.length) loadFeed(state.feedPage + 1);
      var again = group.querySelector('[data-period="' + state.period + '"]');
      if (again && e.detail === 0) again.focus();
    });
  });
  $("#rosterSort").addEventListener("change", function (e) {
    state.rosterSort = e.target.value; renderRoster();
  });
  $$("[data-chart-sort]").forEach(function (select) {
    select.addEventListener("change", function () { state.chartSort[select.dataset.chartSort] = select.value; renderLedger(); });
  });
  renderPeriod();

  function activityFor(player) {
    var rows = state.feed.filter(function (m) { return m.profileId === player.profileId && m.ladder === state.ladder && inPeriod(m); });
    var rated = rows.filter(function (m) { return m.ratingDiff != null && isFinite(m.ratingDiff) && m.won != null && !m.vsAI; });
    var stats = player.ladders[state.ladder];
    return { rows: rows, change: rated.length ? rated.reduce(function (sum, m) { return sum + Number(m.ratingDiff); }, 0) : null,
      last: stats && stats.lastMatch || (rows[0] && rows[0].date), rated: rated };
  }
  function sparkline(rows) {
    var points = rows.filter(function (m) { return m.rating != null && isFinite(m.rating); }).slice(0, 20).reverse();
    if (points.length < 2) return "";
    var values = points.map(function (m) { return Number(m.rating); });
    var low = Math.min.apply(null, values), high = Math.max.apply(null, values);
    return '<svg class="sparkline" viewBox="0 0 76 22" aria-hidden="true"><polyline points="' + values.map(function (v, i) {
      return (2 + i * 72 / (values.length - 1)).toFixed(1) + ',' + (19 - (v - low) * 16 / (high - low || 1)).toFixed(1);
    }).join(' ') + '" /></svg>';
  }

  /* ---------- helpers ---------- */
  function noteFor(player) { return CLAN.notes[player.name] || {}; }

  function sortedRoster() {
    var ladder = state.ladder;
    return state.roster.slice().sort(function (a, b) {
      if (state.rosterSort !== "rating") {
        var aa = activityFor(a), bb = activityFor(b);
        var av = state.rosterSort === "change" ? aa.change : aa.last ? new Date(aa.last).getTime() : null;
        var bv = state.rosterSort === "change" ? bb.change : bb.last ? new Date(bb.last).getTime() : null;
        if (av !== bv) { if (av == null) return 1; if (bv == null) return -1; return bv - av; }
      }
      var ra = a.ladders[ladder] && a.ladders[ladder].rating;
      var rb = b.ladders[ladder] && b.ladders[ladder].rating;
      if (ra == null && rb == null) return a.name.localeCompare(b.name);
      if (ra == null) return 1;
      if (rb == null) return -1;
      return rb - ra;
    });
  }

  function flag(country) {
    if (!country) return "";
    return '<img src="https://flagcdn.com/40x30/' + esc(country.toLowerCase()) + '.png" ' +
           'width="20" height="15" loading="lazy" alt="">';
  }

  function formStrip(results) {
    var cells = results.length ? results : ["n", "n", "n", "n", "n"];
    return '<div class="form" aria-label="Recent form: ' +
           (results.length ? results.join(", ") : "no recent games") + '">' +
           cells.map(function (r) {
             var cls = r === "W" ? "w" : r === "L" ? "l" : "n";
             return '<span class="' + cls + '" aria-hidden="true">' + (cls === "n" ? "·" : r) + "</span>";
           }).join("") + "</div>";
  }

  /* Recent results for one player, taken from the clan-wide feed. */
  function formFor(profileId, ladder) {
    ladder = ladder || state.ladder;
    return state.feed
      .filter(function (m) { return m.profileId === profileId && m.ladder === ladder && inPeriod(m) && !m.vsAI && m.won != null; })
      .slice(0, 5)
      .map(function (m) { return m.won ? "W" : "L"; });
  }

  function streakLabel(streak) {
    if (!streak) return null;
    return streak > 0 ? streak + " win streak" : Math.abs(streak) + " loss streak";
  }

  /* 38 -> "38m", 74 -> "1h 14m". */
  function fmtDuration(minutes) {
    if (minutes == null || !isFinite(minutes)) return "—";
    var total = Math.round(minutes);
    // Sub-minute records exist (a disconnect at the loading screen); "0m" reads
    // like missing data rather than a very short game.
    if (total < 1) return "<1m";
    if (total < 60) return total + "m";
    // Non-breaking space: "1h 13m" must never wrap across two lines.
    return Math.floor(total / 60) + "h " + String(total % 60).padStart(2, "0") + "m";
  }

  function fullDate(iso) {
    if (!iso) return null;
    var when = new Date(iso);
    if (isNaN(when.getTime())) return null;
    return when.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  /* Matches carry ladder ids the switch doesn't list (event ladders, customs),
     so fall back to the raw id rather than printing nothing. */
  function ladderName(id) {
    if (!id) return "Custom";
    return LADDER_LABEL[id] || String(id).replace(/_/g, " ");
  }

  function timeAgo(iso) {
    if (!iso) return "—";
    var diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 3600) return Math.max(1, Math.round(diff / 60)) + "m ago";
    if (diff < 86400) return Math.round(diff / 3600) + "h ago";
    var days = Math.round(diff / 86400);
    if (days < 31) return days + "d ago";
    return Math.round(days / 30) + "mo ago";
  }

  /* ---------- roster table ---------- */

  /* Steam avatar where there is one, the player's initial where there
     isn't. `size` picks the roster thumbnail or the dossier portrait. */
  function avatarHTML(player, size) {
    var card = state.profileCards.get(player.profileId);
    var url = card && card.avatar;
    var cls = "avatar" + (size === "lg" ? " avatar--lg" : "");
    var px = size === "lg" ? 76 : 34;

    if (url) {
      return '<span class="' + cls + '"><img src="' + esc(url) + '" width="' + px + '" height="' + px +
             '" loading="lazy" alt=""></span>';
    }
    var first = Array.from(String(player.name || "?"))[0] || "?";
    return '<span class="' + cls + ' avatar--blank" aria-hidden="true">' +
           esc(first.toUpperCase()) + "</span>";
  }

  function renderRoster() {
    var table = $("#rosterTable");
    if (state.roster.length) statusOK($("#rosterStatus"), sourceLabel());
    var players = sortedRoster();
    var ladder = state.ladder;

    if (!players.length) {
      table.innerHTML = '<div class="state">No members found on this ladder.</div>';
      return;
    }

    var head =
      '<div class="roster__labels" aria-hidden="true">' +
        "<span></span><span>Player</span><span>Country</span>" +
        "<span>Elo</span><span>Change</span><span>Win rate</span><span>Form · latest first</span>" +
      "</div>";

    var rows = players.map(function (player, i) {
      var stats = player.ladders[ladder];
      var note = noteFor(player);
      var activity = activityFor(player);
      var open = state.openPlayer === player.profileId;
      var unranked = !stats || stats.rating == null;

      return '<div class="player' + (open ? " player--open" : "") + '">' +
        '<button class="player__row" data-player="' + player.profileId + '" aria-expanded="' + open + '">' +
          '<span class="player__idx">' +
            '<svg class="player__chev" aria-hidden="true"><use href="#i-chevron"></use></svg>' +
            String(i + 1).padStart(2, "0") +
          "</span>" +
          '<span class="player__name-cell">' +
            avatarHTML(player) +
            '<span class="player__ident">' +
              '<span class="player__name">' + esc(player.name) + "</span>" +
              '<span class="player__last">' + (activity.last ? 'Last played ' + esc(shortDate(activity.last)) : 'No activity in loaded history') + '</span>' +
              (note.role ? '<span class="player__role">' + esc(note.role) + "</span>" : "") +
              (note.specialty ? '<span class="player__spec">' + esc(note.specialty) + "</span>" : "") +
            "</span>" +
          "</span>" +
          '<span class="player__country">' + flag(player.country) +
            esc(player.country ? player.country.toUpperCase() : "—") + "</span>" +
          '<span class="player__stats-cell">' +
            '<span class="player__stat' + (unranked ? " player__stat--empty" : "") + '">' +
              (unranked ? "—" : stats.rating) + "<small>Elo</small></span>" +
            '<span class="player__stat' + (unranked ? " player__stat--empty" : "") + '">' +
              (activity.change == null ? "—" : (activity.change > 0 ? "+" : "") + activity.change) + "<small>Change</small>" + sparkline(activity.rated) + "</span>" +
            '<span class="player__stat' + (unranked ? " player__stat--empty" : "") + '">' +
              (unranked || stats.winRate == null ? "—" : stats.winRate + "%") + "<small>Win rate</small></span>" +
          "</span>" +
          '<span class="player__form-cell">' + formStrip(formFor(player.profileId)) + "</span>" +
        "</button>" +
        (open ? '<div class="player__detail">' + dossierHTML(player) + "</div>" : "") +
      "</div>";
    }).join("");

    table.innerHTML = head + rows;

    if (state.openPlayer) { bindChart(); bindRange(); }
  }

  $("#rosterTable").addEventListener("click", function (e) {
    var row = e.target.closest("[data-player]");
    if (!row) return;
    var id = Number(row.dataset.player);
    var opening = state.openPlayer !== id;

    state.openPlayer = opening ? id : null;
    state.chartRange = null;          // every player opens at its own best window
    state.dossierLadder = null;       // ...and on the ladder the table is sorted by
    renderRoster();
    if (opening) loadDossier(id);
  });

  /* The per-player profile is fetched on expand rather than on load: it
     carries that player's entire rating history, which for a five-thousand
     game account is 386 KB on its own. Nine of those on load would be
     megabytes spent on a panel nobody may open. */
  function loadDossier(profileId) {
    if (state.detailCache.has(profileId)) return;
    state.detailFailed.delete(profileId);

    AOE.fetchPlayerDetail(profileId).then(function (detail) {
      state.detailCache.set(profileId, detail);
      if (state.openPlayer !== profileId) return;   // a newer pick won
      paintDossier();
    }).catch(function () {
      state.detailFailed.add(profileId);
      if (state.openPlayer !== profileId) return;
      paintDossier();
    });
  }

  $("#rosterTable").addEventListener("click", function (e) {
    var tab = e.target.closest("[data-mode]");
    if (tab) {
      /* A different mode is a different chart, so let it pick its own
         window again rather than carrying "1M" onto a mode with no games
         in the last month. */
      state.dossierLadder = tab.dataset.mode;
      state.chartRange = null;
      paintDossier();
      // This mode may never have been asked about; the denominator follows.
      loadCountryTotals(state.dossierLadder);
      if (e.detail === 0) {
        var again = $('#rosterTable [data-mode="' + state.dossierLadder + '"]');
        if (again) again.focus();
      }
      return;
    }

    var full = e.target.closest("[data-full]");
    if (full) loadFullHistory(Number(full.dataset.full));
  });

  /* Sixteen requests and ~12 MB for a five-thousand-game account, so this
     runs only when asked. Progress is repainted as each page lands. */
  function loadFullHistory(profileId) {
    if (state.fullHistory.has(profileId) || state.fullLoading.has(profileId)) return;

    state.fullLoading.add(profileId);
    state.fullProgress.set(profileId, 0);
    paintDossier();

    AOE.fetchFullHistory(profileId, function (seen) {
      state.fullProgress.set(profileId, seen);
      if (state.openPlayer === profileId) paintDossier();
    }).then(function (matches) {
      state.fullLoading.delete(profileId);
      state.fullHistory.set(profileId, matches);
      if (state.openPlayer === profileId) paintDossier();
    }).catch(function () {
      /* Keep whatever the walk managed before it fell over; the panels just
         stay on the 300 they opened with. */
      state.fullLoading.delete(profileId);
      if (state.openPlayer === profileId) paintDossier();
    });
  }

  /* Repaints the open panel alone. Re-rendering the whole table would throw
     away the control the reader is standing on — the range buttons live
     inside the panel they redraw. */
  function paintDossier() {
    if (!state.openPlayer) return;
    var host = $("#rosterTable .player--open .player__detail");
    if (!host) return;

    var player = state.roster.filter(function (p) {
      return p.profileId === state.openPlayer;
    })[0];
    if (!player) return;

    host.innerHTML = dossierHTML(player);
    bindChart();
    bindRange();
  }

  /* ---------- the dossier ----------
     Roster and Intel used to be two sections asking the same question: you
     picked a name here, then scrolled to a second list and picked the SAME
     name again to see its chart. This is both, in one place.

     Layout, top to bottom: a nameplate that is true whatever mode you are
     looking at, the mode switch, then everything that changes with it. */

  function dossierHTML(player) {
    var detail = state.detailCache.get(player.profileId);
    var failed = state.detailFailed.has(player.profileId);

    return '<div class="dossier">' +
      nameplateHTML(player, detail) +
      modesHTML(player, detail) +
      chartPanelHTML(detail, failed) +
      numbersHTML(player, detail) +
      topsHTML(player, detail) +
    "</div>";
  }

  /* The label a mode goes by: the site's own name for the ladders it is
     configured for, then the service's abbreviation, then the bare id. */
  function modeLabel(ladder, detail) {
    if (LADDER_LABEL[ladder]) return LADDER_LABEL[ladder];
    var board = detail && detail.boards ? detail.boards[ladder] : null;
    if (board && board.label) return board.label;
    return ladderName(ladder);
  }

  /* Which ladder the open dossier is showing. Defaults to whichever the
     roster table is sorted by, then follows the mode tabs. */
  function dossierLadder(detail) {
    var picked = state.dossierLadder;
    if (picked && (!detail || modeList(detail).some(function (m) { return m.id === picked; }))) {
      return picked;
    }
    return state.ladder;
  }

  /* Every mode this player actually has games on, busiest first — including
     the ones CLAN.ladders doesn't list, because "switch between game modes"
     should offer the modes they play, not the three the site was configured
     for. */
  function modeList(detail) {
    if (!detail || !detail.boards) return [];
    return Object.keys(detail.boards)
      .map(function (id) {
        var board = detail.boards[id];
        return {
          id: id,
          label: LADDER_LABEL[id] || board.label || String(id).replace(/_/g, " "),
          rating: board.rating,
          games: board.games || 0
        };
      })
      .filter(function (mode) { return mode.games > 0; })
      .sort(function (a, b) { return b.games - a.games; });
  }

  /* ---------- nameplate ---------- */

  /* This used to be a tall left-hand column holding three pale mono lines.
     Same facts, one banner: the portrait and name lead, the rest reads as
     chips along the bottom. */
  function nameplateHTML(player, detail) {
    var note = noteFor(player);
    var card = state.profileCards.get(player.profileId) || {};

    var place = (detail && detail.countryName) ||
                (player.country ? player.country.toUpperCase() : null);

    var chips = [];
    var platform = (detail && detail.platform) || card.platform;
    if (platform) chips.push(["", platform]);

    var allTime = detail && detail.allTimeGames != null ? detail.allTimeGames : card.games;
    if (allTime) chips.push([allTime.toLocaleString("en-US"), "games"]);

    /* Drops are the honest half of a record. Worth printing, not hiding. */
    var drops = detail && detail.drops != null ? detail.drops : card.drops;
    if (drops) chips.push([drops.toLocaleString("en-US"), "dropped"]);

    ((detail && detail.linked) || []).forEach(function (alt) {
      chips.push([alt.name, "alt account"]);
    });

    return '<section class="d-name">' +
      '<div class="d-name__id">' +
        avatarHTML(player, "lg") +
        '<div class="d-name__who">' +
          '<p class="d-name__title">' + esc(player.name) + "</p>" +
          '<p class="d-name__sub">' +
            (note.role ? '<b>' + esc(note.role) + "</b>" : "") +
            (place ? '<span class="d-name__place">' + flag(player.country) + esc(place) + "</span>" : "") +
          "</p>" +
          (note.bio ? '<p class="d-name__bio">' + esc(note.bio) + "</p>" : "") +
        "</div>" +
      "</div>" +

      '<div class="d-name__side">' +
        '<p class="d-name__links">' +
          (CLAN.profileLinks || []).map(function (link) {
            return '<a class="text-link" href="' + esc(link.url.replace("{id}", player.profileId)) +
                   '" target="_blank" rel="noopener noreferrer">' + esc(link.label) + " ↗</a>";
          }).join("") +
        "</p>" +
        (chips.length
          ? '<div class="chips">' + chips.map(function (chip) {
              return '<span class="chip">' +
                (chip[0] ? "<b>" + esc(chip[0]) + "</b>" : "") +
                "<i>" + esc(chip[1]) + "</i></span>";
            }).join("") + "</div>"
          : "") +
      "</div>" +
    "</section>";
  }

  /* ---------- mode switch ----------
     This absorbed the old "Rating across ladders" panel. That panel and
     this control were answering the same question — which modes does this
     player have a rating in — so the tabs carry the rating themselves and
     the panel is gone, along with the dead space under its three rows. */
  function modesHTML(player, detail) {
    var modes = modeList(detail);
    if (!modes.length) return '<section class="d-modes d-modes--empty"></section>';

    var current = dossierLadder(detail);

    return '<section class="d-modes" role="tablist" aria-label="Game mode">' +
      modes.map(function (mode) {
        var on = mode.id === current;
        return '<button type="button" role="tab" data-mode="' + esc(mode.id) + '" ' +
            'aria-selected="' + on + '">' +
          "<span>" + esc(mode.label) + "</span>" +
          "<b>" + (mode.rating != null ? mode.rating : "—") + "</b>" +
          "<i>" + mode.games.toLocaleString("en-US") +
            (mode.games === 1 ? " game" : " games") + "</i>" +
        "</button>";
      }).join("") +
    "</section>";
  }

  function chartPanelHTML(detail, failed) {
    var ladder = dossierLadder(detail);

    function panel(headExtra, control, body) {
      return '<section class="d-chart">' +
        '<div class="d-chart__head">' +
          label("trend", "Rating history · " + modeLabel(ladder, detail) + headExtra) +
          control +
        "</div>" + body +
      "</section>";
    }

    if (failed) {
      chartGeometry = null;
      return panel("", "", '<p class="chart-empty">Match history unavailable right now.</p>');
    }
    if (!detail) {
      chartGeometry = null;
      return panel("", "", '<p class="chart-empty">Loading…</p>');
    }

    var history = detail.historyByLadder[ladder] || [];
    if (history.length < 2) {
      chartGeometry = null;
      return panel("", "", '<p class="chart-empty">No rating history on this ladder.</p>');
    }

    var active = state.chartRange || defaultRange(history);
    var points = sample(windowed(history, rangeFor(active).days));

    return panel(" · " + history.length.toLocaleString("en-US") + " games",
                 rangeHTML(history, active),
                 chartHTML(points));
  }

  function numbersHTML(player, detail) {
    var ladder = dossierLadder(detail);
    var stats = player.ladders[ladder] || {};
    var board = detail && detail.boards ? detail.boards[ladder] : null;

    /* A mode the roster query doesn't cover (Empire Wars, Quick Play) has no
       entry in `player.ladders` at all — the profile payload is the only
       place its rating and record exist. */
    var rating = stats.rating != null ? stats.rating : (board ? board.rating : null);
    var peak = stats.peak != null ? stats.peak : null;
    var games = stats.games != null ? stats.games : (board ? board.games : null);
    var wins = stats.wins, losses = stats.losses, winRate = stats.winRate;

    var standing = standingText(player, ladder, stats, detail);
    var recent = matchesOn(detail, ladder);
    var lengths = recent.length ? AOE.durationStats(recent.filter(function (m) { return m.won != null && !m.vsAI; })) : null;
    var streak = streakLabel(stats.streak);

    return '<section class="d-numbers"><div class="numbers">' +
      '<div><span class="data-label">Current</span><strong>' + num(rating) + "</strong>" +
        (standing ? '<span class="sub">' + esc(standing) + "</span>" : "") + "</div>" +
      '<div><span class="data-label">Peak</span><strong>' + num(peak) + "</strong>" +
        (games ? '<span class="sub">' + games.toLocaleString("en-US") + " games on this mode</span>" : "") + "</div>" +
      '<div><span class="data-label">Win rate</span><strong>' +
        (winRate != null ? winRate + "%" : "—") + "</strong>" +
        (wins != null
          ? '<span class="sub">' + wins + "W · " + num(losses) + "L" +
            (streak ? " · " + esc(streak) : "") + "</span>"
          : "") + "</div>" +
      /* Deliberately the same source as the strip on the row above, so
         expanding a player can never appear to change their last five. */
      '<div><span class="data-label">Last 5 · selected period</span>' + formStrip(formFor(player.profileId, ladder)) +
        (lengths
          ? '<span class="sub">avg ' + esc(fmtDuration(lengths.average)) +
            " · longest " + esc(fmtDuration(lengths.longest)) + "</span>"
          : "") + "</div>" +
    "</div></section>";
  }

  /* The deepest feed we hold for this player, narrowed to one mode. Falls
     back to every mode when the chosen one has nothing in the window. */
  function matchesOn(detail, ladder) {
    if (!detail) return [];
    var all = state.fullHistory.get(state.openPlayer) || detail.matches;
    var onLadder = all.filter(function (m) { return m.ladder === ladder; });
    return onLadder.length ? onLadder : all;
  }

  function topsHTML(player, detail) {
    if (!detail) {
      return '<section class="d-civs">' + label("civ", "Most played civs") +
               '<p class="chart-empty">Loading…</p></section>' +
             '<section class="d-maps">' + label("map", "Most played maps") +
               '<p class="chart-empty">Loading…</p></section>';
    }

    var ladder = dossierLadder(detail);
    var recent = matchesOn(detail, ladder);
    var full = state.fullHistory.has(player.profileId);
    var loading = state.fullLoading.has(player.profileId);

    /* Say what the tally is actually counting. It was reading twenty games
       and presenting the result as though it meant something. */
    var scope = recent.length.toLocaleString("en-US") +
                (recent.length === 1 ? " game" : " games");

    return '<section class="d-civs">' +
        '<div class="d-top__head">' + label("civ", "Most played civs") +
          '<span class="d-top__scope">' + esc(scope) + "</span></div>" +
        topRows(AOE.tally(recent, "civ", "civImage", 8), "Civilisation", "Picks") +
      "</section>" +
      '<section class="d-maps">' +
        '<div class="d-top__head">' + label("map", "Most played maps") +
          historyControlHTML(player, detail, full, loading) + "</div>" +
        topRows(AOE.tally(recent, "map", "mapImage", 8), "Map", "Games") +
      "</section>";
  }

  /* Dossier expansion reads the stored player file. Full-history controls
     change the displayed scope without asking the source API for more. */
  function historyControlHTML(player, detail, full, loading) {
    if (full) {
      var held = (state.fullHistory.get(player.profileId) || []).length;
      return '<span class="d-top__scope d-top__scope--full">' + (detail.historyComplete === false ? 'stored history (incomplete) · ' : 'stored history · ') +
             esc(held.toLocaleString("en-US")) +
             (held === 1 ? " game" : " games") + "</span>";
    }
    if (loading) {
      var seen = state.fullProgress.get(player.profileId) || 0;
      return '<span class="d-top__scope">loading… ' +
             esc(seen.toLocaleString("en-US")) + " games</span>";
    }

    var allTime = detail.storedMatches;
    return '<button type="button" class="link-button" data-full="' + player.profileId + '">' +
      "Show all stored" + (allTime ? " " + allTime.toLocaleString("en-US") : "") + " games" +
    "</button>";
  }

  /* "#576 of 45,681 world · #10 of 875 in CZ". The world denominator rides
     in on the profile request the dossier already makes; only the country
     half costs a request of its own.

     The rank itself comes from the profile wherever there is one, because
     the clan leaderboard query answers the same question a moment earlier
     and drifts by a place or three. */
  function standingText(player, ladder, stats, detail) {
    var bits = [];
    var board = detail && detail.boards ? detail.boards[ladder] : null;
    var rank = board && board.rank != null ? board.rank : stats.rank;

    if (rank != null) {
      bits.push("#" + rank.toLocaleString("en-US") +
        (board && board.total ? " of " + board.total.toLocaleString("en-US") : "") + " world");
    }
    var country = countryStanding(player.country, ladder, stats.rankCountry);
    if (country) bits.push(country);

    return bits.join(" · ");
  }

  function topRows(rows, nameLabel, countLabel) {
    nameLabel = nameLabel || "Name";
    countLabel = countLabel || "Games";
    if (!rows.length) return '<p class="chart-empty">No eligible results in this selection.</p>';
    var most = Math.max.apply(null, rows.map(function (row) { return row.games; }));
    return '<table class="stat-table"><thead><tr><th scope="col">' + esc(nameLabel) + '</th><th scope="col">' + esc(countLabel) + '</th><th scope="col">Win rate</th></tr></thead><tbody>' + rows.map(function (row) {
      return '<tr><th scope="row"><div class="stat-name">' +
        (row.image ? '<img src="' + esc(row.image) + '" loading="lazy" alt="">' : '') +
        '<span>' + esc(row.name) + (row.games < 10 ? '<small>Small sample</small>' : '') + '</span></div></th>' +
        '<td><span class="volume" style="--share:' + Math.round(row.games / most * 100) + '%">' + row.games + '</span></td>' +
        '<td><b>' + row.winRate + '%</b><small>' + row.wins + 'W · ' + (row.games - row.wins) + 'L</small></td></tr>';
    }).join('') + '</tbody></table>';
  }

  function clanChart(rows, field, imageField) {
    var values = AOE.tally(rows, field, imageField, Number.MAX_SAFE_INTEGER);
    if (state.chartSort[field] === "win") values = values.filter(function (r) { return r.games >= 10; }).sort(function (a, b) { return b.winRate - a.winRate || b.games - a.games; });
    return topRows(values.slice(0, 8), field === "civ" ? "Civilisation" : "Map", field === "civ" ? "Picks" : "Appearances");
  }

  /* ---------- rating chart ---------- */

  /* The public history runs the length of a career — one member has 3,344
     rated games on record — and the chart used to draw a flat last-80 slice
     of it. These windows open up the rest. */
  var RANGES = [
    { key: "1m",  label: "1M",  days: 30 },
    { key: "6m",  label: "6M",  days: 182 },
    { key: "1y",  label: "1Y",  days: 365 },
    { key: "all", label: "All", days: null }
  ];

  function rangeFor(key) {
    return RANGES.filter(function (r) { return r.key === key; })[0] || RANGES[RANGES.length - 1];
  }

  function windowed(history, days) {
    if (!days) return history;
    var cutoff = state.asOf - days * 86400000;
    return history.filter(function (p) { return new Date(p.date).getTime() >= cutoff; });
  }

  /* Past a few hundred points the line is finer than the 640-unit viewBox
     can draw, so long windows are thinned by a fixed stride. The shape
     survives, and every point left standing is still a real game — which
     matters, because the hover readout names it. */
  var MAX_POINTS = 360;

  function sample(points) {
    if (points.length <= MAX_POINTS) return points;
    var out = [];
    var stride = points.length / MAX_POINTS;
    for (var i = 0; i < MAX_POINTS; i++) out.push(points[Math.floor(i * stride)]);
    var last = points[points.length - 1];
    if (out[out.length - 1] !== last) out.push(last);  // always land on the newest game
    return out;
  }

  /* Open on the shortest window that still draws a real line. Someone who
     plays monthly has nothing in the last thirty days, and an empty chart
     is a worse first impression than a longer view. */
  function defaultRange(history) {
    for (var i = 0; i < RANGES.length; i++) {
      if (windowed(history, RANGES[i].days).length >= 15) return RANGES[i].key;
    }
    return "all";
  }

  function rangeHTML(history, active) {
    return '<div class="range" role="group" aria-label="Chart range">' +
      RANGES.map(function (r) {
        var count = windowed(history, r.days).length;
        return '<button type="button" data-range="' + r.key + '"' +
          (count < 2 ? " disabled" : "") +
          ' aria-pressed="' + (r.key === active) + '">' + r.label + "</button>";
      }).join("") +
    "</div>";
  }

  function bindRange() {
    var group = $("#rosterTable .range");
    if (!group) return;

    group.addEventListener("click", function (e) {
      var button = e.target.closest("[data-range]");
      if (!button || button.disabled) return;

      state.chartRange = button.dataset.range;
      paintDossier();

      /* The control was just replaced. Only chase the focus back for
         keyboard activation (detail 0) — after a mouse click it would paint
         a focus ring nobody asked for. */
      if (e.detail === 0) {
        var again = $('#rosterTable .range [data-range="' + state.chartRange + '"]');
        if (again) again.focus();
      }
    });
  }

  /* Geometry of the chart currently on screen, so the hover handler can map
     a pointer position back to the game under it. Only one exists at a
     time — one roster row is open at most. */
  var chartGeometry = null;

  function chartDate(iso) {
    if (!iso) return "—";
    var when = new Date(iso);
    if (isNaN(when.getTime())) return "—";
    return when.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function chartHTML(points) {
    if (points.length < 2) {
      chartGeometry = null;
      return '<p class="chart-empty">Not enough games in this range to draw a line.</p>';
    }

    var w = 640, h = 240, padX = 34, padY = 20;
    var right = w - 12;
    var values = points.map(function (p) { return p.rating; });
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var span = Math.max(max - min, 1);

    var coords = values.map(function (value, i) {
      return {
        x: padX + (i / Math.max(values.length - 1, 1)) * (right - padX),
        y: h - padY - ((value - min) / span) * (h - padY * 2)
      };
    });

    chartGeometry = { points: points, coords: coords, width: w, left: padX, right: right };

    var grid = [0.25, 0.5, 0.75].map(function (f) {
      var y = padY + f * (h - padY * 2);
      return '<line class="chart-grid" x1="' + padX + '" x2="' + right + '" y1="' + y + '" y2="' + y + '"/>';
    }).join("");

    return '<div class="chart-wrap" tabindex="0" role="group" ' +
        'aria-label="Rating history — hover, or use the arrow keys, to read individual games">' +
      '<svg class="chart" viewBox="0 0 ' + w + " " + h + '" role="img" ' +
        'aria-label="Rating history from ' + min + " to " + max + ' over ' + values.length + ' recorded games">' +
        grid +
        '<polyline class="chart-line" points="' +
          coords.map(function (c) { return c.x.toFixed(1) + "," + c.y.toFixed(1); }).join(" ") + '"/>' +
        '<line class="chart-cursor" x1="0" x2="0" y1="' + padY + '" y2="' + (h - padY) + '"/>' +
        '<circle class="chart-dot" r="4" cx="0" cy="0"/>' +
        '<text class="chart-axis" x="4" y="' + (padY + 4) + '">' + max + "</text>" +
        '<text class="chart-axis" x="4" y="' + (h - padY + 4) + '">' + min + "</text>" +
      "</svg>" +
      /* The window is the reader's choice now, so the chart has to say what
         it is actually showing. */
      '<div class="chart-dates">' +
        "<span>" + esc(chartDate(points[0].date)) + "</span>" +
        "<span>" + esc(chartDate(points[points.length - 1].date)) + "</span>" +
      "</div>" +
      '<div class="chart-tip" aria-live="polite"></div>' +
    "</div>";
  }

  /* The panel is rebuilt with innerHTML on every pick, so the handlers are
     bound to the fresh nodes each time rather than delegated. */
  function bindChart() {
    var wrap = $(".chart-wrap");
    if (!wrap || !chartGeometry) return;

    var svg = $(".chart", wrap);
    var cursor = $(".chart-cursor", wrap);
    var dot = $(".chart-dot", wrap);
    var tip = $(".chart-tip", wrap);
    var active = -1;

    function show(index) {
      var geo = chartGeometry;
      index = Math.max(0, Math.min(geo.coords.length - 1, index));
      if (index === active) return;
      active = index;

      var point = geo.points[index];
      var at = geo.coords[index];
      var diff = point.ratingDiff;

      cursor.setAttribute("x1", at.x);
      cursor.setAttribute("x2", at.x);
      dot.setAttribute("cx", at.x);
      dot.setAttribute("cy", at.y);

      tip.innerHTML =
        "<b>" + esc(num(point.rating)) + "</b>" +
        (diff != null
          ? '<i class="' + (diff >= 0 ? "up" : "down") + '">' +
            (diff >= 0 ? "+" : "") + diff + "</i>"
          : "") +
        "<em>" + esc(chartDate(point.date)) +
          (point.games != null ? " · game " + point.games.toLocaleString("en-US") : "") +
        "</em>";

      /* The label rides the point. Clamped so it can't hang off either end
         of the panel — near the edges it detaches from the guide slightly,
         which beats being clipped. */
      var percent = (at.x / geo.width) * 100;
      tip.style.left = Math.max(11, Math.min(89, percent)) + "%";

      wrap.classList.add("is-active");
    }

    function clear() {
      active = -1;
      wrap.classList.remove("is-active");
    }

    function indexAt(clientX) {
      var box = svg.getBoundingClientRect();
      if (!box.width) return 0;
      var geo = chartGeometry;
      // client pixels -> viewBox units -> position along the plotted span
      var units = ((clientX - box.left) / box.width) * geo.width;
      var along = (units - geo.left) / (geo.right - geo.left);
      return Math.round(along * (geo.coords.length - 1));
    }

    wrap.addEventListener("pointermove", function (e) { show(indexAt(e.clientX)); });
    wrap.addEventListener("pointerleave", clear);
    wrap.addEventListener("blur", clear);
    wrap.addEventListener("focus", function () {
      if (active < 0) show(chartGeometry.coords.length - 1);
    });
    wrap.addEventListener("keydown", function (e) {
      var step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      show(active < 0 ? chartGeometry.coords.length - 1 : active + step);
    });
  }

  /* ---------- war ledger ----------
     Every panel below reads off one filtered set, so the mode strip at the
     top of the section moves all of them together. */

  /* The modes worth offering, in a fixed order, plus however many games the
     current feed holds for each. A mode with nothing in it is not offered. */
  function ledgerTabs() {
    /* Counted over MATCHES. state.feed is one row per member appearance, so
       a game two members played together sits in it twice — counting that
       put "279 games" on a tab covering 212. */
    var counts = {};
    state.games.filter(inPeriod).forEach(function (game) {
      counts[game.ladder] = (counts[game.ladder] || 0) + 1;
    });

    var rankedCount = state.games.filter(inPeriod).filter(function (game) {
      return RANKED.indexOf(game.ladder) !== -1;
    }).length;

    var tabs = [{ id: "ranked", label: "Ranked", games: rankedCount }];
    CLAN.ladders.forEach(function (l) {
      tabs.push({ id: l.id, label: l.label, games: counts[l.id] || 0 });
    });
    return tabs;
  }

  /* One row per member appearance, narrowed to the chosen mode. */
  function ledgerRows() {
    var filter = state.ledgerFilter;
    return state.feed.filter(inPeriod).filter(function (row) {
      return filter === "ranked"
        ? RANKED.indexOf(row.ladder) !== -1
        : row.ladder === filter;
    });
  }

  /* The same narrowing over whole matches, for the feed and the warband. */
  function ledgerGames() {
    var filter = state.ledgerFilter;
    return state.games.filter(inPeriod).filter(function (game) {
      return filter === "ranked"
        ? RANKED.indexOf(game.ladder) !== -1
        : game.ladder === filter;
    });
  }

  /* What the civ, map and length tallies count: appearances, minus games
     against the computer. Two members picking two civs in one game really
     is two civ picks, so these stay per-appearance. */
  function ledgerRated(rows) {
    return rows.filter(function (row) { return !row.vsAI && row.won != null; });
  }

  /* The win rate, by contrast, is per MATCH. A four-stack winning together
     is one win, not four — and counting appearances made the headline
     disagree with the game count sitting next to it. Games with no winner
     recorded, or with members on both sides, describe no clan result and
     are left out of both halves. */
  function decidedGames(games) {
    var out = [];
    games.forEach(function (game) {
      if (game.vsAI) return;
      var ours = (game.lineup || []).filter(function (p) {
        return p.isMember;
      });
      if (!ours.length || ours.some(function (p) { return p.won == null; })) return;

      var won = ours.every(function (p) { return p.won; });
      var lost = ours.every(function (p) { return !p.won; });
      if (won === lost) return;                       // split sides: both, or neither

      out.push({
        matchId: game.matchId,
        won: won,
        durationMinutes: game.durationMinutes,
        map: game.map
      });
    });
    return out;
  }

  function renderLedgerTabs() {
    var tabs = ledgerTabs();
    if (!tabs.length) { $("#ledgerTabs").innerHTML = ""; return; }

    // A filter whose games all fell out of view falls back to the first tab.
    if (!tabs.some(function (t) { return t.id === state.ledgerFilter; })) {
      state.ledgerFilter = tabs[0].id;
    }

    $("#ledgerTabs").innerHTML = tabs.map(function (tab) {
      return '<button type="button" role="tab" data-ledger="' + esc(tab.id) + '" ' +
          'aria-selected="' + (tab.id === state.ledgerFilter) + '">' +
        "<span>" + esc(tab.label) + "</span>" +
        "<b>" + tab.games.toLocaleString("en-US") + "</b>" +
        "<i>" + (tab.games === 1 ? "game" : "games") + "</i>" +
      "</button>";
    }).join("");
  }

  function renderLedger() {
    if (!state.games.length && state.feedLoading) {
      ["#clanCivs", "#clanMaps", "#clanFeed", "#warband", "#clanFormats", "#clanAtlas"]
        .forEach(function (id) { $(id).innerHTML = '<div class="state">Loading selected period…</div>'; });
      return;
    }

    renderLedgerTabs();
    renderPeriod();

    var rows = ledgerRows();
    var rated = ledgerRated(rows);
    var games = ledgerGames();
    var decided = decidedGames(games);
    var wins = decided.filter(function (game) { return game.won; }).length;

    var active = new Set(rows.map(function (row) { return row.profileId; })).size;
    var lengths = AOE.durationStats(decided);
    var excluded = games.length - decided.length;
    var tiles = [
      ["hero", decided.length ? Math.round(wins / decided.length * 100) + "%" : "—", "Match win rate",
        decided.length ? wins + "W · " + (decided.length - wins) + "L · " + decided.length + " decided" : "No decided matches"],
      ["", games.length.toLocaleString("en-US"), "Unique matches", excluded + " excluded from win rate"],
      ["", String(active), "Active accounts", "of " + state.roster.length + " roster accounts"],
      ["", lengths ? fmtDuration(lengths.average) : "—", "Average length", lengths ? "Median " + fmtDuration(lengths.median) : "No timed matches"]
    ];


    $("#ledgerStats").innerHTML = tiles.map(function (row) {
      return '<div class="ledger__stat' + (row[0] ? " ledger__stat--hero" : "") + '">' +
             "<strong>" + esc(row[1]) + "</strong>" +
             '<span class="data-label">' + esc(row[2]) + "</span>" +
             '<span class="sub">' + esc(row[3]) + "</span></div>";
    }).join("");

    $("#clanCivs").innerHTML = clanChart(rated, "civ", "civImage");
    $("#clanMaps").innerHTML = clanChart(rated, "map", "mapImage");

    renderFormats(games);
    renderAtlas(games);
    renderWarband();
    renderFeed();
    renderLedgerMore();
    statusOK($("#ledgerStatus"), sourceLabel());
  }

  /* ---------- how the clan queues ----------
     Team size comes off the line-up: eight players is a 4v4, two is a 1v1.
     Nothing on the page showed this, and the split turns out to be the most
     honest answer to "what does this clan actually play". */
  function renderFormats(games) {
    var totals = new Map();

    games.forEach(function (game) {
      if (!decidedGames([game]).length) return;
      var lineup = game.lineup || [];
      if (game.vsAI || !lineup.length) return;

      var sides = new Map();
      lineup.forEach(function (player) {
        var key = player.team != null ? player.team : 0;
        sides.set(key, (sides.get(key) || 0) + 1);
      });

      // Only even, two-sided games describe a format cleanly.
      var counts = Array.from(sides.values());
      if (counts.length !== 2 || counts[0] !== counts[1]) return;

      var name = counts[0] + "v" + counts[1];
      var row = totals.get(name) || { name: name, games: 0, wins: 0, size: counts[0] };
      row.games += 1;

      var ours = lineup.filter(function (p) { return p.isMember && p.won != null; });
      if (ours.length && ours.every(function (p) { return p.won; })) row.wins += 1;

      totals.set(name, row);
    });

    var rows = Array.from(totals.values())
      .map(function (row) {
        row.winRate = row.games ? Math.round((row.wins / row.games) * 100) : 0;
        return row;
      })
      .sort(function (a, b) { return b.games - a.games; });

    $("#clanFormats").innerHTML = rows.length
      ? barRows(rows.map(function (row) {
          return { name: row.name, games: row.games, wins: row.wins, winRate: row.winRate };
        }))
      : '<p class="chart-empty">No two-sided games in view.</p>';
  }

  /* ---------- who the clan runs into ----------
     Opponents are kept on the line-up for exactly this. Everyone the clan has
     faced, by country — 48 of them across 300 games. */
  function renderAtlas(games) {
    var totals = new Map();
    var faced = new Set();

    games.forEach(function (game) {
      if (game.vsAI) return;
      var memberTeams = new Set((game.lineup || []).filter(function (p) { return p.isMember && p.team != null; }).map(function (p) { return p.team; }));
      if (!memberTeams.size) return;
      (game.lineup || []).forEach(function (player) {
        if (player.isMember || player.team == null || memberTeams.has(player.team) || !player.country || player.profileId == null || faced.has(player.profileId)) return;
        faced.add(player.profileId);
        var key = player.country.toLowerCase();
        totals.set(key, (totals.get(key) || 0) + 1);
      });
    });

    if (!totals.size) {
      $("#clanAtlas").innerHTML = '<p class="chart-empty">No opponents recorded in view.</p>';
      return;
    }

    var rows = Array.from(totals.entries())
      .map(function (entry) { return { code: entry[0], games: entry[1] }; })
      .sort(function (a, b) { return b.games - a.games; });

    var most = rows[0].games;

    $("#clanAtlas").innerHTML =
      '<p class="atlas__lead"><b>' + rows.length + "</b> countries · <b>" +
        faced.size.toLocaleString("en-US") + "</b> unique opponents · known countries</p>" +
      '<div class="atlas">' + rows.slice(0, 18).map(function (row) {
        return '<span class="atlas__cell" title="' + esc(row.code.toUpperCase()) + " · " +
            row.games + (row.games === 1 ? " player" : " players") + '" ' +
            'style="--share:' + Math.round((row.games / most) * 100) + '%">' +
          flag(row.code) +
          "<b>" + esc(row.code.toUpperCase()) + "</b>" +
          "<i>" + row.games + "</i>" +
        "</span>";
      }).join("") + "</div>";
  }

  /* The clan feed is paged, so the section can reach further back on ask. */
  function renderLedgerMore() {
    var host = $("#ledgerMore");
    if (!host) return;
    if (state.feedError) {
      host.innerHTML = '<p class="ledger__more-note">This period is incomplete. Showing the games available so far.</p><button type="button" class="button button--ghost" id="ledgerMoreBtn">Retry loading period</button>';
    } else {
      var scope = state.feedExhausted && !state.feedHistoryComplete ? 'All stored games loaded; earlier history is incomplete' : periodCovered() ? 'Selected period loaded' : 'Loading selected period…';
      host.innerHTML = '<p class="ledger__more-note">' + scope + ' · ' + state.games.length.toLocaleString("en-US") + ' unique matches available in this session.</p>';
    }
  }


  /* A bar row without an icon: name, count, win rate. Same shape as the civ
     and map rows so the two read as one family. */
  function barRows(rows) { return topRows(rows, "Format", "Matches"); }


  $("#ledgerTabs").addEventListener("click", function (e) {
    var tab = e.target.closest("[data-ledger]");
    if (!tab || tab.dataset.ledger === state.ledgerFilter) return;

    state.ledgerFilter = tab.dataset.ledger;
    state.pair = null;
    state.openMatch = null;      // the open card may not be in the new set
    renderLedger();

    if (e.detail === 0) {
      var again = $('#ledgerTabs [data-ledger="' + state.ledgerFilter + '"]');
      if (again) again.focus();
    }
  });

  $("#ledgerMore").addEventListener("click", function (e) {
    if (e.target.closest("#ledgerMoreBtn")) { state.feedError = false; loadFeed(state.games.length ? state.feedPage + 1 : 1); }
  });

  /* ---------- latest games, one expandable card each ---------- */

  /* `state.feed` is one row per member APPEARANCE, so a game two members
     played together sits in it twice. That already showed as a duplicate
     pair of rows; now that a row opens into the full line-up it would open
     two identical cards, so the feed folds them into one row per match and
     names everyone from the clan who was in it. */
  function pairGames() {
    if (!state.pair) return [];
    return ledgerGames().filter(function (game) {
      if (game.vsAI) return false;
      var members = game.members.filter(function (m) { return state.pair.ids.indexOf(m.profileId) !== -1; });
      return members.length === 2 && members[0].team != null && members[0].team === members[1].team;
    });
  }
  function feedMatches() {
    return (state.pair ? pairGames() : ledgerGames()).slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  }


  /* Members on opposite sides of a custom game means the clan both won and
     lost it, and scenarios record no winner at all — neither deserves a
     confident W or L. */
  function matchOutcome(game) {
    var results = (game.lineup || [])
      .filter(function (p) { return p.isMember && p.won != null; })
      .map(function (p) { return p.won; });

    if (!results.length) return { mark: "·", cls: "n", label: "no result recorded" };
    if (results.every(Boolean)) return { mark: "W", cls: "w", label: "won" };
    if (!results.some(Boolean)) return { mark: "L", cls: "l", label: "lost" };
    return { mark: "±", cls: "n", label: "members on both sides" };
  }

  function renderFeed() {
    var matches = feedMatches().slice(0, 10);
    $("#feedScope").innerHTML = state.pair ? '<p class="pair-scope">Shared matches: ' + esc(state.pair.a) + " × " + esc(state.pair.b) + ' <button type="button" data-clear-pair>Show all clan matches</button></p>' : '<p class="panel-note">Latest 10 matches in the selected period and mode.</p>';
    var host = $("#clanFeed");

    if (!matches.length) {
      host.innerHTML = '<div class="state">No recent games found.</div>';
      return;
    }

    host.innerHTML = matches.map(function (game) {
      var id = String(game.matchId);
      var open = state.openMatch === id;
      var outcome = matchOutcome(game);
      var ours = (game.lineup || []).filter(function (p) { return p.isMember; });

      var civs = [];
      ours.forEach(function (p) {
        if (p.civ && civs.indexOf(p.civ) === -1) civs.push(p.civ);
      });

      var names = ours.length ? ours.map(function (p) { return p.name; }).join(" · ") : "GG Clan";
      var sub = (civs.length ? civs.join(", ") + " · " : "") + (game.map || "—");
      var diff = ours.length === 1 ? ours[0].ratingDiff : null;

      return '<div class="feed-item' + (open ? " feed-item--open" : "") + '">' +
        '<button class="feed-row" data-match="' + esc(id) + '" aria-expanded="' + open + '">' +
          '<span class="feed-row__mark ' + outcome.cls + '" aria-hidden="true">' + outcome.mark + "</span>" +
          '<span class="feed-row__who"><b>' + esc(names) + "</b>" +
            "<em>" + esc(sub) + "</em>" +
            '<span class="sr-only">' + esc(outcome.label) + "</span></span>" +
          '<span class="feed-row__when">' + esc(timeAgo(game.date)) +
            (game.durationMinutes != null || diff != null
              ? "<em>" + (game.durationMinutes != null ? esc(fmtDuration(game.durationMinutes)) : "") +
                (diff != null
                  ? '<i class="' + (diff >= 0 ? "up" : "down") + '">' + (diff >= 0 ? "+" : "") + diff + "</i>"
                  : "") + "</em>"
              : "") +
          "</span>" +
        "</button>" +
        (open ? matchCardHTML(game) : "") +
      "</div>";
    }).join("");
  }

  /* Both full line-ups. The opponents are kept for this one panel —
     everything else on the page counts clan members alone. */
  function matchCardHTML(game) {
    var lineup = game.lineup || [];

    var meta = [
      game.map,
      ladderName(game.ladder),
      game.durationMinutes != null ? fmtDuration(game.durationMinutes) : null,
      game.vsAI ? "vs AI" : null,
      fullDate(game.date)
    ].filter(Boolean);

    if (!lineup.length) {
      return '<div class="match-card"><p class="match-card__meta">' + esc(meta.join(" · ")) + "</p>" +
        '<p class="chart-empty">The match feed recorded no line-up for this game.</p></div>';
    }

    var order = [];
    var byTeam = new Map();
    lineup.forEach(function (player) {
      var key = player.team != null ? player.team : 0;
      if (!byTeam.has(key)) { byTeam.set(key, []); order.push(key); }
      byTeam.get(key).push(player);
    });
    order.sort(function (a, b) { return a - b; });

    var sides = order.map(function (key, i) {
      var side = byTeam.get(key);
      var won = side.some(function (p) { return p.won === true; });
      var decided = side.some(function (p) { return p.won != null; });

      var lost = decided && !won;

      return '<div class="side' + (won ? " side--won" : lost ? " side--lost" : "") + '">' +
        '<p class="side__head"><span>Team ' + (i + 1) + "</span>" +
          (decided ? "<em>" + (won ? "Won" : "Lost") + "</em>" : "") + "</p>" +
        side.map(function (p) {
          return '<div class="side__player' + (p.isMember ? " side__player--ours" : "") + '">' +
            (p.civImage
              ? '<img src="' + esc(p.civImage) + '" width="22" height="22" loading="lazy" alt="">'
              : '<span class="side__blank" aria-hidden="true"></span>') +
            "<b>" + esc(p.name || "—") + "</b>" +
            "<em>" + esc(p.civ || "—") + "</em>" +
            "<i>" + (p.rating != null ? p.rating : "—") +
              (p.ratingDiff != null
                ? '<span class="' + (p.ratingDiff >= 0 ? "up" : "down") + '">' +
                  (p.ratingDiff >= 0 ? "+" : "") + p.ratingDiff + "</span>"
                : "") +
            "</i>" +
          "</div>";
        }).join("") +
      "</div>";
    }).join("");

    return '<div class="match-card">' +
      '<p class="match-card__meta">' + esc(meta.join(" · ")) + "</p>" +
      '<div class="match-card__teams">' + sides + "</div>" +
    "</div>";
  }

  $("#clanFeed").addEventListener("click", function (e) {
    var row = e.target.closest("[data-match]");
    if (!row) return;
    var id = row.dataset.match;
    state.openMatch = state.openMatch === id ? null : id;
    renderFeed();

    /* innerHTML threw away the button that was just clicked, so a keyboard
       user would land back at the top of the document. Only restore it for
       keyboard activation (detail 0) — doing it after a mouse click makes
       the browser paint a focus ring nobody asked for. */
    if (e.detail === 0) {
      $$("#clanFeed [data-match]").forEach(function (button) {
        if (button.dataset.match === id) button.focus();
      });
    }
  });

  /* Pairs who queue on the same team — the clan's actual friendships,
     measured. */
  function renderWarband() {
    var pairs = AOE.warband(ledgerGames(), 2);
    if (state.pair) state.pair = pairs.filter(function (p) { return p.key === state.pair.key; })[0] || null;
    var host = $("#warband");
    if (!pairs.length) {
      host.innerHTML = '<p class="chart-empty">No pairs with at least two decided games together in this selection.</p>';
      $("#pairDetail").innerHTML = "";
      return;
    }
    host.innerHTML = '<div class="warband__grid">' + (state.showPairs ? pairs : pairs.slice(0, 6)).map(function (p) {
      return '<button type="button" class="duo" data-pair="' + esc(p.key) + '" aria-pressed="' + Boolean(state.pair && state.pair.key === p.key) + '">' +
        '<span class="duo__names"><b>' + esc(p.a) + '</b><i>×</i><b>' + esc(p.b) + '</b></span>' +
        '<span class="duo__meta"><em>' + p.games + ' together</em><strong>' + p.winRate + '%</strong></span>' +
        '<span class="duo__result">' + p.wins + 'W · ' + (p.games - p.wins) + 'L' + (p.games < 10 ? ' · Small sample' : '') + '</span></button>';
    }).join('') + '</div>' + (pairs.length > 6 ? '<button type="button" class="pair-toggle" data-toggle-pairs aria-expanded="' + state.showPairs + '">' + (state.showPairs ? 'Show fewer pairs' : 'Show all ' + pairs.length + ' pairs') + '</button>' : '');
    var detail = $("#pairDetail");
    if (!state.pair) { detail.innerHTML = ""; return; }
    var maps = new Map();
    pairGames().forEach(function (g) { if (g.map) maps.set(g.map, (maps.get(g.map) || 0) + 1); });
    var favourites = Array.from(maps.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3);
    detail.innerHTML = '<div class="pair-detail"><b>' + esc(state.pair.a) + ' × ' + esc(state.pair.b) + '</b><p>Favourite shared maps: ' + favourites.map(function (m) { return esc(m[0]) + ' (' + m[1] + ')'; }).join(' · ') + '</p><a href="#clanFeed">View shared matches ↓</a> <button type="button" data-clear-pair>Clear pair</button></div>';
  }
  $("#warband").addEventListener("click", function (e) {
    if (e.target.closest("[data-toggle-pairs]")) { state.showPairs = !state.showPairs; renderWarband(); var toggle = $("[data-toggle-pairs]"); if (toggle) toggle.focus(); return; }
    var button = e.target.closest("[data-pair]");
    if (!button) return;
    var key = button.dataset.pair;
    state.pair = state.pair && state.pair.key === key ? null : AOE.warband(ledgerGames(), 2).filter(function (p) { return p.key === key; })[0] || null;
    state.openMatch = null;
    renderWarband(); renderFeed();
    var again = $('#warband [data-pair="' + key + '"]');
    if (again && e.detail === 0) again.focus();
  });
  $("#ledger").addEventListener("click", function (e) {
    if (!e.target.closest("[data-clear-pair]")) return;
    state.pair = null; state.openMatch = null; renderWarband(); renderFeed();
    if (e.detail === 0) { var first = $('#warband [data-pair]'); if (first) first.focus(); }
  });


  /* ---------- boot ---------- */
  var ladderIds = CLAN.ladders.map(function (l) { return l.id; });

  AOE.fetchRoster(CLAN.clanTag, ladderIds).then(function (members) {
    var meta = AOE.snapshotNow();
    var updated = meta && new Date(meta.updatedAt).getTime();
    if (isFinite(updated) && updated > 0) state.asOf = updated;
    state.roster = members.filter(function (m) {
      return CLAN.hidden.indexOf(m.name) === -1;
    });

    var ranked = state.roster.filter(function (m) {
      return m.ladders.rm_team && m.ladders.rm_team.rating != null;
    }).length;

    statusOK($("#rosterStatus"), sourceLabel());
    $("#pulse").innerHTML = '<span class="dot dot--live"></span> ' +
      state.roster.length + " roster accounts · " + ranked + " ranked in Team RM";
    renderRoster();
    loadCountryTotals();
    loadAvatars();
    return loadFeed();
  }).catch(function () {
    statusFail($("#rosterStatus"), "Stored data unavailable");
    statusFail($("#ledgerStatus"), "Stored data unavailable");
    $("#pulse").innerHTML = '<span class="dot dot--error"></span> Clan signal unavailable';
    $("#rosterTable").innerHTML =
      '<div class="state">The saved data is unavailable. Please try again later.</div>';
    $("#clanCivs").innerHTML = $("#clanMaps").innerHTML = $("#clanFeed").innerHTML =
      '<div class="state">Unavailable.</div>';
  });

  /* Show the server refresh date alongside the stored match count. */
  AOE.snapshot().then(function (meta) {
    var host = $("[data-snapshot]");
    if (!host || !meta || !meta.updatedAt) return;

    var when = new Date(meta.updatedAt);
    if (isNaN(when.getTime())) return;

    host.textContent = " Snapshot archive: " +
      Number(meta.matches).toLocaleString() + " unique matches, last updated " +
      when.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) + ".";
  }).catch(function () { /* The main data panel already reports unavailable. */ });

  /* One request for the whole roster's stored identity cards — avatars, platform,
     all-time games and drops. Purely additive: if it fails the roster keeps
     its initial tiles and nothing else on the page notices. */
  function loadAvatars() {
    var ids = state.roster.map(function (m) { return m.profileId; });
    if (!ids.length) return;

    AOE.fetchProfiles(ids).then(function (cards) {
      if (!cards.size) return;
      state.profileCards = cards;
      renderRoster();
    });
  }

  /* One request covers every member's recent games — it powers the ledger
     and the form strips on the roster. */
  function loadFeed(page) {
    var ids = state.roster.map(function (m) { return m.profileId; });
    if (!ids.length) return;

    page = page || 1;
    if (state.feedLoading) return;
    state.feedLoading = true; state.feedError = false; renderLedgerMore(); renderPeriod();

    return AOE.fetchClanFeed(ids, page).then(function (result) {
      state.feedLoading = false;
      state.feedPage = page;
      state.feedExhausted = Boolean(result.exhausted);
      state.feedHistoryComplete = result.historyComplete !== false;

      if (page === 1) {
        state.feed = result.rows;
        state.games = result.games;
      } else {
        /* Games played between one request and the next shift the pages
           under us, so both lists are merged on identity rather than
           appended blind. */
        var seenGames = new Set(state.games.map(function (g) { return String(g.matchId); }));
        result.games.forEach(function (game) {
          if (seenGames.has(String(game.matchId))) return;
          seenGames.add(String(game.matchId));
          state.games.push(game);
        });

        var seenRows = new Set(state.feed.map(function (r) { return r.matchId + "|" + r.profileId; }));
        result.rows.forEach(function (row) {
          var key = row.matchId + "|" + row.profileId;
          if (seenRows.has(key)) return;
          seenRows.add(key);
          state.feed.push(row);
        });
        state.feed.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
      }

      state.gamesById = new Map(state.games.map(function (game) {
        return [String(game.matchId), game];
      }));

      /* Older pages complete the selected activity period and its rating changes. */
      renderRoster();
      renderLedger();
      if (!periodCovered() && !state.feedExhausted) return loadFeed(state.feedPage + 1);
    }).catch(function () {
      state.feedLoading = false;
      state.feedError = true;
      renderPeriod(); renderLedgerMore();
      if (page > 1) { return; }   // keep what is already shown
      statusFail($("#ledgerStatus"), "Feed unavailable");
      $("#clanCivs").innerHTML = $("#clanMaps").innerHTML = $("#clanFeed").innerHTML =
        $("#warband").innerHTML = '<div class="state">Match feed unavailable.</div>';
    });
  }

  /* National totals turn "#19" into "#19 of 875 in CZ". One request per
     country per ladder, cached for the session. */
  function loadCountryTotals(forLadder) {
    var ladder = forLadder || state.ladder;
    var countries = [];
    state.roster.forEach(function (m) {
      var c = m.country && m.country.toLowerCase();
      if (c && countries.indexOf(c) === -1 && !state.countryTotals.has(ladder + "|" + c)) {
        countries.push(c);
      }
    });
    if (!countries.length) return;

    return Promise.all(countries.map(function (c) {
      return AOE.fetchCountryTotal(ladder, c).then(function (total) {
        if (total != null) state.countryTotals.set(ladder + "|" + c, total);
      });
    })).then(function () {
      // Repaint whatever is already showing a rank.
      if (state.openPlayer) paintDossier();
    });
  }

  /* ============================================================
     6. Stored Discord presence on the join section
     ------------------------------------------------------------
     Independent of the ladder: it has its own request and its own
     failure mode. If the widget is off the panel stays hidden and
     the join button is exactly as it was.
     ============================================================ */
  (function discordPresence() {
    var host = $("#presence");
    if (!host || !window.DISCORD || !CLAN.discordGuildId) return;

    var FACES = 12; // enough to read as a crowd without wrapping to three rows

    function initial(name) {
      var first = Array.from(String(name || "?"))[0] || "?";
      return first.toUpperCase();
    }

    DISCORD.fetchWidget(CLAN.discordGuildId).then(function (guild) {
      if (!guild.online) {
        host.innerHTML = '<p class="live-badge presence__count">' +
          '<span class="dot"></span> Nobody online at the last update · ' + esc(shortDate(guild.updatedAt)) + '</p>';
        host.hidden = false;
        return;
      }

      var shown = guild.members.slice(0, FACES);
      var extra = Math.max(0, guild.online - shown.length);

      /* Whatever is worth saying beyond the headline count. */
      var notes = [];
      if (guild.inVoice) {
        notes.push(guild.inVoice + (guild.inVoice === 1 ? " in a voice channel" : " in voice channels"));
      }
      if (guild.playingAoe) {
        notes.push(guild.playingAoe + " in Age of Empires II");
      }

      host.innerHTML =
        '<p class="live-badge presence__count"><span class="dot dot--live"></span> ' +
          guild.online + " online at update · " + esc(shortDate(guild.updatedAt)) + "</p>" +
        (shown.length
          ? '<div class="presence__faces">' +
              shown.map(function (member) {
                var title = member.name +
                  (member.voice ? " · in " + member.voice : "") +
                  (member.playing ? " · playing " + member.playing : "");
                return '<span class="presence__face presence__face--' + esc(member.status) + '" ' +
                    'title="' + esc(title) + '">' +
                  (member.avatar
                    ? '<img src="' + esc(member.avatar) + '" width="34" height="34" ' +
                      'loading="lazy" alt="' + esc(member.name) + '">'
                    : '<i aria-hidden="true">' + esc(initial(member.name)) + "</i>" +
                      '<span class="sr-only">' + esc(member.name) + "</span>") +
                "</span>";
              }).join("") +
              (extra ? '<span class="presence__more">+' + extra + "</span>" : "") +
            "</div>"
          : "") +
        (notes.length ? '<p class="presence__note">' + esc(notes.join(" · ")) + "</p>" : "");

      host.hidden = false;
    }).catch(function () {
      /* Widget disabled or unreachable. The join button still works, so
         say nothing rather than showing a broken panel. */
      host.hidden = true;
    });
  })();
})();
