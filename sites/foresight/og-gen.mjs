// Generates public/og.png. Needs `npm install @resvg/resvg-js --no-save` (one-time).
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const rows = [["called it", "#4cc38a", "Fahrenheit 451 · earbuds"], ["half right", "#e6b450", "2001 · tablets, no HAL"], ["missed", "#ef6a5b", "Terminator 2 · Skynet, 1997"]];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#12151a"/>
<text x="70" y="190" font-family="sans-serif" font-weight="700" font-size="104" fill="#e8ebf0">foresight</text>
<text x="70" y="260" font-family="sans-serif" font-size="38" fill="#8f9aab">fiction isn't prophecy. sometimes it's close.</text>
${rows.map(([l, c, t], i) => `<rect x="70" y="${320 + i * 90}" width="1060" height="70" rx="10" fill="#1b2028"/><rect x="70" y="${320 + i * 90}" width="10" height="70" fill="${c}"/><text x="104" y="${365 + i * 90}" font-family="sans-serif" font-size="30" fill="${c}">${l}</text><text x="330" y="${365 + i * 90}" font-family="sans-serif" font-size="30" fill="#e8ebf0">${t}</text>`).join("")}
</svg>`;
writeFileSync(fileURLToPath(new URL("./public/og.png", import.meta.url)), new Resvg(svg).render().asPng());
