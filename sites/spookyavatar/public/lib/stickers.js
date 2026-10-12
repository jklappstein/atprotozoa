// stickers.js — draw an avatar plus emoji stickers on a canvas, in the browser.
// A sticker is { e, x, y, s, r }: emoji, centre (0..1 of the square), size as a
// fraction of the width, rotation in degrees. Coordinates are normalised so the
// same list renders at preview size and at the 800px upload size.

export const SIZE = 800; // output px; avatars are shown far smaller, and this keeps the JPEG well under the PDS's 1 MB avatar limit
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';

// Paint `img` (ImageBitmap, or null for a placeholder) center-cropped to a
// square, then each sticker. `selected` (preview only) gets a dashed outline.
export function draw(canvas, img, stickers, selected = -1) {
  const size = canvas.width;
  const g = canvas.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, size, size);
  if (img) {
    const side = Math.min(img.width, img.height);
    g.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
  } else {
    const grad = g.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, "#2a1340");
    grad.addColorStop(1, "#7a2f06");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  g.textAlign = "center";
  g.textBaseline = "middle";
  stickers.forEach((st, i) => {
    const px = st.s * size;
    g.save();
    g.translate(st.x * size, st.y * size);
    g.rotate((st.r * Math.PI) / 180);
    g.font = `${px}px ${EMOJI_FONT}`;
    g.fillText(st.e, 0, px * 0.06);
    if (i === selected) {
      g.setLineDash([size * 0.012, size * 0.012]);
      g.lineWidth = Math.max(2, size * 0.005);
      g.strokeStyle = "#ff9a2e";
      g.strokeRect(-px * 0.58, -px * 0.58, px * 1.16, px * 1.16);
    }
    g.restore();
  });
  return canvas;
}

export function newCanvas(size = SIZE) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

// Topmost sticker under (x, y) in normalised coordinates, or -1.
export function hitTest(stickers, x, y) {
  for (let i = stickers.length - 1; i >= 0; i--) {
    const st = stickers[i];
    const half = st.s * 0.55;
    if (Math.abs(x - st.x) <= half && Math.abs(y - st.y) <= half) return i;
  }
  return -1;
}

// Canvas -> JPEG bytes under the PDS's 1,000,000-byte avatar limit.
export async function toJpeg(canvas) {
  for (const q of [0.92, 0.85, 0.75, 0.6, 0.45]) {
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", q));
    if (blob && blob.size < 1_000_000) return new Uint8Array(await blob.arrayBuffer());
  }
  throw new Error("couldn't get the image under 1 MB");
}
