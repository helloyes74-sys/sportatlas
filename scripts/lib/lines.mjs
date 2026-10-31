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

// ---------- Pisten und Loipen zusammenfassen ----------

const NEAR_M = 25;      // Enden gelten als verbunden, wenn sie höchstens so weit auseinanderliegen
const SAME_PISTE_M = 3000; // gleicher Name/Nummer, aber weiter entfernt → eine andere Piste (zweiter Talbereich)
const distM = (a, b) => Math.sqrt(dist2(a, b)) * 111320;
const normName = (s) => s.toLowerCase().replace(/[-–*]/g, " ").replace(/\b(piste|abfahrt|loipe|skiroute|skipiste)\b/g, "").replace(/\s+/g, " ").trim();
const lengthM = (parts) => parts.reduce((s, p) => { for (let i = 1; i < p.length; i++) s += distM(p[i - 1], p[i]); return s; }, 0);
/** Namen, die nur ein Verbindungsstück beschreiben (kein Eintrag im Pistenplan). */
const CONNECTOR_NAME = /verbindung|skiweg|ski-? ?und ?rodelweg|umgehung|ziehweg|zufahrt|einfahrt|ausfahrt|querung|^piste (zum|zur|am) |^(piste|abfahrt) [a-zäöüß-]+(lift|bahn)$|^skiroute zum/i;

/** Nummer (ref) und Name einer Piste aus den OSM-Tags; rein numerische Namen gelten als Nummer. */
export function pisteIdent(props) {
  let ref = (props["piste:ref"] || props.ref || "").trim();
  let name = (props["piste:name"] || props.name || "").trim();
  name = name.replace(/^(skiroute|piste|abfahrt|skiweg|loipe)\s+(?=[0-9])/i, ""); // „Skiroute 30 Rock'n'Roll“
  if (/^(skiroute|piste|abfahrt|skiweg|loipe|skipiste)$/i.test(name)) name = "";      // nichtssagender Name
  if (!ref && /^[0-9]{1,3}[a-z]?$/i.test(name)) { ref = name; name = ""; }
  // „18 - Märchenwald“, „35 35 - Direttissima“: Nummer steckt (noch einmal) im Namen
  const m = name.match(/^([0-9]{1,3}[a-z]?)\s*[-–:.]?\s+(.+)$/i);
  if (m && (!ref || m[1].toLowerCase() === ref.toLowerCase())) { ref = ref || m[1]; name = m[2].replace(/^[-–:]\s*/, "").trim(); }
  return { ref, name };
}
/** Schlüssel einer Piste im Pistenplan: Nummer vor Name. Ohne beides oder mit reinem Verbindungsnamen: null. */
export function pisteKey(props) {
  const { ref, name } = pisteIdent(props);
  if (ref) return `ref:${ref.toLowerCase()}`;
  if (name && !CONNECTOR_NAME.test(name)) return `name:${normName(name)}`;
  return null;
}

const minDistM = (parts, others) => {
  let min = Infinity;
  for (const p of parts) for (const pt of p) for (const q of others) for (const o of q) { const d = distM(pt, o); if (d < min) min = d; }
  return min;
};
/** Berührt ein Teilstück mit einem seiner Enden irgendeinen Punkt der gegebenen Teilstücke? */
const touches = (part, parts) => minDistM([[part[0], part[part.length - 1]]], parts) <= NEAR_M;

/** Fasst OSM-Pistenwege zu Pisten des Pistenplans zusammen:
 *  - Wege mit gleicher Nummer bzw. gleichem Namen werden eine Piste (verkettet, sonst MultiLineString),
 *    sofern sie nahe beieinanderliegen; Schwierigkeit = längenstärkste Angabe, Flutlicht/Beschneiung,
 *    wenn irgendein Teil sie hat. Nur-Name-Gruppen gehen in eine benachbarte Nummern-Gruppe gleichen Namens auf.
 *  - Namenlose Wege (und solche, die nur „Verbindung …“, „Skiweg …“ heißen), die genau eine Piste berühren,
 *    gehören zu ihr (Einstiege, Ausfahrten, geteilte Fahrspuren); das wiederholt sich, bis nichts mehr wächst.
 *  - Der Rest wird je Schwierigkeit zu einer Linie „Verbindungswege“ zusammengelegt; nur zusammenhängende
 *    namenlose Stücke ab `minSoloM` bleiben als eigene „Piste ohne Namen“ stehen.
 *  Lifte, Flächen (Polygon) und alles, was nicht `kinds` entspricht, bleiben unverändert. */
