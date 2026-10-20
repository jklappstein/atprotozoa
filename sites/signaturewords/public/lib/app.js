import { fetchRepoRecordsWithKeys } from "./car.js";
import { resolvePds } from "./identity.js";
import { signatureWords } from "./words.js";

const $ = (id) => document.getElementById(id);
let words = [];
let handleShown = "";

function normHandle(s) {
  return String(s || "").trim().replace(/^@+/, "").toLowerCase();
}

async function resolveDid(h) {
  if (h.startsWith("did:")) return h;
  const r = await fetch("https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=" + encodeURIComponent(h));
  if (!r.ok) throw new Error(`couldn't find "${h}"`);
  return (await r.json()).did;
}

function render() {
  const bare = $("bare").checked;
  const list = $("list");
  list.innerHTML = "";
  words.forEach((w, i) => {
    const li = document.createElement("li");
    li.textContent = w.word;
    if (!bare) {
      const sm = document.createElement("small");
      sm.textContent = ` ×${w.count}`;
      li.appendChild(sm);
    }
    list.appendChild(li);
  });
  $("shareLink").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(shareText());
}

function shareText() {
  const who = $("bare").checked ? "whose signature words are these?" : `my ${words.length} signature words`;
  return `${who}\n\n${words.map((w) => w.word).join(", ")}\n\nhttps://signaturewords.bisks.net/`;
}

async function go(e) {
  e.preventDefault();
  const h = normHandle($("handle").value);
  const msg = $("msg");
  msg.textContent = "";
  if (!h) { msg.textContent = "type a handle first"; return; }
  $("goBtn").disabled = true;
  $("result").hidden = true;
  try {
    msg.textContent = "resolving…";
    const did = await resolveDid(h);
    const pds = await resolvePds(did);
    if (!pds) throw new Error("no PDS found for that account");
    const { records } = await fetchRepoRecordsWithKeys(pds, did, "app.bsky.feed.post", (m) => { msg.textContent = m; });
    const texts = records.map((r) => r.value.text).filter(Boolean);
    words = signatureWords(texts, 50);
    if (!words.length) throw new Error(`not enough posts to find a pattern (${texts.length} read)`);
    handleShown = h;
    $("summary").textContent = `${words.length} words from ${texts.length.toLocaleString()} posts by @${handleShown}`;
    msg.textContent = "";
    $("result").hidden = false;
    render();
  } catch (err) {
    msg.textContent = "couldn't do that: " + (err && err.message ? err.message : err);
  } finally {
    $("goBtn").disabled = false;
  }
}

$("goForm").addEventListener("submit", go);
$("bare").addEventListener("change", render);
$("copyBtn").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(shareText()); $("copyBtn").textContent = "copied"; }
  catch { $("copyBtn").textContent = "copy failed"; }
  setTimeout(() => { $("copyBtn").textContent = "copy"; }, 1500);
});
if (window.attachHandleTypeahead) window.attachHandleTypeahead($("handle"));
