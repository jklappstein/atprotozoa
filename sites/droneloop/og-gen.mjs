// Generates public/og.png for droneloop (same recipe as sites/rateyourbuild/og-gen.mjs).
//   npm install @resvg/resvg-js --no-save && node og-gen.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const BG = "#0d0f14", PANEL = "#161a22", INK = "#e6e8ee", DIM = "#8a92a3", ACCENT = "#7fd1ae", REC = "#ff5a6a";

// a few stacked drone waves
const wave = (y, amp, f, ph, color, op) => {
  let d = "";
  for (let x = 0; x <= W; x += 8) {
    const v = y + Math.sin(x / f + ph) * amp + Math.sin(x / (f * 0.37) + ph * 2) * amp * 0.3;
    d += (x ? "L" : "M") + x + " " + v.toFixed(1);
  }
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="3" opacity="${op}"/>`;
};

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${wave(470, 40, 90, 0, ACCENT, 0.9)}
  ${wave(500, 34, 130, 1.4, ACCENT, 0.55)}
  ${wave(530, 26, 60, 2.2, ACCENT, 0.3)}
  <text x="64" y="150" font-family="JetBrains Mono" font-weight="800" font-size="84" fill="${INK}">droneloop</text>
  <text x="66" y="206" font-family="JetBrains Mono" font-size="28" fill="${DIM}">a drone synth with a stopwatch for a looper</text>
  <rect x="64" y="260" width="520" height="120" rx="14" fill="${PANEL}" stroke="${REC}" stroke-width="2"/>
  <text x="96" y="344" font-family="JetBrains Mono" font-weight="700" font-size="64" fill="${INK}">00:12.43</text>
  <rect x="440" y="288" width="120" height="64" rx="10" fill="${REC}"/>
  <text x="500" y="330" text-anchor="middle" font-family="JetBrains Mono" font-weight="800" font-size="26" fill="#1b0408">LAP</text>
  <text x="640" y="316" font-family="JetBrains Mono" font-size="22" fill="${DIM}">seconds, not measures.</text>
  <text x="640" y="348" font-family="JetBrains Mono" font-size="22" fill="${DIM}">reverb · delay · fuzz · chorus</text>
  <text x="640" y="380" font-family="JetBrains Mono" font-size="22" fill="${DIM}">patches saved in your PDS</text>
  <rect x="0" y="${H - 6}" width="${W}" height="6" fill="${ACCENT}"/>
</svg>`;

const fontPath = fileURLToPath(new URL("./fonts/JetBrainsMono.ttf", import.meta.url));
const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: { fontFiles: [fontPath], loadSystemFonts: false, defaultFontFamily: "JetBrains Mono" },
});
const png = resvg.render().asPng();
writeFileSync(new URL("./public/og.png", import.meta.url), png);
console.log(`wrote public/og.png (${png.length} bytes)`);
