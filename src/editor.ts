import { Store } from './store';
import {
  COLORS,
  SIZES,
  TOOL_SHORTCUTS,
  createId,
  nextIndex,
  putShapes,
  removeShapes,
  sortedShapes,
  type Box,
  type Camera,
  type Doc,
  type Shape,
  type SizeKey,
  type TextShape,
  type Tool,
  type Vec,
} from './model';
import {
  LINE_HEIGHT,
  boxContains,
  boxFromPoints,
  boxesOverlap,
  expandBox,
  hitTest,
  scaleShape,
  shapeAt,
  shapeBounds,
  translateShape,
  unionBounds,
} from './geometry';
import { drawShape } from './render';

const STORAGE_KEY = 'sketchroom:doc:v1';
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
// Interaction distances are in screen pixels so they feel the same at any zoom
const HIT_TOLERANCE = 6;
const ERASER_RADIUS = 8;
const HANDLE_RADIUS = 8;
const SELECTION_PAD = 4;
const DOUBLE_CLICK_MS = 400;

const BACKGROUND = '#f8f9fb';
const GRID_DOT = '#d3d7de';
const ACCENT = '#4f6bed';

const ERASER_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8" fill="white" fill-opacity="0.6" stroke="black" stroke-width="1.5"/></svg>',
)}") 10 10, auto`;

const TOOL_CURSORS: Record<Tool, string> = {
  select: 'default',
  hand: 'grab',
  pen: 'crosshair',
  eraser: ERASER_CURSOR,
  rect: 'crosshair',
  ellipse: 'crosshair',
  line: 'crosshair',
  arrow: 'crosshair',
  text: 'text',
};

const KEY_TO_TOOL = Object.fromEntries(
  Object.entries(TOOL_SHORTCUTS).map(([tool, key]) => [key.toLowerCase(), tool]),
) as Record<string, Tool>;

type Handle = 'nw' | 'ne' | 'sw' | 'se';

type Interaction =
  | { type: 'idle' }
  | { type: 'pan'; startX: number; startY: number; startCam: Camera }
  | { type: 'draw'; id: string; origin: Vec }
  | { type: 'erase'; last: Vec }
  | { type: 'move'; start: Vec; originals: Shape[] }
  | { type: 'resize'; handle: Handle; start: Vec; box: Box; originals: Shape[] }
  | { type: 'marquee'; start: Vec; current: Vec; base: Set<string> };

export interface TextEdit {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
}

/** Everything the React UI needs to render. Replaced (never mutated) when it changes. */
export interface UiState {
  tool: Tool;
  color: string;
  size: SizeKey;
  hasSelection: boolean;
  isEmpty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  camera: Camera;
  editing: TextEdit | null;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const pressureOf = (e: PointerEvent) => (e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5);

function loadDoc(): Doc {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * The whiteboard engine. Owns the document store, camera, tools and selection,
 * handles input on the canvas, and renders it. React only draws the chrome
 * around it via getUi()/subscribeUi().
 */
export class Editor {
  readonly store = new Store(loadDoc());
  camera: Camera = { x: 0, y: 0, z: 1 };
  tool: Tool = 'pen';
  color = COLORS[0];
  size: SizeKey = 'm';
  selection = new Set<string>();
  editing: TextEdit | null = null;

  private interaction: Interaction = { type: 'idle' };
  private erasing = new Set<string>();
  private spaceDown = false;
  private clipboard: Shape[] = [];
  private pasteCount = 0;
  private lastDown = { time: 0, x: 0, y: 0 };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private dpr = 1;
  private width = 0;
  private height = 0;
  private frame = 0;
  private saveTimer = 0;

  private ui: UiState;
  private uiListeners = new Set<() => void>();

  constructor() {
    this.ui = this.computeUi();
    this.store.subscribe(() => {
      for (const id of this.selection) if (!this.store.get()[id]) this.selection.delete(id);
      this.scheduleSave();
      this.requestRender();
      this.emitUi();
    });
  }

  // ---- Lifecycle ----

  mount(canvas: HTMLCanvasElement): () => void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    const observer = new ResizeObserver(() => this.resize());
    observer.observe(canvas);
    this.resize();
    this.updateCursor();

    const preventMenu = (e: Event) => e.preventDefault();
    const onBlur = () => {
      this.spaceDown = false;
      this.updateCursor();
    };
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', preventMenu);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pagehide', this.saveNow);

    return () => {
      observer.disconnect();
      canvas.removeEventListener('pointerdown', this.onPointerDown);
      canvas.removeEventListener('pointermove', this.onPointerMove);
      canvas.removeEventListener('pointerup', this.onPointerUp);
      canvas.removeEventListener('pointercancel', this.onPointerUp);
      canvas.removeEventListener('wheel', this.onWheel);
      canvas.removeEventListener('contextmenu', preventMenu);
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pagehide', this.saveNow);
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.canvas = null;
      this.ctx = null;
    };
  }

