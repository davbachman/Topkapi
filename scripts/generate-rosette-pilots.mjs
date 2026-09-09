/** Rebuild the curated reference collection; this is a development tool, not app code.
 * Construction: Craig S. Kaplan (2005), section 4, Figures 8 and 10–12.
 * https://cs.uwaterloo.ca/~csk/publications/Papers/kaplan_2005.pdf
 *
 * Only regular source polygons are supported. General irregular-polygon
 * transformation and its heuristic ray clustering are deliberately out of scope.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const cache = resolve(root, '.cache/rosette-generator');
await mkdir(cache, { recursive: true });
await writeFile(resolve(cache, 'package.json'), '{"type":"module"}\n');
// Reuse only the app's geometric primitives and planar face extraction. Compile
// these two TS modules locally so generation needs no test run or global tool.
for (const name of ['geometry', 'topology']) {
  const source = await readFile(resolve(root, `lib/engine/${name}.ts`), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  await writeFile(
    resolve(cache, `${name}.js`),
    outputText.replace(/from '(\.\/[^']+)'/g, "from '$1.js'"),
  );
}
const { planarize } = await import(
  pathToFileURL(resolve(cache, 'topology.js'))
);
const {
  add,
  sub,
  mul,
  mix,
  apply,
  distance,
  area,
  centroid,
  cross,
  dot,
  intersection,
  pointSegment,
  cleanSegments,
} = await import(pathToFileURL(resolve(cache, 'geometry.js')));
const sourceCatalog = JSON.parse(
  await readFile(resolve(root, 'lib/engine/catalog.json'), 'utf8'),
);
const analyticSources = JSON.parse(
  await readFile(resolve(root, 'lib/engine/rosette-sources.json'), 'utf8'),
);
const tolerance = 1e-7;
const rounded = (n) => Number(n.toFixed(12));
const point = (p) => ({ x: rounded(p.x), y: rounded(p.y) });
const signaturePoint = (p) =>
  `${Math.round(p.x / tolerance)},${Math.round(p.y / tolerance)}`;
const edgeKey = (a, b) =>
  [signaturePoint(a), signaturePoint(b)].sort().join(';');
const edgesOf = (points) =>
  points.map((a, i) => ({ a, b: points[(i + 1) % points.length] }));
// Deliberate selection: retain the three pilot IDs, then add varied complete
// regular-polygon sources. A square-grid transform would duplicate the grid;
// the legacy 'Snub Hex' entry has unfilled gaps and is not a valid source.
const references = [
  ['4-8-2', 'Rosette · 4.8²'],
  ['4-6-12', 'Rosette · 4.6.12'],
  ['6', 'Rosette · 6³'],
  ['3-12-2', 'Rosette · 3.12²'],
  ['3-4-6', 'Rosette · 3.4.6.4'],
  ['square-12-4-3', 'Rosette · Square 12.4.3'],
  ['3-4-6-12', 'Rosette · 3–4–6–12'],
  ['snub-square', 'Rosette · Snub Square'],
  ['3-3-3-4-4', 'Rosette · 3³.4²'],
];

function regularPolygon(points) {
  const center = centroid(points),
    radius = distance(center, points[0]),
    n = points.length;
  const edgeLength = distance(points[0], points[1]);
  return points.every(
    (p, i) =>
      Math.abs(distance(center, p) - radius) < tolerance &&
      Math.abs(distance(p, points[(i + 1) % n]) - edgeLength) < tolerance,
  );
}

function transformedMap(points) {
  assert(
    regularPolygon(points),
    'Rosette source polygons must be regular after placement.',
  );
  const center = centroid(points),
    n = points.length;
  const midpoints = edgesOf(points).map(({ a, b }) => mix(a, b, 0.5));
  if (n < 5) return midpoints.map((p) => ({ a: center, b: p }));
  const radius = distance(center, points[0]);
  const innerRadius =
    radius *
    (Math.cos(Math.PI / n) -
      Math.sin(Math.PI / n) * Math.tan((Math.PI * (n - 2)) / (4 * n)));
  const inner = midpoints.map((p) =>
    add(center, mul(sub(p, center), innerRadius / distance(p, center))),
  );
  const segments = edgesOf(inner);
  for (let i = 0; i < n; i++) {
    assert(
      Math.abs(
        distance(inner[i], midpoints[i]) -
          distance(inner[i], inner[(i + 1) % n]) / 2,
      ) < tolerance,
      'The regular-polygon construction must satisfy the half-side-length condition.',
    );
    segments.push({ a: inner[i], b: midpoints[i] });
  }
  return segments;
}

function simplify(points) {
  let result = points;
  for (;;) {
    const next = result.filter((p, i) => {
      const before = result[(i + result.length - 1) % result.length],
        after = result[(i + 1) % result.length];
      return (
        pointSegment(p, { a: before, b: after }).distance > tolerance ||
        dot(sub(p, before), sub(after, p)) < 0
      );
    });
    if (next.length === result.length) return result;
    assert(
      next.length >= 3,
      'A transformed face must have at least three corners.',
    );
    result = next;
  }
}

function contactsFor(points, originalEdges) {
  return edgesOf(points).map(({ a, b }) => {
    const hits = [];
    for (const edge of originalEdges) {
      const hit = intersection(a, b, edge.a, edge.b);
      if (
        hit &&
        hit.t > tolerance &&
        hit.t < 1 - tolerance &&
        hit.u >= -tolerance &&
        hit.u <= 1 + tolerance &&
        !hits.some((t) => Math.abs(t - hit.t) < tolerance)
      )
        hits.push(hit.t);
    }
    assert(
      hits.length <= 1,
      'A transformed edge should cross at most one original edge.',
    );
    // Inner regular polygon edges never cross the source tiling; symmetry puts
    // their contacts at midpoints. Merged connectors retain the source crossing.
    return hits.length ? hits[0] : 0.5;
  });
}

/** Match geometry AND directed contacts under cyclic relabelling and rotation.
 * Mirror placements remain separate; an apparently congruent shape with a
 * different contact arrangement must never share a prototype. */
