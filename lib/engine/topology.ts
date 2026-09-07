import type {
  Point,
  Segment,
  GraphNode,
  GraphEdge,
  Geometry,
  Face,
  Crossing,
} from './types';
import {
  EPS,
  key,
  sub,
  mix,
  intersection,
  pointSegment,
  bounds,
  area,
  normalize,
  cleanSegments,
} from './geometry';
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
export function faceId(points: Point[]) {
  return hash(points.map(key).sort().join(';'));
}
/** Spatial broad phase, exact segment intersections, then a planar half-edge walk. */
export function planarize(
  source: Segment[],
): Pick<Geometry, 'nodes' | 'edges' | 'faces' | 'crossings' | 'warnings'> {
  const lines = cleanSegments(source),
    cuts = lines.map(() => [0, 1]),
    seen = new Set<string>(),
    cells = new Map<string, number[]>();
  const b = bounds(lines.flatMap((s) => [s.a, s.b]));
  const cell = Math.max(
    0.03,
    (b.maxX - b.minX) / 150,
    (b.maxY - b.minY) / 150,
    Math.sqrt(
      Math.max(0.01, (b.maxX - b.minX) * (b.maxY - b.minY)) /
        Math.max(1, lines.length / 3),
    ),
  );
  for (let i = 0; i < lines.length; i++) {
    const bb = bounds([lines[i].a, lines[i].b]);
    const candidates = new Set<number>();
    for (
      let x = Math.floor(bb.minX / cell);
      x <= Math.floor(bb.maxX / cell);
      x++
    )
      for (
        let y = Math.floor(bb.minY / cell);
        y <= Math.floor(bb.maxY / cell);
        y++
      ) {
        const k = `${x}:${y}`,
          list = cells.get(k) || [];
        list.forEach((j) => candidates.add(j));
        list.push(i);
        cells.set(k, list);
      }
    for (const j of candidates) {
      const pair = `${j}:${i}`;
      if (seen.has(pair)) continue;
      seen.add(pair);
      if (seen.size > 2000000)
        throw Error(
          'This pattern has too many intersections. Zoom in or simplify the motif.',
        );
      const a = lines[i],
        c = lines[j];
      const hit = intersection(a.a, a.b, c.a, c.b);
      if (
        hit &&
        hit.t >= -EPS &&
        hit.t <= 1 + EPS &&
        hit.u >= -EPS &&
        hit.u <= 1 + EPS
      ) {
        cuts[i].push(Math.max(0, Math.min(1, hit.t)));
        cuts[j].push(Math.max(0, Math.min(1, hit.u)));
      } else if (!hit) {
        for (const p of [c.a, c.b]) {
          const v = pointSegment(p, a);
          if (v.distance < EPS) cuts[i].push(v.t);
        }
        for (const p of [a.a, a.b]) {
          const v = pointSegment(p, c);
          if (v.distance < EPS) cuts[j].push(v.t);
        }
      }
    }
  }
  const nodes: GraphNode[] = [],
    edges: GraphEdge[] = [],
    nodeIds = new Map<string, number>(),
    edgeIds = new Set<string>();
  function node(p: Point) {
    const k = key(p);
    let i = nodeIds.get(k);
    if (i === undefined) {
      i = nodes.length;
      nodeIds.set(k, i);
      nodes.push({ point: p, edges: [] });
    }
    return i;
  }
  for (let i = 0; i < lines.length; i++) {
    const ts = [
      ...new Set(cuts[i].map((t) => Math.round(t * 1e10) / 1e10)),
    ].sort((a, b) => a - b);
    for (let j = 1; j < ts.length; j++) {
      const a = node(mix(lines[i].a, lines[i].b, ts[j - 1])),
        b = node(mix(lines[i].a, lines[i].b, ts[j]));
      if (a === b) continue;
      const k = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (edgeIds.has(k)) continue;
      edgeIds.add(k);
      nodes[a].edges.push(edges.length);
      nodes[b].edges.push(edges.length);
      edges.push({ a, b });
      if (edges.length > 100000)
        throw Error(
          'This pattern has too many edges. Zoom in or simplify the motif.',
        );
    }
  }
  const other = (e: number, n: number) =>
    edges[e].a === n ? edges[e].b : edges[e].a;
  for (let n = 0; n < nodes.length; n++)
    nodes[n].edges.sort((a, b) => {
      const p = nodes[n].point,
        aa = sub(nodes[other(a, n)].point, p),
        bb = sub(nodes[other(b, n)].point, p);
      return Math.atan2(aa.y, aa.x) - Math.atan2(bb.y, bb.x);
    });
  const visited = new Set<string>(),
    faces: Face[] = [];
  for (let e = 0; e < edges.length; e++)
    for (const start of [edges[e].a, edges[e].b]) {
      if (visited.has(`${e}:${start}`)) continue;
      let n = start,
        edge = e;
      const points: Point[] = [];
      let closed = false;
      for (
        let steps = 0;
        steps < Math.min(edges.length * 2 + 1, 10000);
        steps++
      ) {
        const k = `${edge}:${n}`;
        if (visited.has(k)) {
          closed = edge === e && n === start;
          break;
        }
        visited.add(k);
        points.push(nodes[n].point);
        const next = other(edge, n),
          options = nodes[next].edges,
          index = options.indexOf(edge);
        edge = options[(index + options.length - 1) % options.length];
        n = next;
      }
      if (closed && points.length >= 3) {
        const a = area(points);
        if (a > EPS)
          faces.push({
            id: faceId(points),
            points,
            area: a,
          });
      }
    }
  // A node variable chooses which opposite edge pair crosses over. Along each
  // uninterrupted strand the crossing choice must alternate.
  const crossingNodes = nodes
      .map((n, i) => (n.edges.length === 4 ? i : -1))
      .filter((i) => i >= 0),
    adj = new Map<number, { node: number; xor: number }[]>();
  for (const n of crossingNodes) {
    const links: { node: number; xor: number }[] = [];
    for (let k = 0; k < 4; k++) {
      let edge = nodes[n].edges[k],
        current = other(edge, n),
        steps = 0;
      while (nodes[current].edges.length === 2 && steps++ < edges.length) {
        edge = nodes[current].edges.find((e) => e !== edge)!;
        current = other(edge, current);
      }
      if (nodes[current].edges.length === 4)
        links.push({
          node: current,
          xor: 1 ^ (k % 2) ^ (nodes[current].edges.indexOf(edge) % 2),
        });
    }
    adj.set(n, links);
  }
  const choices = new Map<number, number>(),
    conflicts = new Set<number>();
  for (const start of crossingNodes) {
    if (choices.has(start)) continue;
    choices.set(start, 0);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const n = queue[i];
      for (const a of adj.get(n) || []) {
        const value = choices.get(n)! ^ a.xor;
        if (!choices.has(a.node)) {
          choices.set(a.node, value);
          queue.push(a.node);
        } else if (choices.get(a.node) !== value) {
          conflicts.add(n);
          conflicts.add(a.node);
        }
      }
    }
  }
  const crossings: Crossing[] = crossingNodes.map((n) => ({
    point: nodes[n].point,
    over: normalize(
      sub(
        nodes[other(nodes[n].edges[choices.get(n)!], n)].point,
        nodes[n].point,
      ),
    ),
    under: normalize(
      sub(
        nodes[other(nodes[n].edges[1 - choices.get(n)!], n)].point,
        nodes[n].point,
      ),
    ),
    conflict: conflicts.has(n),
  }));
  const warnings: Geometry['warnings'] = [];
  for (let n = 0; n < nodes.length; n++) {
    const degree = nodes[n].edges.length;
    if (degree === 1)
      warnings.push({ point: nodes[n].point, kind: 'endpoint' });
    else if (degree !== 2 && degree !== 4)
      warnings.push({ point: nodes[n].point, kind: 'junction' });
    if (conflicts.has(n))
      warnings.push({ point: nodes[n].point, kind: 'weave' });
  }
  return { nodes, edges, faces, crossings, warnings };
}
