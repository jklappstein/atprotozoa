import test from "node:test";
import assert from "node:assert";
import { normalize, toXY, fromXY, SQ3 } from "../public/lib/ternary.js";
import { GENRES } from "../public/lib/genres.js";

test("corners", () => {
  assert.deepStrictEqual(toXY([1, 0, 0]), [0.5, 0]);
  assert.deepStrictEqual(toXY([0, 1, 0]), [0, SQ3]);
  assert.deepStrictEqual(toXY([0, 0, 1]), [1, SQ3]);
});
test("roundtrip", () => {
  const p = normalize(2, 3, 5);
  const q = fromXY(...toXY(p));
  p.forEach((v, i) => assert.ok(Math.abs(v - q[i]) < 1e-9));
});
test("outside is null", () => assert.strictEqual(fromXY(2, 0.1), null));
test("normalize degenerate", () => assert.strictEqual(normalize(0, 0, 0)[0], 1 / 3));
test("genres sum to 1 and have unique ids", () => {
  const ids = new Set();
  for (const g of GENRES) {
    assert.ok(Math.abs(g.m + g.h + g.r - 1) < 0.011, g.id + " sums to " + (g.m + g.h + g.r));
    assert.ok(!ids.has(g.id)); ids.add(g.id);
  }
});
