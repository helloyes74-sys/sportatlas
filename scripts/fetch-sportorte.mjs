// Lädt alle Sportorte eines Bundeslandes aus OpenStreetMap (sport=* und Sport-leisure=*),
// teilt sie nach Sportart ein und schreibt app/data/sportorte/<land>.json plus eine Übersicht.
// Aufruf: node scripts/fetch-sportorte.mjs [kaernten]

import { writeFile, mkdir } from "node:fs/promises";
import { overpass } from "./lib/overpass.mjs";
import { sportsOf, summarize, LEISURE_SPORTS, GROUPS } from "./lib/sports.mjs";

const LAENDER = { kaernten: { iso: "AT-2", name: "Kärnten" } };
const key = process.argv[2] || "kaernten";
const land = LAENDER[key];
if (!land) throw new Error(`Unbekanntes Land: ${key}`);

const query = `[out:json][timeout:300];
area["ISO3166-2"="${land.iso}"]["admin_level"="4"]->.a;
(
  nwr["sport"](area.a);
  nwr["leisure"~"^(${LEISURE_SPORTS.join("|")})$"](area.a);
);
out center tags;`;

console.error(`Lade Sportorte in ${land.name} …`);
const osm = await overpass(query);

const orte = [];
let privat = 0;
for (const el of osm.elements) {
  const t = el.tags || {};
  if (/^(private|no)$/.test(t.access || "")) { privat++; continue; }
  // Gartenpools ohne Namen und ohne Sport-Tag sind keine Sportorte
  if (t.leisure === "swimming_pool" && !t.sport && !t.name) continue;
  const sports = sportsOf(t);
  if (!sports.length) continue;
  const lon = el.lon ?? el.center?.lon, lat = el.lat ?? el.center?.lat;
  if (lon == null) continue;
  const o = { id: `${el.type[0]}${el.id}`, lon: +lon.toFixed(5), lat: +lat.toFixed(5), sports };
  if (t.name) o.name = t.name;
  if (t.leisure) o.leisure = t.leisure;
  if (t.access) o.access = t.access;
  if (t.covered === "yes" || t.indoor === "yes" || t.building) o.indoor = true;
  if (t.surface) o.surface = t.surface;
  if (t.opening_hours) o.hours = t.opening_hours;
  if (t.website || t["contact:website"]) o.web = t.website || t["contact:website"];
  if (t.fee) o.fee = t.fee;
  orte.push(o);
}

const summary = summarize(orte);
const order = [...Object.keys(GROUPS), "Sonstiges"].filter((g) => summary[g]);
const stand = new Date().toISOString().slice(0, 10);

await mkdir("app/data/sportorte", { recursive: true });
await writeFile(`app/data/sportorte/${key}.json`, JSON.stringify({
  land: land.name, stand, quelle: "© OpenStreetMap-Mitwirkende (ODbL)", summary, orte,
}) + "\n");

let md = `# Sportorte ${land.name} aus OpenStreetMap\n\nStand: ${stand} · ${orte.length} öffentliche Orte (${privat} private ausgelassen). Ein Ort kann mehrere Sportarten haben.\n\n`;
for (const g of order) {
  const s = summary[g];
  md += `## ${g} – ${s.total} Orte\n\n`;
  for (const [sp, n] of Object.entries(s.sports).sort((a, b) => b[1] - a[1])) {
    const named = orte.filter((o) => o.sports.includes(sp) && o.name).slice(0, 4).map((o) => o.name);
    md += `- ${sp}: ${n}${named.length ? ` (z. B. ${named.join(", ")})` : ""}\n`;
  }
  md += "\n";
}
await writeFile(`app/data/sportorte/${key}.md`, md);
console.error(`${orte.length} Orte in ${order.length} Gruppen geschrieben.`);
for (const g of order) console.error(`  ${g}: ${summary[g].total}`);
