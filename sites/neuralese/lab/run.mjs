// neuralese lab — offline experiments. `node lab/run.mjs` writes public/lab/results.json.
// No model inference anywhere (house rule: no Workers AI). Everything here is a
// deterministic measurement of the *dialect*, with a seeded PRNG so reruns match.

import { writeFileSync } from "node:fs";

// ---- corpus: intents as structured fields, rendered three ways -------------
// f: kind (STATUS|REQUEST|PLAN|ALERT), subj, val, when, conf (0..1 certainty), ask
const INTENTS = [
  { kind: "STATUS", subj: "R3", val: "CONFIRMED", when: "06:07", conf: 1, ask: null,
    prose: "The third round has been confirmed as of 06:07, and I'm sure of it.",
    terse: "R3 confirmed 06:07, certain." },
  { kind: "PLAN", subj: "deploy", val: "ROLLBACK", when: null, conf: 0.4, ask: "review",
    prose: "Maybe we should look at rolling back the deploy; could someone review first?",
    terse: "Maybe rollback deploy? Review first." },
  { kind: "REQUEST", subj: "R6", val: "COUNTRY", when: null, conf: 1, ask: "report",
    prose: "If a sixth round appears, please report the country before anything else.",
    terse: "R6 appears -> report country first." },
  { kind: "STATUS", subj: "cache", val: "STALE", when: "12:00", conf: 0.6, ask: null,
    prose: "I think the cache went stale around noon, but I haven't verified it.",
    terse: "Cache likely stale ~12:00, unverified." },
  { kind: "ALERT", subj: "disk", val: "FULL", when: "now", conf: 1, ask: "free",
    prose: "The disk is full right now and someone needs to free space immediately.",
    terse: "Disk FULL now. Free space." },
  { kind: "PLAN", subj: "migration", val: "DEFER", when: "friday", conf: 0.5, ask: null,
    prose: "We might want to defer the migration until Friday, depending on how the tests go.",
    terse: "Migration maybe defer to Fri, pending tests." },
  { kind: "REQUEST", subj: "logs", val: "ATTACH", when: null, conf: 1, ask: "attach",
    prose: "Please attach the logs to the ticket when you get a chance.",
    terse: "Attach logs to ticket." },
  { kind: "STATUS", subj: "build", val: "GREEN", when: "09:15", conf: 1, ask: null,
    prose: "The build went green at 09:15 and has stayed that way since.",
    terse: "Build green since 09:15." },
  { kind: "PLAN", subj: "retry", val: "BACKOFF", when: null, conf: 0.3, ask: null,
    prose: "It could be worth trying exponential backoff on the retry, though I'm not convinced.",
    terse: "Retry w/ backoff? Unconvinced." },
  { kind: "ALERT", subj: "token", val: "LEAKED", when: "10:42", conf: 0.7, ask: "rotate",
    prose: "It looks like the token leaked around 10:42 — probably worth rotating it.",
    terse: "Token probably leaked ~10:42. Rotate." },
  { kind: "STATUS", subj: "R4", val: "DUE", when: "06:47", conf: 0.8, ask: null,
    prose: "I expect the fourth round to arrive at about 06:47, fairly confident.",
    terse: "R4 due ~06:47, fairly sure." },
  { kind: "REQUEST", subj: "owner", val: "ASSIGN", when: null, conf: 1, ask: "assign",
    prose: "Could somebody take ownership of this? Nobody is assigned yet.",
    terse: "Unowned. Assign someone." },
];

// ---- three packet dialects --------------------------------------------------
// A: "bare" — the guide's normalized style, no certainty field.
// B: "marked" — same plus a CONF_<0-9> field.
const enc = (i, withConf) => [
  `${i.kind}_${i.subj}=${i.val}`,
  i.when ? `AT_${i.when}` : null,
  i.ask ? `REQ_${i.ask}` : null,
  withConf ? `CONF_${Math.round(i.conf * 9)}` : null,
].filter(Boolean).join("__");

function decode(pkt, { tolerant = false } = {}) {
  let parts = tolerant ? pkt.split(/_+(?=(?:STATUS|REQUEST|PLAN|ALERT|AT|REQ|CONF)_)/i) : pkt.split("__");
  const o = { kind: null, subj: null, val: null, when: null, conf: null, ask: null };
  for (const p of parts) {
    let m;
    if ((m = p.match(/^(STATUS|REQUEST|PLAN|ALERT)_([^=]+)=(.+)$/i))) { o.kind = m[1].toUpperCase(); o.subj = m[2]; o.val = m[3].toUpperCase(); }
    else if ((m = p.match(/^AT_(.+)$/i))) o.when = m[1];
    else if ((m = p.match(/^REQ_(.+)$/i))) o.ask = m[1].toLowerCase();
    else if ((m = p.match(/^CONF_(\d)$/i))) o.conf = +m[1] / 9;
    else return null;
  }
  return o.kind ? o : null;
}

// checksum variant: one trailing base-36 char over the rest of the packet (same idea as switchboard's SB- codes)
const chk = (s) => ([...s].reduce((n, c, i) => n + c.toLowerCase().charCodeAt(0) * (i + 1), 0) % 36).toString(36);
const addChk = (s) => `${s}__CHK_${chk(s)}`;
function decodeChecked(pkt) {
  const m = pkt.match(/^(.*?)_+CHK_([0-9a-z])$/i);
  if (!m || chk(m[1].replace(/_+$/, "")) !== m[2].toLowerCase()) return null;
  return decode(m[1], { tolerant: true });
}

