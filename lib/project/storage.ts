import type { Project, Point } from '../engine/types';
import { polygonError } from '../engine/construction';
function integer(n: unknown, min: number, max: number) {
  const v = finite(n, min, max);
  if (!Number.isInteger(v)) throw Error('A count must be a whole number.');
  return v;
}
function matrix(v: unknown) {
  const m = array(v, 6, 6).map((n) => finite(n));
  if (Math.abs(m[0] * m[4] - m[1] * m[3]) < 1e-10)
    throw Error('A transform must have a nonzero scale.');
  return m;
}
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw Error('Expected an object in the project.');
  return v as Record<string, unknown>;
}
function finite(n: unknown, min = -1e5, max = 1e5): number {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max)
    throw Error('Project contains an invalid numeric value.');
  return n;
}
function point(v: unknown): Point {
  const p = object(v);
  return { x: finite(p.x), y: finite(p.y) };
}
function text(v: unknown, max = 2000) {
  if (typeof v !== 'string' || v.length > max)
    throw Error('Project contains invalid text.');
  return v;
}
function color(v: unknown) {
  if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v))
    throw Error('Colors must be six-digit hex values.');
}
function array(v: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(v) || v.length < min || v.length > max)
    throw Error('Project contains an invalid collection.');
  return v;
}
function choice(v: unknown, values: string[]) {
  if (typeof v !== 'string' || !values.includes(v))
    throw Error('Project contains an unsupported option.');
}
export function decodeProject(contents: string): Project {
  if (contents.length > 10 * 1024 * 1024)
    throw Error('Project exceeds the 10 MB limit.');
  const p = object(JSON.parse(contents));
  if (
    !['topkapi', 'taprats-studio'].includes(String(p.format)) ||
    p.version !== 1
  )
    throw Error('Open a Topkapi .topkapi.json project.');
  p.format = 'topkapi';
  text(p.name, 200);
  color(p.paper);
  finite(p.width, 0.01, 10000);
  finite(p.height, 0.01, 10000);
  choice(p.units, ['mm', 'in']);
  const v = object(p.view);
  point(v);
  finite(v.scale, 3, 2000);
  const ids = new Set<string>();
  for (const value of array(p.layers, 0, 24)) {
    const l = object(value),
      id = text(l.id, 100);
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw Error('Invalid layer identifier.');
    if (ids.has(id)) throw Error('Layer IDs must be unique.');
    ids.add(id);
    text(l.name, 200);
    if (l.twoPoint !== undefined) {
      const settings = object(l.twoPoint);
      finite(settings.angle, 5, 85);
      finite(settings.separation, 0, 1);
    }
    for (const k of ['visible', 'locked', 'moving'])
      if (typeof l[k] !== 'boolean') throw Error('Invalid layer flags.');
    const tr = object(l.transform);
    point(tr);
    finite(tr.rotation, -36000, 36000);
    finite(tr.scale, 0.01, 100);
    const s = object(l.style);
    s.drawOutline ??= s.kind !== 'thick' && Number(s.outlineWidth) > 0;
    s.fillInside ??= true;
    s.fillOutside ??= false;
    s.shadowWidth ??= 0;
    for (const key of ['drawOutline', 'fillInside', 'fillOutside'])
      if (typeof s[key] !== 'boolean') throw Error('Invalid rendering option.');
    finite(s.shadowWidth, 0, 0.7);
    choice(s.kind, [
      'plain',
      'thick',
      'outline',
      'interlace',
      'emboss',
      'filled',
      'sketch',
    ]);
    choice(s.join, ['round', 'miter', 'bevel']);
    for (const k of ['color', 'outline', 'background']) color(s[k]);
    finite(s.width, 0, 2);
    finite(s.outlineWidth, 0, 1);
    finite(s.gap, 0, 1);
    finite(s.opacity, 0, 1);
    finite(s.light, 0, 360);
    const t = object(l.tiling);
    text(t.id, 200);
    text(t.name, 200);
    text(t.description, 10000);
    text(t.author, 2000);
    if (t.collection !== undefined) choice(t.collection, ['rosette']);
    if (t.recommended !== undefined) {
      const settings = object(t.recommended);
      finite(settings.angle, 5, 85);
      finite(settings.separation, 0, 1);
    }
    const rep = object(t.repetition);
    choice(rep.kind, ['translation', 'inflation']);
    if (rep.kind === 'translation') {
      const u = point(rep.u),
        v = point(rep.v);
      if (Math.abs(u.x * v.y - u.y * v.x) < 1e-7)
        throw Error('Repetition vectors must not be parallel.');
    } else {
      point(rep.center);
      integer(rep.sectors, 2, 100);
      integer(rep.rings, 1, 9);
      matrix(rep.transform);
    }
    const motifs = object(l.motifs),
      tileIds = new Set<string>();
    for (const value of array(t.tiles, 1, 60)) {
      const tile = object(value),
        tid = text(tile.id, 100);
      if (!/^[A-Za-z0-9_-]+$/.test(tid))
        throw Error('Invalid tile identifier.');
      if (tileIds.has(tid)) throw Error('Tile IDs must be unique.');
      tileIds.add(tid);
      if (typeof tile.regular !== 'boolean') throw Error('Invalid polygon.');
      const points = array(tile.points, 3, 100).map(point);
      const invalid = polygonError(points);
      if (invalid) throw Error(invalid);
      if (tile.contacts !== undefined) {
        for (const entry of array(
          tile.contacts,
          points.length,
          points.length,
        )) {
          const contact = finite(entry, 0, 1);
          if (contact === 0 || contact === 1)
            throw Error('Contact positions must lie inside their tile edges.');
        }
      }
      for (const m of array(tile.placements, 1, 100)) matrix(m);
      if (tile.excluded !== undefined)
        array(tile.excluded, 0, 100).forEach((i) =>
          integer(i, 0, (tile.placements as unknown[]).length - 1),
        );
      const m = object(motifs[tid]);
      choice(m.kind, [
        'star',
        'rosette',
        'extended',
        'hourglass',
        'girih',
        'intersect',
        'hankin',
        'custom',
      ]);
      finite(m.d, 0.01, 50);
      integer(m.n, 3, 24);
      finite(m.r, 0, 1);
      if (typeof m.progressive !== 'boolean')
        throw Error('Invalid intersection mode.');
      finite(m.q, -0.99, 0.99);
      integer(m.s, 1, 50);
      finite(m.angle, 5, 85);
      integer(m.symmetry, 1, 24);
      if (typeof m.reflect !== 'boolean')
        throw Error('Invalid motif symmetry.');
      for (const s of array(m.lines, 0, 5000)) {
        const line = object(s);
        point(line.a);
        point(line.b);
      }
    }
    // Contact-bearing tilings use the layer-wide construction. A standalone
    // imported tiling may not yet have layer settings; initialize those without
    // changing any frozen artwork or replacing an explicitly saved choice.
    if (
      l.twoPoint === undefined &&
      (t.tiles as Record<string, unknown>[]).some(
        (tile) => tile.contacts !== undefined,
      )
    )
      l.twoPoint = {
        ...((t.recommended as object) || { angle: 45, separation: 0 }),
      };
    if (l.frozen !== undefined) {
      for (const entry of array(l.frozen, 0, 100000)) {
        const line = object(entry);
        point(line.a);
        point(line.b);
      }
    }
    if (l.frozenFaceClasses !== undefined) {
      const classes = object(l.frozenFaceClasses);
      if (
        Object.keys(classes).length > 100000 ||
        Object.values(classes).some((v) => typeof v !== 'boolean')
      )
        throw Error('Invalid frozen face classes.');
    }
    const paints = object(l.regionColors);
    if (Object.keys(paints).length > 5000)
      throw Error('Too many region colors.');
    Object.values(paints).forEach(color);
  }
  if (p.reference) {
    const r = object(p.reference);
    const data = text(r.data, 8 * 1024 * 1024);
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data))
      throw Error('Unsupported reference image.');
    finite(r.opacity, 0, 1);
    point(r);
    finite(r.width, 0.01, 10000);
    finite(r.aspect, 0.001, 1000);
    finite(r.rotation, -36000, 36000);
  }
  return p as unknown as Project;
}
// Keep the existing database so the name change preserves local projects.
const DB = 'taprats-studio',
  STORE = 'projects';
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadAutosave(): Promise<Project | null> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readonly'),
      r = tx.objectStore(STORE).get('current');
    r.onsuccess = () => {
      try {
        resolve(r.result ? decodeProject(r.result) : null);
      } catch (e) {
        reject(e);
      }
    };
    r.onerror = () => reject(r.error);
    tx.oncomplete = () => d.close();
  });
}
export async function autosave(p: Project) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(JSON.stringify(p), 'current');
    tx.oncomplete = () => {
      d.close();
      resolve();
    };
    tx.onerror = () => {
      d.close();
      reject(tx.error);
    };
  });
}
export function download(
  name: string,
  data: string | Blob,
  type = 'application/json',
) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[\\/:*?"<>|]/g, '-');
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
