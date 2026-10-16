// Sign-guessing: pure functions, no DOM, so tests can run under node.
// The "astrology" is a hand-tuned lexicon + a few style features, scored over
// a person's most-liked posts (each post weighted by log of its likes).

export const SIGNS = [
  { id: "aries", name: "Aries", sym: "♈", el: "fire", dates: "Mar 21 – Apr 19",
    words: /\b(first|fight|win|won|now|fast|go|let'?s|start|race|challenge|angry|mad|ready|fire|boss|attack|hell|damn)\b/gi,
    feat: { excl: 1.2, caps: 1, short: 0.8 },
    line: "you post like you're already three steps down the road and annoyed nobody followed" },
  { id: "taurus", name: "Taurus", sym: "♉", el: "earth", dates: "Apr 20 – May 20",
    words: /\b(food|eat|dinner|lunch|breakfast|coffee|cheese|cake|bread|nap|sleep|cozy|comfort|soft|garden|money|cook|delicious|snack|pizza)\b/gi,
    feat: { calm: 1, long: 0.3 },
    line: "your best material is snacks, naps and refusing to be rushed" },
  { id: "gemini", name: "Gemini", sym: "♊", el: "air", dates: "May 21 – Jun 20",
    words: /\b(or|both|twice|talk|chat|wait|wonder|why|how|who|what|maybe|random|thread|conversation|apparently|lol|lmao)\b/gi,
    feat: { quest: 1.4, mention: 1, excl: 0.2 },
    line: "questions, tangents and a suspicious number of people in your replies" },
  { id: "cancer", name: "Cancer", sym: "♋", el: "water", dates: "Jun 21 – Jul 22",
    words: /\b(home|mom|mother|dad|family|kids?|baby|love|miss|memory|memories|remember|feel|feelings|cry|crying|hug|safe|house|cat|dog|friend|friends)\b/gi,
    feat: { we: 0.8, emoji: 0.4 },
    line: "your biggest hits are about home, people you love, and feeling it all" },
  { id: "leo", name: "Leo", sym: "♌", el: "fire", dates: "Jul 23 – Aug 22",
    words: /\b(i|me|my|mine|best|queen|king|iconic|famous|star|spotlight|show|stage|look|fabulous|proud|gold|crown|main character)\b/gi,
    feat: { self: 1.4, excl: 0.8, media: 1 },
    line: "the room is yours and the likes keep proving it" },
  { id: "virgo", name: "Virgo", sym: "♍", el: "earth", dates: "Aug 23 – Sep 22",
    words: /\b(actually|technically|detail|details|list|fix|fixed|clean|organized|schedule|health|routine|correct|correction|wrong|precisely|exactly|proofread|spreadsheet|notes?)\b/gi,
    feat: { link: 1.2, long: 1, calm: 0.5 },
    line: "citations, corrections, and a well-organized grievance" },
  { id: "libra", name: "Libra", sym: "♎", el: "air", dates: "Sep 23 – Oct 22",
    words: /\b(fair|fairly|balance|beautiful|beauty|art|aesthetic|harmony|both|couple|together|style|pretty|design|taste|elegant|lovely|gentle)\b/gi,
    feat: { we: 1, media: 0.6, calm: 0.5 },
    line: "balanced, tasteful, and somehow everyone's favorite mutual" },
  { id: "scorpio", name: "Scorpio", sym: "♏", el: "water", dates: "Oct 23 – Nov 21",
    words: /\b(secret|secrets|dark|death|dead|revenge|obsessed|obsession|trust|truth|never|forget|forgive|betray|betrayed|intense|haunted|ghost|night|blood|bones?)\b/gi,
    feat: { night: 1.6, lower: 0.8, short: 0.6 },
    line: "intense, nocturnal, and holding a grudge with excellent posture" },
  { id: "sagittarius", name: "Sagittarius", sym: "♐", el: "fire", dates: "Nov 22 – Dec 21",
    words: /\b(travel|trip|world|adventure|journey|flight|fly|road|explore|freedom|free|philosophy|truth|learn|wild|mountain|country|abroad|sunrise|honestly)\b/gi,
    feat: { long: 1, tag: 0.8, excl: 0.5 },
    line: "big opinions, bigger horizons, zero filter" },
  { id: "capricorn", name: "Capricorn", sym: "♑", el: "earth", dates: "Dec 22 – Jan 19",
    words: /\b(work|job|career|boss|office|meeting|deadline|goal|goals|discipline|plan|plans|build|built|ship|shipped|tired|monday|budget|rent|tax|taxes|productive)\b/gi,
    feat: { calm: 1.2, noemoji: 1, link: 0.4 },
    line: "dry, productive, and quietly the funniest person at work" },
  { id: "aquarius", name: "Aquarius", sym: "♒", el: "air", dates: "Jan 20 – Feb 18",
    words: /\b(future|internet|tech|code|software|ai|robot|weird|strange|science|space|revolution|society|network|protocol|open|community|algorithm|data|atproto|bluesky|users?)\b/gi,
    feat: { link: 1, mention: 0.4, tag: 0.5 },
    line: "ahead of the curve, slightly alien, extremely online" },
  { id: "pisces", name: "Pisces", sym: "♓", el: "water", dates: "Feb 19 – Mar 20",
    words: /\b(dream|dreams|dreaming|sleep|ocean|sea|water|moon|music|song|magic|soul|feel|feeling|cry|swim|fish|poem|poetry|lost|float|vibes?|sad|sleepy)\b/gi,
    feat: { emoji: 1.2, lower: 1, quest: 0.3 },
    line: "dreamy, lowercase, and emotionally in a different time zone" },
];

const EMOJI = /\p{Extended_Pictographic}/gu;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function fnv1a(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// One post -> style features, each 0..1.
export function featuresOf(p) {
  const t = p.text || "";
  const len = t.length;
  const letters = t.replace(/[^a-zA-Z]/g, "");
  const upper = (letters.match(/[A-Z]/g) || []).length;
  const words = t.toLowerCase().match(/[a-z']+/g) || [];
  const wc = Math.max(words.length, 1);
  const excl = (t.match(/!/g) || []).length;
  const hour = p.createdAt ? new Date(p.createdAt).getUTCHours() : -1;
  const emojis = (t.match(EMOJI) || []).length;
  const f = {
    excl: clamp01(excl / 2),
    quest: clamp01((t.match(/\?/g) || []).length / 2),
    caps: letters.length > 8 ? clamp01(upper / letters.length / 0.15) : 0,
    long: clamp01(len / 250),
    short: clamp01(1 - len / 90),
    lower: letters.length > 5 && upper === 0 ? 1 : 0,
    emoji: clamp01(emojis / 2),
    noemoji: emojis === 0 ? 1 : 0,
    link: p.hasLink ? 1 : 0,
    media: p.hasMedia ? 1 : 0,
    tag: clamp01(((t.match(/#\w+/g) || []).length) / 2),
    mention: clamp01(((t.match(/@\w+/g) || []).length) / 2),
    self: clamp01(words.filter((w) => /^(i|i'm|im|i've|me|my|mine)$/.test(w)).length / wc / 0.1),
    we: clamp01(words.filter((w) => /^(we|us|our|ours|together)$/.test(w)).length / wc / 0.04),
    night: hour >= 0 && (hour >= 3 && hour < 9) ? 1 : 0, // 03–09 UTC: late evening in the Americas
    calm: excl === 0 && emojis === 0 ? 1 : 0,
  };
  return f;
}

// posts: [{ uri, text, likes, createdAt, hasLink, hasMedia }]
export function guessSign(posts, seed = "") {
  const total = new Map(SIGNS.map((s) => [s.id, 0]));
  const evidence = new Map(SIGNS.map((s) => [s.id, []]));
  let wsum = 0;
  for (const p of posts) {
    const w = 1 + Math.log10(1 + (p.likes || 0));
    wsum += w;
    const f = featuresOf(p);
    for (const s of SIGNS) {
      const hits = [...new Set(((p.text || "").match(s.words) || []).map((x) => x.toLowerCase()))];
      let sc = Math.min(hits.length, 3) * 1.0;
      for (const k in s.feat) sc += s.feat[k] * (f[k] || 0) * 0.45;
      sc *= w;
      total.set(s.id, total.get(s.id) + sc);
      if (hits.length) evidence.get(s.id).push({ post: p, hits, sc });
    }
  }
  const ranked = SIGNS.map((s) => {
    const raw = wsum ? total.get(s.id) / wsum : 0;
    // tiny deterministic nudge so exact ties don't always fall to Aries
    return { sign: s, score: raw + (fnv1a(seed + "|" + s.id) % 997) / 997 * 0.01 };
  }).sort((a, b) => b.score - a.score);
  const top = ranked[0].score || 1e-9;
  const margin = ranked[0].score ? (ranked[0].score - ranked[1].score) / ranked[0].score : 0;
  const best = ranked[0].sign;
  const ev = evidence.get(best.id).sort((a, b) => b.sc - a.sc).slice(0, 3);
  return {
    sign: best,
    share: ranked.map((r) => ({ sign: r.sign, pct: Math.round((r.score / top) * 100) })),
    confidence: posts.length < 10 ? "low — tiny sample" : margin > 0.25 ? "high (for astrology)" : margin > 0.1 ? "medium" : "a coin flip with extra steps",
    evidence: ev,
  };
}
