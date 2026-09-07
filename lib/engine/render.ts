import { bandPolygons, embossedFaces, shadeColor } from './bands';
import type { Geometry, Layer, Project, Point, Bounds } from './types';
import { mul, add, key } from './geometry';
import { clipSegment, clipPolygon, triangulate } from './construction';
const num = (n: number) => Number(n.toFixed(6));
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[c]!,
  );
export function pathData(points: Point[], closed = false) {
  return (
    points.map((p, i) => `${i ? 'L' : 'M'}${num(p.x)} ${num(p.y)}`).join('') +
    (closed ? 'Z' : '')
  );
}
export function strands(g: Geometry): Point[][] {
  if (!g.edges.length) return g.segments.map((s) => [s.a, s.b]);
  const used = new Set<number>(),
    paths: Point[][] = [];
  const other = (e: number, n: number) =>
    g.edges[e].a === n ? g.edges[e].b : g.edges[e].a;
  function next(n: number, e: number) {
    const options = g.nodes[n].edges;
    if (options.length === 2) return options.find((x) => x !== e);
    if (options.length === 4) {
      const i = options.indexOf(e);
      return options[(i + 2) % 4];
    }
    return undefined;
  }
  function walk(edge: number, start: number) {
    const pts = [g.nodes[start].point];
    let n = start,
      e = edge;
    while (!used.has(e)) {
      used.add(e);
      n = other(e, n);
      pts.push(g.nodes[n].point);
      const ne = next(n, e);
      if (ne === undefined || used.has(ne)) break;
      e = ne;
    }
    return pts;
  }
  for (let i = 0; i < g.edges.length; i++) {
    if (used.has(i)) continue;
    const edge = g.edges[i];
    if (next(edge.a, i) === undefined) paths.push(walk(i, edge.a));
    else if (next(edge.b, i) === undefined) paths.push(walk(i, edge.b));
  }
  for (let i = 0; i < g.edges.length; i++)
    if (!used.has(i)) paths.push(walk(i, g.edges[i].a));
  return paths;
}
/** Two-color bounded faces across shared edges; explicit paint overrides it. */
export function faceColors(g: Geometry, layer?: Layer): Map<string, boolean> {
  if (layer?.frozen && layer.frozenFaceClasses)
    return new Map(Object.entries(layer.frozenFaceClasses));
  const owners = new Map<string, string[]>(),
    neighbors = new Map<string, string[]>();
  for (const f of g.faces)
    for (let i = 0; i < f.points.length; i++) {
      const a = key(f.points[i]),
        b = key(f.points[(i + 1) % f.points.length]),
        k = a < b ? a + ':' + b : b + ':' + a;
      const list = owners.get(k) || [];
      list.push(f.id);
      owners.set(k, list);
    }
  for (const list of owners.values())
    if (list.length === 2) {
      for (const i of [0, 1])
        neighbors.set(list[i], [
          ...(neighbors.get(list[i]) || []),
          list[1 - i],
        ]);
    }
  const colors = new Map<string, boolean>();
  for (const f of [...g.faces].sort((a, b) => b.area - a.area)) {
    if (colors.has(f.id)) continue;
    colors.set(f.id, false);
    const q = [f.id];
    for (let i = 0; i < q.length; i++)
      for (const n of neighbors.get(q[i]) || [])
        if (!colors.has(n)) {
          colors.set(n, !colors.get(q[i]));
          q.push(n);
        }
  }
  return colors;
}
export type RenderOptions = {
  tiles?: boolean;
  diagnostics?: boolean;
  centers?: boolean;
  palette?: string;
  id?: string;
};
/** SVG is also used for the interactive view. The engine stays renderer-neutral. */
export function layerSVG(
  layer: Layer,
  g: Geometry,
  options: RenderOptions = {},
): string {
  const scale = layer.transform.scale;
  const s = {
      ...layer.style,
      width: layer.style.width * scale,
      outlineWidth: layer.style.drawOutline
        ? layer.style.outlineWidth * scale
        : 0,
      shadowWidth: layer.style.shadowWidth * scale,
      gap: layer.style.gap * scale,
    },
    color = esc(s.color),
    outline = esc(s.outline),
    opacity = s.opacity;
  const paths =
      s.kind === 'thick'
        ? g.edges.map((e) => [g.nodes[e.a].point, g.nodes[e.b].point])
        : strands(g),
    line = paths.map((p) => pathData(p)).join(''),
    sw = s.kind === 'plain' || s.kind === 'sketch' ? 0.014 : s.width;
  const attrs = `fill="none" stroke-linecap="round" stroke-linejoin="${s.join}"`;
  const stroke = (d: string, c: string, w: number, extra = '') =>
    `<path d="${d}" stroke="${c}" stroke-width="${num(w)}" ${attrs} ${extra}/>`;
  let body = '';
  const tones = faceColors(g, layer);
  for (const f of g.faces) {
    const paint = layer.regionColors[f.id];
    if (
      paint ||
      (s.kind === 'filled' &&
        tones.has(f.id) &&
        (tones.get(f.id) ? s.fillInside : s.fillOutside))
    )
      body += `<path d="${pathData(f.points, true)}" fill="${esc(paint || s.color)}"/>`;
  }
  if (s.kind === 'interlace' || s.kind === 'outline' || s.kind === 'emboss') {
    const bands = bandPolygons(g, s);
    if (s.kind === 'emboss') {
      for (const b of bands)
        for (const f of embossedFaces(b.points, s.color, s.light))
          body += `<path d="${pathData(f.points, true)}" fill="${f.color}"/>`;
    } else
      body += `<path d="${bands.map((b) => pathData(b.points, true)).join('')}" fill="${color}"/>`;
    if (s.kind === 'interlace')
      body += `<path d="${bands.flatMap((b) => b.shadows.map((p) => pathData(p, true))).join('')}" fill="${shadeColor(s.color, 0.9, 0.8)}"/>`;
    if (s.outlineWidth) {
      const edges = bands.flatMap(({ points: p }) =>
        s.kind === 'emboss'
          ? [pathData(p, true), pathData([p[1], p[4]])]
          : [pathData([p[2], p[3]]), pathData([p[5], p[0]])],
      );
      body += stroke(
        edges.join(''),
        outline,
        s.outlineWidth,
        'style="stroke-linecap:butt"',
      );
    }
  } else if (s.kind !== 'filled') {
    if (s.kind === 'thick' && s.outlineWidth)
      body += stroke(line, outline, sw + 2 * s.outlineWidth);
    if (s.kind === 'sketch')
      for (let i = 0; i < 3; i++)
        body += stroke(
          paths
            .map((path, j) =>
              pathData(
                path.map((p, k) => ({
                  x: p.x + Math.sin(j * 13 + k * 7 + i) * 0.012,
                  y: p.y + Math.cos(j * 11 + k * 3 + i) * 0.012,
                })),
              ),
            )
            .join(''),
          color,
          0.008,
          'opacity=".6"',
        );
    else body += stroke(line, color, sw);
  }
  let guides = '';
  if (options.tiles)
    guides += `<path d="${g.tiles.map((t) => pathData(t.points, true)).join('')}" fill="none" stroke="#b08538" stroke-width=".012" stroke-dasharray=".045 .04" opacity=".7"/>`;
  if (options.centers)
    guides += g.tiles
      .map((t) => {
        const c = mul(
          t.points.reduce(add, { x: 0, y: 0 }),
          1 / t.points.length,
        );
        return `<circle cx="${num(c.x)}" cy="${num(c.y)}" r=".03" fill="#b08538"/>`;
      })
      .join('');
  if (options.diagnostics)
    guides += g.warnings
      .slice(0, 350)
      .map(
        (w) =>
          `<circle cx="${num(w.point.x)}" cy="${num(w.point.y)}" r=".055" stroke="${w.kind === 'weave' ? '#9333ea' : '#e05d44'}" fill="none" stroke-width=".017"/>`,
      )
      .join('');
  return `<g opacity="${opacity}">${body}</g>${guides}`;
}
export function exportSVG(
  project: Project,
  geometries: Record<string, Geometry>,
  region: Bounds,
): string {
  const body = project.layers
    .filter((l) => l.visible)
    .map((l) => layerSVG(l, geometries[l.id], { id: l.id }))
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${project.width}${project.units}" height="${project.height}${project.units}" viewBox="${region.minX} ${region.minY} ${region.maxX - region.minX} ${region.maxY - region.minY}"><title>${esc(project.name)}</title><rect x="${region.minX}" y="${region.minY}" width="${region.maxX - region.minX}" height="${region.maxY - region.minY}" fill="${esc(project.paper)}"/>${body}</svg>`;
}
export function exportDXF(
  project: Project,
  geometries: Record<string, Geometry>,
  region: Bounds,
  mode: 'lines' | 'faces' | 'solid',
): string {
  const lines = [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$ACADVER',
    '1',
    'AC1015',
    '9',
    '$INSUNITS',
    '70',
    project.units === 'mm' ? '4' : '1',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
  ];
  const scale = project.width / (region.maxX - region.minX),
    p = (a: Point) => ({
      x: (a.x - region.minX) * scale,
      y: (region.maxY - a.y) * scale,
    });
  for (const layer of project.layers.filter((l) => l.visible)) {
    const g = geometries[layer.id];
    if (mode === 'lines')
      for (const edge of g.edges) {
        const clipped = clipSegment(
          { a: g.nodes[edge.a].point, b: g.nodes[edge.b].point },
          region,
        );
        if (!clipped) continue;
        const a = p(clipped.a),
          b = p(clipped.b);
        lines.push(
          '0',
          'LINE',
          '8',
          layer.name.replace(/[^a-zA-Z0-9 _-]/g, ''),
          '10',
          String(a.x),
          '20',
          String(a.y),
          '30',
          '0',
          '11',
          String(b.x),
          '21',
          String(b.y),
          '31',
          '0',
        );
      }
    else
      for (const f of g.faces) {
        const points = clipPolygon(f.points, region);
        if (points.length < 3) continue;
        if (mode === 'solid') {
          for (const triangle of triangulate(points)) {
            lines.push(
              '0',
              '3DFACE',
              '8',
              layer.name.replace(/[^a-zA-Z0-9 _-]/g, ''),
            );
            [...triangle, triangle[2]].forEach((point, i) => {
              const a = p(point);
              lines.push(
                String(10 + i),
                String(a.x),
                String(20 + i),
                String(a.y),
                String(30 + i),
                '0',
              );
            });
          }
          continue;
        }
        lines.push(
          '0',
          'LWPOLYLINE',
          '8',
          layer.name.replace(/[^a-zA-Z0-9 _-]/g, ''),
          '90',
          String(points.length),
          '70',
          '1',
        );
        for (const point of points) {
          const a = p(point);
          lines.push('10', String(a.x), '20', String(a.y));
        }
      }
  }
  return [...lines, '0', 'ENDSEC', '0', 'EOF'].join('\n');
}
