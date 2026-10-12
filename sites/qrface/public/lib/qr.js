// qr.js — a small QR Code encoder (byte mode only, error-correction level H).
// Returns the module matrix; drawing is the caller's job. Level H because
// qrface paints over the data modules to look like an avatar, and H is the
// level with the most slack for a scanner to forgive that.
//
//   encode("https://example.com/") -> { size, version, mask, modules: boolean[][], isFunction: boolean[][] }

// Level H tables, indexed by version 1..40:
// [ec codewords per block, blocks in group 1, data cw per block in group 1,
//   blocks in group 2, data cw per block in group 2]
const H = [
  null,
  [17, 1, 9, 0, 0], [28, 1, 16, 0, 0], [22, 2, 13, 0, 0], [16, 4, 9, 0, 0],
  [22, 2, 11, 2, 12], [28, 4, 15, 0, 0], [26, 4, 13, 1, 14], [26, 4, 14, 2, 15],
  [24, 4, 12, 4, 13], [28, 6, 15, 2, 16], [24, 3, 12, 8, 13], [28, 7, 14, 4, 15],
  [22, 12, 11, 4, 12], [24, 11, 12, 5, 13], [24, 11, 12, 7, 13], [30, 3, 15, 13, 16],
  [28, 2, 14, 17, 15], [28, 2, 14, 19, 15], [26, 9, 13, 16, 14], [28, 15, 15, 10, 16],
  [30, 19, 16, 6, 17], [24, 34, 13, 0, 0], [30, 16, 15, 14, 16], [30, 30, 16, 2, 17],
  [30, 22, 15, 13, 16], [30, 33, 16, 4, 17], [30, 12, 15, 28, 16], [30, 11, 15, 31, 16],
  [30, 19, 15, 26, 16], [30, 23, 15, 25, 16], [30, 23, 15, 28, 16], [30, 19, 15, 35, 16],
  [30, 11, 15, 46, 16], [30, 59, 16, 1, 17], [30, 22, 15, 41, 16], [30, 2, 15, 64, 16],
  [30, 24, 15, 46, 16], [30, 42, 15, 32, 16], [30, 10, 15, 67, 16], [30, 20, 15, 61, 16],
];

const dataCapacity = (v) => H[v][1] * H[v][2] + H[v][3] * H[v][4];

// ---- Reed-Solomon over GF(256), poly 0x11d ----
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x; LOG[x] = i;
  x <<= 1; if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsGenerator(deg) {
  let g = [1];
  for (let i = 0; i < deg; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= gmul(g[j], EXP[i]);
    }
    g = next;
  }
  return g; // leading coefficient first
}

function rsRemainder(data, deg) {
  const gen = rsGenerator(deg);
  const rem = new Array(deg).fill(0);
  for (const b of data) {
    const f = b ^ rem.shift();
    rem.push(0);
    if (f) for (let i = 0; i < deg; i++) rem[i] ^= gmul(gen[i + 1], f);
  }
  return rem;
}

// ---- layout helpers ----
function alignmentCenters(v) {
  if (v === 1) return [];
  const n = Math.floor(v / 7) + 2;
  const size = v * 4 + 17;
  const step = v === 32 ? 26 : Math.ceil((size - 13) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let p = size - 7; out.length < n; p -= step) out.splice(1, 0, p);
  return out;
}

function bchFormat(data) { // data: 5 bits (ec level + mask)
  let r = data << 10;
  for (let i = 14; i >= 10; i--) if ((r >> i) & 1) r ^= 0x537 << (i - 10);
  return ((data << 10) | r) ^ 0x5412;
}
function bchVersion(v) {
  let r = v << 12;
  for (let i = 17; i >= 12; i--) if ((r >> i) & 1) r ^= 0x1f25 << (i - 12);
  return (v << 12) | r;
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function penalty(m) {
  const n = m.length;
  let p = 0;
  for (let pass = 0; pass < 2; pass++) {
    const at = (i, j) => (pass ? m[j][i] : m[i][j]);
    for (let i = 0; i < n; i++) {
      let run = 1;
      for (let j = 1; j < n; j++) {
        if (at(i, j) === at(i, j - 1)) { run++; if (j === n - 1 && run >= 5) p += run - 2; }
        else { if (run >= 5) p += run - 2; run = 1; }
      }
      for (let j = 0; j + 10 < n; j++) { // finder-like 1:1:3:1:1 with 4 light on a side
        const bits = [1, 0, 1, 1, 1, 0, 1];
        let a = true;
        for (let k = 0; k < 7; k++) if (at(i, j + 4 + k) !== !!bits[k]) { a = false; break; }
        if (a) {
          let l = true;
          for (let k = 0; k < 4; k++) if (at(i, j + k)) { l = false; break; }
          if (l) p += 40;
        }
      }
      for (let j = 0; j + 10 < n; j++) {
        const bits = [1, 0, 1, 1, 1, 0, 1];
        let a = true;
        for (let k = 0; k < 7; k++) if (at(i, j + k) !== !!bits[k]) { a = false; break; }
        if (a) {
          let l = true;
          for (let k = 0; k < 4; k++) if (at(i, j + 7 + k)) { l = false; break; }
          if (l) p += 40;
        }
      }
    }
  }
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < n - 1; j++) {
      const v = m[i][j];
      if (v === m[i][j + 1] && v === m[i + 1][j] && v === m[i + 1][j + 1]) p += 3;
    }
  let dark = 0;
  for (const row of m) for (const v of row) if (v) dark++;
  p += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return p;
}

