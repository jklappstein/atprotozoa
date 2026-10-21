import { averageColor, sortByHue, bucket, css, mosaicDims, thumbUrl } from "./colors.js";

const PUB = "https://public.api.bsky.app/xrpc/";
const $ = (id) => document.getElementById(id);
const TILE_PX = 96; // backing resolution of each tile canvas; CSS scales it to the tile-size slider

let posts = [];          // newest first: { uri, text, createdAt, likeCount, colors, likers, tile }
let mode = "avg";
let cursor = null;       // getAuthorFeed cursor; null + done=true means the feed is exhausted
let done = false;
let loadingFeed = false;
let session = 0;         // bumped per search so stale async work from a previous handle is dropped
let handleShown = "";
let did = "";

// Accepts what people actually paste: "@alice", "alice" (-> alice.bsky.social),
// a bsky.app profile URL, a did:, and handles carrying invisible bidi/zero-width
// marks (copied from the app). getProfile answers 400 to anything else.
function normHandle(s) {
  let h = String(s || "").replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "").trim();
  const m = h.match(/bsky\.app\/profile\/([^/?#\s]+)/i);
  if (m) h = m[1];
  h = h.replace(/^at:\/\//, "").replace(/^@+/, "").replace(/[/?#].*$/, "").trim().toLowerCase();
  if (h.startsWith("did:")) return h;
  h = h.replace(/\.+$/, "");
  if (h && !h.includes(".")) h += ".bsky.social";
  return h;
}

// Tiny semaphore: likers and avatars are many small requests, so run a few at
// a time (browser connection limits, and politeness to the public AppView/CDN).
function limiter(n) {
  let active = 0;
  const q = [];
  const next = () => {
    if (active >= n || !q.length) return;
    active++;
    const { fn, res, rej } = q.shift();
    fn().then(res, rej).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((res, rej) => { q.push({ fn, res, rej }); next(); });
}
const apiSlot = limiter(4);
const imgSlot = limiter(10);

async function api(path, params) {
  const u = new URL(PUB + path);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(u);
    if (r.ok) return r.json();
    if (r.status === 429 || r.status >= 500) { await new Promise((ok) => setTimeout(ok, 800 * (attempt + 1))); continue; }
    throw new Error(`${path} failed (${r.status})`);
  }
  throw new Error(`${path} kept failing`);
}

// avatar url -> Promise<[r,g,b] | null>. One shared promise per distinct pfp,
// since the same people like many posts.
const colorCache = new Map();
function avatarColor(url) {
  if (colorCache.has(url)) return colorCache.get(url);
  const p = imgSlot(() => new Promise((ok) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 8;
        const x = c.getContext("2d", { willReadFrequently: true });
        x.drawImage(img, 0, 0, 8, 8);
        const d = x.getImageData(0, 0, 8, 8).data;
        const px = [];
        for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) px.push([d[i], d[i + 1], d[i + 2]]);
        ok(averageColor(px));
      } catch { ok(null); }
    };
    img.onerror = () => ok(null);
    img.src = "/api/avatar?u=" + encodeURIComponent(thumbUrl(url)); // same-origin proxy: cdn.bsky.app has no CORS headers
  }));
  colorCache.set(url, p);
  return p;
}

// Every liker of one post, paged to exhaustion (getLikes has no bulk form).
async function fetchLikers(uri, mySession) {
  const out = [];
  let cur;
  do {
    const j = await apiSlot(() => api("app.bsky.feed.getLikes", { uri, limit: 100, cursor: cur }));
    for (const l of j.likes || []) out.push(l.actor);
    cur = j.cursor;
    if (mySession !== session) return out;
  } while (cur);
  return out;
}

async function paintPost(p, mySession) {
  if (!p.likeCount) { p.colors = []; p.likers = []; drawTile(p); return; }
  try {
    const likers = await fetchLikers(p.uri, mySession);
    if (mySession !== session) return;
    p.likers = likers;
    const cols = await Promise.all(likers.map((a) => (a.avatar ? avatarColor(a.avatar) : null)));
    if (mySession !== session) return;
    p.colors = cols.filter(Boolean);
  } catch { p.colors = []; p.likers = []; p.failed = true; }
  drawTile(p);
  updateStatus();
  if (selected === p) showDetail(p);
}

// ---- drawing ----
function drawInto(ctx, p, x, y, s, m) {
  ctx.fillStyle = "#26262b";
  ctx.fillRect(x, y, s, s);
  if (!p.colors || !p.colors.length) return;
  if (m === "avg") {
    ctx.fillStyle = css(averageColor(p.colors));
    ctx.fillRect(x, y, s, s);
  } else if (m === "grad") {
    const st = bucket(sortByHue(p.colors), 24);
    if (st.length === 1) { ctx.fillStyle = css(st[0]); ctx.fillRect(x, y, s, s); return; }
    const g = ctx.createLinearGradient(x, y, x + s, y + s);
    st.forEach((c, i) => g.addColorStop(i / (st.length - 1), css(c)));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, s, s);
  } else {
    const sorted = sortByHue(p.colors);
    const { cols, rows } = mosaicDims(sorted.length);
    const cw = s / cols, ch = s / rows;
    sorted.forEach((c, i) => {
      ctx.fillStyle = css(c);
      ctx.fillRect(x + (i % cols) * cw, y + Math.floor(i / cols) * ch, Math.ceil(cw), Math.ceil(ch));
    });
  }
}

function drawTile(p) {
  p.tile.classList.remove("pending");
  const cv = p.tile.firstChild;
  drawInto(cv.getContext("2d"), p, 0, 0, TILE_PX, mode);
}

