// Sportarten-Katalog: Überbegriffe → Sportarten → OSM-Werte (sport=*, leisure=*).
// Wird von fetch-sportorte.mjs, build-sportorte.mjs und den Tests genutzt; die App liest das Ergebnis aus JSON.
// Sportarten mit `route` sind die bestehenden Bereiche der App (Gebiete mit Linien), keine OSM-Orte.
// Was hier nicht vorkommt (Fußball, Tischtennis, Pferd, Kanu, Sprungschanzen …), wird ausgelassen.

export const CATALOG = [
  { group: "Winter", sports: [
    { id: "ski", label: "Ski", route: "ski" },
    { id: "xc", label: "Langlauf", route: "xc" },
    { id: "eislaufen", label: "Eislaufen", osm: ["ice_skating", "ice_rink", "skating"] },
    { id: "eishockey", label: "Eishockey", osm: ["ice_hockey"] },
    { id: "eisstock", label: "Eisstockschießen", osm: ["ice_stock", "curling", "german_curling"] },
  ] },
  { group: "Rad und Rollen", sports: [
    { id: "bike", label: "Radtouren", route: "bike" },
    { id: "pumptrack", label: "Pumptrack und Bikepark", osm: ["pump_track", "cycling=pump_track", "mtb", "bmx", "cycling"] },
    { id: "skatepark", label: "Skatepark", osm: ["skateboard", "roller_skating", "inline_skating", "scooter", "roller"] },
  ] },
  { group: "Berg und Luft", sports: [
    { id: "hike", label: "Wandern", route: "hike" },
    { id: "klettern", label: "Klettern", osm: ["climbing", "bouldering"] },
    { id: "hochseilgarten", label: "Hochseilgarten", osm: ["climbing_adventure"] },
    { id: "paragleiten", label: "Paragleiten", osm: ["free_flying", "paragliding", "hang_gliding"] },
    { id: "sommerrodeln", label: "Sommerrodelbahn", osm: ["toboggan"] },
  ] },
  { group: "Schlägersport", sports: [
    { id: "tennis", label: "Tennis", osm: ["tennis"], merge_m: 180 },
    { id: "padel", label: "Padel", osm: ["padel", "paddle_tennis"], merge_m: 150 },
    { id: "squash", label: "Squash", osm: ["squash"] },
    { id: "badminton", label: "Badminton", osm: ["badminton"] },
    { id: "pickleball", label: "Pickleball", osm: ["pickleball"] },
  ] },
  { group: "Golf", sports: [
    { id: "golf", label: "Golf", osm: ["golf_course", "golf"], merge_m: 600 },
    { id: "minigolf", label: "Minigolf", osm: ["miniature_golf", "minigolf", "crazy_golf"] },
    { id: "discgolf", label: "Discgolf", osm: ["disc_golf_course", "disc_golf"] },
  ] },
  { group: "Ballsport", sports: [
    { id: "multi", label: "Mehrzweckplatz", osm: ["multi"] },
    { id: "basketball", label: "Basketball", osm: ["basketball"] },
    { id: "beachvolleyball", label: "Beachvolleyball", osm: ["beachvolleyball"], merge_m: 120 },
    { id: "volleyball", label: "Volleyball", osm: ["volleyball"] },
    { id: "handball", label: "Handball", osm: ["handball"] },
    { id: "hockey", label: "Hockey", osm: ["hockey", "field_hockey"] },
    { id: "baseball", label: "Baseball", osm: ["baseball"] },
  ] },
  { group: "Wasser", sports: [
    { id: "baden", label: "Baden und Schwimmen", osm: ["swimming", "swimming_pool", "water_park", "swimming_area"], merge_m: 150 },
    { id: "tauchen", label: "Tauchen", osm: ["scuba_diving", "diving"] },
    { id: "wasserski", label: "Wasserski und Wakeboard", osm: ["water_ski", "wakeboard"] },
    { id: "segeln", label: "Segeln und Surfen", osm: ["sailing", "windsurfing", "kitesurfing", "surfing", "stand_up_paddleboarding"] },
    { id: "rudern", label: "Rudern", osm: ["rowing"] },
    { id: "angeln", label: "Angeln", osm: ["fishing"] },
  ] },
  { group: "Fitness", sports: [
    { id: "fitness", label: "Fitnessstudio", osm: ["fitness", "crossfit", "gymnastics"] },
    { id: "outdoorfitness", label: "Outdoor-Fitness und Calisthenics", osm: ["fitness_station", "calisthenics"] },
    { id: "laufen", label: "Laufbahn und Leichtathletik", osm: ["athletics", "running", "track"] },
    { id: "yoga", label: "Yoga", osm: ["yoga"] },
    { id: "trampolin", label: "Trampolin", osm: ["trampoline", "trampoline_park"] },
  ] },
  { group: "Zielen und Kegeln", sports: [
    { id: "bogen", label: "Bogenschießen", osm: ["archery"] },
    { id: "kegeln", label: "Kegeln und Bowling", osm: ["9pin", "10pin", "bowling", "bowling_alley"] },
    { id: "schiessen", label: "Schießstand", osm: ["shooting"] },
    { id: "boule", label: "Boule", osm: ["boules", "petanque", "bocce"] },
    { id: "billard", label: "Billard und Darts", osm: ["billiards", "darts"] },
  ] },
  { group: "Motor", sports: [
    { id: "kart", label: "Kart", osm: ["karting"] },
    { id: "motocross", label: "Motocross", osm: ["motocross"] },
    { id: "modellflug", label: "Modellflug", osm: ["model_aerodrome", "rc_car"] },
  ] },
  { group: "Kampfsport und Denksport", sports: [
    { id: "kampfsport", label: "Kampfsport", osm: ["martial_arts", "taekwondo", "judo", "karate", "boxing", "kickboxing"] },
    { id: "schach", label: "Schach", osm: ["chess"] },
  ] },
];

