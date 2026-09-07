import type { Bounds, Point, Segment } from './types';
import {
  EPS,
  sub,
  compose,
  transformation,
  area,
  distance,
  inside,
  intersection,
  mix,
  pointSegment,
} from './geometry';

export function polygonError(points: Point[]): string | null {
  if (points.length < 3) return 'A tile needs at least three vertices.';
  if (Math.abs(area(points)) < EPS)
    return 'The polygon must have a nonzero area.';
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (distance(a, b) < EPS) return 'Adjacent vertices must be distinct.';
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      const c = points[j],
        d = points[(j + 1) % points.length];
      const hit = intersection(a, b, c, d);
      if (
        hit &&
        hit.t >= -EPS &&
        hit.t <= 1 + EPS &&
        hit.u >= -EPS &&
        hit.u <= 1 + EPS
      )
        return 'Tile edges must not cross or touch other edges.';
      if (
        !hit &&
        (pointSegment(c, { a, b }).distance < EPS ||
          pointSegment(a, { a: c, b: d }).distance < EPS)
      )
        return 'Tile edges must not overlap.';
    }
  }
  return null;
}

/** Prefer exact construction points to grid points so neighboring tiles connect. */
export function snapPoint(
  p: Point,
  targets: Point[],
  grid: number,
  tolerance: number,
): Point {
  let best: Point | undefined,
    near = tolerance;
  for (const target of targets) {
    const d = distance(p, target);
    if (d < near) {
      best = target;
      near = d;
    }
  }
  return best
    ? { ...best }
    : grid > 0
      ? { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid }
      : p;
}

/** Liang–Barsky clipping, including lines parallel to a crop edge. */
export function clipSegment(s: Segment, r: Bounds): Segment | null {
  const dx = s.b.x - s.a.x,
    dy = s.b.y - s.a.y;
  let lo = 0,
    hi = 1;
  const ps = [-dx, dx, -dy, dy],
    qs = [s.a.x - r.minX, r.maxX - s.a.x, s.a.y - r.minY, r.maxY - s.a.y];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(ps[i]) < 1e-12) {
      if (qs[i] < 0) return null;
    } else {
      const t = qs[i] / ps[i];
      if (ps[i] < 0) lo = Math.max(lo, t);
      else hi = Math.min(hi, t);
    }
  }
  return hi - lo > EPS ? { a: mix(s.a, s.b, lo), b: mix(s.a, s.b, hi) } : null;
}

export function clipPolygon(poly: Point[], r: Bounds): Point[] {
  let out = poly;
  for (const [axis, value, sign] of [
    ['x', r.minX, 1],
    ['x', r.maxX, -1],
    ['y', r.minY, 1],
    ['y', r.maxY, -1],
  ] as const) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i],
        b = input[(i + 1) % input.length];
      const ai = sign * (a[axis] - value) >= 0,
        bi = sign * (b[axis] - value) >= 0;
      if (ai) out.push(a);
      if (ai !== bi)
        out.push(mix(a, b, (value - a[axis]) / (b[axis] - a[axis])));
    }
  }
  return out.filter((p, i) => distance(p, out[(i + 1) % out.length]) > EPS);
}

export function clipToTile(lines: Segment[], poly: Point[]): Segment[] {
  return lines.flatMap((s) => {
    const ts = [0, 1];
    for (let i = 0; i < poly.length; i++) {
      const h = intersection(s.a, s.b, poly[i], poly[(i + 1) % poly.length]);
      if (h && h.t > EPS && h.t < 1 - EPS && h.u >= -EPS && h.u <= 1 + EPS)
        ts.push(h.t);
    }
    ts.sort((a, b) => a - b);
    const result: Segment[] = [];
    for (let i = 1; i < ts.length; i++) {
      const mid = mix(s.a, s.b, (ts[i] + ts[i - 1]) / 2);
      if (
        inside(mid, poly) ||
        poly.some(
          (p, j) =>
            pointSegment(mid, { a: p, b: poly[(j + 1) % poly.length] })
              .distance < EPS,
        )
      )
        result.push({ a: mix(s.a, s.b, ts[i - 1]), b: mix(s.a, s.b, ts[i]) });
    }
    return result;
  });
}

/** Ear clipping preserves concave face boundaries for DXF 3DFACE export. */
export function triangulate(poly: Point[]): Point[][] {
  const points = area(poly) < 0 ? [...poly].reverse() : [...poly],
    triangles: Point[][] = [];
  const turn = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  while (points.length > 3) {
    let ear = false;
    for (let i = 0; i < points.length; i++) {
      const a = points[(i + points.length - 1) % points.length],
        b = points[i],
        c = points[(i + 1) % points.length];
      if (Math.abs(turn(a, b, c)) < EPS) {
        points.splice(i, 1);
        ear = true;
        break;
      }
      if (turn(a, b, c) < 0) continue;
      if (
        points.some(
          (p) =>
            p !== a &&
            p !== b &&
            p !== c &&
            turn(a, b, p) >= -EPS &&
            turn(b, c, p) >= -EPS &&
            turn(c, a, p) >= -EPS,
        )
      )
        continue;
      triangles.push([a, b, c]);
      points.splice(i, 1);
      ear = true;
      break;
    }
    if (!ear)
      throw Error(
        'A region could not be triangulated. Export closed outlines instead.',
      );
  }
  if (points.length === 3 && Math.abs(area(points)) > EPS)
    triangles.push(points);
  return triangles;
}

/** Match source edge to a reversed destination edge, including its length. */
export function matchEdge(
  a: Point,
  b: Point,
  toA: Point,
  toB: Point,
): import('./types').Matrix {
  const from = sub(b, a),
    to = sub(toB, toA),
    scale = distance(toA, toB) / distance(a, b);
  if (!Number.isFinite(scale) || scale < 1e-8)
    throw Error('Choose two nonzero edges.');
  return compose(
    transformation(
      toA.x,
      toA.y,
      Math.atan2(to.y, to.x) - Math.atan2(from.y, from.x),
      scale,
    ),
    transformation(-a.x, -a.y),
  );
}
