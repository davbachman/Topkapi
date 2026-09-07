/** Radial star/rosette constructions follow Craig S. Kaplan's Taprats algorithms.
 * Reimplemented with value objects; no Java runtime or serialized classes. */
import type { Point, Segment, Motif, Tile } from './types';
import { clipToTile } from './construction';
import {
  polygonStar,
  polygonRosette,
  polygonRays,
  segmentHit,
} from './advanced';
import {
  add,
  sub,
  mul,
  arc,
  rotate,
  normalize,
  intersection,
  mix,
  area,
  inside,
  cleanSegments,
  centroid,
  distance,
} from './geometry';
const p = (x: number, y: number): Point => ({ x, y });
function radial(unit: Segment[], n: number) {
  return cleanSegments(
    Array.from({ length: n }, (_, i) =>
      unit.map((s) => ({
        a: rotate(s.a, (i * 2 * Math.PI) / n),
        b: rotate(s.b, (i * 2 * Math.PI) / n),
      })),
    ).flat(),
  );
}
function mirroredChain(points: Point[]): Segment[] {
  const lines: Segment[] = [];
  for (let i = 1; i < points.length; i++) {
    lines.push(
      { a: points[i - 1], b: points[i] },
      {
        a: p(points[i - 1].x, -points[i - 1].y),
        b: p(points[i].x, -points[i].y),
      },
    );
  }
  return lines;
}
export function star(n: number, d: number, s: number): Segment[] {
  d = Math.max(1, Math.min(d, n / 2 - 0.01));
  let floor = Math.floor(d),
    frac = d - floor;
  let integral = false;
  if (frac < 1e-7) {
    frac = 0;
    integral = true;
  } else if (1 - frac < 1e-7) {
    floor++;
    frac = 0;
    integral = true;
  }
  const count = Math.min(s, floor - 1),
    points = [p(1, 0)],
    end = arc(d / n);
  for (let i = 1; i <= count; i++) {
    const hit = intersection(points[0], end, arc(i / n), arc((i - d) / n));
    if (hit) points.push(hit.point);
  }
  const lines = mirroredChain(points),
    last = points[points.length - 1];
  if (Math.min(s, floor) === floor) {
    const next = rotate(last, (2 * Math.PI) / n);
    if (integral) lines.push({ a: last, b: next });
    else {
      const hit = intersection(
        arc(Math.floor(d) / n),
        arc(-frac / n),
        points[0],
        end,
      );
      if (hit) lines.push({ a: last, b: hit.point }, { a: hit.point, b: next });
    }
  }
  return radial(lines, n);
}
function rosetteUnit(n: number, q: number, s: number): Segment[] {
  q = Math.max(-0.99, Math.min(0.99, q));
  s = Math.min(s, Math.floor((n - 1) / 2));
  const tip = p(1, 0),
    next = arc(1 / n),
    r = 1 / Math.cos(Math.PI / n),
    corner = mul(arc(0.5 / n), r),
    half = mul(sub(corner, p(0, r)), 0.5),
    knee = add(corner, mul(normalize(corner), -corner.y));
  let a = Math.atan2(next.y, next.x - 1);
  const ka = Math.atan2(knee.y, knee.x - 1);
  a = q >= 0 ? a * (1 - q) + (Math.PI / 2) * q : a * (1 + q) - ka * q;
  const hit = intersection(tip, p(1 + Math.cos(a), Math.sin(a)), corner, half);
  if (!hit) return [];
  const h = hit.point,
    long = mix(h, knee, 10),
    points = [tip, h];
  let lo = p(h.x, -h.y),
    hi = p(long.x, -long.y);
  for (let i = 1; i <= s; i++) {
    lo = rotate(lo, (2 * Math.PI) / n);
    hi = rotate(hi, (2 * Math.PI) / n);
    const at = intersection(h, long, lo, hi);
    if (at) points.push(at.point);
  }
  return mirroredChain(points);
}
export function rosette(n: number, q: number, s: number): Segment[] {
  return radial(rosetteUnit(n, q, s), n);
}
/** Hankin construction: pair equal-distance inward rays from edge midpoints.
 * Angle 54 degrees is the standard decagonal Girih boundary angle. */
