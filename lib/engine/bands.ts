/** Polygonal bands and crossing ends adapted from Taprats Outline/Interlace.
 * Underpasses terminate at the neighboring band's edge; no painted cutout. */
import type { Geometry, Point, Style } from './types';
import { add, sub, mul, normalize, distance, dot, key } from './geometry';
export type Band = { points: Point[]; shadows: Point[][] };
export function joinPoint(
  center: Point,
  a: Point,
  b: Point,
  width: number,
): Point | null {
  let sweep =
    Math.atan2(b.y - center.y, b.x - center.x) -
    Math.atan2(a.y - center.y, a.x - center.x);
  while (sweep < 0) sweep += Math.PI * 2;
  if (Math.abs(Math.sin(sweep)) < 1e-7) return null;
  return sub(
    center,
    mul(
      add(normalize(sub(center, a)), normalize(sub(center, b))),
      width / Math.sin(sweep),
    ),
  );
}
export function shadeColor(
  color: string,
  saturation: number,
  brightness: number,
): string {
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)),
    max = Math.max(...rgb);
  return (
    '#' +
    rgb
      .map((c) =>
        Math.max(
          0,
          Math.min(
            255,
            Math.round(brightness * (max - saturation * (max - c))),
          ),
        )
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
export function bandPolygons(g: Geometry, s: Style): Band[] {
  const width = s.width / 2,
    weave = s.kind === 'interlace',
    crossings = new Map(g.crossings.map((c) => [key(c.point), c]));
  const other = (edge: number, node: number) =>
    g.edges[edge].a === node ? g.edges[edge].b : g.edges[edge].a;
  function end(
    edge: number,
    from: number,
    to: number,
  ): { points: Point[]; shadow: boolean } {
    const p = g.nodes[from].point,
      q = g.nodes[to].point,
      dir = normalize(sub(q, p)),
      normal = { x: -dir.y, y: dir.x },
      neighbors = g.nodes[to].edges,
      n = neighbors.length,
      index = neighbors.indexOf(edge);
    let lo = sub(q, mul(normal, width)),
      mid = q,
      hi = add(q, mul(normal, width)),
      shadow = false;
    if (n === 1) {
      if (weave) {
        lo = add(lo, mul(dir, width));
        mid = add(mid, mul(dir, width));
        hi = add(hi, mul(dir, width));
      }
    } else if (n === 2) {
      const next = g.nodes[other(neighbors[(index + 1) % n], to)].point,
        j = joinPoint(q, p, next, width);
      if (j) {
        lo = j;
        hi = sub(mul(q, 2), j);
      }
    } else {
      const crossing = crossings.get(key(q));
      const overIndex = crossing
        ? neighbors.reduce((best, e, i) => {
            const d = normalize(sub(g.nodes[other(e, to)].point, q));
            const old = normalize(
              sub(g.nodes[other(neighbors[best], to)].point, q),
            );
            return dot(d, crossing.over) > dot(old, crossing.over) ? i : best;
          }, 0)
        : -1;
      if (weave && n === 4 && index % 2 === overIndex % 2) {
        const next = g.nodes[other(neighbors[(index + 2) % n], to)].point;
        lo = joinPoint(q, p, next, width) || lo;
        hi = sub(mul(q, 2), lo);
      } else {
        const before = g.nodes[other(neighbors[(index + n - 1) % n], to)].point,
          after = g.nodes[other(neighbors[(index + 1) % n], to)].point;
        lo = joinPoint(q, p, after, width) || lo;
        hi = joinPoint(q, before, p, width) || hi;
        if (weave && n === 4) {
          mid =
            joinPoint(q, before, after, width) ||
            sub(
              q,
              mul(
                normalize({ x: -(after.y - before.y), y: after.x - before.x }),
                width,
              ),
            );
          if (s.gap > 0) {
            lo = sub(lo, mul(dir, Math.min(s.gap, distance(lo, p))));
            hi = sub(hi, mul(dir, Math.min(s.gap, distance(hi, p))));
            mid = sub(mid, mul(dir, Math.min(s.gap, distance(mid, p))));
          }
          shadow = true;
        }
      }
    }
    return { points: [lo, mid, hi], shadow };
  }
  const towards = (a: Point, b: Point) =>
    add(a, mul(normalize(sub(b, a)), Math.min(s.shadowWidth, distance(a, b))));
  return g.edges.map((e, i) => {
    const b = end(i, e.a, e.b),
      a = end(i, e.b, e.a),
      p = [...b.points, ...a.points],
      shadows: Point[][] = [];
    if (s.shadowWidth > 0 && b.shadow)
      shadows.push([towards(p[2], p[3]), p[2], p[0], towards(p[0], p[5])]);
    if (s.shadowWidth > 0 && a.shadow)
      shadows.push([towards(p[3], p[2]), p[3], p[5], towards(p[5], p[0])]);
    return { points: p, shadows };
  });
}
export function embossedFaces(
  points: Point[],
  color: string,
  light: number,
): { points: Point[]; color: string }[] {
  const faces = [
      [points[1], points[2], points[3], points[4]],
      [points[4], points[5], points[0], points[1]],
    ],
    angle = (light * Math.PI) / 180;
  return faces.map((p) => {
    const d = normalize(sub(p[0], p[3])),
      normal = { x: -d.y, y: d.x },
      level =
        Math.floor(
          16 *
            0.5 *
            (normal.x * Math.cos(angle) + normal.y * Math.sin(angle) + 1),
        ) / 16;
    return {
      points: p,
      color: shadeColor(color, 0.7 + level * 0.29, 0.4 + level * 0.59),
    };
  });
}
