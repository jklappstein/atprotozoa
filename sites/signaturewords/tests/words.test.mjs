import test from "node:test";
import assert from "node:assert";
import { tokenize, signatureWords } from "../public/lib/words.js";

test("tokenize drops urls, mentions, short words", () => {
  assert.deepStrictEqual(tokenize("Hi @bob.bsky.social see https://x.com/a it's gloriously ok"), ["see", "gloriously"]);
});

test("signatureWords favors breadth and drops stopwords", () => {
  const posts = ["the gloriously odd thing", "so gloriously weird", "gloriously", "rant rant rant rant", "the lol"];
  const r = signatureWords(posts);
  assert.strictEqual(r[0].word, "gloriously");
  assert.ok(!r.some((x) => x.word === "the"));
  assert.ok(!r.some((x) => x.word === "rant")); // one post only
});
