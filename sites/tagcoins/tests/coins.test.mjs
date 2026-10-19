import test from "node:test";
import assert from "node:assert";
import { findMentions, tagCost, settle, spend, MAX_COINS, REFILL_MS } from "../public/lib/coins.js";

test("finds mentions with byte offsets", () => {
  const m = findMentions("héllo @bisks.net and (@a.b.c) x@no.pe");
  assert.deepStrictEqual(m.map((x) => x.handle), ["bisks.net", "a.b.c"]);
  assert.strictEqual(new TextEncoder().encode("héllo ").length, m[0].start);
});
test("each occurrence costs a coin; plain text is free", () => {
  assert.strictEqual(tagCost("no tags here, email me a@b.com"), 0);
  assert.strictEqual(tagCost("@a.com @a.com"), 2);
});
test("refill and spend", () => {
  assert.strictEqual(settle({ coins: 0, at: 0 }, REFILL_MS * 3).coins, 3);
  assert.strictEqual(settle({ coins: 9, at: 0 }, REFILL_MS * 50).coins, MAX_COINS);
  assert.strictEqual(spend({ coins: 1, at: 0 }, 2, 0), null);
  assert.strictEqual(spend({ coins: 3, at: 0 }, 2, 0).coins, 1);
});
