'use client';
import { useT } from './locale';
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type {
  Layer,
  Matrix,
  Motif,
  Point,
  Tile,
  Tiling,
  TwoPoint,
} from '@/lib/engine/types';
import {
  apply,
  bounds,
  centroid,
  compose,
  distance,
  IDENTITY,
  inverse,
  key,
  mix,
  regular,
  transformation,
} from '@/lib/engine/geometry';
import { makeMotif } from '@/lib/engine/motifs';
import { placedMotifs } from '@/lib/engine/placed';
import { polygonError, snapPoint, matchEdge } from '@/lib/engine/construction';
import { pathData } from '@/lib/engine/render';
import { uid } from '@/lib/project/model';
import {
  decodeTiling,
  validateTiling,
  exportTiling,
  includedTiling,
  saveTiling,
} from '@/lib/project/tilings';
import { download } from '@/lib/project/storage';
import { catalog } from '@/lib/project/model';
import { Range, Choice, Check } from './controls';
import { Preview } from './preview';

const pointsAttribute = (points: Point[]) =>
  points.map((p) => `${p.x},${p.y}`).join(' ');
function localPoint(e: React.PointerEvent<SVGSVGElement>): Point {
  const m = e.currentTarget.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}
function viewBox(points: Point[], padding = 0.2) {
  const b = bounds(points),
    w = Math.max(1, b.maxX - b.minX),
    h = Math.max(1, b.maxY - b.minY),
    d = Math.max(w, h) * (1 + padding);
  return `${(b.minX + b.maxX - d) / 2} ${(b.minY + b.maxY - d) / 2} ${d} ${d}`;
}
function ConstructionDialog({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const trText = useT();
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="construction-dialog">
        <DialogHeader>
          <DialogTitle>{trText(title)}</DialogTitle>
          <DialogDescription>{trText(description)}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function MotifEditor({
  tile,
  motif,
  onApply,
  onClose,
}: {
  tile: Tile;
  motif: Motif;
  onApply: (m: Motif) => void;
  onClose: () => void;
}) {
  const trText = useT();
  const [draft, setDraft] = useState<Motif>(() => ({
    ...structuredClone(motif),
    kind: 'custom',
    lines:
      motif.kind === 'custom'
        ? structuredClone(motif.lines)
        : makeMotif(tile, motif),
    symmetry: motif.kind === 'custom' ? motif.symmetry : 1,
    reflect: motif.kind === 'custom' && motif.reflect,
  }));
  const [past, setPast] = useState<Motif[]>([]),
    [tool, setTool] = useState<'draw' | 'move' | 'erase'>('draw'),
    [snap, setSnap] = useState(true),
    [start, setStart] = useState<Point | null>(null),
    [cursor, setCursor] = useState<Point | null>(null);
  const [notice, setNotice] = useState('');
  const drag = useRef<{ point: Point; before: Motif } | null>(null);
  function change(fn: (m: Motif) => void) {
    setPast((p) => [...p.slice(-39), structuredClone(draft)]);
    setDraft((m) => {
      const n = structuredClone(m);
      fn(n);
      return n;
    });
  }
  const b = bounds(tile.points),
    span = Math.max(b.maxX - b.minX, b.maxY - b.minY),
    tolerance = span * 0.035;
  const targets = [
    ...tile.points,
    ...tile.points.map((p, i) =>
      mix(p, tile.points[(i + 1) % tile.points.length], 0.5),
    ),
    centroid(tile.points),
    ...draft.lines.flatMap((s) => [s.a, s.b]),
  ];
  const snapped = (p: Point) =>
    snap ? snapPoint(p, targets, span / 40, tolerance) : p;
  const rendered = useMemo(() => makeMotif(tile, draft), [tile, draft]);
  return (
    <ConstructionDialog
      title={trText('Draw a motif')}
      description={trText(
        'Click two points to draw a segment. Snap to vertices, edge midpoints, existing points, or the grid. Symmetry repeats the drawing inside this tile.',
      )}
      onClose={onClose}
    >
      <div className="construction-layout">
        <div>
          <div className="editor-tools">
            {(['draw', 'move', 'erase'] as const).map((t) => (
              <Button
                key={t}
                variant={tool === t ? 'default' : 'outline'}
                onClick={() => {
                  setTool(t);
                  setStart(null);
                }}
              >
                {t === 'draw'
                  ? trText('Draw lines')
                  : t === 'move'
                    ? trText('Move points')
                    : trText('Erase lines')}
              </Button>
            ))}
            <Button
              variant="outline"
              disabled={!past.length}
              onClick={() => {
                setDraft(past[past.length - 1]);
                setPast((p) => p.slice(0, -1));
                setStart(null);
              }}
            >
              {trText('Undo drawing')}
            </Button>
          </div>
          <svg
            className="construction-canvas"
            viewBox={viewBox(tile.points)}
            role="application"
            aria-label={trText('Motif drawing canvas')}
            onPointerDown={(e) => {
              const p = snapped(localPoint(e));
              setNotice('');
              if (tool === 'draw') {
                if (start) {
                  if (distance(start, p) > 1e-7) {
                    if (draft.lines.length >= 200) {
                      setNotice('A drawing supports up to 200 segments.');
                      return;
                    }
                    change((m) => m.lines.push({ a: start, b: p }));
                  }
                  setStart(null);
                } else setStart(p);
              } else if (tool === 'move') {
                const nearest = targets
                  .filter((p) =>
                    draft.lines.some(
                      (s) => key(s.a) === key(p) || key(s.b) === key(p),
                    ),
                  )
                  .sort((a, b) => distance(a, p) - distance(b, p))[0];
                if (nearest && distance(nearest, p) < tolerance * 2) {
                  drag.current = {
                    point: nearest,
                    before: structuredClone(draft),
                  };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }
              } else {
                let best = -1,
                  dist = tolerance;
                draft.lines.forEach((s, i) => {
                  const dx = s.b.x - s.a.x,
                    dy = s.b.y - s.a.y,
                    t = Math.max(
                      0,
                      Math.min(
                        1,
                        ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) /
                          (dx * dx + dy * dy),
                      ),
                    );
                  const d = distance(p, mix(s.a, s.b, t));
                  if (d < dist) {
                    dist = d;
                    best = i;
                  }
                });
                if (best >= 0)
                  change((m) => {
                    m.lines.splice(best, 1);
                  });
              }
            }}
            onPointerMove={(e) => {
              const raw = localPoint(e);
              setCursor(snapped(raw));
              const d = drag.current;
              if (d) {
                const old = key(d.point),
                  others = targets.filter((p) => key(p) !== old),
                  p = snap ? snapPoint(raw, others, span / 40, tolerance) : raw;
                setDraft(() => ({
                  ...d.before,
                  lines: d.before.lines.map((s) => ({
                    a: key(s.a) === old ? p : s.a,
                    b: key(s.b) === old ? p : s.b,
                  })),
                }));
              }
            }}
            onPointerUp={() => {
              if (drag.current) {
                const before = drag.current.before;
                setPast((p) => [...p.slice(-39), before]);
                drag.current = null;
              }
            }}
            onPointerCancel={() => {
              if (drag.current) setDraft(drag.current.before);
              drag.current = null;
            }}
          >
            <polygon
              points={pointsAttribute(tile.points)}
              fill="#fffdf8"
              stroke="#a88d55"
              strokeWidth={span * 0.004}
            />
            <path
              d={rendered.map((s) => pathData([s.a, s.b])).join('')}
              fill="none"
              stroke="#176b7255"
              strokeWidth={span * 0.007}
            />
            <path
              d={draft.lines.map((s) => pathData([s.a, s.b])).join('')}
              fill="none"
              stroke="#176b72"
              strokeWidth={span * 0.006}
            />
            {targets.slice(0, tile.points.length * 2 + 1).map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={span * 0.009}
                fill="#ae8e4b"
              />
            ))}
            {draft.lines
              .flatMap((s) => [s.a, s.b])
              .map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={span * 0.008}
                  fill="#176b72"
                />
              ))}
            {start && (
              <>
                <circle
                  cx={start.x}
                  cy={start.y}
                  r={span * 0.015}
                  fill="#c4604c"
                />
                {cursor && (
                  <path
                    d={pathData([start, cursor])}
                    fill="none"
                    stroke="#c4604c"
                    strokeWidth={span * 0.005}
                    strokeDasharray={`${span * 0.02} ${span * 0.01}`}
                  />
                )}
              </>
            )}
          </svg>
        </div>
        <div className="editor-settings">
          <Range
            label={trText('Rotational copies')}
            value={draft.symmetry}
            min={1}
            max={24}
            step={1}
            onChange={(v) =>
              change((m) => {
                m.symmetry = v;
              })
            }
          />
          <Check
            label={trText('Reflect across the horizontal axis')}
            checked={draft.reflect}
            onChange={(v) =>
              change((m) => {
                m.reflect = v;
              })
            }
          />
          <Check
            label={trText('Snap to construction points and grid')}
            checked={snap}
            onChange={setSnap}
          />
          <p className="panel-hint">
            {draft.lines.length} {trText('drawn segments ·')}
            {rendered.length}{' '}
            {trText(
              'segments after symmetry and clipping. Lines outside the tile are clipped.',
            )}
          </p>
          <Button
            variant="outline"
            onClick={() =>
              change((m) => {
                m.lines = rendered;
                m.symmetry = 1;
                m.reflect = false;
              })
            }
            disabled={rendered.length > 200}
          >
            {trText('Bake symmetry into drawing')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              change((m) => {
                m.lines = [];
              });
              setStart(null);
            }}
          >
            {trText('Clear drawing')}
          </Button>
          {notice && <p role="alert">{notice}</p>}
          <Button
            onClick={() => {
              onApply(draft);
              onClose();
            }}
          >
            {trText('Apply motif')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {trText('Cancel')}
          </Button>
        </div>
      </div>
    </ConstructionDialog>
  );
}

