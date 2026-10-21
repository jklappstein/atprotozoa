// Ternary (simplex) math. Triangle corners: melody top, harmony bottom-left, rhythm bottom-right.
export const SQ3 = Math.sqrt(3) / 2;

export function normalize(m, h, r) {
  const s = m + h + r;
  if (!(s > 0)) return [1 / 3, 1 / 3, 1 / 3];
  return [m / s, h / s, r / s];
}

// Barycentric -> unit-triangle cartesian (x right, y DOWN, triangle width 1, height SQ3).
export function toXY([m, h, r]) {
  return [r + m / 2, (1 - m) * SQ3];
}

// Inverse of toXY. Returns null when the point is outside the triangle.
export function fromXY(x, y) {
  const m = 1 - y / SQ3;
  const r = x - m / 2;
  const h = 1 - m - r;
  const eps = 1e-9;
  if (m < -eps || r < -eps || h < -eps) return null;
  return [Math.max(0, m), Math.max(0, h), Math.max(0, r)];
}

export function dist(a, b) {
  const [ax, ay] = toXY(a), [bx, by] = toXY(b);
  return Math.hypot(ax - bx, ay - by);
}
