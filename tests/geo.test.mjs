import { test } from "node:test";
import assert from "node:assert/strict";
import { smoothElevations, haversine, lineLength, resample, profile, hikingMinutes, gradeClass, pisteGradeClass, durationClass, pisteDifficulty, hikeDifficulty, bbox } from "../app/js/geo.js";

test("haversine: Klagenfurt → Villach rund 36 km", () => {
  const d = haversine([14.3053, 46.6247], [13.8506, 46.6103]);
  assert.ok(d > 34000 && d < 36500, `war ${d}`);
});

test("resample hält Abstand und Endpunkte", () => {
  // ~1 km Linie nach Osten auf 46.7° N
  const line = [[13.9, 46.7], [13.9131, 46.7]];
  const pts = resample(line, 100);
  assert.deepEqual(pts[0], line[0]);
  assert.deepEqual(pts[pts.length - 1], line[1]);
  assert.ok(pts.length >= 10 && pts.length <= 12, `Punkte: ${pts.length}`);
  for (let i = 1; i < pts.length - 1; i++) {
    const d = haversine(pts[i - 1], pts[i]);
    assert.ok(Math.abs(d - 100) < 1, `Abstand ${d}`);
  }
});

test("profile: gleichmäßiger Hang 20 %", () => {
  // 1 km Linie, Höhe fällt von 1200 auf 1000 m → -20 %
  const pts = resample([[13.9, 46.7, 1200], [13.9131, 46.7, 1000]], 50);
  const p = profile(pts, 100);
  assert.equal(p.top_m, 1200);
  assert.equal(p.bottom_m, 1000);
  assert.ok(Math.abs(p.avg_grade + 20) < 0.6, `avg ${p.avg_grade}`);
  assert.ok(p.segments.length >= 9, `Segmente ${p.segments.length}`);
  assert.ok(p.segments.every((s) => s.g < -17 && s.g > -23), JSON.stringify(p.segments));
  assert.ok(p.descent_m > 190 && p.descent_m <= 200);
  assert.equal(p.ascent_m, 0);
});

test("profile: ohne Höhen leer", () => {
  const p = profile([[13.9, 46.7], [13.91, 46.7]]);
  assert.equal(p.segments.length, 0);
  assert.equal(p.top_m, null);
});

test("Gehzeit DIN 33466: 10 km, 800 Hm rauf, 800 runter", () => {
  // horizontal 150 min, vertikal 160+96 = 256 min → 256 + 75 = 331 min
  assert.equal(hikingMinutes(10000, 800, 800), 331);
});

test("Klassen", () => {
  assert.equal(gradeClass(-4), "down");
  assert.equal(gradeClass(2), "flat");
  assert.equal(gradeClass(12), "steep");
  assert.equal(pisteGradeClass(30), "red");
  assert.equal(durationClass(300), "day");
  assert.equal(pisteDifficulty({ "piste:difficulty": "advanced" }), "advanced");
  assert.equal(pisteDifficulty({ "piste:type": "downhill" }), "unknown");
  assert.equal(hikeDifficulty({ sac_scale: "demanding_mountain_hiking" }), "hard");
});

test("bbox", () => {
  assert.deepEqual(bbox([[1, 2], [3, -1], [0, 5]]), [0, -1, 3, 5]);
  assert.ok(lineLength([[0, 0], [0, 0]]) === 0);
});

import { profileParts } from "../app/js/geo.js";

test("profileParts zählt die Lücke zwischen Teilstücken nicht als Strecke oder Steigung", () => {
  // zwei Teilstücke, 1 km auseinander und 500 m Höhenunterschied in der Lücke
  const partA = [[13.0, 46.0, 1000], [13.0, 46.009, 1100]];       // ~1 km, +100 m
  const partB = [[13.1, 46.0, 1600], [13.1, 46.009, 1650]];       // ~1 km, +50 m
  const p = profileParts([partA, partB], 100);
  assert.ok(p.length_m > 1900 && p.length_m < 2100, "Länge ohne Sprung: " + p.length_m);
  assert.equal(p.ascent_m, 150);
  assert.equal(p.descent_m, 0);
  assert.ok(p.max_grade < 15, "keine Fantasie-Rampe: " + p.max_grade);
  assert.equal(p.top_m, 1650);
  assert.equal(p.bottom_m, 1000);
});

test("smoothElevations: Ausreißer verschwindet, Hang bleibt", () => {
  const pts = resample([[13.9, 46.7, 1200], [13.9131, 46.7, 1000]], 50);
  const i = Math.floor(pts.length / 2);
  const orig = pts[i][2];
  pts[i] = [pts[i][0], pts[i][1], orig + 80]; // einzelne Felskante im Höhenmodell
  const raw = profile(pts, 100);
  const sm = smoothElevations(pts);
  assert.ok(Math.abs(sm[i][2] - orig) < 10, `Spitze bleibt: ${sm[i][2]}`);
  assert.ok(raw.segments.every((s) => s.g < -12 && s.g > -30), `ohne Glättung wären es ±60 %: ${JSON.stringify(raw.segments.map((s) => s.g))}`);
  assert.equal(sm[0][2], 1200); assert.equal(sm[sm.length - 1][2], 1000);
});
