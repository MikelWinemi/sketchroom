import type { Box, Shape, Vec } from './model';

export const FONT_FAMILY = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const LINE_HEIGHT = 1.25;

export const fontFor = (size: number) => `${size}px ${FONT_FAMILY}`;

/** Diameter of a freehand stroke for a given stroke width. */
export const penSize = (strokeWidth: number) => strokeWidth * 2;

// ---- Text measurement ----

let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx() {
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  return measureCtx;
}

export function measureText(text: string, fontSize: number) {
  const ctx = getMeasureCtx();
  ctx.font = fontFor(fontSize);
  const lines = text.split('\n');
  let w = 0;
  for (const line of lines) w = Math.max(w, ctx.measureText(line).width);
  return { w, h: lines.length * fontSize * LINE_HEIGHT };
}

let baselineRatio: number | null = null;

/** Distance from the top of a line box to the alphabetic baseline, matching CSS line-height layout. */
export function baselineOffset(fontSize: number): number {
  if (baselineRatio === null) {
    const ctx = getMeasureCtx();
    ctx.font = fontFor(100);
    const m = ctx.measureText('Hg');
    const ascent = m.fontBoundingBoxAscent ?? 80;
    const descent = m.fontBoundingBoxDescent ?? 20;
    baselineRatio = ((100 * LINE_HEIGHT - (ascent + descent)) / 2 + ascent) / 100;
  }
  return baselineRatio * fontSize;
}

// ---- Boxes ----

export function boxFromPoints(a: Vec, b: Vec): Box {
  return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
}

export function expandBox(b: Box, n: number): Box {
  return { minX: b.minX - n, minY: b.minY - n, maxX: b.maxX + n, maxY: b.maxY + n };
}

export function unionBounds(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const u = { ...boxes[0] };
  for (const b of boxes) {
    u.minX = Math.min(u.minX, b.minX);
    u.minY = Math.min(u.minY, b.minY);
    u.maxX = Math.max(u.maxX, b.maxX);
    u.maxY = Math.max(u.maxY, b.maxY);
  }
  return u;
}

export const pointInBox = (p: Vec, b: Box) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;

export const boxContains = (outer: Box, inner: Box) =>
  inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY;

export const boxesOverlap = (a: Box, b: Box) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

// ---- Shape bounds ----

const boundsCache = new WeakMap<Shape, Box>();

/** Geometric bounds of a shape in world coordinates (excluding stroke thickness). */
export function shapeBounds(s: Shape): Box {
  let b = boundsCache.get(s);
  if (!b) {
    b = computeBounds(s);
    boundsCache.set(s, b);
  }
  return b;
}

function computeBounds(s: Shape): Box {
  switch (s.type) {
    case 'stroke': {
      const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      for (const [x, y] of s.points) {
        b.minX = Math.min(b.minX, x);
        b.minY = Math.min(b.minY, y);
        b.maxX = Math.max(b.maxX, x);
        b.maxY = Math.max(b.maxY, y);
      }
      return b;
    }
    case 'rect':
    case 'ellipse':
      return { minX: s.x, minY: s.y, maxX: s.x + s.w, maxY: s.y + s.h };
    case 'line':
    case 'arrow':
      return boxFromPoints({ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
    case 'text': {
      const m = measureText(s.text, s.fontSize);
      return { minX: s.x, minY: s.y, maxX: s.x + m.w, maxY: s.y + m.h };
    }
  }
}

// ---- Hit testing ----

export function distToSegment(p: Vec, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / len2));
  return Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy));
}

/**
 * 'edge' means the point touches the visible ink of the shape;
 * 'inside' means it is within the interior of a hollow shape.
 */
export type Hit = 'edge' | 'inside';

