/** Two-point patterns (Jay Bonner), following Craig S. Kaplan's
 * Islamic Star Patterns from Polygons in Contact (2005), section 3.
 * https://cs.uwaterloo.ca/~csk/publications/Papers/kaplan_2005.pdf
 */
import type { Point, Segment } from './types';
import {
  add,
  sub,
  mul,
  mix,
  rotate,
  normalize,
  area,
  distance,
  intersection,
  cross,
  dot,
  cleanSegments,
} from './geometry';
import { clipToTile } from './construction';
import { contactSeparationLimit } from './contacts';

type Candidate = {
  i: number;
  j: number;
  lines: Segment[];
  cost: number;
  balance: number;
};

function pairRays(candidates: Candidate[]): Candidate[] {
  const used = new Set<number>();
  return candidates.filter((c) => {
    if (used.has(c.i) || used.has(c.j)) return false;
    used.add(c.i);
    used.add(c.j);
    return true;
  });
}

/** delta is the TOTAL distance between origins, in the polygon's coordinates.
 * Rays from the same edge cross inside the tile but must not terminate there. */
export function twoPointHankin(
  poly: Point[],
  degrees: number,
  delta = 0,
  contacts?: number[],
): Segment[] {
  const winding = area(poly) < 0 ? -1 : 1;
  const shortest = Math.min(
    ...poly.map((p, i) => distance(p, poly[(i + 1) % poly.length])),
  );
  const gap = Math.max(
      0,
      Math.min(contactSeparationLimit(poly, contacts), delta),
    ),
    angle = (degrees * Math.PI) / 180,
    eps = Math.max(1e-10, shortest * 1e-8);
  const candidatesAt = (gap: number): Candidate[] => {
    const rays = poly.flatMap((a, edge) => {
      const b = poly[(edge + 1) % poly.length],
        mid = mix(a, b, contacts?.[edge] ?? 0.5),
        v = normalize(sub(b, a));
      return [
        {
          start: add(mid, mul(v, -gap / 2)),
          direction: rotate(v, winding * angle),
          edge,
        },
        {
          start: add(mid, mul(v, gap / 2)),
          direction: rotate(v, winding * (Math.PI - angle)),
          edge,
        },
      ];
    });
    const candidates: Candidate[] = [];
    const contained = (s: Segment) => {
      const length = distance(s.a, s.b);
      return (
        length < eps ||
        Math.abs(
          clipToTile([s], poly).reduce(
            (sum, part) => sum + distance(part.a, part.b),
            0,
          ) - length,
        ) < eps
      );
    };
    for (let i = 0; i < rays.length; i++) {
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
        if (hit) {
          if (hit.t < -eps || hit.u < -eps || hit.t + hit.u < eps) continue;
          const lines = [
            { a: a.start, b: hit.point },
            { a: b.start, b: hit.point },
          ];
          if (lines.every(contained))
            candidates.push({
              i,
              j,
              lines,
              cost: hit.t + hit.u,
              balance: Math.abs(hit.t - hit.u),
            });
        } else {
          const offset = sub(b.start, a.start),
            length = distance(a.start, b.start);
          if (
            length > eps &&
            dot(a.direction, b.direction) < -1 + 1e-9 &&
            Math.abs(cross(a.direction, offset)) < eps &&
            dot(a.direction, offset) > eps
          ) {
            const line = { a: a.start, b: b.start };
            if (contained(line))
              candidates.push({
                i,
                j,
                lines: [line],
                cost: length,
                balance: 0,
              });
          }
        }
      }
    }
    // Treat numerical noise as a tie so rotating/reflection of symmetric tiles
    // does not change the pairing. Equal-length arms settle equal-cost choices.
    candidates.sort((a, b) =>
      Math.abs(a.cost - b.cost) > eps
        ? a.cost - b.cost
        : Math.abs(a.balance - b.balance) > eps
          ? a.balance - b.balance
          : a.i - b.i || a.j - b.j,
    );
    return candidates;
  };
  const candidates = candidatesAt(gap),
    shortestPairs = pairRays(candidates);
  if (gap === 0) return cleanSegments(shortestPairs.flatMap((c) => c.lines));

  // Establish a deterministic topology at zero separation. As the origins move,
  // keep these connections while their paths remain forward and inside the tile.
  // Reranking from scratch can replace valid pairs with newly available short
  // paths and abruptly leave other contacts unmatched (e.g. 12-8 at 32 degrees).
  const reference = new Set(
      pairRays(candidatesAt(0)).map((c) => `${c.i}:${c.j}`),
    ),
    preferred = (c: Candidate) => reference.has(`${c.i}:${c.j}`),
    stablePairs = pairRays([
      ...candidates.filter(preferred),
      ...candidates.filter((c) => !preferred(c)),
    ]);
  // Some reference paths become invalid, or begin as an incomplete matching.
  // Do not sacrifice connected contacts to retain only part of that topology.
  const pairs =
    stablePairs.length >= shortestPairs.length ? stablePairs : shortestPairs;
  return cleanSegments(pairs.flatMap((c) => c.lines));
}
