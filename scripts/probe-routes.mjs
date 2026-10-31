#!/usr/bin/env node
// Prüft, welche Wander- und Radrouten als Relationen in OpenStreetMap vorhanden sind.
//
//   node scripts/probe-routes.mjs            alle route=hiking/foot/bicycle/mtb-Relationen im Bundesland
//                                            (nur Tags, keine Geometrie) → app/data/cache/osm-routes.json
//                                            und eine lesbare Liste je Gebiet → Routen-Check.txt
//
// Das Skript lädt nichts in die App; es hilft nur, in den Gebietsdateien die richtige
// osm.relation_id bzw. osm.relation_name zu setzen.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { overpass } from "./lib/overpass.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "app", "data");
const CACHE = path.join(DATA, "cache", "osm-routes.json");
const OUT = path.join(ROOT, "Routen-Check.txt");
const log = (m) => process.stderr.write(m + "\n");

const { regions } = JSON.parse(await readFile(path.join(DATA, "regions", "index.json"), "utf8"));
const region = JSON.parse(await readFile(path.join(DATA, regions[0].file), "utf8"));
const [w, s, e, n] = region.bbox;

let osm;
try {
  osm = JSON.parse(await readFile(CACHE, "utf8"));
  log(`Verwende Zwischenspeicher ${path.relative(ROOT, CACHE)} (${osm.elements.length} Relationen, Stand ${osm.fetched})`);
} catch {
  log(`Frage Overpass nach allen Routen-Relationen in ${region.name} …`);
  const q = `[out:json][timeout:180];
relation["route"~"^(hiking|foot|bicycle|mtb)$"](${s},${w},${n},${e});
out tags;`;
  osm = await overpass(q);
  osm.fetched = new Date().toISOString().slice(0, 10);
  await mkdir(path.dirname(CACHE), { recursive: true });
  await writeFile(CACHE, JSON.stringify(osm));
  log(`${osm.elements.length} Relationen gespeichert.`);
}

const norm = (t) => (t || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
const STOP = new Set(["von", "der", "die", "das", "zum", "zur", "und", "am", "im", "auf", "den", "dem", "des", "mit", "ueber", "nach", "bei", "aus", "runde", "rundweg", "rundwanderweg", "wanderung", "weg", "trail", "tour", "etappe", "radweg", "see", "alpe", "huette", "gipfel", "kaernten"]);
const words = (name) => norm(name).split(/[^a-z0-9]+/).filter((x) => x.length > 2 && !STOP.has(x));

const lines = [`Routen-Check ${new Date().toISOString().slice(0, 16).replace("T", " ")} – ${osm.elements.length} Routen-Relationen in ${region.name} (OSM, Stand ${osm.fetched})`, ""];
for (const entry of region.areas.filter((a) => a.type === "hike" || a.type === "bike")) {
  const a = JSON.parse(await readFile(path.join(DATA, entry.file), "utf8"));
  const want = a.type === "bike" ? ["bicycle", "mtb"] : ["hiking", "foot"];
  const keys = [...new Set([...words(a.name), ...words(a.osm?.search || "")])];
  const re = a.osm?.relation_name ? new RegExp(a.osm.relation_name, "i") : null;
  const hits = osm.elements
    .filter((r) => want.includes(r.tags?.route))
    .map((r) => {
      const t = r.tags || {};
      const hay = norm(`${t.name || ""} ${t["name:de"] || ""} ${t.ref || ""} ${t.description || ""} ${t.from || ""} ${t.to || ""}`);
      let score = keys.filter((k) => hay.includes(k)).length;
      if (re && (re.test(t.name || "") || re.test(t.ref || ""))) score += 3;
      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, 8);
  lines.push(`## ${a.name}  [${a.type}/${a.id}]  ${a.osm?.relation_id ? `(relation_id ${a.osm.relation_id} gesetzt)` : ""}`);
  if (!hits.length) lines.push("   keine passende Relation gefunden");
  for (const { r, score } of hits) {
    const t = r.tags;
    lines.push(`   ${score}  rel ${r.id}  ${t.name || "(ohne Name)"}${t.ref ? ` [${t.ref}]` : ""}  route=${t.route}${t.network ? ` ${t.network}` : ""}${t.distance ? ` ${t.distance} km` : ""}${t.osmc_symbol || t["osmc:symbol"] ? ` ${t["osmc:symbol"]}` : ""}${t.operator ? ` – ${t.operator}` : ""}`);
  }
  lines.push("");
}
await writeFile(OUT, lines.join("\n"));
log(`Liste geschrieben: ${path.relative(ROOT, OUT)}`);
