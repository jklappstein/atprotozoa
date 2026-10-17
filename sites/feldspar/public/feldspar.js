// Ternary: Or at the top, Ab bottom-left, An bottom-right.
const svg = document.getElementById("tri");
const dot = document.getElementById("dot");
const TOP = [200, 20], AB = [20, 332], AN = [380, 332];

// mol% (or, ab, an) -> svg point, and back
function toXY(or, ab, an) {
  return [or * TOP[0] + ab * AB[0] + an * AN[0], or * TOP[1] + ab * AB[1] + an * AN[1]];
}
function fromXY(x, y) {
  const or = (332 - y) / 312;
  const an = (x - 20 - 180 * or) / 360;
  return [or, 1 - or - an, an];
}

// faint grid every 10%, dashed lines at the An 10% / Or 10% boundaries used below
const grid = document.getElementById("grid");
const NS = "http://www.w3.org/2000/svg";
function line(a, b, cls) {
  const l = document.createElementNS(NS, "line");
  l.setAttribute("x1", a[0]); l.setAttribute("y1", a[1]);
  l.setAttribute("x2", b[0]); l.setAttribute("y2", b[1]);
  if (cls) l.setAttribute("class", cls);
  grid.appendChild(l);
}
for (let i = 1; i < 10; i++) {
  const t = i / 10, reg = i === 1 || i === 9;
  line(toXY(t, 1 - t, 0), toXY(t, 0, 1 - t), reg ? "reg" : "");
  line(toXY(1 - t, t, 0), toXY(0, t, 1 - t), reg ? "reg" : "");
  line(toXY(1 - t, 0, t), toXY(0, 1 - t, t), reg ? "reg" : "");
}

function classify(or, ab, an) {
  const O = or * 100, A = an * 100;
  if (A < 10) {
    if (O >= 90) return ["K-feldspar (orthoclase / microcline / sanidine)", "Potassium-rich. Pink or cream, the feldspar of granite and pegmatite. Microcline has the tartan twinning; sanidine is the glassy high-temperature form in volcanic rock."];
    if (O > 10) return ["alkali feldspar (anorthoclase / perthite range)", "A potassium-sodium mix. Above about 600 °C it is one crystal; cooled slowly it unmixes into perthite, sodium threads inside a potassium host."];
    return ["albite", "Nearly pure sodium. White, tabular, often bladed ('cleavelandite'). It sits at the end of both the alkali and plagioclase series."];
  }
  if (O >= 10) return ["ternary feldspar", "Potassium, sodium and calcium all in play. Rare: it only holds together at very high temperatures, in some volcanic rocks, and unmixes on cooling."];
  if (A < 30) return ["oligoclase", "Sodium-leaning plagioclase. Common in granites and gneisses; the 'sunstone' variety glitters with hematite flakes."];
  if (A < 50) return ["andesine", "Mid plagioclase, named for the Andes. The main feldspar of andesite volcanoes."];
  if (A < 70) return ["labradorite", "Calcium-leaning plagioclase. Famous for its flash of blue and gold, the labradorescence from nanoscale exsolution layers. Basalt and gabbro."];
  if (A < 90) return ["bytownite", "Calcium-rich and rare, found in some mafic and layered intrusions."];
  return ["anorthite", "Nearly pure calcium end-member. Dense, grey-white, and the bulk of the rock anorthosite, which makes up the moon's bright highlands."];
}

let comp = [0.1, 0.55, 0.35];
function show() {
  const [or, ab, an] = comp;
  const p = toXY(or, ab, an);
  dot.setAttribute("cx", p[0]); dot.setAttribute("cy", p[1]);
  const [name, desc] = classify(or, ab, an);
  document.getElementById("name").textContent = name;
  document.getElementById("mix").textContent =
    `Or${Math.round(or * 100)} Ab${Math.round(ab * 100)} An${Math.round(an * 100)}`;
  document.getElementById("desc").textContent = desc;
  return name;
}

function pick(ev) {
  const r = svg.getBoundingClientRect();
  const x = (ev.clientX - r.left) * 400 / r.width;
  const y = (ev.clientY - r.top) * 360 / r.height;
  let [or, ab, an] = fromXY(x, y);
  // clamp into the triangle
  or = Math.max(0, or); ab = Math.max(0, ab); an = Math.max(0, an);
  const s = or + ab + an;
  comp = [or / s, ab / s, an / s];
  show();
}
let down = false;
svg.addEventListener("pointerdown", e => { down = true; svg.setPointerCapture(e.pointerId); pick(e); });
svg.addEventListener("pointermove", e => { if (down) pick(e); });
svg.addEventListener("pointerup", () => { down = false; });
svg.addEventListener("pointercancel", () => { down = false; });

document.getElementById("share").addEventListener("click", () => {
  const [or, ab, an] = comp;
  const name = show();
  const text = `my feldspar is ${name} (Or${Math.round(or * 100)} Ab${Math.round(ab * 100)} An${Math.round(an * 100)})\nhttps://feldspar.bisks.net/`;
  window.open("https://bsky.app/intent/compose?text=" + encodeURIComponent(text), "_blank", "noopener");
});

show();