export function consolidatePistes(features, { kinds = ["piste"], minSoloM = 400, connectorLabel = "Verbindungswege", official = [] } = {}) {
  const offByRef = new Map(official.filter((o) => o.ref).map((o) => [String(o.ref).toLowerCase(), o]));
  const offByName = new Map(official.filter((o) => o.name).map((o) => [normName(o.name), o]));
  const isLine = (f) => f.geometry && (f.geometry.type === "LineString" || f.geometry.type === "MultiLineString");
  const take = features.filter((f) => kinds.includes(f.properties.kind) && isLine(f));
  const rest = features.filter((f) => !take.includes(f));
  const groups = []; // { key, members, parts }
  const loose = [];
  const add = (g, f) => { g.members.push(f); g.parts.push(...partsOf(f.geometry)); };
  for (const f of take.slice().sort((a, b) => lengthM(partsOf(b.geometry)) - lengthM(partsOf(a.geometry)))) {
    const k = pisteKey(f.properties);
    if (!k) { loose.push(f); continue; }
    const parts = partsOf(f.geometry);
    const near = groups.filter((g) => g.key === k && minDistM(parts, g.parts) <= SAME_PISTE_M);
    if (near.length) add(near[0], f);
    else { const g = { key: k, members: [], parts: [] }; add(g, f); groups.push(g); }
  }
  // „Kaiserburgabfahrt“ (ohne Nummer) → „1 Kaiserburgabfahrt“, wenn genau eine solche Nummern-Gruppe nahe liegt
  for (const g of groups.filter((g) => g.key.startsWith("name:"))) {
    const nm = g.key.slice(5);
    const cands = groups.filter((o) => o !== g && o.key.startsWith("ref:") && o.members.some((m) => normName(pisteIdent(m.properties).name) === nm) && minDistM(g.parts, o.parts) <= SAME_PISTE_M);
    if (cands.length === 1) { for (const m of g.members) add(cands[0], m); g.members = []; g.parts = []; }
  }
  // Nur-Name-Gruppen bekommen die Nummer aus dem Pistenplan („Gipfelabfahrt“ → 1) und gehen ggf. in die Nummern-Gruppe auf
  for (const g of groups.filter((g) => g.key.startsWith("name:"))) {
    const o = offByName.get(g.key.slice(5)); if (!o?.ref) continue;
    const key = `ref:${String(o.ref).toLowerCase()}`;
    const target = groups.find((t) => t !== g && t.key === key && t.members.length && minDistM(g.parts, t.parts) <= SAME_PISTE_M);
    if (target) { for (const m of g.members) add(target, m); g.members = []; g.parts = []; } else g.key = key;
  }
  const live = () => groups.filter((g) => g.members.length);
  // namenlose Stücke an genau eine berührte Piste hängen, mehrfach
  let pool = loose.slice(), grew = true;
  while (grew && pool.length) {
    grew = false;
    const keep = [];
    for (const f of pool) {
      const parts = partsOf(f.geometry);
      // nur kurze Stücke anhängen – ein langer namenloser Weg ist eine eigene Piste, kein Einstieg
      const hit = lengthM(parts) < minSoloM ? live().filter((g) => parts.some((p) => touches(p, g.parts))) : [];
      if (hit.length === 1) { add(hit[0], f); grew = true; } else keep.push(f);
    }
    pool = keep;
  }
  const out = [];
  const build = (members, parts, props) => {
    const chained = orderParts(chainLines(parts));
    const byLen = new Map();
    for (const m of members) {
      const d = m.properties["piste:difficulty"]; if (!d) continue;
      byLen.set(d, (byLen.get(d) || 0) + lengthM(partsOf(m.geometry)));
    }
    const diff = [...byLen.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const anyYes = (tag) => members.some((m) => m.properties[tag] === "yes");
    const first = members.slice().sort((a, b) => lengthM(partsOf(b.geometry)) - lengthM(partsOf(a.geometry)))[0];
    const p = { ...first.properties, ...props, merged_ways: members.length, osm_ids: members.map((m) => m.properties.osm_id) };
    if (diff && !props["piste:difficulty"]) p["piste:difficulty"] = diff;
    if (anyYes("lit")) p.lit = "yes";
    if (anyYes("piste:snowmaking") || anyYes("snowmaking")) p["piste:snowmaking"] = "yes";
    const groom = members.map((m) => m.properties["piste:grooming"]).filter(Boolean);
    if (groom.length) p["piste:grooming"] = groom.includes("classic+skating") || (groom.includes("skating") && groom.includes("classic")) ? "classic+skating" : groom[0];
    for (const k of ["segments", "length_m", "ascent_m", "descent_m", "top_m", "bottom_m", "avg_grade", "max_grade", "min_grade", "max_descent_grade"]) delete p[k];
    for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k];
    out.push({ type: "Feature", id: first.id, properties: p, geometry: geometryOf(chained) });
  };
  for (const g of live()) {
    const idents = g.members.map((m) => pisteIdent(m.properties));
    const ref = idents.find((i) => i.ref)?.ref;
    let name = idents.map((i) => i.name).filter((n) => n && !CONNECTOR_NAME.test(n)).sort((a, b) => b.length - a.length)[0] || idents.map((i) => i.name).find(Boolean);
    // Pistenplan des Betreibers hat Vorrang: Name, Schwierigkeit, Nummer
    const o = (ref && offByRef.get(ref.toLowerCase())) || (name && offByName.get(normName(name)));
    const extra = {};
    if (o) { name = o.name || name; if (o.difficulty) extra["piste:difficulty"] = o.difficulty; extra.official = true; if (o.length_m) extra.official_length_m = o.length_m; }
    const r = o?.ref ? String(o.ref) : ref;
    build(g.members, g.parts, { display_name: r && name ? `${r} ${name}` : r ? `Piste ${r}` : name, ref: r || undefined, name: name || undefined, ...extra });
  }
  // Rest: zusammenhängende Stücke; lange bleiben eigenständig, kurze werden Verbindungswege
  const chains = chainLines(pool.flatMap((f) => partsOf(f.geometry)));
  const memberOf = (chain) => pool.filter((f) => partsOf(f.geometry).some((p) => chain.some((pt) => same(pt, p[0]))));
  const connectors = new Map();
  let solo = 0;
  for (const chain of chains) {
    const members = memberOf(chain);
    if (!members.length) continue;
    if (lengthM([chain]) >= minSoloM) { solo++; build(members, [chain], { display_name: `Piste ohne Namen${solo > 1 ? ` ${solo}` : ""}`, name: undefined, ref: undefined }); continue; }
    const d = members[0]?.properties["piste:difficulty"] || "unknown";
    if (!connectors.has(d)) connectors.set(d, { members: [], parts: [] });
    connectors.get(d).members.push(...members); connectors.get(d).parts.push(chain);
  }
  for (const [, c] of connectors) if (c.members.length) build(c.members, c.parts, { display_name: connectorLabel, connector: true, name: undefined, ref: undefined });
  return rest.concat(out);
}

