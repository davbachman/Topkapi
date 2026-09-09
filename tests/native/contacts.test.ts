import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Matrix, Point, Segment, Tiling } from '../../lib/engine/types';
import {
  apply,
  area,
  compose,
  distance,
  IDENTITY,
  inverse,
  key,
  mix,
  rotate,
  transformation,
} from '../../lib/engine/geometry';
import { clipToTile } from '../../lib/engine/construction';
import { twoPointHankin } from '../../lib/engine/hankin';
import { makeMotif } from '../../lib/engine/motifs';
import {
  placedMotifs,
  twoPointDistance,
  twoPointTile,
} from '../../lib/engine/placed';
import { planarize } from '../../lib/engine/topology';
import { generate } from '../../lib/engine/generate';
import { exportSVG } from '../../lib/engine/render';
import { exportEPS } from '../../lib/engine/eps';
import {
  defaultMotif,
  catalog,
  newLayer,
  newProject,
  updateProject,
  undo,
  redo,
} from '../../lib/project/model';
import { decodeProject } from '../../lib/project/storage';
import { decodeTiling, exportTiling } from '../../lib/project/tilings';

const p = (x: number, y: number) => ({ x, y });
const square = [p(0, 0), p(1, 0), p(1, 1), p(0, 1)];
const contacts = [0.25, 0.75, 0.25, 0.75];
const region = { minX: -3, minY: -3, maxX: 3, maxY: 3 };

function length(lines: Segment[]) {
  const graph = planarize(lines);
  return graph.edges.reduce(
    (sum, e) => sum + distance(graph.nodes[e.a].point, graph.nodes[e.b].point),
    0,
  );
}
function sameCoverage(actual: Segment[], expected: Segment[]) {
  const a = length(actual),
    b = length(expected),
    union = length([...actual, ...expected]);
  assert.ok(Math.abs(a - b) < 1e-6, `Lengths differ: ${a} != ${b}`);
  assert.ok(
    Math.abs(a - union) < 1e-6,
    `Unexpected geometry: ${union} != ${a}`,
  );
}

// At 45 degrees the four sides are opposing collinear rays. Their equations
// follow directly from the prescribed quarter-edge contacts, without using the
// implementation's intersection or pairing routines.
function quarterDiamond(delta: number): Segment[] {
  const h = delta / 2;
  return [
    { a: p(0.25 - h, 0), b: p(1, 0.75 + h) },
    { a: p(1, 0.75 - h), b: p(0.75 - h, 1) },
    { a: p(0.75 + h, 1), b: p(0, 0.25 - h) },
    { a: p(0, 0.25 + h), b: p(0.25 + h, 0) },
  ];
}

// The second square prototype has a different normalization. Complementary
// fractions on reversed shared edges locate the same physical contact point.
function contactTiling(): Tiling {
  return {
    id: 'contact-checkerboard',
    name: 'Quarter-edge contact checkerboard',
    description: '',
    author: '',
    repetition: { kind: 'translation', u: p(2, 0), v: p(0, 2) },
    tiles: [
      {
        id: 'a',
        points: structuredClone(square),
        placements: [IDENTITY, [1, 0, 1, 0, 1, 1]],
        regular: true,
        contacts: [...contacts],
      },
      {
        id: 'b',
        points: square.map((v) => p(v.x * 10, v.y * 10)),
        placements: [
          [0.1, 0, 1, 0, 0.1, 0],
          [0.1, 0, 0, 0, 0.1, 1],
        ],
        regular: true,
        contacts: contacts.map((t) => 1 - t),
      },
    ],
  };
}

void test('off-midpoint Hankin contacts match analytic diagonals and clamp separation inside every edge', () => {
  for (const delta of [0, 0.01, 0.1, 0.25, 0.49, 0.5, 1]) {
    const actual = twoPointHankin(square, 45, delta, contacts),
      expected = quarterDiamond(Math.min(delta, 0.5));
    sameCoverage(actual, expected);
    const reversedContacts = contacts.map(
      (_, i) =>
        1 -
        contacts[(contacts.length - 2 - i + contacts.length) % contacts.length],
    );
    sameCoverage(
      twoPointHankin([...square].reverse(), 45, delta, reversedContacts),
      expected,
    );
  }
  for (const delta of [0, 0.25, 1])
    sameCoverage(
      twoPointHankin(square, 45, delta, [0.5, 0.5, 0.5, 0.5]),
      twoPointHankin(square, 45, delta),
    );
});

