import { test } from "node:test";
import assert from "node:assert/strict";
import { safeUrl } from "../app/js/spots.js";

test("safeUrl lässt nur http(s) durch", () => {
  assert.equal(safeUrl("https://padel.at/"), "https://padel.at/");
  assert.equal(safeUrl("www.tc-klagenfurt.at"), "https://www.tc-klagenfurt.at/");
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl(" JavaScript:alert(1)"), null);
  assert.equal(safeUrl("data:text/html,<script>x</script>"), null);
  assert.equal(safeUrl(""), null);
});