export function TwoPointVariationEditor({
  layer,
  onApply,
  onClose,
}: {
  layer: Layer;
  onApply: (settings: TwoPoint) => void;
  onClose: () => void;
}) {
  const trText = useT(),
    [chosen, setChosen] = useState(4);
  const variants = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => {
        const settings = {
          angle: Math.max(
            5,
            Math.min(85, layer.twoPoint!.angle + ((i % 3) - 1) * 7.5),
          ),
          separation: Math.max(
            0,
            Math.min(
              1,
              layer.twoPoint!.separation + (Math.floor(i / 3) - 1) * 0.15,
            ),
          ),
        };
        return {
          settings,
          figures: placedMotifs({ ...layer, twoPoint: settings }),
        };
      }),
    [layer],
  );
  return (
    <ConstructionDialog
      title={trText('Explore two-point patterns')}
      description={trText(
        'Compare ray angles across the columns and point separation down the rows. Choose a pattern for the whole layer.',
      )}
      onClose={onClose}
    >
      <div className="variation-grid">
        {variants.map(({ settings, figures }, i) => (
          <button
            key={i}
            className={chosen === i ? 'chosen' : ''}
            aria-pressed={chosen === i}
            onClick={() => setChosen(i)}
          >
            <svg
              viewBox={viewBox(figures.flatMap((f) => f.points))}
              aria-hidden="true"
            >
              <path
                d={figures
                  .flatMap((f) => f.segments.map((s) => pathData([s.a, s.b])))
                  .join('')}
                fill="none"
                stroke="#176b72"
                strokeWidth=".025"
                strokeLinejoin="round"
              />
            </svg>
            <span>
              {settings.angle.toFixed(1)}° ·{' '}
              {Math.round(settings.separation * 100)}%
            </span>
          </button>
        ))}
      </div>
      <div className="editor-footer">
        <Button variant="ghost" onClick={onClose}>
          {trText('Cancel')}
        </Button>
        <Button
          onClick={() => {
            onApply(variants[chosen].settings);
            onClose();
          }}
        >
          {trText('Apply')}
        </Button>
      </div>
    </ConstructionDialog>
  );
}