export function utf8(str) { return Array.from(new TextEncoder().encode(str)); }

// minVersion lets a caller ask for a bigger grid than the text needs (more
// modules = more pixels of avatar between the scan points).
export function encode(text, { minVersion = 1 } = {}) {
  const bytes = utf8(text);
  let v = Math.max(1, minVersion);
  for (; v <= 40; v++) {
    const ccBits = v < 10 ? 8 : 16;
    if (4 + ccBits + bytes.length * 8 <= dataCapacity(v) * 8) break;
  }
  if (v > 40) throw new Error("text too long for a QR code");

  // bit stream: mode 0100, count, bytes, terminator, pad
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  put(4, 4);
  put(bytes.length, v < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const cap = dataCapacity(v) * 8;
  put(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let x = 0; for (let k = 0; k < 8; k++) x = (x << 1) | bits[i + k]; data.push(x);
  }
  for (let pad = 0xec; data.length < dataCapacity(v); pad ^= 0xec ^ 0x11) data.push(pad);

  // split into blocks, add EC, interleave
  const [ecLen, n1, d1, n2, d2] = H[v];
  const blocks = [];
  let off = 0;
  for (let i = 0; i < n1 + n2; i++) {
    const len = i < n1 ? d1 : d2;
    const d = data.slice(off, off + len); off += len;
    blocks.push({ d, e: rsRemainder(d, ecLen) });
  }
  const out = [];
  for (let i = 0; i < Math.max(d1, d2); i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) out.push(b.e[i]);
  const stream = [];
  for (const b of out) for (let k = 7; k >= 0; k--) stream.push((b >> k) & 1);

  // matrix
  const n = v * 4 + 17;
  const mk = () => Array.from({ length: n }, () => new Array(n).fill(false));
  const m = mk(), fn = mk();
  const setF = (r, c, val) => { m[r][c] = val; fn[r][c] = true; };

  for (const [fr, fc] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const rr = fr + r, cc = fc + c;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
      const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
      setF(rr, cc, r >= 0 && r <= 6 && c >= 0 && c <= 6 && ring !== 2);
    }
  }
  for (let i = 8; i < n - 8; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
  const ac = alignmentCenters(v);
  for (const r of ac) for (const c of ac) {
    if (fn[r][c]) continue; // collides with a finder
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++)
      setF(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }
  setF(n - 8, 8, true); // dark module
  const reserve = (r, c) => { fn[r][c] = true; };
  for (let i = 0; i < 9; i++) { reserve(8, i); reserve(i, 8); }
  for (let i = 0; i < 8; i++) { reserve(8, n - 1 - i); reserve(n - 1 - i, 8); }
  if (v >= 7) {
    const info = bchVersion(v);
    for (let i = 0; i < 18; i++) {
      const bit = !!((info >> i) & 1), a = Math.floor(i / 3), b = (i % 3) + n - 11;
      setF(a, b, bit); setF(b, a, bit);
    }
  }

  // place data zigzag
  let k = 0;
  const placed = [];
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const c = right - j;
      const up = ((right + 1) & 2) === 0;
      const r = up ? n - 1 - vert : vert;
      if (!fn[r][c]) { m[r][c] = k < stream.length ? stream[k] === 1 : false; k++; placed.push([r, c]); }
    }
  }

  const writeFormat = (mat, mask) => {
    const f = bchFormat((0b10 << 3) | mask); // level H = 10
    const bit = (i) => !!((f >> i) & 1);
    for (let i = 0; i <= 5; i++) mat[i][8] = bit(i);
    mat[7][8] = bit(6); mat[8][8] = bit(7); mat[8][7] = bit(8);
    for (let i = 9; i < 15; i++) mat[8][14 - i] = bit(i);
    for (let i = 0; i < 8; i++) mat[8][n - 1 - i] = bit(i);
    for (let i = 8; i < 15; i++) mat[n - 15 + i][8] = bit(i);
    mat[n - 8][8] = true;
  };

  let best = null, bestMask = 0, bestP = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const t = m.map((row) => row.slice());
    for (const [r, c] of placed) if (MASKS[mask](r, c)) t[r][c] = !t[r][c];
    writeFormat(t, mask);
    const p = penalty(t);
    if (p < bestP) { bestP = p; best = t; bestMask = mask; }
  }
  return { size: n, version: v, mask: bestMask, modules: best, isFunction: fn };
}
