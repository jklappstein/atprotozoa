// Runs renderQR against a tiny fake canvas and checks the thing a scanner
// relies on: the pixel at the centre of every module has that module's value.
import test from "node:test";
import assert from "node:assert/strict";
import { encode } from "../public/lib/qr.js";
import { renderQR } from "../public/lib/render.js";

function fakeCanvas() {
  const cv = { width: 0, height: 0, _pix: null };
  let fill = [0, 0, 0], path = null;
  const parse = (s) => (s === "#fff" ? [255, 255, 255] : s === "#000" ? [0, 0, 0] : s === "#0b0b0e" ? [11, 11, 14] : s === "#808080" ? [128, 128, 128] : [0, 0, 0]);
  const ctx = {
    set fillStyle(v) { fill = parse(v); },
    set imageSmoothingQuality(v) {},
    fillRect(x, y, w, h) {
      if (!cv._pix) cv._pix = new Uint8ClampedArray(cv.width * cv.height * 4);
      for (let j = Math.round(y); j < Math.round(y + h); j++) for (let i = Math.round(x); i < Math.round(x + w); i++) {
        const k = (j * cv.width + i) * 4; cv._pix.set([...fill, 255], k);
      }
    },
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4).fill(140), width: w, height: h }; },
    createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    putImageData(img) { cv._pix = img.data; },
    drawImage() {},
    beginPath() { path = null; },
    arc(x, y, r) { path = { x, y, r }; },
    fill() {
      for (let j = Math.floor(path.y - path.r); j <= path.y + path.r; j++) for (let i = Math.floor(path.x - path.r); i <= path.x + path.r; i++)
        if ((i + 0.5 - path.x) ** 2 + (j + 0.5 - path.y) ** 2 <= path.r ** 2) cv._pix.set([...fill, 255], (j * cv.width + i) * 4);
    },
  };
  cv.getContext = () => ctx;
  return cv;
}
globalThis.document = { createElement: () => fakeCanvas() };

for (const round of [true, false]) for (const tint of [false, true]) {
  test(`module centres carry the code (round=${round}, tint=${tint})`, () => {
    const qr = encode("https://psingletary.com/", { minVersion: 8 });
    const cv = fakeCanvas();
    const cell = 14;
    renderQR(cv, qr, { naturalWidth: 100, naturalHeight: 100 }, { cell, tint, round });
    assert.equal(cv.width, (qr.size + 4) * cell);
    let wrong = 0;
    for (let r = 0; r < qr.size; r++) for (let c = 0; c < qr.size; c++) {
      const x = Math.floor((2 + c) * cell + cell / 2), y = Math.floor((2 + r) * cell + cell / 2);
      const lum = cv._pix[(y * cv.width + x) * 4];
      if ((lum < 128) !== qr.modules[r][c]) wrong++;
    }
    assert.equal(wrong, 0);
  });
}
