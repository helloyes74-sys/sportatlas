// Linien-Werkzeuge für Routen aus OpenStreetMap: Teilstücke aneinanderhängen, auf eine
// Bounding-Box zuschneiden, mehrere Wege zu einer Route verschmelzen. Nur Koordinaten-Arrays,
// keine Abhängigkeiten.

const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

/** Hängt Teilstücke, die sich an den Enden berühren, zu möglichst wenigen langen Linien zusammen.
 *  OSM-Relationen liefern ihre Wege oft ungeordnet oder mit wechselnder Richtung; Höhenprofile
 *  brauchen aber eine durchgehende Reihenfolge. Teilstücke drehen sich bei Bedarf um. */
export function chainLines(parts) {
  const pool = parts.filter((p) => p && p.length > 1).map((p) => p.slice());
  const out = [];
  while (pool.length) {
    let line = pool.shift();
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        const head = line[0], tail = line[line.length - 1];
        if (same(tail, p[0])) line = line.concat(p.slice(1));
        else if (same(tail, p[p.length - 1])) line = line.concat(p.slice().reverse().slice(1));
        else if (same(head, p[p.length - 1])) line = p.slice(0, -1).concat(line);
        else if (same(head, p[0])) line = p.slice().reverse().slice(0, -1).concat(line);
        else continue;
        pool.splice(i, 1);
        grew = true;
        break;
      }
    }
    out.push(line);
  }
  // längste zuerst, damit Profil und Name von der Hauptlinie kommen
  return out.sort((a, b) => b.length - a.length);
}

/** Schneidet ein Teilstück an einer Bounding-Box [w, s, e, n] zu (Liang–Barsky je Segment).
 *  Ergebnis: Liste von Teilstücken innerhalb der Box; Schnittpunkte mit dem Rand werden eingefügt. */
export function clipLine(coords, [w, s, e, n]) {
  const out = [];
  let cur = [];
  const push = (pt) => { if (!cur.length || !same(cur[cur.length - 1], pt)) cur.push(pt); };
  const flush = () => { if (cur.length > 1) out.push(cur); cur = []; };
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i], b = coords[i + 1];
    const seg = clipSegment(a, b, w, s, e, n);
    if (!seg) { flush(); continue; }
    const [p, q] = seg;
    // neues Teilstück, wenn der Anfang nicht am bisherigen Ende liegt
    if (cur.length && !same(cur[cur.length - 1], p)) flush();
    push(p); push(q);
    if (!same(q, b)) flush(); // Segment verlässt die Box
  }
  flush();
  return out;
}

function clipSegment(a, b, w, s, e, n) {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const checks = [[-dx, a[0] - w], [dx, e - a[0]], [-dy, a[1] - s], [dy, n - a[1]]];
  for (const [p, q] of checks) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  const at = (t) => (a.length > 2 ? [a[0] + t * dx, a[1] + t * dy, a[2]] : [a[0] + t * dx, a[1] + t * dy]);
  return [t0 === 0 ? a : at(t0), t1 === 1 ? b : at(t1)];
}

const dist2 = (a, b) => ((a[0] - b[0]) * Math.cos((a[1] * Math.PI) / 180)) ** 2 + (a[1] - b[1]) ** 2;

/** Bringt Teilstücke, die sich nicht mehr verketten lassen (Lücken in OSM), in eine plausible Reihenfolge:
 *  Anfang ist der Endpunkt, der am weitesten von allen anderen Endpunkten entfernt liegt (ein Routenende),
 *  dann folgt jeweils das Teilstück, dessen Anfang oder Ende dem bisherigen Ende am nächsten liegt
 *  (bei Bedarf umgedreht). So läuft ein Profil vom Tal zur Hütte statt in Längen-Reihenfolge. */
export function orderParts(parts) {
  const pool = parts.filter((p) => p && p.length > 1).map((p) => p.slice());
  if (pool.length < 2) return pool;
  const ends = pool.flatMap((p, i) => [{ i, rev: false, pt: p[0] }, { i, rev: true, pt: p[p.length - 1] }]);
  let best = null, bestScore = -1;
  for (const e of ends) {
    let min = Infinity;
    for (const o of ends) if (o.i !== e.i) min = Math.min(min, dist2(e.pt, o.pt));
    if (min > bestScore) { bestScore = min; best = e; }
  }
  const take = (i, rev) => { const p = pool.splice(i, 1)[0]; return rev ? p.reverse() : p; };
  const out = [take(best.i, best.rev)];
  while (pool.length) {
    const tail = out[out.length - 1].slice(-1)[0];
    let bi = 0, brev = false, bd = Infinity;
    pool.forEach((p, i) => {
      const d0 = dist2(tail, p[0]), d1 = dist2(tail, p[p.length - 1]);
      if (d0 < bd) { bd = d0; bi = i; brev = false; }
      if (d1 < bd) { bd = d1; bi = i; brev = true; }
    });
    out.push(take(bi, brev));
  }
  return out;
}

/** Alle Teilstücke einer Geometrie (LineString oder MultiLineString). */
export const partsOf = (geometry) => (geometry.type === "LineString" ? [geometry.coordinates] : geometry.type === "MultiLineString" ? geometry.coordinates : []);
/** Geometrie aus Teilstücken: ein Teilstück → LineString, sonst MultiLineString, keins → null. */
export const geometryOf = (parts) => (!parts.length ? null : parts.length === 1 ? { type: "LineString", coordinates: parts[0] } : { type: "MultiLineString", coordinates: parts });

/** Routen in Form bringen: Wege ohne Relation zu einer Linie verschmelzen (Passstraßen, Klammsteige),
 *  auf Wunsch (osm.clip) an der Bounding-Box abschneiden (Etappe aus einer langen Relation) und die
 *  Teilstücke aneinanderhängen, damit das Höhenprofil in einer Richtung durchläuft. */
export function shapeRoute(fc, area) {
  const bbox = area.osm?.bbox || area.bbox;
  let feats = fc.features.filter((f) => partsOf(f.geometry).length);
  if (area.osm?.way_name || area.osm?.way_ref || area.osm?.merge) {
    const parts = feats.flatMap((f) => partsOf(f.geometry));
    if (!parts.length) return { ...fc, features: [] };
    const uphill = /anstieg|pass|stra(ss|ß)e/i.test(area.kind || "") || /anstieg/i.test(area.name);
    // Tunnelportale (erster/letzter Punkt jedes Tunnel-Wegs): add-elevation überbrückt dort das Gelände
    const tunnels = feats.filter((f) => f.properties.tunnel && f.properties.tunnel !== "no").flatMap((f) => partsOf(f.geometry).map((p) => [p[0].slice(0, 2), p[p.length - 1].slice(0, 2)]));
    feats = [{
      type: "Feature", id: `merged/${area.id}`,
      properties: { osm_type: "way", osm_id: area.id, kind: feats[0].properties.kind, name: area.name, merged_ways: parts.length, ...(uphill ? { orient: "uphill" } : {}), ...(tunnels.length ? { tunnels } : {}) },
      geometry: { type: "MultiLineString", coordinates: parts },
    }];
  }
  return {
    ...fc,
    features: feats.map((f) => {
      let parts = partsOf(f.geometry);
      if (area.osm?.clip) parts = parts.flatMap((p) => clipLine(p, bbox));
      const geometry = geometryOf(orderParts(chainLines(parts)));
      return geometry ? { ...f, geometry } : null;
    }).filter(Boolean),
  };
}
