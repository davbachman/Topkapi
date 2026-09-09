import type { Layer, Tiling, Matrix, Point, Segment, Tile } from './types';
import { apply, compose, distance, IDENTITY, inverse } from './geometry';
import { makeMotif } from './motifs';
import { twoPointHankin } from './hankin';

/** Measure AFTER placements: differently normalized catalog polygons must
 * agree on the physical gap along shared edges. Independent of the viewport. */
export function twoPointDistance(tiling: Tiling, separation: number): number {
  let shortest = Infinity,
    expansion = IDENTITY;
  const rep = tiling.repetition,
    rings = rep.kind === 'inflation' ? Math.min(9, rep.rings) : 1;
  for (let ring = 0; ring < rings; ring++) {
    for (const tile of tiling.tiles) {
      for (const [i, placement] of tile.placements.entries()) {
        if (tile.excluded?.includes(i)) continue;
        const m = compose(expansion, placement),
          points = tile.points.map((p) => apply(m, p));
        for (let j = 0; j < points.length; j++)
          shortest = Math.min(
            shortest,
            distance(points[j], points[(j + 1) % points.length]),
          );
      }
    }
    if (rep.kind === 'inflation') expansion = compose(expansion, rep.transform);
  }
  return Number.isFinite(shortest)
    ? shortest * Math.max(0, Math.min(1, separation))
    : 0;
}

export type PlacedMotif = {
  tileId: string;
  points: Point[];
  segments: Segment[];
};
/** Shared by the viewport and the periodic weave reference. For two-point
 * patterns, construct in placed coordinates to preserve angles under affine
 * placements and the same gap on every neighboring tile. */
export function placedMotifs(
  layer: Layer,
  unit: Matrix = IDENTITY,
  delta = layer.twoPoint
    ? twoPointDistance(layer.tiling, layer.twoPoint.separation)
    : 0,
): PlacedMotif[] {
  return layer.tiling.tiles.flatMap((tile) => {
    const motif = layer.twoPoint ? [] : makeMotif(tile, layer.motifs[tile.id]);
    return tile.placements.flatMap((placement, i) => {
      if (tile.excluded?.includes(i)) return [];
      const m = compose(unit, placement),
        points = tile.points.map((p) => apply(m, p));
      return [
        {
          tileId: tile.id,
          points,
          segments: layer.twoPoint
            ? twoPointHankin(points, layer.twoPoint.angle, delta)
            : motif.map((s) => ({ a: apply(m, s.a), b: apply(m, s.b) })),
        },
      ];
    });
  });
}

/** A representative placed tile, returned in prototype coordinates for the
 * motif editor/variation previews. The full layer uses placedMotifs above. */
export function twoPointTile(layer: Layer, tile: Tile): Segment[] {
  if (!layer.twoPoint) return makeMotif(tile, layer.motifs[tile.id]);
  const m =
      tile.placements.find((_, i) => !tile.excluded?.includes(i)) ||
      tile.placements[0],
    back = inverse(m);
  return twoPointHankin(
    tile.points.map((p) => apply(m, p)),
    layer.twoPoint.angle,
    twoPointDistance(layer.tiling, layer.twoPoint.separation),
  ).map((s) => ({ a: apply(back, s.a), b: apply(back, s.b) }));
}
