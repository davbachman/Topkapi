import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Segment, Tiling } from '../../lib/engine/types';
import {
  apply,
  around,
  distance,
  IDENTITY,
  inverse,
  transformation,
  key,
} from '../../lib/engine/geometry';
import { twoPointHankin } from '../../lib/engine/hankin';
import { placedMotifs, twoPointDistance } from '../../lib/engine/placed';
import { planarize } from '../../lib/engine/topology';
import { generate } from '../../lib/engine/generate';
import { exportSVG, layerSVG, strands } from '../../lib/engine/render';
import { exportEPS } from '../../lib/engine/eps';
import {
  newLayer,
  newProject,
  catalog,
  updateProject,
  undo,
  redo,
} from '../../lib/project/model';
import { decodeProject } from '../../lib/project/storage';
const p = (x: number, y: number) => ({ x, y });
const square = [p(0, 0), p(1, 0), p(1, 1), p(0, 1)];
function length(lines: Segment[]) {
  const g = planarize(lines);
  return g.edges.reduce(
    (sum, e) => sum + distance(g.nodes[e.a].point, g.nodes[e.b].point),
    0,
  );
}
function sameCoverage(actual: Segment[], expected: Segment[]) {
  const a = length(actual),
    b = length(expected),
    union = length([...actual, ...expected]);
  assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
  assert.ok(
    Math.abs(a - union) < 1e-6,
    `Unexpected geometry: ${union} != ${a}`,
  );
}
const region = { minX: -3, minY: -3, maxX: 3, maxY: 3 };
function squareTiling(): Tiling {
  return {
    id: 'two-point-squares',
    name: 'Two-point squares',
    description: '',
    author: '',
    repetition: { kind: 'translation', u: p(2, 0), v: p(0, 1) },
    tiles: [
      { id: 'a', points: square, placements: [IDENTITY], regular: true },
      {
        id: 'b',
        points: square.map((v) => p(v.x * 10, v.y * 10)),
        placements: [[0.1, 0, 1, 0, 0.1, 0]],
        regular: true,
      },
    ],
  };
}

void test('two-point squares match the analytic diagonals, including zero and full separation', () => {
  for (const delta of [0, 0.01, 0.25, 0.5, 0.99, 1]) {
    const a = (1 - delta) / 2,
      expected = [
        { a: p(a, 0), b: p(1, 1 - a) },
        { a: p(1, a), b: p(a, 1) },
        { a: p(1 - a, 1), b: p(0, a) },
        { a: p(0, 1 - a), b: p(1 - a, 0) },
      ],
      actual = twoPointHankin(square, 45, delta);
    sameCoverage(actual, expected);
    sameCoverage(twoPointHankin([...square].reverse(), 45, delta), expected);
    if (delta > 0 && delta < 1) {
      const g = planarize(actual);
      assert.equal(g.crossings.length, 4);
      assert.ok(
        g.crossings.some((c) => distance(c.point, p(0.5, delta / 2)) < 1e-7),
      );
    }
  }
});

void test('two-point hexagon rays meet at the independently derived 45-degree joints', () => {
  const root = Math.sqrt(3),
    center = p(0.5, root / 2),
    hexagon = [
      p(0, 0),
      p(1, 0),
      p(1.5, root / 2),
      p(1, root),
      p(0, root),
      p(-0.5, root / 2),
    ],
    k = 1.2 / (root + 1),
    joint = p(1 - k / 2, (root * k) / 2),
    pair = [
      { a: p(0.4, 0), b: joint },
      { a: p(1.3, root * 0.3), b: joint },
    ];
  const expected = Array.from({ length: 6 }, (_, i) => {
    const m = around(center, (i * Math.PI) / 3);
    return pair.map((s) => ({ a: apply(m, s.a), b: apply(m, s.b) }));
  }).flat();
  sameCoverage(twoPointHankin(hexagon, 45, 0.2), expected);
});

void test('ray pairing commutes with reflection, including equal-cost choices away from 45 degrees', () => {
  const mirror = [-1, 0, 0, 0, 1, 0] as const;
  for (const angle of [15, 30, 45, 60, 75]) {
    const actual = twoPointHankin(
      square.map((p) => apply([...mirror], p)),
      angle,
      0.5,
    ).map((s) => ({ a: apply([...mirror], s.a), b: apply([...mirror], s.b) }));
    sameCoverage(actual, twoPointHankin(square, angle, 0.5));
  }
});

void test('scaled and mirrored tile prototypes agree at shared contacts and close their strands', () => {
  const layer = newLayer(squareTiling());
  layer.twoPoint = { angle: 45, separation: 0.25 };
  assert.equal(twoPointDistance(layer.tiling, 0.25), 0.25);
  const lines = placedMotifs(layer).flatMap((f) => f.segments),
    g = planarize(lines);
  for (const y of [0.375, 0.625]) {
    const n = g.nodes.find((n) => distance(n.point, p(1, y)) < 1e-7);
    assert.equal(n?.edges.length, 2);
  }
  layer.tiling.tiles[1].placements[0] = [-0.1, 0, 2, 0, 0.1, 0];
  sameCoverage(
    placedMotifs(layer).flatMap((f) => f.segments),
    lines,
  );
  layer.tiling.tiles[0].placements.push([0.001, 0, 8, 0, 0.001, 0]);
  layer.tiling.tiles[0].excluded = [1];
  assert.equal(twoPointDistance(layer.tiling, 0.25), 0.25);
  const repeated = generate(layer, region);
  assert.equal(
    repeated.warnings.filter(
      (w) => Math.abs(w.point.x) < 2 && Math.abs(w.point.y) < 2,
    ).length,
    0,
  );
  assert.ok(
    strands(repeated).some(
      (s) => s.length > 4 && distance(s[0], s.at(-1)!) < 1e-7,
    ),
  );
});

