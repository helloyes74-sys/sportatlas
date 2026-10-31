// Baut aus den rohen OSM-Sportorten (data/sportorte-raw/<land>.json) die App-Datei
// app/data/sportorte/<land>.json: nur Sportarten aus dem Katalog, Plätze eines Clubs zusammengefasst.
// Läuft ohne Netz. Aufruf: node scripts/build-sportorte.mjs [kaernten]

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildPlaces, catalogFor, sportById } from "./lib/sports.mjs";

export async function build(key = "kaernten") {
  const raw = JSON.parse(await readFile(`data/sportorte-raw/${key}.json`, "utf8"));
  const places = buildPlaces(raw.orte);
  const catalog = catalogFor(places);
  await mkdir("app/data/sportorte", { recursive: true });
  await writeFile(`app/data/sportorte/${key}.json`, JSON.stringify({ land: raw.land, stand: raw.stand, quelle: raw.quelle, catalog, places }) + "\n");

  let md = `# Sportorte ${raw.land}\n\nStand der OSM-Daten: ${raw.stand} · ${places.length} Orte. Benachbarte Plätze einer Sportart (z. B. Courts eines Clubs) zählen als ein Ort.\n\n`;
  for (const g of catalog) {
    md += `## ${g.group}\n\n`;
    for (const s of g.sports) {
      if (s.route) { md += `- ${s.label}: eigener Bereich mit Gebieten/Routen\n`; continue; }
      const named = places.filter((p) => p.s === s.id && p.name).slice(0, 4).map((p) => p.name + (p.courts ? ` (${p.courts} Plätze)` : ""));
      md += `- ${s.label}: ${s.count}${named.length ? ` – z. B. ${named.join(", ")}` : ""}\n`;
    }
    md += "\n";
  }
  await writeFile(`app/data/sportorte/${key}.md`, md);
  console.error(`App-Datei: ${places.length} Orte in ${catalog.reduce((n, g) => n + g.sports.filter((s) => !s.route).length, 0)} Sportarten.`);
  return { places, catalog, sportById };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await build(process.argv[2] || "kaernten");
