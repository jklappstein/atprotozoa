// Generates public/og.png — the Open Graph preview card for spookyavatar, so a
// shared link auto-renders instead of a bare URL. Hand-drawn SVG at the
// canonical OG size, rasterised with @resvg/resvg-js (pure native module, no
// system Chromium needed — this box has no fontconfig/system fonts either,
// so the font is bundled in ./fonts and loaded explicitly). Same recipe as
// sites/didscope/og-gen.mjs.
//
//   npm install @resvg/resvg-js --no-save   # one-time, not a project dependency
//   node og-gen.mjs                         # writes ./public/og.png
//
// House style: self-contained, copy-don't-abstract. Re-run this by hand if
// you change the artwork.

import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;

const VOID = "#07070a";
const PANEL = "#101014";
const LINE = "#232329";
const INK = "#e8e8ee";
const DIM = "#83838f";
const SIGNAL = "#ff8a1f";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="-10%" r="60%">
      <stop offset="0" stop-color="#3a1a05"/>
      <stop offset="1" stop-color="${VOID}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${VOID}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <circle cx="${W / 2}" cy="110" r="46" fill="#ff7a00"/><path d="M${W / 2 - 8} 66 q8 -22 22 -26" stroke="#4a9a2a" stroke-width="8" fill="none" stroke-linecap="round"/><circle cx="${W / 2 - 16}" cy="104" r="7" fill="#07070a"/><circle cx="${W / 2 + 16}" cy="104" r="7" fill="#07070a"/><path d="M${W / 2 - 20} 124 q20 16 40 0" stroke="#07070a" stroke-width="6" fill="none" stroke-linecap="round"/>
  <text x="${W / 2}" y="220" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="88" fill="${INK}">spookyavatar</text>
  <text x="${W / 2}" y="290" text-anchor="middle" font-family="JetBrains Mono" font-size="24" fill="${DIM}">halloween emojis, on your bluesky avatar</text>

  <rect x="180" y="360" width="${W - 360}" height="180" rx="16" fill="${PANEL}" stroke="${LINE}" stroke-width="1.5"/>
  <text x="${W / 2}" y="420" text-anchor="middle" font-family="JetBrains Mono" font-size="20" fill="${INK}">pick emojis. drag them onto your avatar.</text>
  <text x="${W / 2}" y="456" text-anchor="middle" font-family="JetBrains Mono" font-size="20" fill="${INK}">one click restores the original.</text>
  <text x="${W / 2}" y="500" text-anchor="middle" font-family="JetBrains Mono" font-size="16" fill="${SIGNAL}">update-profile scope only</text>

  <text x="${W / 2}" y="590" text-anchor="middle" font-family="JetBrains Mono" font-weight="700" font-size="22" fill="${DIM}">spookyavatar.bisks.net</text>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const r = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = r.render().asPng();
const out = new URL("./public/og.png", import.meta.url).pathname;
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