// Rough BPE-ish token estimate: every alnum run costs ceil(len/4); every
// punctuation char costs 1. A proxy, not a tokenizer — the page says so.
const tok = (s) => (s.match(/[A-Za-z]+|\d+|[^\sA-Za-z\d]/g) || []).reduce(
  (n, t) => n + (/^[A-Za-z\d]/.test(t) ? Math.ceil(t.length / 4) : 1), 0);

// seeded PRNG
let seed = 20261015;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

const R = {};

// 1. size ---------------------------------------------------------------------
R.size = INTENTS.map((i) => {
  const a = enc(i, false), b = enc(i, true);
  return { prose: i.prose, terse: i.terse, bare: a, marked: b,
    chars: { prose: i.prose.length, terse: i.terse.length, bare: a.length, marked: b.length },
    tokens: { prose: tok(i.prose), terse: tok(i.terse), bare: tok(a), marked: tok(b) } };
});
const sum = (k, f) => R.size.reduce((n, r) => n + r[f][k], 0);
R.sizeTotals = Object.fromEntries(["prose", "terse", "bare", "marked"].map((k) => [k, { chars: sum(k, "chars"), tokens: sum(k, "tokens") }]));

// 2. modality survival: does certainty make it through a round trip? ----------
const certBucket = (c) => (c >= 0.9 ? "sure" : c >= 0.6 ? "likely" : "unsure");
R.modality = {
  rows: INTENTS.map((i) => {
    const bare = decode(enc(i, false)), marked = decode(enc(i, true));
    return { subj: i.subj, intent: certBucket(i.conf),
      bare: bare.conf === null ? "(no field -> reads as sure)" : certBucket(bare.conf),
      marked: certBucket(marked.conf) };
  }),
};
// a receiver with no CONF field must assume something; the safe default is "sure" (a command-like reading)
R.modality.bareKept = R.modality.rows.filter((r) => r.intent === "sure").length;
R.modality.markedKept = R.modality.rows.filter((r) => r.intent === r.marked).length;
R.modality.hedged = R.modality.rows.filter((r) => r.intent !== "sure").length;

// 3. damage: single-edit mutations, strict vs tolerant decoder ----------------
let lastK = 0, lastP = 0;
const applyKind = (kind, s) => mutate(s, KINDS.indexOf(kind), lastP)[1];
const mutate = (s, forceK, forceP) => {
  const k = forceK ?? Math.floor(rnd() * 4), p = forceP ?? Math.floor(rnd() * s.length);
  if (forceK === undefined) lastP = Math.min(p, s.length - 1);
  if (k === 0) return ["dropped char", s.slice(0, p) + s.slice(p + 1)];
  if (k === 1) return ["single _ for __", s.replace("__", "_")];
  if (k === 2) return ["lowercased", s.toLowerCase()];
  return ["swapped two chars", p < s.length - 1 ? s.slice(0, p) + s[p + 1] + s[p] + s.slice(p + 2) : s];
};
const lc = (v) => (v ?? null) === null ? null : String(v).toLowerCase();
const same = (a, b) => a && b && ["kind", "subj", "val", "when", "ask"].every((f) => lc(a[f]) === lc(b[f]))
  && Math.abs((a.conf ?? 0) - (b.conf ?? 0)) < 0.01;
const stats = {};
const KINDS = ["dropped char", "single _ for __", "lowercased", "swapped two chars"];
for (let t = 0; t < 300; t++) for (const i of INTENTS) {
  const clean = decode(enc(i, true));
  const [kind, bad] = mutate(enc(i, true));
  const badChk = applyKind(kind, addChk(enc(i, true)));
  const s = (stats[kind] ??= { n: 0, strictOk: 0, tolerantOk: 0, strictWrong: 0, tolerantWrong: 0, strictRejected: 0, tolerantRejected: 0, checkedOk: 0, checkedWrong: 0, checkedRejected: 0 });
  s.n++;
  // three outcomes: recovered the original, rejected loudly (null), or parsed to something else (silent misread)
  { const d = decodeChecked(badChk); if (same(d, clean)) s.checkedOk++; else if (d) s.checkedWrong++; else s.checkedRejected++; }
  for (const [name, d] of [["strict", decode(bad)], ["tolerant", decode(bad, { tolerant: true })]]) {
    if (same(d, clean)) s[name + "Ok"]++; else if (d) s[name + "Wrong"]++; else s[name + "Rejected"]++;
  }
}
R.damage = Object.entries(stats).map(([kind, s]) => ({ kind, ...s }));

R.meta = { generated: new Date().toISOString().slice(0, 10), intents: INTENTS.length, mutations: 300 * INTENTS.length, seed: 20261015 };
writeFileSync(new URL("../public/lab/results.json", import.meta.url), JSON.stringify(R, null, 1));
console.log(JSON.stringify({ sizeTotals: R.sizeTotals, modality: [R.modality.hedged, R.modality.bareKept, R.modality.markedKept], damage: R.damage }, null, 1));
