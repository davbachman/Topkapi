import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  Bounds,
  Face,
  Geometry,
  Layer,
  Matrix,
  Point,
  Segment,
  Tiling,
} from '../../lib/engine/types';
import {
  apply,
  area,
  bounds,
  centroid,
  compose,
  distance,
  IDENTITY,
  inverse,
  rotate,
  transformation,
} from '../../lib/engine/geometry';
import { generate } from '../../lib/engine/generate';
import { paintRegion, regionColor, shapePaintId } from '../../lib/engine/paint';
import { exportSVG, faceColors, layerSVG } from '../../lib/engine/render';
import { exportEPS } from '../../lib/engine/eps';
import {
  catalog,
  defaultMotif,
  newLayer,
  newProject,
  redo,
  undo,
  updateProject,
} from '../../lib/project/model';
import { decodeProject } from '../../lib/project/storage';

const p = (x: number, y: number): Point => ({ x, y });
const red = '#ff0000',
  blue = '#0000ff',
  green = '#00ff00';
const first = p(0.3, 0.35),
  second = p(0.65, 0.6);
const different = p(0.7, 0.3);

function polygon(points: Point[]): Segment[] {
  return points.map((a, i) => ({ a, b: points[(i + 1) % points.length] }));
}

/** Two congruent squares and one distinct rectangle occupy each cell. Four partial
 * diagonals join across neighboring cells to form a diamond at every lattice
 * vertex. Expected color classes follow those analytic centers, independently
 * of the engine's face hashing or any particular catalog motif. */
function fixture(lattice: Matrix = IDENTITY, secondAngle = 0): Layer {
  const square = (c: Point, angle = 0, height = 0.08) =>
    polygon(
      [
        p(-0.08, -height),
        p(0.08, -height),
        p(0.08, height),
        p(-0.08, height),
      ].map((v) => {
        const turned = rotate(v, angle);
        return p(c.x + turned.x, c.y + turned.y);
      }),
    );
  const lines = [
    ...square(first),
    ...square(second, secondAngle),
    ...square(different, 0, 0.04),
    { a: p(0, 0.14), b: p(0.14, 0) },
    { a: p(0.86, 0), b: p(1, 0.14) },
    { a: p(1, 0.86), b: p(0.86, 1) },
    { a: p(0.14, 1), b: p(0, 0.86) },
  ];
  const tiling: Tiling = {
    id: 'paint-reference',
    name: 'Paint reference',
    description: '',
    author: '',
    repetition: {
      kind: 'translation',
      u: p(lattice[0], lattice[3]),
      v: p(lattice[1], lattice[4]),
    },
    tiles: [
      {
        id: 'cell',
        regular: false,
        placements: [IDENTITY],
        points: [p(0, 0), p(1, 0), p(1, 1), p(0, 1)].map((v) =>
          apply(lattice, v),
        ),
      },
    ],
  };
  const layer = newLayer(tiling);
  layer.motifs.cell = {
    ...defaultMotif(false),
    kind: 'custom',
    symmetry: 1,
    reflect: false,
    lines: lines.map((s) => ({
      a: apply(lattice, s.a),
      b: apply(lattice, s.b),
    })),
  };
  return layer;
}

function cellTransform(layer: Layer): Matrix {
  assert.equal(layer.tiling.repetition.kind, 'translation');
  if (layer.tiling.repetition.kind !== 'translation')
    throw Error('Expected lattice');
  const { u, v } = layer.tiling.repetition,
    t = layer.transform;
  return compose(
    transformation(t.x, t.y, (t.rotation * Math.PI) / 180, t.scale),
    [u.x, v.x, 0, u.y, v.y, 0],
  );
}

function patch(layer: Layer, min = -2.5, max = 2.5, shift = p(0, 0)): Bounds {
  const m = cellTransform(layer);
  return bounds(
    [p(min, min), p(max, min), p(max, max), p(min, max)].map((v) =>
      apply(m, p(v.x + shift.x, v.y + shift.y)),
    ),
  );
}

