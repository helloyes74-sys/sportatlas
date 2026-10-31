#!/usr/bin/env node
// Reichert GeoJSON-Linien mit Höhen an und berechnet Profil-Kennzahlen: Länge, Höhenmeter,
// Gefälle je 100 m, Gehzeit.
//
//   node scripts/add-elevation.mjs                alle app/data/geo/**/*.geojson
//   node scripts/add-elevation.mjs gerlitzen      nur Dateien, deren Name die id enthält
//   node scripts/add-elevation.mjs --open-meteo   Höhen von der Open-Meteo-API statt aus Geländekacheln
//
// Standardquelle sind die Terrarium-Geländekacheln (AWS Terrain Tiles), dieselben, aus denen die App
// das 3D-Relief zeichnet: kein Schlüssel, kein Rate-Limit, Kacheln werden in app/data/cache/tiles/
// abgelegt. Open-Meteo bleibt als Alternative (Cache in app/data/cache/elevation.json).

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resample, profileParts, hikingMinutes, pisteDifficulty, hikeDifficulty, durationClass, gradeClass } from "../app/js/geo.js";
import { TerrainSampler } from "./lib/terrain.mjs";
import { orderParts } from "./lib/lines.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GEO = path.join(ROOT, "app", "data", "geo");
const CACHE_DIR = path.join(ROOT, "app", "data", "cache");
const CACHE_FILE = path.join(CACHE_DIR, "elevation.json");
const STEP_M = 40;          // Abtastung entlang der Linie
const MAX_PTS = 600;        // Obergrenze je Linie (lange Fernwanderwege werden gröber abgetastet)
const BATCH = 100;          // Open-Meteo erlaubt bis zu 100 Koordinaten je Anfrage
const args = process.argv.slice(2);
const useOpenMeteo = args.includes("--open-meteo");
const filter = args.filter((a) => !a.startsWith("--"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (c) => `${c[1].toFixed(4)},${c[0].toFixed(4)}`;

const terrain = new TerrainSampler({ zoom: 13, cacheDir: path.join(CACHE_DIR, "tiles"), log: (m) => process.stderr.write(m + "\n") });
let cache = {};
if (useOpenMeteo) { try { cache = JSON.parse(await readFile(CACHE_FILE, "utf8")); } catch { /* noch kein Cache */ } }
let requests = 0;

async function fetchOpenMeteo(coords) {
  const missing = [...new Map(coords.filter((c) => !(key(c) in cache)).map((c) => [key(c), c])).values()];
  for (let i = 0; i < missing.length; i += BATCH) {
    const chunk = missing.slice(i, i + BATCH);
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${chunk.map((c) => c[1].toFixed(5)).join(",")}&longitude=${chunk.map((c) => c[0].toFixed(5)).join(",")}`;
    let res;
    for (let t = 0; t < 4; t++) {
      res = await fetch(url, { headers: { "User-Agent": "sportatlas/0.1" } });
      requests++;
      if (res.status === 429) { process.stderr.write("  Rate-Limit, warte 20 s …\n"); await sleep(20000); continue; }
      break;
    }
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}: ${await res.text()}`);
    const { elevation } = await res.json();
    chunk.forEach((c, j) => { cache[key(c)] = elevation[j]; });
    await sleep(1200);
  }
  return coords.map((c) => [c[0], c[1], cache[key(c)]]);
}

const fetchElevations = (coords) => (useOpenMeteo ? fetchOpenMeteo(coords) : terrain.elevations(coords));

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith(".geojson")) yield p;
  }
}

function lineParts(geometry) {
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  return null;
}

// Gebietsdateien (Stammdaten) nach id: Laufrichtung und Niveau der Routen hängen von der Tour-Art ab
const areas = new Map();
try {
  const { regions } = JSON.parse(await readFile(path.join(ROOT, "app", "data", "regions", "index.json"), "utf8"));
  for (const r of regions) {
    const region = JSON.parse(await readFile(path.join(ROOT, "app", "data", r.file), "utf8"));
    for (const e of region.areas) { try { areas.set(`${e.type}/${e.id}`, JSON.parse(await readFile(path.join(ROOT, "app", "data", e.file), "utf8"))); } catch { /* fehlt */ } }
  }
} catch { /* ohne Regionen geht es auch, nur ohne Tour-Art */ }

/** Laufrichtung einer Route: Wanderungen und Rennrad-Anstiege bergauf, Flow Trails bergab, Radwege/Etappen so
 *  wie die Linie kommt (Drauradweg flussabwärts). */
function orientFor(area, f) {
  if (f.properties.orient) return f.properties.orient;
  if (!area) return null;
  if (area.type === "hike") return "uphill";
  if (area.type === "bike" && /anstieg|pass/i.test(area.kind || "")) return "uphill";
  if (area.type === "bike" && /flow|trail|downhill/i.test(area.kind || "")) return "downhill";
  return null;
}

/** Tunnelabschnitte (Portal-Koordinaten aus OSM) geradlinig überbrücken: das Geländemodell kennt nur die
 *  Bergoberfläche, nicht die Straße darunter. */