  private resize() {
    const canvas = this.canvas;
    if (!canvas) return;
    this.dpr = window.devicePixelRatio || 1;
    this.width = canvas.clientWidth;
    this.height = canvas.clientHeight;
    canvas.width = Math.round(this.width * this.dpr);
    canvas.height = Math.round(this.height * this.dpr);
    this.render();
  }

  // ---- UI state for React ----

  subscribeUi = (fn: () => void) => {
    this.uiListeners.add(fn);
    return () => {
      this.uiListeners.delete(fn);
    };
  };

  getUi = () => this.ui;

  private computeUi(): UiState {
    let isEmpty = true;
    for (const _ in this.store.get()) {
      isEmpty = false;
      break;
    }
    return {
      tool: this.tool,
      color: this.color,
      size: this.size,
      hasSelection: this.selection.size > 0,
      isEmpty,
      canUndo: this.store.canUndo,
      canRedo: this.store.canRedo,
      camera: this.camera,
      editing: this.editing,
    };
  }

  private emitUi() {
    const next = this.computeUi();
    const prev = this.ui;
    if ((Object.keys(next) as (keyof UiState)[]).every((k) => next[k] === prev[k])) return;
    this.ui = next;
    for (const fn of this.uiListeners) fn();
  }

  // ---- Persistence (local only for now; replaced by the sync server later) ----