const LOOKUP = new Map();
for (const g of CATALOG) for (const s of g.sports) for (const v of s.osm || []) LOOKUP.set(v, s.id);

/** leisure-Werte, die selbst eine Sportart sind (auch ohne sport=*). */
export const LEISURE_SPORTS = ["golf_course", "miniature_golf", "disc_golf_course", "ice_rink", "fitness_station", "water_park", "swimming_area", "swimming_pool", "bowling_alley", "trampoline_park", "track"];

/** OSM-Sportwerte eines Objekts als Liste (Kleinbuchstaben, ohne Dubletten). */
export function sportsOf(tags = {}) {
  const out = new Set();
  for (const s of String(tags.sport || "").split(/[;,]/)) {
    const v = s.trim().toLowerCase().replace(/\s+/g, "_");
    if (v) out.add(v);
  }
  if (!out.size && LEISURE_SPORTS.includes(tags.leisure)) out.add(tags.leisure);
  return [...out];
}

/** Katalog-Sportart zu einem OSM-Wert, oder null (= ausgelassen). */
export const catalogSport = (osmValue) => LOOKUP.get(osmValue) || null;
const SPORT_BY_ID = new Map(CATALOG.flatMap((g) => g.sports.map((s) => [s.id, s])));
export const sportById = (id) => SPORT_BY_ID.get(id);

// Laufstrecken-Markierungen (Kilometertafeln eines Marathons) sind keine Sportorte
const NOT_A_PLACE = /^(km \d|start\b|ziel\b)/i;

/** Abstand in Metern (equirektangulär, reicht für ein paar hundert Meter). */
function meters(a, b) {
  const k = Math.PI / 180, x = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * k), y = b.lat - a.lat;
  return Math.hypot(x, y) * k * 6371000;
}

/** Häufigster Name einer Gruppe; Namen mit Verein/Club/Anlage gewinnen bei Gleichstand. */
function bestName(names) {
  const count = new Map();
  for (const n of names) if (n) count.set(n, (count.get(n) || 0) + 1);
  const score = (n) => count.get(n) * 10 + (/(club|verein|anlage|zentrum|center|halle|park|arena|union|askö|sv |tc |utc)/i.test(n) ? 5 : 0) - n.length / 100;
  return [...count.keys()].sort((a, b) => score(b) - score(a))[0];
}

/**
 * Rohe OSM-Orte → Orte je Katalog-Sportart. Benachbarte Plätze derselben Sportart (z. B. die 10 Courts
 * eines Tennisclubs) werden zu einem Ort zusammengefasst; `courts` zählt die Einzelplätze.
 * raw: [{id, lon, lat, sports:[osm], name?, indoor?, surface?, hours?, web?, fee?}]
 */
export function buildPlaces(raw) {
  const bySport = new Map();
  for (const o of raw) {
    if (o.name && NOT_A_PLACE.test(o.name)) continue;
    for (const id of new Set(o.sports.map(catalogSport).filter(Boolean))) {
      if (!bySport.has(id)) bySport.set(id, []);
      bySport.get(id).push(o);
    }
  }
  const places = [];
  for (const [sport, list] of bySport) {
    const radius = sportById(sport).merge_m || 100;
    // Union-Find über alle Paare innerhalb des Radius (je Sportart höchstens ein paar hundert Orte)
    const parent = list.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      if (meters(list[i], list[j]) <= radius) parent[find(i)] = find(j);
    }
    const clusters = new Map();
    list.forEach((o, i) => { const r = find(i); if (!clusters.has(r)) clusters.set(r, []); clusters.get(r).push(o); });
    for (const members of clusters.values()) {
      const pick = (k) => members.find((m) => m[k] != null)?.[k];
      const p = {
        id: `${sport}-${members.map((m) => m.id).sort()[0]}`,
        s: sport,
        lon: +(members.reduce((t, m) => t + m.lon, 0) / members.length).toFixed(5),
        lat: +(members.reduce((t, m) => t + m.lat, 0) / members.length).toFixed(5),
      };
      const name = bestName(members.map((m) => m.name));
      if (name) p.name = name;
      if (members.length > 1) p.courts = members.length;
      if (members.some((m) => m.indoor)) p.indoor = members.every((m) => m.indoor) ? true : "teils";
      for (const k of ["surface", "hours", "web", "fee"]) { const v = pick(k); if (v != null) p[k] = v; }
      p.osm = members.map((m) => m.id).slice(0, 3);
      places.push(p);
    }
  }
  return places.sort((a, b) => a.s.localeCompare(b.s) || (a.name || "~").localeCompare(b.name || "~", "de"));
}

/** Katalog für die App: nur Sportarten mit Orten oder mit Route; Zahl der Orte je Sportart. */
export function catalogFor(places) {
  const n = {};
  for (const p of places) n[p.s] = (n[p.s] || 0) + 1;
  return CATALOG.map((g) => ({
    group: g.group,
    sports: g.sports.filter((s) => s.route || n[s.id]).map((s) => ({ id: s.id, label: s.label, ...(s.route ? { route: s.route } : { count: n[s.id] }) })),
  })).filter((g) => g.sports.length);
}
