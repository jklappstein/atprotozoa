// words.js — pick an account's "signature words" from its posts.
// Pure functions, no DOM, so tests/words.test.mjs can call them under node.
//
// With no reference corpus to compare against, "signature" is approximated:
// drop function words entirely (STOP), discount everyday words that anyone
// uses (COMMON), and rank the rest by how many separate posts they turn up
// in. Breadth beats raw count so one 40-word rant can't own the list.

const STOP = new Set(("a about above after again against all also am an and any are aren't as at be because been before being below between both but by " +
  "can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't have haven't having " +
  "he her here hers herself him himself his how i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most mustn't my myself no nor not " +
  "of off on once only or other ought our ours ourselves out over own same shan't she should shouldn't so some such than that that's the their theirs them " +
  "themselves then there there's these they they'd they'll they're they've this those through to too under until up very was wasn't we we'd we'll we're " +
  "we've were weren't what what's when where which while who whom why with won't would wouldn't you you'd you'll you're you've your yours yourself " +
  "yourselves im ive dont cant didnt doesnt isnt wasnt thats its youre theyre u ur rt amp http https www com").split(" "));

const COMMON = new Set(("just like get got going go one know think really people time good much way see make even still want need say said thing things " +
  "right back well now new today day always never ever lot something someone anyone everyone nothing take take look looks looking come comes came " +
  "yeah yes oh ok okay lol please thanks thank maybe actually pretty feel feels little many every though being doing been made makes work " +
  "tell told give gave use used using put keep first last long great better best bad sure kind part years year week days since another " +
  "may might must will would shall off around away both two three man guys post posts bluesky").split(" "));

const NOT_WORD = /[^\p{L}\p{N}'’-]+/u;

export function tokenize(text) {
  const cleaned = String(text || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/@[\w.-]+/g, " ")
    .toLowerCase();
  const out = [];
  for (let w of cleaned.split(NOT_WORD)) {
    w = w.replace(/’/g, "'").replace(/^['-]+|['-]+$/g, "").replace(/'s$/, "");
    if (w.length < 3 || /^\d+$/.test(w)) continue;
    out.push(w);
  }
  return out;
}

// posts: array of strings. Returns [{word, count, posts, score}] best first.
export function signatureWords(posts, n = 50) {
  const stats = new Map();
  for (const text of posts) {
    const seen = new Set();
    for (const w of tokenize(text)) {
      if (STOP.has(w)) continue;
      let s = stats.get(w);
      if (!s) stats.set(w, (s = { word: w, count: 0, posts: 0, score: 0 }));
      s.count++;
      if (!seen.has(w)) { seen.add(w); s.posts++; }
    }
  }
  const rows = [];
  for (const s of stats.values()) {
    if (s.posts < 2) continue; // a word used in one post is a topic, not a habit
    s.score = s.posts * Math.log(1 + s.posts) * (COMMON.has(s.word) ? 0.15 : 1) * (1 + Math.min(s.word.length, 10) / 40);
    rows.push(s);
  }
  rows.sort((a, b) => b.score - a.score || a.word.localeCompare(b.word));
  return rows.slice(0, n);
}
