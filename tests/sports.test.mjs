import { test } from "node:test";
import assert from "node:assert/strict";
import { sportsOf, groupOf, summarize } from "../scripts/lib/sports.mjs";

test("sportsOf trennt Mehrfachwerte und nimmt leisure als Ersatz", () => {
  assert.deepEqual(sportsOf({ sport: "tennis;Padel" }), ["tennis", "padel"]);
  assert.deepEqual(sportsOf({ leisure: "golf_course" }), ["golf_course"]);
  assert.deepEqual(sportsOf({ leisure: "park" }), []);
});

test("groupOf ordnet zu, Unbekanntes kommt in Sonstiges", () => {
  assert.equal(groupOf("padel"), "Schlägersport");
  assert.equal(groupOf("golf_course"), "Golf");
  assert.equal(groupOf("quidditch"), "Sonstiges");
});

test("summarize zählt einen Ort je Gruppe nur einmal", () => {
  const s = summarize([{ sports: ["tennis", "padel"] }, { sports: ["padel"] }, { sports: ["soccer"] }]);
  assert.equal(s["Schlägersport"].total, 2);
  assert.equal(s["Schlägersport"].sports.padel, 2);
  assert.equal(s["Ballsport im Team"].total, 1);
});
