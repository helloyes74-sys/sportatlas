// Overpass-Abfragen mit Spiegel-Wechsel und Wiederholung. Nur Node-Bordmittel.
// Ausgabe immer mit `out geom;` (nicht `out tags geom;`): die Stufe „tags“ lässt bei Relationen die
// Mitgliederliste weg, dann kommen Routen ohne Geometrie zurück (0 Objekte).

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Führt eine Overpass-QL-Abfrage aus und gibt das JSON zurück. */
export async function overpass(query, { tries = 6, log = console.error } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < tries; attempt++) {
    const url = ENDPOINTS[attempt % ENDPOINTS.length];
    const wait = Math.min(60000, 5000 * 2 ** Math.floor(attempt / ENDPOINTS.length) * (1 + attempt % ENDPOINTS.length));
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "sportatlas/0.1 (OSM-Daten fuer eine private Sport-App)" },
        body: "data=" + encodeURIComponent(query),
        signal: AbortSignal.timeout(150000),
      });
      if (res.status === 429 || res.status === 504 || res.status === 502 || res.status === 503) {
        log(`  ${url}: HTTP ${res.status} (Server ausgelastet), nächster Versuch in ${Math.round(wait / 1000)} s …`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      const json = await res.json();
      // Overpass meldet Zeit- oder Speicherüberschreitung als HTTP 200 mit leerem Ergebnis und "remark"
      if (json.remark && /timed out|out of memory|runtime error/i.test(json.remark)) throw new Error(`${url}: ${json.remark}`);
      return json;
    } catch (e) {
      lastErr = e;
      log(`  Fehler bei ${url}: ${e.message}; nächster Versuch in ${Math.round(wait / 1000)} s …`);
      await sleep(wait);
    }
  }
  throw lastErr || new Error("Overpass nicht erreichbar");
}

const bboxStr = ([w, s, e, n]) => `${s},${w},${n},${e}`; // Overpass will S,W,N,E

/** Abfrage für ein Skigebiet: Pisten, Lifte, Loipen in der Bounding-Box oder einer Site-Relation. */
export function skiQuery(area) {
  const bb = bboxStr(area.osm?.bbox || area.bbox);
  if (area.osm?.site_relation) {
    return `[out:json][timeout:120];
rel(${area.osm.site_relation});map_to_area->.a;
(
  way["piste:type"~"^(downhill|nordic|skitour|sled)$"](area.a);
  relation["piste:type"~"^(downhill|nordic)$"](area.a);
  way["aerialway"]["aerialway"!~"^(zip_line|goods|station)$"](area.a);
);
out geom;`;
  }
  return `[out:json][timeout:120];
(
  way["piste:type"~"^(downhill|nordic|skitour|sled)$"](${bb});
  relation["piste:type"~"^(downhill|nordic)$"](${bb});
  way["aerialway"]["aerialway"!~"^(zip_line|goods|station)$"](${bb});
);
out geom;`;
}

/** Abfrage für Loipen (Langlauf) in der Bounding-Box. */
export function nordicQuery(area) {
  const bb = bboxStr(area.osm?.bbox || area.bbox);
  return `[out:json][timeout:120];
(
  way["piste:type"="nordic"](${bb});
  relation["piste:type"="nordic"](${bb});
);
out geom;`;
}

/** Abfrage für Routen (Rad, MTB, Wandern). Reihenfolge der Quellen in der Gebietsdatei (osm):
 *   relation_ids / relation_id  – bestimmte OSM-Relationen (aus Routen-Check.txt), zuverlässigste Variante
 *   way_name / way_ref          – Straßen oder Wege nach Name bzw. Referenz in der Bounding-Box
 *                                 (Passstraßen, Klammsteige ohne Routen-Relation)
 *   relation_name               – regulärer Ausdruck für den Relationsnamen in der Bounding-Box;
 *                                 ohne Angabe gilt der Gebietsname wörtlich. */
export function routeQuery(area) {
  const bb = bboxStr(area.osm?.bbox || area.bbox);
  const ids = area.osm?.relation_ids || (area.osm?.relation_id ? [area.osm.relation_id] : null);
  if (ids?.length) return `[out:json][timeout:180];relation(id:${ids.join(",")});out geom;`;
  if (area.osm?.way_name || area.osm?.way_ref) {
    // beide Angaben sind reguläre Ausdrücke; mit Name und Referenz zugleich gilt die Vereinigung
    const sels = [];
    if (area.osm.way_name) sels.push(`way["highway"]["name"~"${area.osm.way_name}",i](${bb});`);
    if (area.osm.way_ref) sels.push(`way["highway"]["ref"~"${area.osm.way_ref}"](${bb});`);
    return `[out:json][timeout:180];(${sels.join("")});out geom;`;
  }
  const route = area.osm?.route || (area.type === "bike" ? "bicycle" : "hiking");
  const routeRe = route === "hiking" ? "^(hiking|foot)$" : route === "bicycle" ? "^(bicycle|mtb)$" : `^${route}$`;
  const name = area.osm?.relation_name || area.name.replace(/[.*+?^${}()|[\]]/g, ".");
  return `[out:json][timeout:240][maxsize:1073741824];
relation["route"~"${routeRe}"]["name"~"${name}",i](${bb});
out geom;`;
}

/** Overpass-Elemente (mit geom) → GeoJSON-FeatureCollection. */
export function toGeoJSON(osm, kindOf) {
  const features = [];
  for (const el of osm.elements || []) {
    const tags = el.tags || {};
    let geometry = null;
    if (el.type === "way" && el.geometry?.length > 1) {
      const coords = el.geometry.map((p) => [p.lon, p.lat]);
      const closed = coords.length > 3 && coords[0][0] === coords.at(-1)[0] && coords[0][1] === coords.at(-1)[1];
      // Geschlossene Wege sind nur dann Flächen, wenn OSM das sagt (Pistenflächen tragen area=yes);
      // Rundloipen bleiben Linien.
      const isArea = closed && (tags.area === "yes" || tags.landuse || tags.natural);
      geometry = isArea ? { type: "Polygon", coordinates: [coords] } : { type: "LineString", coordinates: coords };
    } else if (el.type === "relation" && el.members?.length) {
      const lines = el.members.filter((m) => m.type === "way" && m.geometry?.length > 1 && m.role !== "platform").map((m) => m.geometry.map((p) => [p.lon, p.lat]));
      if (!lines.length) continue;
      geometry = lines.length === 1 ? { type: "LineString", coordinates: lines[0] } : { type: "MultiLineString", coordinates: lines };
    }
    if (!geometry) continue;
    features.push({
      type: "Feature",
      id: `${el.type}/${el.id}`,
      properties: { osm_type: el.type, osm_id: el.id, kind: kindOf(tags), ...tags },
      geometry,
    });
  }
  return { type: "FeatureCollection", features };
}

/** Art eines Elements im Skigebiet. */
export function skiKind(tags) {
  if (tags.aerialway) return "lift";
  if (tags["piste:type"] === "nordic") return "xc";
  if (tags["piste:type"] === "skitour") return "skitour";
  if (tags["piste:type"] === "sled") return "sled";
  return "piste";
}
