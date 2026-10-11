// wordping — everything runs in the browser.
//  1. resolve the handle, read the follow (and optionally follower) graph from
//     the public AppView, paged to exhaustion;
//  2. watch Jetstream's whole post stream and keep only posts whose author is
//     in that graph (client-side filter: a Jetstream wantedDids list tops out
//     at 10,000, a big network doesn't);
//  3. match the user's word list and ping: list entry, browser Notification,
//     optional beep, tab title.
// Word list + settings live in localStorage, keyed by the user's DID.

const API = "https://public.api.bsky.app/xrpc/";
const JETSTREAM = [
  "wss://jetstream2.us-east.bsky.network/subscribe",
  "wss://jetstream1.us-east.bsky.network/subscribe",
  "wss://jetstream1.us-west.bsky.network/subscribe",
  "wss://jetstream2.us-west.bsky.network/subscribe",
];
// Page size is the AppView's maximum for getFollows/getFollowers.
const PAGE = 100;
// DOM-memory limit: a busy word over a long-open tab would grow the list
// without bound, and this is a live feed rather than an archive.
const MAX_SHOWN = 200;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let me = null; // { did, handle }
let graph = new Map(); // did -> { handle, name }
let words = [];
let prefs = { whole: true, replies: true, sound: false };
let ws = null, wsIdx = 0, stopped = false, seen = 0, matched = 0;
let regex = null;
let unread = 0;
const baseTitle = typeof document !== "undefined" ? document.title : "";

function setStatus(id, msg, err) {
  const el = $(id);
  el.textContent = msg;
  el.classList.toggle("err", !!err);
}

export function normalizeHandle(s) {
  return String(s || "").trim().replace(/^@/, "").toLowerCase();
}

async function api(method, params) {
  const r = await fetch(API + method + "?" + new URLSearchParams(params));
  if (!r.ok) throw new Error(method + " " + r.status);
  return r.json();
}

async function walk(method, actor, key, onPage) {
  let cursor;
  // Pages to exhaustion: loop until the cursor comes back empty.
  do {
    const p = { actor, limit: PAGE };
    if (cursor) p.cursor = cursor;
    const j = await api(method, p);
    onPage(j[key] || []);
    cursor = j.cursor;
  } while (cursor);
}

// --- storage ---------------------------------------------------------------
const storeKey = (did) => "wordping:" + did;
function load(did) {
  try {
    const j = JSON.parse(localStorage.getItem(storeKey(did)) || "{}");
    words = Array.isArray(j.words) ? j.words : [];
    prefs = Object.assign({ whole: true, replies: true, sound: false }, j.prefs || {});
  } catch { words = []; }
}
function save() {
  if (!me) return;
  localStorage.setItem(storeKey(me.did), JSON.stringify({ words, prefs }));
}

// --- matching --------------------------------------------------------------
export function buildRegex(list, whole) {
  if (!list.length) return null;
  const alts = list.map(escRe).sort((a, b) => b.length - a.length).join("|");
  // \p{L}\p{N} lookarounds instead of \b so non-ASCII words work too.
  return whole
    ? new RegExp("(?<![\\p{L}\\p{N}_])(?:" + alts + ")(?![\\p{L}\\p{N}_])", "giu")
    : new RegExp("(?:" + alts + ")", "giu");
}

function rebuild() {
  regex = buildRegex(words, prefs.whole);
  $("chips").innerHTML = words.map((w, i) =>
    `<span class="chip">${esc(w)}<button type="button" data-i="${i}" aria-label="remove ${esc(w)}">×</button></span>`).join("");
  setStatus("wordStatus", words.length ? "" : "add at least one word to start listening.");
  save();
}

