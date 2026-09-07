import type { Layer, Point, Geometry, Segment } from './types';
import {
  apply,
  compose,
  inverse,
  transformation,
  normalize,
  sub,
} from './geometry';
import { makeMotif } from './motifs';
import { planarize } from './topology';
/** Weave choices live on a doubled translation cell. A translation may reverse
 * the weave phase, so one cell is insufficient; two cells represent both parities.
 * The constraint graph is independent of viewport, zoom, layer pose and export. */
const cache = new Map<string, Map<string, number>>();
const angle = (d: Point) => {
  let a = Math.atan2(d.y, d.x);
  if (a < 0) a += Math.PI;
  if (a >= Math.PI - 1e-7) a = 0;
  return a;
};
function canonicalPair(directions: Point[], index: number): number {
  const a = Math.min(angle(directions[0]), angle(directions[2])),
    b = Math.min(angle(directions[1]), angle(directions[3]));
  return (index % 2) ^ (a <= b ? 0 : 1);
}
function pair(
  g: Pick<Geometry, 'nodes' | 'edges'>,
  node: number,
  edge: number,
): number {
  const p = g.nodes[node].point;
  const directions = g.nodes[node].edges.map((i) => {
    const e = g.edges[i];
    return normalize(sub(g.nodes[e.a === node ? e.b : e.a].point, p));
  });
  return canonicalPair(directions, g.nodes[node].edges.indexOf(edge));
}
export function stabilizeWeave(layer: Layer, g: Geometry): void {
  if (
    layer.frozen ||
    layer.tiling.repetition.kind !== 'translation' ||
    !g.crossings.length
  )
    return;
  const rep = layer.tiling.repetition,
    lattice = inverse([rep.u.x, rep.v.x, 0, rep.u.y, rep.v.y, 0]),
    pose = inverse(
      transformation(
        layer.transform.x,
        layer.transform.y,
        (layer.transform.rotation * Math.PI) / 180,
        layer.transform.scale,
      ),
    );
  const wrap = (p: Point) => {
    const q = apply(lattice, p);
    const axis = (n: number) =>
      ((Math.round(n * 1e5) % 200000) + 200000) % 200000;
    return `${axis(q.x)}:${axis(q.y)}`;
  };
  const identity = JSON.stringify([layer.tiling, layer.motifs]);
  let phases = cache.get(identity);
  if (!phases) {
    const lines: Segment[] = [];
    const motifs = layer.tiling.tiles.map((t) => ({
      t,
      lines: makeMotif(t, layer.motifs[t.id]),
    }));
    for (let x = -1; x <= 2; x++)
      for (let y = -1; y <= 2; y++)
        for (const { t, lines: motif } of motifs)
          for (const [i, m] of t.placements.entries()) {
            if (t.excluded?.includes(i)) continue;
            const tr = compose(
              transformation(
                x * rep.u.x + y * rep.v.x,
                x * rep.u.y + y * rep.v.y,
              ),
              m,
            );
            for (const s of motif)
              lines.push({ a: apply(tr, s.a), b: apply(tr, s.b) });
          }
    if (lines.length > 120000)
      throw Error(
        'This construction is too dense to solve its repeating weave. Reduce its complexity.',
      );
    const reference = planarize(lines),
      adj = new Map<string, { key: string; xor: number }[]>(),
      other = (edge: number, node: number) =>
        reference.edges[edge].a === node
          ? reference.edges[edge].b
          : reference.edges[edge].a;
    for (let n = 0; n < reference.nodes.length; n++) {
      if (reference.nodes[n].edges.length !== 4) continue;
      const key = wrap(reference.nodes[n].point),
        links = adj.get(key) || [];
      for (const first of reference.nodes[n].edges) {
        let edge = first,
          current = other(edge, n),
          steps = 0;
        while (
          reference.nodes[current].edges.length === 2 &&
          steps++ < reference.edges.length
        ) {
          edge = reference.nodes[current].edges.find((e) => e !== edge)!;
          current = other(edge, current);
        }
        if (reference.nodes[current].edges.length === 4) {
          const target = wrap(reference.nodes[current].point),
            xor =
              1 ^ pair(reference, n, first) ^ pair(reference, current, edge);
          if (!links.some((l) => l.key === target && l.xor === xor))
            links.push({ key: target, xor });
        }
      }
      adj.set(key, links);
    }
    phases = new Map();
    for (const start of [...adj.keys()].sort()) {
      if (phases.has(start)) continue;
      phases.set(start, 0);
      const queue = [start];
      for (let i = 0; i < queue.length; i++) {
        const from = queue[i];
        for (const to of (adj.get(from) || []).sort((a, b) =>
          a.key.localeCompare(b.key),
        ))
          if (!phases.has(to.key)) {
            phases.set(to.key, phases.get(from)! ^ to.xor);
            queue.push(to.key);
          }
      }
    }
    if (cache.size >= 12) cache.delete(cache.keys().next().value!);
    cache.set(identity, phases);
  }
  const nodes = new Map(
    g.nodes.map((n, i) => [`${n.point.x}:${n.point.y}`, i]),
  );
  for (const c of g.crossings) {
    const p = apply(pose, c.point),
      key = wrap(p);
    let value = phases.get(key);
    if (value === undefined) {
      const [x, y] = key.split(':').map(Number);
      for (const dx of [-1, 0, 1])
        for (const dy of [-1, 0, 1]) {
          const v = phases.get(
            `${(x + dx + 200000) % 200000}:${(y + dy + 200000) % 200000}`,
          );
          if (v !== undefined) value = v;
        }
    }
    if (value === undefined) continue;
    const node = nodes.get(`${c.point.x}:${c.point.y}`)!,
      world = g.nodes[node].edges.map((i) => {
        const e = g.edges[i];
        return normalize(sub(g.nodes[e.a === node ? e.b : e.a].point, c.point));
      });
    const local = world.map((d) =>
      normalize(
        sub(apply(pose, { x: c.point.x + d.x, y: c.point.y + d.y }), p),
      ),
    );
    const indices = [0, 1, 2, 3].sort(
      (a, b) => angle(local[a]) - angle(local[b]),
    );
    c.over = world[indices.find((i) => canonicalPair(local, i) === value)!];
    c.under = world[indices.find((i) => canonicalPair(local, i) !== value)!];
  }
}