function at(g: Geometry, layer: Layer, center: Point): Face {
  const world = apply(cellTransform(layer), center);
  const face = g.faces.find((f) => distance(centroid(f.points), world) < 1e-6);
  assert.ok(face, `Missing analytic face at ${center.x}, ${center.y}`);
  return face;
}

function inOrbit(face: Face, layer: Layer, offset: Point): boolean {
  const center = apply(inverse(cellTransform(layer)), centroid(face.points));
  return [center.x - offset.x, center.y - offset.y].every(
    (v) => Math.abs(v - Math.round(v)) < 1e-6,
  );
}

function assertOrbitColor(
  g: Geometry,
  layer: Layer,
  offset: Point,
  color: string,
) {
  let repeated = 0;
  const offsets = offset === first ? [first, second] : [offset];
  for (const face of g.faces) {
    const expected = offsets.some((center) => inOrbit(face, layer, center))
      ? color
      : undefined;
    assert.equal(
      regionColor(layer, face),
      expected,
      `Unexpected paint at ${JSON.stringify(centroid(face.points))}`,
    );
    if (expected) repeated++;
  }
  assert.ok(
    repeated >= 4,
    `Expected repeated painted regions, got ${repeated}`,
  );
  return repeated;
}

void test('paint identity follows the complete outline regardless of straight-edge subdivisions or vertex order', () => {
  const concave = [p(0, 0), p(2, 0), p(2, 1), p(1, 1), p(1, 2), p(0, 2)];
  const subdivided = concave.flatMap((a, i) => {
    const b = concave[(i + 1) % concave.length];
    return [a, p((a.x + b.x) / 2, (a.y + b.y) / 2)];
  });
  const expected = shapePaintId(concave);
  for (let start = 0; start < subdivided.length; start++) {
    const cyclic = [...subdivided.slice(start), ...subdivided.slice(0, start)];
    assert.equal(shapePaintId(cyclic), expected);
    assert.equal(shapePaintId([...cyclic].reverse()), expected);
  }

  const larger = concave.map((v) => p(v.x * 3, v.y * 3));
  assert.notEqual(
    shapePaintId(larger),
    expected,
    'Absolute size matters outside inflation',
  );
  assert.equal(
    shapePaintId(larger, true),
    shapePaintId(concave, true),
    'Inflation recognizes true scale copies',
  );

  // A regular hexagon and this L-shaped hexagon both have six sides and area 3.
  // Those summary measurements cannot determine whether their outlines match.
  const radius = Math.sqrt(2 / Math.sqrt(3));
  const convex = Array.from({ length: 6 }, (_, i) =>
    rotate(p(radius, 0), (i * Math.PI) / 3),
  );
  assert.equal(convex.length, concave.length);
  assert.ok(Math.abs(area(convex) - area(concave)) < 1e-10);
  assert.notEqual(shapePaintId(convex), expected);
  assert.notEqual(shapePaintId(convex, true), shapePaintId(concave, true));

  // Four unit edges also do not distinguish a square from a 60-degree rhombus.
  const square = [p(0, 0), p(1, 0), p(1, 1), p(0, 1)];
  const rhombus = [
    p(0, 0),
    p(1, 0),
    p(1.5, Math.sqrt(3) / 2),
    p(0.5, Math.sqrt(3) / 2),
  ];
  assert.notEqual(shapePaintId(square), shapePaintId(rhombus));
});

