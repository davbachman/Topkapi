/** Polygon constructions adapted from Taprats / Alhambra (GPL-2.0-or-later).
 * See THIRD-PARTY-NOTICES.md for authorship and source revisions. */
import type { Layer, Matrix, Motif, Point, Segment, Tile } from './types';
import {
  add,
  apply,
  around,
  area,
  centroid,
  cleanSegments,
  compose,
  cross,
  distance,
  dot,
  IDENTITY,
  inside,
  intersection,
  inverse,
  key,
  mix,
  mul,
  normalize,
  pointSegment,
  rotate,
  sub,
  transformation,
} from './geometry';
const midpoints = (p: Point[]) =>
  p.map((a, i) => mix(a, p[(i + 1) % p.length], 0.5));
export function segmentHit(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): Point | null {
  const h = intersection(a, b, c, d);
  return h &&
    h.t >= -1e-7 &&
    h.t <= 1.0000001 &&
    h.u >= -1e-7 &&
    h.u <= 1.0000001
    ? h.point
    : null;
}
function polygonArc(frac: number, ps: Point[]): Point {
  frac = ((frac % 1) + 1) % 1;
  const pos = frac * ps.length,
    prev = Math.floor(pos + 0.01) % ps.length,
    next = Math.ceil(pos - 0.01) % ps.length;
  return mix(ps[prev], ps[next], pos - prev);
}
const chain = (points: Point[]): Segment[] =>
  points.slice(1).map((b, i) => ({ a: points[i], b }));
