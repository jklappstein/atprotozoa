import { hilbertAxes } from "./lib/hilbert.js";

const JETSTREAM = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post";
// Points kept in the browser. The ceiling is per-frame cost, not an arbitrary
// choice: every frame rotates and projects every point (3 dot products of up
// to 8 terms each), and 2^18 points is about what a laptop does at 60fps. Once
// full, new posts overwrite the oldest, so the stream still never stops.
const CAP = 1 << 18;
const TICKER_LINES = 48; // ticker rows on screen; purely a layout limit

const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");
const dimEl = document.getElementById("dim");
const dimVal = document.getElementById("dimval");
const ascendBtn = document.getElementById("ascend");
const shareEl = document.getElementById("share");
const statsEl = document.getElementById("stats");
const tickerEl = document.getElementById("ticker");

let W = 0, H = 0, img = null, buf32 = null;
function resize() {
  W = cv.width = Math.max(2, window.innerWidth);
  H = cv.height = Math.max(2, window.innerHeight);
  img = ctx.createImageData(W, H);
  buf32 = new Uint32Array(img.data.buffer);
}
window.addEventListener("resize", resize);
resize();

// ---- the stream --------------------------------------------------------
const colors = new Uint32Array(CAP); // packed 0xAABBGGRR per post
let total = 0;      // posts ever seen
let chars = 0;      // characters that went past
let fresh = 0;      // how many of the newest points still flash white
let connected = false;

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function hsl(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
function pack(r, g, b) { return (255 << 24) | (b << 16) | (g << 8) | r; }

function ingest(text) {
  const hv = hash(text);
  // hue from the content, lightness from the length
  const [r, g, b] = hsl(hv % 360, 0.85, Math.min(0.72, 0.38 + text.length / 700));
  colors[total % CAP] = pack(r | 0, g | 0, b | 0);
  total++;
  chars += text.length;
  fresh = Math.min(fresh + 1, 400);
  const line = document.createElement("div");
  line.textContent = text.replace(/\s+/g, " ");
  tickerEl.appendChild(line);
  while (tickerEl.childElementCount > TICKER_LINES) tickerEl.firstChild.remove();
}

let ws = null;
let retry = 1000;
function connect() {
  ws = new WebSocket(JETSTREAM);
  ws.onopen = () => { connected = true; retry = 1000; };
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.kind !== "commit" || m.commit?.operation !== "create") return;
    const t = m.commit.record?.text;
    if (typeof t === "string" && t.length) ingest(t);
  };
  ws.onclose = () => { connected = false; setTimeout(connect, retry); retry = Math.min(retry * 2, 15000); };
  ws.onerror = () => { try { ws.close(); } catch {} };
}
connect();

// ---- geometry ----------------------------------------------------------
let D = 3;
let order = 0;            // hilbert order currently laid out
let coords = new Float32Array(CAP * 8); // n coords per point, in [-1,1]
let laidOut = 0;          // points [0, laidOut) have coordinates for (D, order)
const tmp = new Int32Array(8);

function orderFor(n) {
  // smallest p with 2^(p*D) >= n, at least 1; the curve grows as the stream does
  let p = 1;
  while (p * D < 31 && 2 ** (p * D) < n) p++;
  return p;
}
function layout(count) {
  const p = orderFor(count);
  if (p !== order || count < laidOut) { order = p; laidOut = 0; }
  const side = (1 << order) - 1;
  // fill in coords incrementally so a big re-layout is spread across frames
  const end = Math.min(count, laidOut + 40000);
  for (let i = laidOut; i < end; i++) {
    hilbertAxes(i, D, order, tmp);
    const o = i * D;
    for (let d = 0; d < D; d++) coords[o + d] = (tmp[d] / side) * 2 - 1;
  }
  laidOut = end;
}
function setDim(n) {
  D = n;
  dimEl.value = String(n);
  dimVal.textContent = String(n);
  order = 0; laidOut = 0;
}
dimEl.addEventListener("input", () => { ascending = false; ascendBtn.classList.remove("on"); setDim(+dimEl.value); });

let ascending = false;
let ascendTimer = 0;
ascendBtn.addEventListener("click", () => {
  ascending = !ascending;
  ascendBtn.classList.toggle("on", ascending);
  ascendTimer = 0;
});

