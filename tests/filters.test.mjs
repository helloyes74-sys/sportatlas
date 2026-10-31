import { test } from "node:test";
import assert from "node:assert/strict";
import { filterGroups, applyFilters, distanceKm } from "../app/js/filters.js";
import { toGPX } from "../app/js/gpx.js";

const areas = [
  { id: "a", type: "hike", kind: "Klammwanderung", difficulty: 1, duration_min: 90, ascent_m: 200, center: [13.9, 46.6] },
  { id: "b", type: "hike", kind: "Gipfelwanderung", difficulty: 2, duration_min: 300, ascent_m: 950, center: [14.3, 46.5] },
  { id: "c", type: "bike", kind: "Rennrad-Anstieg", length_km: 16, ascent_m: 1200, center: [13.7, 46.6] },
];

test("Filter: ODER in der Gruppe, UND zwischen Gruppen", () => {
  const g = filterGroups("hike", areas);
  assert.ok(g.find((x) => x.id === "art").options.length === 2);
  assert.deepEqual(applyFilters(areas.filter((a) => a.type === "hike"), g, { niveau: new Set(["leicht"]) }).map((a) => a.id), ["a"]);
  assert.deepEqual(applyFilters(areas.filter((a) => a.type === "hike"), g, { niveau: new Set(["leicht", "mittel"]), hm: new Set(["viel"]) }).map((a) => a.id), ["b"]);
  assert.equal(applyFilters(areas, g, {}).length, 3);
});

test("Entfernung Klagenfurt → Gerlitzen rund 25 km", () => {
  const d = distanceKm([14.305, 46.623], { center: [13.912, 46.694] });
  assert.ok(d > 25 && d < 32, String(d));
});

test("GPX enthält Track, Punkte und Höhen", () => {
  const geo = { features: [{ properties: { osm_id: 1, name: "Weg", kind: "hike" }, geometry: { type: "LineString", coordinates: [[13.9, 46.6, 500], [13.91, 46.61, 620]] } }] };
  const gpx = toGPX(geo, { id: "x", name: "Test", type: "hike" });
  assert.match(gpx, /<trk>[\s\S]*<name>Weg<\/name>/);
  assert.match(gpx, /<trkpt lat="46.600000" lon="13.900000"><ele>500<\/ele>/);
  assert.equal((gpx.match(/<trkpt/g) || []).length, 2);
});
