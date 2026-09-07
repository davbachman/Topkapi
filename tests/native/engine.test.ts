import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  apply,
  area,
  around,
  cleanSegments,
  compose,
  distance,
  IDENTITY,
  inverse,
  regular,
  transformation,
} from '../../lib/engine/geometry';
import {
  clipPolygon,
  clipSegment,
  clipToTile,
  polygonError,
  snapPoint,
  triangulate,
} from '../../lib/engine/construction';
import {
  star,
  rosette,
  extendedRosette,
  makeMotif,
} from '../../lib/engine/motifs';
import { planarize } from '../../lib/engine/topology';
import { generate } from '../../lib/engine/generate';
import {
  exportDXF,
  exportSVG,
  layerSVG,
  strands,
} from '../../lib/engine/render';
import {
  catalog,
  defaultMotif,
  newLayer,
  newProject,
  undo,
  redo,
  commit,
  updateProject,
  type History,
} from '../../lib/project/model';
import { decodeProject } from '../../lib/project/storage';
import type {
  Bounds,
  Geometry,
  Project,
  Segment,
} from '../../lib/engine/types';
const pt = (x: number, y: number) => ({ x, y }),
  line = (x: number, y: number, u: number, v: number) => ({
    a: pt(x, y),
    b: pt(u, v),
  });
const square = [pt(0, 0), pt(2, 0), pt(2, 2), pt(0, 2)],
  r: Bounds = { minX: 0, minY: 0, maxX: 2, maxY: 2 };
const graph = (lines: Segment[]): Geometry => ({
  segments: lines,
  tiles: [],
  truncated: false,
  ...planarize(lines),
});
const squareLines = square.map((a, i) => ({
  a,
  b: square[(i + 1) % square.length],
}));
function signature(lines: Segment[]) {
  return cleanSegments(lines)
    .map((s) =>
      [s.a, s.b]
        .map((p) => `${Math.round(p.x * 1e6)},${Math.round(p.y * 1e6)}`)
        .sort()
        .join(':'),
    )
    .sort();
}

void test('affine composition, inverse and rotation about a fixed point', () => {
  const m = compose(transformation(3, -4, 0.71, 2.3), [-1, 0.1, 4, 0.3, 1, -2]),
    p = pt(-2.5, 8.2);
  assert.ok(distance(apply(inverse(m), apply(m, p)), p) < 1e-9);
  assert.ok(distance(apply(around(p, 0.73, 2), p), p) < 1e-9);
  assert.throws(() => inverse([0, 0, 0, 0, 0, 0]));
  for (const n of [3, 4, 5, 6, 8, 10, 12]) {
    const ps = regular(n);
    assert.equal(polygonError(ps), null);
    assert.ok(
      Math.abs(
        distance(pt(0, 0), {
          x: (ps[0].x + ps[1].x) / 2,
          y: (ps[0].y + ps[1].y) / 2,
        }) - 1,
      ) < 1e-9,
    );
  }
});

void test('snapping prefers exact edge midpoint over a nearby grid point', () => {
  const midpoint = pt(0.33333, 0.66667);
  assert.deepEqual(
    snapPoint(pt(0.334, 0.665), [midpoint], 0.1, 0.02),
    midpoint,
  );
  assert.deepEqual(
    snapPoint(pt(0.334, 0.665), [], 0.1, 0.02),
    pt(0.30000000000000004, 0.7000000000000001),
  );
});

void test('polygon validation detects crossed, touching, repeated and degenerate vertices', () => {
  assert.equal(polygonError(square), null);
  for (const p of [
    [pt(0, 0), pt(2, 2), pt(2, 0), pt(0, 2)],
    [pt(0, 0), pt(1, 0), pt(2, 0)],
    [...square, pt(2, 0)],
  ])
    assert.ok(polygonError(p));
});

