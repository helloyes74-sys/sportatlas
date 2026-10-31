import { test } from "node:test";
import assert from "node:assert/strict";
import { kmeans, computeSectors, azimuth, zoomForRadius } from "../app/js/sectors.js";

const line = (name, kind, pts, extra = {}) => ({ type: "Feature", properties: { kind, name, display_name: name, length_m: 1000, top_m: Math.max(...pts.map((p) => p[2] || 0)), ...extra }, geometry: { type: "LineString", coordinates: pts } });

test("kmeans trennt zwei klar getrennte Gruppen", () => {
  const pts = [[13.90, 46.69], [13.901, 46.691], [13.902, 46.690], [13.95, 46.65], [13.951, 46.651], [13.952, 46.652]];
  const g = kmeans(pts, 2);
  assert.equal(g.length, 2);
  assert.deepEqual(g.map((x) => x.slice().sort().join(",")).sort(), ["0,1,2", "3,4,5"]);
});

test("azimuth und zoomForRadius", () => {
  assert.ok(Math.abs(azimuth([13.9, 46.7], [13.9, 46.8]) - 0) < 1, "nach Norden");
  assert.ok(Math.abs(azimuth([13.9, 46.7], [14.0, 46.7]) - 90) < 1, "nach Osten");
  assert.ok(zoomForRadius(300, 46.7) > zoomForRadius(3000, 46.7), "kleiner Radius → näher heran");
  assert.ok(zoomForRadius(50, 46.7) <= 15 && zoomForRadius(50000, 46.7) >= 12, "Grenzen eingehalten");
});

test("computeSectors für ein Skigebiet: Gruppen, Namen nach Lift, Blick bergauf", () => {
  const feats = [];
  // Gipfelsektor um (13.91, 46.69) mit Lift, Talsektor um (13.95, 46.65)
  for (let i = 0; i < 25; i++) feats.push(line(`Piste ${i}`, "piste", [[13.91 + i * 0.0003, 46.69, 1900], [13.912 + i * 0.0003, 46.688, 1700]]));
  feats.push(line("Gipfelbahn 4er-Sesselbahn", "lift", [[13.912, 46.686, 1500], [13.91, 46.692, 1900]], { length_m: 2000 }));
  for (let i = 0; i < 25; i++) feats.push(line(`Talpiste ${i}`, "piste", [[13.95 + i * 0.0003, 46.65, 1200], [13.952 + i * 0.0003, 46.648, 1000]]));
  const sectors = computeSectors({ features: feats }, { type: "ski", center: [13.93, 46.67] });
  assert.equal(sectors.length, 2);
  assert.equal(sectors[0].name, "Gipfelbahn Sesselbahn", "längster Lift gibt den Namen, Sitzplatz-Zusatz fällt weg");
  assert.ok(sectors[0].top_m > sectors[1].top_m, "höchster Sektor zuerst");
  assert.ok(sectors[0].zoom >= 12 && sectors[0].zoom <= 15);
  // der höchste Punkt liegt nördlich/westlich des Mittelpunkts → Blick dorthin
  assert.ok(sectors[0].bearing >= 270 || sectors[0].bearing <= 45, `bearing ${sectors[0].bearing}`);
});

test("computeSectors für Routen: Start, Mitte, Ziel", () => {
  const feats = [line("Drauradweg", "bike", [[13.0, 46.7, 600], [13.5, 46.7, 550], [14.0, 46.65, 500]])];
  const s = computeSectors({ features: feats }, { type: "bike", center: [13.5, 46.7] });
  assert.deepEqual(s.map((x) => x.name), ["Start", "Mitte", "Ziel"]);
  assert.deepEqual(s[0].center, [13.0, 46.7]);
  assert.ok(Math.abs(s[0].bearing - 90) < 15, "Start schaut in Laufrichtung (Osten)");
  assert.deepEqual(computeSectors({ features: [] }, { type: "ski", center: [0, 0] }), []);
});