void test('painting a periodic region colors translated and rotated copies without painting distinct shapes', () => {
  const layer = fixture(IDENTITY, Math.PI / 6),
    g = generate(layer, patch(layer));
  const chosen = at(g, layer, first),
    other = at(g, layer, different);
  assert.ok(chosen.paintId);
  assert.notEqual(
    chosen.paintId,
    other.paintId,
    'Different outlines must remain separate',
  );
  assert.equal(
    chosen.paintId,
    at(g, layer, second).paintId,
    'A rotated copy within a cell must share paint',
  );
  assert.equal(
    new Set(g.faces.map((f) => f.id)).size,
    g.faces.length,
    'Rendering and topology still need distinct physical face IDs',
  );
  assert.equal(faceColors(g, layer).size, g.faces.length);
  paintRegion(layer, chosen, red);
  assertOrbitColor(g, layer, first, red);
  for (let i = -2; i <= 2; i++)
    for (let j = -2; j <= 2; j++) {
      const copy = at(g, layer, p(first.x + i, first.y + j));
      assert.equal(copy.paintId, chosen.paintId);
      assert.equal(regionColor(layer, copy), red);
      assert.equal(
        regionColor(layer, at(g, layer, p(second.x + i, second.y + j))),
        red,
      );
      assert.equal(
        regionColor(layer, at(g, layer, p(different.x + i, different.y + j))),
        undefined,
      );
    }
});

void test('boundary-straddling regions retain their paint across negative cells and newly generated distant views', () => {
  const layer = fixture(),
    g = generate(layer, patch(layer));
  const chosen = at(g, layer, p(0, 0)),
    b = bounds(chosen.points);
  assert.ok(
    b.minX < 0 && b.minY < 0 && b.maxX > 0 && b.maxY > 0,
    'Reference must cross both lattice boundaries',
  );
  paintRegion(layer, chosen, green);
  assertOrbitColor(g, layer, p(0, 0), green);
  for (const center of [p(-3, 2), p(31, -27), p(-44, -19)]) {
    const distant = generate(layer, patch(layer, -1.7, 1.9, center));
    assert.equal(distant.truncated, false);
    assertOrbitColor(distant, layer, p(0, 0), green);
    assert.equal(at(distant, layer, center).paintId, chosen.paintId);
  }
});

void test('repeated paint survives skew or reversed lattices and later layer transforms', () => {
  for (const lattice of [
    [1.8, 0.6, 0, 0.3, 1.25, 0],
    [-1.4, 0.7, 0, 0.2, 1.1, 0],
  ] as Matrix[]) {
    const layer = fixture(lattice),
      initial = generate(layer, patch(layer));
    const chosen = at(initial, layer, first);
    paintRegion(layer, chosen, blue);
    assertOrbitColor(initial, layer, first, blue);
    for (const transform of [
      { x: 4.25, y: -8.8, rotation: 37, scale: 1.7 },
      { x: -19.3, y: 14.7, rotation: -123, scale: 0.43 },
    ]) {
      layer.transform = transform;
      const shifted = generate(layer, patch(layer, -1.6, 1.6, p(7, -5)));
      assert.equal(shifted.truncated, false);
      assertOrbitColor(shifted, layer, first, blue);
      assert.equal(
        at(shifted, layer, p(first.x + 7, first.y - 5)).paintId,
        chosen.paintId,
      );
    }
  }
});

void test('repeated region painting round-trips in native documents and participates in undo and redo', () => {
  const layer = fixture(),
    original = { ...newProject(), layers: [layer] };
  const chosen = at(generate(layer, patch(layer)), layer, first);
  let history = updateProject(
    { past: [], present: original, future: [] },
    (project) => {
      paintRegion(project.layers[0], chosen, red);
    },
  );
  const painted = structuredClone(history.present);
  const reopened = decodeProject(JSON.stringify(painted));
  assert.deepEqual(reopened, painted);
  const savedLayer = reopened.layers[0];
  assertOrbitColor(
    generate(savedLayer, patch(savedLayer, -1.5, 1.5, p(13, -7))),
    savedLayer,
    first,
    red,
  );
  history = undo(history);
  assert.deepEqual(history.present, original);
  assert.equal(regionColor(history.present.layers[0], chosen), undefined);
  history = redo(history);
  assert.deepEqual(history.present, painted);
  assertOrbitColor(
    generate(history.present.layers[0], patch(layer)),
    history.present.layers[0],
    first,
    red,
  );
});

