import test from "node:test";
import assert from "node:assert";
import {
  parseImageSize,
  quoteDisplay,
  validateCapabilityInput,
} from "../public/lib/hydracept-pure.js";

test("parseImageSize reads WxH", () => {
  assert.deepStrictEqual(parseImageSize("512x768"), { width: 512, height: 768 });
  assert.deepStrictEqual(parseImageSize("nope"), { width: 1024, height: 1024 });
});

test("quoteDisplay prefers expectedCharge", () => {
  assert.strictEqual(
    quoteDisplay({ expectedCharge: { display: "US$0.05" }, quoteId: "est_x" }),
    "US$0.05",
  );
});

test("validateCapabilityInput enforces allowlist and voice fields", () => {
  assert.strictEqual(validateCapabilityInput("video.generate.v1", {}).ok, false);
  assert.strictEqual(validateCapabilityInput("image.generate.v1", { prompt: "hi" }).ok, true);
  const voice = validateCapabilityInput("audio.voice.generate.v1", {
    text: "hello",
    voiceId: "abc",
    outputFormatPreference: "mp3_44100_128",
  });
  assert.strictEqual(voice.ok, true);
  assert.strictEqual(
    validateCapabilityInput("audio.voice.generate.v1", { text: "x" }).ok,
    false,
  );
});
