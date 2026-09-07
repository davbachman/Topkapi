import type { Tiling, Motif } from '@/lib/engine/types';
import { apply, bounds } from '@/lib/engine/geometry';
import { makeMotif } from '@/lib/engine/motifs';
import { defaultMotif } from '@/lib/project/model';
import { pathData } from '@/lib/engine/render';
export function Preview({
  tiling,
  motif,
  color = '#25787b',
}: {
  tiling: Tiling;
  motif?: Motif;
  color?: string;
}) {
  const pts = tiling.tiles.flatMap((t) =>
      t.placements.flatMap((m) => t.points.map((p) => apply(m, p))),
    ),
    b = bounds(pts),
    pad = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.13;
  return (
    <svg
      viewBox={`${b.minX - pad} ${b.minY - pad} ${b.maxX - b.minX + 2 * pad} ${b.maxY - b.minY + 2 * pad}`}
      aria-hidden="true"
    >
      <path
        d={tiling.tiles
          .flatMap((t) =>
            t.placements.map((m) =>
              pathData(
                t.points.map((p) => apply(m, p)),
                true,
              ),
            ),
          )
          .join('')}
        fill="none"
        stroke="#c5cfd0"
        strokeWidth={pad * 0.07}
      />
      <path
        d={tiling.tiles
          .flatMap((t) => {
            const figure = makeMotif(
              t,
              motif || defaultMotif(t.regular && t.points.length > 4),
            );
            return t.placements.flatMap((m) =>
              figure.map((s) => pathData([apply(m, s.a), apply(m, s.b)])),
            );
          })
          .join('')}
        fill="none"
        stroke={color}
        strokeWidth={pad * 0.11}
        strokeLinejoin="round"
      />
    </svg>
  );
}
