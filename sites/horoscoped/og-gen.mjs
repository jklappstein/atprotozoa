// Generates public/og.png (needs @resvg/resvg-js; `npm install @resvg/resvg-js --no-save`).
// Font is borrowed from ../vulnscope/fonts since the box has no system fonts.
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630, cx = 600, cy = 315;
let dots = "";
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
  dots += `<circle cx="${cx + Math.cos(a) * 250}" cy="${cy + Math.sin(a) * 250}" r="${i === 4 ? 16 : 9}" fill="${i === 4 ? "#ffd36e" : "#6f63c4"}"/>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs><radialGradient id="g" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#2a1f66"/><stop offset="1" stop-color="#0d0b1e"/></radialGradient></defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>
<circle cx="${cx}" cy="${cy}" r="250" fill="none" stroke="#2d2757" stroke-width="2"/>${dots}
<text x="${cx}" y="${cy + 10}" text-anchor="middle" font-family="JetBrains Mono" font-size="84" font-weight="bold" fill="#efeaff">horoscoped</text>
<text x="${cx}" y="${cy + 70}" text-anchor="middle" font-family="JetBrains Mono" font-size="28" fill="#9a92c4">your 50 most-liked posts guess your sign</text>
</svg>`;
const font = fileURLToPath(new URL("../vulnscope/fonts/JetBrainsMono.ttf", import.meta.url));
const png = new Resvg(svg, { font: { fontFiles: [font], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
