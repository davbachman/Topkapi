'use client';
import { useT, LanguageControl } from './locale';
import { createGeometryWorker } from '@/lib/engine/client-worker';
import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useLayoutEffect,
} from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import NextImage from 'next/image';
import {
  browserModelContext,
  registerProjectTools,
} from '@/lib/project/webmcp';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';
import {
  Undo2,
  Redo2,
  Plus,
  Download,
  FolderOpen,
  ChevronDown,
  Eye,
  EyeOff,
  LockKeyhole,
  LockKeyholeOpen,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  Search,
  Maximize,
  Hand,
  MousePointer2,
  PaintBucket,
  Grid2X2,
  Check as CheckIcon,
  Layers,
  Compass,
  SlidersHorizontal,
  X,
  PanelLeft,
  PanelRight,
  Move,
  Save,
  ImagePlus,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  Project,
  Layer,
  Geometry,
  Bounds,
  Point,
  MotifKind,
  StyleKind,
  Style,
} from '@/lib/engine/types';
import {
  newProject,
  newLayer,
  catalog,
  commit,
  undo,
  redo,
  uid,
  defaultMotif,
  type History,
} from '@/lib/project/model';
import {
  loadAutosave,
  autosave,
  decodeProject,
  download,
} from '@/lib/project/storage';
import { exportEPS } from '@/lib/engine/eps';
import { encodeBMP, encodeGIF, encodeWBMP } from '@/lib/engine/raster';
import { layerSVG, exportSVG, exportDXF } from '@/lib/engine/render';
import { clipSegment } from '@/lib/engine/construction';
import {
  bounds,
  inside,
  apply,
  inverse,
  transformation,
  rotate,
} from '@/lib/engine/geometry';
import { Range, Choice, Check } from './controls';
import { Preview } from './preview';
import { FabricationDialog } from './fabrication';
import { MotifEditor, TilingEditor, VariationEditor } from './editors';
import { makeMotif } from '@/lib/engine/motifs';
import { inferNeighbors } from '@/lib/engine/advanced';
import { updateProject } from '@/lib/project/model';
import { loadTilings, blankTiling } from '@/lib/project/tilings';
import examples from '@/lib/project/examples.json';
import './workbench.css';
const styles: { value: StyleKind; label: string }[] = [
  { value: 'plain', label: 'Linework' },
  { value: 'thick', label: 'Bands' },
  { value: 'outline', label: 'Outlined' },
  { value: 'interlace', label: 'Interlaced' },
  { value: 'emboss', label: 'Embossed' },
  { value: 'filled', label: 'Filled regions' },
  { value: 'sketch', label: 'Sketched' },
];
const motifs: { value: MotifKind; label: string }[] = [
  { value: 'star', label: 'Star' },
  { value: 'rosette', label: 'Rosette' },
  { value: 'extended', label: 'Extended rosette' },
  { value: 'hourglass', label: 'Hourglass' },
  { value: 'intersect', label: 'Intersect' },
  { value: 'girih', label: 'Girih tiles' },
  { value: 'hankin', label: 'Hankin rays' },
  { value: 'custom', label: 'Drawn motif' },
];
const palettes = [
  ['#176b72', '#073c47', '#ffffff'],
  ['#ba7930', '#553c22', '#fffdf8'],
  ['#3f5a9c', '#1c2d5b', '#f8faff'],
  ['#c4604c', '#653b3a', '#fffaf7'],
  ['#363c44', '#141b22', '#ffffff'],
];
type Modal =
  | 'examples'
  | 'library'
  | 'export'
  | 'explore'
  | 'project'
  | 'motif'
  | 'tiling'
  | 'help'
  | 'fabrication'
  | null;
