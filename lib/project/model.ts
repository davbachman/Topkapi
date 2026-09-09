import data from '../engine/catalog.json';
import original from '../engine/original-catalog.json';
import rosetteCollection from '../engine/rosette-pilots.json';
import type { Tiling, Layer, Motif, Project, Style } from '../engine/types';
// Keep original named definitions as well as Alhambra's revised constructions.
export const catalog = [
  ...data,
  ...rosetteCollection,
  ...original.map((t) => ({
    ...t,
    name: data.some((a) => a.name === t.name) ? `${t.name} · Taprats` : t.name,
  })),
] as Tiling[];
catalog.sort((a, b) => a.name.localeCompare(b.name));
export const defaultMotif = (regular = true): Motif => ({
  kind: regular ? 'rosette' : 'hankin',
  d: 3,
  q: 0,
  s: 2,
  n: 10,
  r: 0.5,
  progressive: false,
  angle: 54,
  lines: [],
  symmetry: 1,
  reflect: false,
});
export const defaultStyle: Style = {
  kind: 'interlace',
  color: '#176b72',
  outline: '#073c47',
  background: '#ffffff',
  width: 0.055,
  outlineWidth: 0.012,
  gap: 0.024,
  opacity: 1,
  join: 'round',
  light: 40,
  drawOutline: true,
  fillInside: true,
  fillOutside: false,
  shadowWidth: 0.05,
};
export const uid = () =>
  globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
export function newLayer(tiling: Tiling, color = defaultStyle.color): Layer {
  return {
    id: uid(),
    name: tiling.name,
    tiling: structuredClone(tiling),
    motifs: Object.fromEntries(
      tiling.tiles.map((t) => [
        t.id,
        defaultMotif(t.regular && t.points.length > 4),
      ]),
    ),
    style: { ...defaultStyle, color },
    visible: true,
    locked: false,
    moving: true,
    transform: { x: 0, y: 0, rotation: 0, scale: 1 },
    regionColors: {},
    ...(tiling.recommended || tiling.tiles.some((t) => t.contacts)
      ? {
          twoPoint: { ...(tiling.recommended || { angle: 45, separation: 0 }) },
        }
      : {}),
  };
}
export function newProject(): Project {
  return {
    format: 'topkapi',
    version: 1,
    name: 'Octagonal study',
    layers: [newLayer(catalog.find((t) => t.name === '4.8^2')!)],
    view: { x: 0, y: 0, scale: 85 },
    paper: '#ffffff',
    width: 240,
    height: 180,
    units: 'mm',
  };
}
export function cloneProject(p: Project) {
  return structuredClone(p);
}
export type History = {
  past: Project[];
  present: Project;
  future: Project[];
  transactionStart?: Project;
};
export function updateProject(
  h: History,
  fn: (p: Project) => void,
  preview = false,
): History {
  const p = cloneProject(h.present);
  fn(p);
  const before = h.transactionStart || h.present;
  if (preview) return { ...h, present: p, transactionStart: before };
  return commit({ past: h.past, present: before, future: h.future }, p);
}
export function commit(h: History, p: Project): History {
  if (JSON.stringify(p) === JSON.stringify(h.present)) return h;
  return { past: [...h.past.slice(-79), h.present], present: p, future: [] };
}
export function undo(h: History): History {
  if (h.transactionStart)
    return { past: h.past, present: h.transactionStart, future: h.future };
  if (!h.past.length) return h;
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future],
  };
}
export function redo(h: History): History {
  if (!h.future.length) return h;
  return {
    past: [...h.past, h.present],
    present: h.future[0],
    future: h.future.slice(1),
  };
}
export function encodeProject(p: Project) {
  return JSON.stringify(p, null, 2);
}
