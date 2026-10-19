// tagcoins — free posts and replies, paid @mentions. Each mention costs a coin
// from a local wallet (lib/coins.js); mentions become real facets, so they
// really notify. Create-only OAuth on app.bsky.feed.post.

import { login, completeLoginIfCallback, getSession, clearSession, resolveHandle, dpopFetch } from "./lib/oauth.js";
import { findMentions, tagCost, loadWallet, saveWallet, spend, settle, msToNextCoin, MAX_COINS } from "./lib/coins.js";

const $ = (id) => document.getElementById(id);
const APPVIEW = "https://public.api.bsky.app";
let session = null;
let wallet = loadWallet();

const cleanHandle = (s) => (s || "").trim().replace(/^@/, "");

function setStatus(msg, cls = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = "status " + cls;
}

function renderAuth() {
  const on = !!session;
  $("signinRow").hidden = on;
  $("panel").hidden = !on;
  $("who").textContent = on ? `signed in as ${session.handle || session.did}` : "not signed in.";
}

function renderWallet() {
  wallet = settle(wallet);
  saveWallet(wallet);
  $("coins").textContent = wallet.coins;
  $("maxCoins").textContent = MAX_COINS;
  const ms = msToNextCoin(wallet);
  $("refill").textContent = ms ? `· next coin in ${Math.ceil(ms / 60000)} min` : "· purse full";
  renderDraft();
}

function renderDraft() {
  const text = $("text").value;
  const cost = tagCost(text);
  $("len").textContent = [...text].length;
  $("cost").textContent = cost;
  $("cost").parentElement.classList.toggle("err", cost > wallet.coins);
  $("postBtn").disabled = cost > wallet.coins || ![...text.trim()].length;
}

// bsky.app/profile/<handle|did>/post/<rkey> or an at:// URI -> { uri, cid, root }
async function resolveReply(input) {
  let uri = input.trim();
  const m = uri.match(/profile\/([^/\s]+)\/post\/([a-z0-9]+)/i);
  if (m) {
    const did = m[1].startsWith("did:") ? m[1] : await resolveHandle(m[1]);
    if (!did) throw new Error(`couldn't resolve @${m[1]}`);
    uri = `at://${did}/app.bsky.feed.post/${m[2]}`;
  }
  if (!uri.startsWith("at://")) throw new Error("reply target should be a bsky.app post link");
  const res = await fetch(`${APPVIEW}/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(uri)}`);
  const post = (await res.json()).posts?.[0];
  if (!post) throw new Error("couldn't find that post to reply to");
  const parent = { uri: post.uri, cid: post.cid };
  return { parent, root: post.record?.reply?.root || parent };
}

async function post() {
  const text = $("text").value.trim();
  const mentions = findMentions(text);
  if (mentions.length > wallet.coins) return setStatus("not enough tag coins", "err");
  $("postBtn").disabled = true;
  try {
    setStatus("resolving tags…");
    const dids = new Map();
    for (const h of new Set(mentions.map((x) => x.handle))) {
      const did = await resolveHandle(h);
      if (!did) throw new Error(`@${h} doesn't exist, so nothing was posted or charged`);
      dids.set(h, did);
    }
    const record = {
      $type: "app.bsky.feed.post",
      text,
      createdAt: new Date().toISOString(),
      langs: ["en"],
    };
    if (mentions.length) {
      record.facets = mentions.map((x) => ({
        index: { byteStart: x.start, byteEnd: x.end },
        features: [{ $type: "app.bsky.richtext.facet#mention", did: dids.get(x.handle) }],
      }));
    }
    const replyTo = $("replyTo").value.trim();
    if (replyTo) {
      setStatus("finding the post…");
      record.reply = await resolveReply(replyTo);
    }
    setStatus("posting…");
    const res = await dpopFetch(session, `${session.pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo: session.did, collection: "app.bsky.feed.post", record }),
    });
    if (!res.ok) throw new Error(`post failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    const rkey = (await res.json()).uri.split("/").pop();
    wallet = spend(wallet, mentions.length) || wallet; // charge only once it's out
    $("text").value = "";
    renderWallet();
    const link = document.createElement("a");
    link.href = `https://bsky.app/profile/${session.did}/post/${rkey}`;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "view it";
    setStatus(mentions.length ? `posted! spent ${mentions.length} 🪙 · ` : "posted for free! · ");
    $("status").append(link);
  } catch (e) {
    setStatus(e.message || String(e), "err");
  } finally {
    renderDraft();
  }
}

$("text").addEventListener("input", renderDraft);
$("postBtn").addEventListener("click", post);
$("signoutBtn").addEventListener("click", async () => {
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

setInterval(renderWallet, 30000);
(async () => {
  try {
    session = (await completeLoginIfCallback()) || (await getSession());
  } catch (e) {
    $("who").textContent = e.message || String(e);
  }
  renderAuth();
  renderWallet();
})();
