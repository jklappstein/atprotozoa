import { ENTRIES } from "./data.js";

const LABEL = { hit: "called it", mixed: "half right", miss: "missed" };
const list = document.getElementById("list");
const q = document.getElementById("q");
const tally = document.getElementById("tally");
let verdict = "all";

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function render() {
  const needle = q.value.trim().toLowerCase();
  const rows = ENTRIES.filter((e) =>
    (verdict === "all" || e.verdict === verdict) &&
    (!needle || [e.title, e.by, e.claim, e.reality].join(" ").toLowerCase().includes(needle))
  ).sort((a, b) => a.year - b.year);
  list.replaceChildren();
  for (const e of rows) {
    const li = el("li", e.verdict);
    li.append(el("span", "badge", LABEL[e.verdict]));
    li.append(el("h2", "", e.title));
    li.append(el("div", "meta", `${e.by} · ${e.year} · set in ${e.set}`));
    const a = el("p"); a.append(el("b", "", "The story: "), document.createTextNode(e.claim));
    const b = el("p"); b.append(el("b", "", "Reality: "), document.createTextNode(e.reality));
    li.append(a, b);
    list.append(li);
  }
  const n = (v) => ENTRIES.filter((e) => e.verdict === v).length;
  tally.textContent = `${rows.length} shown · ${n("hit")} called it · ${n("mixed")} half right · ${n("miss")} missed`;
  if (!rows.length) list.append(el("li", "mixed", "nothing matches."));
}

document.getElementById("tabs").addEventListener("click", (ev) => {
  const btn = ev.target.closest("button");
  if (!btn) return;
  verdict = btn.dataset.v;
  for (const b of document.querySelectorAll("#tabs button")) b.classList.toggle("on", b === btn);
  render();
});
q.addEventListener("input", render);

const text = `Fiction isn't prophecy: ${ENTRIES.filter((e) => e.verdict === "hit").length} stories that called it, ${ENTRIES.filter((e) => e.verdict === "miss").length} that missed.\nhttps://foresight.bisks.net/`;
document.getElementById("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
render();