void test('planar graph splits X crossings, T junctions and collinear overlaps', () => {
  const x = planarize([line(-1, 0, 1, 0), line(0, -1, 0, 1)]);
  assert.equal(x.edges.length, 4);
  assert.equal(x.nodes.length, 5);
  assert.equal(x.crossings.length, 1);
  assert.equal(x.warnings.filter((w) => w.kind === 'endpoint').length, 4);
  const t = planarize([line(-1, 0, 1, 0), line(0, 0, 0, 1)]);
  assert.equal(t.edges.length, 3);
  assert.equal(t.warnings.filter((w) => w.kind === 'junction').length, 1);
  const overlap = planarize([
    line(0, 0, 3, 0),
    line(1, 0, 2, 0),
    line(3, 0, 0, 0),
  ]);
  assert.equal(overlap.edges.length, 3);
  assert.equal(overlap.nodes.length, 4);
});

void test('bounded face extraction satisfies Euler and preserves deterministic region IDs', () => {
  const lines = [...squareLines, line(0, 1, 2, 1), line(1, 0, 1, 2)],
    g = planarize(lines);
  assert.equal(g.faces.length, 4);
  assert.equal(g.nodes.length - g.edges.length + g.faces.length, 1);
  assert.ok(Math.abs(g.faces.reduce((a, f) => a + f.area, 0) - 4) < 1e-8);
  assert.deepEqual(
    g.faces.map((f) => f.id).sort(),
    planarize([...lines].reverse().map((s) => ({ a: s.b, b: s.a })))
      .faces.map((f) => f.id)
      .sort(),
  );
});

void test('weave alternates along each row and column, including oblique crossings', () => {
  const lines: Segment[] = [];
  for (let i = -2; i <= 2; i++) {
    lines.push(line(-3, i, 3, i), line(i, -3, i, 3));
  }
  const g = planarize(lines);
  assert.equal(g.crossings.length, 25);
  assert.ok(g.crossings.every((c) => !c.conflict));
  for (const y of [-2, -1, 0, 1, 2]) {
    const row = g.crossings
      .filter((c) => Math.abs(c.point.y - y) < 1e-8)
      .sort((a, b) => a.point.x - b.point.x);
    for (let i = 1; i < row.length; i++)
      assert.ok(Math.abs(row[i].over.x * row[i - 1].over.x) < 0.1);
  }
  const skew = planarize([line(-1, 0, 1, 0), line(-1, -1, 1, 1)]).crossings[0];
  assert.ok(
    Math.abs(skew.over.x * skew.under.x + skew.over.y * skew.under.y) > 0.6,
  );
  assert.equal(strands(graph(lines)).length, 10);
});

void test('216 radial constructions agree with geometry from the original Taprats JAR', () => {
  const fixtures = JSON.parse(
    readFileSync('tests/native/radial-reference.json', 'utf8'),
  ) as {
    kind: string;
    n: number;
    value: number;
    s: number;
    lines: Segment[];
  }[];
  assert.equal(fixtures.length, 216);
  for (const c of fixtures) {
    const actual =
      c.kind === 'star'
        ? star(c.n, c.value, c.s)
        : c.kind === 'extended'
          ? extendedRosette(c.n, c.value, c.s)
          : rosette(c.n, c.value, c.s);
    assert.deepEqual(
      signature(actual),
      signature(c.lines),
      `${c.kind} n=${c.n}, parameter=${c.value}, s=${c.s}`,
    );
  }
});

void test('custom symmetry is clipped to the tile and duplicate segments disappear', () => {
  const tile = {
      id: 'tile',
      points: square,
      regular: true,
      placements: [IDENTITY],
    },
    m = {
      ...defaultMotif(),
      kind: 'custom' as const,
      lines: [line(1, 1, 5, 1)],
      symmetry: 4,
      reflect: true,
    };
  const lines = makeMotif(tile, m);
  assert.equal(lines.length, 4);
  assert.ok(
    lines
      .flatMap((s) => [s.a, s.b])
      .every(
        (p) =>
          p.x >= -1e-8 && p.x <= 2 + 1e-8 && p.y >= -1e-8 && p.y <= 2 + 1e-8,
      ),
  );
  assert.equal(clipToTile([line(-2, 1, 4, 1)], square).length, 1);
});