void test('directed contact fractions survive rotation, reflection and uniform scaling', () => {
  const transforms: Matrix[] = [
    [-1, 0, 2, 0, 1, 0],
    transformation(2, -3, 0.71, 1.4),
    [0, -2, -1, -2, 0, 3],
  ];
  for (const angle of [15, 30, 45, 60, 75]) {
    const original = twoPointHankin(square, angle, 0.2, contacts);
    for (const transform of transforms) {
      const scale = Math.hypot(transform[0], transform[3]);
      sameCoverage(
        twoPointHankin(
          square.map((v) => apply(transform, v)),
          angle,
          0.2 * scale,
          contacts,
        ),
        original.map((s) => ({
          a: apply(transform, s.a),
          b: apply(transform, s.b),
        })),
      );
    }
  }
});

void test('neighboring placed tiles share off-midpoint contacts, previews and continuous repeated strands', () => {
  const layer = newLayer(contactTiling());
  layer.twoPoint = { angle: 45, separation: 0.5 };
  assert.equal(twoPointDistance(layer.tiling, 0.5), 0.25);
  const figures = placedMotifs(layer),
    graph = planarize(figures.flatMap((f) => f.segments));
  for (const y of [0.625, 0.875]) {
    const node = graph.nodes.find((n) => distance(n.point, p(1, y)) < 1e-7);
    assert.equal(node?.edges.length, 2, `Shared contact failed at (1, ${y})`);
  }
  for (const tile of layer.tiling.tiles) {
    const back = inverse(tile.placements[0]),
      expected = figures.find((f) => f.tileId === tile.id)!.segments;
    sameCoverage(
      twoPointTile(layer, tile),
      expected.map((s) => ({ a: apply(back, s.a), b: apply(back, s.b) })),
    );
  }
  for (const separation of [0, 0.25, 0.5, 0.9]) {
    layer.twoPoint.separation = separation;
    const g = generate(layer, region);
    assert.equal(
      g.warnings.filter(
        (w) => Math.abs(w.point.x) < 2 && Math.abs(w.point.y) < 2,
      ).length,
      0,
      `Interior disconnect at separation ${separation}`,
    );
  }
  const tile = layer.tiling.tiles[0];
  sameCoverage(
    makeMotif(tile, { ...defaultMotif(false), angle: 45 }),
    quarterDiamond(0),
  );
});

void test('one physical gap respects asymmetric contacts, excluded placements and shrinking inflation rings', () => {
  const tiling = contactTiling();
  tiling.tiles[0].contacts![0] = 0.1;
  assert.ok(Math.abs(twoPointDistance(tiling, 0.5) - 0.1) < 1e-10);
  tiling.tiles[0].placements.push([0.001, 0, 5, 0, 0.001, 0]);
  tiling.tiles[0].excluded = [2];
  assert.ok(Math.abs(twoPointDistance(tiling, 0.5) - 0.1) < 1e-10);
  tiling.repetition = {
    kind: 'inflation',
    center: p(0, 0),
    sectors: 4,
    rings: 3,
    transform: [0.5, 0, 0, 0, 0.5, 0],
  };
  assert.ok(Math.abs(twoPointDistance(tiling, 0.5) - 0.025) < 1e-10);
});

void test('contacts and recommended settings round-trip and undo; invalid data and lossy exports are rejected', () => {
  const tiling = contactTiling();
  tiling.recommended = { angle: 45, separation: 0.25 };
  const layer = newLayer(tiling),
    original = { ...newProject(), layers: [layer] };
  assert.deepEqual(layer.twoPoint, tiling.recommended);
  const decoded = decodeProject(JSON.stringify(original));
  assert.deepEqual(decoded, original);
  const withoutLayerSettings = structuredClone(original);
  delete withoutLayerSettings.layers[0].twoPoint;
  assert.deepEqual(
    decodeProject(JSON.stringify(withoutLayerSettings)).layers[0].twoPoint,
    tiling.recommended,
  );
  delete withoutLayerSettings.layers[0].tiling.recommended;
  assert.deepEqual(
    decodeProject(JSON.stringify(withoutLayerSettings)).layers[0].twoPoint,
    { angle: 45, separation: 0 },
  );
  assert.deepEqual(decodeTiling(JSON.stringify(tiling)), tiling);
  sameCoverage(
    generate(decoded.layers[0], region).segments,
    generate(layer, region).segments,
  );
  let history = updateProject(
    { past: [], present: original, future: [] },
    (project) => {
      project.layers[0].tiling.tiles[0].contacts = [0.3, 0.7, 0.3, 0.7];
    },
  );
  const edited = structuredClone(history.present);
  history = undo(history);
  assert.deepEqual(history.present, original);
  history = redo(history);
  assert.deepEqual(history.present, edited);
  for (const invalid of [
    null,
    [],
    [0.25],
    [0.25, 0.75, 0.25, 0.75, 0.5],
    [0, 0.5, 0.5, 0.5],
    [1, 0.5, 0.5, 0.5],
    [null, 0.5, 0.5, 0.5],
    ['0.25', 0.75, 0.25, 0.75],
  ]) {
    const project = structuredClone(original) as unknown as {
      layers: { tiling: { tiles: { contacts: unknown }[] } }[];
    };
    project.layers[0].tiling.tiles[0].contacts = invalid;
    assert.throws(() => decodeProject(JSON.stringify(project)));
  }
  for (const invalid of [
    null,
    [],
    { angle: 45 },
    { angle: 0, separation: 0 },
    { angle: 45, separation: 1.1 },
    { angle: 45, separation: '0.25' },
  ]) {
    const project = structuredClone(original) as unknown as {
      layers: { tiling: { recommended: unknown } }[];
    };
    project.layers[0].tiling.recommended = invalid;
    assert.throws(() => decodeProject(JSON.stringify(project)));
  }
  assert.throws(() => exportTiling(tiling));
  assert.throws(() => exportTiling(tiling, true));
});

