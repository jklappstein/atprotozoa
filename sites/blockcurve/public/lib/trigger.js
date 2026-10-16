// trigger.js — guess which post set off a spike of direct blocks.
//
// Blocks are public records, so we know *when* a burst landed (the block
// rkey is a TID, see tid.js) but not why. The best public signal is: what
// did the blocked account post in the days before the burst, and which of
// those posts drew the most quotes/replies/reposts/likes (Constellation
// backlink counts). That's a guess, not proof — the trigger can just as
// easily be somebody else's post about the account — and the UI says so.

import { tidToMs } from "./tid.js";

const BASE = "https://constellation.microcosm.blue";
const DAY = 86400000;
const TID_CHARSET = "234567abcdefghijklmnopqrstuvwxyz";

// How many spikes we explain. A display decision: the page shows each one as
// a card with a post under it, and a fifth-best day is already noise.
const MAX_SPIKES = 5;
// A day only counts as a spike if it has at least this many blocks and is at
// least SPIKE_RATIO x the account's average active-day block count.
const MIN_SPIKE_BLOCKS = 5;
const SPIKE_RATIO = 3;
// Posts from this long before the spike's day are candidates: pile-ons lag
// the post by hours to a day or two.
const LOOKBACK_MS = 2 * DAY;
// Parallel Constellation count requests — a browser-friendliness limit.
const COUNT_CONCURRENCY = 8;

// Encode a millisecond timestamp as a TID-shaped cursor (clock id 0).
export function msToTid(ms) {
  let n = (BigInt(Math.floor(ms)) * 1000n) << 10n;
  let out = "";
  for (let i = 0; i < 13; i++) {
    out = TID_CHARSET[Number(n & 31n)] + out;
    n >>= 5n;
  }
  return out;
}

// Biggest single UTC days of direct blocks, largest first, no two adjacent
// (a burst straddling midnight is one spike, credited to its bigger day).
export function findSpikes(sortedTs) {
  if (!sortedTs.length) return [];
  const bins = new Map();
  for (const t of sortedTs) {
    const d = Math.floor(t / DAY);
    bins.set(d, (bins.get(d) || 0) + 1);
  }
  const mean = sortedTs.length / bins.size;
  const ranked = [...bins.entries()]
    .filter(([, c]) => c >= MIN_SPIKE_BLOCKS && c >= SPIKE_RATIO * mean)
    .sort((a, b) => b[1] - a[1]);
  const picked = [];
  for (const [d, count] of ranked) {
    if (picked.some((p) => Math.abs(p.day - d) <= 1)) continue;
    picked.push({ day: d, count, startMs: d * DAY, endMs: (d + 1) * DAY });
    if (picked.length >= MAX_SPIKES) break;
  }
  return picked;
}

const pdsCache = new Map();
async function pdsFor(did) {
  if (pdsCache.has(did)) return pdsCache.get(did);
  let docUrl;
  if (did.startsWith("did:plc:")) docUrl = `https://plc.directory/${did}`;
  else if (did.startsWith("did:web:")) docUrl = `https://${did.slice(8)}/.well-known/did.json`;
  else throw new Error("unsupported DID method");
  const res = await fetch(docUrl);
  if (!res.ok) throw new Error(`DID doc ${res.status}`);
  const doc = await res.json();
  const svc = (doc.service || []).find((s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer");
  if (!svc) throw new Error("no PDS in DID doc");
  pdsCache.set(did, svc.serviceEndpoint);
  return svc.serviceEndpoint;
}

// Every post the account made in [fromMs, toMs). listRecords' cursor is an
// rkey and pages newest-first from it, so seeding it with a TID for toMs
// jumps straight to the window; we stop once we page past fromMs.
async function postsInWindow(did, fromMs, toMs) {
  const pds = await pdsFor(did);
  const out = [];
  let cursor = msToTid(toMs);
  for (;;) {
    const qs = new URLSearchParams({ repo: did, collection: "app.bsky.feed.post", limit: "100", cursor });
    const res = await fetch(`${pds}/xrpc/com.atproto.repo.listRecords?${qs}`);
    if (!res.ok) throw new Error(`listRecords ${res.status}`);
    const body = await res.json();
    const recs = body.records || [];
    let reachedStart = false;
    for (const r of recs) {
      const rkey = r.uri.split("/").pop();
      const ts = tidToMs(rkey);
      if (ts == null) continue;
      if (ts < fromMs) { reachedStart = true; continue; }
      if (ts >= toMs) continue;
      out.push({ uri: r.uri, rkey, ts, text: r.value?.text || "", reply: r.value?.reply || null });
    }
    if (reachedStart || !body.cursor || recs.length === 0) break;
    cursor = body.cursor;
  }
  return out;
}

async function count(target, collection, path) {
  try {
    const qs = new URLSearchParams({ target, collection, path });
    const res = await fetch(`${BASE}/links/count?${qs}`);
    if (!res.ok) return 0;
    return (await res.json()).total || 0;
  } catch (_) {
    return 0;
  }
}

async function scorePost(p) {
  const [quotes, quotes2, replies, reposts, likes] = await Promise.all([
    count(p.uri, "app.bsky.feed.post", ".embed.record.uri"),
    count(p.uri, "app.bsky.feed.post", ".embed.record.record.uri"), // quote + media embeds
    count(p.uri, "app.bsky.feed.post", ".reply.parent.uri"),
    count(p.uri, "app.bsky.feed.repost", ".subject.uri"),
    count(p.uri, "app.bsky.feed.like", ".subject.uri"),
  ]);
  p.quotes = quotes + quotes2;
  p.replies = replies;
  p.reposts = reposts;
  p.likes = likes;
  // Quotes are weighted highest: a quote-post is how a pile-on usually starts.
  p.score = p.quotes * 5 + p.replies * 2 + p.reposts * 2 + p.likes * 0.2;
}

// Fill in `spike.top` (best candidate post or null) and `spike.postCount`.
export async function explainSpike(did, spike) {
  const posts = await postsInWindow(did, spike.startMs - LOOKBACK_MS, spike.endMs);
  spike.postCount = posts.length;
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(COUNT_CONCURRENCY, posts.length) }, async () => {
      while (idx < posts.length) await scorePost(posts[idx++]);
    }),
  );
  posts.sort((a, b) => b.score - a.score);
  spike.top = posts.length && posts[0].score > 0 ? posts[0] : null;
  spike.runnersUp = posts.slice(1, 3).filter((p) => p.score > 0);
}

export function postUrl(did, p) {
  return `https://bsky.app/profile/${did}/post/${p.rkey}`;
}
export function threadUrl(did, p) {
  const root = p.reply?.root?.uri;
  const m = root && root.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
  return m ? `https://bsky.app/profile/${m[1]}/post/${m[2]}` : null;
}