void test('all 197 catalog tilings produce finite geometry and reopen as self-contained projects', () => {
  assert.equal(catalog.length, 197);
  assert.equal(
    catalog.filter((t) => t.repetition.kind === 'inflation').length,
    4,
  );
  for (const tiling of catalog) {
    const l = newLayer(tiling),
      p = newProject();
    p.layers = [l];
    assert.equal(
      decodeProject(JSON.stringify(p)).layers[0].tiling.name,
      tiling.name,
    );
    const g = generate(l, { minX: -3, minY: -3, maxX: 3, maxY: 3 });
    assert.ok(g.tiles.length > 0, tiling.name);
    assert.ok(g.segments.length > 0, tiling.name);
    assert.ok(
      g.nodes.every(
        (n) => Number.isFinite(n.point.x) && Number.isFinite(n.point.y),
      ),
      tiling.name,
    );
    assert.ok(g.edges.length < 100000);
  }
});

void test('generation moves with the viewport and reports bounds on excessive work', () => {
  const l = newLayer(catalog.find((t) => t.name === '4.8^2')!);
  const a = generate(l, { minX: 995, minY: 995, maxX: 1005, maxY: 1005 });
  assert.ok(a.tiles.length > 0);
  assert.ok(a.nodes.every((n) => n.point.x > 980 && n.point.y > 980));
  const dense = generate(
    l,
    { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 },
    false,
  );
  assert.equal(dense.truncated, true);
});

void test('one gesture is one undo step; state updates are pure and redo branches correctly', () => {
  const initial = newProject(),
    h: History = { past: [], present: initial, future: [] };
  const one = updateProject(
      h,
      (p) => {
        p.name = 'A';
      },
      true,
    ),
    two = updateProject(
      one,
      (p) => {
        p.name = 'B';
      },
      true,
    ),
    done = updateProject(two, () => {});
  assert.equal(h.present.name, 'Octagonal study');
  assert.equal(done.past.length, 1);
  assert.equal(undo(done).present.name, initial.name);
  assert.equal(redo(undo(done)).present.name, 'B');
  assert.equal(undo(two).present.name, initial.name);
  assert.equal(
    updateProject(undo(done), (p) => {
      p.name = 'C';
    }).future.length,
    0,
  );
  assert.deepEqual(
    updateProject(
      one,
      (p) => {
        p.name = 'B';
      },
      true,
    ),
    two,
  );
  assert.equal(commit(h, structuredClone(h.present)), h);
});

void test('project validation rejects invalid counts, unsafe text colors and singular transforms', () => {
  for (const mutate of [
    (p: Project) =>
      (p.layers[0].motifs[p.layers[0].tiling.tiles[0].id].symmetry = 2.5),
    (p: Project) =>
      (p.layers[0].tiling.tiles[0].placements[0] = [0, 0, 0, 0, 0, 0]),
    (p: Project) => (p.layers[0].style.color = 'red" onload="'),
    (p: Project) => p.layers.push(p.layers[0]),
    (p: Project) => (p.version = 999 as 1),
    (p: Project) => (p.view.scale = Infinity),
  ]) {
    const p = newProject();
    mutate(p);
    assert.throws(() => decodeProject(JSON.stringify(p)));
  }
  const p = newProject();
  p.units = 'in';
  p.width = 1 / 25.4;
  p.height = 2 / 25.4;
  assert.equal(decodeProject(JSON.stringify(p)).width, p.width);
});

void test('crop clips linework and concave polygons; triangulation preserves area', () => {
  assert.deepEqual(clipSegment(line(-1, 1, 3, 1), r), line(0, 1, 2, 1));
  assert.equal(clipSegment(line(-1, 3, 3, 3), r), null);
  const concave = [
    pt(-1, -1),
    pt(3, -1),
    pt(3, 1),
    pt(1, 1),
    pt(1, 3),
    pt(-1, 3),
  ];
  const clipped = clipPolygon(concave, r);
  assert.ok(Math.abs(area(clipped) - 3) < 1e-8);
  assert.ok(
    Math.abs(triangulate(clipped).reduce((s, t) => s + area(t), 0) - 3) < 1e-8,
  );
});

