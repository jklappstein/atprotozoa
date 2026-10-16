import test from "node:test";
import assert from "node:assert";
import { guessSign, featuresOf, SIGNS } from "../public/lib/guess.js";

const mk = (text, likes = 10) => ({ uri: "at://x/" + text, text, likes, createdAt: "2026-01-01T12:00:00Z" });

test("travel talk lands on Sagittarius", () => {
  const posts = Array.from({ length: 12 }, (_, i) => mk(`Planning another trip, the road and the world are calling #travel ${i}`));
  assert.equal(guessSign(posts, "a").sign.id, "sagittarius");
});

test("dreamy lowercase lands on Pisces", () => {
  const posts = Array.from({ length: 12 }, (_, i) => mk(`dreaming about the ocean and the moon 🌙 ${i}`));
  assert.equal(guessSign(posts, "a").sign.id, "pisces");
});

test("empty input still returns a sign", () => {
  const r = guessSign([], "x");
  assert.ok(SIGNS.includes(r.sign));
  assert.equal(r.share.length, 12);
});

test("features stay in 0..1", () => {
  const f = featuresOf(mk("WOW!!! WHAT?? @a @b #x #y I me my 😀😀😀 https://x.y"));
  for (const k in f) assert.ok(f[k] >= 0 && f[k] <= 1, k);
});
