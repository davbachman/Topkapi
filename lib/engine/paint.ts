import type { Face, Layer, Point } from './types';
import {
  area,
  bounds,
  cross,
  distance,
  dot,
  pointSegment,
  sub,
} from './geometry';

/** Face outlines can acquire extra straight-edge vertices when a different
 * viewport includes more intersecting segments. Those are not shape changes. */
function corners(points: Point[]): Point[] {
  const box = bounds(points),
    tolerance = Math.max(
      1e-10,
      Math.max(box.maxX - box.minX, box.maxY - box.minY) * 1e-7,
    );
  let result = points;
  for (;;) {
    const next = result.filter((p, i) => {
      const before = result[(i + result.length - 1) % result.length],
        after = result[(i + 1) % result.length];
      return (
        pointSegment(p, { a: before, b: after }).distance > tolerance ||
        dot(sub(p, before), sub(after, p)) < 0
      );
    });
    if (next.length < 3 || next.length === result.length) return result;
    result = next;
  }
}

/** Booth's algorithm selects a cyclic starting point in linear time, including
 * outlines with long repeated runs. Compare tokens before joining so each
 * unsuccessful comparison skips the complete run already examined. */
function cyclicSignature(tokens: string[]): string {
  const count = tokens.length;
  let first = 0,
    second = 1,
    offset = 0;
  while (first < count && second < count && offset < count) {
    const a = tokens[(first + offset) % count],
      b = tokens[(second + offset) % count];
    if (a === b) {
      offset++;
      continue;
    }
    if (a > b) {
      first += offset + 1;
      if (first === second) first++;
    } else {
      second += offset + 1;
      if (first === second) second++;
    }
    offset = 0;
  }
  const start = Math.min(first, second);
  return tokens.slice(start).concat(tokens.slice(0, start)).join(';');
}

/** A copy is the same polygon up to translation, rotation, and reflection.
 * Periodic designs keep absolute size; concentric inflation also groups truly
 * similar scaled copies. Different outlines (e.g. rings constructed with a
 * fixed physical two-point gap) remain separate.
 *
 * Use local layer coordinates so moving or resizing a layer preserves paint.
 * Edge lengths and signed turns determine the complete outline. Taking the
 * least cyclic traversal in either direction removes starting-vertex, winding,
 * and reflection choices without merging merely equal-area/equal-sided faces.
 */
export function shapePaintId(points: Point[], scaleCopies = false): string {
  const polygon = corners(points),
    count = polygon.length,
    winding = area(polygon) < 0 ? -1 : 1,
    edges = polygon.map((p, i) => sub(polygon[(i + 1) % count], p)),
    lengths = polygon.map((p, i) => distance(p, polygon[(i + 1) % count])),
    divisor = scaleCopies ? lengths.reduce((sum, n) => sum + n, 0) : 1,
    quantize = (n: number) => Math.round(n * 1e6),
    sides = lengths.map((n) => quantize(n / divisor)),
    turns = edges.map((edge, i) => {
      const previous = edges[(i + count - 1) % count];
      return quantize(
        winding * Math.atan2(cross(previous, edge), dot(previous, edge)),
      );
    });
  const forward = cyclicSignature(
      sides.map((side, i) => `${side}:${turns[(i + 1) % count]}`),
    ),
    reverse = cyclicSignature(
      sides.map((_, i) => {
        const edge = count - 1 - i;
        return `${sides[edge]}:${turns[edge]}`;
      }),
    ),
    signature = forward < reverse ? forward : reverse;
  // Two independent 32-bit accumulators keep saved keys compact, separate from
  // the unique spatial face IDs used by topology and legacy individual paints.
  let a = 2166136261,
    b = 5381;
  for (const char of signature) {
    const code = char.charCodeAt(0);
    a = Math.imul(a ^ code, 16777619);
    b = Math.imul(b, 33) ^ code;
  }
  return `${scaleCopies ? 'similar' : 'copy'}-v1:${count}:${(a >>> 0).toString(36)}:${(b >>> 0).toString(36)}`;
}

export function paintRegion(layer: Layer, face: Face, color: string): void {
  layer.regionColors[face.paintId || face.id] = color;
}

export function regionColor(layer: Layer, face: Face): string | undefined {
  return (
    (face.paintId ? layer.regionColors[face.paintId] : undefined) ??
    layer.regionColors[face.id]
  );
}
