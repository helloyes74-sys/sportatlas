import { test } from "node:test";
import assert from "node:assert/strict";
import { sportsOf, catalogSport, buildPlaces, catalogFor } from "../scripts/lib/sports.mjs";

test("sportsOf trennt Mehrfachwerte und nimmt leisure als Ersatz", () => {
  assert.deepEqual(sportsOf({ sport: "tennis;Padel" }), ["tennis", "padel"]);
  assert.deepEqual(sportsOf({ leisure: "golf_course" }), ["golf_course"]);
  assert.deepEqual(sportsOf({ leisure: "park" }), []);
});

test("Katalog: Golf und Minigolf getrennt, Ausgelassenes ist null", () => {
  assert.equal(catalogSport("golf_course"), "golf");
  assert.equal(catalogSport("miniature_golf"), "minigolf");
  for (const v of ["soccer", "table_tennis", "equestrian", "canoe", "ski_jumping", "summer_toboggan"]) assert.equal(catalogSport(v), null, v);
});

test("buildPlaces fasst die Courts eines Tennisclubs zusammen", () => {
  const court = (i, lon, name) => ({ id: "w" + i, lon, lat: 46.62, sports: ["tennis"], ...(name ? { name } : {}) });
  const places = buildPlaces([
    court(1, 14.3000, "TC Klagenfurt"), court(2, 14.3005), court(3, 14.3010, "TC Klagenfurt"),
    court(4, 14.4000), // gut 7 km weiter: eigener Ort
    { id: "n9", lon: 14.3, lat: 46.62, sports: ["soccer"] },
  ]);
  assert.equal(places.length, 2);
  const club = places.find((p) => p.name === "TC Klagenfurt");
  assert.equal(club.courts, 3);
  assert.equal(club.s, "tennis");
});

test("Kilometertafeln eines Laufs sind keine Orte", () => {
  assert.equal(buildPlaces([{ id: "n1", lon: 14, lat: 46, sports: ["running"], name: "KM 3 (Draurad Marathon)" }]).length, 0);
});

test("catalogFor behält Routen-Sportarten und zählt Orte", () => {
  const cat = catalogFor([{ s: "padel" }, { s: "padel" }]);
  const winter = cat.find((g) => g.group === "Winter");
  assert.deepEqual(winter.sports.map((s) => s.id), ["ski", "xc"]);
  assert.equal(cat.find((g) => g.group === "Schlägersport").sports[0].count, 2);
});
