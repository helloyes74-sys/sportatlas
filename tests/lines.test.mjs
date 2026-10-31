import { test } from "node:test";
import assert from "node:assert/strict";
import { chainLines, clipLine, partsOf, geometryOf } from "../scripts/lib/lines.mjs";

test("chainLines hängt ungeordnete, teils umgedrehte Stücke zu einer Linie zusammen", () => {
  const a = [[0, 0], [1, 0]], b = [[2, 0], [1, 0]], c = [[2, 0], [3, 0]], loose = [[9, 9], [9, 10]];
  const lines = chainLines([c, loose, a, b]);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0], [[0, 0], [1, 0], [2, 0], [3, 0]]);
  assert.deepEqual(lines[1], loose);
});

test("chainLines verlängert auch am Anfang", () => {
  const lines = chainLines([[[1, 0], [2, 0]], [[0, 0], [1, 0]]]);
  assert.deepEqual(lines, [[[0, 0], [1, 0], [2, 0]]]);
});

test("clipLine schneidet am Rand und teilt in Stücke", () => {
  const bbox = [0, 0, 10, 10];
  // rein, raus, Segment ganz außen das die Ecke durchquert, wieder rein
  const parts = clipLine([[-5, 5], [5, 5], [15, 5], [5, 12], [5, 8]], bbox);
  assert.equal(parts.length, 3);
  assert.deepEqual(parts[0], [[0, 5], [5, 5], [10, 5]]);
  assert.deepEqual(parts[1][0], [10, 8.5]);
  assert.ok(Math.abs(parts[1][1][1] - 10) < 1e-9);
  assert.deepEqual(parts[2], [[5, 10], [5, 8]]);
});

test("clipLine lässt Linien ganz innen unverändert und wirft Linien ganz außen weg", () => {
  assert.deepEqual(clipLine([[1, 1], [2, 2], [3, 1]], [0, 0, 10, 10]), [[[1, 1], [2, 2], [3, 1]]]);
  assert.deepEqual(clipLine([[20, 20], [30, 30]], [0, 0, 10, 10]), []);
});

test("clipLine behält Höhenwerte als dritte Koordinate", () => {
  const parts = clipLine([[-5, 5, 100], [5, 5, 200]], [0, 0, 10, 10]);
  assert.equal(parts[0][0].length, 3);
});

test("partsOf/geometryOf runden ab", () => {
  assert.deepEqual(partsOf({ type: "LineString", coordinates: [[0, 0], [1, 1]] }), [[[0, 0], [1, 1]]]);
  assert.equal(geometryOf([]), null);
  assert.equal(geometryOf([[[0, 0], [1, 1]]]).type, "LineString");
  assert.equal(geometryOf([[[0, 0], [1, 1]], [[2, 2], [3, 3]]]).type, "MultiLineString");
});

import { shapeRoute } from "../scripts/lib/lines.mjs";

test("shapeRoute verschmilzt Straßenstücke zu einer Linie und markiert Anstiege", () => {
  const fc = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { kind: "bike", osm_id: 1 }, geometry: { type: "LineString", coordinates: [[1, 0], [2, 0]] } },
    { type: "Feature", properties: { kind: "bike", osm_id: 2 }, geometry: { type: "LineString", coordinates: [[0, 0], [1, 0]] } },
  ] };
  const out = shapeRoute(fc, { id: "pass", name: "Passstraße", kind: "Rennrad-Anstieg", bbox: [-1, -1, 5, 5], osm: { way_name: "Pass" } });
  assert.equal(out.features.length, 1);
  assert.equal(out.features[0].geometry.type, "LineString");
  assert.deepEqual(out.features[0].geometry.coordinates, [[0, 0], [1, 0], [2, 0]]);
  assert.equal(out.features[0].properties.orient, "uphill");
  assert.equal(out.features[0].properties.name, "Passstraße");
});

test("shapeRoute schneidet eine Relation an der Bounding-Box ab", () => {
  const fc = { type: "FeatureCollection", features: [
    { type: "Feature", properties: { kind: "bike", osm_id: 7, name: "Drauradweg" }, geometry: { type: "MultiLineString", coordinates: [[[-5, 1], [5, 1]], [[5, 1], [20, 1]]] } },
  ] };
  const out = shapeRoute(fc, { id: "e", name: "Etappe", kind: "Radweg-Etappe", bbox: [0, 0, 10, 10], osm: { relation_ids: [7], clip: true } });
  assert.equal(out.features.length, 1);
  assert.deepEqual(out.features[0].geometry, { type: "LineString", coordinates: [[0, 1], [5, 1], [10, 1]] });
  assert.equal(out.features[0].properties.orient, undefined);
});

import { orderParts } from "../scripts/lib/lines.mjs";