void test('SVG styles escape text and reference no Java; DXF uses clipped physical units', () => {
  const p = newProject();
  p.name = 'A & "B" <C>';
  p.width = 100;
  p.height = 100;
  p.layers[0].style.kind = 'interlace';
  const l = p.layers[0],
    g = graph([...squareLines, line(-1, 1, 3, 1), line(1, -1, 1, 3)]),
    geoms = { [l.id]: g };
  const svg = exportSVG(p, geoms, r);
  assert.ok(svg.includes('A &amp; &quot;B&quot; &lt;C&gt;'));
  assert.ok(svg.includes('width="100mm"'));
  assert.ok(
    !svg.includes('<mask'),
    'Underpasses use shortened polygons, never circular masks',
  );
  assert.ok(!svg.includes('NaN'));
  assert.ok(!svg.includes('java'));
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
    const art = layerSVG(l, g);
    assert.ok(art.includes('<path'));
    assert.ok(!/NaN|undefined|Infinity/.test(art), kind);
  }
  for (const mode of ['lines', 'faces', 'solid'] as const) {
    const dxf = exportDXF(p, geoms, r, mode);
    assert.ok(
      dxf.includes(
        mode === 'lines'
          ? '\nLINE\n'
          : mode === 'faces'
            ? '\nLWPOLYLINE\n'
            : '\n3DFACE\n',
      ),
    );
    const groups = dxf.split('\n');
    for (let i = 0; i < groups.length; i += 2) {
      if (['10', '11', '12', '13', '20', '21', '22', '23'].includes(groups[i]))
        assert.ok(
          Number(groups[i + 1]) >= -1e-6 && Number(groups[i + 1]) <= 100 + 1e-6,
          `${mode} ${groups[i]}=${groups[i + 1]}`,
        );
    }
  }
});

void test('paint identity survives translating, rotating and scaling a layer', () => {
  const layer = newLayer(catalog.find((t) => t.name === '4.8^2')!),
    region = { minX: -5, minY: -5, maxX: 5, maxY: 5 };
  const a = generate(layer, region),
    face = a.faces.find(
      (f) => Math.abs(f.points[0].x) < 1 && Math.abs(f.points[0].y) < 1,
    )!;
  layer.transform = { x: 0.37, y: -0.49, scale: 1.1, rotation: 30 };
  const b = generate(layer, region);
  assert.ok(b.faces.some((f) => f.id === face.id));
});

void test('neighbor inference connects the square gaps in an octagon tiling', async () => {
  const { inferNeighbors } = await import('../../lib/engine/advanced');
  const l = newLayer(catalog.find((t) => t.name === '4.8^2')!),
    tile = l.tiling.tiles.find((t) => t.points.length === 4)!;
  const maps = new Map(
    l.tiling.tiles.map((t) => [t.id, makeMotif(t, l.motifs[t.id])]),
  );
  const lines = inferNeighbors(tile, l, maps);
  assert.ok(lines.length > 0);
  assert.ok(
    lines
      .flatMap((s) => [s.a, s.b])
      .every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
  );
  assert.throws(() => inferNeighbors(tile, l, new Map()), /No neighboring/);
});

void test('irregular star, rosette, hourglass, Girih and intersect modes are nonempty and finite', () => {
  const tile = {
    id: 'irregular',
    regular: false,
    placements: [IDENTITY],
    points: [
      { x: -2, y: -1 },
      { x: 1, y: -1 },
      { x: 2, y: 1 },
      { x: -1, y: 1 },
    ],
  };
  for (const kind of [
    'star',
    'rosette',
    'hourglass',
    'girih',
    'intersect',
  ] as const)
    for (const progressive of [false, true]) {
      const m = { ...defaultMotif(), kind, d: 1.5, s: 1, progressive };
      const lines = makeMotif(tile, m);
      assert.ok(lines.length > 0, kind);
      assert.ok(
        lines
          .flatMap((s) => [s.a, s.b])
          .every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
        kind,
      );
    }
});

void test('edge matching maps both endpoints and physical checks exclude crop-created ends', async () => {
  const { matchEdge } = await import('../../lib/engine/construction'),
    { inspectFabrication } = await import('../../lib/engine/fabrication');
  const m = matchEdge(pt(-1, 0), pt(1, 0), pt(0, 4), pt(0, 0));
  assert.ok(distance(apply(m, pt(-1, 0)), pt(0, 4)) < 1e-8);
  assert.ok(distance(apply(m, pt(1, 0)), pt(0, 0)) < 1e-8);
  const p = newProject();
  p.width = 100;
  p.height = 100;
  p.layers[0].style.kind = 'thick';
  p.layers[0].style.width = 0.01;
  const g = graph([line(-1, 1, 3, 1)]),
    report = inspectFabrication(p, { [p.layers[0].id]: g }, r, 0.8)[0];
  assert.equal(report.openEnds, 0);
  assert.equal(report.components, 1);
  assert.equal(report.length, 100);
  assert.equal(report.bandWidth, 0.5);
  assert.equal(report.belowMinimum, true);
});

