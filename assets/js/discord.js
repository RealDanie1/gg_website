/* GG CLAN — Discord's published widget snapshot.
   Only the daily server job contacts Discord. This optional panel uses the
   widget's own update date, which can be older than the ladder snapshot. */
window.DISCORD = (function () {
  "use strict";

  /* Sort order for the face strip — online first, greyed-out last. */
  var RANK = { online: 0, idle: 1, dnd: 2, offline: 3 };
  function rank(status) { return RANK[status] != null ? RANK[status] : 9; }

  var pending = null;

  function fetchWidget(guildId) {
    if (!guildId) return Promise.reject(new Error("No Discord guild id configured"));
    if (pending) return pending;

    pending = window.GG_SNAPSHOT.getJson("data/public/discord.json")
      .then(function (snapshot) {
        if (!snapshot || snapshot.guildId !== guildId || !snapshot.payload) throw new Error("Discord snapshot unavailable");
        var payload = snapshot.payload;
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
          updatedAt: snapshot.updatedAt,
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
