// Generates public/og.png — the share card. Draws a real QR (this site's own
// URL, via public/lib/qr.js) as SVG and rasterises it with @resvg/resvg-js.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { encode } from "./public/lib/qr.js";

const W = 1200, H = 630;
const qr = encode("https://qrface.bisks.net/", { minVersion: 6 });
const cell = 10, q0 = 70, ox = 730, oy = (H - qr.size * cell) / 2;
let mods = "";
for (let r = 0; r < qr.size; r++) for (let c = 0; c < qr.size; c++) {
  if (!qr.modules[r][c]) continue;
  mods += qr.isFunction[r][c]
    ? `<rect x="${ox + c * cell}" y="${oy + r * cell}" width="${cell}" height="${cell}"/>`
    : `<circle cx="${ox + c * cell + cell / 2}" cy="${oy + r * cell + cell / 2}" r="${cell * 0.42}"/>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0c0c0f"/>
  <rect x="${ox - 20}" y="${oy - 20}" width="${qr.size * cell + 40}" height="${qr.size * cell + 40}" rx="14" fill="#fff"/>
  <g fill="#000">${mods}</g>
  <text x="70" y="250" font-family="JetBrains Mono" font-weight="800" font-size="104" fill="#f0f0f4">qrface</text>
  <text x="70" y="320" font-family="JetBrains Mono" font-size="26" fill="#9a9aa8">your bluesky avatar, as a QR code</text>
  <text x="70" y="400" font-family="JetBrains Mono" font-size="22" fill="#f0f0f4">scans to the website on your handle's domain.</text>
  <text x="70" y="438" font-family="JetBrains Mono" font-size="22" fill="#6ee7a8">no website? you get a clown.</text>
  <text x="70" y="570" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="#9a9aa8">qrface.bisks.net</text>
</svg>`;
const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const png = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
}).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
console.log("wrote public/og.png", png.length, "bytes");
