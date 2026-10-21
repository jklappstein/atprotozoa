import test from "node:test";
import assert from "node:assert";
import { averageColor, sortByHue, gradientCss, bucket, mosaicDims, thumbUrl } from "../public/lib/colors.js";

test("average of identical colors is that color", () => {
  assert.deepStrictEqual(averageColor([[10, 200, 30], [10, 200, 30]]), [10, 200, 30]);
  assert.strictEqual(averageColor([]), null);
});
test("red+green averages brighter than naive mean", () => {
  const a = averageColor([[255, 0, 0], [0, 255, 0]]);
  assert.ok(a[0] > 127 && a[1] > 127);
});
test("sortByHue puts red before blue, grays last", () => {
  const s = sortByHue([[128, 128, 128], [0, 0, 255], [255, 0, 0]]);
  assert.deepStrictEqual(s, [[255, 0, 0], [0, 0, 255], [128, 128, 128]]);
});
test("gradient/bucket/mosaic", () => {
  assert.strictEqual(gradientCss([]), null);
  assert.strictEqual(gradientCss([[1, 2, 3]]), "rgb(1,2,3)");
  assert.match(gradientCss([[255, 0, 0], [0, 0, 255]]), /^linear-gradient/);
  assert.strictEqual(bucket(Array.from({ length: 100 }, () => [1, 1, 1]), 10).length, 10);
  assert.deepStrictEqual(mosaicDims(10), { cols: 4, rows: 3 });
});
test("thumbUrl", () => {
  assert.strictEqual(thumbUrl("https://cdn.bsky.app/img/avatar/plain/x/y@jpeg"), "https://cdn.bsky.app/img/avatar_thumbnail/plain/x/y@jpeg");
});