void test('old per-face colors remain local until repainting their repeated region overrides them', () => {
  const layer = fixture(),
    g = generate(layer, patch(layer));
  const a = at(g, layer, first),
    b = at(g, layer, p(first.x + 1, first.y));
  const other = at(g, layer, different);
  layer.regionColors[a.id] = red;
  layer.regionColors[b.id] = blue;
  layer.regionColors[other.id] = '#123456';
  const reopened = decodeProject(
    JSON.stringify({ ...newProject(), layers: [layer] }),
  ).layers[0];
  assert.equal(regionColor(reopened, a), red);
  assert.equal(regionColor(reopened, b), blue);
  assert.equal(
    regionColor(reopened, at(g, layer, p(first.x - 1, first.y))),
    undefined,
  );
  paintRegion(reopened, b, green);
  for (const face of g.faces.filter(
    (f) => inOrbit(f, layer, first) || inOrbit(f, layer, second),
  ))
    assert.equal(
      regionColor(reopened, face),
      green,
      'A new repeated paint must override saved single-copy differences',
    );
  assert.equal(
    regionColor(reopened, other),
    '#123456',
    'Unrelated legacy paint remains intact',
  );
  const again = decodeProject(
    JSON.stringify({ ...newProject(), layers: [reopened] }),
  ).layers[0];
  assert.equal(regionColor(again, a), green);
  assert.equal(regionColor(again, b), green);
});

void test('freezing keeps repeated paint, matches reflected shapes, and keeps different sizes and layers independent', () => {
  const layer = fixture(),
    g = generate(layer, patch(layer));
  const chosen = at(g, layer, first);
  paintRegion(layer, chosen, red);
  const largeSquare = polygon([
    p(29.84, 0.34),
    p(30.16, 0.34),
    p(30.16, 0.66),
    p(29.84, 0.66),
  ]);
  const asymmetric = [p(0, 0), p(0.22, 0.02), p(0.17, 0.15), p(0.02, 0.1)];
  const a = asymmetric.map((v) => p(v.x + 20, v.y));
  const b = asymmetric.map((v) => p(23 - v.x, v.y));
  layer.frozen = [...g.segments, ...largeSquare, ...polygon(a), ...polygon(b)];
  const frozen = generate(layer, patch(layer));
  assert.equal(
    at(frozen, layer, first).paintId,
    chosen.paintId,
    'Freeze must preserve the existing color identity',
  );
  for (const face of frozen.faces.filter(
    (f) => inOrbit(f, layer, first) || inOrbit(f, layer, second),
  ))
    assert.equal(regionColor(layer, face), red);
  assert.equal(
    regionColor(layer, at(frozen, layer, p(30, 0.5))),
    undefined,
    'A larger similar shape is distinct in a finite design',
  );
  const mirrorSource = at(frozen, layer, centroid(a));
  const mirrorCopy = at(frozen, layer, centroid(b));
  paintRegion(layer, mirrorSource, blue);
  assert.equal(
    regionColor(layer, mirrorCopy),
    blue,
    'A reflected copy shares paint',
  );
  assert.equal(regionColor(layer, at(frozen, layer, different)), undefined);

  const independent = fixture();
  assert.equal(
    regionColor(
      independent,
      at(generate(independent, patch(independent)), independent, first),
    ),
    undefined,
    'Paint belongs to its own layer',
  );
});

