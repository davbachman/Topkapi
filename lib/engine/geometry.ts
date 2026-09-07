import type { Point, Matrix, Segment, Bounds } from './types';
export const EPS = 1e-7;
export const IDENTITY: Matrix = [1, 0, 0, 0, 1, 0];
export const add = (a: Point, b: Point): Point => ({
  x: a.x + b.x,
  y: a.y + b.y,
});
export const sub = (a: Point, b: Point): Point => ({
  x: a.x - b.x,
  y: a.y - b.y,
});
export const mul = (p: Point, k: number): Point => ({ x: p.x * k, y: p.y * k });
export const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
export const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
export const length = (p: Point) => Math.hypot(p.x, p.y);
export const distance = (a: Point, b: Point) => length(sub(a, b));
export const normalize = (p: Point) => mul(p, 1 / (length(p) || 1));
export const mix = (a: Point, b: Point, t: number) => add(a, mul(sub(b, a), t));
export const rotate = (p: Point, a: number): Point => ({
  x: p.x * Math.cos(a) - p.y * Math.sin(a),
  y: p.x * Math.sin(a) + p.y * Math.cos(a),
});
export const arc = (t: number): Point => ({
  x: Math.cos(t * Math.PI * 2),
  y: Math.sin(t * Math.PI * 2),
});
export const key = (p: Point) =>
  `${Math.round(p.x / EPS)},${Math.round(p.y / EPS)}`;
export function apply(m: Matrix, p: Point): Point {
  return {
    x: m[0] * p.x + m[1] * p.y + m[2],
    y: m[3] * p.x + m[4] * p.y + m[5],
  };
}
export function compose(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[1] * b[3],
    a[0] * b[1] + a[1] * b[4],
    a[0] * b[2] + a[1] * b[5] + a[2],
    a[3] * b[0] + a[4] * b[3],
    a[3] * b[1] + a[4] * b[4],
    a[3] * b[2] + a[4] * b[5] + a[5],
  ];
}
export function inverse(m: Matrix): Matrix {
  const d = m[0] * m[4] - m[1] * m[3];
  if (Math.abs(d) < 1e-12) throw Error('Degenerate transform');
  return [
    m[4] / d,
    -m[1] / d,
    (m[1] * m[5] - m[4] * m[2]) / d,
    -m[3] / d,
    m[0] / d,
    (m[3] * m[2] - m[0] * m[5]) / d,
  ];
}
export function transformation(
  x: number,
  y: number,
  radians = 0,
  scale = 1,
): Matrix {
  const c = Math.cos(radians) * scale,
    s = Math.sin(radians) * scale;
  return [c, -s, x, s, c, y];
}
export function around(center: Point, radians: number, scale = 1): Matrix {
  return compose(
    transformation(center.x, center.y, radians, scale),
    transformation(-center.x, -center.y),
  );
}
export function bounds(points: Point[]): Bounds {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}
export function overlaps(a: Bounds, b: Bounds) {
  return (
    a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
  );
}
export function area(p: Point[]) {
  return p.reduce((s, a, i) => s + cross(a, p[(i + 1) % p.length]), 0) / 2;
}
export function centroid(p: Point[]): Point {
  return mul(p.reduce(add, { x: 0, y: 0 }), 1 / p.length);
}
export function inside(p: Point, poly: Point[]) {
  let yes = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      yes = !yes;
  }
  return yes;
}
export function intersection(a: Point, b: Point, c: Point, d: Point) {
  const r = sub(b, a),
    s = sub(d, c),
    den = cross(r, s);
  if (Math.abs(den) < 1e-12) return null;
  const t = cross(sub(c, a), s) / den,
    u = cross(sub(c, a), r) / den;
  return { point: add(a, mul(r, t)), t, u };
}
export function pointSegment(p: Point, s: Segment) {
  const v = sub(s.b, s.a);
  const t = Math.max(0, Math.min(1, dot(sub(p, s.a), v) / (dot(v, v) || 1)));
  return {
    distance: distance(p, mix(s.a, s.b, t)),
    point: mix(s.a, s.b, t),
    t,
  };
}
export function regular(n: number): Point[] {
  return Array.from({ length: n }, (_, i) =>
    mul(arc((i + 0.5) / n), 1 / Math.cos(Math.PI / n)),
  );
}
export function cleanSegments(lines: Segment[]): Segment[] {
  const out = new Map<string, Segment>();
  for (const s of lines) {
    if (
      ![s.a.x, s.a.y, s.b.x, s.b.y].every(Number.isFinite) ||
      distance(s.a, s.b) < EPS
    )
      continue;
    const a = key(s.a),
      b = key(s.b);
    out.set(a < b ? `${a}:${b}` : `${b}:${a}`, s);
  }
  return [...out.values()];
}