function bridgeTunnels(parts, tunnels) {
  for (const [a, b] of tunnels || []) {
    for (const pts of parts) {
      const near = (q) => { let bi = -1, bd = Infinity; pts.forEach((p, i) => { const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2; if (d < bd) { bd = d; bi = i; } }); return bd < 1e-6 ? bi : -1; };
      let ia = near(a), ib = near(b);
      if (ia < 0 || ib < 0) continue;
      if (ia > ib) [ia, ib] = [ib, ia];
      const ea = pts[ia][2], eb = pts[ib][2];
      for (let i = ia + 1; i < ib; i++) pts[i][2] = ea + ((eb - ea) * (i - ia)) / (ib - ia);
    }
  }
}

let files = 0;
for await (const file of walk(GEO)) {
  if (filter.length && !filter.some((f) => file.includes(f))) continue;
  const fc = JSON.parse(await readFile(file, "utf8"));
  const area = fc.meta?.area ? areas.get(`${fc.meta.type}/${fc.meta.area}`) : null;
  process.stderr.write(`${path.relative(ROOT, file)}: ${fc.features.length} Objekte\n`);
  for (const f of fc.features) {
    let parts = lineParts(f.geometry);
    if (!parts) continue;
    // Teilstücke in Laufrichtung ordnen (Lücken aus OSM), bevor Höhen und Profil berechnet werden
    if (parts.length > 1) parts = orderParts(parts);
    let newParts = [];
    for (const coords of parts) {
      let step = STEP_M;
      let pts = resample(coords, step);
      while (pts.length > MAX_PTS) { step *= 2; pts = resample(coords, step); }
      newParts.push(await fetchElevations(pts));
    }
    bridgeTunnels(newParts, f.properties.tunnels);
    // Laufrichtung: Wege aus OSM haben keine; Wanderungen und Anstiege bergauf, Flow Trails bergab lesen
    const orient = orientFor(area, f);
    if (orient && newParts.length) {
      const first = newParts[0][0], last = newParts[newParts.length - 1].slice(-1)[0];
      const wrong = orient === "uphill" ? (first[2] ?? 0) > (last[2] ?? 0) : (first[2] ?? 0) < (last[2] ?? 0);
      if (wrong) newParts = newParts.reverse().map((p) => p.slice().reverse());
    }
    f.geometry = newParts.length === 1 ? { type: "LineString", coordinates: newParts[0] } : { type: "MultiLineString", coordinates: newParts };
    // Profil je Teilstück, dann zusammengezählt (Lücken zählen nicht als Strecke)
    const p = profileParts(newParts, 100);
    const props = f.properties;
    Object.assign(props, {
      length_m: p.length_m, ascent_m: p.ascent_m, descent_m: p.descent_m, top_m: p.top_m, bottom_m: p.bottom_m,
      avg_grade: p.avg_grade, max_grade: p.max_grade, min_grade: p.min_grade, segments: p.segments,
    });
    if (props.kind === "piste") {
      props.difficulty = pisteDifficulty(props);
      // Gefälle einer Piste: in Laufrichtung meist bergab, also Betrag des stärksten Abschnitts
      props.max_descent_grade = Math.round(Math.max(0, -p.min_grade, 0));
    }
    if (props.kind === "hike") {
      props.difficulty = hikeDifficulty(props);
      // ohne sac_scale in OSM: Niveau aus der Tourenbeschreibung des Gebiets (1 leicht, 2 mittel, ab 3 schwer)
      if ((!props.difficulty || props.difficulty === "unknown") && area?.difficulty) props.difficulty = area.difficulty <= 1 ? "easy" : area.difficulty === 2 ? "medium" : "hard";
      props.time_min = hikingMinutes(p.length_m, p.ascent_m, p.descent_m);
      props.duration_class = durationClass(props.time_min);
    }
    if (props.kind === "bike") {
      const climbs = p.segments.filter((s) => s.g > 0).map((s) => s.g);
      props.steepest_climb = climbs.length ? Math.max(...climbs) : 0;
      props.grade_class = gradeClass(props.steepest_climb);
    }
  }
  fc.meta = { ...(fc.meta || {}), elevation: useOpenMeteo ? "Open-Meteo Elevation API (Copernicus DEM GLO-90)" : "Terrain Tiles (Terrarium, Zoom 13)", enriched: new Date().toISOString().slice(0, 10) };
  await writeFile(file, JSON.stringify(fc));
  if (useOpenMeteo) { await mkdir(CACHE_DIR, { recursive: true }); await writeFile(CACHE_FILE, JSON.stringify(cache)); }
  files++;
}
process.stderr.write(useOpenMeteo
  ? `Fertig: ${files} Dateien, ${requests} Höhen-Anfragen, ${Object.keys(cache).length} Punkte im Cache.\n`
  : `Fertig: ${files} Dateien, ${terrain.downloads} Geländekacheln neu geladen, ${terrain.tiles.size} im Speicher.\n`);
