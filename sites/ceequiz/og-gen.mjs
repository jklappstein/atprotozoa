// Generates public/og.png (copy of the backscroll recipe: SVG -> @resvg/resvg-js).
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<defs><radialGradient id="g" cx="50%" cy="0%" r="90%"><stop offset="0" stop-color="#4b1a8f"/><stop offset="1" stop-color="#1a0638"/></radialGradient></defs>
<rect width="1200" height="630" fill="url(#g)"/>
${Array.from({ length: 40 }, (_, i) => `<circle cx="${15 + i * 30}" cy="20" r="6" fill="#ffd23f"/><circle cx="${15 + i * 30}" cy="610" r="6" fill="#ffd23f"/>`).join("")}
<g font-family="Verdana, sans-serif" font-weight="900" font-style="italic" text-anchor="middle">
<text x="600" y="210" font-size="130" fill="#27e1ff">WHO</text>
<text x="600" y="340" font-size="130" fill="#ffd23f">POSTED IT?!</text></g>
<circle cx="330" cy="470" r="50" fill="#27e1ff"/><circle cx="870" cy="470" r="50" fill="#ff3d8b"/>
<g font-family="Verdana, sans-serif" font-weight="700" font-size="34" fill="#fff" text-anchor="middle">
<text x="330" y="560">@cee.wtf</text><text x="870" y="560">@wagrace.mir.cee.wtf</text>
<text x="600" y="485" fill="#ffd23f" font-size="46">OR</text></g></svg>`;
const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), png);
