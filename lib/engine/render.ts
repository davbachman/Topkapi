import type { Geometry, Layer, Project, Point, Bounds } from './types';
import { mul, add, key, bounds } from './geometry';
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
export function faceColors(g: Geometry): Map<string, boolean> {
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
      outlineWidth: layer.style.outlineWidth * scale,
      gap: layer.style.gap * scale,
    },
    id = (options.id || layer.id).replace(/[^a-zA-Z0-9_-]/g, ''),
    color = esc(s.color),
    outline = esc(s.outline),
    opacity = s.opacity;
  const paths = strands(g),
    line = paths.map((p) => pathData(p)).join(''),
    sw = s.kind === 'plain' || s.kind === 'sketch' ? 0.014 : s.width;
  const attrs = `fill="none" stroke-linecap="round" stroke-linejoin="${s.join}"`;
  const stroke = (d: string, c: string, w: number, extra = '') =>
    `<path d="${d}" stroke="${c}" stroke-width="${num(w)}" ${attrs} ${extra}/>`;
  let body = '';
  const tones = faceColors(g);
  for (const f of g.faces) {
    const paint = layer.regionColors[f.id];
    if (paint || (s.kind === 'filled' && tones.get(f.id)))
      body += `<path d="${pathData(f.points, true)}" fill="${esc(paint || s.color)}"/>`;
  }
  if (s.kind !== 'filled') {
    let ink = '';
    if (
      s.outlineWidth > 0 &&
      s.kind !== 'plain' &&
      s.kind !== 'thick' &&
      s.kind !== 'sketch'
    )
      ink += stroke(line, outline, sw + 2 * s.outlineWidth);
    if (s.kind === 'emboss') {
      const a = (s.light * Math.PI) / 180,
        x = Math.cos(a),
        y = Math.sin(a);
      body += `<defs><linearGradient id="emboss-${id}" x1="${50 - 50 * x}%" y1="${50 - 50 * y}%" x2="${50 + 50 * x}%" y2="${50 + 50 * y}%"><stop stop-color="${color}"/><stop offset=".48" stop-color="${color}"/><stop offset=".5" stop-color="#ffffff"/><stop offset="1" stop-color="${outline}"/></linearGradient></defs>`;
      ink += stroke(line, `url(#emboss-${id})`, sw);
    } else if (s.kind === 'sketch') {
      for (let i = 0; i < 3; i++)
        ink += stroke(
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
    } else ink += stroke(line, color, sw);
    if (s.kind === 'interlace' && g.crossings.length) {
      const halfWidth = sw / 2 + s.outlineWidth;
      const crossingSpan = (c: Geometry['crossings'][number]) =>
        Math.min(
          1,
          (halfWidth + s.gap) /
            Math.max(
              0.05,
              Math.abs(c.over.x * c.under.y - c.over.y * c.under.x),
            ),
        );
      const b = bounds(g.nodes.map((n) => n.point)),
        pad = s.width + s.outlineWidth + s.gap + 1;
      const maskBox = `x="${num(b.minX - pad)}" y="${num(b.minY - pad)}" width="${num(b.maxX - b.minX + 2 * pad)}" height="${num(b.maxY - b.minY + 2 * pad)}"`;
      const cut = g.crossings
        .map((c) => {
          const under = c.under,
            span = crossingSpan(c);
          return stroke(
            pathData([
              add(c.point, mul(under, -span)),
              add(c.point, mul(under, span)),
            ]),
            '#000',
            sw + 2 * s.outlineWidth + 0.004,
          );
        })
        .join('');
      body += `<defs><mask id="weave-${id}" maskUnits="userSpaceOnUse" ${maskBox}><rect ${maskBox} fill="#fff"/>${cut}</mask></defs><g mask="url(#weave-${id})">${ink}</g>`;
      for (const c of g.crossings) {
        const span = crossingSpan(c);
        const d = pathData([
          add(c.point, mul(c.over, -span)),
          add(c.point, mul(c.over, span)),
        ]);
        if (s.outlineWidth) body += stroke(d, outline, sw + 2 * s.outlineWidth);
        body += stroke(d, color, sw);
      }
    } else body += ink;
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
