// clipliker — likes every video post from one account, from the browser.
// 1) catch-up: page through the account's video feed to exhaustion and like
//    whatever the user hasn't liked yet; 2) live: Jetstream, filtered to that
//    DID's posts, likes new video posts as they arrive. Create-only OAuth.

import { login, completeLoginIfCallback, getSession, clearSession, resolveHandle } from "./lib/oauth.js";
import { likePost } from "./lib/like.js";

const $ = (id) => document.getElementById(id);
const APPVIEW = "https://public.api.bsky.app";
let session = null;
let running = false;
let ws = null;
let likedSet = new Set();
let nLiked = 0;

const cleanHandle = (s) => (s || "").trim().replace(/^@/, "");

function setStatus(msg, cls = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = "status " + cls;
}
function logLine(text) {
  const li = document.createElement("li");
  li.textContent = text;
  $("log").prepend(li);
}
function renderCounts() {
  $("liked").textContent = nLiked;
  $("already").textContent = likedSet.size;
}

function renderAuth() {
  const on = !!session;
  $("signinRow").hidden = on;
  $("panel").hidden = !on;
  $("who").textContent = on ? `signed in as ${session.handle || session.did}` : "not signed in.";
}

// The user's own likes are public repo data; read to exhaustion (cursor ends).
async function fetchLikedSet() {
  const set = new Set();
  const base = session.pdsUrl.replace(/\/$/, "");
  let cursor;
  do {
    const url = new URL(`${base}/xrpc/com.atproto.repo.listRecords`);
    url.searchParams.set("repo", session.did);
    url.searchParams.set("collection", "app.bsky.feed.like");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`couldn't read your likes (${res.status})`);
    const data = await res.json();
    for (const r of data.records || []) if (r.value?.subject?.uri) set.add(r.value.subject.uri);
    cursor = (data.records || []).length ? data.cursor : undefined;
  } while (cursor);
  return set;
}

async function likeIfNew(uri, cid, label) {
  if (likedSet.has(uri)) return;
  await likePost(session, { uri, cid });
  likedSet.add(uri);
  nLiked++;
  renderCounts();
  logLine(`♥ ${label}`);
}

async function catchUp(did) {
  let cursor;
  let seen = 0;
  do {
    if (!running) return;
    const url = new URL(`${APPVIEW}/xrpc/app.bsky.feed.getAuthorFeed`);
    url.searchParams.set("actor", did);
    url.searchParams.set("filter", "posts_with_video");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`feed fetch failed (${res.status})`);
    const data = await res.json();
    for (const item of data.feed || []) {
      if (!running) return;
      const p = item.post;
      if (item.reason || p.author.did !== did) continue; // skip reposts
      seen++;
      setStatus(`catching up… ${seen} videos checked`);
      try {
        await likeIfNew(p.uri, p.cid, (p.record?.text || "(video)").slice(0, 70));
      } catch (e) {
        logLine(`✗ ${e.message}`);
      }
    }
    cursor = (data.feed || []).length ? data.cursor : undefined;
  } while (cursor);
}

function watchLive(did) {
  const url = new URL("wss://jetstream2.us-east.bsky.network/subscribe");
  url.searchParams.set("wantedCollections", "app.bsky.feed.post");
  url.searchParams.set("wantedDids", did);
  ws = new WebSocket(url);
  ws.onopen = () => setStatus("caught up — watching for new videos…", "");
  ws.onmessage = async (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (m.kind !== "commit" || m.commit?.operation !== "create") return;
    const rec = m.commit.record;
    if (rec?.embed?.$type !== "app.bsky.embed.video") return;
    if (rec.reply) return;
    try {
      await likeIfNew(`at://${m.did}/app.bsky.feed.post/${m.commit.rkey}`, m.commit.cid, "new video: " + (rec.text || "").slice(0, 60));
    } catch (e) {
      logLine(`✗ ${e.message}`);
    }
  };
  ws.onclose = () => {
    if (running) setTimeout(() => running && watchLive(did), 3000);
  };
}

function stop() {
  running = false;
  if (ws) { const w = ws; ws = null; w.onclose = null; w.close(); }
  $("startBtn").hidden = false;
  $("stopBtn").hidden = true;
  setStatus("stopped.");
}

async function start() {
  const target = cleanHandle($("target").value);
  if (!target) return setStatus("enter an account", "err");
  running = true;
  $("startBtn").hidden = true;
  $("stopBtn").hidden = false;
  try {
    setStatus("resolving account…");
    const did = target.startsWith("did:") ? target : await resolveHandle(target);
    if (!did) throw new Error(`couldn't resolve @${target}`);
    setStatus("reading your existing likes…");
    likedSet = await fetchLikedSet();
    renderCounts();
    watchLive(did); // open first so videos posted during catch-up aren't missed
    await catchUp(did);
    if (running) setStatus("caught up — watching for new videos…");
  } catch (e) {
    setStatus(e.message || String(e), "err");
    stop();
    setStatus(e.message || String(e), "err");
  }
}

$("startBtn").addEventListener("click", start);
$("stopBtn").addEventListener("click", stop);
$("signoutBtn").addEventListener("click", async () => {
  stop();
  await clearSession();
  session = null;
  renderAuth();
});
$("signinBtn").addEventListener("click", async () => {
  const h = cleanHandle($("handle").value);
  if (!h) return;
  try { await login(h); } catch (e) { $("who").textContent = e.message || String(e); }
});
$("handle").addEventListener("keydown", (e) => { if (e.key === "Enter") $("signinBtn").click(); });

(async () => {
  try {
    session = (await completeLoginIfCallback()) || (await getSession());
  } catch (e) {
    $("who").textContent = e.message || String(e);
  }
  renderAuth();
})();
