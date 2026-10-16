// deescalate: rage 0-100 (win at 0, lose at 100), crowd = how hungry onlookers
// are, ego = how much praise has gone to your head. All state is in memory.
const PROVOCATIONS = [
  "people like you are exactly the problem.",
  "lol imagine thinking that. ratio incoming.",
  "you're all sheep who'll swallow whatever you're sold.",
  "everyone here is performing for their gang. you included.",
  "nobody asked for your take, and yet.",
  "this is why nobody takes your side seriously.",
  "screenshotting this for later, enjoy it.",
  "so you're just going to pretend that didn't happen?",
];
const REPLIES = {
  punch: ["you first, genius.", "say that to my face, then.", "wow. projecting much?", "ratio'd yourself, champ."],
  kind: ["that sounds rough. what's actually going on?", "i might be wrong; tell me what i'm missing.", "i'd rather figure this out than win it.", "fair. i can see why it landed that way."],
  walk: ["(mutes the thread and makes tea)", "(closes the app)", "(goes outside)"],
};
const CROWD = {
  punch: ["🔥 the crowd leans in.", "👀 quote-posts incoming.", "the crowd chants your name."],
  kind: ["the crowd shuffles. less fun this way.", "a few onlookers drift off.", "someone says 'huh, fair'."],
  walk: ["the crowd waits. nothing to feed on.", "the thread goes quiet."],
};
const $ = (id) => document.getElementById(id);
let s;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

function post(cls, who, text) {
  const d = document.createElement("div");
  d.className = "post " + cls;
  const b = document.createElement("b");
  b.textContent = who;
  d.append(b, text);
  $("thread").append(d);
  d.scrollIntoView({ block: "nearest" });
}

function render() {
  for (const k of ["rage", "crowd", "ego"]) {
    $("b-" + k).style.width = s[k] + "%";
    $("n-" + k).textContent = s[k];
  }
}

function provoke() {
  post("", "@someone", pick(PROVOCATIONS));
  const c = $("choices");
  c.replaceChildren();
  const opts = [
    ["punch", "punch back", "the expected move"],
    ["kind", "stay kind", "slow, and the crowd gets bored"],
    ["walk", "walk away", "no ego, no fuel, no resolution"],
  ];
  for (const [id, label, hint] of opts) {
    const b = document.createElement("button");
    b.append(label);
    const sm = document.createElement("small");
    sm.textContent = hint;
    b.append(sm);
    b.addEventListener("click", () => choose(id));
    c.append(b);
  }
}

function choose(id) {
  s.turn++;
  post("you" + (id === "punch" ? " punch" : ""), "you", pick(REPLIES[id]));
  // Kindness is hindered by a hungry crowd and by ego; punching is always
  // effective short term; walking away cools things but leaves the crowd's hunger.
  if (id === "punch") {
    s.rage += 14 + s.crowd / 8;
    s.crowd += 16;
    s.ego += 6;
  } else if (id === "kind") {
    s.rage -= Math.max(3, 16 - s.crowd / 8 - s.ego / 10);
    s.crowd -= 10;
    s.ego += 2;
  } else {
    s.rage -= 6;
    s.crowd -= 4;
    s.ego -= 4;
  }
  post("crowd", "crowd", pick(CROWD[id]));
  // Praise arrives after kind acts and feeds the ego, which hinders you.
  if (id === "kind" && Math.random() < 0.5) {
    post("crowd", "@fan", "so kind! you're the best one here. 💛");
    s.ego += 12;
  }
  // The crowd keeps stirring the pot while it's hungry.
  s.rage += s.crowd > 50 ? 4 : 0;
  s.rage = clamp(s.rage); s.crowd = clamp(s.crowd); s.ego = clamp(s.ego);
  render();
  if (s.rage >= 100) return finish(false);
  if (s.rage <= 0) return finish(true);
  if (s.turn >= 20) return finish(s.rage < 30);
  provoke();
}

function finish(won) {
  $("choices").replaceChildren();
  const e = $("end");
  e.hidden = false;
  e.replaceChildren();
  const p = document.createElement("p");
  p.textContent = won
    ? `the cycle broke in ${s.turn} replies. ego ended at ${s.ego}.`
    : `the cycle ate the thread after ${s.turn} replies. rage ${s.rage}, crowd ${s.crowd}.`;
  const again = document.createElement("button");
  again.textContent = "again";
  again.addEventListener("click", start);
  const text = won
    ? `I broke the rage cycle in ${s.turn} replies on deescalate`
    : `I fed the rage cycle for ${s.turn} replies on deescalate`;
  const a = document.createElement("a");
  a.textContent = "post to bluesky";
  a.href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text + " https://deescalate.bisks.net/");
  a.target = "_blank";
  a.rel = "noopener";
  e.append(p, again, a);
}

function start() {
  s = { rage: 50, crowd: 40, ego: 10, turn: 0 };
  $("thread").replaceChildren();
  $("end").hidden = true;
  render();
  provoke();
}

start();