function branch(
  d: number,
  s: number,
  frac: number,
  sign: number,
  mid: Point[],
) {
  const n = mid.length,
    clamped = Math.max(1, Math.min(d, n / 2 - 0.01)),
    di = Math.floor(clamped + 0.01),
    count = Math.min(s, di - 1),
    a = polygonArc(frac, mid),
    b = polygonArc(frac + (sign * clamped) / n, mid),
    points = [a];
  for (let i = 1; i <= count; i++) {
    const h = segmentHit(
      a,
      b,
      polygonArc(frac + (sign * i) / n, mid),
      polygonArc(frac + (sign * (i - clamped)) / n, mid),
    );
    if (h) points.push(h);
  }
  return points;
}
function halfStar(
  d: number,
  s: number,
  frac: number,
  sign: number,
  mid: Point[],
) {
  const points = branch(d, s, frac, sign, mid),
    lines = chain(points),
    n = mid.length,
    clamped = Math.max(1, Math.min(d, n / 2 - 0.01)),
    di = Math.floor(clamped + 0.01),
    df = clamped - di;
  if (Math.min(s, di) === di && sign > 0) {
    const next = branch(d, s, frac + sign / n, sign, mid).at(-1)!;
    if (Math.abs(df) < 1e-7) lines.push({ a: points.at(-1)!, b: next });
    else {
      const h = segmentHit(
        polygonArc(frac + (sign * di) / n, mid),
        polygonArc(frac - (sign * df) / n, mid),
        points[0],
        polygonArc(frac + (sign * clamped) / n, mid),
      );
      if (h) lines.push({ a: points.at(-1)!, b: h }, { a: h, b: next });
    }
  }
  return lines;
}
export function polygonStar(
  poly: Point[],
  d: number,
  s: number,
  hourglass = false,
): Segment[] {
  const mid = midpoints(poly),
    mod = mid.length % 2 ? mid.length : mid.length / 2,
    top = s % mod;
  return cleanSegments(
    mid.flatMap((_, i) => [
      ...halfStar(
        hourglass && i % mod === top ? 1 : d,
        hourglass ? 1 : s,
        i / mid.length,
        1,
        mid,
      ),
      ...halfStar(
        hourglass && (i + mid.length - 1) % mod === top ? 1 : d,
        hourglass ? 1 : s,
        i / mid.length,
        -1,
        mid,
      ),
    ]),
  );
}
export function polygonRosette(
  poly: Point[],
  q: number,
  s: number,
  r: number,
): Segment[] {
  const center = centroid(poly),
    points = poly.map((p) => sub(p, center)),
    mid = midpoints(points),
    n = poly.length;
  function branch(frac: number, sign: number) {
    const tip = polygonArc(frac, mid),
      next = polygonArc(frac + sign / n, mid),
      up = polygonArc(frac + (sign > 0 ? 1 / n : 0), points),
      down = polygonArc(frac + (sign > 0 ? 0 : 1 / n), points),
      bisector = add(up, mul(sub(mul(down, 0.5), up), 10));
    const e = segmentHit(up, bisector, tip, next) || mul(up, 0.5),
      ad = segmentHit(up, bisector, tip, { x: 0, y: 0 }) || { x: 0, y: 0 };
    return [tip, q >= 0 ? mix(e, up, q) : mix(e, ad, -q), mul(up, r)];
  }
  const result: Segment[] = [];
  for (let i = 0; i < n; i++)
    for (const sign of [1, -1]) {
      const b = branch(i / n, sign),
        hits: Point[] = [];
      for (let j = 1; j <= s + 1 && hits.length < s; j++) {
        const other = branch(i / n + (sign * j) / n, -sign),
          h = segmentHit(
            b[1],
            mix(b[1], b[2], 10),
            other[1],
            mix(other[1], other[2], 10),
          );
        if (h) hits.push(h);
      }
      hits.sort((a, c) => distance(a, b[1]) - distance(c, b[1]));
      // F steers the rays; it is a control point, not an extra drawn vertex.
      result.push(...chain([b[0], b[1], ...hits].map((p) => add(p, center))));
    }
  return cleanSegments(result);
}
/** Girih extends the nearest opposite branch; Intersect pairs branch growth. */
export function polygonRays(poly: Point[], m: Motif): Segment[] {
  if (area(poly) < 0) poly = [...poly].reverse();
  const mid = midpoints(poly),
    rotation = (Math.PI * m.d) / m.n;
  const rays = mid.flatMap((a, i) =>
    [true, false].map((left) => ({
      a,
      b: add(
        a,
        mul(
          rotate(
            sub(poly[left ? i : (i + 1) % poly.length], a),
            left ? -rotation : rotation,
          ),
          32,
        ),
      ),
      side: i,
      left,
    })),
  );
  const infos = rays.map((a, i) =>
    rays
      .flatMap((b, j) => {
        if (a.side === b.side) return [];
        let at = segmentHit(a.a, a.b, b.a, b.b);
        if (
          !at &&
          Math.abs(cross(sub(a.b, a.a), sub(b.a, a.a))) < 1e-7 &&
          dot(sub(a.b, a.a), sub(b.a, a.a)) > 0
        )
          at = mix(a.a, b.a, 0.5);
        return at
          ? [
              {
                i,
                j,
                at,
                length: distance(at, a.a) ** 2 + distance(at, b.a) ** 2,
                distance: distance(at, a.a),
              },
            ]
          : [];
      })
      .sort((a, b) => a.distance - b.distance || a.j - b.j),
  );
  const lines: Segment[] = [];
  if (m.kind === 'girih') {
    for (let i = 0; i < rays.length; i++) {
      const options = infos[i]
        .filter((h) => rays[h.j].left !== rays[i].left)
        .sort(
          (a, b) =>
            a.length - b.length ||
            Math.abs(rays[i].side - rays[a.j].side) -
              Math.abs(rays[i].side - rays[b.j].side),
        );
      if (options[0]) lines.push({ a: rays[i].a, b: options[0].at });
    }
  } else if (m.progressive) {
    for (let i = 0; i < rays.length; i++) {
      lines.push(
        ...chain([rays[i].a, ...infos[i].slice(0, m.s).map((h) => h.at)]),
      );
    }
  } else {
    const pairs = infos
        .flatMap((row) => row.filter((h) => h.j > h.i && inside(h.at, poly)))
        .sort((a, b) => a.length - b.length || a.i - b.i || a.j - b.j),
      froms = rays.map((r) => r.a),
      counts = rays.map(() => 0);
    for (const h of pairs)
      if (counts[h.i] < m.s && counts[h.j] < m.s) {
        lines.push({ a: froms[h.i], b: h.at }, { a: h.at, b: froms[h.j] });
        froms[h.i] = froms[h.j] = h.at;
        counts[h.i]++;
        counts[h.j]++;
      }
  }
  return cleanSegments(lines);
}

/** Continue actual neighboring motif endpoints into the selected tile, then pair
 * inward contacts by equal length, collinearity, and finally unequal length. */
