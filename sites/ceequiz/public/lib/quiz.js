// quiz.js — "WHO POSTED IT?!" Downloads both accounts' whole repos once
// (com.atproto.sync.getRepo, via lib/car.js), pools every standalone text
// post, and quizzes you on ten of them. If a repo download fails (non-CORS
// PDS, oversized CAR) it falls back to paging getAuthorFeed until the cursor
// comes back empty.
import { fetchRepoRecordsWithKeys } from "./car.js";
import { resolvePds } from "./identity.js";
import * as music from "./music.js";

const PUB = "https://public.api.bsky.app/xrpc";
const ACCOUNTS = ["cee.wtf", "wagrace.mir.cee.wtf"];
const ROUNDS = 10;
const CAMEO_ROUND = 5;
const $ = (id) => document.getElementById(id);

const CAMEOS = [
  { face: "🕊️", who: "SPECIAL GUEST: Gerald the Pigeon", line: "\"coo. (this one's a tough one, folks.)\"" },
];

let pools = null; // [[posts of A], [posts of B]]
let round, score, current, answered;

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

// Standalone text-only posts: skip replies, link posts and tiny fragments,
// so a post can't be settled by a thread or URL rather than by voice.
function usable(rec) {
  const t = (rec.text || "").trim();
  return t.length >= 12 && !rec.reply && !/https?:\/\//i.test(t) && !/cee\.wtf|wagrace/i.test(t);
}

async function loadAccount(handle, say) {
  const prof = await jget(`${PUB}/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`);
  const did = prof.did;
  let items;
  try {
    const pds = await resolvePds(did);
    if (!pds) throw new Error("no pds");
    const { records } = await fetchRepoRecordsWithKeys(pds, did, "app.bsky.feed.post", (m) => say(`${handle}: ${m}`));
    items = records.map((r) => ({ uri: r.uri, text: r.value.text, reply: r.value.reply }));
  } catch (e) {
    say(`${handle}: repo download failed (${e.message}), paging the feed...`);
    items = [];
    let cursor = "";
    do { // page to exhaustion: the cursor comes back empty at the account's first post
      const d = await jget(`${PUB}/app.bsky.feed.getAuthorFeed?actor=${did}&filter=posts_no_replies&limit=100${cursor ? "&cursor=" + cursor : ""}`);
      for (const f of d.feed) if (f.post.author.did === did) items.push({ uri: f.post.uri, text: f.post.record.text, reply: f.post.record.reply });
      cursor = d.cursor;
      say(`${handle}: ${items.length} posts...`);
    } while (cursor);
  }
  const seen = new Set();
  return items.filter((i) => usable(i) && !seen.has(i.text.trim()) && seen.add(i.text.trim()));
}

function show(id) {
  for (const s of ["intro", "play", "end"]) $(s).hidden = s !== id;
}

function nextQuestion() {
  round++;
  answered = false;
  $("round").textContent = `ROUND ${round}/${ROUNDS}`;
  $("reveal").hidden = true;
  // coin-flip the account each round (falling back if one pool ran dry)
  let side = Math.random() < 0.5 ? 0 : 1;
  if (!pools[side].length) side = 1 - side;
  const i = Math.floor(Math.random() * pools[side].length);
  const [post] = pools[side].splice(i, 1);
  current = { side, post };
  $("post").textContent = post.text.trim();
  for (const b of [$("buzzA"), $("buzzB")]) { b.disabled = false; b.classList.remove("picked"); }
  const cam = $("cameo");
  if (round === CAMEO_ROUND) {
    const c = CAMEOS[Math.floor(Math.random() * CAMEOS.length)];
    cam.innerHTML = `<span class="face"></span><div><b></b><br><span></span></div>`;
    cam.querySelector(".face").textContent = c.face;
    cam.querySelector("b").textContent = c.who;
    cam.querySelector("div span").textContent = c.line;
    cam.hidden = false;
    music.sting("cameo");
  } else cam.hidden = true;
}

function confetti() {
  const colors = ["#ffd23f", "#ff3d8b", "#27e1ff", "#7dff7d"];
  for (let i = 0; i < 40; i++) {
    const c = document.createElement("div");
    c.className = "confetti";
    c.style.left = Math.random() * 100 + "vw";
    c.style.background = colors[i % 4];
    c.style.animationDelay = Math.random() * 0.5 + "s";
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 3000);
  }
}

function buzz(side) {
  if (answered) return;
  answered = true;
  music.sting("buzz");
  const ok = side === current.side;
  $(side === 0 ? "buzzA" : "buzzB").classList.add("picked");
  $("buzzA").disabled = $("buzzB").disabled = true;
  if (ok) score += 100;
  setTimeout(() => music.sting(ok ? "right" : "wrong"), 200);
  if (ok) confetti();
  $("score").textContent = `${score} PTS`;
  const rv = $("reveal");
  rv.className = "reveal " + (ok ? "right" : "wrong");
  $("verdict").textContent = `${ok ? "CORRECT! +100" : "BZZT! WRONG."} It was @${ACCOUNTS[current.side]}.`;
  const m = current.post.uri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/(.+)$/);
  $("postlink").href = m ? `https://bsky.app/profile/${m[1]}/post/${m[2]}` : "#";
  $("next").textContent = round >= ROUNDS ? "FINAL SCORE" : "NEXT";
  rv.hidden = false;
}

function finish() {
  music.stopTheme();
  const n = score / 100;
  const title = n >= 9 ? "YOU'RE BASICALLY CEE" : n >= 7 ? "SUPERFAN!" : n >= 5 ? "RESPECTABLE COIN-FLIPPING" : "THE POSTS ARE COMING FROM INSIDE THE HOUSE";
  $("endtitle").textContent = `${score} POINTS — ${title}`;
  $("endline").textContent = `${n}/${ROUNDS} posts correctly attributed.`;
  const text = `I scored ${n}/${ROUNDS} on WHO POSTED IT?! — guessing @cee.wtf or @wagrace.mir.cee.wtf. https://ceequiz.bisks.net/`;
  $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
  show("end");
  music.sting("right");
  if (n >= 7) confetti();
}

async function start() {
  music.init();
  music.setMuted($("mute").checked);
  $("start").disabled = true;
  const say = (m) => ($("loadmsg").textContent = m);
  try {
    if (!pools) pools = await Promise.all(ACCOUNTS.map((h) => loadAccount(h, say)));
    pools = pools.map((p) => p.slice());
    if (pools[0].length + pools[1].length < ROUNDS) throw new Error("not enough posts to build a round");
    if (!pools[0].length || !pools[1].length) throw new Error("one contestant has no usable posts");
  } catch (e) {
    say("The set is on fire: " + e.message);
    $("start").disabled = false;
    return;
  }
  round = 0; score = 0;
  $("score").textContent = "0 PTS";
  show("play");
  music.startTheme();
  nextQuestion();
}

$("start").addEventListener("click", start);
$("again").addEventListener("click", () => { show("intro"); $("start").disabled = false; $("loadmsg").textContent = ""; });
$("buzzA").addEventListener("click", () => buzz(0));
$("buzzB").addEventListener("click", () => buzz(1));
$("next").addEventListener("click", () => (round >= ROUNDS ? finish() : nextQuestion()));
$("mute").addEventListener("change", (e) => music.setMuted(e.target.checked));
