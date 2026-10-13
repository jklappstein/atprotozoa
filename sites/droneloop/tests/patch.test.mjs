import test from "node:test";
import assert from "node:assert";
import { normalizePatch, defaultPatch, randomPatch } from "../public/lib/synth.js";

test("normalizePatch fills gaps and clamps", () => {
  const p = normalizePatch({ root: 9999, voices: [{ wave: "bogus", gain: 5 }], fx: { delay: { fb: 3 } } });
  assert.equal(p.root, 96);
  assert.equal(p.voices.length, 4);
  assert.equal(p.voices[0].wave, "sawtooth");
  assert.equal(p.voices[0].gain, 1);
  assert.equal(p.fx.delay.fb, 0.92);
});

test("null / junk input gives the default patch", () => {
  assert.deepEqual(normalizePatch(null), defaultPatch());
  assert.deepEqual(normalizePatch("x"), defaultPatch());
});

test("random patches survive a JSON round trip and normalize to themselves", () => {
  for (let i = 0; i < 50; i++) {
    const p = randomPatch();
    assert.deepEqual(normalizePatch(JSON.parse(JSON.stringify(p))), p);
  }
});