test("orderParts beginnt am abgelegenen Routenende und reiht Teilstücke der Nähe nach", () => {
  // drei Stücke einer Linie von (0,0) nach (3,0) mit kleinen Lücken, durcheinander und teils umgedreht
  const a = [[0, 0], [0.9, 0]], b = [[2.1, 0], [1.1, 0]], c = [[2.2, 0], [3, 0]];
  const ordered = orderParts([c, a, b]);
  const flat = ordered.flat().map((p) => p[0]);
  // entweder aufsteigend von 0 nach 3 oder absteigend von 3 nach 0 – beide Enden sind gleich weit „außen“
  const asc = flat.every((x, i) => i === 0 || x >= flat[i - 1]);
  const desc = flat.every((x, i) => i === 0 || x <= flat[i - 1]);
  assert.ok(asc || desc, JSON.stringify(flat));
  assert.equal(ordered.length, 3);
});

test("orderParts lässt ein einzelnes Teilstück unverändert", () => {
  assert.deepEqual(orderParts([[[0, 0], [1, 1]]]), [[[0, 0], [1, 1]]]);
});

import { consolidatePistes, pisteIdent } from "../scripts/lib/lines.mjs";

const way = (id, coords, props) => ({ type: "Feature", id: `way/${id}`, properties: { osm_type: "way", osm_id: id, kind: "piste", ...props }, geometry: { type: "LineString", coordinates: coords } });
const L = (x0, x1, y = 46.7) => Array.from({ length: Math.round(Math.abs(x1 - x0) / 0.001) + 1 }, (_, i) => [x0 + Math.sign(x1 - x0) * i * 0.001, y]); // 0,001° ≈ 76 m

test("pisteIdent: Nummer aus Namen lösen", () => {
  assert.deepEqual(pisteIdent({ name: "18 - Märchenwald" }), { ref: "18", name: "Märchenwald" });
  assert.deepEqual(pisteIdent({ ref: "35", name: "35 - Direttissima" }), { ref: "35", name: "Direttissima" });
  assert.deepEqual(pisteIdent({ name: "9" }), { ref: "9", name: "" });
  assert.deepEqual(pisteIdent({ ref: "1", name: "Kaiserburgabfahrt" }), { ref: "1", name: "Kaiserburgabfahrt" });
});

test("consolidatePistes: gleiche Nummer wird eine Piste, kurze namenlose Stücke hängen an", () => {
  const feats = [
    way(1, L(13.0, 13.01), { ref: "7", name: "Strohsackabfahrt", "piste:difficulty": "intermediate" }),
    way(2, L(13.01, 13.02), { ref: "7", name: "Strohsackabfahrt", "piste:difficulty": "intermediate", lit: "yes" }),
    way(3, L(13.02, 13.022), { "piste:difficulty": "easy" }),                 // kurzer Ausläufer an Piste 7
    way(4, L(13.1, 13.11), { name: "Kaiserburgabfahrt", "piste:difficulty": "intermediate" }),
    way(5, L(13.11, 13.12), { ref: "1", name: "Kaiserburgabfahrt", "piste:difficulty": "intermediate" }),
    way(6, L(13.5, 13.503), { "piste:difficulty": "easy" }),                 // frei, kurz → Verbindungswege
    way(7, L(13.6, 13.61), { "piste:difficulty": "advanced" }),              // frei, 760 m → eigene Piste
    { type: "Feature", id: "way/8", properties: { osm_type: "way", osm_id: 8, kind: "lift", aerialway: "chair_lift" }, geometry: { type: "LineString", coordinates: L(13.0, 13.02, 46.71) } },
  ];
  const out = consolidatePistes(feats);
  const pistes = out.filter((f) => f.properties.kind === "piste");
  const byName = Object.fromEntries(pistes.map((f) => [f.properties.display_name, f]));
  assert.equal(out.filter((f) => f.properties.kind === "lift").length, 1, "Lift bleibt");
  assert.ok(byName["7 Strohsackabfahrt"], Object.keys(byName).join(", "));
  assert.equal(byName["7 Strohsackabfahrt"].properties.merged_ways, 3);
  assert.equal(byName["7 Strohsackabfahrt"].geometry.type, "LineString", "verkettet");
  assert.equal(byName["7 Strohsackabfahrt"].properties.lit, "yes");
  assert.equal(byName["7 Strohsackabfahrt"].properties["piste:difficulty"], "intermediate");
  assert.equal(byName["1 Kaiserburgabfahrt"].properties.merged_ways, 2, "Nur-Name geht in Nummern-Gruppe auf");
  assert.ok(byName["Verbindungswege"]?.properties.connector);
  assert.equal(byName["Piste ohne Namen"].properties["piste:difficulty"], "advanced");
  assert.equal(pistes.length, 4);
});

