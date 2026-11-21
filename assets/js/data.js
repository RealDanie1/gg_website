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
  blurb:
    "We are a Czechoslovakian Age of Empires II clan. If you don't rage or build a nice city, you're in the wrong place.",
  discord: "https://discord.gg/eZrvfwaJJM",

  /* The daily refresh can save the server's public widget. The join button
     always uses the configured invite above. */
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

  /* The four values, shown in the About us section. */
  creed: [
    ["01", "The long run",    "The longer, the better. A nice city, fortified walls and efficient trade are golden."],
    ["02", "Defensive craft", "One layer is never enough. Make it two or three, and throw in a few castles too."],
    ["03", "Coordination",    "All information is shared, armies are synchronised and no flank is left alone."],
    ["04", "Black Forest",    "Black Forest is our home map. Don't play it? Shame on you."]
  ],
  creedTitle: "Teamplay is the best play",
  creedLead:
    "In GG Clan, we believe in the long game, where defence meets offence and strategic thinking and coordination truly shine.",
  warcry: "Deus Vult!",

  /* ------------------------------------------------------------------
     CITY GALLERY — one entry per assets/img/cities/city-NN.webp

     These names and one-liners are FLAVOUR TEXT carried over from the
     old site. They are not the real story of each build — swap in what
     actually happened: who made it, on what map, in which game.
     Format: ["Title", "One-line caption", "projected light RGB sampled from the city image"]
     ------------------------------------------------------------------ */
  cities: [
    ["The Inner Keep",      "Built for control, traffic and unreasonable amounts of stone.", "116,96,69"],
    ["The Red Citadel",     "A waterfront fortress with enough gates to make every route feel intentional.", "127,105,79"],
    ["The Great Granary",   "Protected farms, patient trade and a harbor tucked behind the line.", "118,103,66"],
    ["The Black Chapel",    "A compact stronghold where every street returns to the castle.", "124,109,76"],
    ["The Marble Quarter",  "A city of towers, courtyards and one extremely committed skyline.", "128,108,78"],
    ["The Basilica",        "Stone symmetry, civic pride and a bell tower visible from the whole map.", "124,101,68"],
    ["The Siege Corridor",  "A working city wrapped around the machinery that protects it.", "116,104,80"],
    ["The Temple City",     "Layered walls and quiet streets built around an impossible monument.", "111,92,61"],
    ["The Desert Archive",  "A scholarly district held behind multiple answers to one narrow gate.", "123,103,72"],
    ["The Western Wards",   "A chain of neighborhoods, chapels and walls that refuses to end.", "109,95,71"]
  ],

  /* Which ladders to show, and what to call them. */
  ladders: [
    { id: "rm_team",  label: "Team Ranked" },
    { id: "rm_1v1",   label: "1v1 Ranked" },
    { id: "unranked", label: "Unranked" }
  ]
};
