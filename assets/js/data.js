/* ============================================================
   GG CLAN — site content
   ------------------------------------------------------------
   This is the only file you need to edit. No build step.
   The roster is updated daily from the AoE2 ladder for the clan
   tag below, so new members appear on their own. Everything here
   is flavour layered on top of that stored data.
   ============================================================ */

const CLAN = {
  name: "GG Clan",
  clanTag: "lggl",                          // the in-game clan tag the ladder is queried with
  motto: "Let's call it a GG.",
  lead: "Shape the battlefield. Build what lasts.",
  blurb:
    "Competitive Age of Empires II, played with cooperation, defensive control and just enough cheek.",
  discord: "https://discord.gg/eZrvfwaJJM",

  /* Discord server id, used for the daily "who was online" panel above the
     join button. It reads the server's public widget, so it needs
     "Enable Server Widget" left ON in Server Settings -> Widget. Switch
     the widget off, or blank this out, and the panel simply disappears.

     Note the widget also publishes its own invite, which is currently a
     DIFFERENT link to `discord` above (.../invite/SzjVCDnw). The site
     links `discord`; if that one is the stale one, fix it here. */
  discordGuildId: "833120416603963453",

  /* ------------------------------------------------------------------
     PLAYER NOTES  — keyed by exact in-game name.
     Everything else (Elo, peak, wins, losses, country, rank, streak)
     is fetched by the scheduled job and must NOT be typed here.

     Add a `role` and a `bio` for anyone you want to introduce. Leave a
     player out entirely and they still appear on the roster — just
     without the flavour text.
     ------------------------------------------------------------------ */
  notes: {
    gg_Small_Head: {
      role: "The Holdfast",
      specialty: "Macro · defense · siege control",
      bio: "A patient field commander who turns pressure into shape, then shape into the winning fight."
    },
    "gg_Matka_Premazaná": {
      role: "The Architect",
      specialty: "Citycraft · pressure absorption",
      bio: "Makes the base beautiful, makes the choke expensive, and makes the enemy reconsider the route."
    },
    gg_panstefanik: {
      role: "The Disruptor",
      specialty: "Maneuvers · raids · cheeky plans",
      bio: "Finds the gap, creates one if necessary, and keeps the other team looking the wrong way."
    },
    "gg_silverback_III.": {
      role: "The Engineer",
      specialty: "Economy · timing · team support",
      bio: "Builds the position everyone else realizes they needed five minutes later."
    }

    /* Room for the rest of the clan — copy the shape above, e.g.
    gg_Danny:          { role: "", specialty: "", bio: "" },
    gg_bohois:         { role: "", specialty: "", bio: "" },
    "gg_Rastislav_III.": { role: "", specialty: "", bio: "" },
    gg_Karlinx:        { role: "", specialty: "", bio: "" },
    gg_Sasek:          { role: "", specialty: "", bio: "" },
    */
  },

  /* Anyone listed here is hidden from the public roster. */
  hidden: [],

  /* ------------------------------------------------------------------
     External profile links shown when a roster row is expanded.
     `{id}` is replaced with the player's AoE2 profile id.

     Companion is VERIFIED working.
     The AoE2 Insights pattern is a best guess — that site sits behind a
     Cloudflare bot check, so it could not be tested automatically.
     Open one and confirm; if it 404s, correct the URL here (or delete
     the whole line) and every roster row updates.
     ------------------------------------------------------------------ */
  profileLinks: [
    { label: "Companion",     url: "https://www.aoe2companion.com/players/{id}" },
    { label: "AoE2 Insights", url: "https://www.aoe2insights.com/user/{id}/" }
  ],

  /* The three values, shown in the Creed section. */
  creed: [
    ["01", "Cooperation",     "Information shared. Armies synchronized. No flank left alone."],
    ["02", "Defensive craft", "Castles, siege and choke points turn pressure into control."],
    ["03", "Cheeky execution", "The plan is serious. The finishing move does not have to be."]
  ],
  creedTitle: "We win together",
  creedLead:
    "GG Clan plays the long game: shared vision, patient defenses and decisive movement when the map finally breaks.",
  warcry: "Deus Vult!",

  /* ------------------------------------------------------------------
     CITY GALLERY — one entry per assets/img/cities/city-NN.webp

     These names and one-liners are FLAVOUR TEXT carried over from the
     old site. They are not the real story of each build — swap in what
     actually happened: who made it, on what map, in which game.
     Format: ["Title", "One-line caption"]
     ------------------------------------------------------------------ */
  cities: [
    ["The Inner Keep",      "Built for control, traffic and unreasonable amounts of stone."],
    ["The Red Citadel",     "A waterfront fortress with enough gates to make every route feel intentional."],
    ["The Great Granary",   "Protected farms, patient trade and a harbor tucked behind the line."],
    ["The Black Chapel",    "A compact stronghold where every street returns to the castle."],
    ["The Marble Quarter",  "A city of towers, courtyards and one extremely committed skyline."],
    ["The Basilica",        "Stone symmetry, civic pride and a bell tower visible from the whole map."],
    ["The Siege Corridor",  "A working city wrapped around the machinery that protects it."],
    ["The Temple City",     "Layered walls and quiet streets built around an impossible monument."],
    ["The Desert Archive",  "A scholarly district held behind multiple answers to one narrow gate."],
    ["The Western Wards",   "A chain of neighborhoods, chapels and walls that refuses to end."]
  ],

  /* Which ladders to show, and what to call them. */
  ladders: [
    { id: "rm_team",  label: "Team RM" },
    { id: "rm_1v1",   label: "1v1 RM" },
    { id: "unranked", label: "Unranked" }
  ]
};
