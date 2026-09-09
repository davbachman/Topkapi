import type { Tiling, Motif, Segment, Layer } from '@/lib/engine/types';
import { add, apply, bounds } from '@/lib/engine/geometry';
import { makeMotif } from '@/lib/engine/motifs';
import { defaultMotif, newLayer } from '@/lib/project/model';
import { placedMotifs } from '@/lib/engine/placed';
import { pathData } from '@/lib/engine/render';
export function Preview({
  tiling,
  layer,
  motif,
  segments,
  color = '#25787b',
}: {
  tiling: Tiling;
  layer?: Layer;
  motif?: Motif;
  segments?: Segment[];
  color?: string;
}) {
  const pts = tiling.tiles.flatMap((t) =>
      t.placements.flatMap((m) => t.points.map((p) => apply(m, p))),
    ),
    b = bounds(pts),
    pad = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.13;
  const contactPreview =
    !segments &&
    !motif &&
    (layer?.twoPoint ||
      tiling.recommended ||
      tiling.tiles.some((t) => t.contacts))
      ? placedMotifs(layer || newLayer(tiling))
      : undefined;
  // The curated seeds contain whole faces selected by periodic-cell center.
  // A rosette can straddle that cell, so show its neighboring copies too.
  // Explicit motif/segment previews keep their original single-tile view.
  const rep = tiling.repetition,
    repeatedPatch =
      tiling.collection === 'rosette' &&
      !segments &&
      !motif &&
      rep.kind === 'translation';
  const patch =
    repeatedPatch && rep.kind === 'translation' && contactPreview
      ? [-1, 0, 1].flatMap((x) =>
          [-1, 0, 1].flatMap((y) => {
            const offset = {
              x: rep.u.x * x + rep.v.x * y,
              y: rep.u.y * x + rep.v.y * y,
            };
            return contactPreview.map((figure) => ({
              points: figure.points.map((p) => add(p, offset)),
              segments: figure.segments.map((s) => ({
                a: add(s.a, offset),
                b: add(s.b, offset),
              })),
            }));
          }),
        )
      : undefined;
  // All three reference source polygons are centered at the origin. A crop
  // tied to the lattice length shows a whole central rosette and its neighbors.
  const extent =
    patch && rep.kind === 'translation'
      ? 0.7 *
        Math.min(Math.hypot(rep.u.x, rep.u.y), Math.hypot(rep.v.x, rep.v.y))
      : 0;
  const viewBox = patch
    ? `${-extent} ${-extent} ${2 * extent} ${2 * extent}`
    : `${b.minX - pad} ${b.minY - pad} ${b.maxX - b.minX + 2 * pad} ${b.maxY - b.minY + 2 * pad}`;
  const strokeUnit = patch ? extent * 0.26 : pad;
  return (
    <svg
      viewBox={viewBox}
      overflow={patch ? 'hidden' : undefined}
      aria-hidden="true"
    >
      <path
        d={
          patch
            ? patch.map((figure) => pathData(figure.points, true)).join('')
            : tiling.tiles
                .flatMap((t) =>
                  t.placements.map((m) =>
                    pathData(
                      t.points.map((p) => apply(m, p)),
                      true,
                    ),
                  ),
                )
                .join('')
        }
        fill="none"
        stroke="#c5cfd0"
        strokeWidth={strokeUnit * 0.07}
      />
      <path
        d={
          patch || contactPreview
            ? (patch || contactPreview)!
                .flatMap((t) => t.segments.map((s) => pathData([s.a, s.b])))
                .join('')
            : tiling.tiles
                .flatMap((t) => {
                  const figure =
                    segments ??
                    makeMotif(
                      t,
                      motif || defaultMotif(t.regular && t.points.length > 4),
                    );
                  return t.placements.flatMap((m) =>
                    figure.map((s) => pathData([apply(m, s.a), apply(m, s.b)])),
                  );
                })
                .join('')
        }
        fill="none"
        stroke={color}
        strokeWidth={strokeUnit * 0.11}
        strokeLinejoin="round"
      />
    </svg>
  );
}
