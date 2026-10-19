// firstsight.js — for one account, download its whole repo (lib/car.js) and
// find, per author, (a) the earliest post of theirs this account engaged with
// (a like, repost, reply or quote — a repo only records posts you acted on, so
// "saw" means "first acted on") and (b) the earliest post of theirs it liked.
// Post text/handles are hydrated lazily for the rows on screen from the public
// AppView (getPosts / getProfiles, 25 per request).

import { fetchRepoRecordsWithKeys } from "./car.js";
import { resolvePds } from "./identity.js";

const APPVIEW = "https://public.api.bsky.app/xrpc/";

export function cleanHandle(s) {
  return String(s || "").trim().replace(/^@+/, "").trim().toLowerCase();
}

export async function resolveDid(input) {
  const h = cleanHandle(input);
  if (h.startsWith("did:")) return { did: h, handle: h };
  const res = await fetch(APPVIEW + "com.atproto.identity.resolveHandle?handle=" + encodeURIComponent(h));
  if (!res.ok) throw new Error(`couldn't resolve "${h}"`);
  return { did: (await res.json()).did, handle: h };
}

// at://did/app.bsky.feed.post/rkey -> {did, rkey} or null
export function parsePostUri(uri) {
  if (typeof uri !== "string") return null;
  const m = /^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(uri);
  return m ? { did: m[1], rkey: m[2] } : null;
}

// Post URIs a record shows its author engaged with, and how.
export function engagements(rec) {
  const out = [];
  const t = rec.$type;
  if (t === "app.bsky.feed.like") out.push(["liked", rec.subject && rec.subject.uri]);
  else if (t === "app.bsky.feed.repost") out.push(["reposted", rec.subject && rec.subject.uri]);
  else if (t === "app.bsky.feed.post") {
    if (rec.reply) {
      out.push(["replied to", rec.reply.parent && rec.reply.parent.uri]);
      const root = rec.reply.root && rec.reply.root.uri;
      if (root && root !== (rec.reply.parent && rec.reply.parent.uri)) out.push(["replied to", root]);
    }
    const e = rec.embed;
    if (e) {
      if (e.record && e.record.uri) out.push(["quoted", e.record.uri]);
      else if (e.record && e.record.record && e.record.record.uri) out.push(["quoted", e.record.record.uri]);
    }
  }
  return out;
}

function validTime(s) {
  const t = Date.parse(s);
  return Number.isFinite(t) && t > Date.parse("2022-11-01") && t < Date.now() + 864e5 ? t : null;
}

// records: [{uri, value}] -> Map<authorDid, {sight, liked, count}>
export function foldSightings(selfDid, records) {
  const by = new Map();
  for (const { value: rec } of records) {
    const t = validTime(rec.createdAt);
    if (t == null) continue;
    for (const [kind, uri] of engagements(rec)) {
      const p = parsePostUri(uri);
      if (!p || p.did === selfDid) continue;
      let a = by.get(p.did);
      if (!a) by.set(p.did, (a = { did: p.did, sight: null, liked: null, count: 0 }));
      a.count++;
      if (!a.sight || t < a.sight.t) a.sight = { t, kind, uri };
      if (kind === "liked" && (!a.liked || t < a.liked.t)) a.liked = { t, uri };
    }
  }
  return by;
}

export async function loadSightings(input, onProgress) {
  const { did, handle } = await resolveDid(input);
  const pds = await resolvePds(did);
  if (!pds) throw new Error("couldn't find that account's PDS");
  const recs = await fetchRepoRecordsWithKeys(
    pds, did,
    ["app.bsky.feed.like", "app.bsky.feed.repost", "app.bsky.feed.post"],
    onProgress,
  );
  return { did, handle, total: recs.length, authors: [...foldSightings(did, recs).values()] };
}

const postCache = new Map(); // uri -> {text, ...} | null (gone)
const profCache = new Map(); // did -> profile | null

async function batch(items, path, param, size, onEach) {
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    try {
      const q = chunk.map((x) => param + "=" + encodeURIComponent(x)).join("&");
      const res = await fetch(APPVIEW + path + "?" + q);
      if (res.ok) onEach(await res.json(), chunk);
    } catch (_) { /* leave uncached; row shows a placeholder */ }
  }
}

export async function hydratePosts(uris) {
  const need = [...new Set(uris)].filter((u) => !postCache.has(u));
  await batch(need, "app.bsky.feed.getPosts", "uris", 25, (j, chunk) => {
    const got = new Set();
    for (const p of j.posts || []) { postCache.set(p.uri, p); got.add(p.uri); }
    for (const u of chunk) if (!got.has(u)) postCache.set(u, null);
  });
  return postCache;
}

export async function hydrateProfiles(dids) {
  const need = [...new Set(dids)].filter((d) => !profCache.has(d));
  await batch(need, "app.bsky.actor.getProfiles", "actors", 25, (j, chunk) => {
    const got = new Set();
    for (const p of j.profiles || []) { profCache.set(p.did, p); got.add(p.did); }
    for (const d of chunk) if (!got.has(d)) profCache.set(d, null);
  });
  return profCache;
}

export const getPost = (u) => postCache.get(u);
export const getProfile = (d) => profCache.get(d);

export function postUrl(uri) {
  const p = parsePostUri(uri);
  return p ? `https://bsky.app/profile/${p.did}/post/${p.rkey}` : "#";
}
