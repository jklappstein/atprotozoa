// Generates public/og.png — a mosaic of coloured tiles + title.
//   npm install @resvg/resvg-js --no-save ; node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
let tiles = "";
const cols = 4, rows = 3, s = 150, gap = 10, ox = 600 + 40, oy = (H - (rows * s + (rows - 1) * gap)) / 2;
for (let i = 0; i < cols * rows; i++) {
  const hue = (i * 47 + 120) % 360;
  const x = ox + (i % cols) * (s + gap), y = oy + Math.floor(i / cols) * (s + gap);
  tiles += `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="8" fill="hsl(${hue} 55% ${30 + (i % 3) * 8}%)"/>`
    + `<circle cx="${x + s * .32}" cy="${y + s * .36}" r="${s * .1}" fill="hsl(${hue} 70% 80%)"/>`
    + `<path d="M${x} ${y + s} L${x + s * .45} ${y + s * .55} L${x + s * .7} ${y + s * .8} L${x + s} ${y + s * .5} V${y + s} Z" fill="hsl(${hue} 50% 20%)"/>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0c0c0f"/>${tiles}
  <text x="60" y="270" font-family="JetBrains Mono" font-weight="800" font-size="84" fill="#f0f0f4">thread</text>
  <text x="60" y="355" font-family="JetBrains Mono" font-weight="800" font-size="84" fill="#6ee7a8">tiles</text>
  <text x="60" y="425" font-family="JetBrains Mono" font-size="24" fill="#9a9aa8">every image in a bluesky thread,</text>
  <text x="60" y="458" font-family="JetBrains Mono" font-size="24" fill="#9a9aa8">as one grid.</text>
  <text x="60" y="570" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="#9a9aa8">threadtiles.bisks.net</text>
</svg>`;
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const png = new Resvg(svg, { font: { fontFiles: [here("./fonts/JetBrainsMono.ttf")], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(here("./public/og.png"), png);
