import test from "node:test";
import assert from "node:assert";
import { hilbertAxes } from "../public/lib/hilbert.js";

// A Hilbert curve visits every cell once, and consecutive cells are
// face-neighbours (L1 distance exactly 1).
for (const [n, p] of [[2, 3], [3, 2], [4, 2], [5, 2], [6, 1], [8, 1]]) {
  test(`hilbert n=${n} p=${p} is a continuous bijection`, () => {
    const total = 2 ** (n * p);
    const seen = new Set();
    let prev = null;
    for (let h = 0; h < total; h++) {
      const c = Array.from(hilbertAxes(h, n, p, new Array(n)));
      seen.add(c.join(","));
      for (const v of c) assert.ok(v >= 0 && v < 2 ** p);
      if (prev) {
        const d = c.reduce((s, v, i) => s + Math.abs(v - prev[i]), 0);
        assert.strictEqual(d, 1, `step ${h}`);
      }
      prev = c;
    }
    assert.strictEqual(seen.size, total);
  });
}