export function hankin(poly: Point[], degrees: number): Segment[] {
  if (area(poly) < 0) poly = [...poly].reverse();
  const rays: { start: Point; direction: Point; edge: number }[] = [];
  const angle = (degrees * Math.PI) / 180;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length],
      m = mix(a, b, 0.5),
      v = normalize(sub(b, a));
    rays.push(
      { start: m, direction: rotate(v, angle), edge: i },
      { start: m, direction: rotate(v, Math.PI - angle), edge: i },
    );
  }
  const candidates: { i: number; j: number; at: Point; cost: number }[] = [];
  for (let i = 0; i < rays.length; i++)
    for (let j = i + 1; j < rays.length; j++) {
      const a = rays[i],
        b = rays[j];
      if (a.edge === b.edge) continue;
      const hit = intersection(
        a.start,
        add(a.start, a.direction),
        b.start,
        add(b.start, b.direction),
      );
      if (!hit || hit.t < 1e-6 || hit.u < 1e-6 || !inside(hit.point, poly))
        continue;
      candidates.push({
        i,
        j,
        at: hit.point,
        cost: Math.abs(hit.t - hit.u) * 20 + hit.t + hit.u,
      });
    }
  candidates.sort((a, b) => a.cost - b.cost);
  const used = new Set<number>(),
    lines: Segment[] = [];
  for (const c of candidates)
    if (!used.has(c.i) && !used.has(c.j)) {
      used.add(c.i);
      used.add(c.j);
      lines.push(
        { a: rays[c.i].start, b: c.at },
        { a: rays[c.j].start, b: c.at },
      );
    }
  return cleanSegments(lines);
}
export function makeMotif(tile: Tile, m: Motif): Segment[] {
  if (m.kind === 'custom') {
    const c = centroid(tile.points);
    return cleanSegments(
      clipToTile(
        Array.from({ length: m.symmetry }, (_, i) =>
          m.lines.flatMap((s) => {
            const spin = (a: Point) =>
              add(c, rotate(sub(a, c), (2 * Math.PI * i) / m.symmetry));
            const line = { a: spin(s.a), b: spin(s.b) };
            return m.reflect
              ? [
                  line,
                  {
                    a: spin(p(s.a.x, 2 * c.y - s.a.y)),
                    b: spin(p(s.b.x, 2 * c.y - s.b.y)),
                  },
                ]
              : [line];
          }),
        ).flat(),
        tile.points,
      ),
    );
  }
  if (m.kind === 'hankin') return hankin(tile.points, m.angle);
  if (m.kind === 'girih' || m.kind === 'intersect')
    return polygonRays(tile.points, m);
  if (m.kind === 'hourglass') return polygonStar(tile.points, m.d, m.s, true);
  if (!tile.regular)
    return m.kind === 'star'
      ? polygonStar(tile.points, m.d, m.s)
      : polygonRosette(tile.points, m.q, m.s, m.r);
  const n = tile.points.length,
    canonical =
      m.kind === 'star'
        ? star(n, m.d, m.s)
        : m.kind === 'extended'
          ? extendedRosette(n, m.q, m.s)
          : rosette(n, m.q, m.s);
  const center = centroid(tile.points),
    mid = mix(tile.points[0], tile.points[1], 0.5),
    radius = distance(center, mid),
    theta = Math.atan2(mid.y - center.y, mid.x - center.x);
  const tr = (a: Point) => add(center, mul(rotate(a, theta), radius));
  return canonical.map((s) => ({ a: tr(s.a), b: tr(s.b) }));
}

/** Connected rosette: extend a scaled radial unit and normalize its new tip. */
export function extendedRosette(n: number, q: number, s: number): Segment[] {
  const original = rosetteUnit(n, q, s),
    tip = { x: 1, y: 0 };
  const low = original
    .flatMap((edge) =>
      distance(edge.a, tip) < 1e-7
        ? [edge.b]
        : distance(edge.b, tip) < 1e-7
          ? [edge.a]
          : [],
    )
    .find((p) => p.y < 0);
  if (!low) return radial(original, n);
  const end = add(tip, mul(normalize(sub(tip, low)), 100)),
    reflected = { x: end.x, y: -end.y },
    hit = segmentHit(
      tip,
      end,
      rotate(tip, (2 * Math.PI) / n),
      rotate(reflected, (2 * Math.PI) / n),
    );
  const scale = hit ? Math.cos(Math.PI / n) / Math.hypot(hit.x, hit.y) : 1;
  let unit = original.map((edge) => ({
    a: mul(edge.a, scale),
    b: mul(edge.b, scale),
  }));
  if (Math.abs(scale - 1) > 1e-7) {
    const start = mul(tip, scale),
      ray = add(start, mul(normalize(sub(tip, low)), 100)),
      border = Array.from({ length: n }, (_, i) => arc(i / n));
    const endpoint =
      border
        .map((p, i) => segmentHit(start, ray, p, border[(i + 1) % n]))
        .find(Boolean) || start;
    let a = rotate(start, (2 * Math.PI) / n),
      b = rotate({ x: endpoint.x, y: -endpoint.y }, (2 * Math.PI) / n),
      last = start;
    for (let i = 0; i < Math.floor((n + 1) / 2); i++) {
      const meet = segmentHit(start, endpoint, a, b);
      if (!meet) break;
      unit.push(...mirroredChain([last, meet]));
      last = meet;
      a = rotate(a, (2 * Math.PI) / n);
      b = rotate(b, (2 * Math.PI) / n);
    }
    unit.push(...mirroredChain([last, endpoint]));
  }
  // Move the upper half to the adjacent sector, as in Taprats ConnectFigure.
  unit = unit
    .filter((e) => !(e.a.y > 1e-7 || e.b.y > 1e-7))
    .concat(
      unit
        .filter((e) => e.a.y >= -1e-7 && e.b.y >= -1e-7)
        .map((e) => ({
          a: rotate(e.a, (-2 * Math.PI) / n),
          b: rotate(e.b, (-2 * Math.PI) / n),
        })),
    );
  if (Math.abs(scale - 1) > 1e-7)
    unit = unit.map((e) => ({
      a: rotate(e.a, Math.PI / n),
      b: rotate(e.b, Math.PI / n),
    }));
  const max = Math.max(...unit.flatMap((e) => [e.a.x, e.b.x]));
  return radial(
    unit.map((e) => ({ a: mul(e.a, 1 / max), b: mul(e.b, 1 / max) })),
    n,
  );
}