function canonicalFace(points, contacts) {
  const choices = points.map((origin, start) => {
    const edge = sub(points[(start + 1) % points.length], origin),
      len = Math.hypot(edge.x, edge.y);
    const c = edge.x / len,
      s = edge.y / len;
    const canonical = points.map((_, j) => {
      const p = sub(points[(start + j) % points.length], origin);
      return { x: c * p.x + s * p.y, y: -s * p.x + c * p.y };
    });
    const orderedContacts = contacts.map(
      (_, j) => contacts[(start + j) % points.length],
    );
    return {
      signature: canonical
        .map(
          (p, i) =>
            `${signaturePoint(p)}:${Math.round(orderedContacts[i] / tolerance)}`,
        )
        .join(';'),
      points: canonical.map(point),
      contacts: orderedContacts.map(rounded),
      placement: [c, -s, origin.x, s, c, origin.y].map(rounded),
    };
  });
  choices.sort((a, b) => a.signature.localeCompare(b.signature, 'en'));
  return choices[0];
}

function generate(source, name) {
  // Validate the source itself: an incomplete set of regular polygons can
  // still induce planar faces, including faces with repeated-vertex spikes.
  validate(
    {
      ...source,
      tiles: source.tiles.map((tile) => ({
        ...tile,
        contacts: tile.points.map(() => 0.5),
        placements: tile.placements.filter(
          (_, i) => !tile.excluded?.includes(i),
        ),
      })),
    },
    false,
  );
  const { u, v } = source.repetition;
  assert.equal(source.repetition.kind, 'translation');
  const determinant = cross(u, v);
  const coordinates = (p) => ({
    x: cross(p, v) / determinant,
    y: cross(u, p) / determinant,
  });
  const lines = [],
    original = [];
  for (let x = -3; x <= 3; x++)
    for (let y = -3; y <= 3; y++) {
      const offset = add(mul(u, x), mul(v, y));
      for (const tile of source.tiles)
        for (const [i, placement] of tile.placements.entries()) {
          if (tile.excluded?.includes(i)) continue;
          const points = tile.points.map((p) =>
            add(apply(placement, p), offset),
          );
          lines.push(...transformedMap(points));
          original.push(...edgesOf(points));
        }
    }
  const originalEdges = cleanSegments(original);
  const faces = planarize(lines)
    .faces.filter((face) => {
      const p = coordinates(centroid(face.points));
      return (
        p.x >= -tolerance &&
        p.x < 1 - tolerance &&
        p.y >= -tolerance &&
        p.y < 1 - tolerance
      );
    })
    .map((face) => {
      const points = simplify(face.points);
      return { points, contacts: contactsFor(points, originalEdges) };
    });
  assert(
    Math.abs(
      faces.reduce((sum, f) => sum + area(f.points), 0) - Math.abs(determinant),
    ) < tolerance,
    'Whole transformed faces must cover exactly one periodic cell.',
  );

  const groups = new Map();
  for (const face of faces) {
    const canonical = canonicalFace(face.points, face.contacts);
    if (!groups.has(canonical.signature))
      groups.set(canonical.signature, {
        points: canonical.points,
        contacts: canonical.contacts,
        regular: regularPolygon(canonical.points),
        placements: [],
      });
    groups.get(canonical.signature).placements.push(canonical.placement);
  }
  const tiles = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([, tile], i) => ({
      id: `rosette-${i}`,
      ...tile,
      placements: tile.placements.sort((a, b) =>
        a.join(',').localeCompare(b.join(','), 'en'),
      ),
    }));
  const sourcePolygons = source.tiles.flatMap((tile) =>
    tile.placements.flatMap((placement, i) =>
      tile.excluded?.includes(i)
        ? []
        : [tile.points.map((p) => apply(placement, p))],
    ),
  );
  const orders = [
    ...new Set(sourcePolygons.map((p) => p.length).filter((n) => n >= 5)),
  ].sort((a, b) => a - b);
  // Center collection previews on a complete highest-order rosette, preferring
  // the polygon nearest the origin. Sources of triangles/squares still get a
  // well-centered patch and an honest empty list of rosette orders.
  const focus = sourcePolygons.sort(
    (a, b) =>
      b.length - a.length ||
      Math.hypot(centroid(a).x, centroid(a).y) -
        Math.hypot(centroid(b).x, centroid(b).y),
  )[0];
  const focusCenter = centroid(focus);
  const analytic = analyticSources.some((s) => s.id === source.id);
  const sourceCredit = analytic
    ? 'Source tiling: analytic reconstruction of a standard regular-polygon tiling by David Bachman with GPT 6 Astra.'
    : 'Source tiling: Craig S. Kaplan / Taprats and Pierre Baillargeon / Alhambra.';
  const result = {
    id: `rosette-${source.id}`,
    name,
    description: `Precomputed rosette transform of ${source.name}. Constructed from Craig S. Kaplan’s 2005 “Islamic Star Patterns from Polygons in Contact”, section 4. Contacts preserve intersections with the source tiling${source.id === '4-8-2' ? ', including the off-midpoint adjustment in Figures 11–12' : ''}. ${sourceCredit}`,
    author: 'Craig S. Kaplan; reconstruction by David Bachman with GPT 6 Astra',
    collection: 'rosette',
    rosette: {
      sourceId: source.id,
      sourceName: name.replace(/^Rosette · /, ''),
      orders,
      preview: {
        center: point(focusCenter),
        radius: rounded(1.25 * distance(focusCenter, focus[0])),
      },
    },
    recommended: { angle: 45, separation: 0 },
    tiles,
    repetition: { kind: 'translation', u: point(u), v: point(v) },
  };
  validate(result);
  return result;
}