// ---- render ------------------------------------------------------------
const R = new Float64Array(64); // D x D rotation, row-major
function buildRotation(t) {
  R.fill(0);
  for (let i = 0; i < D; i++) R[i * D + i] = 1;
  // rotate in every coordinate plane, each at its own slow rate; in 4+ dims
  // these are the planes that make the shape turn "through" itself.
  let k = 0;
  for (let a = 0; a < D; a++) for (let b = a + 1; b < D; b++, k++) {
    const th = t * (0.00011 + 0.000047 * ((k * 7) % 11));
    const c = Math.cos(th), s = Math.sin(th);
    for (let r = 0; r < D; r++) {
      const x = R[r * D + a], y = R[r * D + b];
      R[r * D + a] = c * x - s * y;
      R[r * D + b] = s * x + c * y;
    }
  }
}

let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = now - lastT; lastT = now;

  if (ascending) {
    ascendTimer += dt;
    if (ascendTimer > 7000) { ascendTimer = 0; setDim(D >= 8 ? 2 : D + 1); }
  }

  const count = Math.min(total, CAP);
  if (count > 0) layout(count);
  const n = Math.min(count, laidOut);

  buf32.fill(0xff000000);
  if (n > 0) {
    // before the curve is laid out the head of the array is all we can draw
    buildRotation(now);
    const r0 = D > 0 ? 0 : 0, r1 = D > 1 ? D : 0, r2 = D > 2 ? 2 * D : -1;
    const sc = Math.min(W, H) * 0.42;
    const norm = 1 / Math.sqrt(D);
    const cx = W / 2, cy = H / 2;
    const size = n < 3000 ? 3 : n < 40000 ? 2 : 1;
    const newest = total % CAP; // slot of the next write; newest points sit just below it
    for (let i = 0; i < n; i++) {
      const o = i * D;
      let x = 0, y = 0, z = 0;
      for (let d = 0; d < D; d++) {
        const c = coords[o + d];
        x += R[r0 + d] * c;
        y += R[r1 + d] * c;
        if (r2 >= 0) z += R[r2 + d] * c;
      }
      x *= norm; y *= norm; z *= norm;
      const s = 1 / (1.8 - z * 0.8);
      const px = (cx + x * s * sc * 1.9) | 0;
      const py = (cy + y * s * sc * 1.9) | 0;
      if (px < 0 || py < 0 || px >= W - size || py >= H - size) continue;
      // newest `fresh` posts flash white-hot (distance behind the write head, wrapping)
      let col = colors[i];
      if (fresh > 0 && ((newest - 1 - i + CAP) % CAP) < fresh) col = 0xffffffff;
      else {
        const k = Math.max(0.25, Math.min(1.4, s * 0.9 + 0.1));
        const r = Math.min(255, (col & 255) * k), g = Math.min(255, ((col >> 8) & 255) * k), b = Math.min(255, ((col >> 16) & 255) * k);
        col = (255 << 24) | (b << 16) | (g << 8) | r;
      }
      for (let yy = 0; yy < size; yy++) {
        const row = (py + yy) * W + px;
        for (let xx = 0; xx < size; xx++) buf32[row + xx] = col;
      }
    }
  }
  if (fresh > 0) fresh = Math.max(0, fresh - Math.max(1, fresh * 0.04));
  ctx.putImageData(img, 0, 0);
  updateStats(count);
}

let statTick = 0;
function updateStats(count) {
  if (++statTick % 10) return;
  if (total === 0) {
    statsEl.innerHTML = '<span id="status">' + (connected ? "waiting for the first post…" : "connecting to the firehose…") + "</span>";
  } else {
    statsEl.textContent =
      `${total.toLocaleString()} posts folded · ${chars.toLocaleString()} characters unread · ` +
      `${D}-D · order ${order} (${D * order} bits, ${count.toLocaleString()} of ${(2 ** Math.min(31, D * order)).toLocaleString()} cells)`;
  }
  shareEl.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(
    `${total.toLocaleString()} bluesky posts, ${chars.toLocaleString()} characters I will never read, folded into a ${D}-dimensional hilbert curve. https://dimensions.bisks.net/`);
}
requestAnimationFrame(frame);
setDim(3);
