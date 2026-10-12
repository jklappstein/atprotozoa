import { parseIds, start, pair, answer, done, estimate } from "./lib/rank.js";

const KEY = "watchorder.v1";
const $ = (id) => document.getElementById(id);
let S = load() || { phase: "add", titles: {}, total: 0, rank: null, order: [], pos: 0 };

function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }
const thumb = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
const title = (id) => S.titles[id] || `youtu.be/${id}`;

function show(name) {
  for (const s of document.querySelectorAll("section")) s.classList.toggle("on", s.id === "s-" + name);
}

function opt(btn, id) {
  btn.textContent = "";
  const img = document.createElement("img");
  img.src = thumb(id);
  img.alt = "";
  const sp = document.createElement("span");
  sp.textContent = title(id);
  btn.append(img, sp);
  btn.dataset.id = id;
}

function render() {
  if (S.phase === "add") return show("add");
  if (S.phase === "duel") {
    const p = pair(S.rank);
    if (!p) { S.phase = "watch"; S.order = S.rank.sorted; S.pos = 0; save(); return render(); }
    show("duel");
    opt($("optA"), p[0]);
    opt($("optB"), p[1]);
    const left = estimate(S.rank);
    $("prog").style.width = Math.round((S.rank.duels / Math.max(1, S.rank.duels + left)) * 100) + "%";
    $("duelinfo").textContent = `${S.total} videos · about ${left} duels to go`;
    return;
  }
  show("watch");
  renderWatch();
}

function renderWatch() {
  const stage = $("stage");
  stage.textContent = "";
  const id = S.order[S.pos];
  if (id) {
    const h = document.createElement("h2");
    h.textContent = `#${S.pos + 1} of ${S.order.length}: ${title(id)}`;
    const f = document.createElement("iframe");
    f.className = "player";
    f.src = `https://www.youtube-nocookie.com/embed/${id}`;
    f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    f.allowFullscreen = true;
    stage.append(h, f);
  } else {
    stage.textContent = "That's the whole pile. Nothing left to watch. 🎉";
  }
  $("watched").disabled = !id;
  $("skipback").disabled = S.pos === 0;
  const ol = $("queue");
  ol.textContent = "";
  S.order.forEach((v, i) => {
    const li = document.createElement("li");
    li.className = i < S.pos ? "done" : i === S.pos ? "cur" : "";
    const n = document.createElement("span"); n.className = "n"; n.textContent = i + 1;
    const im = document.createElement("img"); im.src = thumb(v); im.alt = "";
    const t = document.createElement("a"); t.className = "t"; t.textContent = title(v);
    t.href = `https://www.youtube.com/watch?v=${v}`; t.target = "_blank"; t.rel = "noopener";
    li.append(n, im, t);
    ol.append(li);
  });
}

async function fetchTitles(ids) {
  // noembed.com is a CORS-open oEmbed proxy; titles are cosmetic, so failures are ignored.
  await Promise.all(ids.map(async (id) => {
    try {
      const r = await fetch("https://noembed.com/embed?url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + id));
      const j = await r.json();
      if (j.title) S.titles[id] = j.title;
    } catch {}
  }));
  save();
  if (S.phase !== "add") render();
}

$("go").addEventListener("click", () => {
  const ids = parseIds($("paste").value);
  if (ids.length < 2) { $("addmsg").textContent = "need at least two videos to rank"; return; }
  S = { phase: "duel", titles: {}, total: ids.length, rank: start(ids), order: [], pos: 0 };
  save();
  render();
  fetchTitles(ids);
});

function pick(first) { answer(S.rank, first); save(); render(); }
$("optA").addEventListener("click", () => pick(true));
$("optB").addEventListener("click", () => pick(false));

$("watched").addEventListener("click", () => { S.pos++; save(); renderWatch(); });
$("skipback").addEventListener("click", () => { if (S.pos > 0) S.pos--; save(); renderWatch(); });

function reset() {
  if (!confirm("Throw away this pile?")) return;
  localStorage.removeItem(KEY);
  S = { phase: "add", titles: {}, total: 0, rank: null, order: [], pos: 0 };
  $("paste").value = "";
  $("addmsg").textContent = "";
  render();
}
$("reset1").addEventListener("click", reset);
$("reset2").addEventListener("click", reset);


render();
if (S.phase !== "add") {
  const all = S.phase === "watch" ? S.order : [...S.rank.queue, ...S.rank.sorted];
  fetchTitles(all.filter((id) => !S.titles[id]));
}
