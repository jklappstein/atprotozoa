// Renders public/og.png (1200x630) from the sim itself. Run: node og-gen.mjs
import { Sim, PRESETS } from "./public/sim.js";
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const W = 1200, H = 630, N = 256;
const s = new Sim(N, N);
s.p = { ...PRESETS["maze, two diets"] };
s.step(9000);
const px = new Uint8ClampedArray(N * N * 4);
s.render(px, "mix");

const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  for (let x = 0; x < W; x++) {
    const sx = Math.floor((x / W) * N), sy = Math.floor(((y + 60) / (H + 120)) * N);
    const si = (sy * N + sx) * 4, o = y * (W * 4 + 1) + 1 + x * 4;
    raw.set([px[si], px[si + 1], px[si + 2], 255], o);
  }
}
// dark band + tiny 5x7-free title: draw blocky letters from a bitmap font
const font = { t: ["111", "010", "010", "010", "010"], w: ["10101", "10101", "10101", "10101", "01010"], o: ["010", "101", "101", "101", "010"], f: ["111", "100", "110", "100", "100"], e: ["111", "100", "110", "100", "111"], d: ["110", "101", "101", "101", "110"] };
const text = "twofeed", sc = 14, tw = [...text].reduce((a, c) => a + font[c][0].length * sc + sc, 0) - sc;
const ox = 60, oy = H - 5 * sc - 60;
for (let y = oy - 24; y < oy + 5 * sc + 24; y++) for (let x = ox - 30; x < ox + tw + 30; x++) {
  const o = y * (W * 4 + 1) + 1 + x * 4;
  for (let c = 0; c < 3; c++) raw[o + c] = raw[o + c] * 0.25;
}
let cx = ox;
for (const ch of text) {
  const g = font[ch];
  for (let r = 0; r < 5; r++) for (let c = 0; c < g[r].length; c++) if (g[r][c] === "1")
    for (let dy = 0; dy < sc; dy++) for (let dx = 0; dx < sc; dx++) {
      const o = (oy + r * sc + dy) * (W * 4 + 1) + 1 + (cx + c * sc + dx) * 4;
      raw.set([240, 236, 226, 255], o);
    }
  cx += g[0].length * sc + sc;
}
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync("public/og.png", Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
