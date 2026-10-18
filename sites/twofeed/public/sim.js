// Core of the three-chemical Gray-Scott variant. No DOM here so it can run
// under node (tests, og-gen) as well as in the browser.
//
//   dA1/dt = D1 ∇²A1 − 2·c1·A1·B² + f1 (1 − A1)
//   dA2/dt = D2 ∇²A2 − 2·c2·A2·B² + f2 (1 − A2)
//   dB/dt  = DB ∇²B  + c1·A1·B² + c2·A2·B² − (k + (f1+f2)/2) B
//
// (The 2 is because each pool is half the substrate supply, so each is drawn
// on twice as hard per unit B made.) With A1 = A2, D1 = D2, f1 = f2 and c1 + c2 = 1 this is exactly classic
// Gray-Scott. Either A can feed the B-making reaction; they differ in how
// fast they diffuse (and optionally how eagerly they react and are resupplied).

export const DEFAULTS = {
  f1: 0.0367, f2: 0.0367, k: 0.0649,
  D1: 0.21, D2: 0.05, DB: 0.105,
  c1: 0.5, c2: 0.5,
};

// Forward Euler with dt = 1 and the 5-point laplacian is stable for D <= 0.25.
export const DMAX = 0.25;

export class Sim {
  constructor(w, h) {
    this.w = w; this.h = h;
    const n = w * h;
    this.a1 = new Float32Array(n); this.a2 = new Float32Array(n); this.b = new Float32Array(n);
    this.na1 = new Float32Array(n); this.na2 = new Float32Array(n); this.nb = new Float32Array(n);
    this.p = { ...DEFAULTS };
    this.reset();
  }

  reset(seed = 1) {
    const { w, h } = this;
    this.a1.fill(1); this.a2.fill(1); this.b.fill(0);
    let s = seed >>> 0 || 1;
    const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    // a few random blobs of B, each also draining both A's
    for (let i = 0; i < 9; i++) {
      this.paint(Math.floor(rnd() * w), Math.floor(rnd() * h), 5 + Math.floor(rnd() * 4));
    }
    this.paint(w >> 1, h >> 1, 8);
  }

  paint(cx, cy, r) {
    const { w, h } = this;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r) continue;
      const i = ((cy + y + h) % h) * w + ((cx + x + w) % w);
      this.b[i] = 0.25; this.a1[i] = 0.5; this.a2[i] = 0.5;
    }
  }

  step(n = 1) {
    const { w, h } = this;
    const { f1, f2, k, D1, D2, DB, c1, c2 } = this.p;
    const kill = k + (f1 + f2) / 2;
    for (let it = 0; it < n; it++) {
      const a1 = this.a1, a2 = this.a2, b = this.b;
      const n1 = this.na1, n2 = this.na2, nb = this.nb;
      for (let y = 0; y < h; y++) {
        const ro = y * w, up = ((y + h - 1) % h) * w, dn = ((y + 1) % h) * w;
        for (let x = 0; x < w; x++) {
          const i = ro + x, l = ro + (x + w - 1) % w, r = ro + (x + 1) % w;
          const A1 = a1[i], A2 = a2[i], B = b[i];
          const bb = B * B;
          const r1 = c1 * A1 * bb, r2 = c2 * A2 * bb;
          n1[i] = A1 + D1 * (a1[l] + a1[r] + a1[up + x] + a1[dn + x] - 4 * A1) - 2 * r1 + f1 * (1 - A1);
          n2[i] = A2 + D2 * (a2[l] + a2[r] + a2[up + x] + a2[dn + x] - 4 * A2) - 2 * r2 + f2 * (1 - A2);
          nb[i] = B + DB * (b[l] + b[r] + b[up + x] + b[dn + x] - 4 * B) + r1 + r2 - kill * B;
        }
      }
      this.a1 = n1; this.a2 = n2; this.b = nb;
      this.na1 = a1; this.na2 = a2; this.nb = b;
    }
  }

  stats() {
    let sb = 0, lo = Infinity, hi = -Infinity;
    for (let i = 0; i < this.b.length; i++) {
      const v = this.b[i];
      if (!(v === v)) return { mean: NaN, min: NaN, max: NaN };
      sb += v; if (v < lo) lo = v; if (v > hi) hi = v;
    }
    return { mean: sb / this.b.length, min: lo, max: hi };
  }

  // Fill an RGBA Uint8ClampedArray. Modes:
  //  "mix"  – brightness follows B; hue shows which A is being eaten more
  //  "b"    – plain B, ink on paper
  //  "a1"/"a2" – the A fields themselves
  render(out, mode = "mix") {
    const n = this.w * this.h;
    for (let i = 0; i < n; i++) {
      const B = this.b[i], A1 = this.a1[i], A2 = this.a2[i];
      let r, g, bl;
      if (mode === "b") {
        const t = Math.min(1, B * 2.6);
        r = 244 - 214 * t; g = 240 - 200 * t; bl = 228 - 170 * t;
      } else if (mode === "a1" || mode === "a2") {
        const t = 1 - (mode === "a1" ? A1 : A2);
        const u = Math.min(1, t * 1.6);
        r = 14 + 240 * u * (mode === "a1" ? 1 : 0.35); g = 16 + 150 * u; bl = 30 + 200 * u * (mode === "a1" ? 0.4 : 1);
      } else {
        // d1/d2: how much of each A has been used up here
        const d1 = 1 - A1, d2 = 1 - A2;
        const tot = d1 + d2 + 1e-4;
        const share = d1 / tot;                  // 1 = all A1, 0 = all A2
        const v = Math.min(1, B * 2.8);
        const glow = Math.min(1, (d1 + d2) * 0.9);
        // A1 -> amber, A2 -> cyan, B -> white-hot core
        const baseR = 255 * share * 0.95 + 40 * (1 - share);
        const baseG = 150 * share + 200 * (1 - share);
        const baseB = 40 * share + 255 * (1 - share);
        const m = Math.max(v, glow * 0.55);
        r = 10 + (baseR - 10) * m + 60 * v * v; g = 12 + (baseG - 12) * m + 70 * v * v; bl = 24 + (baseB - 24) * m + 60 * v * v;
      }
      const o = i * 4;
      out[o] = r; out[o + 1] = g; out[o + 2] = bl; out[o + 3] = 255;
    }
  }
}

// Each of these was run for 8000 steps on a 128² grid and still had live B.
export const PRESETS = {
  "classic (A1 = A2)": { f1: 0.0367, f2: 0.0367, k: 0.0649, D1: 0.21, D2: 0.21, DB: 0.105, c1: 0.5, c2: 0.5 },
  "mitosis, slow A2": { f1: 0.0367, f2: 0.0367, k: 0.0649, D1: 0.21, D2: 0.15, DB: 0.105, c1: 0.5, c2: 0.5 },
  "maze, two diets": { f1: 0.029, f2: 0.029, k: 0.057, D1: 0.21, D2: 0.1, DB: 0.105, c1: 0.5, c2: 0.5 },
  "maze, A2 fed slower": { f1: 0.022, f2: 0.036, k: 0.057, D1: 0.21, D2: 0.1, DB: 0.105, c1: 0.5, c2: 0.5 },
  "coral": { f1: 0.0545, f2: 0.0545, k: 0.062, D1: 0.21, D2: 0.12, DB: 0.105, c1: 0.5, c2: 0.5 },
  "sparse spots": { f1: 0.025, f2: 0.05, k: 0.06, D1: 0.21, D2: 0.1, DB: 0.105, c1: 0.5, c2: 0.5 },
};
