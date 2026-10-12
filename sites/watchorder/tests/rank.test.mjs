import test from "node:test";
import assert from "node:assert";
import { parseId, parseIds, start, pair, answer, done } from "../public/lib/rank.js";

test("parses url shapes", () => {
  const id = "dQw4w9WgXcQ";
  for (const u of [`https://www.youtube.com/watch?v=${id}&t=3`, `youtu.be/${id}?si=x`, `https://youtube.com/shorts/${id}`, `https://m.youtube.com/embed/${id}`, id])
    assert.equal(parseId(u), id);
  assert.equal(parseId("https://example.com/watch?v=" + id), null);
  assert.deepEqual(parseIds(`${id}\nnonsense\nyoutu.be/${id}`), [id]);
});

test("sorts to the hidden order", () => {
  const ids = Array.from({ length: 40 }, (_, i) => "v" + String(i).padStart(10, "0"));
  const rank = Object.fromEntries(ids.map((x, i) => [x, (i * 17) % 40]));
  const st = start(ids);
  let p;
  while ((p = pair(st))) answer(st, rank[p[0]] < rank[p[1]]);
  assert.ok(done(st));
  assert.deepEqual(st.sorted, [...ids].sort((a, b) => rank[a] - rank[b]));
  assert.ok(st.duels < 40 * 6);
});
