// The board is a map of shapes keyed by id. Shapes are immutable: every edit
// produces new objects, which keeps undo/redo cheap and makes the model easy
// to move into a CRDT (Yjs) later.

export type Vec = { x: number; y: number };
export type Box = { minX: number; minY: number; maxX: number; maxY: number };
/** Camera position is the world coordinate at the top-left of the screen. */
export type Camera = { x: number; y: number; z: number };

interface BaseShape {
  id: string;
  /** z-order; higher draws on top */
  index: number;
  color: string;
  strokeWidth: number;
}

/** [x, y, pressure] in world coordinates */
export type StrokePoint = [number, number, number];

export interface StrokeShape extends BaseShape {
  type: 'stroke';
  points: StrokePoint[];
  simulatePressure: boolean;
}

export interface BoxShape extends BaseShape {
  type: 'rect' | 'ellipse';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LineShape extends BaseShape {
  type: 'line' | 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TextShape extends BaseShape {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export type Shape = StrokeShape | BoxShape | LineShape | TextShape;
export type Doc = Readonly<Record<string, Shape>>;

export type Tool = 'select' | 'hand' | 'pen' | 'eraser' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'text';

export const TOOL_SHORTCUTS: Record<Tool, string> = {
  select: 'V',
  hand: 'H',
  pen: 'P',
  eraser: 'E',
  rect: 'R',
  ellipse: 'O',
  line: 'L',
  arrow: 'A',
  text: 'T',
};

export type SizeKey = 's' | 'm' | 'l';

export const SIZES: Record<SizeKey, { stroke: number; font: number }> = {
  s: { stroke: 2, font: 20 },
  m: { stroke: 4, font: 28 },
  l: { stroke: 8, font: 44 },
};

export const COLORS = ['#1e1e1e', '#e03131', '#f08c00', '#2f9e44', '#1971c2', '#6741d9', '#c2255c', '#868e96'];

export function createId(): string {
  // randomUUID is only available in secure contexts (https / localhost)
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function nextIndex(doc: Doc): number {
  let max = 0;
  for (const id in doc) max = Math.max(max, doc[id].index);
  return max + 1;
}

const sortedCache = new WeakMap<Doc, Shape[]>();

/** Shapes in draw order (bottom to top). Cached per document version. */
export function sortedShapes(doc: Doc): Shape[] {
  let sorted = sortedCache.get(doc);
  if (!sorted) {
    sorted = Object.values(doc).sort((a, b) => a.index - b.index);
    sortedCache.set(doc, sorted);
  }
  return sorted;
}

export function putShapes(doc: Doc, shapes: Shape[]): Doc {
  const next = { ...doc };
  for (const s of shapes) next[s.id] = s;
  return next;
}

export function removeShapes(doc: Doc, ids: Iterable<string>): Doc {
  const next = { ...doc };
  for (const id of ids) delete next[id];
  return next;
}