  private scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(this.saveNow, 300);
  }

  private saveNow = () => {
    clearTimeout(this.saveTimer);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.store.get()));
    } catch {
      // Storage full or unavailable; the board still works in memory
    }
  };

  // ---- Coordinates & camera ----

  private screenPoint(e: { clientX: number; clientY: number }): Vec {
    const r = this.canvas!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  screenToWorld(p: Vec): Vec {
    const { x, y, z } = this.camera;
    return { x: p.x / z + x, y: p.y / z + y };
  }

  worldToScreen(p: Vec): Vec {
    const { x, y, z } = this.camera;
    return { x: (p.x - x) * z, y: (p.y - y) * z };
  }

  private setCamera(camera: Camera) {
    this.camera = camera;
    this.requestRender();
    this.emitUi();
  }

  private zoomAt(sp: Vec, zoom: number) {
    const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const w = this.screenToWorld(sp);
    this.setCamera({ x: w.x - sp.x / z, y: w.y - sp.y / z, z });
  }

  zoomBy(factor: number) {
    this.zoomAt({ x: this.width / 2, y: this.height / 2 }, this.camera.z * factor);
  }

  resetZoom() {
    this.zoomAt({ x: this.width / 2, y: this.height / 2 }, 1);
  }

  zoomToFit() {
    const b = unionBounds(Object.values(this.store.get()).map(shapeBounds));
    if (!b) return this.resetZoom();
    const pad = 64;
    const z = clamp(
      Math.min((this.width - pad * 2) / Math.max(b.maxX - b.minX, 1), (this.height - pad * 2) / Math.max(b.maxY - b.minY, 1), 2),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    this.setCamera({ x: (b.minX + b.maxX) / 2 - this.width / (2 * z), y: (b.minY + b.maxY) / 2 - this.height / (2 * z), z });
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.height : 1;
    const dx = e.deltaX * unit;
    const dy = e.deltaY * unit;
    if (e.ctrlKey || e.metaKey) {
      // Pinch-zoom on trackpads arrives as ctrl+wheel
      this.zoomAt(this.screenPoint(e), this.camera.z * Math.exp(-clamp(dy, -50, 50) * 0.01));
    } else {
      const { x, y, z } = this.camera;
      this.setCamera({ x: x + dx / z, y: y + dy / z, z });
    }
  };

  // ---- Tools & style ----

  setTool(tool: Tool) {
    if (this.editing) this.commitText();
    this.tool = tool;
    if (tool !== 'select') this.selection = new Set();
    this.updateCursor();
    this.requestRender();
    this.emitUi();
  }

  setColor(color: string) {
    this.color = color;
    if (this.editing) this.editing = { ...this.editing, color };
    this.updateSelected((s) => ({ ...s, color }));
    this.emitUi();
  }

  setSize(size: SizeKey) {
    this.size = size;
    const { stroke, font } = SIZES[size];
    if (this.editing) this.editing = { ...this.editing, fontSize: font };
    this.updateSelected((s) => (s.type === 'text' ? { ...s, fontSize: font } : { ...s, strokeWidth: stroke }));
    this.emitUi();
  }

  private newShapeBase() {
    return {
      id: createId(),
      index: nextIndex(this.store.get()),
      color: this.color,
      strokeWidth: SIZES[this.size].stroke,
    };
  }

  // ---- Selection & commands ----

  private setSelection(ids: Set<string>) {
    this.selection = ids;
    this.requestRender();
    this.emitUi();
  }

  private selectedShapes(): Shape[] {
    return sortedShapes(this.store.get()).filter((s) => this.selection.has(s.id));
  }

  private updateSelected(fn: (s: Shape) => Shape) {
    const shapes = this.selectedShapes();
    if (shapes.length) this.store.apply((doc) => putShapes(doc, shapes.map(fn)));
  }

  selectAll() {
    this.setTool('select');
    this.setSelection(new Set(Object.keys(this.store.get())));
  }

  deleteSelection() {
    if (!this.selection.size) return;
    const ids = [...this.selection];
    this.store.apply((doc) => removeShapes(doc, ids));
  }

  copy() {
    if (!this.selection.size) return;
    this.clipboard = this.selectedShapes();
    this.pasteCount = 0;
  }

  paste() {
    if (!this.clipboard.length) return;
    this.pasteCount++;
    this.insertCopies(this.clipboard, 16 * this.pasteCount);
  }

  duplicate() {
    this.insertCopies(this.selectedShapes(), 16);
  }

  private insertCopies(shapes: Shape[], offset: number) {
    if (!shapes.length) return;
    let index = nextIndex(this.store.get());
    const copies = shapes.map((s) => ({ ...translateShape(s, offset / this.camera.z, offset / this.camera.z), id: createId(), index: index++ }));
    this.store.apply((doc) => putShapes(doc, copies));
    this.setTool('select');
    this.setSelection(new Set(copies.map((s) => s.id)));
  }

  reorder(direction: 'front' | 'back') {
    const selected = this.selectedShapes();
    if (!selected.length) return;
    this.store.apply((doc) => {
      const all = sortedShapes(doc);
      let index = direction === 'front' ? all[all.length - 1].index + 1 : all[0].index - selected.length;
      return putShapes(doc, selected.map((s) => ({ ...s, index: index++ })));
    });
  }

  private nudge(dx: number, dy: number) {
    const z = this.camera.z;
    this.updateSelected((s) => translateShape(s, dx / z, dy / z));
  }

  undo() {
    if (this.editing) this.commitText();
    if (this.interaction.type === 'idle') this.store.undo();
  }

  redo() {
    if (this.editing) this.commitText();
    if (this.interaction.type === 'idle') this.store.redo();
  }

  // ---- Text editing ----

  private startNewText(p: Vec) {
    const fontSize = SIZES[this.size].font;
    this.selection = new Set();
    // Place the click at the vertical middle of the first line
    this.editing = { id: createId(), x: p.x, y: p.y - (fontSize * LINE_HEIGHT) / 2, text: '', fontSize, color: this.color };
    this.requestRender();
    this.emitUi();
  }

  private editText(s: TextShape) {
    this.selection = new Set([s.id]);
    this.editing = { id: s.id, x: s.x, y: s.y, text: s.text, fontSize: s.fontSize, color: s.color };
    this.requestRender();
    this.emitUi();
  }

  setEditingText(text: string) {
    if (!this.editing) return;
    this.editing = { ...this.editing, text };
    this.emitUi();
  }

  commitText = () => {
    const ed = this.editing;
    if (!ed) return;
    this.editing = null;
    const text = ed.text.replace(/\s+$/, '');
    const existing = this.store.get()[ed.id];

    if (!text) {
      if (existing) this.store.apply((doc) => removeShapes(doc, [ed.id]));
    } else if (existing?.type === 'text') {
      if (existing.text !== text || existing.color !== ed.color || existing.fontSize !== ed.fontSize) {
        this.store.apply((doc) => putShapes(doc, [{ ...existing, text, color: ed.color, fontSize: ed.fontSize }]));
      }
    } else {
      const shape: TextShape = {
        id: ed.id,
        index: nextIndex(this.store.get()),
        type: 'text',
        x: ed.x,
        y: ed.y,
        text,
        fontSize: ed.fontSize,
        color: ed.color,
        strokeWidth: SIZES[this.size].stroke,
      };
      this.store.apply((doc) => putShapes(doc, [shape]));
    }

    if (this.tool === 'select' && this.store.get()[ed.id]) this.selection = new Set([ed.id]);
    this.requestRender();
    this.emitUi();
  };

  // ---- Pointer input ----

  private capture(e: PointerEvent) {
    try {
      this.canvas?.setPointerCapture(e.pointerId);
    } catch {
      // Pointer already released
    }
  }

  private onPointerDown = (e: PointerEvent) => {
    // Keeps focus where it is (e.g. in the text editor) and suppresses emulated mouse events
    e.preventDefault();
    if (this.editing) {
      this.commitText();
      return;
    }
    if (this.interaction.type !== 'idle') return;

    const sp = this.screenPoint(e);
    const p = this.screenToWorld(sp);

    if (e.button === 1 || (e.button === 0 && (this.spaceDown || this.tool === 'hand'))) {
      this.capture(e);
      this.interaction = { type: 'pan', startX: sp.x, startY: sp.y, startCam: this.camera };
      this.updateCursor();
      return;
    }
    if (e.button !== 0) return;

    const isDouble =
      e.timeStamp - this.lastDown.time < DOUBLE_CLICK_MS && Math.hypot(sp.x - this.lastDown.x, sp.y - this.lastDown.y) < 6;
    this.lastDown = isDouble ? { time: 0, x: 0, y: 0 } : { time: e.timeStamp, x: sp.x, y: sp.y };

    this.capture(e);
    const tool = this.tool;
    switch (tool) {
      case 'select':
        return this.selectDown(e, sp, p, isDouble);
      case 'pen':
        return this.beginDraw(
          { ...this.newShapeBase(), type: 'stroke', points: [[p.x, p.y, pressureOf(e)]], simulatePressure: e.pointerType !== 'pen' },
          p,
        );
      case 'rect':
      case 'ellipse':
        return this.beginDraw({ ...this.newShapeBase(), type: tool, x: p.x, y: p.y, w: 0, h: 0 }, p);
      case 'line':
      case 'arrow':
        return this.beginDraw({ ...this.newShapeBase(), type: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y }, p);
      case 'eraser':
        this.interaction = { type: 'erase', last: p };
        this.eraseAlong(p, p);
        return;
      case 'text':
        this.startNewText(p);
        return;
    }
  };

  private selectDown(e: PointerEvent, sp: Vec, p: Vec, isDouble: boolean) {
    const handle = this.handleAt(sp);
    const box = this.selectionBounds();
    if (handle && box) {
      this.store.begin();
      this.interaction = { type: 'resize', handle, start: p, box, originals: this.selectedShapes() };
      return;
    }

    const hit = shapeAt(sortedShapes(this.store.get()), p, HIT_TOLERANCE / this.camera.z);
    if (isDouble && hit?.type === 'text') return this.editText(hit);
    if (isDouble && !hit) return this.startNewText(p);

    if (hit) {
      if (e.shiftKey && this.selection.has(hit.id)) {
        const next = new Set(this.selection);
        next.delete(hit.id);
        return this.setSelection(next);
      }
      if (e.shiftKey) this.setSelection(new Set([...this.selection, hit.id]));
      else if (!this.selection.has(hit.id)) this.setSelection(new Set([hit.id]));
      this.store.begin();
      this.interaction = { type: 'move', start: p, originals: this.selectedShapes() };
    } else {
      const base = e.shiftKey ? new Set(this.selection) : new Set<string>();
      this.setSelection(new Set(base));
      this.interaction = { type: 'marquee', start: p, current: p, base };
    }
  }

  private beginDraw(shape: Shape, origin: Vec) {
    this.store.begin();
    this.store.set(putShapes(this.store.get(), [shape]));
    this.interaction = { type: 'draw', id: shape.id, origin };
  }

  private onPointerMove = (e: PointerEvent) => {
    const sp = this.screenPoint(e);
    const p = this.screenToWorld(sp);
    const it = this.interaction;

    switch (it.type) {
      case 'idle':
        return this.updateHover(sp, p);
      case 'pan': {
        const { startCam: c } = it;
        return this.setCamera({ ...c, x: c.x - (sp.x - it.startX) / c.z, y: c.y - (sp.y - it.startY) / c.z });
      }
      case 'draw':
        return this.updateDraw(it, e, p);
      case 'erase':
        this.eraseAlong(it.last, p);
        it.last = p;
        return;
      case 'move': {
        const dx = p.x - it.start.x;
        const dy = p.y - it.start.y;
        return this.store.set(putShapes(this.store.get(), it.originals.map((s) => translateShape(s, dx, dy))));
      }
      case 'resize':
        return this.updateResize(it, p, e.shiftKey);
      case 'marquee': {
        it.current = p;
        const box = boxFromPoints(it.start, p);
        const next = new Set(it.base);
        for (const s of sortedShapes(this.store.get())) if (boxContains(box, shapeBounds(s))) next.add(s.id);
        return this.setSelection(next);
      }
    }
  };

  private updateDraw(it: Extract<Interaction, { type: 'draw' }>, e: PointerEvent, p: Vec) {
    const doc = this.store.get();
    const s = doc[it.id];
    if (!s) return;
    let next: Shape;

    switch (s.type) {
      case 'stroke': {
        // Coalesced events give the full-resolution path between animation frames
        const events = e.getCoalescedEvents?.() ?? [];
        const rect = this.canvas!.getBoundingClientRect();
        const points = s.points.slice();
        for (const ev of events.length ? events : [e]) {
          const q = this.screenToWorld({ x: ev.clientX - rect.left, y: ev.clientY - rect.top });
          const [lx, ly] = points[points.length - 1];
          if (Math.hypot(q.x - lx, q.y - ly) * this.camera.z < 1) continue;
          points.push([q.x, q.y, pressureOf(ev)]);
        }
        if (points.length === s.points.length) return;
        next = { ...s, points };
        break;
      }
      case 'rect':
      case 'ellipse': {
        const { origin } = it;
        let w = p.x - origin.x;
        let h = p.y - origin.y;
        if (e.shiftKey) {
          const m = Math.max(Math.abs(w), Math.abs(h));
          w = w < 0 ? -m : m;
          h = h < 0 ? -m : m;
        }
        next = { ...s, x: Math.min(origin.x, origin.x + w), y: Math.min(origin.y, origin.y + h), w: Math.abs(w), h: Math.abs(h) };
        break;
      }
      case 'line':
      case 'arrow': {
        let { x, y } = p;
        if (e.shiftKey) {
          // Snap to 15° increments
          const len = Math.hypot(x - s.x1, y - s.y1);
          const step = Math.PI / 12;
          const angle = Math.round(Math.atan2(y - s.y1, x - s.x1) / step) * step;
          x = s.x1 + Math.cos(angle) * len;
          y = s.y1 + Math.sin(angle) * len;
        }
        next = { ...s, x2: x, y2: y };
        break;
      }
      default:
        return;
    }
    this.store.set(putShapes(doc, [next]));
  }

  private updateResize(it: Extract<Interaction, { type: 'resize' }>, p: Vec, keepAspect: boolean) {
    const { box, handle } = it;
    const west = handle.includes('w');
    const north = handle.includes('n');
    // The opposite corner stays fixed
    const ax = west ? box.maxX : box.minX;
    const ay = north ? box.maxY : box.minY;
    const dw = (west ? box.minX : box.maxX) - ax;
    const dh = (north ? box.minY : box.maxY) - ay;
    let sx = dw ? (dw + p.x - it.start.x) / dw : NaN;
    let sy = dh ? (dh + p.y - it.start.y) / dh : NaN;

    if (keepAspect || it.originals.some((s) => s.type === 'text')) {
      const k = Math.max(Math.abs(sx) || 0, Math.abs(sy) || 0);
      sx = Number.isNaN(sx) ? k : Math.sign(sx) * k;
      sy = Number.isNaN(sy) ? k : Math.sign(sy) * k;
    } else {
      if (Number.isNaN(sx)) sx = 1;
      if (Number.isNaN(sy)) sy = 1;
    }
    this.store.set(putShapes(this.store.get(), it.originals.map((s) => scaleShape(s, ax, ay, sx, sy))));
  }

  private eraseAlong(a: Vec, b: Vec) {
    const r = ERASER_RADIUS / this.camera.z;
    const shapes = sortedShapes(this.store.get());
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / r));
    let changed = false;
    for (let i = 0; i <= steps; i++) {
      const q = { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps };
      for (const s of shapes) {
        if (!this.erasing.has(s.id) && hitTest(s, q, r) === 'edge') {
          this.erasing.add(s.id);
          changed = true;
        }
      }
    }
    if (changed) this.requestRender();
  }

  private onPointerUp = () => {
    const it = this.interaction;
    if (it.type === 'idle') return;
    this.interaction = { type: 'idle' };

    switch (it.type) {
      case 'draw': {
        const s = this.store.get()[it.id];
        if (s && this.isTooSmall(s)) this.store.cancel();
        else this.store.end();
        break;
      }
      case 'erase':
        if (this.erasing.size) {
          const ids = [...this.erasing];
          this.erasing.clear();
          this.store.apply((doc) => removeShapes(doc, ids));
        }
        break;
      case 'move':
      case 'resize':
        this.store.end();
        break;
    }
    this.updateCursor();
    this.requestRender();
  };

  private cancelInteraction() {
    const it = this.interaction;
    this.interaction = { type: 'idle' };
    if (it.type === 'draw' || it.type === 'move' || it.type === 'resize') this.store.cancel();
    if (it.type === 'marquee') this.setSelection(it.base);
    this.erasing.clear();
    this.updateCursor();
    this.requestRender();
  }

  /** A click with a shape tool shouldn't leave an invisible shape behind. */
  private isTooSmall(s: Shape): boolean {
    const z = this.camera.z;
    if (s.type === 'rect' || s.type === 'ellipse') return Math.max(s.w, s.h) * z < 3;
    if (s.type === 'line' || s.type === 'arrow') return Math.hypot(s.x2 - s.x1, s.y2 - s.y1) * z < 3;
    return false;
  }

  // ---- Selection handles & cursor ----

  private selectionBounds(): Box | null {
    return unionBounds(this.selectedShapes().map(shapeBounds));
  }

  private toScreenBox(b: Box, pad = 0): Box {
    const a = this.worldToScreen({ x: b.minX, y: b.minY });
    const c = this.worldToScreen({ x: b.maxX, y: b.maxY });
    return { minX: a.x - pad, minY: a.y - pad, maxX: c.x + pad, maxY: c.y + pad };
  }

  private handlePositions(): [Handle, number, number][] {
    const bounds = this.tool === 'select' && !this.editing ? this.selectionBounds() : null;
    if (!bounds) return [];
    const b = this.toScreenBox(bounds, SELECTION_PAD);
    return [
      ['nw', b.minX, b.minY],
      ['ne', b.maxX, b.minY],
      ['sw', b.minX, b.maxY],
      ['se', b.maxX, b.maxY],
    ];
  }

  private handleAt(sp: Vec): Handle | null {
    for (const [h, x, y] of this.handlePositions()) {
      if (Math.abs(sp.x - x) <= HANDLE_RADIUS && Math.abs(sp.y - y) <= HANDLE_RADIUS) return h;
    }
    return null;
  }

  private setCursor(cursor: string) {
    if (this.canvas && this.canvas.style.cursor !== cursor) this.canvas.style.cursor = cursor;
  }

  private updateCursor() {
    if (this.interaction.type === 'pan') this.setCursor('grabbing');
    else if (this.spaceDown) this.setCursor('grab');
    else this.setCursor(TOOL_CURSORS[this.tool]);
  }

  private updateHover(sp: Vec, p: Vec) {
    if (this.tool !== 'select' || this.spaceDown) return;
    const handle = this.handleAt(sp);
    if (handle) return this.setCursor(handle === 'nw' || handle === 'se' ? 'nwse-resize' : 'nesw-resize');
    const hit = shapeAt(sortedShapes(this.store.get()), p, HIT_TOLERANCE / this.camera.z);
    this.setCursor(hit ? 'move' : 'default');
  }

  // ---- Keyboard ----

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (!this.spaceDown) {
        this.spaceDown = true;
        this.updateCursor();
      }
      return;
    }

    const key = e.key.toLowerCase();
    if (this.interaction.type !== 'idle') {
      if (key === 'escape') this.cancelInteraction();
      return;
    }

    if (e.metaKey || e.ctrlKey) {
      switch (key) {
        case 'z':
          if (e.shiftKey) this.redo();
          else this.undo();
          break;
        case 'y':
          this.redo();
          break;
        case 'a':
          this.selectAll();
          break;
        case 'c':
          this.copy();
          break;
        case 'x':
          this.copy();
          this.deleteSelection();
          break;
        case 'v':
          this.paste();
          break;
        case 'd':
          this.duplicate();
          break;
        case '=':
        case '+':
          this.zoomBy(1.25);
          break;
        case '-':
          this.zoomBy(0.8);
          break;
        case '0':
          this.resetZoom();
          break;
        default:
          return;
      }
      e.preventDefault();
      return;
    }
    if (e.altKey) return;

    if (e.code === 'Digit1' && e.shiftKey) {
      this.zoomToFit();
      e.preventDefault();
      return;
    }

    const step = e.shiftKey ? 10 : 1;
    switch (key) {
      case 'delete':
      case 'backspace':
        this.deleteSelection();
        break;
      case 'escape':
        this.setSelection(new Set());
        break;
      case 'enter': {
        const [only] = this.selectedShapes();
        if (this.selection.size !== 1 || only?.type !== 'text') return;
        this.editText(only);
        break;
      }
      case 'arrowleft':
        this.nudge(-step, 0);
        break;
      case 'arrowright':
        this.nudge(step, 0);
        break;
      case 'arrowup':
        this.nudge(0, -step);
        break;
      case 'arrowdown':
        this.nudge(0, step);
        break;
      case ']':
        this.reorder('front');
        break;
      case '[':
        this.reorder('back');
        break;
      default: {
        const tool = KEY_TO_TOOL[key];
        if (!tool || e.shiftKey) return;
        this.setTool(tool);
      }
    }
    e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      this.spaceDown = false;
      this.updateCursor();
    }
  };

  // ---- Rendering ----

  requestRender() {
    if (this.frame || !this.ctx) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  private render() {
    const ctx = this.ctx;
    if (!ctx) return;
    const { dpr, width, height, camera: cam } = this;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, width, height);
    this.drawGrid(ctx);

    ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, -cam.x * cam.z * dpr, -cam.y * cam.z * dpr);
    const view = { minX: cam.x, minY: cam.y, maxX: cam.x + width / cam.z, maxY: cam.y + height / cam.z };
    for (const s of sortedShapes(this.store.get())) {
      if (s.id === this.editing?.id) continue;
      // Generous padding covers stroke thickness and arrowheads
      if (!boxesOverlap(expandBox(shapeBounds(s), 50), view)) continue;
      ctx.globalAlpha = this.erasing.has(s.id) ? 0.25 : 1;
      drawShape(ctx, s);
    }
    ctx.globalAlpha = 1;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawOverlays(ctx);
  }

  private drawGrid(ctx: CanvasRenderingContext2D) {
    const { camera: cam, width, height } = this;
    let step = 24;
    while (step * cam.z < 16) step *= 2;
    const gap = step * cam.z;
    const startX = (Math.floor(cam.x / step) * step - cam.x) * cam.z;
    const startY = (Math.floor(cam.y / step) * step - cam.y) * cam.z;
    ctx.fillStyle = GRID_DOT;
    ctx.beginPath();
    for (let x = startX; x < width; x += gap) {
      for (let y = startY; y < height; y += gap) ctx.rect(x - 0.75, y - 0.75, 1.5, 1.5);
    }
    ctx.fill();
  }

  private drawOverlays(ctx: CanvasRenderingContext2D) {
    const it = this.interaction;
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1;

    if (this.selection.size && !this.editing) {
      const shapes = this.selectedShapes();
      if (shapes.length > 1) {
        ctx.globalAlpha = 0.5;
        for (const s of shapes) {
          const b = this.toScreenBox(shapeBounds(s));
          ctx.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
        }
        ctx.globalAlpha = 1;
      }
      const bounds = unionBounds(shapes.map(shapeBounds));
      if (bounds) {
        const b = this.toScreenBox(bounds, SELECTION_PAD);
        ctx.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
      }
      if (it.type !== 'move') {
        ctx.fillStyle = '#ffffff';
        for (const [, x, y] of this.handlePositions()) {
          ctx.fillRect(x - 4, y - 4, 8, 8);
          ctx.strokeRect(x - 4, y - 4, 8, 8);
        }
      }
    }

    if (it.type === 'marquee') {
      const b = this.toScreenBox(boxFromPoints(it.start, it.current));
      ctx.fillStyle = 'rgba(79, 107, 237, 0.08)';
      ctx.fillRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
      ctx.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
    }
  }
}
