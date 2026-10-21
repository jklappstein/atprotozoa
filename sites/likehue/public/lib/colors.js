// colors.js — pure color math for likehue. No DOM, so tests can call it.

// Average of [r,g,b] triples, done in squared space so mixing a red and a
// green pfp doesn't come out as mud (plain sRGB averaging darkens).
export function averageColor(colors) {
  if (!colors.length) return null;
  const s = [0, 0, 0];
  for (const c of colors) for (let i = 0; i < 3; i++) s[i] += c[i] * c[i];
  return s.map((v) => Math.round(Math.sqrt(v / colors.length)));
}

export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (mx === r) h = ((g - b) / d + 6) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

// Hue order, with washed-out pfps (near gray/black/white) gathered at the end
// by lightness so the colorful part of the spectrum reads cleanly.
export function sortByHue(colors) {
  const key = (c) => {
    const [h, s, l] = rgbToHsl(c);
    return s < 0.15 ? [1, l, 0] : [0, Math.round(h / 12), l];
  };
  return colors.slice().sort((a, b) => {
    const ka = key(a), kb = key(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2];
  });
}

export const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

// Collapse a sorted list to at most `stops` averaged buckets. The cap is a
// rendering limit: a CSS gradient with thousands of stops is slow to paint and
// invisible at tile size.
export function bucket(colors, stops) {
  if (colors.length <= stops) return colors;
  const out = [];
  for (let i = 0; i < stops; i++) {
    const a = Math.floor((i * colors.length) / stops);
    const b = Math.floor(((i + 1) * colors.length) / stops);
    out.push(averageColor(colors.slice(a, Math.max(b, a + 1))));
  }
  return out;
}

export function gradientCss(colors, stops = 24) {
  if (!colors.length) return null;
  const sorted = bucket(sortByHue(colors), stops);
  if (sorted.length === 1) return css(sorted[0]);
  return `linear-gradient(135deg, ${sorted.map(css).join(", ")})`;
}

// Mosaic layout: n chips in a square-ish grid, returns {cols, rows}.
export function mosaicDims(n) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  return { cols, rows: Math.max(1, Math.ceil(n / cols)) };
}

// Avatar CDN URL -> the small thumbnail variant (less to download per liker).
export function thumbUrl(u) {
  return String(u).replace("/img/avatar/", "/img/avatar_thumbnail/");
}
