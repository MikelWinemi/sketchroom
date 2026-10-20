import { getStroke } from 'perfect-freehand';
import type { LineShape, Shape, StrokeShape } from './model';
import { LINE_HEIGHT, baselineOffset, fontFor, penSize } from './geometry';

const outlineCache = new WeakMap<StrokeShape, number[][]>();
const pathCache = new WeakMap<StrokeShape, Path2D>();

/** Freehand strokes are filled polygons computed by perfect-freehand. */
export function strokeOutline(s: StrokeShape): number[][] {
  let outline = outlineCache.get(s);
  if (!outline) {
    outline = getStroke(s.points, {
      size: penSize(s.strokeWidth),
      thinning: 0.6,
      smoothing: 0.5,
      streamline: 0.5,
      simulatePressure: s.simulatePressure,
      last: true,
    });
    outlineCache.set(s, outline);
  }
  return outline;
}

/**
 * Walks a smooth closed curve through the midpoints of an outline polygon.
 * Shared by canvas rendering and SVG export so both look identical.
 */
export function traceOutline(
  outline: number[][],
  moveTo: (x: number, y: number) => void,
  quadTo: (cx: number, cy: number, x: number, y: number) => void,
) {
  const n = outline.length;
  if (n < 2) return;
  const [lx, ly] = outline[n - 1];
  moveTo((lx + outline[0][0]) / 2, (ly + outline[0][1]) / 2);
  for (let i = 0; i < n; i++) {
    const [x, y] = outline[i];
    const [nx, ny] = outline[(i + 1) % n];
    quadTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
}

function strokePath(s: StrokeShape): Path2D {
  let path = pathCache.get(s);
  if (!path) {
    const p = new Path2D();
    traceOutline(strokeOutline(s), (x, y) => p.moveTo(x, y), (cx, cy, x, y) => p.quadraticCurveTo(cx, cy, x, y));
    p.closePath();
    path = p;
    pathCache.set(s, path);
  }
  return path;
}

/** The two outer points of an arrowhead; the tip is (x2, y2). */
export function arrowHead(s: LineShape): [[number, number], [number, number]] {
  const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
  const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
  const head = Math.min(len * 0.5, 10 + s.strokeWidth * 2.5);
  const spread = Math.PI / 7;
  return [
    [s.x2 - head * Math.cos(angle - spread), s.y2 - head * Math.sin(angle - spread)],
    [s.x2 - head * Math.cos(angle + spread), s.y2 - head * Math.sin(angle + spread)],
  ];
}

/** Draws a shape in world coordinates (the caller sets up the camera transform). */
export function drawShape(ctx: CanvasRenderingContext2D, s: Shape) {
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (s.type) {
    case 'stroke':
      ctx.fill(strokePath(s));
      break;
    case 'rect':
      ctx.beginPath();
      ctx.rect(s.x, s.y, s.w, s.h);
      ctx.stroke();
      break;
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(s.x + s.w / 2, s.y + s.h / 2, s.w / 2, s.h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'line':
    case 'arrow': {
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      if (s.type === 'arrow') {
        const [a, b] = arrowHead(s);
        ctx.moveTo(...a);
        ctx.lineTo(s.x2, s.y2);
        ctx.lineTo(...b);
      }
      ctx.stroke();
      break;
    }
    case 'text': {
      ctx.font = fontFor(s.fontSize);
      ctx.textBaseline = 'alphabetic';
      const lineHeight = s.fontSize * LINE_HEIGHT;
      const baseline = baselineOffset(s.fontSize);
      s.text.split('\n').forEach((line, i) => ctx.fillText(line, s.x, s.y + i * lineHeight + baseline));
      break;
    }
  }
}
