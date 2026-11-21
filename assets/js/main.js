/* ============================================================
   GG CLAN — behaviour
   Vanilla JS, no build step. Content from data.js, numbers from aoe.js.
   ============================================================ */
(function () {
  "use strict";

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  var countFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  var profileCounters = counterAnimation(".player--open");
  var clanCounters = counterAnimation("#ledgerStats");

  // Read the visible height before a render, including any unfinished transition.
  // Release the previous animation before measuring the new, responsive layout.
  var panelAnimations = new Map(), panelTiming;
  function cancelPanelAnimation(panel) {
    var running = panelAnimations.get(panel);
    if (running) {
      running.onfinish = null;
      running.cancel();
      panelAnimations.delete(panel);
      panel.classList.remove("is-resizing");
    }
  }

  function panelHeight(panel) {
    var height = panel.getBoundingClientRect().height;
    cancelPanelAnimation(panel);
    return height;
  }

  function transitionPanel(panel, from, to, fade, onFinish) {
    if (to == null) to = panel.getBoundingClientRect().height;
    var resize = Math.abs(to - from) >= 1;
    if (from == null || motionPreference.matches || !panel.animate || (!resize && !fade)) {
      if (onFinish) onFinish();
      return;
    }
    var start = {}, end = {};
    if (resize) {
      start.height = from + "px";
      end.height = to + "px";
      panel.classList.add("is-resizing");
    }
    if (fade) { start.opacity = .65; end.opacity = 1; }
    playPanelAnimation(panel, start, end, onFinish);
  }

  function playPanelAnimation(panel, start, end, onFinish) {
    if (!panelTiming) {
      var style = getComputedStyle(document.documentElement);
      panelTiming = {
        duration: parseFloat(style.getPropertyValue("--panel-duration")) || 0,
        easing: style.getPropertyValue("--ease").trim() || "ease",
        fill: "both"
      };
    }
    var animation = panel.animate([start, end], panelTiming);
    panelAnimations.set(panel, animation);
    animation.onfinish = function () {
      if (panelAnimations.get(panel) !== animation) return;
      panelAnimations.delete(panel);
      animation.cancel();
      panel.classList.remove("is-resizing");
      if (onFinish) onFinish();
    };
  }

  if (motionPreference.addEventListener) motionPreference.addEventListener("change", function (event) {
    if (event.matches) panelAnimations.forEach(function (animation) { animation.finish(); });
  });

  // When folding content above the activated control, preserve its viewport
  // position. Stop following as soon as the user scrolls or acts again.
  function anchorCollapse(control, panel) {
    if (!panel) return;
    var rect = control.getBoundingClientRect(), top = rect.top;
    if (rect.bottom <= 0 || top >= window.innerHeight || panel.getBoundingClientRect().bottom > top + 1) return;
    var input = new AbortController();
    ["wheel", "touchmove", "pointerdown", "keydown"].forEach(function (event) {
      window.addEventListener(event, function () { input.abort(); }, { passive: true, signal: input.signal });
    });
    requestAnimationFrame(function follow() {
      if (input.signal.aborted) return;
      if (control.isConnected) {
        var drift = control.getBoundingClientRect().top - top;
        if (Math.abs(drift) > 1) window.scrollBy({ top: drift, behavior: "instant" });
        var target = document.getElementById(control.getAttribute("aria-controls"));
        if (panelAnimations.has(panel) || panelAnimations.has(target)) { requestAnimationFrame(follow); return; }
      }
      input.abort();
    });
  }

  function countLabel(value, format) {
    if (format === "duration") return fmtDuration(value);
    var rounded = Math.round(value) || 0;
    return (format === "signed" && rounded > 0 ? "+" : "") + countFormat.format(rounded) +
      (format === "percent" ? "%" : "");
  }

  function countHTML(key, value, format) {
    if (typeof value !== "number" || !isFinite(value)) return "—";
    return '<span class="stat-count" data-count-key="' + esc(key) + '" data-count-value="' + value +
      '" data-count-format="' + esc(format || "integer") + '"><span class="stat-count__value">' +
      esc(countLabel(value, format)) + '</span></span>';
  }
  function valueHTML(value, format) {
    return typeof value === "number" && isFinite(value) ? esc(countLabel(value, format)) : "—";
  }

  function counterAnimation(selector) {
    var countFrame = 0, movingCounts = [];
    function finishCounts() {
      if (countFrame) cancelAnimationFrame(countFrame);
      countFrame = 0;
      movingCounts.forEach(function (item) {
        item.overlay.remove();
        item.node.removeAttribute("data-count-current");
      });
      movingCounts = [];
    }

    function captureCounts() {
      var previous = new Map();
      if (!motionPreference.matches) {
        $$(selector + " [data-count-key]").forEach(function (node) {
          previous.set(node.dataset.countKey, Number(node.dataset.countCurrent || node.dataset.countValue));
        });
      }
      finishCounts();
      return previous;
    }

    function animateCounts(previous) {
      if (!previous.size || motionPreference.matches) return;
      $$(selector + " [data-count-key]").forEach(function (node) {
        var start = previous.get(node.dataset.countKey);
        var end = Number(node.dataset.countValue), format = node.dataset.countFormat;
        if (start == null || countLabel(start, format) === countLabel(end, format)) return;
        var overlay = document.createElement("span");
        overlay.className = "stat-count__frame";
        overlay.setAttribute("aria-hidden", "true");
        overlay.textContent = countLabel(start, format);
        node.dataset.countCurrent = String(start);
        node.appendChild(overlay);
        movingCounts.push({ node: node, overlay: overlay, start: start, end: end, format: format });
      });
      if (!movingCounts.length) return;
      var started = performance.now();
      function tick(now) {
        var progress = Math.max(0, Math.min(1, (now - started) / 420));
        if (progress >= 1 || motionPreference.matches) { finishCounts(); return; }
        var eased = 1 - Math.pow(1 - progress, 3);
        movingCounts.forEach(function (item) {
          var value = item.start + (item.end - item.start) * eased;
          item.node.dataset.countCurrent = String(value);
          var nextLabel = countLabel(value, item.format);
          if (item.overlay.textContent !== nextLabel) item.overlay.textContent = nextLabel;
        });
        countFrame = requestAnimationFrame(tick);
      }
      countFrame = requestAnimationFrame(tick);
    }
    return { capture: captureCounts, animate: animateCounts, finish: finishCounts, active: function () { return movingCounts.length > 0; } };
  }

  /* ============================================================
     1. Static content from data.js
     ============================================================ */
  $("[data-blurb]").textContent = CLAN.blurb;
  $("[data-creed-title]").innerHTML = esc(CLAN.creedTitle) + '<span class="period">.</span>';
  $("[data-creed-lead]").textContent = CLAN.creedLead;
  $("[data-warcry]").textContent = CLAN.warcry;
  $("[data-clantag]").textContent = CLAN.clanTag;
  $("[data-year]").textContent = new Date().getFullYear();

  $$("[data-discord]").forEach(function (a) {
    a.href = CLAN.discord;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });

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
  if (!motionPreference.matches) {
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
      if (e.pointerType === "touch" || motionPreference.matches) return;
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
     4. Castle cinema — both exposures share the same physical screen.
     ============================================================ */
  (function cinemaGallery() {
    var cinema = $("#cities");
    var screen = cinema && $(".cinema__screen", cinema);
    var cities = CLAN.cities;
    if (!screen || !cities.length) return;

    var slide = $(".cinema__slide", screen);
    var house = $(".cinema__house", cinema);
    var picker = $(".cinema__picker", cinema);
    var drawer = $("#cityDrawer", cinema);
    var reels = $(".cinema__reels", drawer);
    var front = $("#cityFront", cinema);
    var announcement = $("#cityAnnouncement", cinema);
    var current = Math.min(1, cities.length - 1), wanted = current;
    var frames = new Map(), busy = false, fade = null;
    var touch = null, wasSwipe = false;

    function number(index) { return String(index + 1).padStart(2, "0"); }
    function cityURL(index) { return "assets/img/cities/city-" + number(index) + ".webp"; }
    function alt(index) { return cities[index][0] + ", an Age of Empires II city built by GG Clan"; }
    function imageFor(index) {
      if (!frames.has(index)) {
        var image = new Image();
        image.alt = alt(index);
        image.draggable = false;
        image.src = cityURL(index);
        frames.set(index, image.decode().then(function () { return image; }).catch(function (error) {
          frames.delete(index);
          throw error;
        }));
      }
      return frames.get(index);
    }

    var air = $(".cinema__air", house);
    for (var i = 0; i < 22; i++) {
      var mote = document.createElement("i");
      var duration = 17 + (i * 7 % 13);
      mote.className = "cinema__mote";
      mote.style.setProperty("--x", (12 + i * 37 % 76) + "%");
      mote.style.setProperty("--y", (15 + i * 23 % 75) + "%");
      mote.style.setProperty("--size", (i % 4 === 0 ? 1.6 : 1.1) + "px");
      mote.style.setProperty("--strength", ((0.08 + (i % 4) * 0.027) * (i < 16 ? 1 : 0.78)).toFixed(3));
      mote.style.setProperty("--time", duration + "s");
      mote.style.setProperty("--phase", -(i * 5.7 % duration) + "s");
      mote.style.setProperty("--dx", (8 + i * 9 % 17) + "px");
      mote.style.setProperty("--dy", -(10 + i * 7 % 16) + "px");
      air.appendChild(mote);
    }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        cinema.classList.toggle("cinema__offscreen", !entries[0].isIntersecting);
      }).observe(cinema);
    }

    reels.innerHTML = cities.map(function (city, index) {
      return '<button type="button" class="cinema__reel" data-city="' + index + '">' +
        '<img src="assets/img/cities/thumb-' + number(index) + '.webp" loading="lazy" alt="">' +
        '<span>' + esc(city[0]) + '</span></button>';
    }).join("");
    var choices = $$("[data-city]", reels);

    function caption(index) {
      var name = cities[index][0];
      $("#cityName", cinema).textContent = name;
      $("#cityCount", cinema).textContent = number(index) + " / " + cities.length;
      announcement.textContent = name + ", city " + (index + 1) + " of " + cities.length;
      choices.forEach(function (choice, n) { choice.setAttribute("aria-current", String(n === index)); });
      // Sampling at asset preparation also gives direct file previews the same light.
      house.style.setProperty("--spill", cities[index][2] || "145,137,120");
    }

    // Keep the previous frame fully lit until its replacement has decoded.
    // Rapid taps coalesce to the newest request, including while a dissolve runs.
    function project() {
      if (busy || wanted === current) return;
      busy = true;
      var target = wanted;
      imageFor(target).then(function (incoming) {
        if (target !== wanted) return;
        slide.appendChild(incoming);
        current = target;
        caption(current);
        if (motionPreference.matches || !incoming.animate) {
          slide.replaceChildren(incoming);
          return;
        }
        fade = incoming.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 900, easing: "cubic-bezier(.36,0,.25,1)"
        });
        return fade.finished.then(function () { slide.replaceChildren(incoming); });
      }).catch(function () {
        if (wanted === target) {
          wanted = current;
          announcement.textContent = "This city could not be projected. Choose another city.";
        }
      }).finally(function () {
        fade = null;
        busy = false;
        project();
      });
    }
    function select(index) {
      wanted = (index + cities.length) % cities.length;
      project();
    }
    motionPreference.addEventListener("change", function (event) {
      if (event.matches && fade) fade.finish();
    });

    function toggleFront() {
      var closer = cinema.classList.toggle("cinema__front");
      front.setAttribute("aria-pressed", String(closer));
      front.title = closer ? "Return to your seat (F)" : "Front row (F)";
      screen.title = closer ? "Return to your seat" : "Take the front row";
      screen.setAttribute("aria-label", screen.title);
      $("path", front).setAttribute("d", closer ? "M3 8h5V3m8 0v5h5m0 8h-5v5m-8 0v-5H3" : "M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6");
    }
    $("#cityPrev", cinema).addEventListener("click", function () { select(wanted - 1); });
    $("#cityNext", cinema).addEventListener("click", function () { select(wanted + 1); });
    front.addEventListener("click", toggleFront);
    picker.addEventListener("click", function () { drawer.showModal(); choices[current].focus(); });
    $(".cinema__close", drawer).addEventListener("click", function () { drawer.close(); });
    drawer.addEventListener("click", function (event) {
      if (event.target !== drawer) return;
      var rect = drawer.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right ||
          event.clientY < rect.top || event.clientY > rect.bottom) drawer.close();
    });
    reels.addEventListener("click", function (event) {
      var choice = event.target.closest("[data-city]");
      if (choice) { drawer.close(); select(Number(choice.dataset.city)); }
    });

    // Page shortcuts belong to the cinema only while it is being viewed.
    document.addEventListener("keydown", function (event) {
      if (drawer.open || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      var key = event.key.toLowerCase();
      if (["arrowright", "arrowleft", "f", "escape"].indexOf(key) === -1) return;
      var focus = document.activeElement;
      if (!cinema.contains(focus) && focus !== document.body && !focus.matches('a[href="#cities"]')) return;
      var rect = cinema.getBoundingClientRect();
      if (rect.top > innerHeight / 2 || rect.bottom < innerHeight / 2) return;
      if (key === "arrowright" || key === "arrowleft") {
        event.preventDefault();
        select(wanted + (key === "arrowright" ? 1 : -1));
      } else if ((key === "f" && !event.repeat) || (key === "escape" && cinema.classList.contains("cinema__front"))) {
        toggleFront();
      }
    });

    screen.addEventListener("pointerdown", function (event) {
      if (!event.isPrimary) return;
      touch = { x: event.clientX, y: event.clientY, id: event.pointerId };
      wasSwipe = false;
      screen.setPointerCapture(event.pointerId);
    });
    screen.addEventListener("pointercancel", function () { touch = null; });
    screen.addEventListener("pointerup", function (event) {
      if (!touch || touch.id !== event.pointerId) return;
      var dx = event.clientX - touch.x, dy = event.clientY - touch.y;
      touch = null;
      wasSwipe = Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy) * 1.3;
      if (wasSwipe) select(wanted + (dx < 0 ? 1 : -1));
    });
    screen.addEventListener("click", function (event) {
      if (wasSwipe && event.detail) { wasSwipe = false; return; }
      toggleFront();
    });
    var first = $("img", slide);
    first.src = cityURL(current);
    first.alt = alt(current);
    caption(current);
  })();

  /* ============================================================
     5. Stored data
     ============================================================ */
  var state = {
    roster: [],
    rosterPeriod: "30",
    asOf: Date.now(),
    rosterSort: "rating",
    rosterSortDirection: "desc",
    clanView: { ladder: CLAN.ladders[0].id, period: "30", tab: "duos", sort: "volume", showAll: false, page: 0 },
    pair: null,
    feedError: false,
    feed: [],            // one row per clan-member appearance
    games: [],           // one row per match, with the members in it
    periodCache: new Map(),    // date windows prepared from the complete feed
    rosterLadder: CLAN.ladders[0].id,
    openPlayer: null,
    profileLadder: null,
    profilePeriod: null,
    detailCache: new Map(),
    detailFailed: new Set(),   // profiles whose detail request came back empty
    profileCards: new Map(),   // profileId -> { avatar, platform, games, drops }
    countryTotals: new Map(),  // "rm_team|cz" -> 875
    openMatch: null,
    feedLoading: false,
    feedReady: false,
    feedHistoryComplete: true
  };

  var LADDER_LABEL = Object.create(null);
  CLAN.ladders.forEach(function (l) { LADDER_LABEL[l.id] = l.label; });
  var otherModeLabels = { qp_rm_team: "Team Quick Play", qp_rm_1v1: "1v1 Quick Play", ew_1v1: "1v1 Empire Wars" };

  function registerModes(boards) {
    Object.keys(boards).forEach(function (id) {
      if (!LADDER_LABEL[id] && (boards[id].games > 0 || boards[id].rating != null)) {
        LADDER_LABEL[id] = otherModeLabels[id] || boards[id].label || ladderName(id);
      }
    });
  }

  /* Snapshot dates reflect the daily server refresh. */
  function sourceLabel() {
    var meta = AOE.snapshotNow();
    return meta && meta.updatedAt ? "Updated " + shortDate(meta.updatedAt) : "Stored data unavailable";
  }

  function statusOK(el, text) {
    el.innerHTML = '<span class="dot dot--live"></span> ' + esc(text);
  }
  function statusFail(el, text) {
    el.innerHTML = '<span class="dot dot--error"></span> ' + esc(text);
  }

  /* ---------- ladder switch ---------- */
  var switchEl = $("#ladderSwitch");
  function modeButtons(attr, selected) {
    return Object.keys(LADDER_LABEL).map(function (id) {
      return '<button type="button" ' + attr + '="' + esc(id) + '" aria-pressed="' +
        (id === selected) + '">' + esc(LADDER_LABEL[id]) + '</button>';
    }).join("");
  }
  function syncModes(group, attr, selected) {
    if (group.children.length !== Object.keys(LADDER_LABEL).length) {
      var focus = document.activeElement;
      var value = focus && group.contains(focus) && focus.getAttribute(attr);
      group.innerHTML = modeButtons(attr, selected);
      if (value) group.querySelector("[" + attr + '="' + value + '"]').focus({ preventScroll: true });
    } else Array.from(group.children).forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.getAttribute(attr) === selected));
    });
  }
  syncModes(switchEl, "data-ladder", state.rosterLadder);
  switchEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-ladder]");
    if (!b) return;
    setRosterScope(b.dataset.ladder, state.rosterPeriod);
  });

  /* All date windows are prepared when the saved history arrives. Selecting
     a period only renders that window; it never starts another data request. */
  var PERIODS = [{ key: "30", label: "30 days" }, { key: "90", label: "90 days" },
    { key: "365", label: "Year" }, { key: "all", label: "All" }];

  function shortDate(date) {
    return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function periodStart(period) { return period === "all" ? 0 : state.asOf - Number(period) * 86400000; }
  function inPeriod(row, start) {
    var date = Date.parse(row.date);
    return isFinite(date) && date >= start && date <= state.asOf;
  }
  function preparePeriods() {
    state.periodCache.clear();
    PERIODS.forEach(function (period) {
      var start = periodStart(period.key);
      state.periodCache.set(period.key, {
        rows: state.feed.filter(function (row) { return inPeriod(row, start); }),
        games: state.games.filter(function (game) { return inPeriod(game, start); })
      });
    });
  }
  function periodData(period) {
    return state.periodCache.get(period || state.rosterPeriod) || { rows: [], games: [] };
  }
  function renderPeriod(section) {
    var group = $("#" + section + " [data-period-controls]");
    var period = section === "roster" ? state.rosterPeriod : ledgerView().period;
    var earliest = state.games.length ? state.games[state.games.length - 1].date : null;
    var status = state.feedError ? "Match history unavailable" : !state.feedReady ? "Loading matches…" : !state.feedHistoryComplete ? "History incomplete" : "";
    if (!group.children.length) group.innerHTML = PERIODS.map(function (p) {
      return '<button type="button" data-period="' + p.key + '" aria-pressed="' + (p.key === period) + '">' + p.label + '</button>';
    }).join("");
    Array.from(group.children).forEach(function (button) { button.setAttribute("aria-pressed", String(button.dataset.period === period)); });
    group.setAttribute("aria-busy", String(state.feedLoading));
    var start = periodStart(period) || earliest;
    var dates = start ? shortDate(start) + " – " + shortDate(state.asOf) : "";
    $("#" + section + "Coverage").textContent = [dates, status].filter(Boolean).join(" · ");
  }
  $$("[data-period-controls]").forEach(function (group) {
    group.addEventListener("click", function (e) {
      var button = e.target.closest("[data-period]");
      if (!button) return;
      if (group.dataset.periodControls === "ledger") setLedgerScope(ledgerView().ladder, button.dataset.period);
      else setRosterScope(state.rosterLadder, button.dataset.period);
    });
  });

  function setRosterScope(ladder, period) {
    if (ladder === state.rosterLadder && period === state.rosterPeriod) return;
    var modeChanged = ladder !== state.rosterLadder;
    state.rosterLadder = ladder;
    state.rosterPeriod = period;
    if (modeChanged) syncModes(switchEl, "data-ladder", ladder);
    renderRoster(true);
    if (modeChanged) loadCountryTotals(ladder);
  }
  renderPeriod("roster");
  renderPeriod("ledger");

  function activityFor(player, ladder, period) {
    ladder = ladder || state.rosterLadder;
    var rows = periodData(period).rows.filter(function (m) { return m.profileId === player.profileId && m.ladder === ladder; });
    var decided = rows.filter(function (m) { return !m.vsAI && m.won != null; });
    var wins = decided.filter(function (m) { return m.won; }).length;
    var rated = decided.filter(function (m) { return m.ratingDiff != null && isFinite(m.ratingDiff); });
    var stats = player.ladders[ladder];
    return {
      rows: rows, decided: decided, rated: rated, wins: wins, losses: decided.length - wins,
      winRate: decided.length ? wins / decided.length * 100 : null,
      form: decided.slice(0, 5).map(function (m) { return m.won ? "W" : "L"; }),
      change: rated.length ? rated.reduce(function (sum, m) { return sum + Number(m.ratingDiff); }, 0) : null,
      last: stats && stats.lastMatch || (rows[0] && rows[0].date)
    };
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

  var ROSTER_SORTS = {
    name: { label: "Player", direction: "asc" },
    country: { label: "Country", direction: "asc" },
    rating: { label: "Current Elo", direction: "desc" },
    change: { label: "Elo change", direction: "desc" },
    matches: { label: "Matches", direction: "desc" },
    winRate: { label: "Period win rate", direction: "desc" }
  };

  function rosterSortValue(player, activity) {
    var stats = player.ladders[state.rosterLadder] || {};
    if (state.rosterSort === "name") return player.name;
    if (state.rosterSort === "country") return player.country ? player.country.toUpperCase() : null;
    if (state.rosterSort === "rating") return stats.rating;
    if (state.rosterSort === "matches") return activity.rows.length;
    if (state.rosterSort === "winRate") return activity.winRate;
    return activity.change;
  }

  function rosterSortOrder(key, direction) {
    if (key === "name" || key === "country") return direction === "asc" ? "A to Z" : "Z to A";
    return direction === "desc" ? "highest first" : "lowest first";
  }

  function rosterSortHeading(key, label) {
    var sort = ROSTER_SORTS[key];
    var active = state.rosterSort === key;
    var next = active ? (state.rosterSortDirection === "desc" ? "asc" : "desc") : sort.direction;
    var description = (active ? sort.label + ", " + rosterSortOrder(key, state.rosterSortDirection) + ". " : "") +
      "Sort by " + sort.label + ", " + rosterSortOrder(key, next);
    return '<button type="button" class="lineup-sort" data-roster-sort="' + key + '" aria-pressed="' + active +
      '" aria-label="' + esc(description) + '" title="' + esc(description) + '">' +
      esc(label || sort.label) + (active ? '<span class="lineup-sort__arrow" aria-hidden="true">' +
        (state.rosterSortDirection === "desc" ? "↓" : "↑") + '</span>' : '') + '</button>';
  }

  function sortedRoster(activityById) {
    var ladder = state.rosterLadder;
    return state.roster.slice().sort(function (a, b) {
      var av = rosterSortValue(a, activityById.get(a.profileId)), bv = rosterSortValue(b, activityById.get(b.profileId));
      // Missing values stay at the bottom in either direction; ties keep a stable rating/name order.
      var aMissing = av == null || (typeof av === "number" && !isFinite(av));
      var bMissing = bv == null || (typeof bv === "number" && !isFinite(bv));
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      if (!aMissing && av !== bv) {
        var compared = typeof av === "string" ? av.localeCompare(bv) : av - bv;
        if (compared) return state.rosterSortDirection === "asc" ? compared : -compared;
      }
      var ra = a.ladders[ladder] && a.ladders[ladder].rating;
      var rb = b.ladders[ladder] && b.ladders[ladder].rating;
      if (ra == null && rb == null) return a.name.localeCompare(b.name);
      if (ra == null) return 1;
      if (rb == null) return -1;
      return rb - ra || a.name.localeCompare(b.name);
    });
  }

  function flag(country) {
    if (!country) return "";
    var code = country.toLowerCase();
    var url = /^(sk|cz|mx)$/.test(code) ? "assets/img/flag-" + code + ".png" : "https://flagcdn.com/40x30/" + encodeURIComponent(code) + ".png";
    return '<img src="' + esc(url) + '" ' +
           'width="20" height="15" loading="lazy" alt="">';
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

  /* ---------- roster table ---------- */

  /* Saved portraits can expire. Keep initials under each image so an absent
     portrait and a failed request both preserve the player's identity. */
  var failedAvatars = new Set();
  function avatarHTML(player, size) {
    var card = state.profileCards.get(player.profileId);
    var url = card && card.avatar;
    var cls = "avatar avatar--portrait avatar--blank" + (size === "lg" ? " avatar--lg" : "");
    var px = size === "lg" ? 76 : 34;
    var words = String(player.name || "").replace(/^gg[_ -]+/i, "").split(/[\s_.!-]+/).filter(Boolean);
    var first = Array.from(words[0] || "?");
    var initials = words.length > 1 ? first[0] + Array.from(words[words.length - 1])[0] : first.slice(0, 2).join("");
    var image = url && !failedAvatars.has(url) ? '<img data-avatar src="' + esc(url) + '" width="' + px + '" height="' + px +
      '" loading="lazy" alt="">' : "";
    return '<span class="' + cls + '" aria-hidden="true">' + esc(initials.toUpperCase()) + image + '</span>';
  }
  document.addEventListener("error", function (event) {
    var image = event.target;
    if (image.tagName !== "IMG" || !image.hasAttribute("data-avatar")) return;
    failedAvatars.add(image.getAttribute("src"));
    image.remove();
  }, true);

  function lineupHeading(key, label, cls) {
    var active = state.rosterSort === key || (key === "name" && state.rosterSort === "country");
    var direction = state.rosterSortDirection === "desc" ? "descending" : "ascending";
    var content = rosterSortHeading(key, label);
    if (key === "name") content += '<span class="lineup-country-sort"><span aria-hidden="true"> / </span>' + rosterSortHeading("country") + '</span>';
    return '<th scope="col" class="' + cls + '"' + (active ? ' aria-sort="' + direction + '"' : '') + '>' + content + '</th>';
  }

  function lineupForm(results) {
    if (!results.length) return '<span class="lineup-null">—</span>';
    var label = "Last " + results.length + ", newest first: " + results.join(", ");
    return '<span class="lineup-form" role="img" aria-label="' + label + '" title="' + label + '">' +
      results.map(function (r) { return '<span aria-hidden="true" class="' + (r === "W" ? "win" : "loss") + '">' + r + '</span>'; }).join("") + '</span>';
  }

  function lineupRow(player, activity) {
    var stats = player.ladders[state.rosterLadder] || {};
    var open = state.openPlayer === player.profileId;
    var id = esc(player.profileId);
    var country = player.country ? '<span class="lineup-country">' + esc(player.country.toUpperCase()) + '</span>' : "";
    var last = activity.last ? "Last played " + shortDate(activity.last) : "";
    var change = valueHTML(activity.change, "signed");
    var matches = valueHTML(state.feedReady ? activity.rows.length : null);
    var form = lineupForm(activity.form);
    var record = activity.winRate != null ? '<span class="lineup-record">' + valueHTML(activity.wins) + '<i>–</i><wbr>' +
      valueHTML(activity.losses) + '</span>' : '<span class="lineup-null">—</span>';
    var shortRate = activity.winRate != null ? '<small class="lineup-rate">' + valueHTML(activity.winRate, "percent") + '</small>' : "";
    return '<tr class="lineup-row" data-lineup-row="' + id + '">' +
        '<th scope="row" class="lineup-person"><button type="button" class="lineup-disclosure" data-player="' + id + '" aria-expanded="' + open + '"' +
          (open ? ' aria-controls="profile-' + id + '"' : "") + ' aria-label="' + esc((open ? "Close " : "Open ") + player.name + " profile") + '">' +
          avatarHTML(player) + '<span class="lineup-ident"><span class="lineup-name">' + esc(player.name) + country + '</span>' +
          (last ? '<span class="lineup-last">' + esc(last) + '</span>' : "") +
          (activity.form.length ? '<span class="lineup-mobile-form">' + form + '</span>' : "") + '</span></button></th>' +
        '<td class="lineup-elo"><strong>' + valueHTML(stats.rating) + '</strong>' +
          (activity.change == null ? "" : '<span class="lineup-mobile-change"><span class="sr-only">Recorded Elo change: </span>' + change + '<span aria-hidden="true"> Δ</span></span>') + '</td>' +
        '<td class="lineup-change" title="Sum of recorded Elo changes in this period">' + change + sparkline(activity.rated) + '</td>' +
        '<td class="lineup-matches">' + matches + '</td>' +
        '<td class="lineup-result">' + record + shortRate + (state.feedReady ? '<span class="lineup-mobile-count">' + matches + (activity.rows.length === 1 ? " match" : " matches") + '</span>' : '') + '</td>' +
        '<td class="lineup-form-cell">' + form + '</td>' +
        '<td class="lineup-chevron"><svg aria-hidden="true"><use href="#i-chevron"></use></svg></td></tr>';
  }

  function renderRoster(animate) {
    renderPeriod("roster");
    var table = $("#rosterTable");
    if (!state.roster.length) {
      $("#rosterCount").textContent = "";
      table.innerHTML = '<div class="state">No roster members found.</div>';
      return;
    }
    statusOK($("#rosterStatus"), sourceLabel());
    // Reuse each player's period record in the sort, the header count and the row.
    var activities = new Map();
    var activeCount = 0;
    state.roster.forEach(function (player) {
      var activity = activityFor(player);
      activities.set(player.profileId, activity);
      if (activity.rows.length) activeCount++;
    });
    var players = sortedRoster(activities);
    $("#rosterCount").textContent = players.length + (players.length === 1 ? " member" : " members") +
      (state.feedReady ? " · " + activeCount + " played this period" : "");
    var select = $("#rosterSortSelect");
    if (!select.options.length) {
      select.innerHTML = Object.keys(ROSTER_SORTS).map(function (key) {
        return ["desc", "asc"].map(function (direction) {
          var order = direction === "asc" ? " ↑" : " ↓";
          var label = key === "winRate" ? "Win rate" : key === "rating" ? "Elo" : ROSTER_SORTS[key].label;
          return '<option value="' + key + '|' + direction + '" aria-label="' + esc(ROSTER_SORTS[key].label + ", " + rosterSortOrder(key, direction)) + '">' + esc(label + order) + '</option>';
        }).join("");
      }).join("");
      select.parentElement.hidden = false;
    }
    select.value = state.rosterSort + "|" + state.rosterSortDirection;
    var heading = '<tr>' + lineupHeading("name", "Player", "lineup-player-head") + lineupHeading("rating", "Elo", "lineup-elo") +
      lineupHeading("change", "Elo change", "lineup-change") + lineupHeading("matches", "Matches", "lineup-matches") +
      lineupHeading("winRate", "W–L", "lineup-result") + '<th scope="col" class="lineup-form-cell">Last 5</th><th scope="col" class="lineup-chevron"><span class="sr-only">Profile</span></th></tr>';
    var grid = table.querySelector(".lineup-table");
    if (!grid) {
      table.innerHTML = '<table class="lineup-table"><caption class="sr-only">Roster. Elo is current. Matches and results cover the selected period. Records count decided games against human players.</caption>' +
        '<colgroup><col class="lineup-col-person"><col class="lineup-col-elo"><col class="lineup-col-change"><col class="lineup-col-matches"><col class="lineup-col-record"><col class="lineup-col-form"><col class="lineup-col-chevron"></colgroup><thead>' +
        heading + '</thead>' + players.map(function (p) { return '<tbody class="player">' + lineupRow(p, activities.get(p.profileId)) + '</tbody>'; }).join("") + '</table>';
      return;
    }
    var from = animate ? panelHeight(table) : null;
    var positions = new Map(), changedRows = new Set();
    if (animate && !motionPreference.matches && table.animate) {
      Array.from(grid.tBodies).forEach(function (body) {
        var row = body.rows[0];
        positions.set(row, row.getBoundingClientRect().top);
      });
      positions.forEach(function (_, row) { cancelPanelAnimation(row); });
    }
    var headers = grid.querySelector("thead");
    if (headers.renderedHeading !== heading) {
      headers.innerHTML = heading;
      headers.renderedHeading = heading;
    }
    var bodies = new Map(Array.from(grid.tBodies, function (body) {
      return [Number(body.rows[0].dataset.lineupRow), body];
    }));
    players.forEach(function (player, index) {
      var body = bodies.get(player.profileId) || grid.createTBody();
      var markup = lineupRow(player, activities.get(player.profileId));
      if (body.rowMarkup !== markup) {
        var temp = document.createElement("tbody");
        temp.innerHTML = markup;
        var next = temp.rows[0];
        var current = body.rows[0];
        if (!current) {
          body.classList.add("player");
          body.appendChild(next);
        } else {
          changedRows.add(current);
          // Keep the disclosure, its focus and the loaded portrait in place.
          [".avatar", ".lineup-ident"].forEach(function (selector) {
            var oldPart = current.querySelector(selector), newPart = next.querySelector(selector);
            if (!oldPart.isEqualNode(newPart)) oldPart.replaceWith(newPart);
          });
          for (var i = 1; i < current.cells.length; i++) {
            if (!current.cells[i].isEqualNode(next.cells[i])) current.cells[i].replaceWith(next.cells[i].cloneNode(true));
          }
        }
        body.rowMarkup = markup;
      }
      if (grid.tBodies[index] !== body) grid.insertBefore(body, grid.tBodies[index] || null);
    });
    if (animate) transitionPanel(table, from, null, false);
    positions.forEach(function (top, row) {
      var distance = top - row.getBoundingClientRect().top;
      if (!changedRows.has(row) && Math.abs(distance) < 1) return;
      var start = { opacity: .65 }, end = { opacity: 1 };
      // Move the keyed rows through small reorders. Crossing an open dossier
      // can span several screens, so keep that update local to each row.
      if (Math.abs(distance) >= 1 && Math.abs(distance) <= window.innerHeight && state.openPlayer == null) {
        start.transform = "translateY(" + distance + "px)";
        end.transform = "translateY(0)";
      }
      playPanelAnimation(row, start, end);
    });
  }

  function sortRoster(key, direction) {
    state.rosterSort = key;
    state.rosterSortDirection = direction;
    renderRoster(true);
    $("#rosterSortStatus").textContent = "Sorted by " + ROSTER_SORTS[key].label + ", " + rosterSortOrder(key, direction) + ".";
  }

  $("#rosterSortSelect").addEventListener("change", function (e) {
    var sort = e.target.value.split("|");
    sortRoster(sort[0], sort[1]);
  });

  $("#rosterTable").addEventListener("click", function (e) {
    var sort = e.target.closest("[data-roster-sort]");
    if (sort) {
      var key = sort.dataset.rosterSort;
      var restoreFocus = e.detail === 0 || document.activeElement === sort;
      sortRoster(key, state.rosterSort === key
        ? (state.rosterSortDirection === "desc" ? "asc" : "desc") : ROSTER_SORTS[key].direction);
      // Rendering replaces the headings, so preserve the keyboard user's position.
      if (restoreFocus) $('#rosterTable [data-roster-sort="' + key + '"]').focus({ preventScroll: true });
      return;
    }
    var row = e.target.closest("[data-lineup-row]");
    if (!row) return;
    var id = Number(row.dataset.lineupRow);
    var previous = state.openPlayer;
    if (previous != null) {
      var oldRow = $('#rosterTable [data-lineup-row="' + previous + '"]');
      if (previous !== id) anchorCollapse(row.querySelector("[data-player]"), oldRow.parentElement.querySelector(".player__detail"));
      state.openPlayer = null;
      profileCounters.finish();
      togglePlayerPanel(oldRow, false);
    }
    if (previous !== id) {
      state.openPlayer = id;
      state.profileLadder = state.rosterLadder;
      state.profilePeriod = state.rosterPeriod;
      togglePlayerPanel(row, true);
      loadDossier(id);
      loadCountryTotals(state.profileLadder);
    }
    if (e.detail === 0) row.querySelector("[data-player]").focus({ preventScroll: true });
  });

  function togglePlayerPanel(row, opening) {
    var body = row.parentElement;
    var player = state.roster.find(function (p) { return p.profileId === Number(row.dataset.lineupRow); });
    var button = row.querySelector("[data-player]");
    var panel = body.querySelector(".player__detail");
    body.classList.toggle("player--open", opening);
    button.setAttribute("aria-expanded", String(opening));
    button.setAttribute("aria-label", (opening ? "Close " : "Open ") + player.name + " profile");
    if (opening) button.setAttribute("aria-controls", "profile-" + player.profileId);
    else button.removeAttribute("aria-controls");
    var height = panel ? panelHeight(panel) : 0;
    if (opening && !panel) {
      row.insertAdjacentHTML("afterend", '<tr><td class="lineup-detail-cell" colspan="7"><div class="player__detail" id="profile-' +
        player.profileId + '"></div></td></tr>');
      panel = body.querySelector(".player__detail");
    }
    if (!panel) return;
    if (opening) {
      panel.innerHTML = dossierHTML(player);
      bindChart();
    }
    panel.inert = !opening;
    transitionPanel(panel, height, opening ? null : 0, false, opening ? null : function () { panel.closest("tr").remove(); });
  }

  /* The per-player profile is fetched on expand rather than on load: it
     carries that player's entire rating history, which for a five-thousand
     game account is 386 KB on its own. Nine of those on load would be
     megabytes spent on a panel nobody may open. */
  function loadDossier(profileId) {
    if (state.detailCache.has(profileId)) return;
    state.detailFailed.delete(profileId);

    AOE.fetchPlayerDetail(profileId).then(function (detail) {
      state.detailCache.set(profileId, detail);
      registerModes(detail.boards || {});
      syncModes(switchEl, "data-ladder", state.rosterLadder);
      renderLedgerTabs();
      if (state.openPlayer !== profileId) return;   // a newer pick won
      paintDossier(true);
    }).catch(function () {
      state.detailFailed.add(profileId);
      if (state.openPlayer !== profileId) return;
      paintDossier();
    });
  }

  $("#rosterTable").addEventListener("click", function (e) {
    if (e.target.closest("[data-profile-retry]")) {
      loadDossier(state.openPlayer);
      paintDossier();
      return;
    }
    var control = e.target.closest("[data-profile-ladder], [data-profile-period]");
    if (!control) return;
    var ladder = control.dataset.profileLadder || state.profileLadder;
    var period = control.dataset.profilePeriod || state.profilePeriod;
    if (ladder === state.profileLadder && period === state.profilePeriod) return;
    var previous = profileCounters.capture();
    var modeChanged = ladder !== state.profileLadder;
    state.profileLadder = ladder;
    state.profilePeriod = period;
    paintDossier();
    profileCounters.animate(previous);
    if (modeChanged) loadCountryTotals(ladder);
  });

  $("#rosterTable").addEventListener("keydown", function (e) {
    var control = e.target.closest("[data-profile-ladder], [data-profile-period]");
    if (!control) return;
    var buttons = Array.from(control.parentElement.querySelectorAll("button"));
    var index = buttons.indexOf(control);
    if (e.key === "ArrowRight") index = (index + 1) % buttons.length;
    else if (e.key === "ArrowLeft") index = (index - 1 + buttons.length) % buttons.length;
    else if (e.key === "Home") index = 0;
    else if (e.key === "End") index = buttons.length - 1;
    else return;
    e.preventDefault();
    buttons[index].focus({ preventScroll: true });
    buttons[index].click();
  });
  /* Controls and identity remain mounted while a selection changes. */
  function paintDossier(updateIdentity) {
    if (!state.openPlayer) return;
    var host = $("#rosterTable .player--open .player__detail");
    if (!host) return;
    var player = state.roster.find(function (p) { return p.profileId === state.openPlayer; });
    if (!player) return;
    // History and filter changes can arrive mid-disclosure. Measure the
    // full profile and its sections so both can continue from the visible frame.
    var opening = panelAnimations.has(host);
    var content = $(".pf-mode-content", host);
    var motion = !motionPreference.matches && host.animate;
    var height = motion ? panelHeight(host) : null;
    var sections = ".pf-period-lead, .pf-chart, .pf-side, .pf-tables > section";
    if (updateIdentity) sections += ", .pf-identity, .pf-scope";
    var oldParts = motion ? $$(sections, host) : [];
    var heights = oldParts.map(function (part) { return part.getBoundingClientRect().height; });
    oldParts.forEach(cancelPanelAnimation);
    var focus = document.activeElement;
    var restore = "";
    if (focus && host.contains(focus) && focus.closest(".pf-chart")) restore = ".chart-wrap";
    var detail = state.detailCache.get(player.profileId);
    if (updateIdentity) {
      if (focus && focus.closest(".pf-links")) restore = '.pf-links a:nth-child(' + (Array.from(focus.parentElement.children).indexOf(focus) + 1) + ')';
      host.querySelector(".pf-identity").outerHTML = nameplateHTML(player, detail);
    }
    syncModes(host.querySelector(".pf-modes"), "data-profile-ladder", state.profileLadder);
    $$("[data-profile-period]", host).forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.profilePeriod === state.profilePeriod));
    });
    var previous = profileCounters.active() ? profileCounters.capture() : null;
    content.innerHTML = profileContent(player, detail);
    if (motion) {
      var parts = $$(sections, host);
      var targetHeight = host.getBoundingClientRect().height;
      if (parts.length === heights.length) {
        // Measure both grid columns before animating either. On phones the
        // same regions stack, so each table and the chart folds independently.
        var targets = parts.map(function (part) { return part.getBoundingClientRect().height; });
        parts.forEach(function (part, index) { transitionPanel(part, heights[index], targets[index], true); });
      }
      if (opening || parts.length !== heights.length) transitionPanel(host, height, targetHeight, false);
    }
    if (previous) profileCounters.animate(previous);
    bindChart();
    var next = restore && (host.querySelector(restore) || host.querySelector(".pf-chart h4"));
    if (next) next.focus({ preventScroll: true });
  }

  function dossierHTML(player) {
    var detail = state.detailCache.get(player.profileId);
    return '<div class="player-profile">' + nameplateHTML(player, detail) + profileScopeHTML() +
      '<div class="pf-mode-content">' + profileContent(player, detail) + '</div></div>';
  }

  function profileContent(player, detail) {
    var activity = activityFor(player, state.profileLadder, state.profilePeriod);
    var key = "profile-" + player.profileId + "-";
    return periodLeadHTML(key, activity, player, detail) +
        '<div class="pf-ladder-grid">' + chartPanelHTML(player.profileId, detail) +
          '<div class="pf-side">' + periodPerformanceHTML(activity) + '</div></div>' +
        topsHTML(activity);
  }

  function nameplateHTML(player, detail) {
    var note = noteFor(player);
    var card = state.profileCards.get(player.profileId) || {};
    var place = detail && detail.countryName || (player.country || "").toUpperCase();
    var platform = detail && detail.platform || card.platform;
    var facts = [];
    if (place) facts.push('<span>' + (player.country ? flag(player.country) : "") + esc(place) + '</span>');
    if (platform) facts.push('<span>' + esc(platform) + '</span>');
    var links = (CLAN.profileLinks || []).map(function (link) {
      return '<a href="' + esc(link.url.replace("{id}", player.profileId)) +
        '" target="_blank" rel="noopener noreferrer">' + esc(link.label) + ' <span aria-hidden="true">↗</span></a>';
    });
    var linked = (detail && detail.linked || []).map(function (alt) { return esc(alt.name); });
    return '<header class="pf-identity">' + avatarHTML(player, "lg") +
      '<div class="pf-player"><h3>' + esc(player.name) + '</h3>' +
        (facts.length ? '<p class="pf-identity-facts">' + facts.join("") + '</p>' : '') +
        (note.role || note.specialty ? '<p class="pf-note">' + [note.role, note.specialty].filter(Boolean).map(esc).join(' · ') + '</p>' : '') +
        (note.bio ? '<p class="pf-note">' + esc(note.bio) + '</p>' : '') +
        (linked.length ? '<p class="pf-note">Linked accounts · ' + linked.join(' · ') + '</p>' : '') +
      '</div>' + (links.length ? '<nav class="pf-links" aria-label="External player profiles">' + links.join("") + '</nav>' : '') +
    '</header>';
  }

  function profileScopeHTML() {
    return '<div class="pf-scope"><div class="pf-modes" role="group" aria-label="Player game mode">' +
      modeButtons("data-profile-ladder", state.profileLadder) +
      '</div><div class="pf-period-picker" role="group" aria-label="Player date range">' +
      PERIODS.map(function (p) {
        return '<button type="button" data-profile-period="' + p.key + '" aria-pressed="' +
          (p.key === state.profilePeriod) + '">' + p.label + '</button>';
      }).join("") + '</div></div>';
  }

  function periodLeadHTML(key, activity, player, detail) {
    var ladder = state.profileLadder;
    var stats = player.ladders[ladder] || {};
    var board = detail && detail.boards && detail.boards[ladder] || {};
    var ready = state.feedReady;
    function metric(label, id, value, format, note) {
      return '<div><dt>' + label + '</dt><dd>' + countHTML(key + id, value, format) + '</dd>' +
        (note ? '<dd class="pf-metric-note">' + esc(note) + '</dd>' : '') + '</div>';
    }
    function standing(field) {
      return stats[field] != null ? stats[field] : board[field];
    }
    var wins = standing("wins"), losses = standing("losses");
    var careerRecord = wins != null && losses != null ?
      countFormat.format(wins) + 'W · ' + countFormat.format(losses) + 'L' : '';
    var country = (player.country || "").toLowerCase();
    var national = standing("rankCountry");
    var world = board.rank != null ? board.rank : stats.rank;
    var countryName = detail && detail.countryName || country.toUpperCase() || 'National';
    function rank(label, icon, place, total, nationalRank) {
      return '<div><dt>' + icon + esc(label) + '</dt><dd>' + (place > 0 ? '#' + valueHTML(place) : '—') +
        '</dd><dd class="pf-metric-note"' + (nationalRank ? ' data-national-total' : '') + '>' +
        (place > 0 && total ? 'of ' + valueHTML(total) : '') + '</dd></div>';
    }
    var globe = '<span class="pf-world-flag" aria-hidden="true"><svg><use href="#i-globe"></use></svg></span>';
    return '<section class="pf-period-lead" aria-label="Player statistics"><dl class="pf-key-values" aria-label="Selected range">' +
      metric("Matches", "matches", ready ? activity.rows.length : null) +
      metric("Win rate", "percentage", ready ? activity.winRate : null, "percent") +
      metric("Elo change", "change", ready ? activity.change : null, "signed") + '</dl>' +
      '<dl class="pf-key-values pf-career-values" aria-label="Career on this ladder">' +
      metric("Current Elo", "elo", standing("rating")) +
      metric("Peak Elo", "peak", standing("peak")) +
      metric("Career win rate", "career-rate", standing("winRate"), "percent", careerRecord) + '</dl>' +
      '<dl class="pf-rank-values" aria-label="Ladder rankings">' +
      rank(countryName + ' rank', flag(country), national, state.countryTotals.get(ladder + "|" + country), true) +
      rank('World rank', globe, world, board.total != null ? board.total : stats.total, false) + '</dl></section>';
  }

  function periodPerformanceHTML(activity) {
    if (!state.feedReady) return '<section class="pf-period"><h4>Match record</h4><p class="pf-empty">' +
      (state.feedError ? 'Period results unavailable.' : 'Loading match results…') + '</p></section>';
    var lengths = AOE.durationStats(activity.decided);
    var recent = activity.decided.slice(0, 5).map(function (match) {
      return '<li><b class="' + (match.won ? 'pf-win' : 'pf-loss') + '" aria-label="' + (match.won ? 'Win' : 'Loss') + '">' +
        (match.won ? 'W' : 'L') + '</b><span>' + esc(match.map || 'Unknown map') +
        '<small>' + esc(shortDate(match.date)) + '</small></span>' +
        '<span class="pf-match-delta" title="Recorded Elo change">' +
          valueHTML(match.ratingDiff, "signed") + '</span></li>';
    });
    return '<section class="pf-period"><div><h4>Match record</h4><dl class="pf-period-values">' +
      '<div><dt>Wins</dt><dd class="pf-win">' + valueHTML(activity.wins) + '</dd></div>' +
      '<div><dt>Losses</dt><dd class="pf-loss">' + valueHTML(activity.losses) + '</dd></div>' +
      (lengths ? '<div><dt>Average length</dt><dd>' + valueHTML(lengths.average, "duration") + '</dd></div>' +
        '<div><dt>Longest</dt><dd>' + valueHTML(lengths.longest, "duration") + '</dd></div>' : '') +
      '</dl></div><div class="pf-recent"><h4>Last five results</h4>' +
      (recent.length ? '<ol>' + recent.join("") + '</ol>' : '<p class="pf-empty">No results in this range.</p>') + '</div>' +
      (state.feedHistoryComplete === false ? '<p class="pf-period-caveat">Match history is incomplete.</p>' : '') + '</section>';
  }

  function chartPanelHTML(profileId, detail) {
    var history = detail && detail.historyByLadder && detail.historyByLadder[state.profileLadder] || [];
    var start = periodStart(state.profilePeriod);
    var visible = history.filter(function (point) {
      return point.rating != null && Number.isFinite(point.rating) && inPeriod(point, start);
    });
    var body = "";
    if (visible.length) {
      body = chartHTML(sample(visible), visible.length);
      if (visible.length === 1) body += '<p class="pf-single-rating">' + esc(visible[0].rating) + ' Elo · ' +
        esc(chartDate(visible[0].date)) + '</p>';
    } else {
      chartGeometry = null;
      var failed = state.detailFailed.has(profileId);
      body = '<p class="pf-empty">' + (failed ? 'Rating history unavailable.' : !detail ? 'Loading rating history…' :
        'No Elo ratings in this period.') + '</p>';
      if (failed) body += '<button type="button" class="pf-action" data-profile-retry>Retry rating history</button>';
    }
    return '<section class="pf-chart"><div class="pf-chart-head"><h4 tabindex="-1">Rating history</h4></div>' + body + '</section>';
  }

  function topsHTML(activity) {
    var title = '<div class="pf-breakdown-head"><h4>Match breakdown</h4></div>';
    if (!state.feedReady) return '<section class="pf-breakdown">' + title + '<p class="pf-empty">' +
      (state.feedError ? 'Match breakdown unavailable.' : 'Loading match breakdown…') + '</p></section>';
    return '<section class="pf-breakdown">' + title + '<div class="pf-tables">' +
      '<section><h5>Civilisations</h5>' + playerBreakdownTable(activity.decided, "civ", "Civilisation", "Picks") +
      '</section><section><h5>Maps</h5>' + playerBreakdownTable(activity.decided, "map", "Map", "Matches") +
      '</section></div></section>';
  }

  function playerBreakdownTable(matches, field, nameLabel, countLabel) {
    var rows = AOE.tally(matches, field, field + "Image", Number.MAX_SAFE_INTEGER);
    if (!rows.length) return '<p class="pf-empty">No ' + nameLabel.toLowerCase() + ' results in this range.</p>';
    var games = 0, wins = 0;
    rows.forEach(function (row) { games += row.games; wins += row.wins; });
    function cells(count, won, rate) {
      return '<td>' + valueHTML(count) + '</td><td>' + valueHTML(won) + '–' +
        valueHTML(count - won) + '</td><td>' + valueHTML(rate, "percent") + '</td>';
    }
    return '<table class="pf-table" aria-label="' + nameLabel + ' records"><thead><tr><th scope="col">' + nameLabel +
      '</th><th scope="col">' + countLabel + '</th><th scope="col">W–L</th><th scope="col">Win rate</th></tr></thead><tbody>' +
      rows.slice(0, 8).map(function (row) {
        return '<tr><th scope="row"><span class="pf-table-name">' +
          (row.image ? '<img src="' + esc(row.image) + '" loading="lazy" alt="">' : '') +
          '<span>' + esc(row.name) + '</span></span></th>' + cells(row.games, row.wins, row.winRate) + '</tr>';
      }).join('') + '</tbody><tfoot><tr><th scope="row">' + (field === 'civ' ? 'All civilisations' : 'All maps') +
      '</th>' + cells(games, wins, wins / games * 100) + '</tr></tfoot></table>';
  }

  /* ---------- rating chart ---------- */

  /* Keep each bucket's high and low so that a short-lived peak survives a
     long chart window. Every point the reader can inspect is a real game. */
  var MAX_POINTS = 360;

  function sample(points) {
    if (points.length <= MAX_POINTS) return points;
    var out = [points[0]];
    var buckets = Math.floor((MAX_POINTS - 2) / 2);
    for (var i = 0; i < buckets; i++) {
      var start = 1 + Math.floor(i * (points.length - 2) / buckets);
      var end = 1 + Math.floor((i + 1) * (points.length - 2) / buckets);
      var lo = start, hi = start;
      for (var j = start + 1; j < end; j++) {
        if (points[j].rating < points[lo].rating) lo = j;
        if (points[j].rating > points[hi].rating) hi = j;
      }
      out.push(points[Math.min(lo, hi)]);
      if (hi !== lo) out.push(points[Math.max(lo, hi)]);
    }
    out.push(points[points.length - 1]);
    return out;
  }

  /* Geometry of the chart currently on screen, so the hover handler can map
     a pointer position back to the game under it. Only one exists at a
     time — one roster row is open at most. */
  var chartGeometry = null;

  function chartDate(iso) {
    if (!iso) return "—";
    var when = new Date(iso);
    if (isNaN(when.getTime())) return "—";
    return shortDate(when);
  }

  function chartHTML(points, recordCount) {
    var w = 640, h = 208, padX = 4, padY = 5;
    var right = w - 4;
    var values = points.map(function (p) { return p.rating; });
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var step = Math.max(1, Math.ceil((max - min) / 4));
    var low = min === max ? min - 2 : min;
    var high = low + step * 4;
    var firstDate = state.profilePeriod === "all" ? new Date(points[0].date).getTime() : periodStart(state.profilePeriod);
    var lastDate = state.asOf;

    var coords = values.map(function (value, i) {
      var date = new Date(points[i].date).getTime();
      var x = lastDate > firstDate ? (date - firstDate) / (lastDate - firstDate) : 0.5;
      return {
        x: padX + x * (right - padX),
        y: h - padY - ((value - low) / (high - low)) * (h - padY * 2)
      };
    });

    chartGeometry = { points: points, coords: coords, width: w, left: padX, right: right };

    var ticks = [0, 0.25, 0.5, 0.75, 1];
    var grid = ticks.map(function (f) {
      var y = padY + f * (h - padY * 2);
      return '<line class="chart-grid" x1="' + padX + '" x2="' + right + '" y1="' + y + '" y2="' + y + '"/>';
    }).join("");

    return '<div class="chart-wrap" tabindex="0" role="group" ' +
        'aria-label="Rating history — hover, or use the arrow keys, to read individual games">' +
      '<div class="pf-plot"><div class="pf-scale" aria-hidden="true">' + ticks.map(function (f) {
        return '<span>' + Math.round(high - f * (high - low)) + '</span>';
      }).join("") + '</div>' +
      '<svg class="chart" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" role="img" ' +
        'aria-label="' + (recordCount === 1 ? 'One recorded rating, ' + min + ' Elo, ' + esc(chartDate(points[0].date)) :
          'Rating history from ' + min + " to " + max + ' over ' + recordCount + ' recorded ratings') + '">' +
        grid +
        (coords.length > 1 ? '<polyline class="chart-line" points="' +
          coords.map(function (c) { return c.x.toFixed(1) + "," + c.y.toFixed(1); }).join(" ") + '"/>' : '') +
        '<circle class="pf-last-point" r="3.5" cx="' + coords[coords.length - 1].x + '" cy="' + coords[coords.length - 1].y + '"/>' +
        '<line class="chart-cursor" x1="0" x2="0" y1="' + padY + '" y2="' + (h - padY) + '"/>' +
        '<circle class="chart-dot" r="4" cx="0" cy="0"/>' +
      "</svg></div>" +
      /* The period also determines the axis. A quiet week remains visible
         at the end even when the player's last game was earlier. */
      '<div class="chart-dates">' +
        "<span>" + esc(chartDate(firstDate)) + "</span>" +
        '<span class="pf-chart-middle">' + esc(chartDate((firstDate + lastDate) / 2)) + '</span>' +
        "<span>" + esc(chartDate(lastDate)) + "</span>" +
      "</div>" +
      '<div class="chart-tip" aria-live="polite"></div>' +
    "</div>";
  }

  /* The panel is rebuilt with innerHTML on every pick, so the handlers are
     bound to the fresh nodes each time rather than delegated. */
  function bindChart() {
    var wrap = $("#rosterTable .player--open .chart-wrap");
    var geo = chartGeometry;
    if (!wrap || !geo) return;

    var svg = $(".chart", wrap);
    var cursor = $(".chart-cursor", wrap);
    var dot = $(".chart-dot", wrap);
    var tip = $(".chart-tip", wrap);
    var active = -1;

    function show(index) {
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
        "<b>" + valueHTML(point.rating) + "</b>" +
        (diff != null
          ? '<i class="' + (diff >= 0 ? "up" : "down") + '">' +
            valueHTML(diff, "signed") + "</i>"
          : "") +
        "<em>" + esc(chartDate(point.date)) +
          (point.games != null ? " · game " + valueHTML(point.games) : "") +
        "</em>";

      /* The label rides the point. Clamped so it can't hang off either end
         of the panel — near the edges it detaches from the guide slightly,
         which beats being clipped. */
      var wrapBox = wrap.getBoundingClientRect(), plotBox = svg.getBoundingClientRect();
      var pixel = plotBox.left - wrapBox.left + at.x / geo.width * plotBox.width;
      var half = tip.offsetWidth / 2;
      tip.style.left = Math.max(half, Math.min(wrapBox.width - half, pixel)) + "px";

      wrap.classList.add("is-active");
    }

    function clear() {
      active = -1;
      wrap.classList.remove("is-active");
    }

    function indexAt(clientX) {
      var box = svg.getBoundingClientRect();
      if (!box.width) return 0;
      // client pixels -> viewBox units -> position along the plotted span
      var units = ((clientX - box.left) / box.width) * geo.width;
      var left = 0, right = geo.coords.length - 1;
      while (left < right) {
        var mid = Math.floor((left + right) / 2);
        if (geo.coords[mid].x < units) left = mid + 1;
        else right = mid;
      }
      return left && Math.abs(geo.coords[left - 1].x - units) < Math.abs(geo.coords[left].x - units) ? left - 1 : left;
    }

    wrap.addEventListener("pointermove", function (e) { show(indexAt(e.clientX)); });
    wrap.addEventListener("pointerleave", clear);
    wrap.addEventListener("blur", clear);
    wrap.addEventListener("focus", function () {
      if (active < 0) show(geo.coords.length - 1);
    });
    wrap.addEventListener("keydown", function (e) {
      var step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      show(active < 0 ? geo.coords.length - 1 : active + step);
    });
  }

  /* Clan and duo views share a single workspace. Only the projected members
     change when a pair is selected, so every table uses the same matches. */
  var ledgerModel = null;
  var MATCH_PAGE_SIZE = 8;
  function ledgerView() { return state.pair || state.clanView; }
  function soloLadder(ladder) { return /(?:^|_)1v1(?:_|$)/.test(ladder); }

  function agreedOutcome(players) {
    var first = players.length ? players[0].won : null;
    return typeof first === "boolean" && players.every(function (p) { return p.won === first; }) ? first : null;
  }

  function matchResult(game, members) {
    if (game.vsAI) return { mark: "AI", cls: "n", label: "Against AI", won: null };
    if (new Set(members.map(function (p) { return p.team; }).filter(function (team) { return team != null; })).size > 1)
      return { mark: "±", cls: "n", label: "Clan on both sides", won: null };
    var outcome = agreedOutcome(members);
    if (outcome == null) return { mark: "–", cls: "n", label: "No agreed result", won: null };
    return outcome ? { mark: "W", cls: "w", label: "Win", won: true } : { mark: "L", cls: "l", label: "Loss", won: false };
  }

  function buildLedgerModel() {
    var scope = ledgerView(), pair = state.pair;
    var games = [], records = [], together = 0, players = new Set();
    periodData(scope.period).games.forEach(function (game) {
      if (game.ladder !== scope.ladder) return;
      var members = game.members;
      if (pair) {
        members = members.filter(function (p) { return pair.ids.includes(p.profileId); });
        if (game.vsAI || members.length !== 2 || members[0].team == null || members[0].team !== members[1].team) return;
      }
      var result = matchResult(game, members);
      var entry = { game: game, members: members, result: result, matchId: game.matchId, durationMinutes: game.durationMinutes, map: game.map };
      games.push(entry);
      if (result.won != null) records.push(entry);
      members.forEach(function (p) { players.add(p.profileId); });
      var teams = members.map(function (p) { return p.team; }).filter(function (team) { return team != null; });
      if (!game.vsAI && new Set(teams).size < teams.length) together++;
    });
    var pairs = !pair && soloLadder(scope.ladder) ? [] : AOE.warband(games.map(function (entry) { return entry.game; }), 1);
    var partnership = pair && pairs.find(function (p) { return p.key === pair.key; });
    return { games: games, records: records, pairs: pairs, partnership: partnership, together: together, players: players.size };
  }

  function activityHTML(games, period) {
    var bins = Array(24).fill(0), end = state.asOf;
    var start = periodStart(period) || (games.length ? Date.parse(games[games.length - 1].game.date) : end);
    var span = Math.max(1, end - start);
    games.forEach(function (entry) {
      var i = Math.floor((Date.parse(entry.game.date) - start) / span * bins.length);
      bins[Math.max(0, Math.min(bins.length - 1, i))]++;
    });
    var max = Math.max.apply(null, bins), peak = bins.indexOf(max);
    var description = max ? 'The busiest interval was ' + shortDate(start + peak * span / bins.length) + ' to ' +
      shortDate(start + (peak + 1) * span / bins.length) + ' with ' + max + (max === 1 ? ' match.' : ' matches.') : 'No matches in this range.';
    return '<div class="cs-activity"><span>Match activity</span><div class="cs-bars" role="img" aria-label="' +
      esc(description) + '">' +
      bins.map(function (n, i) {
        return '<i style="--height:' + (max ? n / max * 100 : 0).toFixed(1) + '%" title="' +
          esc(shortDate(start + i * span / bins.length)) + ' – ' + esc(shortDate(start + (i + 1) * span / bins.length)) +
          ' · ' + n + (n === 1 ? ' match' : ' matches') + '"' + (n ? ' class="has-games"' : '') + '></i>';
      }).join("") + '</div></div>';
  }

  function summaryHTML(model) {
    var scope = ledgerView(), wins = model.records.filter(function (entry) { return entry.result.won; }).length;
    var lengths = AOE.durationStats(model.records);
    function metric(label, value, note) {
      return '<div><dt>' + label + '</dt><dd>' + value + '</dd>' +
        (note ? '<dd class="cs-note">' + esc(note) + '</dd>' : '') + '</div>';
    }
    var key = state.pair ? "duo-" + state.pair.key : "clan";
    var record = model.records.length ? wins + "W · " + (model.records.length - wins) + "L" : "";
    var third = state.pair ? metric("Best win streak", valueHTML(model.partnership && model.partnership.bestRun)) :
      soloLadder(scope.ladder) ? metric("Active players", valueHTML(model.players)) : metric("Played together", valueHTML(model.together),
        model.games.length ? countLabel(100 * model.together / model.games.length, "percent") + " of matches" : "");
    return '<dl class="cs-metrics">' + metric("Matches", countHTML(key + "-matches", model.games.length)) +
      metric("Win rate", countHTML(key + "-rate", model.records.length ? wins / model.records.length * 100 : null, "percent"), record) +
      third + metric("Average length", valueHTML(lengths && lengths.average, "duration")) +
      '</dl>' + activityHTML(model.games, scope.period);
  }

  function renderLedgerTabs() {
    syncModes($("#ledgerTabs"), "data-ledger", ledgerView().ladder);
  }

  function renderLedger(animate) {
    renderLedgerTabs();
    renderPeriod("ledger");
    var heading = state.pair ? esc(state.pair.a) + ' <span class="cs-plus">+</span> ' + esc(state.pair.b) : 'Clan statistics<span class="period">.</span>';
    if ($("#ledgerTitle").innerHTML !== heading) {
      var mast = $(".cs-mast"), previousHeight = animate ? panelHeight(mast) : null;
      $("#backToDuos").hidden = !state.pair;
      $("#ledgerTitle").innerHTML = heading;
      if (animate) transitionPanel(mast, previousHeight, null, true);
    }
    $("#matchesTitle").textContent = state.pair ? "Shared matches" : "Match history";
    renderLedgerMore();
    if (!state.feedReady) {
      var message = state.feedError ? "Match history unavailable." : "Loading matches…";
      $("#clanBreakdown").innerHTML = $("#clanFeed").innerHTML = '<p class="cs-empty">' + message + '</p>';
      return;
    }
    ledgerModel = buildLedgerModel();
    var previous = animate === true ? clanCounters.capture() : null;
    if (!previous) clanCounters.finish();
    var summary = $("#ledgerStats"), from = animate ? panelHeight(summary) : null;
    summary.innerHTML = summaryHTML(ledgerModel);
    if (animate) transitionPanel(summary, from, null, true);
    if (previous) clanCounters.animate(previous);
    renderBreakdown(animate);
    renderFeed(animate);
    statusOK($("#ledgerStatus"), sourceLabel());
  }

  function setLedgerScope(ladder, period) {
    var view = ledgerView();
    if (ladder === view.ladder && period === view.period) return;
    view.ladder = ladder;
    view.period = period;
    view.page = 0;
    view.showAll = false;
    state.openMatch = null;
    renderLedger(true);
  }

  function renderLedgerMore() {
    var host = $("#ledgerMore");
    host.hidden = !state.feedError;
    host.innerHTML = state.feedError ? '<button type="button" class="button button--ghost" id="ledgerMoreBtn">Retry loading history</button>' : "";
  }

  $("#ledgerTabs").addEventListener("click", function (e) {
    var tab = e.target.closest("[data-ledger]");
    if (!tab) return;
    setLedgerScope(tab.dataset.ledger, ledgerView().period);
  });
  $("#ledgerMore").addEventListener("click", function (e) {
    if (e.target.closest("#ledgerMoreBtn")) loadFeed();
  });

  function renderFeed(animate) {
    var view = ledgerView(), games = ledgerModel.games;
    var pages = Math.ceil(games.length / MATCH_PAGE_SIZE);
    view.page = Math.max(0, Math.min(view.page, pages - 1));
    var start = view.page * MATCH_PAGE_SIZE, matches = games.slice(start, start + MATCH_PAGE_SIZE);
    $("#matchPages").hidden = pages < 2;
    $("#matchPageLabel").textContent = (view.page + 1) + " / " + pages;
    $$("[data-page]").forEach(function (button) {
      button.disabled = Number(button.dataset.page) < 0 ? !view.page : view.page >= pages - 1;
    });
    var feed = $("#clanFeed"), from = animate ? panelHeight(feed) : null;
    feed.innerHTML = matches.map(function (entry) {
      var game = entry.game, id = String(game.matchId), outcome = entry.result;
      var open = state.openMatch === id;
      var names = entry.members.map(function (p) { return p.name; }).join(" · ");
      var subtitle = state.pair ? (game.lineup || []).filter(function (p) { return state.pair.ids.includes(p.profileId); })
        .map(function (p) { return p.civ; }).filter(Boolean).join(" · ") : names;
      return '<div class="feed-item' + (open ? " feed-item--open" : "") + '"><button type="button" class="feed-row" data-match="' + esc(id) +
        '" aria-expanded="' + open + '"' + (open ? ' aria-controls="match-' + esc(id) + '"' : '') + '><span class="feed-row__mark ' + outcome.cls + '" aria-label="' + esc(outcome.label) + '">' + outcome.mark + '</span>' +
        '<span class="feed-row__who"><b>' + esc(game.map || "Unknown map") + '</b><em>' + esc(subtitle) + '</em></span>' +
        '<span class="feed-row__when">' + esc(shortDate(game.date)) + (game.durationMinutes != null ? '<em>' + esc(fmtDuration(game.durationMinutes)) + '</em>' : '') +
        '</span><svg class="cs-chevron" aria-hidden="true"><use href="#i-chevron"></use></svg></button>' +
        (open ? '<div class="cs-match-detail" id="match-' + esc(id) + '">' + matchCardHTML(game) + '</div>' : "") + '</div>';
    }).join("") || '<p class="cs-empty">' + (state.pair ? 'No shared matches in this range.' : 'No matches in this range.') + '</p>';
    if (animate) transitionPanel(feed, from, null, true);
  }

  $("#matchPages").addEventListener("click", function (e) {
    var button = e.target.closest("[data-page]");
    if (!button || button.disabled || !ledgerModel) return;
    ledgerView().page += Number(button.dataset.page);
    state.openMatch = null;
    renderFeed(true);
    if (e.detail === 0 && button.disabled) {
      var available = $("#matchPages button:not(:disabled)");
      if (available) available.focus({ preventScroll: true });
    }
  });

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
      var key = player.team == null ? null : player.team;
      if (!byTeam.has(key)) { byTeam.set(key, []); order.push(key); }
      byTeam.get(key).push(player);
    });
    order.sort(function (a, b) {
      if (a === b) return 0;
      return a == null ? 1 : b == null ? -1 : a - b;
    });

    var sides = order.map(function (key, i) {
      var side = byTeam.get(key);
      var outcome = key == null ? null : agreedOutcome(side);
      return '<div class="side' + (outcome === true ? " side--won" : outcome === false ? " side--lost" : "") + '">' +
        '<p class="side__head"><span>' + (key == null ? "Team unrecorded" : "Team " + (i + 1)) + "</span>" +
          (outcome != null ? "<em>" + (outcome ? "Won" : "Lost") + "</em>" : "") + "</p>" +
        side.map(function (p) {
          return '<div class="side__player' + (p.isMember ? " side__player--ours" : "") + '">' +
            (p.civImage
              ? '<img src="' + esc(p.civImage) + '" width="22" height="22" loading="lazy" alt="">'
              : '<span class="side__blank" aria-hidden="true"></span>') +
            "<b>" + esc(p.name || "—") + "</b>" +
            "<em>" + esc(p.civ || "—") + "</em>" +
            "<i>" + valueHTML(p.rating) +
              (p.ratingDiff != null
                ? '<span class="' + (p.ratingDiff >= 0 ? "up" : "down") + '">' +
                  valueHTML(p.ratingDiff, "signed") + "</span>"
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

  function toggleMatch(button, opening) {
    var item = button.parentElement, panel = item.querySelector(".cs-match-detail");
    var height = panel ? panelHeight(panel) : 0;
    item.classList.toggle("feed-item--open", opening);
    button.setAttribute("aria-expanded", String(opening));
    if (opening && !panel) {
      var entry = ledgerModel.games.find(function (entry) { return String(entry.matchId) === button.dataset.match; });
      button.insertAdjacentHTML("afterend", '<div class="cs-match-detail" id="match-' + esc(button.dataset.match) + '">' + matchCardHTML(entry.game) + '</div>');
      panel = item.querySelector(".cs-match-detail");
    }
    if (panel) {
      if (opening) button.setAttribute("aria-controls", panel.id);
      else button.removeAttribute("aria-controls");
      panel.inert = !opening;
      transitionPanel(panel, height, opening ? null : 0, false, opening ? null : function () { panel.remove(); });
    }
  }
  $("#clanFeed").addEventListener("click", function (e) {
    var button = e.target.closest("[data-match]");
    if (!button) return;
    var opening = state.openMatch !== button.dataset.match;
    var previous = $("#clanFeed [aria-expanded=true]");
    if (previous && opening) anchorCollapse(button, previous.parentElement.querySelector(".cs-match-detail"));
    if (previous) toggleMatch(previous, false);
    state.openMatch = opening ? button.dataset.match : null;
    if (opening) toggleMatch(button, true);
  });

  var countryNames = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
  function countryRows(entries) {
    var faced = new Set(), countries = new Map();
    entries.forEach(function (entry) {
      if (entry.game.vsAI) return;
      var sides = new Set(entry.members.map(function (p) { return p.team; }).filter(function (team) { return team != null; }));
      if (!sides.size) return;
      entry.game.lineup.forEach(function (p) {
        if (p.isMember || p.team == null || sides.has(p.team) || !/^[a-z]{2}$/i.test(p.country || "") ||
            p.profileId == null || faced.has(p.profileId)) return;
        faced.add(p.profileId);
        var code = p.country.toUpperCase();
        countries.set(code, (countries.get(code) || 0) + 1);
      });
    });
    return Array.from(countries, function (entry) {
      return { name: countryNames ? countryNames.of(entry[0]) : entry[0], code: entry[0], games: entry[1], share: 100 * entry[1] / faced.size };
    }).sort(function (a, b) { return b.games - a.games || a.name.localeCompare(b.name); });
  }

  function formatName(game) {
    var sides = new Map();
    if (!game.lineup.length || game.lineup.some(function (p) { return p.team == null; })) return null;
    game.lineup.forEach(function (p) { sides.set(p.team, (sides.get(p.team) || 0) + 1); });
    var counts = Array.from(sides.values());
    return counts.length === 2 && counts[0] === counts[1] ? counts[0] + "v" + counts[1] : null;
  }
  function breakdownRows(tab) {
    var model = ledgerModel;
    if (tab === "duos") return model.pairs;
    if (tab === "opponents") return countryRows(model.games);
    if (tab === "civ" && state.pair) return model.partnership ? model.partnership.combinations : [];
    var appearances = [];
    model.records.forEach(function (entry) {
      var game = entry.game;
      if (tab === "civ") game.lineup.forEach(function (p) {
        if (p.isMember && p.civ) appearances.push({ name: p.civ, image: p.civImage, won: entry.result.won });
      });
      else appearances.push({ name: tab === "map" ? game.map : formatName(game), image: tab === "map" ? game.mapImage : null, won: entry.result.won });
    });
    return AOE.tally(appearances, "name", "image", Number.MAX_SAFE_INTEGER);
  }

  function rowIdentity(row, tab) {
    if (tab === "duos") return '<button type="button" class="cs-pair" data-pair="' + esc(row.key) + '" aria-label="View ' + esc(row.a + ' and ' + row.b) + ' duo statistics">' +
      '<span class="cs-avatars" aria-hidden="true">' + row.players.map(function (p) { return avatarHTML(p); }).join("") + '</span>' +
      '<span class="cs-pair-names"><b>' + esc(row.a) + '</b><b>' + esc(row.b) + '</b></span>' +
      '<svg class="cs-chevron" aria-hidden="true"><use href="#i-chevron"></use></svg></button>';
    if (tab === "opponents") return '<span class="cs-name">' + flag(row.code) + esc(row.name) + '</span>';
    return '<span class="cs-name">' + (row.image ? '<img width="26" height="26" loading="lazy" src="' + esc(row.image) + '" alt="">' : '') + esc(row.name) + '</span>';
  }

  function recordsTable(rows, tab, sort) {
    var duo = tab === "duos", countries = tab === "opponents", picks = tab === "civ" && !state.pair;
    var combinations = tab === "civ" && state.pair;
    var name = { duos: "Partnership", map: "Map", civ: state.pair ? "Civilisation pairing" : "Civilisation", formats: "Format", opponents: "Country" }[tab];
    var head = countries ? '<th scope="col">Opponents</th><th scope="col">Share</th>' :
      '<th scope="col">' + (picks ? "Picks" : "Matches") + '</th><th scope="col">W–L</th><th scope="col">Win rate</th>' +
      (duo ? '<th scope="col" class="cs-form">' + (sort === "run" ? "Win streak" : "Last 5") + '</th>' : '');
    var names = combinations ? state.pair.players.map(function (p) { return '<th class="cs-civ-col" scope="col">' + esc(p.name) + '</th>'; }).join("") :
      '<th scope="col">' + name + '</th>';
    return '<table class="cs-table' + (duo ? ' cs-table--duos' : '') + '"><thead><tr>' + names + head + '</tr></thead><tbody>' +
      rows.map(function (row) {
        var extra = countries ? '<td>' + valueHTML(row.share, "percent") + '</td>' :
          '<td>' + valueHTML(row.wins) + '–' + valueHTML(row.games - row.wins) + '</td><td>' + valueHTML(row.winRate, "percent") + '</td>' +
          (duo ? '<td class="cs-form">' + (sort === "run" ? valueHTML(row.currentRun) : lineupForm(row.form)) + '</td>' : '');
        var identity = combinations ? state.pair.players.map(function (player) {
          var civ = row.civs.find(function (c) { return c.profileId === player.profileId; });
          return '<td class="cs-civ-col">' + esc(civ.name) + '</td>';
        }).join("") : '<th scope="row">' + rowIdentity(row, tab) + '</th>';
        return '<tr' + (duo ? ' data-duo-row="' + esc(row.key) + '"' : '') + '>' + identity + '<td>' + valueHTML(row.games) + '</td>' + extra + '</tr>';
      }).join("") + '</tbody></table>';
  }

  function renderBreakdown(animate, toggleRows) {
    if (!ledgerModel) return;
    var view = ledgerView(), solo = soloLadder(view.ladder);
    var hideDuos = Boolean(state.pair || solo);
    var tab = (view.tab === "duos" && hideDuos) || (view.tab === "formats" && solo) ? "map" : view.tab;
    var tabs = $("#breakdownViews"), tabHeight = animate ? panelHeight(tabs) : null;
    $$("[data-view]").forEach(function (button) {
      var id = button.dataset.view;
      button.hidden = (id === "duos" && hideDuos) || (id === "formats" && solo);
      button.setAttribute("aria-pressed", String(id === tab));
      if (id === "civ") button.textContent = state.pair ? "Civ pairings" : "Civilisations";
    });
    var picker = $("#breakdownSort");
    var order = view.sort === "run" && tab !== "duos" || tab === "opponents" ? "volume" : view.sort;
    picker.hidden = tab === "opponents";
    Array.from(picker.options).forEach(function (opt) {
      if (opt.value === "run") { opt.hidden = opt.disabled = tab !== "duos"; }
      if (opt.value === "win") opt.textContent = "Highest win rate · 10+ " + (tab === "civ" && !state.pair ? "picks" : "matches");
    });
    picker.value = order;
    if (animate) transitionPanel(tabs, tabHeight, null, false);
    var rows = breakdownRows(tab);
    if (order === "win") rows = rows.filter(function (row) { return row.games >= 10; }).sort(function (a,b) { return b.winRate - a.winRate || b.games - a.games; });
    if (order === "run") rows = rows.slice().sort(function (a,b) { return b.currentRun - a.currentRun || b.games - a.games; });
    var labels = { duos: "duos", map: "maps", civ: state.pair ? "pairings" : "civilisations", formats: "formats", opponents: "countries" };
    var empty = order === "win" ? "No entries with 10 or more " + (tab === "civ" && !state.pair ? "picks." : "matches.") :
      { duos: "No duo results in this range.", map: "No map results in this range.", civ: "No civilisation results in this range.",
        formats: "No recorded game formats.", opponents: "No opponents with a recorded country." }[tab];
    var results = $("#clanBreakdown"), from = animate ? panelHeight(results) : null;
    var tail = toggleRows && !view.showAll && !motionPreference.matches ? $$("tbody tr", results).slice(8) : [];
    results.innerHTML = rows.length ? recordsTable(view.showAll ? rows : rows.slice(0, 8), tab, order) : '<p class="cs-empty">' + empty + '</p>';
    if (animate) {
      var to = results.getBoundingClientRect().height;
      // Keep the outgoing rows visible beneath the clipping edge while folding.
      var body = $("tbody", results);
      tail.forEach(function (row) { row.inert = true; body.appendChild(row); });
      transitionPanel(results, from, to, !toggleRows, function () {
        tail.forEach(function (row) { row.remove(); });
      });
    }
    var more = $("#breakdownMore");
    var actions = $("#breakdownActions"), actionHeight = animate ? panelHeight(actions) : null;
    more.hidden = rows.length <= 8;
    more.textContent = view.showAll ? "Show fewer" : "View all " + rows.length + " " + labels[tab];
    more.setAttribute("aria-expanded", String(view.showAll));
    if (animate) transitionPanel(actions, actionHeight, null, false);
  }

  $("#breakdownViews").addEventListener("click", function (e) {
    var button = e.target.closest("[data-view]");
    if (!button) return;
    var view = ledgerView();
    if (view.tab === button.dataset.view && !view.showAll && view.sort === "volume") return;
    view.tab = button.dataset.view; view.showAll = false; view.sort = "volume";
    renderBreakdown(true);
  });
  $("#breakdownSort").addEventListener("change", function (e) {
    var view = ledgerView(); view.sort = e.target.value; view.showAll = false;
    renderBreakdown(true);
  });
  $("#breakdownMore").addEventListener("click", function () {
    if (ledgerView().showAll) anchorCollapse(this, $("#clanBreakdown"));
    ledgerView().showAll = !ledgerView().showAll;
    renderBreakdown(true, true);
  });

  $("#clanBreakdown").addEventListener("click", function (e) {
    var row = e.target.closest("[data-duo-row]");
    if (!row) return;
    var duo = ledgerModel.pairs.find(function (p) { return p.key === row.dataset.duoRow; });
    if (!duo) return;
    state.pair = { key: duo.key, ids: duo.ids, players: duo.players, a: duo.a, b: duo.b, ladder: state.clanView.ladder, period: state.clanView.period,
      tab: "map", sort: "volume", showAll: false, page: 0 };
    state.openMatch = null;
    renderLedger(true);
    var back = $("#backToDuos");
    back.focus({ preventScroll: true });
    if (back.getBoundingClientRect().top < header.getBoundingClientRect().bottom) $("#ledger").scrollIntoView({ behavior: motionPreference.matches ? "instant" : "smooth", block: "start" });
  });
  $("#backToDuos").addEventListener("click", function () {
    if (!state.pair) return;
    var key = state.pair.key;
    state.pair = null;
    state.openMatch = null;
    renderLedger(true);
    var button = $('#clanBreakdown [data-pair="' + key + '"]') || $("#breakdownViews [aria-pressed=true]");
    if (button) button.focus({ preventScroll: true });
  });
  window.addEventListener("hashchange", function () {
    if (window.location.hash !== "#duos") return;
    state.pair = null; state.openMatch = null;
    state.clanView.tab = "duos";
    if (soloLadder(state.clanView.ladder)) setLedgerScope("rm_team", state.clanView.period);
    else renderLedger(true);
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
    state.roster.forEach(function (m) { registerModes(m.ladders); });
    syncModes(switchEl, "data-ladder", state.rosterLadder);

    statusOK($("#rosterStatus"), sourceLabel());
    renderRoster();
    loadCountryTotals();
    loadAvatars();
    return loadFeed();
  }).catch(function () {
    statusFail($("#rosterStatus"), "Stored data unavailable");
    statusFail($("#ledgerStatus"), "Stored data unavailable");
    $("#rosterTable").innerHTML =
      '<div class="state">The saved data is unavailable. Please try again later.</div>';
    $("#clanBreakdown").innerHTML = $("#clanFeed").innerHTML =
      '<div class="state">Unavailable.</div>';
  });

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
      paintDossier(true);
      if (state.feedReady) renderBreakdown();
    });
  }

  /* One initial request loads every stored clan game. Period windows are
     prepared before rendering so all range switches use data already in memory. */
  function loadFeed() {
    var ids = state.roster.map(function (m) { return m.profileId; });
    if (state.feedLoading) return;
    state.feedLoading = true;
    state.feedError = false;
    $("#ledgerStatus").textContent = "Loading matches…";
    renderPeriod("roster");
    paintDossier();
    renderLedger();

    return AOE.fetchClanFeed(ids).then(function (result) {
      state.feedLoading = false;
      state.feedReady = true;
      state.feedHistoryComplete = result.historyComplete !== false;
      state.feed = result.rows;
      state.games = result.games.sort(function (a, b) { return Date.parse(b.date) - Date.parse(a.date) || b.matchId - a.matchId; });
      preparePeriods();

      renderRoster();
      paintDossier();
      renderLedger();
      // Saved roster data and webfonts change the height above this deep link.
      // Align after both have rendered so the panel title clears the header.
      if (window.location.hash === "#duos") {
        var alignDuos = function () {
          requestAnimationFrame(function () { $("#duos").scrollIntoView({ behavior: "instant", block: "start" }); });
        };
        var afterFonts = function () {
          if (document.readyState === "complete") alignDuos();
          else window.addEventListener("load", alignDuos, { once: true });
        };
        if (document.fonts) document.fonts.ready.then(afterFonts);
        else afterFonts();
      }
    }, function () {
      state.feedLoading = false;
      state.feedError = true;
      renderPeriod("roster");
      paintDossier();
      renderLedger();
      statusFail($("#ledgerStatus"), "Feed unavailable");
    });
  }

  /* National totals turn "#19" into "#19 of 875 in CZ". One request per
     country per ladder, cached for the session. */
  function loadCountryTotals(forLadder) {
    var ladder = forLadder || state.rosterLadder;
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
      // The country denominator is the only field this request changes.
      // Leave the focused tab, active chart point and table controls in place.
      if (!state.openPlayer || state.profileLadder !== ladder) return;
      var standing = $("#rosterTable .player--open [data-national-total]");
      var player = state.roster.find(function (p) { return p.profileId === state.openPlayer; });
      if (!standing || !player || !player.country) return;
      var total = state.countryTotals.get(ladder + "|" + player.country.toLowerCase());
      if (total && standing.previousElementSibling.textContent !== "—") standing.textContent = "of " + countFormat.format(total);
    });
  }
})();
