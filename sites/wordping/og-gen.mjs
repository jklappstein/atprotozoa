// Generates public/og.png (1200x630) with @resvg/resvg-js, same recipe as
// sites/mootstream/og-gen.mjs. Font bundled in ./fonts (no system fonts here).
//   node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="#0e1116"/>
<g font-family="JetBrains Mono" >
<text x="80" y="230" font-size="120" font-weight="700" fill="#e8edf3">wordping</text>
<text x="80" y="310" font-size="34" fill="#8b97a8">ping me when anyone I follow</text>
<text x="80" y="356" font-size="34" fill="#8b97a8">posts a word I care about</text>
<rect x="80" y="420" width="150" height="56" rx="28" fill="#0b0e13" stroke="#2a3240"/>
<text x="110" y="458" font-size="26" fill="#e8edf3">coffee</text>
<rect x="250" y="420" width="150" height="56" rx="28" fill="#ffb84d"/>
<text x="280" y="458" font-size="26" fill="#1a1200">atproto</text>
<rect x="420" y="420" width="150" height="56" rx="28" fill="#0b0e13" stroke="#2a3240"/>
<text x="450" y="458" font-size="26" fill="#e8edf3">sourdough</text>
<text x="80" y="560" font-size="26" fill="#8b97a8">wordping.bisks.net</text>
<circle cx="1010" cy="200" r="70" fill="#ffb84d"/><circle cx="1010" cy="290" r="14" fill="#ffb84d"/>
</g></svg>`;
const png = new Resvg(svg, {
  font: { fontFiles: [fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url))], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
}).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
console.log("wrote public/og.png", png.length);
