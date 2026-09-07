import { bandPolygons, embossedFaces, shadeColor } from './bands';
import type { Bounds, Geometry, Point, Project } from './types';
import { faceColors, strands } from './render';
const n = (v: number) => Number(v.toFixed(6));
/** EPS Level 2 vector output. Transparency is flattened against the paper color. */
export function exportEPS(
  project: Project,
  geometries: Record<string, Geometry>,
  region: Bounds,
): string {
  const factor = project.units === 'mm' ? 72 / 25.4 : 72,
    w = project.width * factor,
    h = project.height * factor,
    scale = w / (region.maxX - region.minX);
  const out = [
    `%!PS-Adobe-3.0 EPSF-3.0`,
    `%%BoundingBox: 0 0 ${Math.ceil(w)} ${Math.ceil(h)}`,
    `%%HiResBoundingBox: 0 0 ${n(w)} ${n(h)}`,
    '%%LanguageLevel: 2',
    '%%EndComments',
    'gsave',
    `0 ${n(h)} translate ${n(scale)} ${n(-scale)} scale ${n(-region.minX)} ${n(-region.minY)} translate`,
  ];
  const path = (ps: Point[], closed = false) => {
    out.push('newpath');
    ps.forEach((p, i) =>
      out.push(`${n(p.x)} ${n(p.y)} ${i ? 'lineto' : 'moveto'}`),
    );
    if (closed) out.push('closepath');
  };
  const rect = [
    { x: region.minX, y: region.minY },
    { x: region.maxX, y: region.minY },
    { x: region.maxX, y: region.maxY },
    { x: region.minX, y: region.maxY },
  ];
  const color = (hex: string, opacity = 1) => {
    const rgb = [1, 3, 5].map(
      (i) =>
        (parseInt(hex.slice(i, i + 2), 16) * opacity +
          parseInt(project.paper.slice(i, i + 2), 16) * (1 - opacity)) /
        255,
    );
    out.push(`${rgb.map(n).join(' ')} setrgbcolor`);
  };
  const fill = (ps: Point[], c: string, opacity = 1) => {
    path(ps, true);
    color(c, opacity);
    out.push('fill');
  };
  const stroke = (ps: Point[], c: string, width: number, opacity: number) => {
    if (width <= 0) return;
    path(ps);
    color(c, opacity);
    out.push(`${n(width)} setlinewidth stroke`);
  };
  fill(rect, project.paper);
  path(rect, true);
  out.push('clip newpath', '1 setlinecap');
  for (const l of project.layers.filter((l) => l.visible)) {
    const g = geometries[l.id],
      s = l.style,
      sw =
        s.kind === 'plain' || s.kind === 'sketch'
          ? 0.014
          : s.width * l.transform.scale,
      ow = s.drawOutline ? s.outlineWidth * l.transform.scale : 0,
      gap = s.gap * l.transform.scale,
      opacity = s.opacity;
    out.push(
      'gsave',
      `${s.join === 'round' ? 1 : s.join === 'bevel' ? 2 : 0} setlinejoin`,
    );
    const tones = faceColors(g, l);
    for (const f of g.faces) {
      const paint = l.regionColors[f.id];
      if (
        paint ||
        (s.kind === 'filled' &&
          tones.has(f.id) &&
          (tones.get(f.id) ? s.fillInside : s.fillOutside))
      )
        fill(f.points, paint || s.color, opacity);
    }
    if (s.kind === 'interlace' || s.kind === 'outline' || s.kind === 'emboss') {
      const bands = bandPolygons(g, {
        ...s,
        width: sw,
        outlineWidth: ow,
        gap,
        shadowWidth: s.shadowWidth * l.transform.scale,
      });
      for (const b of bands) {
        if (s.kind === 'emboss')
          for (const f of embossedFaces(b.points, s.color, s.light))
            fill(f.points, f.color, opacity);
        else fill(b.points, s.color, opacity);
      }
      if (s.kind === 'interlace')
        for (const b of bands)
          for (const shadow of b.shadows)
            fill(shadow, shadeColor(s.color, 0.9, 0.8), opacity);
      if (ow) {
        out.push('0 setlinecap');
        for (const { points: p } of bands) {
          if (s.kind === 'emboss') {
            stroke([...p, p[0]], s.outline, ow, opacity);
            stroke([p[1], p[4]], s.outline, ow, opacity);
          } else {
            stroke([p[2], p[3]], s.outline, ow, opacity);
            stroke([p[5], p[0]], s.outline, ow, opacity);
          }
        }
        out.push('1 setlinecap');
      }
    } else if (s.kind !== 'filled') {
      const paths =
        s.kind === 'thick'
          ? g.edges.map((e) => [g.nodes[e.a].point, g.nodes[e.b].point])
          : strands(g);
      for (const [j, points] of paths.entries()) {
        if (s.kind === 'thick' && ow)
          stroke(points, s.outline, sw + 2 * ow, opacity);
        if (s.kind === 'sketch')
          for (let i = 0; i < 3; i++)
            stroke(
              points.map((p, k) => ({
                x: p.x + Math.sin(j * 13 + k * 7 + i) * 0.012,
                y: p.y + Math.cos(j * 11 + k * 3 + i) * 0.012,
              })),
              s.color,
              0.008,
              opacity * 0.6,
            );
        else stroke(points, s.color, sw, opacity);
      }
    }
    out.push('grestore');
  }
  out.push('grestore', 'showpage', '%%EOF');
  return out.join('\n');
}
