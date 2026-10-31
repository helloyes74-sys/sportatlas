#!/usr/bin/env node
// Lädt Pisten, Lifte, Loipen und Routen aus OpenStreetMap (Overpass) und legt sie als GeoJSON ab.
//
//   node scripts/fetch-osm.mjs                 alle Gebiete aller Regionen
//   node scripts/fetch-osm.mjs gerlitzen       nur dieses Gebiet (id)
//   node scripts/fetch-osm.mjs --type ski      nur eine Sportart
//   node scripts/fetch-osm.mjs --force         auch Gebiete neu laden, deren Datei jünger als 7 Tage ist
//
// Ergebnis: app/data/geo/<type>/<id>.geojson  (ohne Höhen; die kommen mit add-elevation.mjs)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { overpass, skiQuery, nordicQuery, routeQuery, toGeoJSON, skiKind } from "./lib/overpass.mjs";
import { shapeRoute, consolidatePistes, keepConnected } from "./lib/lines.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "app", "data");

const args = process.argv.slice(2);
const typeFilter = args.includes("--type") ? args[args.indexOf("--type") + 1] : null;
const force = args.includes("--force");
const ids = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--type");

const readJSON = async (p) => JSON.parse(await readFile(p, "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const regions = (await readJSON(path.join(DATA, "regions", "index.json"))).regions;
const GEO_INDEX = path.join(DATA, "geo", "index.json");
let geoIndex = {};
try { geoIndex = await readJSON(GEO_INDEX); } catch { /* noch keiner */ }
let done = 0;
for (const r of regions) {
  const region = await readJSON(path.join(DATA, r.file));
  for (const entry of region.areas) {
    if (typeFilter && entry.type !== typeFilter) continue;
    if (ids.length && !ids.includes(entry.id)) continue;
    const area = await readJSON(path.join(DATA, entry.file));
    if (area.osm?.none) { process.stderr.write(`${area.type}/${area.id}: in OSM nicht erfasst (osm.none), übersprungen\n`); continue; }
    const out = path.join(DATA, "geo", area.type, `${area.id}.geojson`);
    const have = geoIndex[`${area.type}/${area.id}`];
    // Überspringen, wenn frisch geladen – außer die osm-Angaben oder die Bounding-Box der Gebietsdatei haben
    // sich seit dem Laden geändert (Signatur im Index; Dateizeiten taugen nicht, z. B. nach einem git checkout)
    // SHAPE_VERSION hochzählen, wenn sich die Aufbereitung (keepConnected, consolidatePistes) ändert: dann werden
    // alle Ski- und Loipengebiete beim nächsten Lauf neu geladen
    const SHAPE_VERSION = area.type === "ski" || area.type === "xc" ? 2 : 1;
    const areaSig = JSON.stringify([area.osm || null, area.bbox || null, area.center || null, area.pistes_official?.items || null, SHAPE_VERSION]);
    const areaChanged = have ? have.area_sig !== areaSig : false;
    if (have && have.features > 0 && !force && !ids.length && !areaChanged && (Date.now() - Date.parse(have.fetched)) < 7 * 864e5) { process.stderr.write(`${area.type}/${area.id}: schon vom ${have.fetched}, übersprungen (--force lädt neu)\n`); continue; }
    await mkdir(path.dirname(out), { recursive: true });
    process.stderr.write(`${area.type}/${area.id}: lade …\n`);
    let query, kindOf;
    if (area.type === "ski") { query = skiQuery(area); kindOf = skiKind; }
    else if (area.type === "xc") { query = nordicQuery(area); kindOf = () => "xc"; }
    else { query = routeQuery(area); kindOf = () => (area.type === "bike" ? "bike" : "hike"); }
    try {
      const osm = await overpass(query);
      let fc = toGeoJSON(osm, kindOf);
      if (area.type === "bike" || area.type === "hike") fc = shapeRoute(fc, area);
      // OSM zerlegt Pisten und Loipen in viele Wege: zu Pisten des Pistenplans zusammenfassen,
      // namenlose Verbindungsstücke anhängen oder zu einer Linie „Verbindungswege“ zusammenlegen
      const official = area.pistes_official?.items || [];
      // Nachbargebiete in derselben Bounding-Box (Innerkrems neben Katschberg, Falkert neben Turrach) hängen
      // nicht mit den eigenen Liften zusammen und fliegen raus
      if (area.type === "ski") fc.features = keepConnected(fc.features, area.center);
      if (area.type === "ski") fc.features = consolidatePistes(fc.features, { kinds: ["piste", "xc"], official });
      if (area.type === "xc") fc.features = consolidatePistes(fc.features, { kinds: ["xc"], connectorLabel: "Verbindungsloipen", official });
      fc.meta = { area: area.id, type: area.type, fetched: new Date().toISOString().slice(0, 10), source: "OpenStreetMap-Mitwirkende, ODbL", features: fc.features.length };
      if (!fc.features.length) {
        process.stderr.write(`  0 Objekte: osm-Angaben (relation_ids, way_name, relation_name) oder Bounding-Box prüfen (${path.relative(ROOT, path.join(DATA, entry.file))}); „Routen prüfen.command“ listet Kandidaten\n`);
        delete geoIndex[`${area.type}/${area.id}`];
        await mkdir(path.dirname(GEO_INDEX), { recursive: true });
        await writeFile(GEO_INDEX, JSON.stringify(geoIndex, null, 2));
        await sleep(2500);
        continue;
      }
      await writeFile(out, JSON.stringify(fc));
      geoIndex[`${area.type}/${area.id}`] = { file: `geo/${area.type}/${area.id}.geojson`, features: fc.features.length, fetched: fc.meta.fetched, area_sig: areaSig };
      await mkdir(path.dirname(GEO_INDEX), { recursive: true });
      await writeFile(GEO_INDEX, JSON.stringify(geoIndex, null, 2));
      const kinds = fc.features.reduce((m, f) => ((m[f.properties.kind] = (m[f.properties.kind] || 0) + 1), m), {});
      process.stderr.write(`  ${fc.features.length} Objekte ${JSON.stringify(kinds)} → ${path.relative(ROOT, out)}\n`);
      done++;
    } catch (e) {
      process.stderr.write(`  FEHLER: ${e.message}\n`);
    }
    await sleep(2500); // Overpass fair use
  }
}
process.stderr.write(`Fertig: ${done} Dateien. Jetzt: node scripts/add-elevation.mjs\n`);
