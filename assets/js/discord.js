/* ============================================================
   GG CLAN — live Discord presence
   ------------------------------------------------------------
   Discord's guild widget endpoint is public and answers CORS with
   whatever origin asks, so the browser reads it directly and the
   site stays static — same deal as the ladder.

   It only answers while "Enable Server Widget" is switched ON in
   Discord → Server Settings → Widget. If that gets turned off the
   request 403s, and the page hides the panel rather than guessing
   a number.

   Two things the widget deliberately does NOT give you: real member
   ids (`id` is just a list index) and offline members. The list is
   also capped at 100 online, which is why the headline count comes
   from `presence_count` and not from the array length.
   ============================================================ */
window.DISCORD = (function () {
  "use strict";

  var API = "https://discord.com/api/guilds/";

  /* Sort order for the face strip — online first, greyed-out last. */
  var RANK = { online: 0, idle: 1, dnd: 2, offline: 3 };
  function rank(status) { return RANK[status] != null ? RANK[status] : 9; }

  var pending = null;

  function fetchWidget(guildId) {
    if (!guildId) return Promise.reject(new Error("No Discord guild id configured"));
    if (pending) return pending;

    pending = fetch(API + encodeURIComponent(guildId) + "/widget.json")
      .then(function (response) {
        if (!response.ok) throw new Error("Discord widget unavailable (" + response.status + ")");
        return response.json();
      })
      .then(function (payload) {
        /* Only voice channels appear here, and only the ones the widget
           is allowed to show. Used to name where people are sitting. */
        var channelName = {};
        (payload.channels || []).forEach(function (channel) {
          channelName[channel.id] = channel.name;
        });

        var members = (payload.members || []).map(function (member) {
          return {
            name: member.username || "",
            status: member.status || "offline",
            avatar: member.avatar_url || null,
            playing: member.game && member.game.name ? member.game.name : null,
            voice: member.channel_id ? (channelName[member.channel_id] || "a voice channel") : null
          };
        }).sort(function (a, b) {
          return rank(a.status) - rank(b.status) || a.name.localeCompare(b.name);
        });

        return {
          name: payload.name || null,
          /* The widget's own invite. The site still links CLAN.discord —
             this is here so a mismatch is at least visible in the data. */
          invite: payload.instant_invite || null,
          online: payload.presence_count != null ? payload.presence_count : members.length,
          members: members,
          inVoice: members.filter(function (m) { return m.voice; }).length,
          playingAoe: members.filter(function (m) {
            return m.playing && /age of empires/i.test(m.playing);
          }).length
        };
      })
      .catch(function (error) {
        pending = null; // let a later attempt retry rather than caching the failure
        throw error;
      });

    return pending;
  }

  return { fetchWidget: fetchWidget };
})();