void test('separation uses the complete inflation, including shrinking rings, independently of viewport', () => {
  const tiling = squareTiling();
  tiling.repetition = {
    kind: 'inflation',
    center: p(0, 0),
    sectors: 4,
    rings: 3,
    transform: [0.5, 0, 0, 0, 0.5, 0],
  };
  assert.equal(twoPointDistance(tiling, 0.4), 0.1);
  const layer = newLayer(tiling);
  layer.twoPoint = { angle: 45, separation: 0.4 };
  const ring = placedMotifs(layer, [0.25, 0, 0, 0, 0.25, 0])[0];
  assert.ok(
    ring.segments.some(
      (s) =>
        distance(s.a, p(0.075, 0)) < 1e-7 || distance(s.b, p(0.075, 0)) < 1e-7,
    ),
  );
});

void test('two-point defaults generate finite nonempty motifs throughout the 197-tiling catalog', () => {
  for (const tiling of catalog) {
    const layer = newLayer(tiling);
    layer.twoPoint = { angle: 45, separation: 0.25 };
    const figures = placedMotifs(layer);
    assert.ok(figures.length > 0, tiling.name);
    for (const figure of figures) {
      assert.ok(figure.segments.length > 0, `${tiling.name}/${figure.tileId}`);
      assert.ok(
        figure.segments.every((s) =>
          [s.a.x, s.a.y, s.b.x, s.b.y].every(Number.isFinite),
        ),
        tiling.name,
      );
    }
  }
});

void test('two-point weave remains stable through zoom, pan, layer pose and parameter cache changes', () => {
  const layer = newLayer(catalog.find((t) => t.name === '4.8^2')!);
  layer.twoPoint = { angle: 45, separation: 0.25 };
  const large = generate(layer, { minX: -8, minY: -8, maxX: 8, maxY: 8 });
  const known = new Map(large.crossings.map((c) => [key(c.point), c.over]));
  assert.ok(known.size > 30);
  function compare(bounds = region, back = IDENTITY) {
    const g = generate(layer, bounds);
    let checked = 0;
    for (const c of g.crossings) {
      const position = apply(back, c.point),
        expected = known.get(key(position));
      if (!expected) continue;
      const end = apply(back, p(c.point.x + c.over.x, c.point.y + c.over.y)),
        d = p(end.x - position.x, end.y - position.y);
      assert.ok(
        Math.abs((expected.x * d.x + expected.y * d.y) / Math.hypot(d.x, d.y)) >
          0.9999,
      );
      checked++;
    }
    assert.ok(checked > 5);
  }
  compare();
  compare({ minX: 0, minY: -2, maxX: 4, maxY: 3 });
  layer.twoPoint.separation = 0.4;
  generate(layer, region);
  layer.twoPoint.separation = 0.25;
  compare();
  layer.transform = { x: 1.2, y: -0.5, rotation: 31, scale: 1.4 };
  compare(
    { minX: -6, minY: -6, maxX: 6, maxY: 6 },
    inverse(transformation(1.2, -0.5, (31 * Math.PI) / 180, 1.4)),
  );
});

void test('two-point settings round-trip, validate and undo without replacing stored motifs; all styles export', () => {
  const original = newProject();
  let history = updateProject(
    { past: [], present: original, future: [] },
    (p) => {
      p.layers[0].twoPoint = { angle: 45, separation: 0.25 };
    },
  );
  const saved = decodeProject(JSON.stringify(history.present));
  assert.deepEqual(saved, history.present);
  assert.deepEqual(saved.layers[0].motifs, original.layers[0].motifs);
  history = undo(history);
  assert.deepEqual(history.present, original);
  history = redo(history);
  assert.deepEqual(history.present, saved);
  for (const settings of [
    null,
    [],
    { angle: 45, separation: -0.1 },
    { angle: 45, separation: 1.1 },
    { angle: 0, separation: 0.2 },
    { angle: 86, separation: 0.2 },
    { angle: 45, separation: '0.2' },
    { angle: 45 },
  ]) {
    const invalid = structuredClone(saved) as unknown as {
      layers: { twoPoint: unknown }[];
    };
    invalid.layers[0].twoPoint = settings;
    assert.throws(() => decodeProject(JSON.stringify(invalid)));
  }
  const l = saved.layers[0],
    g = generate(l, region);
  for (const kind of [
    'plain',
    'thick',
    'outline',
    'interlace',
    'emboss',
    'filled',
    'sketch',
  ] as const) {
    l.style.kind = kind;
    const svg = exportSVG(saved, { [l.id]: g }, region),
      eps = exportEPS(saved, { [l.id]: g }, region);
    assert.ok(svg.includes('<path') && eps.includes('lineto'));
    assert.ok(!/NaN|Infinity/.test(svg + eps));
    if (kind === 'interlace') assert.ok(!/<mask|<circle/.test(layerSVG(l, g)));
  }
  delete l.twoPoint;
  sameCoverage(
    generate(l, region).segments,
    generate(original.layers[0], region).segments,
  );
});