void test('all 73 original examples reopen with their finite layer geometry and style controls', () => {
  const entries = JSON.parse(
    readFileSync('lib/project/examples.json', 'utf8'),
  ) as { id: string }[];
  assert.equal(entries.length, 73);
  for (const entry of entries) {
    const p = decodeProject(
      readFileSync(`public/native-examples/${entry.id}.json`, 'utf8'),
    );
    assert.ok(p.layers.length > 0);
    if (p.name === 'USA') {
      assert.equal(p.layers[0].style.color, '#990000');
      assert.equal(p.layers.at(-1)!.style.color, '#f7f3f0');
    }
    for (const l of p.layers) {
      assert.ok(l.frozen?.length, `${p.name} has no finite construction`);
      const g = generate(l, r);
      assert.ok(g.edges.length > 0);
      if (l.frozenFaceClasses) {
        assert.equal(
          g.faces.filter((f) => l.frozenFaceClasses![f.id] !== undefined)
            .length,
          Object.keys(l.frozenFaceClasses).length,
          `${p.name} lost original inside/outside regions`,
        );
      }
      assert.ok(
        !/NaN|Infinity/.test(layerSVG(l, g)),
        `${p.name} has invalid artwork`,
      );
      assert.equal(g.segments.length, l.frozen.length);
      assert.ok(
        g.segments.every((s) =>
          [s.a.x, s.a.y, s.b.x, s.b.y].every(Number.isFinite),
        ),
      );
      assert.ok(!g.truncated);
    }
  }
});

void test('144 irregular constructions agree with the original Java algorithms', () => {
  const fixtures = JSON.parse(
    readFileSync('tests/native/advanced-fixtures.json', 'utf8'),
  ) as {
    kind: string;
    points: { x: number; y: number }[];
    d: number;
    s: number;
    q: number;
    r: number;
    n: number;
    lines: Segment[];
  }[];
  assert.equal(fixtures.length, 144);
  for (const f of fixtures) {
    const tile = {
      id: 'test',
      regular: false,
      points: f.points,
      placements: [IDENTITY],
    };
    const m = {
      ...defaultMotif(false),
      ...f,
      kind: (f.kind === 'progressive'
        ? 'intersect'
        : f.kind) as import('../../lib/engine/types').MotifKind,
      progressive: f.kind === 'progressive',
    };
    const actual = planarize(makeMotif(tile, m)),
      expected = planarize(f.lines);
    const segs = (g: ReturnType<typeof planarize>) =>
      g.edges.map((e) => ({ a: g.nodes[e.a].point, b: g.nodes[e.b].point }));
    assert.deepEqual(
      signature(segs(actual)),
      signature(segs(expected)),
      `${f.kind} n=${f.points.length} d=${f.d} s=${f.s}`,
    );
  }
});

void test('zoom, distant panning, layer rotation and export crops never reverse the repeating weave', () => {
  const l = newLayer(catalog.find((t) => t.name === '4.8^2')!);
  const key = (p: { x: number; y: number }) =>
    `${Math.round(p.x * 1e6)},${Math.round(p.y * 1e6)}`;
  const big = generate(l, { minX: -12, minY: -12, maxX: 12, maxY: 12 });
  const known = new Map(big.crossings.map((c) => [key(c.point), c.over]));
  let shared = 0;
  for (const r of [
    { minX: -4, minY: -3, maxX: 4, maxY: 3 },
    { minX: -1, minY: -1, maxX: 1, maxY: 1 },
    { minX: 4, minY: 2, maxX: 9, maxY: 6 },
  ]) {
    const g = generate(l, r);
    for (const c of g.crossings) {
      const expected = known.get(key(c.point));
      if (expected) {
        shared++;
        assert.ok(
          Math.abs(expected.x * c.over.x + expected.y * c.over.y) > 0.99999,
          'Weave flipped at ' + key(c.point),
        );
      }
    }
  }
  assert.ok(shared > 100);
  const shifted = structuredClone(l);
  shifted.transform = { x: 4, y: -3, rotation: 36, scale: 2 };
  const pose = transformation(4, -3, (36 * Math.PI) / 180, 2),
    inv = inverse(pose);
  const transformed = generate(shifted, {
    minX: -12,
    minY: -12,
    maxX: 12,
    maxY: 12,
  });
  for (const c of transformed.crossings) {
    const p = apply(inv, c.point),
      expected = known.get(key(p));
    if (expected) {
      const d = apply(inv, {
          x: c.point.x + c.over.x,
          y: c.point.y + c.over.y,
        }),
        x = d.x - p.x,
        y = d.y - p.y;
      assert.ok(
        Math.abs((expected.x * x + expected.y * y) / Math.hypot(x, y)) >
          0.99999,
      );
    }
  }
});

