// Generates public/og.png. Needs `npm install @resvg/resvg-js --no-save` (one-time).
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const rows = ["1  the one you've been meaning to watch", "2  a 3-hour essay", "3  that talk someone sent you", "4  cat video (reward)"];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#14110f"/>
<text x="70" y="190" font-family="sans-serif" font-weight="700" font-size="104" fill="#f3ece2">watchorder</text>
<text x="70" y="260" font-family="sans-serif" font-size="38" fill="#a39a8c">rank the pile. then watch it.</text>
${rows.map((r, i) => `<rect x="70" y="${320 + i * 66}" width="${1060 - i * 120}" height="52" rx="10" fill="#211c18" stroke="${i ? "#3a322b" : "#ff5a3c"}" stroke-width="2"/><text x="94" y="${355 + i * 66}" font-family="sans-serif" font-size="28" fill="#f3ece2">${r}</text>`).join("")}
</svg>`;
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), new Resvg(svg).render().asPng());