void test('saved off-midpoint contact designs export finite geometry in every drawing style', () => {
  const layer = newLayer(contactTiling());
  layer.twoPoint = { angle: 45, separation: 0.25 };
  const project = decodeProject(
      JSON.stringify({ ...newProject(), layers: [layer] }),
    ),
    savedLayer = project.layers[0],
    geometry = generate(savedLayer, region);
  assert.ok(geometry.edges.length > 10);
  for (const kind of [
    'plain',
    'thick',
    'outline',
    'interlace',
    'emboss',
    'filled',
    'sketch',
  ] as const) {
    savedLayer.style.kind = kind;
    const svg = exportSVG(project, { [savedLayer.id]: geometry }, region),
      eps = exportEPS(project, { [savedLayer.id]: geometry }, region);
    assert.ok(svg.includes('<path') && eps.includes('lineto'));
    assert.ok(!/NaN|Infinity/.test(svg + eps));
  }
});

void test('rosette pilot cells cover their lattice and agree on every repeated shared-edge contact', () => {
  const pilots = catalog.filter((t) => t.collection === 'rosette');
  assert.deepEqual(pilots.map((t) => t.id).sort(), [
    'rosette-4-6-12',
    'rosette-4-8-2',
    'rosette-6',
  ]);
  const expectedFaces: Record<string, number> = {
    'rosette-4-6-12': 15,
    'rosette-4-8-2': 5,
    'rosette-6': 3,
  };
  let offMidpoint = 0;
  for (const tiling of pilots) {
    assert.equal(tiling.repetition.kind, 'translation');
    if (tiling.repetition.kind !== 'translation') continue;
    const { u, v } = tiling.repetition,
      determinant = u.x * v.y - u.y * v.x,
      figures = placedMotifs(newLayer(tiling));
    assert.equal(figures.length, expectedFaces[tiling.id]);
    assert.ok(
      Math.abs(
        figures.reduce((sum, f) => sum + Math.abs(area(f.points)), 0) -
          Math.abs(determinant),
      ) < 1e-7,
    );
    const edges = new Map<string, { midpoint: Point; contacts: Point[] }>();
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        const unit: Matrix = [1, 0, i * u.x + j * v.x, 0, 1, i * u.y + j * v.y];
        for (const tile of tiling.tiles) {
          assert.equal(tile.contacts?.length, tile.points.length);
          for (const placement of tile.placements) {
            const points = tile.points.map((point) =>
              apply(compose(unit, placement), point),
            );
            for (let edge = 0; edge < points.length; edge++) {
              const a = points[edge],
                b = points[(edge + 1) % points.length],
                contact = tile.contacts![edge],
                id = [key(a), key(b)].sort().join('|'),
                record = edges.get(id) || {
                  midpoint: mix(a, b, 0.5),
                  contacts: [],
                };
              assert.ok(contact > 0 && contact < 1);
              record.contacts.push(mix(a, b, contact));
              edges.set(id, record);
            }
          }
        }
      }
    }
    let checked = 0;
    for (const { midpoint: m, contacts: positions } of edges.values()) {
      const x = (m.x * v.y - m.y * v.x) / determinant,
        y = (u.x * m.y - u.y * m.x) / determinant;
      if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5) continue;
      assert.equal(positions.length, 2, `${tiling.id}: unpaired internal edge`);
      assert.ok(
        distance(positions[0], positions[1]) < 1e-7,
        `${tiling.id}: contacts disagree`,
      );
      checked++;
    }
    assert.ok(checked >= 3, tiling.id);
    offMidpoint += tiling.tiles
      .flatMap((t) => t.contacts!)
      .filter((t) => Math.abs(t - 0.5) > 1e-6).length;
    const layer = newLayer(tiling);
    assert.deepEqual(layer.twoPoint, tiling.recommended);
    for (const settings of [
      tiling.recommended!,
      { angle: 35, separation: 0.1 },
      { angle: 55, separation: 0.25 },
    ]) {
      layer.twoPoint = settings;
      const g = generate(layer, region);
      assert.ok(g.crossings.length > 10, tiling.id);
      assert.equal(
        g.warnings.filter(
          (w) => Math.abs(w.point.x) < 2 && Math.abs(w.point.y) < 2,
        ).length,
        0,
        `${tiling.id}: disconnected interior`,
      );
    }
    const reopened = decodeProject(
      JSON.stringify({ ...newProject(), layers: [layer] }),
    );
    sameCoverage(
      placedMotifs(reopened.layers[0]).flatMap((f) => f.segments),
      placedMotifs(layer).flatMap((f) => f.segments),
    );
  }
  assert.ok(
    offMidpoint > 0,
    'The pilot collection must exercise off-midpoint contacts',
  );
});

