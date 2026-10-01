/* Publish only browser assets and the generated snapshot. The database,
   source seed, scripts and Git metadata never enter the Pages artifact. */
import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./store.mjs";

const output = path.join(ROOT, "dist");
const meta = JSON.parse(await readFile(path.join(ROOT, "data/public/meta.json"), "utf8"));
if (!meta.updatedAt || !meta.pages) throw new Error("Build the snapshot before packaging");
await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, "data"), { recursive: true });
await cp(path.join(ROOT, "index.html"), path.join(output, "index.html"));
await cp(path.join(ROOT, "assets"), path.join(output, "assets"), { recursive: true });
await cp(path.join(ROOT, "data/public"), path.join(output, "data/public"), { recursive: true });
await writeFile(path.join(output, ".nojekyll"), "");
console.log("Packaged dist/ with snapshot from " + meta.updatedAt);
