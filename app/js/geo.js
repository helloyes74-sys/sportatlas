// Geo-Mathematik, geteilt zwischen App (Browser) und Skripten (Node).
// Koordinaten sind [lon, lat] oder [lon, lat, ele] wie in GeoJSON.

const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

/** Abstand zweier Punkte in Metern (Haversine). */
export function haversine(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Horizontale Länge einer Linie in Metern. */
export function lineLength(coords) {
  let m = 0;
  for (let i = 1; i < coords.length; i++) m += haversine(coords[i - 1], coords[i]);
  return m;
}

/**
 * Linie in gleichmäßige Abstände zerlegen. Start- und Endpunkt bleiben erhalten,
 * dazwischen liegt alle `stepM` Meter ein Punkt. Vorhandene Höhen werden linear interpoliert.
 */
export function resample(coords, stepM = 40) {
  if (coords.length < 2) return coords.slice();
  const out = [coords[0].slice()];
  let carry = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i];
    const seg = haversine(a, b);
    if (seg === 0) continue;
    let d = stepM - carry;
    while (d < seg) {
      const t = d / seg;
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (a.length > 2 && b.length > 2) p.push(a[2] + (b[2] - a[2]) * t);
      out.push(p);
      d += stepM;
    }
    carry = seg - (d - stepM);
  }
  const last = coords[coords.length - 1];
  const prev = out[out.length - 1];
  if (haversine(prev, last) > 1) out.push(last.slice());
  else out[out.length - 1] = last.slice();
  return out;
}

/** Gleitender Mittelwert über Höhen (Fenster 3), dämpft Rauschen des Höhenmodells. */
export function smoothElevations(coords) {
  return coords.map((c, i) => {
    if (c.length < 3 || i === 0 || i === coords.length - 1) return c;
    const a = coords[i - 1][2], b = c[2], d = coords[i + 1][2];
    return [c[0], c[1], (a + b + d) / 3];
  });
}

/**
 * Höhenprofil und Kennzahlen einer Linie mit Höhen.
 * Abschnitte (`segments`) sind je `segM` Meter horizontal; `grade` in Prozent, in Laufrichtung
 * (positiv bergauf, negativ bergab).
 */
export function profile(coords3, segM = 100) {
  const pts = smoothElevations(coords3.filter((c) => c.length > 2 && Number.isFinite(c[2])));
  const empty = { length_m: 0, length3d_m: 0, ascent_m: 0, descent_m: 0, top_m: null, bottom_m: null, avg_grade: 0, max_grade: 0, min_grade: 0, segments: [] };
  if (pts.length < 2) return empty;
  let length = 0, length3d = 0, asc = 0, desc = 0;
  let top = -Infinity, bottom = Infinity;
  const segments = [];
  let segD = 0, segDh = 0;
  for (let i = 0; i < pts.length; i++) {
    const e = pts[i][2];
    if (e > top) top = e;
    if (e < bottom) bottom = e;
    if (i === 0) continue;
    const d = haversine(pts[i - 1], pts[i]);
    const dh = e - pts[i - 1][2];
    length += d;
    length3d += Math.hypot(d, dh);
    if (dh > 0) asc += dh; else desc -= dh;
    segD += d; segDh += dh;
    if (segD >= segM || i === pts.length - 1) {
      if (segD > 0) segments.push({ d: Math.round(segD), g: +((segDh / segD) * 100).toFixed(1), e: Math.round(e) });
      segD = 0; segDh = 0;
    }
  }
  const grades = segments.map((s) => s.g);
  return {
    length_m: Math.round(length),
    length3d_m: Math.round(length3d),
    ascent_m: Math.round(asc),
    descent_m: Math.round(desc),
    top_m: Math.round(top),
    bottom_m: Math.round(bottom),
    avg_grade: length ? +(((pts[pts.length - 1][2] - pts[0][2]) / length) * 100).toFixed(1) : 0,
    max_grade: grades.length ? Math.max(...grades) : 0,
    min_grade: grades.length ? Math.min(...grades) : 0,
    segments,
  };
}

/**
 * Profil über mehrere Teilstücke (MultiLineString): jedes Teil für sich, dann zusammengezählt.
 * Die Lücke zwischen zwei Teilen zählt weder als Strecke noch als Steigung – sonst macht ein
 * Sprung von 60 m Luftlinie mit 40 m Höhenunterschied aus einer Passstraße eine 445-%-Rampe.
 */
