import type { Shape } from './model';
import { FONT_FAMILY, LINE_HEIGHT, baselineOffset, expandBox, penSize, shapeBounds, unionBounds } from './geometry';
import { arrowHead, drawShape, strokeOutline, traceOutline } from './render';

const PADDING = 32;
const BACKGROUND = '#ffffff';

function exportBounds(shapes: Shape[]) {
  // Pad each shape for stroke thickness and arrowheads, then the whole image
  const b = unionBounds(shapes.map((s) => expandBox(shapeBounds(s), penSize(s.strokeWidth) + 16)));
  return b && expandBox(b, PADDING);
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const safeName = (name: string) => name.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-') || 'sketchroom';

export function exportPng(shapes: Shape[], name: string) {
  const b = exportBounds(shapes);
  if (!b) return;
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  // 2x for crisp output, scaled down for huge boards to stay within canvas limits
  const scale = Math.min(2, 8192 / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, -b.minX * scale, -b.minY * scale);
  for (const s of shapes) drawShape(ctx, s);
  canvas.toBlob((blob) => blob && download(blob, `${safeName(name)}.png`), 'image/png');
}

const n = (v: number) => Math.round(v * 100) / 100;
const esc = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function shapeToSvg(s: Shape): string {
  const stroke = `stroke="${esc(s.color)}" stroke-width="${s.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  switch (s.type) {
    case 'stroke': {
      let d = '';
      traceOutline(
        strokeOutline(s),
        (x, y) => (d += `M${n(x)} ${n(y)}`),
        (cx, cy, x, y) => (d += `Q${n(cx)} ${n(cy)} ${n(x)} ${n(y)}`),
      );
      return `<path d="${d}Z" fill="${esc(s.color)}"/>`;
    }
    case 'rect':
      return `<rect x="${n(s.x)}" y="${n(s.y)}" width="${n(s.w)}" height="${n(s.h)}" ${stroke}/>`;
    case 'ellipse':
      return `<ellipse cx="${n(s.x + s.w / 2)}" cy="${n(s.y + s.h / 2)}" rx="${n(s.w / 2)}" ry="${n(s.h / 2)}" ${stroke}/>`;
    case 'line':
      return `<line x1="${n(s.x1)}" y1="${n(s.y1)}" x2="${n(s.x2)}" y2="${n(s.y2)}" ${stroke}/>`;
    case 'arrow': {
      const [a, b] = arrowHead(s);
      const d = `M${n(s.x1)} ${n(s.y1)}L${n(s.x2)} ${n(s.y2)}M${n(a[0])} ${n(a[1])}L${n(s.x2)} ${n(s.y2)}L${n(b[0])} ${n(b[1])}`;
      return `<path d="${d}" ${stroke}/>`;
    }
    case 'text': {
      const lineHeight = s.fontSize * LINE_HEIGHT;
      const baseline = baselineOffset(s.fontSize);
      const lines = s.text
        .split('\n')
        .map((line, i) => `<tspan x="${n(s.x)}" y="${n(s.y + i * lineHeight + baseline)}">${esc(line)}</tspan>`)
        .join('');
      return `<text font-family="${esc(FONT_FAMILY)}" font-size="${n(s.fontSize)}" fill="${esc(s.color)}" xml:space="preserve">${lines}</text>`;
    }
  }
}

export function exportSvg(shapes: Shape[], name: string) {
  const b = exportBounds(shapes);
  if (!b) return;
  const w = n(b.maxX - b.minX);
  const h = n(b.maxY - b.minY);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(b.minX)} ${n(b.minY)} ${w} ${h}" width="${w}" height="${h}">`,
    `<rect x="${n(b.minX)}" y="${n(b.minY)}" width="${w}" height="${h}" fill="${BACKGROUND}"/>`,
    ...shapes.map(shapeToSvg),
    '</svg>',
  ].join('\n');
  download(new Blob([svg], { type: 'image/svg+xml' }), `${safeName(name)}.svg`);
}
