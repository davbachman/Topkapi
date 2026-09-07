import type { Tiling, Matrix } from '../engine/types';
import { regular, distance } from '../engine/geometry';
import { newLayer, newProject, uid } from './model';
import { decodeProject } from './storage';
export function validateTiling(t: Tiling): Tiling {
  const p = newProject();
  p.layers = [newLayer(t)];
  const result = decodeProject(JSON.stringify(p)).layers[0].tiling;
  if (
    !result.tiles.some((t) =>
      t.placements.some((_, i) => !t.excluded?.includes(i)),
    )
  )
    throw Error('Include at least one polygon in the tiling.');
  return result;
}
export function decodeTiling(source: string): Tiling {
  if (source.length > 2 * 1024 * 1024) throw Error('Tiling exceeds 2 MB.');
  if (source.trimStart().startsWith('{')) {
    const data = JSON.parse(source);
    return validateTiling(data.tiling || data);
  }
  const tokens = [
    ...source.matchAll(
      /"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|(?:#|%|\/\/)[^\n]*|[^\s]+/g,
    ),
  ]
    .map((m) => m[0])
    .filter((t) => !/^#|^%|^\/\//.test(t) && !t.startsWith('/*'));
  let i = 0;
  const next = () => {
    if (i >= tokens.length) throw Error('Incomplete tiling file.');
    const t = tokens[i++];
    return t.startsWith('"') ? JSON.parse(t) : t;
  };
  const num = () => {
    const n = Number(next());
    if (!Number.isFinite(n)) throw Error('Invalid tiling coordinate.');
    return n;
  };
  const count = (min: number, max: number) => {
    const n = num();
    if (!Number.isInteger(n) || n < min || n > max)
      throw Error('Invalid tiling count.');
    return n;
  };
  if (next() !== 'tiling') throw Error('Open a tiling JSON or .tiling file.');
  const name = String(next()),
    n = count(1, 60),
    u = { x: num(), y: num() },
    v = { x: num(), y: num() };
  const tiles = Array.from({ length: n }, (_, j) => {
    const kind = next();
    if (kind !== 'regular' && kind !== 'polygon')
      throw Error('Unknown polygon type.');
    const sides = count(3, 100),
      copies = count(1, 100);
    return {
      id: `shape-${j}`,
      regular: kind === 'regular',
      points:
        kind === 'regular'
          ? regular(sides)
          : Array.from({ length: sides }, () => ({ x: num(), y: num() })),
      placements: Array.from(
        { length: copies },
        () => Array.from({ length: 6 }, num) as Matrix,
      ),
    };
  });
  return validateTiling({
    id: uid(),
    name,
    tiles,
    repetition: { kind: 'translation', u, v },
    description: i < tokens.length ? String(next()) : '',
    author: i < tokens.length ? String(next()) : '',
  });
}
export function includedTiling(t: Tiling): Tiling {
  return {
    ...t,
    tiles: t.tiles
      .map((s) => ({
        ...s,
        placements: s.placements.filter((_, i) => !s.excluded?.includes(i)),
        excluded: undefined,
      }))
      .filter((s) => s.placements.length),
  };
}
export function exportTiling(t: Tiling, code = false): string {
  t = includedTiling(validateTiling(t));
  if (t.repetition.kind !== 'translation')
    throw Error('Use native JSON to save an inflation tiling.');
  const q = (s: string) => JSON.stringify(s),
    { u, v } = t.repetition;
  const isCanonical = (s: Tiling['tiles'][number]) =>
    s.regular &&
    regular(s.points.length).every((p, i) => distance(p, s.points[i]) < 1e-7);
  if (code)
    return [
      `beginTiling(${q(t.name)});`,
      `setTranslations(new Point(${u.x}, ${u.y}), new Point(${v.x}, ${v.y}));`,
      ...t.tiles.flatMap((s) => [
        ...(isCanonical(s)
          ? [`beginRegularFeature(${s.points.length});`]
          : [
              `beginPolygonFeature(${s.points.length});`,
              ...s.points.map((p) => `addPoint(new Point(${p.x}, ${p.y}));`),
              'commitPolygonFeature();',
            ]),
        ...s.placements.map(
          (m) => `addPlacement(new Transform(${m.join(', ')}));`,
        ),
        'endFeature();',
      ]),
      `setDescription(${q(t.description)});`,
      `setAuthor(${q(t.author)});`,
      'endTiling();',
    ].join('\n');
  return [
    `tiling ${q(t.name)} ${t.tiles.length}`,
    `${u.x} ${u.y}`,
    `${v.x} ${v.y}`,
    ...t.tiles.flatMap((s) => [
      `${isCanonical(s) ? 'regular' : 'polygon'} ${s.points.length} ${s.placements.length}`,
      ...(isCanonical(s) ? [] : s.points.map((p) => `${p.x} ${p.y}`)),
      ...s.placements.map((m) => m.join(' ')),
    ]),
    q(t.description),
    q(t.author),
  ].join('\n');
}
const KEY = 'taprats-studio-tilings';
export function loadTilings(): Tiling[] {
  try {
    return (JSON.parse(localStorage.getItem(KEY) || '[]') as Tiling[]).map(
      validateTiling,
    );
  } catch {
    return [];
  }
}
export function saveTiling(t: Tiling) {
  const valid = validateTiling(t),
    all = loadTilings().filter((x) => x.id !== valid.id);
  all.push(valid);
  localStorage.setItem(KEY, JSON.stringify(all));
  window.dispatchEvent(new Event('taprats-tilings'));
}

export function blankTiling(): Tiling {
  return {
    id: uid(),
    name: 'Untitled tiling',
    description: '',
    author: '',
    tiles: [
      {
        id: uid(),
        points: regular(4),
        regular: true,
        placements: [[1, 0, 0, 0, 1, 0]],
      },
    ],
    repetition: { kind: 'translation', u: { x: 2, y: 0 }, v: { x: 0, y: 2 } },
  };
}