export function hitTest(s: Shape, p: Vec, tol: number): Hit | null {
  switch (s.type) {
    case 'stroke': {
      const r = penSize(s.strokeWidth) / 2 + tol;
      if (!pointInBox(p, expandBox(shapeBounds(s), r))) return null;
      const pts = s.points;
      if (pts.length === 1) return Math.hypot(p.x - pts[0][0], p.y - pts[0][1]) <= r ? 'edge' : null;
      for (let i = 1; i < pts.length; i++) {
        if (distToSegment(p, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= r) return 'edge';
      }
      return null;
    }
    case 'rect': {
      const r = s.strokeWidth / 2 + tol;
      const inside = p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h;
      const d = inside
        ? Math.min(p.x - s.x, s.x + s.w - p.x, p.y - s.y, s.y + s.h - p.y)
        : Math.hypot(Math.max(s.x - p.x, 0, p.x - s.x - s.w), Math.max(s.y - p.y, 0, p.y - s.y - s.h));
      if (d <= r) return 'edge';
      return inside ? 'inside' : null;
    }
    case 'ellipse': {
      const r = s.strokeWidth / 2 + tol;
      const rx = s.w / 2;
      const ry = s.h / 2;
      if (rx < 1e-6 || ry < 1e-6) return distToSegment(p, s.x, s.y, s.x + s.w, s.y + s.h) <= r ? 'edge' : null;
      const dx = p.x - (s.x + rx);
      const dy = p.y - (s.y + ry);
      const f = Math.hypot(dx / rx, dy / ry);
      if (f === 0) return 'inside';
      // First-order distance to the outline: |f - 1| / |grad f|
      const grad = Math.hypot(dx / (rx * rx), dy / (ry * ry)) / f;
      if (Math.abs(f - 1) / grad <= r) return 'edge';
      return f < 1 ? 'inside' : null;
    }
    case 'line':
    case 'arrow':
      return distToSegment(p, s.x1, s.y1, s.x2, s.y2) <= s.strokeWidth / 2 + tol ? 'edge' : null;
    case 'text':
      return pointInBox(p, expandBox(shapeBounds(s), tol)) ? 'edge' : null;
  }
}

/**
 * Topmost shape under a point. Touching ink wins over clicking inside a hollow
 * shape, so strokes drawn inside a rectangle stay selectable.
 */
export function shapeAt(sorted: Shape[], p: Vec, tol: number): Shape | null {
  let inside: Shape | null = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const hit = hitTest(sorted[i], p, tol);
    if (hit === 'edge') return sorted[i];
    if (hit === 'inside') inside ??= sorted[i];
  }
  return inside;
}

// ---- Transforms ----

export function translateShape(s: Shape, dx: number, dy: number): Shape {
  switch (s.type) {
    case 'stroke':
      return { ...s, points: s.points.map(([x, y, p]) => [x + dx, y + dy, p]) };
    case 'rect':
    case 'ellipse':
    case 'text':
      return { ...s, x: s.x + dx, y: s.y + dy };
    case 'line':
    case 'arrow':
      return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
  }
}

/** Scales a shape about an anchor point. Negative factors flip it. */
export function scaleShape(s: Shape, ax: number, ay: number, sx: number, sy: number): Shape {
  const tx = (x: number) => ax + (x - ax) * sx;
  const ty = (y: number) => ay + (y - ay) * sy;
  switch (s.type) {
    case 'stroke':
      return { ...s, points: s.points.map(([x, y, p]) => [tx(x), ty(y), p]) };
    case 'rect':
    case 'ellipse': {
      const x1 = tx(s.x);
      const x2 = tx(s.x + s.w);
      const y1 = ty(s.y);
      const y2 = ty(s.y + s.h);
      return { ...s, x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
    }
    case 'line':
    case 'arrow':
      return { ...s, x1: tx(s.x1), y1: ty(s.y1), x2: tx(s.x2), y2: ty(s.y2) };
    case 'text': {
      const b = shapeBounds(s);
      return {
        ...s,
        x: Math.min(tx(b.minX), tx(b.maxX)),
        y: Math.min(ty(b.minY), ty(b.maxY)),
        fontSize: Math.max(4, s.fontSize * Math.sqrt(Math.abs(sx * sy))),
      };
    }
  }
}