test("consolidatePistes: gleiche Nummer weit entfernt bleibt getrennt", () => {
  const out = consolidatePistes([
    way(1, L(13.0, 13.01), { ref: "3", "piste:difficulty": "easy" }),
    way(2, L(13.3, 13.31), { ref: "3", "piste:difficulty": "easy" }), // 23 km weiter
  ]);
  assert.equal(out.length, 2);
  assert.ok(out.every((f) => f.properties.display_name === "Piste 3"));
});

import { keepConnected } from "../scripts/lib/lines.mjs";
test("keepConnected: Nachbargebiet ohne Verbindung fliegt raus, Lücke bis 600 m bleibt", () => {
  const lift = (id, a, b) => ({ type: "Feature", id: `way/${id}`, properties: { osm_type: "way", osm_id: id, kind: "lift", aerialway: "chair_lift" }, geometry: { type: "LineString", coordinates: [a, b] } });
  const feats = [
    lift(1, [13.0, 46.7], [13.01, 46.71]),               // Hauptgebiet
    way(2, L(13.01, 13.02, 46.71), { ref: "1" }),       // berührt Lift 1
    way(3, L(13.025, 13.03, 46.71), { ref: "2" }),      // 380 m Lücke → bleibt
    lift(4, [13.3, 46.7], [13.31, 46.71]),              // 23 km weiter: anderes Gebiet
    way(5, L(13.31, 13.32, 46.71), { ref: "1" }),
    { type: "Feature", id: "way/6", properties: { osm_type: "way", osm_id: 6, kind: "piste" }, geometry: { type: "Polygon", coordinates: [[[13.3, 46.7], [13.31, 46.7], [13.31, 46.71], [13.3, 46.7]]] } },
  ];
  const out = keepConnected(feats, [13.005, 46.705]);
  assert.deepEqual(out.map((f) => f.properties.osm_id), [1, 2, 3, 6]);
});

test("consolidatePistes: Loipen und Pisten bleiben getrennt, keine doppelten osm_ids, Nummer nur einmal aus dem Pistenplan", () => {
  const xc = (id, coords, props) => way(id, coords, { kind: "xc", ...props });
  const feats = [
    way(1, L(13.0, 13.01), { ref: "23", name: "Schwarzseeabfahrt", "piste:difficulty": "intermediate" }),
    xc(2, L(13.01, 13.015), { name: "Schwarzsee Loipe", "piste:grooming": "classic" }), // berührt Piste 23, ist aber Loipe
    way(3, L(13.3, 13.31), { ref: "10", name: "Petersbründl-Trainingspiste" }),      // gleiche Nummer, 23 km weiter
    way(4, L(13.0, 13.012, 46.72), { ref: "10", name: "Freibergpiste Süd" }),
    way(5, [[13.5, 46.7], [13.502, 46.7]], {}),                                        // T-Stück an 6
    way(6, L(13.5, 13.505), {}),
    way(7, [[13.5, 46.7], [13.5, 46.702]], {}),
  ];
  const out = consolidatePistes(feats, { kinds: ["piste", "xc"], official: [{ ref: "10", name: "Freibergpiste Süd", difficulty: "intermediate" }] });
  const names = out.map((f) => f.properties.display_name);
  assert.ok(names.includes("Schwarzsee Loipe"), names.join(", "));
  assert.equal(out.find((f) => f.properties.display_name === "23 Schwarzseeabfahrt").properties.merged_ways, 1);
  assert.equal(out.filter((f) => f.properties.official).length, 1);
  assert.equal(out.find((f) => f.properties.official).properties.name, "Freibergpiste Süd");
  assert.ok(names.includes("10 Petersbründl-Trainingspiste"));
  const ids = out.flatMap((f) => f.properties.osm_ids);
  assert.equal(new Set(ids).size, ids.length, "jeder Weg genau einmal: " + ids.join(","));
});

test("keepConnected: Startgruppe braucht einen Lift, auch wenn eine Loipe näher am Mittelpunkt liegt", () => {
  const lift = (id, a, b) => ({ type: "Feature", id: `way/${id}`, properties: { osm_type: "way", osm_id: id, kind: "lift", aerialway: "chair_lift" }, geometry: { type: "LineString", coordinates: [a, b] } });
  const out = keepConnected([
    way(1, L(13.0, 13.003, 46.75), { kind: "xc" }),          // Loipe nahe am (ungefähren) Mittelpunkt
    lift(2, [13.05, 46.70], [13.06, 46.71]),                 // Skigebiet 5 km weiter
    way(3, L(13.06, 13.07, 46.71), { ref: "1" }),
  ], [13.0, 46.748]);
  assert.deepEqual(out.map((f) => f.properties.osm_id), [2, 3]);
});
