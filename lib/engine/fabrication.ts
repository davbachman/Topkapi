import type { Bounds, Geometry, Layer, Project } from './types';
import { distance } from './geometry';
import { clipSegment } from './construction';
import { planarize } from './topology';
export type FabricationReport = {
  name: string;
  bandWidth: number | null;
  belowMinimum: boolean;
  length: number;
  components: number;
  openEnds: number;
  junctions: number;
  weaveConflicts: number;
  edges: number;
};
export function inspectFabrication(
  project: Project,
  geometries: Record<string, Geometry>,
  region: Bounds,
  minimum: number,
): FabricationReport[] {
  const unitsPerWorld = project.width / (region.maxX - region.minX);
  return project.layers
    .filter((l) => l.visible && geometries[l.id])
    .map((layer: Layer) => {
      const g = geometries[layer.id],
        lines = g.edges.flatMap((edge) => {
          const s = clipSegment(
            { a: g.nodes[edge.a].point, b: g.nodes[edge.b].point },
            region,
          );
          return s ? [s] : [];
        }),
        cropped = planarize(lines),
        visited = new Set<number>();
      let components = 0;
      for (let start = 0; start < cropped.nodes.length; start++) {
        if (visited.has(start) || !cropped.nodes[start].edges.length) continue;
        components++;
        const q = [start];
        visited.add(start);
        for (let i = 0; i < q.length; i++) {
          for (const e of cropped.nodes[q[i]].edges) {
            const edge = cropped.edges[e],
              next = edge.a === q[i] ? edge.b : edge.a;
            if (!visited.has(next)) {
              visited.add(next);
              q.push(next);
            }
          }
        }
      }
      const interior = (p: { x: number; y: number }) =>
        p.x > region.minX + 1e-5 &&
        p.x < region.maxX - 1e-5 &&
        p.y > region.minY + 1e-5 &&
        p.y < region.maxY - 1e-5;
      const width =
        layer.style.kind === 'filled'
          ? null
          : (['plain', 'sketch'].includes(layer.style.kind)
              ? 0.014
              : layer.style.width * layer.transform.scale) * unitsPerWorld;
      return {
        name: layer.name,
        bandWidth: width,
        belowMinimum: width !== null && width < minimum,
        length:
          lines.reduce((a, s) => a + distance(s.a, s.b), 0) * unitsPerWorld,
        components,
        openEnds: cropped.nodes.filter(
          (n) => n.edges.length === 1 && interior(n.point),
        ).length,
        junctions: cropped.nodes.filter(
          (n) =>
            n.edges.length !== 1 &&
            n.edges.length !== 2 &&
            n.edges.length !== 4 &&
            interior(n.point),
        ).length,
        weaveConflicts: g.crossings.filter(
          (c) => c.conflict && interior(c.point),
        ).length,
        edges: cropped.edges.length,
      };
    });
}