void test('polygonal underpasses follow oblique band edges and leave genuine transparent gaps', async () => {
  const { bandPolygons } = await import('../../lib/engine/bands');
  const l = newProject().layers[0];
  l.style = { ...l.style, width: 0.2, gap: 0.08 };
  for (const slope of [0.3, 1, 2]) {
    const g = graph([line(-2, 0, 2, 0), line(-2, -2 * slope, 2, 2 * slope)]),
      c = g.crossings[0];
    c.over = { x: 1, y: 0 };
    c.under = { x: 1 / Math.hypot(1, slope), y: slope / Math.hypot(1, slope) };
    const bands = bandPolygons(g, l.style),
      under = bands.filter((b) => b.shadows.length);
    assert.equal(under.length, 2);
    assert.equal(bands.length, 4);
    for (const band of under) {
      assert.ok(
        band.points.every((p) => Math.abs(p.y) >= l.style.width / 2 - 1e-7),
        'Underpass crosses the over-band interior',
      );
      assert.equal(band.shadows[0].length, 4);
    }
    const svg = layerSVG(l, g);
    assert.ok(!/<mask|<circle|fill="#fff/.test(svg));
  }
});

void test('standalone tilings round-trip text and JSON, retain metadata and exclude guides', async () => {
  const { decodeTiling, exportTiling, validateTiling } =
    await import('../../lib/project/tilings');
  const t = structuredClone(catalog.find((t) => t.name === '4.8^2')!);
  t.name = 'Quotes " and café';
  t.description = 'A # % // /* description */';
  t.author = 'Test';
  const decoded = decodeTiling('# comment\n' + exportTiling(t));
  assert.equal(decoded.name, t.name);
  assert.equal(decoded.description, t.description);
  assert.equal(decoded.author, t.author);
  const actualPoints = decoded.tiles.flatMap((t) => t.points),
    originalPoints = t.tiles.flatMap((t) => t.points);
  assert.equal(actualPoints.length, originalPoints.length);
  // Text regular polygons are reconstructed trigonometrically; JSON is exact.
  actualPoints.forEach((p, i) =>
    assert.ok(distance(p, originalPoints[i]) < 1e-12),
  );
  assert.equal(decodeTiling(JSON.stringify({ tiling: t })).name, t.name);
  t.tiles[0].placements.push(IDENTITY);
  t.tiles[0].excluded = [t.tiles[0].placements.length - 1];
  assert.equal(
    decodeTiling(exportTiling(t)).tiles[0].placements.length,
    t.tiles[0].placements.length - 1,
  );
  t.tiles.forEach((t) => (t.excluded = t.placements.map((_, i) => i)));
  assert.throws(() => validateTiling(t), /Include at least/);
});

void test('filled inside/outside switches independently control both face classes', () => {
  const l = newProject().layers[0],
    g = graph([...squareLines, line(1, 0, 1, 2)]);
  l.style.kind = 'filled';
  const count = () => (layerSVG(l, g).match(/<path/g) || []).length;
  l.style.fillInside = false;
  l.style.fillOutside = false;
  assert.equal(count(), 0);
  l.style.fillInside = true;
  assert.equal(count(), 1);
  l.style.fillOutside = true;
  assert.equal(count(), 2);
  l.style.fillInside = false;
  assert.equal(count(), 1);
});
