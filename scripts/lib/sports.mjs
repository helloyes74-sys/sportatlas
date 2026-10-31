// Sportarten aus OSM-Tags (sport=*, leisure=*) erkennen und in Gruppen einteilen.
// Wird von fetch-sportorte.mjs und den Tests genutzt.

/** Gruppe → Liste von OSM-Werten (sport=* bzw. leisure=*). Reihenfolge = Anzeige. */
export const GROUPS = {
  "Schlägersport": ["tennis", "padel", "table_tennis", "badminton", "squash", "pickleball", "racquet", "beachtennis", "paddle_tennis"],
  "Golf": ["golf", "golf_course", "minigolf", "miniature_golf", "disc_golf", "disc_golf_course", "footgolf", "crazy_golf"],
  "Ballsport im Team": ["soccer", "basketball", "volleyball", "beachvolleyball", "handball", "american_football", "rugby", "rugby_union", "hockey", "field_hockey", "baseball", "cricket", "futsal", "floorball", "multi", "teqball", "netball", "korfball", "fistball", "faustball"],
  "Wasser": ["swimming", "swimming_pool", "water_park", "swimming_area", "diving", "scuba_diving", "sailing", "rowing", "canoe", "kayak", "surfing", "kitesurfing", "windsurfing", "water_ski", "wakeboard", "stand_up_paddleboarding", "water_polo", "fishing"],
  "Rad und Rollen": ["cycling", "bmx", "mtb", "pump_track", "skateboard", "roller_skating", "inline_skating", "scooter"],
  "Klettern": ["climbing", "bouldering", "climbing_adventure", "via_ferrata"],
  "Fitness und Laufen": ["fitness", "fitness_station", "running", "athletics", "track", "calisthenics", "gymnastics", "yoga", "crossfit", "parkour", "obstacle_course", "trampoline", "trampoline_park"],
  "Winter und Eis": ["ice_skating", "ice_rink", "ice_hockey", "skiing", "ski_jumping", "biathlon", "curling", "ice_stock", "toboggan", "sledding"],
  "Kegeln und Zielen": ["bowling", "bowling_alley", "10pin", "9pin", "boules", "petanque", "bocce", "shooting", "archery", "darts", "billiards", "kegeln"],
  "Pferd und Tier": ["equestrian", "horse_riding", "horse_racing", "dog_agility", "dog_racing"],
  "Motor und Luft": ["motor", "motocross", "karting", "motorsport", "model_aerodrome", "rc_car", "free_flying", "paragliding", "hang_gliding", "gliding", "skydiving", "aeronautics"],
  "Kampfsport": ["martial_arts", "boxing", "judo", "karate", "taekwondo", "wrestling", "fencing", "kickboxing"],
  "Denksport": ["chess"],
};

const LOOKUP = new Map();
for (const [g, vals] of Object.entries(GROUPS)) for (const v of vals) LOOKUP.set(v, g);

/** leisure-Werte, die selbst eine Sportart sind (auch ohne sport=*). */
export const LEISURE_SPORTS = ["golf_course", "miniature_golf", "disc_golf_course", "ice_rink", "fitness_station", "horse_riding", "water_park", "swimming_area", "swimming_pool", "bowling_alley", "trampoline_park", "track"];

/** Sportarten eines OSM-Objekts als Liste (Kleinbuchstaben, ohne Dubletten). */
export function sportsOf(tags = {}) {
  const out = new Set();
  for (const s of String(tags.sport || "").split(/[;,]/)) {
    const v = s.trim().toLowerCase().replace(/\s+/g, "_");
    if (v) out.add(v);
  }
  if (!out.size && LEISURE_SPORTS.includes(tags.leisure)) out.add(tags.leisure);
  return [...out];
}

/** Gruppe zu einer Sportart; unbekannte Werte landen in „Sonstiges“. */
export const groupOf = (sport) => LOOKUP.get(sport) || "Sonstiges";

/** Zählt Orte je Gruppe und Sportart. orte: [{sports:[…]}] */
export function summarize(orte) {
  const groups = {};
  for (const o of orte) {
    for (const s of o.sports) {
      const g = groupOf(s);
      groups[g] ??= { total: 0, sports: {} };
      groups[g].sports[s] = (groups[g].sports[s] || 0) + 1;
    }
    for (const g of new Set(o.sports.map(groupOf))) groups[g].total++;
  }
  return groups;
}
