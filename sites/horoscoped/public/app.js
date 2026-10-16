import { guessSign } from "./lib/guess.js";

const API = "https://public.api.bsky.app/xrpc/";
const TOP_N = 50; // the product ask: a person's 50 most-liked posts
const $ = (id) => document.getElementById(id);

async function xrpc(method, params) {
  const res = await fetch(API + method + "?" + new URLSearchParams(params));
  if (!res.ok) throw new Error(method + " " + res.status);
  return res.json();
}

function cleanHandle(raw) {
  let h = (raw || "").trim().replace(/^@/, "");
  const m = h.match(/bsky\.app\/profile\/([^/\s?#]+)/i);
  if (m) h = m[1];
  return h;
}

// like counts only exist on AppView post views (not in the repo), so we page
// the author feed until the cursor runs out to see every post, then rank.
async function allPosts(did, onProgress) {
  const out = [];
  let cursor = "";
  for (;;) {
    const d = await xrpc("app.bsky.feed.getAuthorFeed", cursor ? { actor: did, limit: "100", filter: "posts_with_replies", cursor } : { actor: did, limit: "100", filter: "posts_with_replies" });
    for (const it of d.feed || []) {
      if (it.reason) continue; // reposts
      const p = it.post;
      if (!p || p.author.did !== did) continue;
      const e = p.embed || {};
      const t = (p.record && p.record.embed && p.record.embed.$type) || "";
      out.push({
        uri: p.uri,
        text: (p.record && p.record.text) || "",
        likes: p.likeCount || 0,
        createdAt: p.record && p.record.createdAt,
        hasLink: e.$type === "app.bsky.embed.external#view" || /https?:\/\//.test((p.record && p.record.text) || ""),
        hasMedia: /images|video/.test(t) || /images|video/.test(e.$type || ""),
      });
    }
    onProgress(out.length);
    cursor = d.cursor;
    if (!cursor) break;
  }
  return out;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const postUrl = (uri, handle) => `https://bsky.app/profile/${handle}/post/${uri.split("/").pop()}`;

function highlight(text, hits) {
  let h = esc(text.length > 220 ? text.slice(0, 219) + "…" : text);
  for (const w of hits) h = h.replace(new RegExp("\\b" + w.replace(/[.*+?^${}()|[\]\\']/g, "\\$&") + "\\b", "gi"), (m) => "<mark>" + m + "</mark>");
  return h;
}

function setStatus(msg, err) {
  const s = $("status");
  s.textContent = msg;
  s.className = "status" + (err ? " err" : "");
}

async function run(raw) {
  const handle = cleanHandle(raw);
  if (!handle) return setStatus("type a handle first", true);
  $("go").disabled = true;
  $("card").hidden = true;
  setStatus("resolving @" + handle + "…");
  try {
    const profile = await xrpc("app.bsky.actor.getProfile", { actor: handle });
    const posts = await allPosts(profile.did, (n) => setStatus(`read ${n} posts so far…`));
    if (!posts.length) throw new Error("no public posts found");
    const top = posts.sort((a, b) => b.likes - a.likes).slice(0, TOP_N);
    const r = guessSign(top, profile.did);
    render(profile, r, top, posts.length);
    history.replaceState(null, "", "?h=" + encodeURIComponent(profile.handle));
    setStatus("");
  } catch (e) {
    setStatus("couldn't read that account: " + e.message, true);
  } finally {
    $("go").disabled = false;
  }
}

function render(profile, r, top, total) {
  const s = r.sign;
  $("who").textContent = `@${profile.handle} · top ${top.length} of ${total} posts`;
  $("sym").textContent = s.sym;
  $("signName").textContent = s.name;
  $("signMeta").textContent = `${s.el} sign · ${s.dates} · confidence: ${r.confidence}`;
  $("line").textContent = "“" + s.line + ".”";
  $("bars").innerHTML = r.share.slice(0, 5).map((x) =>
    `<div class="bar"><span>${x.sign.sym} ${x.sign.name}</span><span class="track"><i style="width:${x.pct}%"></i></span><span>${x.pct}%</span></div>`).join("");
  $("evidence").innerHTML = r.evidence.length
    ? r.evidence.map((e) => `<div class="ev">${highlight(e.post.text, e.hits)}<small>♥ ${e.post.likes} · <a href="${postUrl(e.post.uri, profile.handle)}" target="_blank" rel="noopener" style="color:inherit">view</a></small></div>`).join("")
    : `<div class="ev">no keyword hits; this one came purely from vibes (punctuation, length, hour of day).</div>`;
  const t = top[0];
  $("top").innerHTML = `<div class="ev">${esc(t.text.slice(0, 280))}<small>♥ ${t.likes} · <a href="${postUrl(t.uri, profile.handle)}" target="_blank" rel="noopener" style="color:inherit">view</a></small></div>`;
  const link = location.origin + "/?h=" + encodeURIComponent(profile.handle);
  const text = `my 50 most-liked posts say I'm a ${s.name} ${s.sym}\n${link}`;
  $("shareBluesky").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
  $("copyLink").onclick = () => { navigator.clipboard && navigator.clipboard.writeText(link); $("copyLink").textContent = "copied"; };
  $("copyLink").textContent = "copy link";
  $("card").hidden = false;
}

$("form").addEventListener("submit", (e) => { e.preventDefault(); run($("handleInput").value); });
const q = new URLSearchParams(location.search).get("h");
if (q) { $("handleInput").value = q; run(q); }
