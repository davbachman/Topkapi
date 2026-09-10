import type { Layer, Bounds, Matrix, Geometry } from './types';
import {
  apply,
  compose,
  inverse,
  transformation,
  around,
  IDENTITY,
  bounds,
  overlaps,
  cleanSegments,
} from './geometry';
import { placedMotifs, twoPointDistance } from './placed';
import { stabilizeWeave } from './weave';
import { planarize, faceId } from './topology';
import { shapePaintId } from './paint';
export function generate(
  layer: Layer,
  region: Bounds,
  detail = true,
): Geometry {
  const result: Geometry = {
    segments: [],
    tiles: [],
    nodes: [],
    edges: [],
    faces: [],
    crossings: [],
    warnings: [],
    truncated: false,
  };
  const tr = transformation(
    layer.transform.x,
    layer.transform.y,
    (layer.transform.rotation * Math.PI) / 180,
    layer.transform.scale,
  );
  if (layer.frozen) {
    result.segments = layer.frozen.map((s) => ({
      a: apply(tr, s.a),
      b: apply(tr, s.b),
    }));
    if (detail) {
      Object.assign(result, planarize(result.segments));
      const inv = inverse(tr);
      result.faces.forEach((f) => {
        const local = f.points.map((p) => apply(inv, p));
        f.id = faceId(local);
        f.paintId = shapePaintId(
          local,
          layer.tiling.repetition.kind === 'inflation',
        );
      });
    }
    return result;
  }
  const repetition = layer.tiling.repetition,
    localRegion = bounds(
      [
        { x: region.minX, y: region.minY },
        { x: region.maxX, y: region.minY },
        { x: region.maxX, y: region.maxY },
        { x: region.minX, y: region.maxY },
      ].map((p) => apply(inverse(tr), p)),
    );
  const units: Matrix[] = [];
  if (repetition.kind === 'translation') {
    const { u, v } = repetition,
      lattice: Matrix = [u.x, v.x, 0, u.y, v.y, 0];
    let inv: Matrix;
    try {
      inv = inverse(lattice);
    } catch {
      return result;
    }
    const seedBounds = bounds(
      layer.tiling.tiles.flatMap((t) =>
        t.placements.flatMap((m) => t.points.map((p) => apply(m, p))),
      ),
    );
    const r = bounds(
      [
        {
          x: localRegion.minX - seedBounds.maxX,
          y: localRegion.minY - seedBounds.maxY,
        },
        {
          x: localRegion.maxX - seedBounds.minX,
          y: localRegion.minY - seedBounds.maxY,
        },
        {
          x: localRegion.maxX - seedBounds.minX,
          y: localRegion.maxY - seedBounds.minY,
        },
        {
          x: localRegion.minX - seedBounds.maxX,
          y: localRegion.maxY - seedBounds.minY,
        },
      ].map((p) => apply(inv, p)),
    );
    const minX = Math.floor(r.minX),
      maxX = Math.ceil(r.maxX),
      minY = Math.floor(r.minY),
      maxY = Math.ceil(r.maxY);
    const candidates: { x: number; y: number; d: number }[] = [];
    const cx = (minX + maxX) / 2,
      cy = (minY + maxY) / 2;
    for (
      let x = Math.max(minX, Math.floor(cx) - 40);
      x <= Math.min(maxX, Math.ceil(cx) + 40);
      x++
    )
      for (
        let y = Math.max(minY, Math.floor(cy) - 40);
        y <= Math.min(maxY, Math.ceil(cy) + 40);
        y++
      )
        candidates.push({ x, y, d: (x - cx) ** 2 + (y - cy) ** 2 });
    candidates.sort((a, b) => a.d - b.d);
    for (const { x, y } of candidates.slice(0, 400))
      units.push(transformation(u.x * x + v.x * y, u.y * x + v.y * y));
    result.truncated =
      candidates.length > 400 || maxX - minX > 80 || maxY - minY > 80;
  } else {
    let expansion = IDENTITY;
    for (let ring = 0; ring < Math.min(9, repetition.rings); ring++) {
      for (let i = 0; i < repetition.sectors; i++)
        units.push(
          compose(
            around(repetition.center, (i * 2 * Math.PI) / repetition.sectors),
            expansion,
          ),
        );
      expansion = compose(expansion, repetition.transform);
    }
  }
  const delta = layer.twoPoint
      ? twoPointDistance(layer.tiling, layer.twoPoint.separation)
      : 0,
    motifs = placedMotifs(layer, IDENTITY, delta);
  outer: for (const unit of units) {
    const constructedUnit = repetition.kind === 'inflation' && !!layer.twoPoint,
      figures = constructedUnit ? placedMotifs(layer, unit, delta) : motifs,
      m = constructedUnit ? tr : compose(tr, unit);
    for (const tile of figures) {
      const points = tile.points.map((p) => apply(m, p));
      if (!overlaps(bounds(points), region)) continue;
      result.tiles.push({ points, tileId: tile.tileId });
      for (const s of tile.segments)
        result.segments.push({ a: apply(m, s.a), b: apply(m, s.b) });
      if (result.segments.length > 14000 || result.tiles.length > 1600) {
        result.truncated = true;
        break outer;
      }
    }
  }
  result.segments = cleanSegments(result.segments);
  if (detail) {
    Object.assign(result, planarize(result.segments));
    const inv = inverse(tr);
    result.faces.forEach((f) => {
      const local = f.points.map((p) => apply(inv, p));
      f.id = faceId(local);
      f.paintId = shapePaintId(local, repetition.kind === 'inflation');
    });
  }
  if (detail) stabilizeWeave(layer, result);
  return result;
}
