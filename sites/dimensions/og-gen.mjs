// Renders public/og.png: a 4-D Hilbert curve (order 3) projected to 2-D.
// Run: node og-gen.mjs  (needs @resvg/resvg-js, e.g. from sites/receipts)
import { hilbertAxes } from "./public/lib/hilbert.js";
import { Resvg } from "@resvg/resvg-js";
import fs from "node:fs";
function hsl(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return `rgb(${f(0)},${f(8)},${f(4)})`;
}
const n = 4, p = 3, tot = 2 ** (n * p), t = new Int32Array(n);
let pts = "";
for (let i = 0; i < tot; i++) {
  hilbertAxes(i, n, p, t);
  const c = [...t].map((v) => (v / 7) * 2 - 1);
  const x = c[0] * 0.83 - c[1] * 0.56 + 0.5 * c[2] - 0.3 * c[3];
  const y = c[0] * 0.34 + c[1] * 0.5 + c[3] * 0.7 - 0.4 * c[2];
  pts += `<circle cx="${(700 + x * 210).toFixed(1)}" cy="${(290 + y * 210).toFixed(1)}" r="2.4" fill="${hsl((i / tot) * 300 + 200, 0.85, 0.6)}"/>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#000"/>${pts}
<text x="60" y="540" font-family="JetBrains Mono" font-weight="700" font-size="84" fill="#dfe8ff" letter-spacing="8">DIMENSIONS</text>
<text x="64" y="590" font-family="JetBrains Mono" font-size="26" fill="#7fb6ff">a stream you will never read, folded into space</text></svg>`;
fs.writeFileSync("public/og.png", new Resvg(svg, { font: { fontFiles: ["fonts/JetBrainsMono.ttf"], loadSystemFonts: false } }).render().asPng());
