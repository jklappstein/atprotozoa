// Stages of grief per the thread's chart: shock, denial, anger, bargaining,
// depression, testing, acceptance. Classification is a plain keyword score
// (no model inference); ties and no-match fall back to a hash of the text so
// the same take always gets the same stage.
const STAGES = [
  { name: "Shock", line: "It did what?? In one afternoon??",
    re: /\b(wow|wtf|omg|can'?t believe|cannot believe|insane|unbelievable|just (saw|watched|happened)|did not expect|holy|mind[- ]?blown|stunned|speechless|\bjust (built|wrote|did)\b)/i },
  { name: "Denial", line: "It's just autocomplete. It'll blow over.",
    re: /\b(just (a |an )?(autocomplete|stochastic|parrot|hype|bubble|text predict)|stochastic parrot|bubble|hype|overhyped|fad|won'?t (last|work|replace)|never (replace|work)|not (real|intelligent|actually)|smoke and mirrors|doesn'?t (really )?(understand|think)|snake oil|plateau)/i },
  { name: "Anger", line: "Stolen. All of it. And they're proud of it.",
    re: /\b(slop|stolen|steal|theft|scam|grift|garbage|disgust|f+uck|shit|hate|evil|ruin|destroy|trash|plagiar|scab|oligarch|billionaire|burn it|boycott|unethical|exploit)/i },
  { name: "Bargaining", line: "Fine, but only if a human stays in the loop.",
    re: /\b(if only|as long as|human in the loop|as a tool|augment|copilot|still need (humans|us|people)|new jobs|reskill|regulat|guardrails|opt[- ]?out|compromise|middle ground|responsible|but only if|at least)/i },
  { name: "Depression", line: "What's the point of learning anything anymore.",
    re: /\b(what'?s the point|pointless|hopeless|tired|exhausted|numb|empty|doomed|nothing matters|given up|give up|grieving|mourn|sad|lonely|obsolete|burn(ed)? out|can'?t keep up|meaningless|dread)/i },
  { name: "Testing", line: "Okay, but can it do my actual job? Let me try.",
    re: /\b(i tried|i tested|benchmark|prompted|ran it|let me try|experiment|trying out|played with|compared|my workflow|evals?|try it|tested|spent (the|a) (day|week|weekend)|vibe[- ]?cod)/i },
  { name: "Acceptance", line: "It's here. Let's make something good with it.",
    re: /\b(accept|embrace|adapt|here to stay|it'?s here|learn to|make peace|the future is|new normal|get used to|welcome|lean in|worth it|ship(ped)? it|use it daily|can'?t imagine working without|life[- ]?changing)/i },
];

function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

export function classify(text) {
  const scores = STAGES.map((s) => (text.match(new RegExp(s.re.source, "gi")) || []).length);
  const best = Math.max(...scores);
  if (best === 0) return hash(text) % STAGES.length;
  return scores.indexOf(best);
}

export function parsePostUrl(s) {
  const m = s.trim().match(/bsky\.app\/profile\/([^/\s?#]+)\/post\/([a-z0-9]+)/i);
  return m ? { actor: m[1], rkey: m[2] } : null;
}

const API = "https://public.api.bsky.app/xrpc/";
async function xrpc(method, params) {
  const r = await fetch(API + method + "?" + new URLSearchParams(params));
  if (!r.ok) throw new Error(method + " " + r.status);
  return r.json();
}

async function fetchPost(p) {
  let did = p.actor;
  if (!did.startsWith("did:")) did = (await xrpc("com.atproto.identity.resolveHandle", { handle: did.replace(/^@/, "") })).did;
  const uri = `at://${did}/app.bsky.feed.post/${p.rkey}`;
  const t = await xrpc("app.bsky.feed.getPostThread", { uri, depth: "0", parentHeight: "0" });
  const post = t.thread && t.thread.post;
  if (!post) throw new Error("post not found");
  return { text: post.record.text || "", handle: post.author.handle, url: `https://bsky.app/profile/${post.author.handle}/post/${p.rkey}` };
}

const EXAMPLES = [
  "It's just autocomplete. This bubble pops in a year and everyone will pretend they never bought in.",
  "I tried it on my actual codebase for a weekend. Benchmarks are one thing, my workflow is another.",
  "wow. I just watched it write a whole app in one prompt. I can't believe this is real.",
  "It's all stolen art and slop and I hate every billionaire pushing it.",
  "Honestly it's here to stay. I'm learning to use it daily and it's been worth it.",
  "What's the point of learning to draw anymore. I'm so tired.",
  "I'm fine with it as long as there's a human in the loop and artists can opt out.",
];

const $ = (id) => document.getElementById(id);

function show(i, quote, url) {
  const s = STAGES[i];
  $("stage").textContent = `Stage ${i + 1}: ${s.name}`;
  $("line").textContent = `“${s.line}”`;
  $("quote").textContent = quote.length > 280 ? quote.slice(0, 279) + "…" : quote;
  $("meter").replaceChildren(...STAGES.map((_, k) => { const e = document.createElement("span"); if (k === i) e.className = "on"; return e; }));
  const text = `Stage ${i + 1} of AI grief: ${s.name}. “${s.line}”${url ? "\n" + url : ""}`;
  $("qt").href = "https://bsky.app/intent/compose?text=" + encodeURIComponent(text);
  $("copy").onclick = () => navigator.clipboard && navigator.clipboard.writeText(text);
  $("card").hidden = false;
}

async function go() {
  const raw = $("input").value.trim();
  $("err").hidden = true;
  if (!raw) { $("err").textContent = "paste a take or a post link first"; $("err").hidden = false; return; }
  try {
    const p = parsePostUrl(raw);
    if (p) {
      const post = await fetchPost(p);
      show(classify(post.text), `@${post.handle}: ${post.text}`, post.url);
    } else {
      show(classify(raw), raw, "");
    }
  } catch (e) {
    $("card").hidden = true;
    $("err").textContent = "couldn't load that post (" + e.message + "). paste the text instead.";
    $("err").hidden = false;
  }
}

if (typeof document !== "undefined") {
  $("go").addEventListener("click", go);
  $("input").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) go(); });
  $("rand").addEventListener("click", () => { $("input").value = EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]; go(); });
}
