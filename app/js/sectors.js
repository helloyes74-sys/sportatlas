// Sektoren eines Gebiets für Kamerafahrten: Skigebiete und Loipennetze werden aus den Linien
// automatisch in Gruppen geteilt (k-Means über die Linienmittelpunkte), Routen bekommen
// Start, Mitte und Ziel. Jeder Sektor hat Mittelpunkt, Zoom und eine Blickrichtung bergauf.

import { haversine, flatCoords, bbox } from "./geo.js";

const centroid = (coords) => {
  let x = 0, y = 0;
  for (const c of coords) { x += c[0]; y += c[1]; }
  return [x / coords.length, y / coords.length];
};
/** Azimut (0 = Nord, 90 = Ost) von a nach b. */
export const azimuth = (a, b) => {
  const dLon = ((b[0] - a[0]) * Math.PI) / 180, la1 = (a[1] * Math.PI) / 180, la2 = (b[1] * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(la2), x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};
/** Zoom, bei dem ein Radius (m) etwa die halbe Kartenbreite füllt. */
export const zoomForRadius = (radiusM, lat) => {
  const mPerPxAtZ0 = (156543.03 * Math.cos((lat * Math.PI) / 180));
  const z = Math.log2((mPerPxAtZ0 * 300) / Math.max(150, radiusM));
  return Math.min(15, Math.max(12, +z.toFixed(2)));
};

/** Einfaches k-Means mit Farthest-Point-Start; deterministisch. */
export function kmeans(points, k, iterations = 25) {
  if (points.length <= k) return points.map((p, i) => [i]);
  const centers = [points[0].slice()];
  while (centers.length < k) {
    let best = -1, bestD = -1;
    points.forEach((p, i) => { const d = Math.min(...centers.map((c) => haversine(c, p))); if (d > bestD) { bestD = d; best = i; } });
    centers.push(points[best].slice());
  }
  let groups = [];
  for (let it = 0; it < iterations; it++) {
    groups = centers.map(() => []);
    points.forEach((p, i) => { let b = 0, bd = Infinity; centers.forEach((c, j) => { const d = haversine(c, p); if (d < bd) { bd = d; b = j; } }); groups[b].push(i); });
    let moved = false;
    groups.forEach((g, j) => { if (!g.length) return; const c = centroid(g.map((i) => points[i])); if (haversine(c, centers[j]) > 5) moved = true; centers[j] = c; });
    if (!moved) break;
  }
  return groups.filter((g) => g.length);
}

const lineFeatures = (geo) => (geo?.features || []).filter((f) => f.geometry.type === "LineString" || f.geometry.type === "MultiLineString");

/** Sektoren berechnen. Gibt [] zurück, wenn es keine Linien gibt. */
export function computeSectors(geo, area) {
  const feats = lineFeatures(geo);
  if (!feats.length) return [];
  const lat = area.center[1];
  if (area.type === "bike" || area.type === "hike") return routeSectors(feats, lat);

  const pts = feats.map((f) => centroid(flatCoords(f.geometry)));
  const k = Math.min(5, Math.max(2, Math.round(feats.length / 22)));
  const groups = kmeans(pts, k);
  const sectors = groups.map((idx, n) => {
    const members = idx.map((i) => feats[i]);
    const coords = members.flatMap((f) => flatCoords(f.geometry));
    const center = centroid(coords);
    const radius = Math.max(...coords.map((c) => haversine(center, c)));
    // höchster Punkt des Sektors: dorthin schaut die Kamera (bergauf)
    let high = null, highEle = -Infinity;
    for (const c of coords) if (c.length > 2 && c[2] > highEle) { highEle = c[2]; high = c; }
    const bearing = high ? azimuth(center, high) : -18;
    // Name: längster Lift, sonst längste benannte Piste/Loipe
    const named = (kind) => members.filter((f) => f.properties.kind === kind && (f.properties.name || f.properties.display_name)).sort((a, b) => (b.properties.length_m || 0) - (a.properties.length_m || 0))[0];
    const lift = named("lift"), piste = named("piste") || named("xc");
    const label = lift ? lift.properties.name.replace(/\s*\d+er[- ]?/i, " ").replace(/\s{2,}/g, " ").trim() : piste ? (piste.properties.display_name || piste.properties.name) : `Sektor ${n + 1}`;
    const top = members.reduce((m, f) => Math.max(m, f.properties.top_m ?? -Infinity), -Infinity);
    return { id: `s${n}`, name: label.length > 26 ? label.slice(0, 25) + "…" : label, center, zoom: zoomForRadius(radius, lat), bearing: Math.round(bearing), pitch: 62, top_m: Number.isFinite(top) ? top : null, count: members.length };
  });
  // vom höchsten zum tiefsten Sektor
  return sectors.sort((a, b) => (b.top_m ?? 0) - (a.top_m ?? 0));
}

/** Für Routen: Start, Mitte, Ziel der längsten Linie, Blick in Laufrichtung. */
function routeSectors(feats, lat) {
  const main = feats.slice().sort((a, b) => (b.properties.length_m || 0) - (a.properties.length_m || 0))[0];
  const coords = flatCoords(main.geometry);
  if (coords.length < 2) return [];
  const last = coords.length - 1;
  const idx = (t) => Math.min(last, Math.max(0, Math.floor(last * t)));
  const stops = [["Start", 0], ["Mitte", 0.5], ["Ziel", 1]];
  const b = bbox(coords);
  const span = haversine([b[0], b[1]], [b[2], b[3]]);
  return stops.map(([name, t], i) => {
    const at = idx(t);
    // Blickrichtung aus dem nächsten bzw. vorigen Punkt – bei kurzen Linien mindestens einen Index weiter
    const ahead = Math.min(last, Math.max(at + 1, idx(t + 0.08)));
    const behind = Math.max(0, Math.min(at - 1, idx(t - 0.08)));
    const c = coords[at];
    const bearing = t < 1 ? azimuth(c, coords[ahead]) : azimuth(coords[behind], c);
    return { id: `r${i}`, name, center: c.slice(0, 2), zoom: zoomForRadius(Math.min(3000, Math.max(600, span / 12)), lat), bearing: Math.round(bearing), pitch: 60, count: 1 };
  });
}