function redrawAll() { posts.forEach((p) => p.colors && drawTile(p)); }

function addTile(p) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "tile pending";
  b.title = p.likeCount ? `${p.likeCount} likes` : "no likes";
  const cv = document.createElement("canvas");
  cv.width = cv.height = TILE_PX;
  b.appendChild(cv);
  b.addEventListener("click", () => select(p));
  p.tile = b;
  $("grid").appendChild(b);
}

// ---- detail panel ----
let selected = null;
function select(p) {
  if (selected && selected.tile) selected.tile.classList.remove("sel");
  selected = p;
  p.tile.classList.add("sel");
  showDetail(p);
}

function showDetail(p) {
  const d = $("detail");
  d.hidden = false;
  d.innerHTML = "";
  const t = document.createElement("p");
  t.className = "txt";
  t.textContent = p.text || "(no text)";
  const m = document.createElement("div");
  m.className = "meta";
  const a = document.createElement("a");
  const rkey = p.uri.split("/").pop();
  a.href = `https://bsky.app/profile/${did}/post/${rkey}`;
  a.target = "_blank"; a.rel = "noopener"; a.style.color = "inherit";
  a.textContent = new Date(p.createdAt).toLocaleString();
  m.append(a, ` · ${p.likeCount} likes`);
  if (p.colors && p.likeCount) m.append(` · ${p.colors.length} with a pfp`);
  d.append(t, m);
  if (p.colors && p.colors.length) {
    const chips = document.createElement("div");
    chips.className = "chips";
    for (const c of sortByHue(p.colors)) {
      const i = document.createElement("i");
      i.style.background = css(c);
      chips.appendChild(i);
    }
    d.appendChild(chips);
  }
}

function updateStatus() {
  const ready = posts.filter((p) => p.colors).length;
  $("status").textContent = `${posts.length} posts loaded for @${handleShown}, ${ready} painted${done ? " · that's the whole timeline" : ""}`;
  $("moreBtn").hidden = done;
  $("shareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(
    `my timeline, painted by the pfps of everyone who liked each post\n\nhttps://likehue.bisks.net/?handle=${handleShown}`);
}

// ---- feed ----
async function loadMore() {
  if (loadingFeed || done) return;
  loadingFeed = true;
  const mySession = session;
  $("moreBtn").disabled = true;
  try {
    const j = await api("app.bsky.feed.getAuthorFeed", { actor: did, limit: 50, filter: "posts_no_replies", cursor });
    if (mySession !== session) return;
    cursor = j.cursor || null;
    if (!cursor) done = true;
    for (const it of j.feed || []) {
      if (it.reason || it.post.author.did !== did) continue; // reposts aren't this account's posts
      const p = {
        uri: it.post.uri,
        text: it.post.record && it.post.record.text,
        createdAt: it.post.record && it.post.record.createdAt || it.post.indexedAt,
        likeCount: it.post.likeCount || 0,
        colors: null, likers: null,
      };
      posts.push(p);
      addTile(p);
      paintPost(p, mySession);
    }
    updateStatus();
  } catch (err) {
    $("msg").textContent = "couldn't load posts: " + (err && err.message ? err.message : err);
  } finally {
    loadingFeed = false;
    $("moreBtn").disabled = false;
  }
}

async function go(e) {
  if (e) e.preventDefault();
  const h = normHandle($("handle").value);
  const msg = $("msg");
  msg.textContent = "";
  if (!h) { msg.textContent = "type a handle first"; return; }
  $("goBtn").disabled = true;
  try {
    msg.textContent = "resolving…";
    let prof;
    try {
      prof = await api("app.bsky.actor.getProfile", { actor: h });
    } catch (err) {
      if (!/\(400\)/.test(err.message)) throw err;
      throw new Error(`"${h}" isn't a valid handle — try something like alice.bsky.social`);
    }
    session++;
    did = prof.did; handleShown = prof.handle;
    posts = []; cursor = null; done = false; selected = null;
    $("grid").innerHTML = "";
    $("detail").hidden = true;
    $("result").hidden = false;
    msg.textContent = "";
    history.replaceState(null, "", "?handle=" + encodeURIComponent(handleShown));
    await loadMore();
    if (!posts.length) msg.textContent = "no posts found for that account";
  } catch (err) {
    msg.textContent = "couldn't do that: " + (err && err.message ? err.message : err);
  } finally {
    $("goBtn").disabled = false;
  }
}

$("goForm").addEventListener("submit", go);
$("moreBtn").addEventListener("click", loadMore);
new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && posts.length) loadMore(); }, { rootMargin: "400px" })
  .observe($("sentinel"));

document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {
  mode = b.dataset.mode;
  document.querySelectorAll(".seg button").forEach((x) => x.classList.toggle("on", x === b));
  redrawAll();
}));
$("size").addEventListener("input", () => $("grid").style.setProperty("--tile", $("size").value + "px"));

$("saveBtn").addEventListener("click", () => {
  if (!posts.length) return;
  const cols = 20, s = 40, rows = Math.ceil(posts.length / cols);
  const cv = document.createElement("canvas");
  cv.width = cols * s; cv.height = rows * s;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#121214";
  ctx.fillRect(0, 0, cv.width, cv.height);
  posts.forEach((p, i) => drawInto(ctx, p, (i % cols) * s + 1, Math.floor(i / cols) * s + 1, s - 2, mode));
  const a = document.createElement("a");
  a.href = cv.toDataURL("image/png");
  a.download = `likehue-${handleShown}.png`;
  a.click();
});

if (window.attachHandleTypeahead) window.attachHandleTypeahead($("handle"));
const q = new URLSearchParams(location.search).get("handle");
if (q) { $("handle").value = q; go(); }
