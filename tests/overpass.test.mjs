import { test } from "node:test";
import assert from "node:assert/strict";
import { toGeoJSON, skiKind, skiQuery, routeQuery } from "../scripts/lib/overpass.mjs";

const sample = {
  elements: [
    { type: "way", id: 1, tags: { "piste:type": "downhill", "piste:difficulty": "intermediate", name: "Feuerbergabfahrt", ref: "20" },
      geometry: [{ lat: 46.69, lon: 13.91 }, { lat: 46.685, lon: 13.915 }, { lat: 46.68, lon: 13.92 }] },
    { type: "way", id: 2, tags: { aerialway: "gondola", name: "Kanzelbahn I" }, geometry: [{ lat: 46.65, lon: 13.9 }, { lat: 46.68, lon: 13.905 }] },
    { type: "way", id: 3, tags: { "piste:type": "downhill", area: "yes" }, geometry: [{ lat: 46.7, lon: 13.9 }, { lat: 46.7, lon: 13.91 }, { lat: 46.71, lon: 13.91 }, { lat: 46.71, lon: 13.9 }, { lat: 46.7, lon: 13.9 }] },
    { type: "relation", id: 4, tags: { route: "hiking", name: "Alpe-Adria-Trail" }, members: [
      { type: "way", ref: 10, role: "", geometry: [{ lat: 47, lon: 12.8 }, { lat: 47, lon: 12.81 }] },
      { type: "way", ref: 11, role: "", geometry: [{ lat: 47, lon: 12.81 }, { lat: 46.99, lon: 12.82 }] },
      { type: "node", ref: 12, role: "guidepost" } ] },
    { type: "way", id: 5, tags: { "piste:type": "nordic" }, geometry: [{ lat: 46.7, lon: 13.3 }] },
  ],
};

test("toGeoJSON: Linien, Flächen, Relationen", () => {
  const fc = toGeoJSON(sample, skiKind);
  assert.equal(fc.features.length, 4, "zu kurzer Weg wird verworfen");
  const [piste, lift, area, rel] = fc.features;
  assert.equal(piste.geometry.type, "LineString");
  assert.equal(piste.properties.kind, "piste");
  assert.equal(piste.properties["piste:difficulty"], "intermediate");
  assert.equal(piste.id, "way/1");
  assert.equal(lift.properties.kind, "lift");
  assert.equal(area.geometry.type, "Polygon");
  assert.equal(rel.geometry.type, "MultiLineString");
  assert.equal(rel.geometry.coordinates.length, 2);
  assert.deepEqual(rel.geometry.coordinates[0][0], [12.8, 47]);
});

test("Abfragen enthalten Bounding-Box in Overpass-Reihenfolge S,W,N,E", () => {
  const q = skiQuery({ bbox: [13.84, 46.63, 14.0, 46.74] });
  assert.match(q, /46\.63,13\.84,46\.74,14/);
  assert.match(q, /piste:type/);
  assert.match(q, /aerialway/);
  const r = routeQuery({ type: "hike", name: "Alpe-Adria-Trail", bbox: [12.7, 46.4, 14.6, 47.1], osm: { route: "hiking" } });
  assert.match(r, /route"~"\^\(hiking\|foot\)\$"/);
  assert.match(r, /Alpe-Adria-Trail/);
  const b = routeQuery({ type: "bike", name: "X", bbox: [0, 0, 1, 1], osm: { relation_name: "Drau(radweg)?", route: "bicycle" } });
  assert.match(b, /"name"~"Drau\(radweg\)\?",i/, "relation_name wird als Regex übernommen");
  const c = routeQuery({ type: "hike", name: "Weg (Nord) 1.", bbox: [0, 0, 1, 1], osm: {} });
  assert.match(c, /"name"~"Weg .Nord. 1.",i/, "Sonderzeichen im Klarnamen werden zu Platzhaltern");
});
