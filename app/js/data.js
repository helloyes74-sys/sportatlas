// Laden der Daten: Regionen-Index → Region → Gebiete (Stammdaten) → GeoJSON (OSM + Höhen).
// Alles liegt als statische Dateien unter data/; nichts davon braucht einen Server mit Logik.

import { pisteDifficulty, hikeDifficulty, durationClass, gradeClass } from "./geo.js";

const BASE = new URL("../data/", import.meta.url);
const cache = new Map();

async function getJSON(rel) {
  if (cache.has(rel)) return cache.get(rel);
  const p = fetch(new URL(rel, BASE)).then(async (r) => {
    if (!r.ok) throw Object.assign(new Error(`${rel}: HTTP ${r.status}`), { status: r.status });
    return r.json();
  });
  cache.set(rel, p);
  p.catch(() => cache.delete(rel));
  return p;
}

/** Liste der Regionen (Bundesländer). */
export const listRegions = async () => (await getJSON("regions/index.json")).regions;

/** Region mit allen Gebieten (Stammdaten bereits nachgeladen). */
export async function loadRegion(id) {
  const regions = await listRegions();
  const entry = regions.find((r) => r.id === id) || regions[0];
  const region = await getJSON(entry.file);
  const areas = await Promise.all(region.areas.map(async (a) => ({ ...(await getJSON(a.file)), file: a.file })));
  return { ...region, areas };
}

/** Verzeichnis der vorhandenen GeoJSON-Dateien (schreibt fetch-osm.mjs); leer, wenn noch nichts geladen wurde. */
export async function geoIndex() {
  try { return await getJSON("geo/index.json"); } catch (e) { if (e.status === 404) return {}; throw e; }
}

/** GeoJSON eines Gebiets oder null, wenn die Skripte für dieses Gebiet noch nicht gelaufen sind. */
export async function loadGeo(area) {
  const idx = await geoIndex();
  const entry = idx[`${area.type}/${area.id}`];
  if (!entry) return null;
  try {
    const fc = await getJSON(entry.file);
    fc.features.forEach(normalizeFeature);
    return fc;
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

/** Fehlende abgeleitete Felder ergänzen, damit die App auch mit rohen OSM-Daten (ohne add-elevation) sauber anzeigt. */
export function normalizeFeature(f) {
  const p = f.properties;
  if (p.kind === "piste" && !p.difficulty) p.difficulty = pisteDifficulty(p);
  if (p.kind === "hike") {
    if (!p.difficulty) p.difficulty = hikeDifficulty(p);
    if (!p.duration_class && p.time_min) p.duration_class = durationClass(p.time_min);
  }
  if (p.kind === "bike" && !p.grade_class && p.steepest_climb != null) p.grade_class = gradeClass(p.steepest_climb);
  // Anzeigename: OSM-Namen enthalten oft die Nummer schon ("Feuerbergabfahrt 20") – dann nicht doppelt zeigen
  const name = p.name || p["piste:name"] || "";
  const ref = p.ref || p["piste:ref"] || "";
  p.display_name = name ? (ref && !name.includes(ref) ? `${ref} · ${name}` : name) : (ref ? `Nr. ${ref}` : "ohne Namen");
  return f;
}

/** Saisonstatus eines Skigebiets relativ zu heute. */
export function seasonState(area, today = new Date()) {
  if (!area.season?.from) return null;
  const f = new Date(area.season.from + "T00:00:00"), t = new Date(area.season.to + "T23:59:59");
  if (today >= f && today <= t) return { cls: "on", text: `In Saison bis ${fmtDate(area.season.to)}` };
  if (today < f) { const d = Math.ceil((f - today) / 864e5); return { cls: "soon", text: `Start ${fmtDate(area.season.from)} · in ${d} Tagen`, days: d }; }
  return { cls: "off", text: "Saison beendet" };
}

export const fmtDate = (iso) => { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y.slice(2)}`; };
export const fmtKm = (m) => (m / 1000).toLocaleString("de-AT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " km";
export const fmtNum = (n, d = 0) => (n == null ? "–" : n.toLocaleString("de-AT", { minimumFractionDigits: d, maximumFractionDigits: d }));
export const fmtEur = (n) => (n == null ? "–" : "€ " + fmtNum(n, n % 1 ? 2 : 0));
export const fmtTime = (min) => (min == null ? "–" : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")} h`);

/** Sportorte aus OSM mit Katalog der Sportarten (schreibt build-sportorte.mjs); null, wenn die Datei fehlt. */
export async function loadSpots(id) {
  try { return await getJSON(`sportorte/${id}.json`); } catch (e) { if (e.status === 404) return null; throw e; }
}
