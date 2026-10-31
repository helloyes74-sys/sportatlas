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
