import test from "node:test";
import assert from "node:assert";
import { Sim, PRESETS } from "../public/sim.js";

// Identical pools with c1 + c2 = 1 must reproduce one-substrate Gray-Scott.
test("symmetric pools match classic Gray-Scott", () => {
  const s = new Sim(48, 48);
  s.p = { ...PRESETS["classic (A1 = A2)"] };
  const a = new Float64Array(48 * 48).fill(1), b = new Float64Array(48 * 48);
  const copyB = () => s.b.forEach((v, i) => (b[i] = v));
  s.a1.fill(1); s.a2.fill(1); s.b.fill(0); s.paint(24, 24, 4);
  s.a1.forEach((v, i) => (a[i] = v)); copyB();
  const { f1: f, k, D1: Da, DB: Db } = s.p;
  const w = 48; let A = Float64Array.from(a), B = Float64Array.from(b);
  for (let t = 0; t < 200; t++) {
    const nA = new Float64Array(A.length), nB = new Float64Array(B.length);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, l = y * w + (x + w - 1) % w, r = y * w + (x + 1) % w;
      const u = ((y + w - 1) % w) * w + x, d = ((y + 1) % w) * w + x;
      const rr = A[i] * B[i] * B[i];
      nA[i] = A[i] + Da * (A[l] + A[r] + A[u] + A[d] - 4 * A[i]) - rr + f * (1 - A[i]);
      nB[i] = B[i] + Db * (B[l] + B[r] + B[u] + B[d] - 4 * B[i]) + rr - (f + k) * B[i];
    }
    A = nA; B = nB;
  }
  s.step(200);
  for (let i = 0; i < B.length; i++) assert.ok(Math.abs(B[i] - s.b[i]) < 1e-4);
});

test("presets stay finite and keep B alive", () => {
  for (const [name, p] of Object.entries(PRESETS)) {
    const s = new Sim(96, 96); s.p = { ...p }; s.step(3000);
    const st = s.stats();
    assert.ok(Number.isFinite(st.mean) && st.max > 0.05, name);
  }
});
