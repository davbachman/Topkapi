export type Point = { x: number; y: number };
/** Row-major affine matrix: x'=a*x+b*y+c, y'=d*x+e*y+f. */
export type Matrix = [number, number, number, number, number, number];
export type Segment = { a: Point; b: Point };
export type Tile = {
  id: string;
  points: Point[];
  placements: Matrix[];
  regular: boolean;
  excluded?: number[];
  /** One fraction along each directed edge; omission means edge midpoints. */
  contacts?: number[];
};
export type Repetition =
  | { kind: 'translation'; u: Point; v: Point }
  | {
      kind: 'inflation';
      center: Point;
      sectors: number;
      transform: Matrix;
      rings: number;
    };
export type Tiling = {
  id: string;
  name: string;
  description: string;
  author: string;
  tiles: Tile[];
  repetition: Repetition;
  collection?: 'rosette';
  /** Recommended layer-wide Hankin settings for this tiling. */
  recommended?: TwoPoint;
  /** Source of a precomputed rosette transform and its initial catalog view. */
  rosette?: {
    sourceId: string;
    sourceName: string;
    orders: number[];
    preview: { center: Point; radius: number };
  };
};
export type MotifKind =
  | 'star'
  | 'rosette'
  | 'extended'
  | 'hourglass'
  | 'girih'
  | 'intersect'
  | 'hankin'
  | 'custom';
export type Motif = {
  kind: MotifKind;
  d: number;
  q: number;
  s: number;
  n: number;
  r: number;
  progressive: boolean;
  angle: number;
  lines: Segment[];
  symmetry: number;
  reflect: boolean;
};
export type StyleKind =
  | 'plain'
  | 'thick'
  | 'outline'
  | 'interlace'
  | 'emboss'
  | 'filled'
  | 'sketch';
export type Style = {
  kind: StyleKind;
  color: string;
  outline: string;
  background: string;
  width: number;
  outlineWidth: number;
  gap: number;
  opacity: number;
  join: 'round' | 'miter' | 'bevel';
  light: number;
  drawOutline: boolean;
  fillInside: boolean;
  fillOutside: boolean;
  shadowWidth: number;
};
export type Layer = {
  id: string;
  name: string;
  tiling: Tiling;
  motifs: Record<string, Motif>;
  style: Style;
  visible: boolean;
  locked: boolean;
  moving: boolean;
  transform: { x: number; y: number; rotation: number; scale: number };
  regionColors: Record<string, string>;
  /** Layer-wide Hankin construction; separation is a fraction of the available
   * symmetric split at all placed contacts (shortest edge for midpoint contacts).
   * Stored motifs remain available when this mode is disabled. */
  twoPoint?: TwoPoint;
  /** Finite construction, in layer coordinates. Omit to repeat procedurally. */
  frozen?: Segment[];
  /** Original finite designs retain the saved inside/outside face selection. */
  frozenFaceClasses?: Record<string, boolean>;
};
export type TwoPoint = { angle: number; separation: number };
export type View = { x: number; y: number; scale: number };
export type Project = {
  format: 'topkapi';
  version: 1;
  name: string;
  layers: Layer[];
  view: View;
  paper: string;
  width: number;
  height: number;
  units: 'mm' | 'in';
  reference?: {
    data: string;
    opacity: number;
    x: number;
    y: number;
    width: number;
    aspect: number;
    rotation: number;
  };
};
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
export type GraphNode = { point: Point; edges: number[] };
export type GraphEdge = { a: number; b: number };
export type Crossing = {
  point: Point;
  over: Point;
  under: Point;
  conflict: boolean;
};
export type Face = {
  id: string;
  /** Shared by matching copies; id stays unique for topology and hit testing. */
  paintId?: string;
  points: Point[];
  area: number;
};
export type Geometry = {
  segments: Segment[];
  tiles: { points: Point[]; tileId: string }[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  faces: Face[];
  crossings: Crossing[];
  warnings: { point: Point; kind: 'endpoint' | 'junction' | 'weave' }[];
  truncated: boolean;
};