export function profileParts(parts, segM = 100) {
  const ps = parts.map((p) => profile(p, segM)).filter((p) => p.length_m > 0);
  if (!ps.length) return profile([], segM);
  if (ps.length === 1) return ps[0];
  const segments = ps.flatMap((p) => p.segments);
  const grades = segments.map((s) => s.g);
  const length = ps.reduce((s, p) => s + p.length_m, 0);
  const firstPart = parts.find((p) => p.length > 1 && Number.isFinite(p[0][2]));
  const lastPart = [...parts].reverse().find((p) => p.length > 1 && Number.isFinite(p[p.length - 1][2]));
  return {
    length_m: length,
    length3d_m: ps.reduce((s, p) => s + p.length3d_m, 0),
    ascent_m: ps.reduce((s, p) => s + p.ascent_m, 0),
    descent_m: ps.reduce((s, p) => s + p.descent_m, 0),
    top_m: Math.max(...ps.map((p) => p.top_m)),
    bottom_m: Math.min(...ps.map((p) => p.bottom_m)),
    avg_grade: length && firstPart && lastPart ? +(((lastPart[lastPart.length - 1][2] - firstPart[0][2]) / length) * 100).toFixed(1) : 0,
    max_grade: Math.max(...grades),
    min_grade: Math.min(...grades),
    segments,
  };
}

/**
 * Gehzeit nach DIN 33466 in Minuten: 4 km/h horizontal, 300 Hm/h bergauf, 500 Hm/h bergab.
 * Der kleinere der beiden Werte (Strecke / Höhe) zählt zur Hälfte.
 */
export function hikingMinutes(lengthM, ascentM, descentM) {
  const h = (lengthM / 1000 / 4) * 60;
  const v = (ascentM / 300 + descentM / 500) * 60;
  return Math.round(Math.max(h, v) + Math.min(h, v) / 2);
}

/** Schwierigkeit einer Piste aus OSM-Tags: novice | easy | intermediate | advanced | expert | freeride | unknown */
export function pisteDifficulty(tags = {}) {
  const d = (tags["piste:difficulty"] || "").toLowerCase();
  if (["novice", "easy", "intermediate", "advanced", "expert", "freeride"].includes(d)) return d;
  if (tags["piste:type"] === "downhill" && /route|skiroute/i.test(tags["piste:name"] || tags.name || "")) return "freeride";
  return "unknown";
}

/** Wander-Schwierigkeit aus sac_scale: easy (blau) | medium (rot) | hard (schwarz) | unknown */
export function hikeDifficulty(tags = {}) {
  const s = tags.sac_scale || "";
  if (s === "hiking") return "easy";
  if (s === "mountain_hiking") return "medium";
  if (s) return "hard";
  const t = (tags["trail_visibility"] || "");
  if (t === "excellent" || t === "good") return "easy";
  return "unknown";
}

/** Klasse für Gehzeit in Minuten: short (<2 h) | half (2–4 h) | day (4–7 h) | long (>7 h) */
export function durationClass(min) {
  if (min < 120) return "short";
  if (min < 240) return "half";
  if (min < 420) return "day";
  return "long";
}

/** Klasse für eine Steigung in Prozent (Rad): down | flat | gentle | moderate | steep | verysteep */
export function gradeClass(g) {
  if (g < -1) return "down";
  if (g < 3) return "flat";
  if (g < 6) return "gentle";
  if (g < 10) return "moderate";
  if (g < 15) return "steep";
  return "verysteep";
}

/** Klasse für Gefälle einer Piste (Betrag in Prozent): green (<15) | blue (<25) | red (<40) | black */
export function pisteGradeClass(gAbs) {
  if (gAbs < 15) return "green";
  if (gAbs < 25) return "blue";
  if (gAbs < 40) return "red";
  return "black";
}

/** Bounding-Box [minLon, minLat, maxLon, maxLat] einer Koordinatenliste. */
export function bbox(coords) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const c of coords) {
    if (c[0] < b[0]) b[0] = c[0];
    if (c[1] < b[1]) b[1] = c[1];
    if (c[0] > b[2]) b[2] = c[0];
    if (c[1] > b[3]) b[3] = c[1];
  }
  return b;
}

/** Alle Koordinaten einer GeoJSON-Geometrie als flache Liste. */
export function flatCoords(geometry) {
  switch (geometry.type) {
    case "Point": return [geometry.coordinates];
    case "LineString": case "MultiPoint": return geometry.coordinates;
    case "Polygon": case "MultiLineString": return geometry.coordinates.flat();
    case "MultiPolygon": return geometry.coordinates.flat(2);
    default: return [];
  }
}
