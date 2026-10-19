import {
  loadSightings, cleanHandle, hydratePosts, hydrateProfiles, getPost, getProfile, postUrl,
} from "./lib/firstsight.js";

const $ = (id) => document.getElementById(id);
const PAGE = 40; // rows rendered per "show more" click — a DOM-size choice, all data is kept
let state = null; // {handle, authors}
let shown = PAGE;
let renderToken = 0;

const fmt = (t) => new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

function show(id) {
  for (const s of ["gate", "progress", "results"]) $(s).classList.toggle("hidden", s !== id);
}

$("goForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const h = cleanHandle($("handle").value);
  if (!h) { $("goMsg").textContent = "type a handle first"; return; }
  $("goMsg").textContent = "";
  $("goBtn").disabled = true;
  show("progress");
  try {
    state = await loadSightings(h, (m) => { $("status").textContent = m; });
    shown = PAGE;
    show("results");
    renderAll();
  } catch (err) {
    show("gate");
    $("goMsg").textContent = String((err && err.message) || err);
    $("goMsg").className = "msg err";
  } finally {
    $("goBtn").disabled = false;
  }
});

function sorted() {
  const q = cleanHandle($("filter").value);
  const dir = $("order").value === "new" ? -1 : 1;
  let list = state.authors.filter((a) => a.sight);
  if (q) {
    list = list.filter((a) => {
      const p = getProfile(a.did);
      return a.did.includes(q) || (p && ((p.handle || "").toLowerCase().includes(q) || (p.displayName || "").toLowerCase().includes(q)));
    });
  }
  return list.sort((a, b) => dir * (a.sight.t - b.sight.t));
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function postBlock(label, ev, kind) {
  const box = el("div", "ev");
  const head = el("div", "evh");
  head.append(el("span", "lab", label + " · "), el("span", "when", fmt(ev.t)));
  if (kind) head.append(el("span", "kind", " · " + kind));
  box.append(head);
  const p = getPost(ev.uri);
  const a = el("a", "txt", p === undefined ? "…" : p === null ? "(deleted or unavailable)" : (p.record && p.record.text) || "(no text — media or embed)");
  a.href = postUrl(ev.uri);
  a.target = "_blank";
  a.rel = "noopener";
  box.append(a);
  return box;
}

function row(a) {
  const li = el("li", "row-card");
  const p = getProfile(a.did);
  const who = el("div", "who");
  const link = el("a", "name", p ? "@" + p.handle : a.did);
  link.href = "https://bsky.app/profile/" + a.did;
  link.target = "_blank";
  link.rel = "noopener";
  who.append(link);
  if (p && p.displayName) who.append(el("span", "dn", " " + p.displayName));
  who.append(el("span", "cnt", ` · ${a.count} touch${a.count === 1 ? "" : "es"}`));
  li.append(who);
  li.append(postBlock("first post you saw", a.sight, a.sight.kind));
  if (a.liked && a.liked.uri !== a.sight.uri) li.append(postBlock("first post you liked", a.liked));
  else if (a.liked) li.querySelector(".lab").textContent = "first post you saw & liked";
  return li;
}

async function renderAll() {
  const token = ++renderToken;
  const list = sorted();
  const slice = list.slice(0, shown);
  $("count").textContent = `${list.length} accounts · from ${state.total.toLocaleString()} records in @${state.handle}'s repo`;
  const ul = $("list");
  ul.replaceChildren(...slice.map(row));
  $("more").classList.toggle("hidden", list.length <= shown);
  $("more").textContent = `show ${Math.min(PAGE, list.length - shown)} more`;
  renderToday();
  renderShare(list);
  // fill in text and handles for what's on screen, then repaint those rows
  const uris = [];
  for (const a of slice) { uris.push(a.sight.uri); if (a.liked) uris.push(a.liked.uri); }
  await Promise.all([hydratePosts(uris), hydrateProfiles(slice.map((a) => a.did))]);
  if (token !== renderToken) return;
  ul.replaceChildren(...slice.map(row));
  renderToday();
  renderShare(list);
}

// "on this day": a first sighting or first like that happened on today's
// month/day in an earlier year.
function renderToday() {
  const now = new Date();
  const hits = [];
  for (const a of state.authors) {
    for (const [label, ev] of [["first saw", a.sight], ["first liked", a.liked]]) {
      if (!ev) continue;
      const d = new Date(ev.t);
      if (d.getMonth() === now.getMonth() && d.getDate() === now.getDate() && d.getFullYear() < now.getFullYear()) {
        hits.push({ a, label, ev, years: now.getFullYear() - d.getFullYear() });
      }
    }
  }
  const box = $("today");
  box.replaceChildren();
  if (!hits.length) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  box.append(el("h2", null, "on this day"));
  hits.sort((x, y) => y.years - x.years);
  for (const h of hits) {
    const p = getProfile(h.a.did);
    const line = el("div", "todayline");
    const a = el("a", null, p ? "@" + p.handle : h.a.did);
    a.href = postUrl(h.ev.uri);
    a.target = "_blank";
    a.rel = "noopener";
    line.append(el("b", null, `${h.years} year${h.years === 1 ? "" : "s"} ago today `), `you ${h.label} a post by `, a);
    box.append(line);
  }
}

function renderShare(list) {
  const oldest = state.authors.filter((a) => a.sight).sort((x, y) => x.sight.t - y.sight.t)[0];
  if (!oldest) return;
  const p = getProfile(oldest.did);
  const who = p ? "@" + p.handle : "someone";
  const text = `the first post of anyone's I ever saw on here: ${who}, ${fmt(oldest.sight.t)}. ${state.authors.length} accounts since.\n\nhttps://firstsight.bisks.net/`;
  $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
}

$("filter").addEventListener("input", () => { shown = PAGE; if (state) renderAll(); });
$("order").addEventListener("change", () => { shown = PAGE; if (state) renderAll(); });
$("more").addEventListener("click", () => { shown += PAGE; renderAll(); });
$("again").addEventListener("click", () => show("gate"));
