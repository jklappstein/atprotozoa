// Reads the matrix back the way a scanner would — unmask, walk the zigzag,
// de-interleave, check every Reed-Solomon block has zero syndromes, and decode
// the byte-mode payload — so a wrong block table or interleave order fails here.
import test from "node:test";
import assert from "node:assert/strict";
import { encode } from "../public/lib/qr.js";

const BLOCKS = { // version -> [ecLen, n1, d1, n2, d2] (level H), spot checks from the spec
  1: [17, 1, 9, 0, 0], 3: [22, 2, 13, 0, 0], 5: [22, 2, 11, 2, 12], 7: [26, 4, 13, 1, 14],
  10: [28, 6, 15, 2, 16], 15: [24, 11, 12, 7, 13],
};
const MASKS = [
  (r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];
const EXP = [], LOG = [];
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
const mul = (a, b) => (a && b ? EXP[(LOG[a] + LOG[b]) % 255] : 0);

function readBack({ size: n, version, mask, modules, isFunction }) {
  const bits = [];
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const c = right - j, r = ((right + 1) & 2) === 0 ? n - 1 - vert : vert;
      if (!isFunction[r][c]) bits.push(modules[r][c] !== MASKS[mask](r, c) ? 1 : 0);
    }
  }
  const cw = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  const [ecLen, n1, d1, n2, d2] = BLOCKS[version];
  const nb = n1 + n2, lens = Array.from({ length: nb }, (_, i) => (i < n1 ? d1 : d2));
  const blocks = lens.map(() => []);
  let k = 0;
  for (let i = 0; i < Math.max(d1, d2); i++) for (let b = 0; b < nb; b++) if (i < lens[b]) blocks[b].push(cw[k++]);
  for (let i = 0; i < ecLen; i++) for (let b = 0; b < nb; b++) blocks[b].push(cw[k++]);
  for (const blk of blocks) for (let s = 0; s < ecLen; s++) { // codeword poly must vanish at alpha^s
    let acc = 0;
    for (const x of blk) acc = mul(acc, EXP[s]) ^ x;
    assert.equal(acc, 0, "RS syndrome");
  }
  const data = blocks.flatMap((b) => b.slice(0, b.length - ecLen));
  const hex = data.map((x) => x.toString(2).padStart(8, "0")).join("");
  assert.equal(hex.slice(0, 4), "0100");
  const cc = version < 10 ? 8 : 16;
  const len = parseInt(hex.slice(4, 4 + cc), 2);
  const out = [];
  for (let i = 0; i < len; i++) out.push(parseInt(hex.slice(4 + cc + i * 8, 12 + cc + i * 8), 2));
  return new TextDecoder().decode(new Uint8Array(out));
}

test("round-trips across versions", () => {
  for (const [text, min] of [
    ["https://a.co/", 1], ["https://psingletary.com/", 1], ["https://psingletary.com/", 5],
    ["https://" + "x".repeat(46) + ".com/", 1], ["https://ünï.example/" + "q".repeat(80), 1],
    ["https://" + "y".repeat(120) + ".dev/", 1], ["https://psingletary.com/", 15],
  ]) {
    const q = encode(text, { minVersion: min });
    if (!BLOCKS[q.version]) continue; // only versions with spec spot-checks above
    assert.equal(readBack(q), text);
  }
});

test("function patterns are in place", () => {
  const q = encode("https://psingletary.com/", { minVersion: 5 });
  assert.equal(q.size, 37);
  assert.equal(q.modules[3][3], true); // finder centre
  assert.equal(q.modules[1][1], false);
  assert.equal(q.modules[q.size - 8][8], true); // dark module
});
