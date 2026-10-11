import { test } from "node:test";
import assert from "node:assert";
// app.js touches the DOM at load only when `document` exists; under node it doesn't.
const { buildRegex, normalizeHandle } = await import("../public/app.js");

test("whole-word match, case-insensitive", () => {
  const re = buildRegex(["cat"], true);
  assert.ok(re.test("A Cat sat"));
  re.lastIndex = 0;
  assert.ok(!re.test("concatenate"));
});
test("substring mode", () => {
  assert.ok(buildRegex(["cat"], false).test("concatenate"));
});
test("regex chars are escaped, phrases work", () => {
  assert.ok(buildRegex(["c++ code"], true).test("I write C++ code daily"));
});
test("handle normalization", () => {
  assert.strictEqual(normalizeHandle("  @Alice.bsky.social "), "alice.bsky.social");
});