export function VariationEditor({
  tile,
  motif,
  onApply,
  onClose,
}: {
  tile: Tile;
  motif: Motif;
  onApply: (m: Motif) => void;
  onClose: () => void;
}) {
  const trText = useT();
  const [spread, setSpread] = useState(
      motif.kind === 'star'
        ? 0.5
        : motif.kind === 'rosette' || motif.kind === 'extended'
          ? 0.3
          : 15,
    ),
    [chosen, setChosen] = useState(4);
  const variants = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => {
        const m = structuredClone(motif),
          x = (i % 3) - 1,
          y = Math.floor(i / 3) - 1;
        if (m.kind === 'rosette' || m.kind === 'extended') {
          m.q = Math.max(-0.99, Math.min(0.99, m.q + x * spread));
          m.s = Math.max(
            1,
            Math.min(Math.floor((tile.points.length - 1) / 2), m.s + y),
          );
        } else if (m.kind === 'star') {
          m.d = Math.max(
            1,
            Math.min(tile.points.length / 2 - 0.01, m.d + x * spread),
          );
          m.s = Math.max(
            1,
            Math.min(Math.floor(tile.points.length / 2), m.s + y),
          );
        } else {
          m.kind = 'hankin';
          m.angle = Math.max(
            5,
            Math.min(
              85,
              (motif.kind === 'girih' ? 54 : m.angle) + ((i - 4) * spread) / 4,
            ),
          );
        }
        return m;
      }),
    [tile, motif, spread],
  );
  const label = (m: Motif) =>
    m.kind === 'star'
      ? `d ${m.d.toFixed(2)} · ${m.s} intersections`
      : m.kind === 'rosette' || m.kind === 'extended'
        ? `q ${m.q.toFixed(2)} · ${m.s} intersections`
        : `Rays at ${m.angle.toFixed(1)}°`;
  return (
    <ConstructionDialog
      title={trText('Explore variations')}
      description={trText(
        'Compare nine constructions. Choose a study to apply it to every copy of this tile shape.',
      )}
      onClose={onClose}
    >
      <Range
        label={trText('Parameter spread')}
        value={spread}
        min={
          motif.kind === 'star'
            ? 0.1
            : motif.kind === 'rosette' || motif.kind === 'extended'
              ? 0.05
              : 2
        }
        max={
          motif.kind === 'star'
            ? 1.5
            : motif.kind === 'rosette' || motif.kind === 'extended'
              ? 0.9
              : 40
        }
        step={motif.kind === 'girih' || motif.kind === 'hankin' ? 1 : 0.05}
        onChange={setSpread}
      />
      <div className="variation-grid">
        {variants.map((m, i) => (
          <button
            key={i}
            className={chosen === i ? 'chosen' : ''}
            onClick={() => setChosen(i)}
            aria-pressed={chosen === i}
          >
            <svg viewBox={viewBox(tile.points)} aria-hidden="true">
              <polygon
                points={pointsAttribute(tile.points)}
                fill="#fffdf8"
                stroke="#d4c5a4"
                strokeWidth=".012"
              />
              <path
                d={makeMotif(tile, m)
                  .map((s) => pathData([s.a, s.b]))
                  .join('')}
                fill="none"
                stroke="#176b72"
                strokeWidth=".02"
                strokeLinejoin="round"
              />
            </svg>
            <span>{label(m)}</span>
          </button>
        ))}
      </div>
      <div className="editor-footer">
        <Button variant="ghost" onClick={onClose}>
          {trText('Cancel')}
        </Button>
        <Button
          onClick={() => {
            onApply(variants[chosen]);
            onClose();
          }}
        >
          {trText('Apply selected variation')}
        </Button>
      </div>
    </ConstructionDialog>
  );
}

