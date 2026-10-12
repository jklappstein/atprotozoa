// Pure ranking logic: URL parsing + resumable binary-insertion sort.
// Binary insertion needs ~n·log2(n) duels, which is as few as a human-driven
// comparison sort gets, and its state is tiny so it survives a page reload.

const ID = /^[A-Za-z0-9_-]{11}$/;

export function parseId(s) {
  s = s.trim();
  if (ID.test(s)) return s;
  let u;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id = null;
  if (host === "youtu.be") id = u.pathname.split("/")[1];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([^/]+)/);
      if (m) id = m[2];
    }
  }
  return id && ID.test(id) ? id : null;
}

// Every video id found in a pasted blob (one per line, or any whitespace/comma
// separated), deduped, in first-seen order.
export function parseIds(text) {
  const out = [], seen = new Set();
  for (const tok of text.split(/[\s,]+/)) {
    if (!tok) continue;
    const id = parseId(tok);
    if (id && !seen.has(id)) { seen.add(id); out.push(id); }
  }
  return out;
}

export function start(ids) {
  return { sorted: [], queue: [...ids], lo: 0, hi: 0, duels: 0 };
}

// Settle trivial insertions (empty list), then report the next pair or null.
export function pair(st) {
  if (!st.queue.length) return null;
  if (!st.sorted.length) {
    st.sorted.push(st.queue.shift());
    return pair(st);
  }
  const mid = (st.lo + st.hi) >> 1;
  return [st.queue[0], st.sorted[mid]];
}

// first=true means the new item (pair()[0]) should be watched before pair()[1].
export function answer(st, first) {
  if (!pair(st)) return;
  const mid = (st.lo + st.hi) >> 1;
  if (first) st.hi = mid; else st.lo = mid + 1;
  st.duels++;
  if (st.lo >= st.hi) {
    st.sorted.splice(st.lo, 0, st.queue.shift());
    st.lo = 0;
    st.hi = st.sorted.length;
  }
}

export function done(st) { return st.queue.length === 0 && st.sorted.length > 0; }

// Rough duels remaining, for the progress bar.
export function estimate(st) {
  let n = st.sorted.length, left = 0;
  for (let i = 0; i < st.queue.length; i++, n++) left += Math.ceil(Math.log2(n + 1));
  return left;
}