// --- UI --------------------------------------------------------------------
function highlight(text) {
  const re = new RegExp(regex.source, regex.flags);
  let out = "", last = 0, m;
  while ((m = re.exec(text))) {
    if (!m[0]) { re.lastIndex++; continue; }
    out += esc(text.slice(last, m.index)) + "<mark>" + esc(m[0]) + "</mark>";
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

function ping(did, rkey, text) {
  const who = graph.get(did) || { handle: did, name: "" };
  const hits = $("hits");
  const div = document.createElement("div");
  div.className = "hit";
  const url = `https://bsky.app/profile/${did}/post/${rkey}`;
  div.innerHTML = `<div class="who"><a href="https://bsky.app/profile/${esc(did)}" target="_blank" rel="noopener">${esc(who.name || who.handle)}</a> @${esc(who.handle)} · ${new Date().toLocaleTimeString()} · <a href="${url}" target="_blank" rel="noopener">open post ↗</a></div><div class="text">${highlight(text)}</div>`;
  hits.prepend(div);
  while (hits.children.length > MAX_SHOWN) hits.lastChild.remove();
  matched++;
  updateLive();
  if (document.hidden) { unread++; document.title = `(${unread}) ${baseTitle}`; }
  if (window.Notification && Notification.permission === "granted") {
    try {
      const n = new Notification(`@${who.handle} said a word you watch`, { body: text.slice(0, 200) });
      n.onclick = () => { window.open(url, "_blank"); n.close(); };
    } catch {}
  }
  if (prefs.sound) beep();
}

let actx;
function beep() {
  try {
    actx = actx || new AudioContext();
    const o = actx.createOscillator(), g = actx.createGain();
    o.connect(g); g.connect(actx.destination);
    o.frequency.value = 880; g.gain.value = 0.05;
    o.start(); o.stop(actx.currentTime + 0.12);
  } catch {}
}

function updateLive() {
  setStatus("liveStatus", stopped ? "stopped." : `listening to ${graph.size.toLocaleString()} accounts · ${seen.toLocaleString()} posts scanned · ${matched} pings`);
}

// --- jetstream -------------------------------------------------------------
function connect() {
  if (stopped) return;
  const url = JETSTREAM[wsIdx % JETSTREAM.length] + "?wantedCollections=app.bsky.feed.post";
  ws = new WebSocket(url);
  ws.onmessage = (e) => {
    let x;
    try { x = JSON.parse(e.data); } catch { return; }
    if (x.kind !== "commit" || x.commit?.operation !== "create" || x.commit.collection !== "app.bsky.feed.post") return;
    seen++;
    if (seen % 500 === 0) updateLive();
    if (!regex || !graph.has(x.did)) return;
    const r = x.commit.record;
    if (!r || typeof r.text !== "string") return;
    if (!prefs.replies && r.reply) return;
    regex.lastIndex = 0;
    if (regex.test(r.text)) ping(x.did, x.commit.rkey, r.text);
  };
  ws.onclose = () => { if (!stopped) { wsIdx++; setTimeout(connect, 1500); } };
  ws.onerror = () => ws.close();
}

// --- flow ------------------------------------------------------------------
async function start(e) {
  e.preventDefault();
  const h = normalizeHandle($("handle").value);
  if (!h) return setStatus("loadStatus", "type your handle first.", true);
  if (!$("optFollowing").checked && !$("optFollowers").checked) return setStatus("loadStatus", "pick following, followers, or both.", true);
  $("loadBtn").disabled = true;
  stopped = true; if (ws) ws.close();
  try {
    setStatus("loadStatus", "resolving…");
    const p = await api("app.bsky.actor.getProfile", { actor: h });
    me = { did: p.did, handle: p.handle };
    graph = new Map();
    const add = (list) => list.forEach((a) => graph.set(a.did, { handle: a.handle, name: a.displayName || "" }));
    const jobs = [];
    const tick = () => setStatus("loadStatus", `reading your network… ${graph.size.toLocaleString()} accounts`);
    if ($("optFollowing").checked) jobs.push(walk("app.bsky.graph.getFollows", me.did, "follows", (l) => { add(l); tick(); }));
    if ($("optFollowers").checked) jobs.push(walk("app.bsky.graph.getFollowers", me.did, "followers", (l) => { add(l); tick(); }));
    await Promise.all(jobs);
    setStatus("loadStatus", `@${me.handle}: watching ${graph.size.toLocaleString()} accounts.`);
    load(me.did);
    $("optWhole").checked = prefs.whole;
    $("optReplies").checked = prefs.replies;
    $("optSound").checked = prefs.sound;
    $("wordsCard").hidden = false;
    $("liveCard").hidden = false;
    $("hits").innerHTML = "";
    seen = matched = 0;
    rebuild();
    stopped = false;
    updateLive();
    connect();
  } catch (err) {
    setStatus("loadStatus", "couldn't load that account: " + err.message, true);
  } finally {
    $("loadBtn").disabled = false;
  }
}

function addWord(e) {
  e.preventDefault();
  const w = $("wordInput").value.trim().toLowerCase();
  $("wordInput").value = "";
  if (!w || words.includes(w)) return;
  words.push(w);
  rebuild();
}

function init() {
  $("who").addEventListener("submit", start);
  $("wordForm").addEventListener("submit", addWord);
  $("chips").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-i]");
    if (!b) return;
    words.splice(+b.dataset.i, 1);
    rebuild();
  });
  $("optWhole").addEventListener("change", () => { prefs.whole = $("optWhole").checked; rebuild(); });
  $("optReplies").addEventListener("change", () => { prefs.replies = $("optReplies").checked; save(); });
  $("optSound").addEventListener("change", () => { prefs.sound = $("optSound").checked; save(); if (prefs.sound) beep(); });
  $("clearBtn").addEventListener("click", () => { $("hits").innerHTML = ""; matched = 0; unread = 0; document.title = baseTitle; updateLive(); });
  $("notifyBtn").addEventListener("click", async () => {
    if (!window.Notification) return setStatus("liveStatus", "this browser has no notifications.", true);
    const p = await Notification.requestPermission();
    $("notifyBtn").textContent = p === "granted" ? "notifications on ✓" : "notifications blocked";
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { unread = 0; document.title = baseTitle; } });
  $("secret").addEventListener("click", () => {
    const i = $("handle");
    i.value = "@cee.wtf";
    i.dispatchEvent(new Event("input", { bubbles: true }));
    i.dispatchEvent(new Event("change", { bubbles: true }));
    i.focus();
  });
  $("shareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent("I set up a ping for when anyone I follow posts the words I care about 🔔 https://wordping.bisks.net");
  if (window.attachHandleTypeahead) window.attachHandleTypeahead($("handle"));
  if (window.Notification && Notification.permission === "granted") $("notifyBtn").textContent = "notifications on ✓";
}

if (typeof document !== "undefined") init();
