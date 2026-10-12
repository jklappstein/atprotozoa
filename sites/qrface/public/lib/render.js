// render.js — paint a QR matrix so it looks like an avatar.
//
// Every module gets a dot in its centre that carries the real QR value (that is
// where a scanner samples). Everything around the dots is the avatar,
// thresholded to dark/light by a local-contrast rule so faces keep their
// edges. Finder, timing and alignment patterns stay plain so detection is
// reliable.

const QUIET = 2; // modules of white margin around the code

// Fast box blur of a Float32 grid via an integral image.
function boxBlur(src, w, h, r) {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += src[y * w + x];
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const s = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      out[y * w + x] = s / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

// opts: { cell (px per module), tint (bool), dot (0..1 side of centre dot), round (bool) }
export function renderQR(canvas, qr, avatar, opts = {}) {
  const { cell = 14, tint = false, dot = 0.5, round = true } = opts;
  const n = qr.size;
  const code = n * cell;
  const full = (n + QUIET * 2) * cell;
  canvas.width = canvas.height = full;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, full, full);

  // 1. the avatar, cover-fitted, read back as pixels
  const off = document.createElement("canvas");
  off.width = off.height = code;
  const octx = off.getContext("2d", { willReadFrequently: true });
  octx.fillStyle = "#808080";
  octx.fillRect(0, 0, code, code);
  if (avatar) {
    const w = avatar.naturalWidth || avatar.width, h = avatar.naturalHeight || avatar.height;
    const s = Math.max(code / w, code / h);
    octx.imageSmoothingQuality = "high";
    octx.drawImage(avatar, (code - w * s) / 2, (code - h * s) / 2, w * s, h * s);
  }
  const img = octx.getImageData(0, 0, code, code);
  const px = img.data, N = code * code;

  // 2. luminance, stretched so the 2nd..98th percentile spans 0..1
  const lum = new Float32Array(N);
  for (let i = 0; i < N; i++) lum[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
  const sorted = Float32Array.from(lum).sort();
  const lo = sorted[Math.floor(N * 0.02)], hi = sorted[Math.floor(N * 0.98)];
  const span = Math.max(0.08, hi - lo);
  for (let i = 0; i < N; i++) lum[i] = Math.min(1, Math.max(0, (lum[i] - lo) / span));

  // 3. local threshold: darker than the neighbourhood (a couple of modules wide) -> dark
  const mean = boxBlur(lum, code, code, Math.round(cell * 2.5));
  const out = ctx.createImageData(full, full);
  const o = out.data;
  const q0 = QUIET * cell;
  for (let y = 0; y < full; y++) {
    for (let x = 0; x < full; x++) {
      const di = (y * full + x) * 4;
      const sx = x - q0, sy = y - q0;
      let v = 255, r = 255, g = 255, b = 255;
      if (sx >= 0 && sy >= 0 && sx < code && sy < code) {
        const i = sy * code + sx;
        const dark = lum[i] < mean[i] * 0.6 + 0.2; // 60% local mean, 40% global midpoint
        if (tint) {
          const pr = px[i * 4], pg = px[i * 4 + 1], pb = px[i * 4 + 2];
          if (dark) { r = pr * 0.32; g = pg * 0.32; b = pb * 0.32; }
          else { r = 255 - (255 - pr) * 0.14; g = 255 - (255 - pg) * 0.14; b = 255 - (255 - pb) * 0.14; }
        } else {
          v = dark ? 0 : 255; r = g = b = v;
        }
      }
      o[di] = r; o[di + 1] = g; o[di + 2] = b; o[di + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);

  // 4. function patterns solid, data modules get a centre dot with the real value
  const darkCol = tint ? "#0b0b0e" : "#000";
  const lightCol = "#fff";
  const side = cell * dot;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const val = qr.modules[r][c];
      const x = q0 + c * cell, y = q0 + r * cell;
      ctx.fillStyle = val ? darkCol : lightCol;
      if (qr.isFunction[r][c]) {
        ctx.fillRect(x, y, cell, cell);
      } else if (round) {
        ctx.beginPath();
        ctx.arc(x + cell / 2, y + cell / 2, side / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(x + (cell - side) / 2, y + (cell - side) / 2, side, side);
      }
    }
  }
}
