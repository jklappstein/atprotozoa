import { GENRES, FAMILIES } from "./lib/genres.js";
import { SQ3, normalize, toXY, fromXY, dist } from "./lib/ternary.js";

const NS = "http://www.w3.org/2000/svg";
const svg = document.getElementById("plot");
const tip = document.getElementById("tip");
const detail = document.getElementById("detail");
const q = document.getElementById("q");
const legend = document.getElementById("legend");
const shareA = document.getElementById("share");

const off = new Set();
let selected = null;   // genre id
let mine = null;       // [m,h,r] user marker

const el = (tag, attrs = {}, parent = svg) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  parent.appendChild(e);
  return e;
};
const pct = v => Math.round(v * 100);

function drawFrame() {
  el("polygon", { points: `0.5,0 0,${SQ3} 1,${SQ3}`, fill: "#161926", stroke: "#3a3f58", "stroke-width": 0.004 });
  for (let i = 1; i < 10; i++) {
    const t = i / 10;
    const lines = [
      [[t, 1 - t, 0], [t, 0, 1 - t]],   // constant melody
      [[1 - t, t, 0], [0, t, 1 - t]],   // constant harmony
      [[1 - t, 0, t], [0, 1 - t, t]],   // constant rhythm
    ];
    for (const [a, b] of lines) {
      const [x1, y1] = toXY(a), [x2, y2] = toXY(b);
      el("line", { x1, y1, x2, y2, stroke: "#252a3d", "stroke-width": 0.002 });
    }
  }
  const lab = (x, y, t, c, anchor) => { const e = el("text", { x, y, fill: c, "font-size": 0.045, "font-weight": 700, "text-anchor": anchor }); e.textContent = t; };
  lab(0.5, -0.04, "MELODY", "#ff8a5c", "middle");
  lab(0, SQ3 + 0.07, "HARMONY", "#6aa8ff", "start");
  lab(1, SQ3 + 0.07, "RHYTHM", "#7be0a0", "end");
  for (let i = 2; i < 10; i += 2) {
    const t = i / 10;
    const [x, y] = toXY([t, 1 - t, 0]);
    const e = el("text", { x: x - 0.015, y: y + 0.008, fill: "#5d637c", "font-size": 0.025, "text-anchor": "end" });
    e.textContent = i * 10 + "%";
  }
}

drawFrame();
const dotLayer = el("g");
const markLayer = el("g");

const dots = new Map();
for (const g of GENRES) {
  const [x, y] = toXY([g.m, g.h, g.r]);
  const c = el("circle", { cx: x, cy: y, r: 0.0125, fill: FAMILIES[g.family], class: "dot" }, dotLayer);
  c.addEventListener("mouseenter", () => showTip(g, x, y));
  c.addEventListener("mouseleave", () => { tip.hidden = true; });
  c.addEventListener("click", e => { e.stopPropagation(); select(g.id); });
  dots.set(g.id, c);
}

function showTip(g, x, y) {
  const box = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
  tip.textContent = g.name;
  tip.style.left = ((x - vb.x) / vb.width) * box.width + "px";
  tip.style.top = ((y - vb.y) / vb.height) * box.height + "px";
  tip.hidden = false;
}

function bar(p) {
  return `<div class="bar"><span style="width:${p[0] * 100}%"></span><span style="width:${p[1] * 100}%"></span><span style="width:${p[2] * 100}%"></span></div>
  <div class="nums"><span class="cm">melody ${pct(p[0])}%</span><span class="ch">harmony ${pct(p[1])}%</span><span class="cr">rhythm ${pct(p[2])}%</span></div>`;
}

function nearest(p, n, skipId) {
  return GENRES.filter(g => g.id !== skipId)
    .map(g => ({ g, d: dist(p, [g.m, g.h, g.r]) }))
    .sort((a, b) => a.d - b.d).slice(0, n).map(o => o.g);
}

function select(id) {
  selected = id;
  const g = GENRES.find(x => x.id === id);
  for (const [k, c] of dots) c.classList.toggle("sel", k === id);
  if (!g) { updateShare(); return; }
  const p = [g.m, g.h, g.r];
  detail.innerHTML = `<h2></h2><div class="fam"></div><div class="note"></div>${bar(p)}<div class="near-h hint">closest neighbors</div><ul class="near"></ul>`;
  detail.querySelector("h2").textContent = g.name;
  detail.querySelector(".fam").textContent = g.family;
  detail.querySelector(".note").textContent = g.note;
  const ul = detail.querySelector(".near");
  for (const n of nearest(p, 4, id)) {
    const li = document.createElement("li");
    const b = document.createElement("a");
    b.href = "#"; b.textContent = n.name;
    b.addEventListener("click", e => { e.preventDefault(); select(n.id); });
    li.appendChild(b); ul.appendChild(li);
  }
  updateShare();
}

function placeMine(p) {
  mine = p;
  markLayer.replaceChildren();
  const [x, y] = toXY(p);
  el("circle", { cx: x, cy: y, r: 0.02, fill: "none", stroke: "#fff", "stroke-width": 0.006 }, markLayer);
  el("circle", { cx: x, cy: y, r: 0.006, fill: "#fff" }, markLayer);
  selected = null;
  for (const c of dots.values()) c.classList.remove("sel");
  detail.innerHTML = `<h2>your marker</h2>${bar(p)}<div class="near-h hint">your music sounds like</div><ul class="near"></ul>`;
  const ul = detail.querySelector(".near");
  for (const n of nearest(p, 5)) {
    const li = document.createElement("li");
    li.textContent = n.name;
    ul.appendChild(li);
  }
  updateShare();
}

svg.addEventListener("click", e => {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const u = pt.matrixTransform(svg.getScreenCTM().inverse());
  const p = fromXY(u.x, u.y);
  if (p) placeMine(normalize(...p));
});

function updateShare() {
  let text = "musicplexorama: every music genre on a melody / harmony / rhythm triangle";
  if (selected) {
    const g = GENRES.find(x => x.id === selected);
    text = `${g.name} is ${pct(g.m)}% melody, ${pct(g.h)}% harmony, ${pct(g.r)}% rhythm (musicplexorama)`;
  } else if (mine) {
    text = `my music is ${pct(mine[0])}% melody, ${pct(mine[1])}% harmony, ${pct(mine[2])}% rhythm — closest to ${nearest(mine, 1)[0].name} (musicplexorama)`;
  }
  shareA.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text + " https://musicplexorama.bisks.net/");
}

function applyFilter() {
  const term = q.value.trim().toLowerCase();
  for (const g of GENRES) {
    const hit = (!term || g.name.toLowerCase().includes(term)) && !off.has(g.family);
    dots.get(g.id).classList.toggle("dim", !hit);
  }
}
q.addEventListener("input", applyFilter);
q.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  const term = q.value.trim().toLowerCase();
  const g = GENRES.find(x => x.name.toLowerCase().includes(term));
  if (term && g) select(g.id);
});

for (const [fam, color] of Object.entries(FAMILIES)) {
  const b = document.createElement("button");
  b.innerHTML = `<i style="background:${color}"></i>`;
  b.append(fam);
  b.addEventListener("click", () => {
    if (off.has(fam)) off.delete(fam); else off.add(fam);
    b.classList.toggle("off", off.has(fam));
    applyFilter();
  });
  legend.appendChild(b);
}

updateShare();
