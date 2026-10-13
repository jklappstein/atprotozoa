// patches.js — save / list / delete net.bisks.droneloop.patch records in the
// signed-in user's PDS, and read anyone's public patches by handle.

import { dpopFetch } from "./oauth.js";

export const COLLECTION = "net.bisks.droneloop.patch";
const PUBLIC_API = "https://public.api.bsky.app";
const PLC = "https://plc.directory";

// record -> the shape the app uses (parsed patch object, loop length in seconds)
function unpack(rec) {
  let patch = rec.patch;
  if (typeof patch === "string") {
    try { patch = JSON.parse(patch); } catch { patch = null; }
  }
  const laps = rec.laps && rec.laps.loopMs ? { loopSeconds: rec.laps.loopMs / 1000, layers: rec.laps.layers } : null;
  return { ...rec, patch, laps };
}

export async function resolveActor(actor) {
  actor = actor.trim().replace(/^@/, "");
  let did = actor;
  if (!did.startsWith("did:")) {
    const r = await fetch(`${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor)}`);
    if (!r.ok) throw new Error(`couldn't find @${actor}`);
    did = (await r.json()).did;
  }
  let doc;
  if (did.startsWith("did:web:")) {
    const r = await fetch(`https://${did.slice(8).replace(/:/g, "/")}/.well-known/did.json`);
    if (!r.ok) throw new Error("couldn't read that identity");
    doc = await r.json();
  } else {
    const r = await fetch(`${PLC}/${did}`);
    if (!r.ok) throw new Error("couldn't read that identity");
    doc = await r.json();
  }
  const svc = (doc.service || []).find((s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer");
  if (!svc) throw new Error("that account has no PDS listed");
  const aka = (doc.alsoKnownAs || []).find((a) => a.startsWith("at://"));
  return { did, pds: svc.serviceEndpoint.replace(/\/$/, ""), handle: aka ? aka.slice(5) : did };
}

// Every patch in the repo, paged until the cursor runs out.
export async function listPatches(pds, did) {
  const out = [];
  let cursor = "";
  do {
    const u = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
    u.searchParams.set("repo", did);
    u.searchParams.set("collection", COLLECTION);
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);
    const r = await fetch(u);
    if (!r.ok) throw new Error(`listRecords ${r.status}`);
    const d = await r.json();
    for (const rec of d.records || []) {
      out.push(unpack({ uri: rec.uri, rkey: rec.uri.split("/").pop(), ...rec.value }));
    }
    cursor = d.cursor || "";
  } while (cursor);
  out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return out;
}

export async function getPatch(pds, did, rkey) {
  const u = new URL(`${pds}/xrpc/com.atproto.repo.getRecord`);
  u.searchParams.set("repo", did);
  u.searchParams.set("collection", COLLECTION);
  u.searchParams.set("rkey", rkey);
  const r = await fetch(u);
  if (!r.ok) throw new Error("that patch isn't there (deleted?)");
  const d = await r.json();
  return unpack({ uri: d.uri, rkey, ...d.value });
}

export async function savePatch(session, name, patch, laps) {
  const record = {
    $type: COLLECTION,
    name: name.trim().slice(0, 60) || "untitled drone",
    // atproto records can't hold floats, and a patch is full of them — so the
    // patch travels as JSON text, and lap times as whole milliseconds.
    patch: JSON.stringify(patch),
    createdAt: new Date().toISOString(),
  };
  if (laps) record.laps = { loopMs: Math.round(laps.loopSeconds * 1000), layers: laps.layers };
  const res = await dpopFetch(session, `${session.pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: session.did, collection: COLLECTION, record }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = await res.json();
  return unpack({ uri: d.uri, rkey: d.uri.split("/").pop(), ...record });
}

export async function deletePatch(session, rkey) {
  const res = await dpopFetch(session, `${session.pdsUrl.replace(/\/$/, "")}/xrpc/com.atproto.repo.deleteRecord`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repo: session.did, collection: COLLECTION, rkey }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 200)}`);
}
