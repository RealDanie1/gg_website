/* GG's durable SQLite store. Only the updater writes; builds read offline.
   The committed JSON/NDJSON files seed the first database without an API walk.
   A refresh commits every document and match together, so failures cannot
   advertise a fresh date on a partly updated database. Node 24+, zero deps. */
import { DatabaseSync } from "node:sqlite";
import { readFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATABASE_PATH = process.env.GG_DATABASE_PATH || path.join(ROOT, "data", "gg.sqlite");

export async function openStore(databasePath = DATABASE_PATH) {
  let exists = true;
  try { await stat(databasePath); }
  catch (error) { if (error.code !== "ENOENT") throw error; exists = false; }
  await mkdir(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  try {
    if (exists) {
      const version = database.prepare("PRAGMA user_version").get().user_version;
      if (version !== 1) throw new Error("Unsupported GG database schema: " + version);
      if (database.prepare("PRAGMA quick_check").get().quick_check !== "ok") throw new Error("GG database failed integrity check");
    } else {
      database.exec(`
        CREATE TABLE documents (name TEXT PRIMARY KEY, json TEXT NOT NULL CHECK(json_valid(json))) STRICT;
        CREATE TABLE matches (id TEXT PRIMARY KEY, date TEXT, json TEXT NOT NULL CHECK(json_valid(json))) STRICT;
        CREATE INDEX matches_by_date ON matches(date DESC);
        PRAGMA user_version = 1;
      `);
    }

    function getJson(name, fallback) {
      const row = database.prepare("SELECT json FROM documents WHERE name = ?").get(name);
      if (row) return JSON.parse(row.json);
      if (fallback !== undefined) return fallback;
      throw new Error("Missing database document: " + name);
    }

    function commit(documents, matches) {
      database.exec("BEGIN IMMEDIATE");
      try {
        const writeDocument = database.prepare("INSERT INTO documents VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET json = excluded.json");
        const writeMatch = database.prepare("INSERT INTO matches VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET date = excluded.date, json = excluded.json");
        for (const [name, value] of Object.entries(documents)) writeDocument.run(name, JSON.stringify(value));
        for (const match of matches.values()) {
          if (match.matchId == null || !Array.isArray(match.players)) throw new Error("Invalid stored match");
          writeMatch.run(String(match.matchId), match.finished || match.started || null, JSON.stringify(match));
        }
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    }

    if (!database.prepare("SELECT 1 FROM documents WHERE name = 'meta.json'").get()) {
      const raw = path.join(ROOT, "data", "raw");
      const documents = {};
      for (const name of ["meta.json", "roster.json", "profiles.json", "images.json", "countries.json"]) {
        documents[name] = JSON.parse(await readFile(path.join(raw, name), "utf8"));
      }
      for (const member of documents["roster.json"]) {
        const name = "players/" + member.profileId + ".json";
        documents[name] = JSON.parse(await readFile(path.join(raw, name), "utf8"));
      }
      const matches = new Map();
      for (const line of (await readFile(path.join(raw, "matches.ndjson"), "utf8")).split("\n")) {
        if (!line.trim()) continue;
        const match = JSON.parse(line);
        matches.set(String(match.matchId), match);
      }
      commit(documents, matches);
    }

    return {
      getJson,
      loadMatches: () => new Map(database.prepare("SELECT id, json FROM matches ORDER BY date DESC, id DESC").all().map(row => [row.id, JSON.parse(row.json)])),
      commit,
      close: () => database.close()
    };
  } catch (error) {
    database.close();
    throw error;
  }
}