export function TilingEditor({
  layer,
  onApply,
  onClose,
}: {
  layer: Layer;
  onApply: (tiling: Tiling) => void;
  onClose: () => void;
}) {
  const trText = useT();
  const [tiling, setTiling] = useState(() => structuredClone(layer.tiling)),
    [tileId, setTileId] = useState(layer.tiling.tiles[0].id),
    [placement, setPlacement] = useState(0),
    [mode, setMode] = useState<
      'place' | 'vertices' | 'draw' | 'pan' | 'vector-u' | 'vector-v'
    >('place'),
    [snap, setSnap] = useState(true),
    [sides, setSides] = useState(6),
    [error, setError] = useState(''),
    [past, setPast] = useState<Tiling[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [drawing, setDrawing] = useState<Point[]>([]),
    [repeatPreview, setRepeatPreview] = useState(false);
  const [vertexIndex, setVertexIndex] = useState(0),
    [sourceEdge, setSourceEdge] = useState(0),
    [targetEdge, setTargetEdge] = useState(0),
    [targetKey, setTargetKey] = useState('');
  const tile = tiling.tiles.find((t) => t.id === tileId) || tiling.tiles[0],
    matrix = tile.placements[Math.min(placement, tile.placements.length - 1)];
  const drag = useRef<{
    start: Point;
    before: Tiling;
    index: number;
    kind: 'placement' | 'vertex' | 'pan' | 'u' | 'v';
    box: string;
    clientX: number;
    clientY: number;
  } | null>(null);
  const points = tiling.tiles.flatMap((t) =>
    t.placements.flatMap((m) => t.points.map((p) => apply(m, p))),
  );
  const [canvasBox, setCanvasBox] = useState(() => viewBox(points, 1));
  function change(fn: (t: Tiling) => void) {
    setPast((p) => [...p.slice(-39), structuredClone(tiling)]);
    setTiling((t) => {
      const n = structuredClone(t);
      fn(n);
      return n;
    });
    setError('');
  }
  function changeTile(fn: (t: Tile) => void) {
    change((t) => fn(t.tiles.find((x) => x.id === tile.id)!));
  }
  function setMatrix(fn: (m: Matrix) => Matrix) {
    changeTile((t) => {
      t.placements[Math.min(placement, t.placements.length - 1)] = fn(matrix);
    });
  }
  const otherPlacements = tiling.tiles.flatMap((t, ti) =>
    t.placements.flatMap((m, pi) =>
      t.id === tile.id && pi === placement
        ? []
        : [
            {
              key: `${ti}:${pi}`,
              tile: t,
              matrix: m,
              label: `Shape ${ti + 1}, copy ${pi + 1}`,
            },
          ],
    ),
  );
  const target =
    otherPlacements.find((p) => p.key === targetKey) || otherPlacements[0];
  const span = Math.max(...canvasBox.split(' ').slice(2).map(Number));
  const valid = tiling.tiles.map((t) => polygonError(t.points)).find(Boolean);
  const rep = tiling.repetition;
  function load(t: Tiling) {
    change((n) => Object.assign(n, t));
    setTileId(t.tiles[0].id);
    setPlacement(0);
    setCanvasBox(
      viewBox(
        t.tiles.flatMap((s) =>
          s.placements.flatMap((m) => s.points.map((p) => apply(m, p))),
        ),
        1,
      ),
    );
    setDrawing([]);
  }
  function finishPolygon() {
    const problem = polygonError(drawing);
    if (problem) {
      setError(problem);
      return;
    }
    if (tiling.tiles.length >= 60) {
      setError('A tiling supports 60 shapes.');
      return;
    }
    const id = uid();
    change((t) =>
      t.tiles.push({
        id,
        regular: false,
        points: drawing,
        placements: [[...IDENTITY]],
      }),
    );
    setTileId(id);
    setPlacement(0);
    setDrawing([]);
    setMode('place');
  }
  function save(format: 'json' | 'text' | 'code') {
    try {
      const t = validateTiling(tiling);
      saveTiling(t);
      download(
        `${t.name}.${format === 'json' ? 'tiling.json' : format === 'code' ? 'java' : 'tiling'}`,
        format === 'json'
          ? JSON.stringify(
              { format: 'topkapi-tiling', version: 1, tiling: t },
              null,
              2,
            )
          : exportTiling(t, format === 'code'),
      );
      setError('Tiling saved to the library and downloaded.');
    } catch (e) {
      setError(String(e));
    }
  }
  function applyTiling() {
    if (valid) {
      setError(valid);
      return;
    }
    if (
      rep.kind === 'translation' &&
      Math.abs(rep.u.x * rep.v.y - rep.u.y * rep.v.x) < 1e-5
    ) {
      setError('The two repetition vectors must not be parallel.');
      return;
    }
    if (
      rep.kind === 'inflation' &&
      Math.abs(
        rep.transform[0] * rep.transform[4] -
          rep.transform[1] * rep.transform[3],
      ) < 1e-7
    ) {
      setError('Inflation needs a nonzero scale.');
      return;
    }
    try {
      const t = validateTiling({ ...tiling, id: uid() });
      saveTiling(t);
      onApply(t);
    } catch (e) {
      setError(String(e));
      return;
    }
    onClose();
  }
  return (
    <ConstructionDialog
      title={trText('Construct a tiling')}
      description={trText(
        'Arrange polygons and repeat the included copies. Dashed copies are construction guides. Scroll to zoom; drag vector handles to edit the lattice. Apply also saves to your tiling library.',
      )}
      onClose={onClose}
    >
      <input
        ref={fileInput}
        type="file"
        hidden
        accept=".json,.tiling"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f)
            void f
              .arrayBuffer()
              .then((buffer) => {
                const bytes = new Uint8Array(buffer);
                let source;
                try {
                  source = new TextDecoder('utf-8', { fatal: true }).decode(
                    bytes,
                  );
                } catch {
                  source = new TextDecoder('windows-1252').decode(bytes);
                }
                load(decodeTiling(source));
              })
              .catch((e) => setError(String(e)));
          e.target.value = '';
        }}
      />
      <div className="editor-tools">
        <Button
          variant="outline"
          onClick={() =>
            load({
              id: uid(),
              name: 'Untitled tiling',
              description: '',
              author: '',
              tiles: [
                {
                  id: uid(),
                  points: regular(4),
                  regular: true,
                  placements: [[...IDENTITY]],
                },
              ],
              repetition: {
                kind: 'translation',
                u: { x: 2, y: 0 },
                v: { x: 0, y: 2 },
              },
            })
          }
        >
          {trText('New tiling')}
        </Button>
        <Button variant="outline" onClick={() => fileInput.current?.click()}>
          {trText('Open tiling')}
        </Button>
        <Button variant="outline" onClick={() => save('json')}>
          {trText('Save tiling')}
        </Button>
        <Button
          variant="ghost"
          disabled={rep.kind !== 'translation'}
          onClick={() => save('text')}
        >
          {trText('Export .tiling')}
        </Button>
        <Button
          variant="ghost"
          disabled={rep.kind !== 'translation'}
          onClick={() => save('code')}
        >
          {trText('Export Java code')}
        </Button>
        <Choice
          label={trText('Select catalog tiling')}
          value=""
          options={[
            { value: '', label: 'Choose a tiling…' },
            ...catalog.map((t) => ({ value: t.id, label: t.name })),
          ]}
          onChange={(id) => {
            const t = catalog.find((t) => t.id === id);
            if (t) load(structuredClone(t));
          }}
        />
      </div>
      <div className="construction-layout">
        <div>
          <div className="editor-tools">
            <Button
              variant={mode === 'place' ? 'default' : 'outline'}
              onClick={() => setMode('place')}
            >
              {trText('Move tiles')}
            </Button>
            <Button
              variant={mode === 'vertices' ? 'default' : 'outline'}
              onClick={() => setMode('vertices')}
            >
              {trText('Edit vertices')}
            </Button>
            <Button
              variant={mode === 'draw' ? 'default' : 'outline'}
              onClick={() => {
                setMode('draw');
                setDrawing([]);
              }}
            >
              {trText('Draw polygon')}
            </Button>
            <Button
              variant={mode === 'pan' ? 'default' : 'outline'}
              onClick={() => setMode('pan')}
            >
              {trText('Pan view')}
            </Button>
            <Button
              variant={repeatPreview ? 'default' : 'outline'}
              onClick={() => setRepeatPreview((v) => !v)}
            >
              {trText('Preview repetition')}
            </Button>
            {mode === 'draw' && (
              <Button disabled={drawing.length < 3} onClick={finishPolygon}>
                {trText('Close polygon')}
              </Button>
            )}
            <Button
              variant="outline"
              disabled={!past.length}
              onClick={() => {
                setTiling(past[past.length - 1]);
                setPast((p) => p.slice(0, -1));
                setPlacement(0);
              }}
            >
              {trText('Undo construction')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setCanvasBox(viewBox(points, 1));
                setError('View fitted.');
              }}
            >
              {trText('Fit patch')}
            </Button>
          </div>
          <svg
            className="construction-canvas"
            viewBox={canvasBox}
            aria-label={trText('Tiling construction canvas')}
            role="application"
            onWheel={(e) => {
              const [x, y, w, h] = canvasBox.split(' ').map(Number),
                f = Math.exp(Math.max(-0.3, Math.min(0.3, e.deltaY * 0.002)));
              setCanvasBox(
                `${x + (w * (1 - f)) / 2} ${y + (h * (1 - f)) / 2} ${w * f} ${h * f}`,
              );
            }}
            onPointerDown={(e) => {
              const raw = localPoint(e);
              if (mode === 'draw') {
                const p = snap
                  ? snapPoint(raw, points, 0.05, span * 0.025)
                  : raw;
                if (
                  drawing.length >= 3 &&
                  distance(p, drawing[0]) < span * 0.025
                )
                  finishPolygon();
                else setDrawing((a) => [...a.slice(0, 99), p]);
                return;
              }
              if (mode === 'pan' || mode.startsWith('vector-')) {
                drag.current = {
                  start: raw,
                  before: structuredClone(tiling),
                  index: -1,
                  kind:
                    mode === 'pan' ? 'pan' : mode === 'vector-u' ? 'u' : 'v',
                  box: canvasBox,
                  clientX: e.clientX,
                  clientY: e.clientY,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
                return;
              }
              const p = raw,
                index =
                  mode === 'vertices'
                    ? tile.points
                        .map((q) => apply(matrix, q))
                        .findIndex((q) => distance(p, q) < span * 0.035)
                    : -1;
              if (mode === 'vertices' && index < 0) return;
              if (index >= 0) setVertexIndex(index);
              drag.current = {
                start: p,
                before: structuredClone(tiling),
                index,
                kind: mode === 'vertices' ? 'vertex' : 'placement',
                box: canvasBox,
                clientX: e.clientX,
                clientY: e.clientY,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              if (d.kind === 'pan') {
                const [x, y, w, h] = d.box.split(' ').map(Number),
                  rect = e.currentTarget.getBoundingClientRect(),
                  scale = Math.max(w / rect.width, h / rect.height);
                setCanvasBox(
                  `${x - (e.clientX - d.clientX) * scale} ${y - (e.clientY - d.clientY) * scale} ${w} ${h}`,
                );
                return;
              }
              const p = localPoint(e);
              if (d.kind === 'u' || d.kind === 'v') {
                const next = structuredClone(d.before);
                if (next.repetition.kind === 'translation') {
                  const q = snap ? snapPoint(p, points, 0.05, span * 0.025) : p;
                  next.repetition[d.kind] = {
                    x: q.x - d.start.x,
                    y: q.y - d.start.y,
                  };
                }
                setTiling(next);
                return;
              }
              const next = structuredClone(d.before),
                t = next.tiles.find((x) => x.id === tile.id);
              if (!t) return;
              const m =
                t.placements[Math.min(placement, t.placements.length - 1)];
              if (d.kind === 'placement') {
                const delta = { x: p.x - d.start.x, y: p.y - d.start.y },
                  target = snap
                    ? snapPoint(
                        { x: m[2] + delta.x, y: m[5] + delta.y },
                        [],
                        0.05,
                        0.05,
                      )
                    : { x: m[2] + delta.x, y: m[5] + delta.y };
                m[2] = target.x;
                m[5] = target.y;
              } else {
                const pt = apply(inverse(m), p);
                t.points[d.index] = snap ? snapPoint(pt, [], 0.05, 0.05) : pt;
                t.regular = false;
              }
              setTiling(next);
            }}
            onPointerUp={() => {
              if (drag.current) {
                const before = drag.current.before;
                setPast((p) => [...p.slice(-39), before]);
                drag.current = null;
              }
            }}
            onPointerCancel={() => {
              if (drag.current) setTiling(drag.current.before);
              drag.current = null;
            }}
          >
            {repeatPreview &&
              rep.kind === 'translation' &&
              [-1, 0, 1].flatMap((x) =>
                [-1, 0, 1].flatMap((y) =>
                  x === 0 && y === 0
                    ? []
                    : includedTiling(tiling).tiles.flatMap((t) =>
                        t.placements.map((m, i) => (
                          <polygon
                            key={`${x}:${y}:${t.id}:${i}`}
                            points={pointsAttribute(
                              t.points.map((p) => {
                                const q = apply(m, p);
                                return {
                                  x: q.x + x * rep.u.x + y * rep.v.x,
                                  y: q.y + x * rep.u.y + y * rep.v.y,
                                };
                              }),
                            )}
                            fill="#176b7210"
                            stroke="#176b7244"
                            strokeWidth={span * 0.002}
                            pointerEvents="none"
                          />
                        )),
                      ),
                ),
              )}
            {drawing.length > 0 && (
              <polyline
                points={pointsAttribute(drawing)}
                fill="none"
                stroke="#c05c3c"
                strokeWidth={span * 0.005}
                pointerEvents="none"
              />
            )}
            {tiling.tiles.flatMap((t) =>
              t.placements.map((m, i) => (
                <polygon
                  key={`${t.id}:${i}`}
                  points={pointsAttribute(t.points.map((p) => apply(m, p)))}
                  fill={
                    t.id === tile.id && i === placement
                      ? '#176b722a'
                      : '#c7b88c18'
                  }
                  stroke={
                    t.id === tile.id && i === placement ? '#176b72' : '#a88d55'
                  }
                  strokeDasharray={
                    t.excluded?.includes(i)
                      ? `${span * 0.015} ${span * 0.01}`
                      : undefined
                  }
                  opacity={t.excluded?.includes(i) ? 0.4 : 1}
                  strokeWidth={span * 0.003}
                  onPointerDown={(e) => {
                    if (
                      mode === 'place' &&
                      (t.id !== tile.id || i !== placement)
                    ) {
                      e.stopPropagation();
                      setTileId(t.id);
                      setPlacement(i);
                    }
                  }}
                />
              )),
            )}
            {mode === 'vertices' &&
              tile.points.map((p, i) => {
                const q = apply(matrix, p);
                return (
                  <circle
                    key={i}
                    cx={q.x}
                    cy={q.y}
                    r={span * 0.012}
                    fill="#176b72"
                  />
                );
              })}
            {rep.kind === 'translation' &&
              [rep.u, rep.v].map((p, i) => (
                <g key={i}>
                  <path
                    d={pathData([{ x: 0, y: 0 }, p])}
                    stroke={i ? '#b36343' : '#6173ad'}
                    strokeWidth={span * 0.004}
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={span * 0.015}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      drag.current = {
                        start: { x: 0, y: 0 },
                        before: structuredClone(tiling),
                        index: -1,
                        kind: i ? 'v' : 'u',
                        box: canvasBox,
                        clientX: e.clientX,
                        clientY: e.clientY,
                      };
                      e.currentTarget.ownerSVGElement?.setPointerCapture(
                        e.pointerId,
                      );
                    }}
                    fill={i ? '#b36343' : '#6173ad'}
                  />
                  <text x={p.x + span * 0.02} y={p.y} fontSize={span * 0.04}>
                    {i ? 'v' : 'u'}
                  </text>
                </g>
              ))}
          </svg>
          <div className="patch-preview">
            <Preview tiling={tiling} />
            <p className="panel-hint">
              {trText(
                'Seed patch preview. Enable tile guides in the workspace to inspect connections between repeated patches.',
              )}
            </p>
          </div>
        </div>
        <div className="editor-settings scroll-settings">
          <label className="text-field">
            {trText('Tiling name')}
            <input
              maxLength={200}
              value={tiling.name}
              onChange={(e) =>
                change((t) => {
                  t.name = e.target.value;
                })
              }
            />
          </label>
          <Choice
            label={trText('Tile shape')}
            value={tile.id}
            options={tiling.tiles.map((t, i) => ({
              value: t.id,
              label: `Shape ${i + 1} · ${t.points.length} sides`,
            }))}
            onChange={(id) => {
              setTileId(id);
              setPlacement(0);
            }}
          />
          <Choice
            label={trText('Placement')}
            value={String(Math.min(placement, tile.placements.length - 1))}
            options={tile.placements.map((_, i) => ({
              value: String(i),
              label: `Copy ${i + 1}`,
            }))}
            onChange={(v) => setPlacement(Number(v))}
          />
          <Check
            label={trText('Include this copy in tiling')}
            checked={!tile.excluded?.includes(placement)}
            onChange={(yes) =>
              changeTile((t) => {
                t.excluded = yes
                  ? (t.excluded || []).filter((i) => i !== placement)
                  : [...(t.excluded || []), placement];
              })
            }
          />
          <div className="editor-tools">
            <Button
              variant="ghost"
              onClick={() =>
                change((t) =>
                  t.tiles.forEach(
                    (s) => (s.excluded = s.placements.map((_, i) => i)),
                  ),
                )
              }
            >
              {trText('Exclude all')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const t = includedTiling(tiling);
                if (!t.tiles.length) {
                  setError('Include at least one polygon first.');
                  return;
                }
                load(t);
              }}
            >
              {trText('Remove excluded')}
            </Button>
            <Button
              variant="outline"
              disabled={rep.kind !== 'translation'}
              onClick={() =>
                change((t) => {
                  if (t.repetition.kind !== 'translation') return;
                  const { u, v } = t.repetition;
                  for (const s of t.tiles) {
                    const base = s.placements.filter(
                      (_, i) => !s.excluded?.includes(i),
                    );
                    for (const x of [-1, 0, 1])
                      for (const y of [-1, 0, 1])
                        if (x || y)
                          for (const m of base) {
                            if (s.placements.length >= 100) continue;
                            s.excluded = [
                              ...(s.excluded || []),
                              s.placements.length,
                            ];
                            s.placements.push(
                              compose(
                                transformation(
                                  x * u.x + y * v.x,
                                  x * u.y + y * v.y,
                                ),
                                m,
                              ),
                            );
                          }
                  }
                })
              }
            >
              {trText('Fill with construction copies')}
            </Button>
          </div>
          <Check
            label={trText('Snap to a 0.05-unit grid')}
            checked={snap}
            onChange={setSnap}
          />
          <div className="editor-tools">
            <Button
              variant="outline"
              disabled={tile.placements.length >= 100}
              onClick={() => {
                changeTile((t) =>
                  t.placements.push(compose(transformation(0.2, 0.2), matrix)),
                );
                setPlacement(tile.placements.length);
              }}
            >
              {trText('Duplicate tile')}
            </Button>
            <Button
              variant="ghost"
              disabled={tile.placements.length === 1}
              onClick={() => {
                changeTile((t) => {
                  t.placements.splice(placement, 1);
                  t.excluded = t.excluded
                    ?.filter((i) => i !== placement)
                    .map((i) => (i > placement ? i - 1 : i));
                });
                setPlacement(0);
              }}
            >
              {trText('Remove copy')}
            </Button>
          </div>
          <Range
            label={trText('Placement x')}
            value={matrix[2]}
            min={-40}
            max={40}
            step={0.05}
            onChange={(x) =>
              setMatrix((m) => [m[0], m[1], x, m[3], m[4], m[5]])
            }
          />
          <Range
            label={trText('Placement y')}
            value={matrix[5]}
            min={-40}
            max={40}
            step={0.05}
            onChange={(y) =>
              setMatrix((m) => [m[0], m[1], m[2], m[3], m[4], y])
            }
          />
          <div className="editor-tools">
            <Button
              variant="outline"
              onClick={() =>
                setMatrix((m) => compose(m, transformation(0, 0, Math.PI / 12)))
              }
            >
              {trText('Rotate 15°')}
            </Button>
            <Button
              variant="outline"
              onClick={() => setMatrix((m) => compose(m, [-1, 0, 0, 0, 1, 0]))}
            >
              {trText('Reflect')}
            </Button>
          </div>
          <Range
            label={trText('New polygon sides')}
            value={sides}
            min={3}
            max={100}
            step={1}
            onChange={setSides}
          />
          <div className="editor-tools">
            <Button
              variant="outline"
              disabled={tiling.tiles.length >= 60}
              onClick={() => {
                const id = uid();
                change((t) => {
                  t.tiles.push({
                    id,
                    regular: true,
                    points: regular(sides),
                    placements: [[...IDENTITY]],
                  });
                });
                setTileId(id);
                setPlacement(0);
              }}
            >
              {trText('Add polygon')}
            </Button>
            <Button
              variant="ghost"
              disabled={tiling.tiles.length === 1}
              onClick={() => {
                change((t) => {
                  t.tiles = t.tiles.filter((t) => t.id !== tile.id);
                });
                setTileId(tiling.tiles.find((t) => t.id !== tile.id)!.id);
                setPlacement(0);
              }}
            >
              {trText('Delete shape')}
            </Button>
          </div>
          {mode === 'vertices' && (
            <Button
              variant="outline"
              disabled={tile.points.length >= 100}
              onClick={() =>
                changeTile((t) => {
                  const i = vertexIndex % t.points.length;
                  t.points.splice(
                    i + 1,
                    0,
                    mix(t.points[i], t.points[(i + 1) % t.points.length], 0.5),
                  );
                  t.regular = false;
                })
              }
            >
              {trText('Add vertex after selection')}
            </Button>
          )}
          {mode === 'vertices' && (
            <>
              <Choice
                label={trText('Selected vertex')}
                value={String(vertexIndex % tile.points.length)}
                options={tile.points.map((_, i) => ({
                  value: String(i),
                  label: `Vertex ${i + 1}`,
                }))}
                onChange={(v) => setVertexIndex(Number(v))}
              />
              {(['x', 'y'] as const).map((axis) => (
                <Range
                  key={axis}
                  label={`Vertex ${axis}`}
                  value={tile.points[vertexIndex % tile.points.length][axis]}
                  min={-50}
                  max={50}
                  step={0.01}
                  onChange={(v) =>
                    changeTile((t) => {
                      t.points[vertexIndex % t.points.length][axis] = v;
                      t.regular = false;
                    })
                  }
                />
              ))}
              <Button
                variant="ghost"
                disabled={tile.points.length <= 3}
                onClick={() => {
                  changeTile((t) => {
                    t.points.splice(vertexIndex % t.points.length, 1);
                    t.regular = false;
                  });
                  setVertexIndex(0);
                }}
              >
                {trText('Remove selected vertex')}
              </Button>
            </>
          )}
          {target && (
            <>
              <Choice
                label={trText('Match to another tile')}
                value={target.key}
                options={otherPlacements.map((t) => ({
                  value: t.key,
                  label: t.label,
                }))}
                onChange={(v) => {
                  setTargetKey(v);
                  setTargetEdge(0);
                }}
              />
              <Choice
                label={trText('This tile edge')}
                value={String(sourceEdge % tile.points.length)}
                options={tile.points.map((_, i) => ({
                  value: String(i),
                  label: `Edge ${i + 1}`,
                }))}
                onChange={(v) => setSourceEdge(Number(v))}
              />
              <Choice
                label={trText('Target edge')}
                value={String(targetEdge % target.tile.points.length)}
                options={target.tile.points.map((_, i) => ({
                  value: String(i),
                  label: `Edge ${i + 1}`,
                }))}
                onChange={(v) => setTargetEdge(Number(v))}
              />
              <Button
                variant="outline"
                onClick={() => {
                  const a = tile.points[sourceEdge % tile.points.length],
                    b = tile.points[(sourceEdge + 1) % tile.points.length],
                    pts = target.tile.points;
                  setMatrix(() =>
                    matchEdge(
                      a,
                      b,
                      apply(target.matrix, pts[(targetEdge + 1) % pts.length]),
                      apply(target.matrix, pts[targetEdge % pts.length]),
                    ),
                  );
                }}
              >
                {trText('Snap edge to edge')}
              </Button>
            </>
          )}
          <label className="text-field">
            {trText('Description')}
            <textarea
              value={tiling.description}
              maxLength={10000}
              rows={3}
              onChange={(e) =>
                change((t) => {
                  t.description = e.target.value;
                })
              }
            />
          </label>
          <label className="text-field">
            {trText('Author')}
            <input
              value={tiling.author}
              maxLength={2000}
              onChange={(e) =>
                change((t) => {
                  t.author = e.target.value;
                })
              }
            />
          </label>
          <Choice
            label={trText('Repetition')}
            value={rep.kind}
            options={[
              { value: 'translation', label: 'Translation lattice' },
              { value: 'inflation', label: 'Concentric inflation' },
            ]}
            onChange={(kind) =>
              change((t) => {
                t.repetition =
                  kind === 'translation'
                    ? { kind, u: { x: 3, y: 0 }, v: { x: 0, y: 3 } }
                    : {
                        kind,
                        center: { x: 0, y: 0 },
                        sectors: 6,
                        rings: 4,
                        transform: transformation(0, 0, 0, 1.8),
                      };
              })
            }
          />
          {rep.kind === 'translation' && (
            <div className="editor-tools">
              <Button variant="outline" onClick={() => setMode('vector-u')}>
                {trText('Draw u vector')}
              </Button>
              <Button variant="outline" onClick={() => setMode('vector-v')}>
                {trText('Draw v vector')}
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  change((t) => {
                    t.repetition = {
                      kind: 'translation',
                      u: { x: 0, y: 0 },
                      v: { x: 0, y: 0 },
                    };
                  })
                }
              >
                {trText('Clear vectors')}
              </Button>
            </div>
          )}
          {rep.kind === 'translation' ? (
            (['u', 'v'] as const).flatMap((vector) =>
              (['x', 'y'] as const).map((axis) => (
                <Range
                  key={vector + axis}
                  label={`${vector} vector · ${axis}`}
                  value={rep[vector][axis]}
                  min={-40}
                  max={40}
                  step={0.05}
                  onChange={(value) =>
                    change((t) => {
                      if (t.repetition.kind === 'translation')
                        t.repetition[vector][axis] = value;
                    })
                  }
                />
              )),
            )
          ) : (
            <>
              <Range
                label={trText('Sectors')}
                value={rep.sectors}
                min={2}
                max={36}
                step={1}
                onChange={(v) =>
                  change((t) => {
                    if (t.repetition.kind === 'inflation')
                      t.repetition.sectors = v;
                  })
                }
              />
              <Range
                label={trText('Rings')}
                value={rep.rings}
                min={1}
                max={9}
                step={1}
                onChange={(v) =>
                  change((t) => {
                    if (t.repetition.kind === 'inflation')
                      t.repetition.rings = v;
                  })
                }
              />
              <Range
                label={trText('Ring scale')}
                value={Math.hypot(rep.transform[0], rep.transform[3])}
                min={1.01}
                max={4}
                step={0.01}
                onChange={(v) =>
                  change((t) => {
                    if (t.repetition.kind === 'inflation') {
                      const r = t.repetition,
                        old = Math.hypot(r.transform[0], r.transform[3]);
                      r.transform = compose(
                        transformation(r.center.x, r.center.y, 0, v / old),
                        compose(
                          transformation(-r.center.x, -r.center.y),
                          r.transform,
                        ),
                      );
                    }
                  })
                }
              />
              <Range
                label={trText('Ring rotation')}
                value={
                  (Math.atan2(rep.transform[3], rep.transform[0]) * 180) /
                  Math.PI
                }
                min={-180}
                max={180}
                step={1}
                onChange={(v) =>
                  change((t) => {
                    if (t.repetition.kind === 'inflation') {
                      const r = t.repetition,
                        delta =
                          (v * Math.PI) / 180 -
                          Math.atan2(r.transform[3], r.transform[0]);
                      r.transform = compose(
                        transformation(r.center.x, r.center.y, delta),
                        compose(
                          transformation(-r.center.x, -r.center.y),
                          r.transform,
                        ),
                      );
                    }
                  })
                }
              />
            </>
          )}
          {(error || valid) && (
            <p className="editor-error" role="alert">
              {error || valid}
            </p>
          )}
        </div>
      </div>
      <div className="editor-footer">
        <Button variant="ghost" onClick={onClose}>
          {trText('Cancel')}
        </Button>
        <Button disabled={Boolean(valid)} onClick={applyTiling}>
          {trText('Apply tiling')}
        </Button>
      </div>
    </ConstructionDialog>
  );
}
