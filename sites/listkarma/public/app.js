// app.js — listkarma: handle -> every listitem record pointing at that DID
// (Constellation) -> which list each one is on (slingshot getRecord, then the
// AppView's getList for name/purpose/curator) -> rows grouped by curator.
// Signed in, the user picks one of their own lists and adds chosen curators to
// it with com.atproto.repo.createRecord (create-only listitem scope).

import { resolveDid, jget, getProfilesBatch, pooledEach } from "./lib/identity.js";
import { backlinkRecords, SOURCES, atUri } from "./lib/microcosm.js";
import { login, getSession, clearSession, completeLoginIfCallback, dpopFetch } from "./lib/oauth.js";

const APPVIEW = "https://public.api.bsky.app/xrpc";
const SLINGSHOT = "https://slingshot.microcosm.blue/xrpc";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (id) => document.getElementById(id);
const els = {
  authBar: $("authBar"), form: $("form"), who: $("who"), go: $("go"), status: $("status"),
  toolbar: $("toolbar"), target: $("target"), count: $("count"), selAll: $("selAll"), selNone: $("selNone"),
  addChecked: $("addChecked"), rows: $("rows"),
};

let session = null;
let curators = []; // [{did, handle, displayName, avatar, lists:[{uri,name,purpose,description}]}]
let myLists = []; // [{uri,name,purpose}]
const done = new Set(); // curator dids already added this session
let busy = false;

function setStatus(t, err) {
  els.status.className = err ? "status err" : "status";
  els.status.textContent = t || "";
}

// --- auth ---------------------------------------------------------------------

function renderAuthBar() {
  if (session) {
    els.authBar.innerHTML = `signed in as <b>@${esc(session.handle)}</b> · <a class="linklike" id="signOut">sign out</a>`;
    $("signOut").onclick = async () => {
      await clearSession();
      session = null;
      myLists = [];
      renderAuthBar();
      renderToolbar();
      renderRows();
    };
  } else {
    els.authBar.innerHTML = `sign in to add anyone to your lists —
      <input type="text" id="signinHandle" placeholder="you.bsky.social" autocomplete="username" />
      <button class="btn ghost" id="signInBtn" type="button">sign in with bluesky</button>`;
    const input = $("signinHandle");
    if (window.attachHandleTypeahead) window.attachHandleTypeahead(input);
    const go = async () => {
      const h = input.value.trim().replace(/^@/, "");
      if (!h) return;
      setStatus("redirecting to your PDS…");
      try { await login(h); } catch (e) { setStatus(e.message || String(e), true); }
    };
    $("signInBtn").onclick = go;
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  }
}

$("ceeHook").addEventListener("click", () => {
  const input = $("signinHandle") || els.who;
  input.value = "@cee.wtf";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.focus();
});

// Every list the signed-in user owns, paged to exhaustion (getLists has no bulk equivalent).
async function loadMyLists() {
  const out = [];
  let cursor = "";
  for (;;) {
    const d = await jget(`${APPVIEW}/app.bsky.graph.getLists?actor=${encodeURIComponent(session.did)}&limit=100${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`);
    for (const l of d.lists || []) out.push({ uri: l.uri, name: l.name, purpose: l.purpose });
    cursor = d.cursor;
    if (!cursor || !(d.lists || []).length) break;
  }
  return out;
}

// --- rendering ------------------------------------------------------------------

const purposeLabel = (p) => (p || "").includes("modlist") ? "mod list" : (p || "").includes("curatelist") ? "curate list" : (p || "").includes("referencelist") ? "reference list" : "list";

function renderToolbar() {
  if (!curators.length) { els.toolbar.classList.remove("show"); return; }
  els.toolbar.classList.add("show");
  if (!session) {
    els.target.innerHTML = `<option>sign in first</option>`;
    els.target.disabled = true;
  } else if (!myLists.length) {
    els.target.innerHTML = `<option>you own no lists yet — make one on bsky.app</option>`;
    els.target.disabled = true;
  } else {
    const prev = els.target.value;
    els.target.disabled = false;
    els.target.innerHTML = myLists.map((l) => `<option value="${esc(l.uri)}">${esc(l.name)} (${purposeLabel(l.purpose)})</option>`).join("");
    if (prev && myLists.some((l) => l.uri === prev)) els.target.value = prev;
  }
  updateCount();
}

