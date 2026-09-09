import type { Point } from './types';
import { distance, mix } from './geometry';

/** Contacts are fractions along each directed polygon edge. They follow affine
 * placements without depending on how a prototype was normalized. */
export function contactPositions(
  points: Point[],
  contacts?: number[],
): Point[] {
  return points.map((a, i) =>
    mix(a, points[(i + 1) % points.length], contacts?.[i] ?? 0.5),
  );
}

/** Largest TOTAL symmetric split that keeps every ray origin on its edge.
 * With midpoint contacts this is exactly the shortest edge length. */
export function contactSeparationLimit(
  points: Point[],
  contacts?: number[],
): number {
  return Math.min(
    ...points.map((a, i) => {
      const t = contacts?.[i] ?? 0.5;
      return (
        2 * distance(a, points[(i + 1) % points.length]) * Math.min(t, 1 - t)
      );
    }),
  );
}