void test('inflation paints true scale copies across rings while retaining different outlines', () => {
  const layer = fixture();
  layer.tiling.tiles[0].points = [
    p(0.2, -0.4),
    p(1, -0.4),
    p(1, 0.4),
    p(0.2, 0.4),
  ];
  layer.motifs.cell.lines = [
    ...polygon([p(0.42, -0.08), p(0.58, -0.08), p(0.58, 0.08), p(0.42, 0.08)]),
    ...polygon([p(0.67, 0.26), p(0.83, 0.26), p(0.83, 0.34), p(0.67, 0.34)]),
  ];
  layer.tiling.repetition = {
    kind: 'inflation',
    center: p(0, 0),
    sectors: 4,
    rings: 3,
    transform: [2, 0, 0, 0, 2, 0],
  };
  const g = generate(layer, { minX: -4, minY: -4, maxX: 4, maxY: 4 });
  assert.equal(g.truncated, false);
  const atCenter = (center: Point) => {
    const face = g.faces.find(
      (f) => distance(centroid(f.points), center) < 1e-6,
    );
    assert.ok(face, `Missing inflated face at ${JSON.stringify(center)}`);
    return face;
  };
  const chosen = atCenter(p(0.5, 0));
  paintRegion(layer, chosen, green);
  for (let ring = 0; ring < 3; ring++)
    for (let sector = 0; sector < 4; sector++) {
      const center = (v: Point) =>
        rotate(p(v.x * 2 ** ring, v.y * 2 ** ring), (sector * Math.PI) / 2);
      const square = atCenter(center(p(0.5, 0)));
      assert.equal(square.paintId, chosen.paintId);
      assert.equal(regionColor(layer, square), green);
      assert.equal(
        regionColor(layer, atCenter(center(p(0.75, 0.3)))),
        undefined,
      );
    }
});

void test('rotated petals in a real rosette share one painted color', () => {
  const layer = newLayer(catalog.find((t) => t.id === 'rosette-4-8-2')!);
  const g = generate(layer, { minX: -3, minY: -3, maxX: 3, maxY: 3 });
  let pair: [Face, Face] | undefined;
  for (const face of g.faces) {
    const center = centroid(face.points);
    if (
      Math.hypot(center.x, center.y) < 0.1 ||
      Math.hypot(center.x, center.y) > 0.9
    )
      continue;
    const points = face.points.map((v) => rotate(v, Math.PI / 4));
    const rotated = g.faces.find(
      (f) =>
        f.id !== face.id &&
        f.points.length === points.length &&
        points.every((v) => f.points.some((q) => distance(v, q) < 1e-6)),
    );
    if (rotated) {
      pair = [face, rotated];
      break;
    }
  }
  assert.ok(
    pair,
    'Reference must contain distinct faces related by an eighth turn',
  );
  paintRegion(layer, pair[0], blue);
  assert.equal(regionColor(layer, pair[1]), blue);
  assert.notEqual(pair[0].id, pair[1].id);
});

void test('interactive SVG, exported SVG and EPS paint every repeated region in newly generated artwork', () => {
  const layer = fixture(),
    g = generate(layer, patch(layer));
  paintRegion(layer, at(g, layer, p(0, 0)), red);
  const project = decodeProject(
    JSON.stringify({ ...newProject(), layers: [layer] }),
  );
  const savedLayer = project.layers[0],
    region = patch(savedLayer, -2, 2, p(12, -9));
  const exported = generate(savedLayer, region);
  const count = assertOrbitColor(exported, savedLayer, p(0, 0), red);
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
    const display = layerSVG(savedLayer, exported);
    // exportSVG is also the artwork input rasterized for all browser image formats.
    const svg = exportSVG(project, { [savedLayer.id]: exported }, region);
    const eps = exportEPS(project, { [savedLayer.id]: exported }, region);
    assert.equal(
      (display.match(/fill="#ff0000"/g) || []).length,
      count,
      `${kind}: interactive display`,
    );
    assert.equal(
      (svg.match(/fill="#ff0000"/g) || []).length,
      count,
      `${kind}: SVG and raster input`,
    );
    assert.equal(
      (eps.match(/1 0 0 setrgbcolor\nfill/g) || []).length,
      count,
      `${kind}: EPS`,
    );
    assert.ok(!/NaN|Infinity/.test(display + svg + eps));
  }
});