function checkedDids() {
  return Array.from(els.rows.querySelectorAll("input[data-did]:checked")).map((c) => c.dataset.did);
}
function updateCount() {
  const n = checkedDids().length;
  els.count.textContent = `${n} of ${curators.length} checked`;
  els.addChecked.disabled = !session || !myLists.length || n === 0 || busy;
}

function renderRows() {
  els.rows.classList.toggle("show", curators.length > 0);
  els.rows.innerHTML = curators.map((c) => {
    const av = c.avatar ? `<img src="${esc(c.avatar)}" alt="" referrerpolicy="no-referrer" loading="lazy" />` : `<div class="noav"></div>`;
    const lists = c.lists.map((l) => `<div>on <a href="${esc(listUrl(l.uri))}" target="_blank" rel="noopener"><b>${esc(l.name)}</b></a><span class="tagp">${purposeLabel(l.purpose)}</span>${l.description ? `<div class="ldesc">${esc(l.description.slice(0, 200))}</div>` : ""}</div>`).join("");
    const isDone = done.has(c.did);
    return `<div class="row">
      <input type="checkbox" data-did="${esc(c.did)}" ${isDone ? "disabled" : ""} />
      ${av}
      <div class="who">
        <div class="rname">${esc(c.displayName || c.handle || c.did)}</div>
        <div class="rhandle"><a href="https://bsky.app/profile/${esc(c.handle || c.did)}" target="_blank" rel="noopener">${c.handle ? "@" + esc(c.handle) : esc(c.did)}</a></div>
        <div class="lists">${lists}</div>
      </div>
      <div class="act" data-act="${esc(c.did)}">${isDone ? `<span class="ok">added ✓</span>` : `<button class="btn ghost small" data-add="${esc(c.did)}" type="button">add back</button>`}</div>
    </div>`;
  }).join("");
  updateCount();
}

function listUrl(uri) {
  const m = /^at:\/\/([^/]+)\/app\.bsky\.graph\.list\/(.+)$/.exec(uri);
  return m ? `https://bsky.app/profile/${m[1]}/lists/${m[2]}` : "https://bsky.app";
}

els.rows.addEventListener("change", updateCount);
els.rows.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-add]");
  if (b) addMany([b.dataset.add]);
});
els.selAll.onclick = () => { els.rows.querySelectorAll("input[data-did]:not(:disabled)").forEach((c) => (c.checked = true)); updateCount(); };
els.selNone.onclick = () => { els.rows.querySelectorAll("input[data-did]").forEach((c) => (c.checked = false)); updateCount(); };
els.addChecked.onclick = () => addMany(checkedDids());

// --- adding back ------------------------------------------------------------------

async function addMany(dids) {
  if (busy) return;
  if (!session) { setStatus("sign in first (bar above).", true); return; }
  const list = els.target.value;
  if (!list.startsWith("at://")) { setStatus("pick one of your lists first.", true); return; }
  const todo = dids.filter((d) => !done.has(d) && d !== session.did);
  if (!todo.length) return;
  const name = myLists.find((l) => l.uri === list)?.name || list;
  if (!window.confirm(`Add ${todo.length} account${todo.length === 1 ? "" : "s"} to your list “${name}”? This creates real list entries on your Bluesky account.`)) return;
  busy = true;
  updateCount();
  const base = session.pdsUrl.replace(/\/$/, "");
  let ok = 0, fail = 0, lastErr = "";
  for (const did of todo) {
    setStatus(`adding ${ok + fail + 1}/${todo.length}…`);
    try {
      const res = await dpopFetch(session, `${base}/xrpc/com.atproto.repo.createRecord`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repo: session.did,
          collection: "app.bsky.graph.listitem",
          record: { $type: "app.bsky.graph.listitem", subject: did, list, createdAt: new Date().toISOString() },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || `createRecord failed (${res.status})`);
      done.add(did);
      ok++;
    } catch (e) {
      fail++;
      lastErr = e.message || String(e);
    }
  }
  busy = false;
  renderRows();
  setStatus(`added ${ok} to “${name}”${fail ? ` — ${fail} failed (${lastErr})` : ""}.`, fail > 0);
}

