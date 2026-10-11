// palacematch: all state lives in localStorage; nothing leaves the browser.
const AMBITIONS = ["Regent for a child emperor", "Keeper of the imperial seal", "Master of the secret granaries", "Quietly run everything", "Be the voice behind the screen"];
const METHODS = ["Poison, slow", "Forged edicts", "Well-timed rumors", "Strategic fainting", "Blackmail via ledgers"];
const FACTIONS = ["Inner Court", "The Eastern Depot", "Silk Bureau", "Friends of the Dowager", "Unaffiliated (suspicious)"];

const PROFILES = [
  { n: "Lord Wei the Soft-Footed", t: "Chief Steward of Lamps", e: "🧞", a: 0, m: 0, f: 0, bio: "I know which tea you drank in 1204. Looking for someone who appreciates patience." },
  { n: "Gao Gao", t: "Keeper of the Third Seal", e: "🪭", a: 1, m: 1, f: 1, bio: "Fluent in six calligraphy hands, none of them mine. Swipe if your signature is negotiable." },
  { n: "Honorable Sima", t: "Overseer of Imperial Pickles", e: "🥒", a: 2, m: 2, f: 2, bio: "Ran the granaries into the ground and into my pocket. Looking for a partner in grain." },
  { n: "Little Liu", t: "Assistant Fan-Bearer", e: "🌬️", a: 3, m: 3, f: 3, bio: "Everyone underestimates the fan-bearer. Fainting is a love language." },
  { n: "Duke Peng", t: "Lord of Whispered Corridors", e: "🕯️", a: 4, m: 2, f: 0, bio: "Hosting dinner parties with no survivors' list. Vegetarian friendly. Mostly." },
  { n: "Madame Zhu's Man", t: "Gatekeeper of the Concubine Wing", e: "🔑", a: 3, m: 4, f: 3, bio: "I hold the keys, the ledgers, and your attention. Dowager-approved." },
  { n: "Shen the Unblinking", t: "Palace Archivist", e: "📜", a: 1, m: 4, f: 2, bio: "I have receipts. Literally. Dating profile is a scroll, 40 feet long." },
  { n: "Senior Eunuch Mo", t: "Head of Imperial Bath Operations", e: "🛁", a: 0, m: 2, f: 4, bio: "Best conspiracies happen in the steam. Seeking someone who can hold their breath." },
  { n: "Yan Yan", t: "Imperial Tea Taster (retired, somehow)", e: "🍵", a: 2, m: 0, f: 4, bio: "Survived 14 emperors. Seeking someone who hasn't tried to kill me yet." },
  { n: "Grand Eunuch Lu", t: "Voice Behind the Screen", e: "🎭", a: 4, m: 1, f: 1, bio: "The emperor says what I tell him. Looking for a co-ruler, not a romantic partner. Okay, both." },
];

const LETTERS = [
  "Meet at the third bridge after the hour of the rat. Bring ink.",
  "I've already forged your reference letter. You're welcome.",
  "The dowager has retired early. Come to the east pavilion; wear soft shoes.",
  "I took the liberty of poisoning your rival. Consider it a first-date gift.",
  "Your handwriting is forged, in a flattering way. Let's be in cahoots.",
  "A rumor has been started that we are already married. Let's not disappoint them.",
];

const $ = (id) => document.getElementById(id);
const KEY = "palacematch-v1";
let state = JSON.parse(localStorage.getItem(KEY) || "null");

for (const [id, arr] of [["ambition", AMBITIONS], ["method", METHODS], ["faction", FACTIONS]]) {
  arr.forEach((v, i) => $(id).add(new Option(v, i)));
}

function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

// Compatibility: a shared faction is worth a lot, a shared method some,
// a shared ambition is a rivalry (lower), plus a stable per-pair "chemistry" term.
function score(me, p, idx) {
  let s = 35;
  if (me.faction === p.f) s += 25;
  if (me.method === p.m) s += 20;
  if (me.ambition !== p.a) s += 10; // different thrones to covet
  else s -= 5;
  let h = 0;
  for (const ch of me.name + p.n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  s += h % 15;
  return Math.max(3, Math.min(99, s));
}

function render() {
  if (!state) {
    $("setup").hidden = false; $("browse").hidden = true; $("matches").hidden = true;
    return;
  }
  $("setup").hidden = true;
  const done = state.i >= PROFILES.length;
  $("browse").hidden = done;
  $("matches").hidden = !done;
  if (!done) renderCard(); else renderMatches();
}

function renderCard() {
  const p = PROFILES[state.i];
  const pct = score(state, p, state.i);
  const card = $("card");
  card.textContent = "";
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  card.append(mk("div", "avatar", p.e), mk("h3", "", p.n), mk("div", "title", p.t), mk("p", "", p.bio));
  const tags = mk("div");
  for (const t of ["Wants: " + AMBITIONS[p.a], "Method: " + METHODS[p.m], FACTIONS[p.f]]) tags.append(mk("span", "tag", t));
  card.append(tags, mk("div", "", `Compatibility with ${state.name}: ${pct}%`));
  const meter = mk("div", "meter"); const bar = mk("i"); bar.style.width = pct + "%"; meter.append(bar);
  card.append(meter);
  $("progress").textContent = `Courtier ${state.i + 1} of ${PROFILES.length}`;
}

function choose(whisper) {
  if (!state || state.i >= PROFILES.length) return;
  if (whisper) state.liked.push(state.i);
  state.i++;
  save(); render();
}

function renderMatches() {
  const list = $("matchlist");
  list.textContent = "";
  // A whisper only becomes an alliance if they whisper back: compatibility >= 55.
  const mutual = state.liked.filter((i) => score(state, PROFILES[i], i) >= 55);
  state.mutual = mutual;
  if (!mutual.length) {
    const p = document.createElement("p");
    p.textContent = "No one whispered back. The court is cold. Perhaps try poison, slower.";
    list.append(p);
  }
  mutual.forEach((i, k) => {
    const p = PROFILES[i];
    const d = document.createElement("div"); d.className = "match";
    const h = document.createElement("strong"); h.textContent = `${p.e} ${p.n} — ${score(state, p, i)}%`;
    const l = document.createElement("p"); l.textContent = "“" + LETTERS[(i + k) % LETTERS.length] + "”";
    d.append(h, l); list.append(d);
  });
  const top = mutual[0] != null ? PROFILES[mutual[0]].n : null;
  const text = top
    ? `I joined palacematch as ${state.name} and matched with ${top} — ${mutual.length} secret alliance${mutual.length > 1 ? "s" : ""} so far. https://palacematch.bisks.net/`
    : `I joined palacematch as ${state.name} and nobody whispered back. https://palacematch.bisks.net/`;
  $("share").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
}

$("enter").addEventListener("click", () => {
  const name = $("name").value.trim() || "Nameless Chamberlain";
  state = { name, ambition: +$("ambition").value, method: +$("method").value, faction: +$("faction").value, i: 0, liked: [] };
  save(); render();
});
$("whisper").addEventListener("click", () => choose(true));
$("betray").addEventListener("click", () => choose(false));
$("reset").addEventListener("click", () => { state = null; localStorage.removeItem(KEY); render(); });

render();
