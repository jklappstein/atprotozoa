// Skilling's "Programming the Hilbert curve" (2004), index -> axes direction.
// Maps a position h along an n-dimensional Hilbert curve of order p (side
// 2^p) to integer coordinates, writing them into `out` (length n).
// Requires n*p <= 31 so h and the interleaved bits stay in int32.
export function hilbertAxes(h, n, p, out) {
  // de-interleave: the top bit of h is the top bit of X[0], the next is the
  // top bit of X[1], and so on round-robin.
  for (let j = 0; j < n; j++) out[j] = 0;
  for (let b = 0; b < p; b++) {
    for (let j = 0; j < n; j++) {
      const pos = b * n + (n - 1 - j);
      out[j] |= ((h >>> pos) & 1) << b;
    }
  }
  const N = 2 << (p - 1);
  let t = out[n - 1] >>> 1;
  for (let i = n - 1; i > 0; i--) out[i] ^= out[i - 1];
  out[0] ^= t;
  for (let Q = 2; Q !== N; Q <<= 1) {
    const P = Q - 1;
    for (let i = n - 1; i >= 0; i--) {
      if (out[i] & Q) out[0] ^= P;
      else {
        t = (out[0] ^ out[i]) & P;
        out[0] ^= t;
        out[i] ^= t;
      }
    }
  }
  return out;
}