// --- lookup -----------------------------------------------------------------------

async function lookup(raw) {
  if (busy) return;
  busy = true;
  els.go.disabled = true;
  curators = [];
  renderRows();
  renderToolbar();
  try {
    setStatus("resolving handle…");
    const did = await resolveDid(raw.trim().replace(/^@/, ""));

    setStatus("asking constellation who listed them…");
    const recs = (await backlinkRecords(did, SOURCES.listedBy, { onStep: (n) => setStatus(`found ${n} list entries…`) }))
      .filter((r) => r.collection === "app.bsky.graph.listitem");
    if (!recs.length) { setStatus("no list entries found for that account."); return; }

    // Which list is each listitem on? Read the records (slingshot caches any PDS).
    const listOf = new Map(); // listitem uri -> list uri
    let n = 0;
    await pooledEach(recs, 8, async (r) => {
      try {
        const d = await jget(`${SLINGSHOT}/com.atproto.repo.getRecord?repo=${encodeURIComponent(r.did)}&collection=app.bsky.graph.listitem&rkey=${encodeURIComponent(r.rkey)}`);
        if (d.value && d.value.list) listOf.set(atUri(r), d.value.list);
      } catch { /* record deleted since the index saw it */ }
      setStatus(`reading list entries ${++n}/${recs.length}…`);
    });

    const listUris = Array.from(new Set(listOf.values()));
    const meta = new Map();
    n = 0;
    await pooledEach(listUris, 8, async (uri) => {
      try {
        const d = await jget(`${APPVIEW}/app.bsky.graph.getList?list=${encodeURIComponent(uri)}&limit=1`);
        if (d.list) meta.set(uri, { uri, name: d.list.name, purpose: d.list.purpose, description: d.list.description || "", creator: d.list.creator.did });
      } catch { /* list deleted or private */ }
      setStatus(`reading lists ${++n}/${listUris.length}…`);
    });

    const byCurator = new Map();
    for (const m of meta.values()) {
      if (m.creator === did) continue; // their own lists
      if (!byCurator.has(m.creator)) byCurator.set(m.creator, []);
      byCurator.get(m.creator).push(m);
    }
    if (!byCurator.size) { setStatus("the lists they're on are gone or are their own."); return; }

    setStatus("fetching profiles…");
    const profiles = await getProfilesBatch(Array.from(byCurator.keys()));
    curators = Array.from(byCurator, ([cdid, lists]) => {
      const p = profiles.get(cdid) || {};
      return { did: cdid, handle: p.handle || null, displayName: p.displayName || "", avatar: p.avatar || "", lists };
    }).sort((a, b) => b.lists.length - a.lists.length || (a.handle || a.did).localeCompare(b.handle || b.did));

    renderToolbar();
    renderRows();
    const nl = curators.reduce((s, c) => s + c.lists.length, 0);
    setStatus(`${curators.length} curator${curators.length === 1 ? "" : "s"} put them on ${nl} list${nl === 1 ? "" : "s"}.`);
  } catch (e) {
    setStatus("couldn't look that up: " + (e.message || e), true);
  } finally {
    busy = false;
    els.go.disabled = false;
    updateCount();
  }
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (els.who.value.trim()) lookup(els.who.value);
});
if (window.attachHandleTypeahead) window.attachHandleTypeahead(els.who);

// --- boot --------------------------------------------------------------------------

async function boot() {
  try {
    session = (await completeLoginIfCallback()) || (await getSession());
  } catch (e) {
    setStatus(e.message || String(e), true);
    session = await getSession();
  }
  renderAuthBar();
  if (session) {
    if (!els.who.value) els.who.value = session.handle;
    try { myLists = await loadMyLists(); } catch (e) { setStatus("couldn't load your lists: " + e.message, true); }
    renderToolbar();
  }
  const q = new URLSearchParams(location.search).get("handle");
  if (q) { els.who.value = q; lookup(q); }
}
boot();