void test('adjusted 4.8² contacts restore eightfold rosette symmetry that midpoint contacts lose', () => {
  // The original 4.8² octagon has center (0,0), apothem 1, and vertices
  // (±1, ±(sqrt(2)−1)) and (±(sqrt(2)−1), ±1). Clipping to that independent
  // source polygon isolates the rosette discussed in Kaplan (2005), Figures11–12.
  const k = Math.SQRT2 - 1,
    sourceOctagon = [
      p(1, k),
      p(k, 1),
      p(-k, 1),
      p(-1, k),
      p(-1, -k),
      p(-k, -1),
      p(k, -1),
      p(1, -k),
    ],
    layer = newLayer(catalog.find((t) => t.id === 'rosette-4-8-2')!),
    turn = (segments: Segment[], angle: number) =>
      segments.map((s) => ({ a: rotate(s.a, angle), b: rotate(s.b, angle) }));
  for (const angle of [35, 45, 55]) {
    layer.twoPoint = { angle, separation: 0 };
    const rosette = clipToTile(generate(layer, region).segments, sourceOctagon);
    assert.ok(length(rosette) > 10);
    sameCoverage(rosette, turn(rosette, Math.PI / 4));
  }
  layer.twoPoint = { angle: 45, separation: 0 };
  for (const tile of layer.tiling.tiles)
    tile.contacts = tile.points.map(() => 0.5);
  const midpointRosette = clipToTile(
    generate(layer, region).segments,
    sourceOctagon,
  );
  sameCoverage(midpointRosette, turn(midpointRosette, Math.PI / 2));
  assert.ok(
    length([...midpointRosette, ...turn(midpointRosette, Math.PI / 4)]) -
      length(midpointRosette) >
      1,
    'The reference must distinguish corrected contacts from the fourfold midpoint pattern',
  );
});

void test('contact-aware periodic interlacing survives contact cache changes and viewport changes', () => {
  const layer = newLayer(catalog.find((t) => t.id === 'rosette-4-8-2')!),
    originalContacts = layer.tiling.tiles.map((t) => [...t.contacts!]);
  layer.twoPoint = { angle: 45, separation: 0.1 };
  const original = generate(layer, region),
    known = new Map(original.crossings.map((c) => [key(c.point), c.over]));
  for (const tile of layer.tiling.tiles)
    tile.contacts = tile.points.map(() => 0.5);
  generate(layer, region);
  layer.tiling.tiles.forEach((t, i) => {
    t.contacts = originalContacts[i];
  });
  for (const bounds of [
    region,
    { minX: -2, minY: -2, maxX: 2, maxY: 2 },
    { minX: 0, minY: -2, maxX: 4, maxY: 2 },
  ]) {
    const generated = generate(layer, bounds);
    let checked = 0;
    for (const c of generated.crossings) {
      const expected = known.get(key(c.point));
      if (!expected) continue;
      assert.ok(
        Math.abs(expected.x * c.over.x + expected.y * c.over.y) > 0.9999,
      );
      checked++;
    }
    assert.ok(checked > 10);
  }
});