/** A separate periodic-edge check catches missing/duplicate faces, wrong
 * direction on a contact, and errors introduced by prototype merging. */
function validate(tiling, report = true) {
  assert.equal(
    tiling.repetition.kind,
    'translation',
    'Rosette sources must repeat by translation.',
  );
  const { u, v } = tiling.repetition,
    det = cross(u, v);
  assert(
    Number.isFinite(det) && Math.abs(det) > tolerance,
    'The periodic cell must have nonzero finite area.',
  );
  const edgeOrbits = new Map(),
    vertexOrbits = new Set();
  let totalArea = 0,
    faceCount = 0,
    offMidpoint = 0;
  const reduce = (p) => {
    const x = Math.floor(cross(p, v) / det + tolerance),
      y = Math.floor(cross(u, p) / det + tolerance);
    return sub(p, add(mul(u, x), mul(v, y)));
  };
  for (const tile of tiling.tiles)
    for (const placement of tile.placements) {
      const points = tile.points.map((p) => apply(placement, p));
      assert(points.length >= 3, 'A face must have at least three vertices.');
      assert.equal(
        new Set(points.map(signaturePoint)).size,
        points.length,
        'A face must not revisit a vertex or contain dangling spikes.',
      );
      assert(
        area(points) > tolerance,
        'Faces must have positive area and counterclockwise winding.',
      );
      for (const [i, edge] of edgesOf(points).entries()) {
        assert(
          distance(edge.a, edge.b) > tolerance,
          'Faces must not contain zero-length edges.',
        );
        for (const [j, other] of edgesOf(points).entries()) {
          if (j <= i || j === i + 1 || (i === 0 && j === points.length - 1))
            continue;
          const hit = intersection(edge.a, edge.b, other.a, other.b);
          assert(
            !hit ||
              hit.t < -tolerance ||
              hit.t > 1 + tolerance ||
              hit.u < -tolerance ||
              hit.u > 1 + tolerance,
            'A face must be a simple polygon.',
          );
          assert(
            [
              pointSegment(edge.a, other),
              pointSegment(edge.b, other),
              pointSegment(other.a, edge),
              pointSegment(other.b, edge),
            ].every((p) => p.distance > tolerance),
            'Nonadjacent edges must not touch or overlap.',
          );
        }
      }
      totalArea += area(points);
      faceCount++;
      for (const [i, { a, b }] of edgesOf(points).entries()) {
        vertexOrbits.add(signaturePoint(reduce(a)));
        const offset = sub(mix(a, b, 0.5), reduce(mix(a, b, 0.5)));
        const aa = sub(a, offset),
          bb = sub(b, offset),
          contact = sub(mix(a, b, tile.contacts[i]), offset);
        const k = edgeKey(aa, bb);
        const entries = edgeOrbits.get(k) || [];
        entries.push({ a: aa, b: bb, contact });
        edgeOrbits.set(k, entries);
        if (Math.abs(tile.contacts[i] - 0.5) > tolerance) offMidpoint++;
      }
    }
  assert(
    Math.abs(totalArea - Math.abs(det)) < tolerance,
    'Prototype placements must preserve periodic area.',
  );
  for (const entries of edgeOrbits.values()) {
    assert.equal(
      entries.length,
      2,
      'Every periodic edge must belong to exactly two faces.',
    );
    assert(
      distance(entries[0].a, entries[1].b) < tolerance &&
        distance(entries[0].b, entries[1].a) < tolerance,
      'Paired edges must have opposite directions.',
    );
    assert(
      distance(entries[0].contact, entries[1].contact) < tolerance,
      'Neighboring explicit contacts must coincide.',
    );
  }
  assert.equal(
    vertexOrbits.size - edgeOrbits.size + faceCount,
    0,
    'A periodic cell must have torus Euler characteristic zero.',
  );
  if (report)
    console.log(
      `${tiling.name}: ${faceCount} faces, ${tiling.tiles.length} prototypes, ${edgeOrbits.size} edge orbits, ${offMidpoint} directed off-midpoint contacts.`,
    );
}

const tilings = references.map(([id, name]) => {
  const source = [...sourceCatalog, ...analyticSources].find(
    (t) => t.id === id,
  );
  assert(source, `Missing source tiling ${id}.`);
  return generate(source, name);
});
const output = `${JSON.stringify(tilings, null, 2)}\n`;
const outputPath = resolve(root, 'lib/engine/rosette-pilots.json');
if (process.argv.includes('--check')) {
  assert.equal(
    await readFile(outputPath, 'utf8'),
    output,
    'Precomputed rosette collection is stale; rerun this script.',
  );
  console.log('Precomputed rosette collection is reproducible.');
} else {
  await writeFile(outputPath, output);
  console.log('Wrote lib/engine/rosette-pilots.json.');
}