function IconButton({
  label,
  children,
  onClick,
  disabled = false,
  active = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  const trText = useT();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            className={`icon-button ${active ? 'active' : ''}`}
            variant="ghost"
            aria-label={trText(label)}
            disabled={disabled}
            onClick={onClick}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>{trText(label)}</TooltipContent>
    </Tooltip>
  );
}
export function Workbench() {
  const trText = useT();
  const [history, setHistory] = useState<History>(() => ({
    past: [],
    present: newProject(),
    future: [],
  }));
  const project = history.present;
  const lastSavedProject = useRef<Project | null>(null);
  const [hydrated, setHydrated] = useState(false),
    [saveState, setSaveState] = useState('Loading workspace'),
    [message, setMessage] = useState('');
  const [selection, setSelected] = useState<string[]>([]),
    [tileId, setTileId] = useState(''),
    [modal, setModal] = useState<Modal>(null),
    [query, setQuery] = useState(''),
    [libraryCount, setLibraryCount] = useState(24);
  const [mode, setMode] = useState<
      'select' | 'pan' | 'paint' | 'move' | 'rotate' | 'scale'
    >('pan'),
    [showTiles, setShowTiles] = useState(false),
    [showChecks, setShowChecks] = useState(false),
    [showCenters, setShowCenters] = useState(false),
    [paint, setPaint] = useState('#dcae67');
  const [dimensions, setDimensions] = useState({ w: 900, h: 700 }),
    [geometries, setGeometries] = useState<Record<string, Geometry>>({}),
    [calculating, setCalculating] = useState(true),
    [panels, setPanels] = useState({ left: true, right: true });
  const [exportType, setExportType] = useState<
    | 'svg'
    | 'eps'
    | 'png'
    | 'jpeg'
    | 'gif'
    | 'bmp'
    | 'wbmp'
    | 'dxf-lines'
    | 'dxf-faces'
    | 'dxf-solid'
    | 'project'
  >('svg');
  const [savedTilings, setSavedTilings] = useState<
    import('@/lib/engine/types').Tiling[]
  >([]);
  useEffect(() => {
    const load = () => setSavedTilings(loadTilings());
    load();
    window.addEventListener('taprats-tilings', load);
    return () => window.removeEventListener('taprats-tilings', load);
  }, []);
  const allTilings = [...savedTilings, ...catalog];
  const [newTilingLayer, setNewTilingLayer] = useState<Layer | null>(null);
  const [exporting, setExporting] = useState(false);
  const stage = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    worker = useRef<Worker | null>(null),
    request = useRef(0);
  const drag = useRef<{
      x: number;
      y: number;
      view: Project['view'];
      moves?: {
        id: string;
        x: number;
        y: number;
        rotation: number;
        scale: number;
      }[];
      mode?: 'move' | 'rotate' | 'scale';
    } | null>(null),
    space = useRef(false),
    projectRef = useRef(project);
  useLayoutEffect(() => {
    projectRef.current = project;
  }, [project]);
  const selected = selection.filter((id) =>
    project.layers.some((l) => l.id === id),
  );
  const active =
    project.layers.find((l) => l.id === selected[0]) ||
    project.layers[project.layers.length - 1];
  const activeTile =
    active?.tiling.tiles.find((t) => t.id === tileId) ||
    active?.tiling.tiles[0];
  const motif = activeTile && active?.motifs[activeTile.id];
  const region: Bounds = {
    minX: project.view.x - dimensions.w / (2 * project.view.scale),
    maxX: project.view.x + dimensions.w / (2 * project.view.scale),
    minY: project.view.y - dimensions.h / (2 * project.view.scale),
    maxY: project.view.y + dimensions.h / (2 * project.view.scale),
  };
  const exportRegion: Bounds = {
    minX: region.minX,
    maxX: region.maxX,
    minY:
      project.view.y -
      ((region.maxX - region.minX) * project.height) / project.width / 2,
    maxY:
      project.view.y +
      ((region.maxX - region.minX) * project.height) / project.width / 2,
  };
  const edit = useCallback((fn: (p: Project) => void, preview = false) => {
    setHistory((h) => updateProject(h, fn, preview));
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    return registerProjectTools(
      browserModelContext(),
      () => projectRef.current,
      async (p) => {
        flushSync(() => {
          setHistory((h) => commit(h, p));
          setSelected([]);
          setTileId('');
        });
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
      },
      (error) => {
        console.warn('Taprats project tools unavailable', error);
      },
    );
  }, [hydrated]);
  const editLayers = (fn: (l: Layer) => void, preview = false) =>
    edit(
      (p) =>
        p.layers
          .filter(
            (l) =>
              (selected.length
                ? selected.includes(l.id)
                : l.id === active?.id) && !l.locked,
          )
          .forEach(fn),
      preview,
    );
  const editMotif = (
    fn: (m: NonNullable<typeof motif>) => void,
    preview = false,
  ) => {
    if (!active || !activeTile) return;
    edit((p) => {
      const l = p.layers.find((l) => l.id === active.id);
      if (l && !l.locked) {
        delete l.frozen;
        delete l.frozenFaceClasses;
        fn(l.motifs[activeTile.id]);
      }
    }, preview);
  };
  const changeStyle = (patch: Partial<Style>, preview = false) =>
    editLayers((l) => Object.assign(l.style, patch), preview);
  useEffect(() => {
    if (!hydrated) return;
    let live = true;
    void Promise.resolve().then(() => {
      if (live) setSaveState('Saving…');
    });
    const timer = setTimeout(() => {
      void autosave(project)
        .then(() => {
          lastSavedProject.current = project;
          if (live) setSaveState('Saved in this browser');
        })
        .catch((e) => {
          if (live) {
            setSaveState('Save failed');
            setMessage(`Download a backup: ${String(e)}`);
          }
        });
    }, 450);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [project, hydrated]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (hydrated && lastSavedProject.current !== projectRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hydrated]);
  useEffect(() => {
    let live = true;
    void loadAutosave()
      .then((p) => {
        if (live) {
          if (p) setHistory({ past: [], present: p, future: [] });
          lastSavedProject.current = p;
          setSaveState(p ? 'Recovered local project' : 'Ready');
          if (window.innerWidth < 1050)
            setPanels({ left: false, right: false });
          setHydrated(true);
        }
      })
      .catch((e) => {
        if (live) {
          setMessage(`Recovery unavailable: ${String(e)}`);
          setHydrated(true);
        }
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([e]) =>
      setDimensions({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const geometryKey = JSON.stringify({
    layers: project.layers.map((l) => ({
      id: l.id,
      tiling: l.tiling,
      motifs: l.motifs,
      transform: l.transform,
      visible: l.visible,
      frozen: l.frozen,
    })),
    region,
  });
  useEffect(() => {
    const id = ++request.current;
    const timer = setTimeout(() => {
      worker.current?.terminate();
      const w = createGeometryWorker();
      worker.current = w;
      setCalculating(true);
      w.onmessage = (
        e: MessageEvent<{
          id: number;
          results?: Record<string, Geometry>;
          error?: string;
        }>,
      ) => {
        if (e.data.id !== request.current) return;
        if (e.data.error) setMessage(`Geometry: ${e.data.error}`);
        else if (e.data.results) setGeometries(e.data.results);
        setCalculating(false);
      };
      w.onerror = (e) => {
        setMessage(`Geometry worker: ${e.message}`);
        setCalculating(false);
      };
      const p = projectRef.current;
      w.postMessage({
        id,
        layers: p.layers,
        region: JSON.parse(geometryKey).region,
      });
    }, 100);
    return () => {
      clearTimeout(timer);
      worker.current?.terminate();
    };
  }, [geometryKey]);
  const saveProject = useCallback(() => {
    download(
      `${projectRef.current.name}.taprats.json`,
      JSON.stringify(projectRef.current, null, 2),
    );
    setMessage('Project downloaded with its tilings and settings.');
  }, []);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (modal) return;
      if (
        (e.target as HTMLElement).matches(
          'input,textarea,[contenteditable=true]',
        )
      )
        return;
      if (e.code === 'Space') {
        space.current = true;
        e.preventDefault();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        setHistory((h) => (e.shiftKey ? redo(h) : undo(h)));
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveProject();
      }
      if (e.key === 'Escape') {
        setModal(null);
        drag.current = null;
      }
      if (e.key.toLowerCase() === 'h') setMode('pan');
      if (e.key.toLowerCase() === 'm') setMode('move');
      if (e.key.toLowerCase() === 'v') setMode('select');
      if (e.key.toLowerCase() === 'b') setMode('paint');
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [saveProject, modal]);
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(''), 7000);
    return () => clearTimeout(id);
  }, [message]);
  const world = (x: number, y: number): Point => {
    const r = stage.current!.getBoundingClientRect();
    return {
      x: project.view.x + (x - r.left - dimensions.w / 2) / project.view.scale,
      y: project.view.y + (y - r.top - dimensions.h / 2) / project.view.scale,
    };
  };
  function pointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0 && e.button !== 1) return;
    if (mode === 'pan' || space.current || e.button === 1) {
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY, view: { ...project.view } };
      return;
    }
    if (mode === 'move' || mode === 'rotate' || mode === 'scale') {
      const moves = project.layers
        .filter((l) => l.visible && l.moving && !l.locked)
        .map((l) => ({ id: l.id, ...l.transform }));
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = {
        x: e.clientX,
        y: e.clientY,
        view: { ...project.view },
        moves,
        mode,
      };
      return;
    }
    const p = world(e.clientX, e.clientY);
    for (const l of [...project.layers].reverse()) {
      if (!l.visible) continue;
      const g = geometries[l.id];
      if (!g) continue;
      if (mode === 'paint') {
        const face = g.faces.find((f) => inside(p, f.points));
        if (face && !l.locked) {
          edit((doc) => {
            doc.layers.find((x) => x.id === l.id)!.regionColors[face.id] =
              paint;
          });
          return;
        }
      } else {
        const t = g.tiles.find((t) => inside(p, t.points));
        if (t) {
          setSelected([l.id]);
          setTileId(t.tileId);
          return;
        }
      }
    }
  }
  function pointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!drag.current) return;
    const d = drag.current;
    edit((p) => {
      if (d.moves) {
        for (const l of p.layers) {
          const from = d.moves.find((m) => m.id === l.id);
          if (from && d.mode === 'rotate') {
            const angle = (e.clientX - d.x) * 0.01,
              offset = rotate(
                { x: from.x - d.view.x, y: from.y - d.view.y },
                angle,
              );
            l.transform = {
              ...from,
              x: d.view.x + offset.x,
              y: d.view.y + offset.y,
              rotation: from.rotation + (angle * 180) / Math.PI,
            };
          } else if (from && d.mode === 'scale') {
            const factor = Math.exp((e.clientX - d.x) * 0.005),
              scale = Math.max(0.01, Math.min(100, from.scale * factor)),
              f = scale / from.scale;
            l.transform = {
              ...from,
              x: d.view.x + (from.x - d.view.x) * f,
              y: d.view.y + (from.y - d.view.y) * f,
              scale,
            };
          } else if (from) {
            l.transform.x = from.x + (e.clientX - d.x) / d.view.scale;
            l.transform.y = from.y + (e.clientY - d.y) / d.view.scale;
          }
        }
        return;
      }
      p.view = {
        ...d.view,
        x: d.view.x - (e.clientX - d.x) / d.view.scale,
        y: d.view.y - (e.clientY - d.y) / d.view.scale,
      };
    }, true);
  }
  function endPointer() {
    if (drag.current) {
      drag.current = null;
      edit(() => {});
    }
  }
  function zoom(factor: number) {
    edit((p) => {
      p.view.scale = Math.max(6, Math.min(1000, p.view.scale * factor));
    });
  }
  const art = useMemo(
    () =>
      project.layers
        .filter((l) => l.visible && geometries[l.id])
        .map((l) =>
          layerSVG(l, geometries[l.id], {
            tiles: showTiles,
            diagnostics: showChecks,
            centers: showCenters,
          }),
        )
        .join(''),
    [project.layers, geometries, showTiles, showChecks, showCenters],
  );
  const stats = Object.values(geometries).reduce(
    (a, g) => ({
      edges: a.edges + g.edges.length,
      faces: a.faces + g.faces.length,
      conflicts: a.conflicts + g.crossings.filter((c) => c.conflict).length,
      truncated: a.truncated || g.truncated,
    }),
    { edges: 0, faces: 0, conflicts: 0, truncated: false },
  );
  async function openFile(file: File | undefined) {
    if (!file) return;
    try {
      const p = decodeProject(await file.text());
      setHistory((h) => commit(h, p));
      setSelected([]);
      setTileId('');
      setMessage(`Opened ${p.name}.`);
    } catch (e) {
      setMessage(String(e));
    }
    if (fileInput.current) fileInput.current.value = '';
  }
  async function openExample(id: string) {
    try {
      setMessage('Opening example…');
      const response = await fetch(`/native-examples/${id}.json`);
      if (!response.ok) throw Error('Example could not be loaded.');
      const p = decodeProject(await response.text());
      setHistory((h) => commit(h, p));
      setSelected([]);
      setTileId('');
      setModal(null);
      setMessage(`Opened ${p.name}. Undo restores your previous project.`);
    } catch (e) {
      setMessage(String(e));
    }
  }
  function addTiling(id: string) {
    const t = allTilings.find((t) => t.id === id)!;
    if (project.layers.length >= 24) {
      setMessage('This workspace supports up to 24 layers.');
      return;
    }
    const l = newLayer(t, palettes[project.layers.length % palettes.length][0]);
    edit((p) => {
      p.layers.push(l);
    });
    setSelected([l.id]);
    setTileId(t.tiles[0].id);
    setModal(null);
  }
  function reorder(id: string, offset: number) {
    edit((p) => {
      const i = p.layers.findIndex((l) => l.id === id),
        j = i + offset;
      if (i < 0 || j < 0 || j >= p.layers.length) return;
      [p.layers[i], p.layers[j]] = [p.layers[j], p.layers[i]];
    });
  }
  async function doExport() {
    try {
      if (exportType === 'project') {
        saveProject();
        return;
      }
      setExporting(true);
      const margin = 2;
      const exportGeometries = await new Promise<Record<string, Geometry>>(
        (resolve, reject) => {
          const w = createGeometryWorker();
          const timer = setTimeout(() => {
            w.terminate();
            reject(
              Error('Export took too long. Zoom in or simplify the pattern.'),
            );
          }, 30000);
          const finish = () => {
            clearTimeout(timer);
            w.terminate();
          };
          w.onmessage = (e) => {
            finish();
            if (e.data.error) reject(Error(e.data.error));
            else resolve(e.data.results);
          };
          w.onerror = (e) => {
            finish();
            reject(Error(e.message));
          };
          w.postMessage({
            id: 1,
            layers: project.layers,
            region: {
              minX: exportRegion.minX - margin,
              minY: exportRegion.minY - margin,
              maxX: exportRegion.maxX + margin,
              maxY: exportRegion.maxY + margin,
            },
          });
        },
      );
      if (Object.values(exportGeometries).some((g) => g.truncated))
        throw Error(
          'The output exceeds the geometry limit. Zoom in or reduce repetition before exporting.',
        );
      const svg = exportSVG(project, exportGeometries, exportRegion);
      if (exportType === 'svg')
        download(`${project.name}.svg`, svg, 'image/svg+xml');
      else if (exportType === 'eps')
        download(
          `${project.name}.eps`,
          exportEPS(project, exportGeometries, exportRegion),
          'application/postscript',
        );
      else if (exportType.startsWith('dxf'))
        download(
          `${project.name}.dxf`,
          exportDXF(
            project,
            exportGeometries,
            exportRegion,
            exportType === 'dxf-lines'
              ? 'lines'
              : exportType === 'dxf-solid'
                ? 'solid'
                : 'faces',
          ),
          'application/dxf',
        );
      else {
        const canvas = document.createElement('canvas');
        const pixels = 2400 / Math.max(project.width, project.height);
        canvas.width = Math.max(1, Math.round(project.width * pixels));
        canvas.height = Math.max(1, Math.round(project.height * pixels));
        const img = new Image(),
          url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(Error('PNG rendering failed.'));
          img.src = url;
        });
        canvas
          .getContext('2d')!
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        if (['bmp', 'gif', 'wbmp'].includes(exportType)) {
          const rgba = canvas
            .getContext('2d')!
            .getImageData(0, 0, canvas.width, canvas.height).data;
          const bytes =
            exportType === 'bmp'
              ? encodeBMP(canvas.width, canvas.height, rgba)
              : exportType === 'gif'
                ? encodeGIF(canvas.width, canvas.height, rgba)
                : encodeWBMP(canvas.width, canvas.height, rgba);
          download(
            `${project.name}.${exportType}`,
            new Blob([bytes as BlobPart], {
              type: `image/${exportType === 'wbmp' ? 'vnd.wap.wbmp' : exportType}`,
            }),
          );
        } else {
          const format = exportType === 'jpeg' ? 'jpeg' : 'png';
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(Error('Image export failed.'))),
              `image/${format}`,
              0.95,
            ),
          );
          download(`${project.name}.${format}`, blob);
        }
      }
      setMessage('Export downloaded.');
      setModal(null);
    } catch (e) {
      setMessage(String(e));
    } finally {
      setExporting(false);
    }
  }
  return (
    <TooltipProvider>
      <main
        inert={!hydrated}
        aria-busy={!hydrated}
        className={`workbench ${panels.left ? '' : 'hide-left'} ${panels.right ? '' : 'hide-right'}`}
      >
        <header className="wb-header">
          <div className="wb-brand">
            <Compass size={28} />
            <strong>
              {trText('Taprats')}
              <span>{trText('STUDIO')}</span>
            </strong>
          </div>
          <button className="project-name" onClick={() => setModal('project')}>
            {project.name}
            <ChevronDown size={14} />
          </button>
          <div className="header-history">
            <IconButton
              label={trText('Undo · ⌘Z')}
              disabled={!history.past.length}
              onClick={() => {
                setHistory(undo);
              }}
            >
              <Undo2 />
            </IconButton>
            <IconButton
              label={trText('Redo · ⇧⌘Z')}
              disabled={!history.future.length}
              onClick={() => {
                setHistory(redo);
              }}
            >
              <Redo2 />
            </IconButton>
          </div>
          <LanguageControl />
          <div className="header-spacer" />
          <span className="save-indicator">
            <CheckIcon size={13} />
            {trText(saveState)}
          </span>
          <IconButton
            label={trText('Open project')}
            onClick={() => fileInput.current?.click()}
          >
            <FolderOpen />
          </IconButton>
          <IconButton label={trText('Save project · ⌘S')} onClick={saveProject}>
            <Save />
          </IconButton>
          <Button className="export-button" onClick={() => setModal('export')}>
            <Download size={16} />
            {trText('Export')}
          </Button>
        </header>
        <aside className="wb-left">
          <div className="panel-heading">
            <button
              className="mobile-panel-close"
              aria-label={trText('Close layers panel')}
              onClick={() => setPanels((p) => ({ ...p, left: false }))}
            >
              <X size={16} />
            </button>
            <h2>
              <Layers size={16} />
              {trText('Layers')}
            </h2>
            <IconButton
              label={trText('Add layer')}
              onClick={() => setModal('library')}
            >
              <Plus />
            </IconButton>
          </div>
          <div className="layer-stack">
            {[...project.layers].reverse().map((l) => (
              <div
                key={l.id}
                className={`layer-card ${selected.includes(l.id) || (!selected.length && active?.id === l.id) ? 'selected' : ''}`}
                draggable={!l.locked}
                onDragStart={(e) => e.dataTransfer.setData('text/plain', l.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData('text/plain');
                  edit((p) => {
                    const i = p.layers.findIndex((l) => l.id === id),
                      j = p.layers.findIndex((x) => x.id === l.id);
                    if (i >= 0 && j >= 0 && !p.layers[i].locked) {
                      const [item] = p.layers.splice(i, 1);
                      p.layers.splice(j, 0, item);
                    }
                  });
                }}
              >
                <button
                  className="layer-select"
                  onClick={(e) => {
                    setSelected(
                      e.shiftKey
                        ? selected.includes(l.id)
                          ? selected.filter((i) => i !== l.id)
                          : [...selected, l.id]
                        : [l.id],
                    );
                    setTileId('');
                  }}
                >
                  <span className="layer-thumb">
                    <Preview tiling={l.tiling} color={l.style.color} />
                  </span>
                  <span>
                    <strong>{l.name}</strong>
                    <small>
                      {trText(
                        styles.find((s) => s.value === l.style.kind)?.label ||
                          '',
                      )}{' '}
                      ·{' '}
                      {l.tiling.repetition.kind === 'inflation'
                        ? trText('Inflation')
                        : trText('Periodic')}
                    </small>
                  </span>
                </button>
                <div className="layer-switches">
                  <IconButton
                    label={`${l.visible ? 'Hide' : 'Show'} ${l.name}`}
                    onClick={() =>
                      edit((p) => {
                        p.layers.find((x) => x.id === l.id)!.visible =
                          !l.visible;
                      })
                    }
                  >
                    {l.visible ? <Eye /> : <EyeOff />}
                  </IconButton>
                  <IconButton
                    label={`${l.locked ? 'Unlock' : 'Lock'} ${l.name}`}
                    onClick={() =>
                      edit((p) => {
                        p.layers.find((x) => x.id === l.id)!.locked = !l.locked;
                      })
                    }
                  >
                    {l.locked ? <LockKeyhole /> : <LockKeyholeOpen />}
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
          <div className="layer-actions">
            <IconButton
              label={trText('Duplicate layer')}
              disabled={!active || project.layers.length >= 24}
              onClick={() => {
                if (!active || project.layers.length >= 24) return;
                const l = structuredClone(active);
                l.id = uid();
                l.name += ' copy';
                edit((p) => {
                  p.layers.push(l);
                });
                setSelected([l.id]);
              }}
            >
              <Copy />
            </IconButton>
            <IconButton
              label={trText('Move layer up')}
              disabled={!active}
              onClick={() => active && reorder(active.id, 1)}
            >
              <ArrowUp />
            </IconButton>
            <IconButton
              label={trText('Move layer down')}
              disabled={!active}
              onClick={() => active && reorder(active.id, -1)}
            >
              <ArrowDown />
            </IconButton>
            <IconButton
              label={trText('Delete selected layers')}
              disabled={!active}
              onClick={() =>
                edit((p) => {
                  p.layers = p.layers.filter(
                    (l) =>
                      l.locked ||
                      !(selected.length
                        ? selected.includes(l.id)
                        : l.id === active?.id),
                  );
                })
              }
            >
              <Trash2 />
            </IconButton>
          </div>
          <Button
            variant="outline"
            className="browse-button"
            onClick={() => setModal('library')}
          >
            <Grid2X2 size={16} />
            {trText('Browse tilings')}
            <span>{allTilings.length}</span>
          </Button>
          <Button
            variant="outline"
            className="browse-button"
            onClick={() => {
              setQuery('');
              setModal('examples');
            }}
          >
            {trText('Select example')}
            <span>{examples.length}</span>
          </Button>
          <div className="construction-panel">
            <h3>{trText('CONSTRUCTION')}</h3>
            <Check
              label={trText('Show underlying tiles')}
              checked={showTiles}
              onChange={setShowTiles}
            />
            <Check
              label={trText('Show symmetry centers')}
              checked={showCenters}
              onChange={setShowCenters}
            />
            <Check
              label={trText('Check connections')}
              checked={showChecks}
              onChange={setShowChecks}
            />
            {showChecks && (
              <p className="panel-hint">
                {trText(
                  'Orange marks open ends and junctions. Violet marks conflicting over/under constraints. Ends at the generated boundary are expected.',
                )}
              </p>
            )}
            <button className="text-action" onClick={() => setModal('help')}>
              {trText('How the pattern is made')}
              <span>↗</span>
            </button>
          </div>
          <Button
            variant="ghost"
            disabled={!active || active.locked || calculating}
            onClick={() => {
              if (!active) return;
              const g = geometries[active.id];
              if (!active.frozen && (!g || g.truncated)) {
                setMessage('Zoom in before freezing a complete construction.');
                return;
              }
              edit((p) => {
                const l = p.layers.find((l) => l.id === active.id)!;
                delete l.frozenFaceClasses;
                if (l.frozen) delete l.frozen;
                else {
                  const inv = inverse(
                    transformation(
                      l.transform.x,
                      l.transform.y,
                      (l.transform.rotation * Math.PI) / 180,
                      l.transform.scale,
                    ),
                  );
                  l.frozen = g.segments.flatMap((s) => {
                    const clipped = clipSegment(s, region);
                    return clipped
                      ? [{ a: apply(inv, clipped.a), b: apply(inv, clipped.b) }]
                      : [];
                  });
                }
              });
            }}
          >
            {active?.frozen
              ? trText('Resume repeating construction')
              : trText('Freeze visible construction')}
          </Button>
          <Button variant="ghost" onClick={() => setModal('fabrication')}>
            {trText('Check output geometry')}
          </Button>
          <Button
            variant="ghost"
            disabled={project.layers.length >= 24}
            onClick={() => {
              setNewTilingLayer(newLayer(blankTiling()));
              setModal('tiling');
            }}
          >
            {trText('New tiling')}
          </Button>
          <div className="panel-bottom">
            <Button
              variant="ghost"
              disabled={!active || active.locked}
              onClick={() => setModal('tiling')}
            >
              <Compass size={16} />
              {trText('Edit tiling')}
            </Button>
            <Button variant="ghost" onClick={() => imageInput.current?.click()}>
              <ImagePlus size={16} />
              {trText('Reference image')}
            </Button>
          </div>
        </aside>
        <section className="wb-center">
          <div className="canvas-toolbar">
            <IconButton
              label={trText('Toggle layers panel')}
              onClick={() => setPanels((p) => ({ ...p, left: !p.left }))}
            >
              <PanelLeft />
            </IconButton>
            <div className="tool-divider" />
            <IconButton
              label={trText('Select tile · V')}
              active={mode === 'select'}
              onClick={() => setMode('select')}
            >
              <MousePointer2 />
            </IconButton>
            <IconButton
              label={trText('Pan · H or Space-drag')}
              active={mode === 'pan'}
              onClick={() => setMode('pan')}
            >
              <Hand />
            </IconButton>
            <IconButton
              label={trText('Move enabled layers · M')}
              active={mode === 'move'}
              onClick={() => setMode('move')}
            >
              <Move />
            </IconButton>
            <IconButton
              label={trText('Rotate enabled layers')}
              active={mode === 'rotate'}
              onClick={() => setMode('rotate')}
            >
              <Redo2 />
            </IconButton>
            <IconButton
              label={trText('Scale enabled layers')}
              active={mode === 'scale'}
              onClick={() => setMode('scale')}
            >
              <Maximize />
            </IconButton>
            <IconButton
              label={trText('Paint a region · B')}
              active={mode === 'paint'}
              onClick={() => setMode('paint')}
            >
              <PaintBucket />
            </IconButton>
            {mode === 'paint' && (
              <input
                aria-label={trText('Region paint color')}
                type="color"
                value={paint}
                onChange={(e) => setPaint(e.target.value)}
              />
            )}
            <div className="header-spacer" />
            <span className="canvas-caption">
              {mode === 'select'
                ? trText('Select any tile to edit its motif')
                : mode === 'move'
                  ? trText('Drag to move layers with group moves enabled')
                  : mode === 'paint'
                    ? trText('Click an enclosed region to color it')
                    : trText('Space to pan · scroll to zoom')}
            </span>
            <IconButton
              label={trText('Toggle inspector')}
              onClick={() => setPanels((p) => ({ ...p, right: !p.right }))}
            >
              <PanelRight />
            </IconButton>
          </div>
          <div
            ref={stage}
            className={`pattern-stage mode-${mode}`}
            onWheel={(e) => {
              const p = world(e.clientX, e.clientY),
                factor = Math.exp(-e.deltaY * 0.001);
              edit((doc) => {
                const scale = Math.max(
                  6,
                  Math.min(1000, doc.view.scale * factor),
                );
                doc.view.x =
                  p.x - ((p.x - doc.view.x) * doc.view.scale) / scale;
                doc.view.y =
                  p.y - ((p.y - doc.view.y) * doc.view.scale) / scale;
                doc.view.scale = scale;
              });
            }}
          >
            <svg
              className="pattern-svg"
              viewBox={`${region.minX} ${region.minY} ${region.maxX - region.minX} ${region.maxY - region.minY}`}
              role="application"
              aria-label={trText(
                'Interactive pattern canvas. Use the toolbar to select, pan, or paint.',
              )}
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={endPointer}
              onPointerCancel={endPointer}
            >
              <rect
                x={region.minX}
                y={region.minY}
                width={region.maxX - region.minX}
                height={region.maxY - region.minY}
                fill={project.paper}
              />
              {project.reference && (
                <image
                  href={project.reference.data}
                  x={project.reference.x}
                  y={project.reference.y}
                  width={project.reference.width}
                  height={project.reference.width / project.reference.aspect}
                  opacity={project.reference.opacity}
                  transform={`rotate(${project.reference.rotation} ${project.reference.x} ${project.reference.y})`}
                />
              )}
              <g dangerouslySetInnerHTML={{ __html: art }} />
              {mode === 'select' &&
                activeTile &&
                geometries[active?.id || '']?.tiles
                  .filter((t) => t.tileId === activeTile.id)
                  .map((t, i) => (
                    <polygon
                      key={i}
                      points={t.points.map((p) => `${p.x},${p.y}`).join(' ')}
                      fill="#c49b4114"
                      stroke="#c69c44"
                      strokeWidth={0.012}
                    />
                  ))}
            </svg>
            {!project.layers.length && (
              <div className="canvas-empty">
                <Compass size={48} />
                <h2>{trText('Your next pattern starts here')}</h2>
                <p>{trText('Choose a tiling, then explore its geometry.')}</p>
                <Button onClick={() => setModal('library')}>
                  {trText('Choose a tiling')}
                </Button>
              </div>
            )}
            {calculating && (
              <div className="calculation-badge">
                <span />
                {trText('Constructing pattern…')}
              </div>
            )}
            <div className="zoom-controls">
              <span className="mobile-history">
                <IconButton
                  label={trText('Undo · ⌘Z')}
                  disabled={!history.past.length}
                  onClick={() => setHistory(undo)}
                >
                  <Undo2 />
                </IconButton>
                <IconButton
                  label={trText('Redo · ⇧⌘Z')}
                  disabled={!history.future.length}
                  onClick={() => setHistory(redo)}
                >
                  <Redo2 />
                </IconButton>
              </span>
              <IconButton
                label={trText('Zoom out')}
                onClick={() => zoom(1 / 1.2)}
              >
                <ZoomOut />
              </IconButton>
              <span>{Math.round((project.view.scale / 85) * 100)}%</span>
              <IconButton label={trText('Zoom in')} onClick={() => zoom(1.2)}>
                <ZoomIn />
              </IconButton>
              <div className="tool-divider" />
              <IconButton
                label={trText('Fit pattern')}
                onClick={() => {
                  if (!active) return;
                  const b = bounds(
                    active.tiling.tiles.flatMap((t) =>
                      t.placements.flatMap((m) =>
                        t.points.map((p) => ({
                          x: m[0] * p.x + m[1] * p.y + m[2],
                          y: m[3] * p.x + m[4] * p.y + m[5],
                        })),
                      ),
                    ),
                  );
                  edit((p) => {
                    p.view = {
                      x: (b.minX + b.maxX) / 2,
                      y: (b.minY + b.maxY) / 2,
                      scale: Math.min(
                        dimensions.w / (b.maxX - b.minX) / 3,
                        dimensions.h / (b.maxY - b.minY) / 3,
                      ),
                    };
                  });
                }}
              >
                <Maximize />
              </IconButton>
            </div>
          </div>
          <div className="canvas-footer">
            <span>
              {stats.edges.toLocaleString()} {trText('edges')}
              <i /> {stats.faces.toLocaleString()} {trText('regions')}
            </span>
            <span>
              {stats.truncated
                ? 'Detail limit reached · zoom in'
                : `${project.width} × ${project.height} ${project.units}`}
            </span>
            <button onClick={() => setModal('help')}>
              {trText('Native geometry engine')}
              <span className="live-dot" />
            </button>
          </div>
        </section>
        <aside className="wb-right">
          <div className="panel-heading">
            <button
              className="mobile-panel-close"
              aria-label={trText('Close inspector')}
              onClick={() => setPanels((p) => ({ ...p, right: false }))}
            >
              <X size={16} />
            </button>
            <h2>
              <SlidersHorizontal size={16} />
              {trText('Inspector')}
            </h2>
            <span>
              {selected.length > 1
                ? `${selected.length} layers`
                : active?.tiling.repetition.kind === 'inflation'
                  ? trText('Inflation')
                  : trText('Pattern')}
            </span>
          </div>
          {active && motif && activeTile ? (
            <Tabs defaultValue="motif" className="inspector-tabs">
              <TabsList>
                <TabsTrigger value="motif">{trText('Motif')}</TabsTrigger>
                <TabsTrigger value="style">{trText('Style')}</TabsTrigger>
                <TabsTrigger value="transform">
                  {trText('Position')}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="motif">
                <div className="inspector-section">
                  <h3>{trText('TILE SHAPE')}</h3>
                  <div className="tile-shapes">
                    {active.tiling.tiles.map((t) => (
                      <button
                        key={t.id}
                        aria-label={`Edit ${t.points.length}-sided tile ${t.id}`}
                        className={t.id === activeTile.id ? 'selected' : ''}
                        onClick={() => setTileId(t.id)}
                      >
                        <Preview
                          tiling={{
                            ...active.tiling,
                            tiles: [{ ...t, placements: [[1, 0, 0, 0, 1, 0]] }],
                          }}
                        />
                        <small>
                          {t.points.length} {trText('sides')}
                        </small>
                      </button>
                    ))}
                  </div>
                  <p className="panel-hint">
                    {trText('Changes repeat in every matching tile.')}
                  </p>
                </div>
                <div className="inspector-section">
                  <Choice
                    label={trText('Construction')}
                    value={motif.kind}
                    options={
                      activeTile.regular
                        ? motifs
                        : motifs.filter((m) => m.value !== 'extended')
                    }
                    onChange={(kind) =>
                      editMotif((m) => {
                        m.kind = kind;
                        if (['star', 'hourglass'].includes(kind))
                          m.d = Math.max(
                            1,
                            Math.min(m.d, activeTile.points.length / 2 - 0.01),
                          );
                        if (
                          ['star', 'rosette', 'extended', 'hourglass'].includes(
                            kind,
                          )
                        )
                          m.s = Math.max(
                            1,
                            Math.min(
                              m.s,
                              Math.floor((activeTile.points.length - 1) / 2),
                            ),
                          );
                      })
                    }
                  />
                  {(motif.kind === 'star' || motif.kind === 'hourglass') && (
                    <Range
                      label={trText('Star sharpness')}
                      value={motif.d}
                      min={1}
                      max={Math.max(1.1, activeTile.points.length / 2 - 0.01)}
                      onChange={(d, p) =>
                        editMotif((m) => {
                          m.d = d;
                        }, p)
                      }
                    />
                  )}{' '}
                  {(motif.kind === 'rosette' || motif.kind === 'extended') && (
                    <Range
                      label={trText('Petal flatness')}
                      value={motif.q}
                      min={-0.99}
                      max={0.99}
                      onChange={(q, p) =>
                        editMotif((m) => {
                          m.q = q;
                        }, p)
                      }
                    />
                  )}{' '}
                  {[
                    'star',
                    'rosette',
                    'extended',
                    'hourglass',
                    'intersect',
                  ].includes(motif.kind) && (
                    <Range
                      label={trText('Intersections')}
                      value={motif.s}
                      min={1}
                      max={Math.max(
                        1,
                        Math.floor((activeTile.points.length - 1) / 2),
                      )}
                      step={1}
                      onChange={(s, p) =>
                        editMotif((m) => {
                          m.s = s;
                        }, p)
                      }
                    />
                  )}{' '}
                  {motif.kind === 'hankin' && (
                    <Range
                      label={trText('Ray angle')}
                      value={motif.angle}
                      min={5}
                      max={85}
                      unit="°"
                      onChange={(angle, p) =>
                        editMotif((m) => {
                          m.angle = angle;
                        }, p)
                      }
                    />
                  )}{' '}
                  {['girih', 'intersect'].includes(motif.kind) && (
                    <>
                      <Range
                        label={trText('Star sides')}
                        value={motif.n}
                        min={3}
                        max={24}
                        step={1}
                        onChange={(v, t) =>
                          editMotif((m) => {
                            m.n = v;
                          }, t)
                        }
                      />
                      <Range
                        label={trText('Side hops')}
                        value={motif.d}
                        min={0.1}
                        max={12}
                        step={0.05}
                        onChange={(v, t) =>
                          editMotif((m) => {
                            m.d = v;
                          }, t)
                        }
                      />
                      {motif.kind === 'intersect' && (
                        <Check
                          label={trText('Progressive intersections')}
                          checked={motif.progressive}
                          onChange={(v) =>
                            editMotif((m) => {
                              m.progressive = v;
                            })
                          }
                        />
                      )}
                    </>
                  )}
                  {!activeTile.regular && motif.kind === 'rosette' && (
                    <Range
                      label={trText('Flex point')}
                      value={motif.r}
                      min={0}
                      max={1}
                      onChange={(v, t) =>
                        editMotif((m) => {
                          m.r = v;
                        }, t)
                      }
                    />
                  )}
                  <Button
                    variant="outline"
                    disabled={active.locked}
                    className="full-button"
                    onClick={() => {
                      try {
                        const maps = new Map(
                          active.tiling.tiles.map((t) => [
                            t.id,
                            makeMotif(t, active.motifs[t.id]),
                          ]),
                        );
                        const lines = inferNeighbors(activeTile, active, maps);
                        if (lines.length > 200)
                          throw Error(
                            'The inferred drawing exceeds 200 segments. Simplify neighboring motifs.',
                          );
                        editMotif((m) =>
                          Object.assign(m, {
                            kind: 'custom',
                            lines,
                            symmetry: 1,
                            reflect: false,
                          }),
                        );
                        setMessage('Inferred this motif from its neighbors.');
                      } catch (e) {
                        setMessage(String(e));
                      }
                    }}
                  >
                    {trText('Infer from neighboring motifs')}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={active.locked}
                    className="full-button"
                    onClick={() => setModal('motif')}
                  >
                    <Compass size={16} />
                    {trText('Draw a motif')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="full-button"
                    disabled={
                      !['star', 'rosette', 'extended', 'hankin'].includes(
                        motif.kind,
                      ) || active.locked
                    }
                    onClick={() => setModal('explore')}
                  >
                    <Grid2X2 size={16} />
                    {trText('Explore variations')}
                  </Button>
                </div>
                {active.tiling.repetition.kind === 'inflation' && (
                  <div className="inspector-section">
                    <h3>{trText('CONCENTRIC REPETITION')}</h3>
                    <Range
                      label={trText('Rings')}
                      value={active.tiling.repetition.rings}
                      min={1}
                      max={9}
                      step={1}
                      onChange={(rings, p) =>
                        editLayers((l) => {
                          if (l.tiling.repetition.kind === 'inflation')
                            l.tiling.repetition.rings = rings;
                        }, p)
                      }
                    />
                    <p className="panel-hint">
                      {trText(
                        'Each ring rotates and scales the seed patch. This is ring inflation, not tile subdivision.',
                      )}
                    </p>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="style">
                <div className="inspector-section">
                  <Choice
                    label={trText('Rendering')}
                    value={active.style.kind}
                    options={styles}
                    onChange={(kind) => changeStyle({ kind })}
                  />
                  {active.style.kind === 'filled' ? (
                    <>
                      <Check
                        label={trText('Fill inside regions')}
                        checked={active.style.fillInside}
                        onChange={(fillInside) => changeStyle({ fillInside })}
                      />
                      <Check
                        label={trText('Fill outside regions')}
                        checked={active.style.fillOutside}
                        onChange={(fillOutside) => changeStyle({ fillOutside })}
                      />
                    </>
                  ) : (
                    !['plain', 'sketch'].includes(active.style.kind) && (
                      <Check
                        label={trText('Draw outlines')}
                        checked={active.style.drawOutline}
                        onChange={(drawOutline) => changeStyle({ drawOutline })}
                      />
                    )
                  )}
                  <div className="color-row">
                    <label>
                      {trText('Pattern')}
                      <input
                        aria-label={trText('Pattern color')}
                        type="color"
                        value={active.style.color}
                        onChange={(e) => changeStyle({ color: e.target.value })}
                      />
                    </label>
                    <label>
                      {trText('Outline')}
                      <input
                        aria-label={trText('Outline color')}
                        type="color"
                        value={active.style.outline}
                        onChange={(e) =>
                          changeStyle({ outline: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      {trText('Paper')}
                      <input
                        aria-label={trText('Paper color')}
                        type="color"
                        value={project.paper}
                        onChange={(e) =>
                          edit((p) => {
                            p.paper = e.target.value;
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="palettes">
                    {palettes.map(([color, outline, paper]) => (
                      <button
                        key={color}
                        aria-label={`Use ${color} palette`}
                        onClick={() => {
                          edit((p) => {
                            p.layers
                              .filter(
                                (l) =>
                                  !l.locked &&
                                  (selected.length
                                    ? selected.includes(l.id)
                                    : l.id === active.id),
                              )
                              .forEach((l) =>
                                Object.assign(l.style, { color, outline }),
                              );
                            p.paper = paper;
                          });
                        }}
                      >
                        {[color, outline, paper].map((c) => (
                          <span key={c} style={{ background: c }} />
                        ))}
                      </button>
                    ))}
                  </div>
                  <Range
                    label={trText('Band width')}
                    value={active.style.width}
                    min={0}
                    max={2}
                    step={0.005}
                    onChange={(width, p) => changeStyle({ width }, p)}
                  />
                  <Range
                    label={trText('Outline width')}
                    value={active.style.outlineWidth}
                    min={0}
                    max={1}
                    step={0.002}
                    onChange={(outlineWidth, p) =>
                      changeStyle({ outlineWidth }, p)
                    }
                  />
                  {active.style.kind === 'interlace' && (
                    <Range
                      label={trText('Weave clearance')}
                      value={active.style.gap}
                      min={0}
                      max={1}
                      onChange={(gap, p) => changeStyle({ gap }, p)}
                    />
                  )}
                  {active.style.kind === 'interlace' && (
                    <Range
                      label={trText('Shadow width')}
                      value={active.style.shadowWidth}
                      min={0}
                      max={0.7}
                      step={0.01}
                      onChange={(shadowWidth, p) =>
                        changeStyle({ shadowWidth }, p)
                      }
                    />
                  )}
                  {['plain', 'thick', 'sketch'].includes(active.style.kind) && (
                    <Choice
                      label={trText('Corners')}
                      value={active.style.join}
                      options={[
                        { value: 'round', label: 'Rounded' },
                        { value: 'miter', label: 'Mitered' },
                        { value: 'bevel', label: 'Beveled' },
                      ]}
                      onChange={(join) => changeStyle({ join })}
                    />
                  )}
                  <Range
                    label={trText('Opacity')}
                    value={active.style.opacity}
                    min={0}
                    max={1}
                    onChange={(opacity, p) => changeStyle({ opacity }, p)}
                  />
                  {active.style.kind === 'emboss' && (
                    <Range
                      label={trText('Light direction')}
                      value={active.style.light}
                      min={0}
                      max={360}
                      step={1}
                      unit="°"
                      onChange={(light, p) => changeStyle({ light }, p)}
                    />
                  )}
                  <Button
                    variant="ghost"
                    onClick={() =>
                      editLayers((l) => {
                        l.regionColors = {};
                      })
                    }
                  >
                    {trText('Clear painted regions')}
                  </Button>
                </div>
              </TabsContent>
              <TabsContent value="transform">
                <div className="inspector-section">
                  <Check
                    label={trText('Include in group moves')}
                    checked={active.moving}
                    onChange={(moving) =>
                      editLayers((l) => {
                        l.moving = moving;
                      })
                    }
                  />
                  {(['x', 'y', 'rotation', 'scale'] as const).map((k) => (
                    <Range
                      key={k}
                      label={
                        {
                          x: 'Horizontal position',
                          y: 'Vertical position',
                          rotation: 'Rotation',
                          scale: 'Scale',
                        }[k]
                      }
                      value={active.transform[k]}
                      min={k === 'scale' ? 0.1 : k === 'rotation' ? -180 : -10}
                      max={k === 'scale' ? 5 : k === 'rotation' ? 180 : 10}
                      step={k === 'rotation' ? 1 : 0.05}
                      onChange={(value, p) =>
                        editLayers((l) => {
                          l.transform[k] = value;
                        }, p)
                      }
                    />
                  ))}
                  <Button
                    variant="outline"
                    className="full-button"
                    disabled={selected.length < 2}
                    onClick={() =>
                      editLayers((l) => {
                        l.transform = { ...active.transform };
                      })
                    }
                  >
                    {trText('Copy position to selection')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="full-button"
                    onClick={() =>
                      editLayers((l) => {
                        l.transform = { x: 0, y: 0, rotation: 0, scale: 1 };
                      })
                    }
                  >
                    {trText('Reset transform')}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="empty-inspector">
              {trText('Add a layer to start constructing a pattern.')}
            </div>
          )}
          {project.reference && (
            <div className="inspector-section">
              <h3>{trText('REFERENCE IMAGE')}</h3>
              <Range
                label={trText('Reference opacity')}
                value={project.reference.opacity}
                min={0}
                max={1}
                onChange={(v, t) =>
                  edit((p) => {
                    if (p.reference) p.reference.opacity = v;
                  }, t)
                }
              />
              <Range
                label={trText('Reference width')}
                value={project.reference.width}
                min={0.5}
                max={30}
                onChange={(v, t) =>
                  edit((p) => {
                    if (p.reference) p.reference.width = v;
                  }, t)
                }
              />
              {(['x', 'y', 'rotation'] as const).map((k) => (
                <Range
                  key={k}
                  label={`Reference ${k}`}
                  value={project.reference![k]}
                  min={k === 'rotation' ? -180 : -40}
                  max={k === 'rotation' ? 180 : 40}
                  step={k === 'rotation' ? 1 : 0.05}
                  onChange={(v, t) =>
                    edit((p) => {
                      if (p.reference) p.reference[k] = v;
                    }, t)
                  }
                />
              ))}
              <Button
                variant="ghost"
                onClick={() =>
                  edit((p) => {
                    delete p.reference;
                  })
                }
              >
                {trText('Remove reference')}
              </Button>
            </div>
          )}
        </aside>
        {message && (
          <output className="wb-toast">
            {message}
            <button
              aria-label={trText('Dismiss message')}
              onClick={() => setMessage('')}
            >
              <X size={16} />
            </button>
          </output>
        )}
        <input
          hidden
          type="file"
          accept=".json"
          ref={fileInput}
          onChange={(e) => void openFile(e.target.files?.[0])}
        />
        <input
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp"
          ref={imageInput}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 4 * 1024 * 1024) {
              setMessage('Use a reference image under 4 MB.');
              return;
            }
            try {
              if (
                !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
              )
                throw Error('Choose a PNG, JPEG, or WebP image.');
              const data = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () =>
                  typeof reader.result === 'string'
                    ? resolve(reader.result)
                    : reject(Error('Reference image could not be read.'));
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(file);
              });
              const img = new Image();
              img.src = data;
              await img.decode();
              edit((p) => {
                p.reference = {
                  data,
                  opacity: 0.35,
                  x: p.view.x - 4,
                  y: p.view.y - 3,
                  width: 8,
                  aspect: img.naturalWidth / img.naturalHeight,
                  rotation: 0,
                };
              });
            } catch (error) {
              setMessage(String(error));
            }
            e.target.value = '';
          }}
        />
        <Dialog
          open={modal === 'examples'}
          onOpenChange={(v) => !v && setModal(null)}
        >
          <DialogContent className="library-dialog">
            <DialogHeader>
              <DialogTitle>{trText('Example designs')}</DialogTitle>
              <DialogDescription>
                {trText(
                  'All 73 original designs, preserved as native editable layers. Undo restores the previous project.',
                )}
              </DialogDescription>
            </DialogHeader>
            <input
              aria-label={trText('Search examples')}
              placeholder={trText('Search examples…')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="tiling-grid">
              {examples
                .filter((e) =>
                  `${e.name} ${e.tilings.join(' ')}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((e) => (
                  <button key={e.id} onClick={() => void openExample(e.id)}>
                    <NextImage
                      unoptimized
                      src={`/native-examples/${e.id}.png`}
                      alt=""
                      loading="lazy"
                      width={300}
                      height={200}
                    />
                    <strong>{e.name}</strong>
                    <small>
                      {e.layers} {trText('layer')}
                      {e.layers === 1 ? '' : 's'}
                    </small>
                  </button>
                ))}
            </div>
          </DialogContent>
        </Dialog>
        <Dialog
          open={modal === 'library'}
          onOpenChange={(v) => !v && setModal(null)}
        >
          <DialogContent className="library-dialog">
            <DialogHeader>
              <DialogTitle>{trText('Choose a tiling')}</DialogTitle>
              <DialogDescription>
                {allTilings.length}{' '}
                {trText(
                  'geometric foundations. Select one to add an editable layer.',
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="library-search">
              <Search size={18} />
              <input
                aria-label={trText('Search tilings')}
                placeholder={trText('Search by name, description, or author…')}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLibraryCount(24);
                }}
              />
            </div>
            <div className="tiling-grid">
              {allTilings
                .filter((t) =>
                  `${t.name} ${t.description} ${t.author} ${t.repetition.kind}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .slice(0, libraryCount)
                .map((t) => (
                  <button key={t.id} onClick={() => addTiling(t.id)}>
                    <Preview tiling={t} />
                    <strong>{t.name}</strong>
                    <small>
                      {t.repetition.kind === 'inflation'
                        ? trText('Concentric inflation')
                        : `${t.tiles.length} tile shape${t.tiles.length === 1 ? '' : 's'}`}
                    </small>
                  </button>
                ))}
            </div>
            <Button
              variant="outline"
              onClick={() => setLibraryCount((n) => n + 24)}
            >
              {trText('Show more tilings')}
            </Button>
          </DialogContent>
        </Dialog>
        <Dialog
          open={modal === 'project'}
          onOpenChange={(v) => !v && setModal(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{trText('Project settings')}</DialogTitle>
              <DialogDescription>
                {trText(
                  'Your project includes its tilings, motifs, colors, and view.',
                )}
              </DialogDescription>
            </DialogHeader>
            <label className="text-field">
              {trText('Project name')}
              <input
                value={project.name}
                maxLength={200}
                onChange={(e) =>
                  edit((p) => {
                    p.name = e.target.value;
                  })
                }
              />
            </label>
            <Range
              label={trText('Output width')}
              value={project.width}
              min={project.units === 'mm' ? 1 : 0.04}
              max={project.units === 'mm' ? 1000 : 40}
              step={project.units === 'mm' ? 1 : 0.01}
              unit={project.units}
              onChange={(v, t) =>
                edit((p) => {
                  p.width = v;
                }, t)
              }
            />
            <Range
              label={trText('Output height')}
              value={project.height}
              min={project.units === 'mm' ? 1 : 0.04}
              max={project.units === 'mm' ? 1000 : 40}
              step={project.units === 'mm' ? 1 : 0.01}
              unit={project.units}
              onChange={(v, t) =>
                edit((p) => {
                  p.height = v;
                }, t)
              }
            />
            <Choice
              label={trText('Units')}
              value={project.units}
              options={[
                { value: 'mm', label: 'Millimeters' },
                { value: 'in', label: 'Inches' },
              ]}
              onChange={(units) =>
                edit((p) => {
                  if (units === p.units) return;
                  const factor = units === 'in' ? 1 / 25.4 : 25.4;
                  p.width *= factor;
                  p.height *= factor;
                  p.units = units;
                })
              }
            />
            <Button onClick={saveProject}>{trText('Download project')}</Button>
            <Button
              variant="outline"
              onClick={() => {
                setModal(null);
                fileInput.current?.click();
              }}
            >
              {trText('Open project')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setHistory((h) => commit(h, newProject()));
                setSelected([]);
                setModal(null);
              }}
            >
              {trText('Start a new project')}
            </Button>
            <p className="panel-hint">
              {trText(
                'New and Open are undoable. Autosave stays on this device; download a project for backup or sharing.',
              )}
            </p>
          </DialogContent>
        </Dialog>
        <Dialog
          open={modal === 'export'}
          onOpenChange={(v) => !v && setModal(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{trText('Export your pattern')}</DialogTitle>
              <DialogDescription>
                {project.width} × {project.height} {project.units}
                {trText(
                  '. Reference images and construction guides are omitted.',
                )}
              </DialogDescription>
            </DialogHeader>
            <Choice
              label={trText('Format')}
              value={exportType}
              options={[
                { value: 'svg', label: 'SVG · styled vector artwork' },
                { value: 'eps', label: 'EPS · vector artwork' },
                { value: 'jpeg', label: 'JPEG · high-quality image' },
                { value: 'gif', label: 'GIF · 256-color image' },
                { value: 'bmp', label: 'BMP · uncompressed image' },
                { value: 'wbmp', label: 'WBMP · monochrome image' },
                { value: 'png', label: 'PNG · 2400 px on the longer side' },
                { value: 'dxf-lines', label: 'DXF · centerline geometry' },
                { value: 'dxf-faces', label: 'DXF · closed region outlines' },
                { value: 'dxf-solid', label: 'DXF · triangulated solid faces' },
                {
                  value: 'project',
                  label: 'Taprats Studio · editable project',
                },
              ]}
              onChange={setExportType}
            />
            <p className="panel-hint">
              {trText(
                'DXF exports geometric paths in physical units. SVG preserves colors, outlines, and weaving. EPS flattens transparency against the paper color. Files use the current center and visible width, cropped to the output aspect ratio.',
              )}
            </p>
            <Button onClick={() => void doExport()} disabled={exporting}>
              {exporting
                ? trText('Preparing export…')
                : trText(`Download ${exportType.toUpperCase()}`)}
            </Button>
          </DialogContent>
        </Dialog>
        <Dialog
          open={modal === 'help'}
          onOpenChange={(v) => !v && setModal(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{trText('From tiles to a pattern')}</DialogTitle>
              <DialogDescription>
                {trText('A geometric construction you can inspect and change.')}
              </DialogDescription>
            </DialogHeader>
            <ol className="help-steps">
              <li>
                <strong>{trText('Choose a tiling.')}</strong>
                {trText(
                  'Polygons repeat along two vectors, or form concentric inflated rings.',
                )}
              </li>
              <li>
                <strong>{trText('Decorate each shape.')}</strong>
                {trText(
                  'Stars and rosettes use radial constructions. Hankin and Girih motifs pair rays from tile-edge midpoints.',
                )}
              </li>
              <li>
                <strong>{trText('Join the linework.')}</strong>
                {trText(
                  'Intersections split into a planar graph. Enclosed faces become paintable regions.',
                )}
              </li>
              <li>
                <strong>{trText('Weave and render.')}</strong>
                {trText(
                  'Over/under constraints alternate along strands; diagnostics reveal places where this is impossible.',
                )}
              </li>
            </ol>
            <p className="panel-hint">
              {trText(
                'Built on Craig S. Kaplan’s Taprats and Pierre Baillargeon’s',
              )}{' '}
              <a
                href="https://github.com/pierrebai/Alhambra"
                target="_blank"
                rel="noreferrer"
              >
                {trText('Alhambra')}
              </a>
              .{' '}
              <a
                href="/licenses/Alhambra-GPL-2.0.txt"
                target="_blank"
                rel="noreferrer"
              >
                {trText('GPL license')}
              </a>
              .{' '}
              <Link href="/classic">
                {trText('Open the classic application')}
              </Link>
              .
            </p>
            <p className="panel-hint">
              {trText(
                'H: pan · V: select · B: paint · Space-drag: pan · ⌘/Ctrl-Z: undo · ⌘/Ctrl-S: download project. Shift-click layers to select several.',
              )}
            </p>
          </DialogContent>
        </Dialog>
        {modal === 'fabrication' && (
          <FabricationDialog
            project={project}
            region={exportRegion}
            onClose={() => setModal(null)}
          />
        )}
        {modal === 'motif' && activeTile && motif && !active?.locked && (
          <MotifEditor
            tile={activeTile}
            motif={motif}
            onClose={() => setModal(null)}
            onApply={(m) => editMotif((target) => Object.assign(target, m))}
          />
        )}
        {modal === 'explore' && activeTile && motif && !active?.locked && (
          <VariationEditor
            tile={activeTile}
            motif={motif}
            onClose={() => setModal(null)}
            onApply={(m) => editMotif((target) => Object.assign(target, m))}
          />
        )}
        {modal === 'tiling' &&
          (newTilingLayer || (active && !active.locked)) && (
            <TilingEditor
              layer={newTilingLayer || active!}
              onClose={() => {
                setModal(null);
                setNewTilingLayer(null);
              }}
              onApply={(tiling) =>
                edit((p) => {
                  const l = newTilingLayer
                    ? newLayer(tiling)
                    : p.layers.find((l) => l.id === active!.id)!;
                  if (newTilingLayer) p.layers.push(l);
                  delete l.frozen;
                  delete l.frozenFaceClasses;
                  l.tiling = tiling;
                  l.motifs = Object.fromEntries(
                    tiling.tiles.map((t) => [
                      t.id,
                      l.motifs[t.id] ||
                        defaultMotif(t.regular && t.points.length > 4),
                    ]),
                  );
                  l.regionColors = {};
                })
              }
            />
          )}
      </main>
    </TooltipProvider>
  );
}
