import { Sim, PRESETS, DEFAULTS, DMAX } from "./sim.js";

const N = 256;
const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");
const img = ctx.createImageData(N, N);
const sim = new Sim(N, N);

const SLIDERS = [
  ["f1", "feed of A1", 0, 0.08, 0.0005, "g1"],
  ["f2", "feed of A2", 0, 0.08, 0.0005, "g2"],
  ["D1", "diffusion of A1", 0, DMAX, 0.005, "g1"],
  ["D2", "diffusion of A2", 0, DMAX, 0.005, "g2"],
  ["c1", "share of B made from A1", 0, 1, 0.01, "g1"],
  ["c2", "share of B made from A2", 0, 1, 0.01, "g2"],
  ["k", "B kill rate", 0.03, 0.08, 0.0005, ""],
  ["DB", "diffusion of B", 0, DMAX, 0.005, ""],
];
const els = {};
const box = document.getElementById("sliders");
for (const [key, label, min, max, step, cls] of SLIDERS) {
  const row = document.createElement("div");
  row.className = "row " + cls;
  row.title = label;
  const name = document.createElement("span"); name.textContent = key;
  const inp = document.createElement("input");
  inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.id = "s-" + key;
  inp.setAttribute("aria-label", label);
  const out = document.createElement("output");
  row.append(name, inp, out);
  box.append(row);
  els[key] = { inp, out };
  inp.addEventListener("input", () => { sim.p[key] = parseFloat(inp.value); out.textContent = fmt(key, sim.p[key]); presetSel.value = ""; writeHash(); });
}
function fmt(key, v) { return v.toFixed(key[0] === "D" || key[0] === "c" ? 2 : 4); }
function syncSliders() {
  for (const key in els) { els[key].inp.value = sim.p[key]; els[key].out.textContent = fmt(key, sim.p[key]); }
}

const presetSel = document.getElementById("preset");
presetSel.append(new Option("custom", ""));
for (const name of Object.keys(PRESETS)) presetSel.append(new Option(name, name));
presetSel.addEventListener("change", () => {
  if (!PRESETS[presetSel.value]) return;
  sim.p = { ...PRESETS[presetSel.value] };
  syncSliders(); sim.reset(Date.now()); writeHash();
});

// settings live in the url hash so a link reproduces them
function writeHash() {
  const q = new URLSearchParams();
  for (const k in DEFAULTS) q.set(k, sim.p[k]);
  history.replaceState(null, "", "#" + q);
  const url = location.href;
  document.getElementById("bsky").href = "https://bsky.app/intent/compose?text=" +
    encodeURIComponent("a two-substrate Gray-Scott reaction diffusion: " + url);
}
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  let any = false;
  for (const k in DEFAULTS) {
    const v = parseFloat(q.get(k));
    if (Number.isFinite(v)) { sim.p[k] = v; any = true; }
  }
  return any;
}

if (!readHash()) { sim.p = { ...PRESETS["maze, two diets"] }; presetSel.value = "maze, two diets"; }
else {
  const m = Object.entries(PRESETS).find(([, p]) => Object.keys(p).every((k) => p[k] === sim.p[k]));
  presetSel.value = m ? m[0] : "";
}
syncSliders(); writeHash();

let running = true;
const playBtn = document.getElementById("play");
playBtn.addEventListener("click", () => { running = !running; playBtn.textContent = running ? "pause" : "play"; });
document.getElementById("reset").addEventListener("click", () => sim.reset(Date.now()));
document.getElementById("clear").addEventListener("click", () => { sim.a1.fill(1); sim.a2.fill(1); sim.b.fill(0); });
const view = document.getElementById("view");
const speed = document.getElementById("speed");
const stat = document.getElementById("stat");

document.getElementById("copy").addEventListener("click", async (e) => {
  try { await navigator.clipboard.writeText(location.href); e.target.textContent = "copied"; }
  catch { e.target.textContent = "copy the address bar"; }
  setTimeout(() => (e.target.textContent = "copy link to these settings"), 1500);
});

// painting
let down = false;
function paintAt(ev) {
  const r = cv.getBoundingClientRect();
  const x = Math.floor(((ev.clientX - r.left) / r.width) * N);
  const y = Math.floor(((ev.clientY - r.top) / r.height) * N);
  sim.paint(x, y, 3);
}
cv.addEventListener("pointerdown", (e) => { down = true; cv.setPointerCapture(e.pointerId); paintAt(e); });
cv.addEventListener("pointermove", (e) => { if (down) paintAt(e); });
cv.addEventListener("pointerup", () => (down = false));
cv.addEventListener("pointercancel", () => (down = false));

let frame = 0;
function tick() {
  if (running) sim.step(parseInt(speed.value, 10));
  sim.render(img.data, view.value);
  ctx.putImageData(img, 0, 0);
  if (++frame % 20 === 0) {
    const s = sim.stats();
    stat.textContent = Number.isFinite(s.mean) ? "mean B " + s.mean.toFixed(3) : "numerical blow-up — hit reseed";
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