export function inferNeighbors(
  tile: Tile,
  layer: Layer,
  maps: Map<string, Segment[]>,
): Segment[] {
  const units: Matrix[] = [],
    r = layer.tiling.repetition;
  if (r.kind === 'translation') {
    for (let x = -2; x <= 2; x++)
      for (let y = -2; y <= 2; y++)
        units.push(
          transformation(x * r.u.x + y * r.v.x, x * r.u.y + y * r.v.y),
        );
  } else {
    let ring = IDENTITY;
    for (let k = 0; k < 3; k++) {
      for (let s = 0; s < r.sectors; s++)
        units.push(
          compose(around(r.center, (s * 2 * Math.PI) / r.sectors), ring),
        );
      ring = compose(ring, r.transform);
    }
  }
  type Contact = { a: Point; direction: Point };
  let contacts: Contact[] = [];
  for (const primary of tile.placements) {
    const inv = inverse(primary),
      found = new Map<string, Contact>(),
      boundary = tile.points.map((a, i) => ({
        a,
        b: tile.points[(i + 1) % tile.points.length],
      }));
    for (const unit of units)
      for (const neighbor of layer.tiling.tiles)
        for (const placement of neighbor.placements) {
          const m = compose(inv, compose(unit, placement));
          const same =
            neighbor.id === tile.id &&
            m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-7);
          if (same) continue;
          for (const s of maps.get(neighbor.id) || []) {
            const a = apply(m, s.a),
              b = apply(m, s.b);
            for (const [end, other] of [
              [a, b],
              [b, a],
            ]) {
              if (
                boundary.some(
                  (edge) => pointSegment(end, edge).distance < 1e-6,
                ) &&
                !inside(other, tile.points)
              ) {
                const direction = normalize(sub(end, other));
                if (!inside(add(end, mul(direction, 1e-4)), tile.points))
                  continue;
                found.set(key(end) + ':' + key(direction), {
                  a: end,
                  direction,
                });
              }
            }
          }
        }
    if (found.size > contacts.length) contacts = [...found.values()];
  }
  if (!contacts.length)
    throw Error(
      'No neighboring lines meet this tile. Apply motifs to the adjacent shapes first.',
    );
  const used = new Set<number>(),
    lines: Segment[] = [];
  for (let i = 0; i < contacts.length; i++) {
    if (used.has(i)) continue;
    const a = contacts[i];
    let best: {
      j: number;
      rank: number;
      cost: number;
      at: Point | null;
    } | null = null;
    for (let j = 0; j < contacts.length; j++) {
      if (j === i || used.has(j) || distance(a.a, contacts[j].a) < 1e-7)
        continue;
      const b = contacts[j],
        h = intersection(
          a.a,
          add(a.a, a.direction),
          b.a,
          add(b.a, b.direction),
        );
      let candidate: {
        j: number;
        rank: number;
        cost: number;
        at: Point | null;
      } | null = null;
      if (
        !h &&
        Math.abs(cross(a.direction, sub(b.a, a.a))) < 1e-7 &&
        dot(a.direction, b.direction) < 0 &&
        dot(a.direction, sub(b.a, a.a)) > 0
      )
        candidate = { j, rank: 1, cost: distance(a.a, b.a), at: null };
      else if (h && h.t > 1e-7 && h.u > 1e-7) {
        const equal = Math.abs(h.t - h.u) < 1e-6,
          within = inside(h.point, tile.points);
        candidate = {
          j,
          rank: within ? (equal ? 0 : 2) : equal ? 3 : 4,
          cost: equal ? h.t : Math.abs(h.t - h.u),
          at: h.point,
        };
      }
      if (
        candidate &&
        (!best ||
          candidate.rank < best.rank ||
          (candidate.rank === best.rank && candidate.cost < best.cost))
      )
        best = candidate;
    }
    if (best) {
      used.add(i);
      used.add(best.j);
      if (best.at)
        lines.push(
          { a: a.a, b: best.at },
          { a: contacts[best.j].a, b: best.at },
        );
      else lines.push({ a: a.a, b: contacts[best.j].a });
    }
  }
  const spare = contacts.filter((_, i) => !used.has(i)),
    len =
      Math.min(
        ...tile.points.map((a, i) =>
          distance(a, tile.points[(i + 1) % tile.points.length]),
        ),
      ) / 2;
  for (let i = 1; i < spare.length; i += 2) {
    const a = spare[i - 1],
      b = spare[i];
    lines.push(
      ...chain([
        a.a,
        add(a.a, mul(a.direction, len)),
        add(b.a, mul(b.direction, len)),
        b.a,
      ]),
    );
  }
  return cleanSegments(lines);
}