// ---------- Skigebiet abgrenzen ----------

/** Behält nur die Linien, die mit dem Gebiet zusammenhängen: Pisten und Lifte eines Skigebiets berühren
 *  einander; ein Nachbargebiet in derselben Bounding-Box (Innerkrems neben Katschberg) bildet eine eigene
 *  Gruppe ohne Verbindung. Gruppen werden mit `joinM` Toleranz gebildet, Start ist die Gruppe, die dem
 *  Gebietsmittelpunkt am nächsten liegt; weitere Gruppen kommen dazu, wenn sie höchstens `gapM` von einer
 *  schon aufgenommenen entfernt sind (Parkplatz-Zubringer, Talabfahrt mit Lücke). Flächen bleiben immer. */
export function keepConnected(features, center, { joinM = 150, gapM = 600 } = {}) {
  const lines = features.filter((f) => f.geometry && (f.geometry.type === "LineString" || f.geometry.type === "MultiLineString"));
  if (lines.length < 2) return features;
  const parent = lines.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  // Rasterzellen von ~joinM Kantenlänge; Linien in derselben oder einer Nachbarzelle werden geprüft
  const cellDeg = joinM / 111320;
  const cells = new Map();
  lines.forEach((f, i) => {
    for (const p of partsOf(f.geometry)) for (const c of p) {
      const k = `${Math.floor(c[0] / cellDeg)}:${Math.floor(c[1] / cellDeg)}`;
      if (!cells.has(k)) cells.set(k, new Set());
      cells.get(k).add(i);
    }
  });
  for (const [k, set] of cells) {
    const [cx, cy] = k.split(":").map(Number);
    const ids = new Set(set);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const j of cells.get(`${cx + dx}:${cy + dy}`) || []) ids.add(j);
    const arr = [...ids];
    for (let a = 1; a < arr.length; a++) union(arr[0], arr[a]);
  }
  const groups = new Map();
  lines.forEach((f, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(f); });
  const list = [...groups.values()];
  const nearest = (g, pt) => Math.min(...g.flatMap((f) => partsOf(f.geometry).flatMap((p) => p.map((c) => distM(c, pt)))));
  const minBetween = (g1, g2) => Math.min(...g1.flatMap((f) => partsOf(f.geometry).flatMap((p) => p.map((c) => nearest(g2, c)))));
  list.sort((a, b) => nearest(a, center) - nearest(b, center));
  const kept = [list[0]];
  let rest = list.slice(1), grew = true;
  while (grew && rest.length) {
    grew = false;
    rest = rest.filter((g) => { if (kept.some((k) => minBetween(k, g) <= gapM)) { kept.push(g); grew = true; return false; } return true; });
  }
  const keep = new Set(kept.flat());
  return features.filter((f) => !lines.includes(f) || keep.has(f));
}
