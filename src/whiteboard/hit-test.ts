import type { Vector } from "./vectors";
import { getBoundingBox } from "./vectors";
import type { BoardView, Point } from "./view";

export const HIT_TOLERANCE_PX = 10;
const MIN_BBOX_PX = 10;

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distanceToRectOutline(p: Point, a: Point, b: Point): number {
  const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
  const corners: [Point, Point][] = [
    [{ x: minX, y: minY }, { x: maxX, y: minY }],
    [{ x: maxX, y: minY }, { x: maxX, y: maxY }],
    [{ x: maxX, y: maxY }, { x: minX, y: maxY }],
    [{ x: minX, y: maxY }, { x: minX, y: minY }],
  ];
  let best = Infinity;
  for (const [s, e] of corners) {
    const d = distanceToSegment(p, s, e);
    if (d < best) best = d;
  }
  return best;
}

function bboxPx(v: Vector, view: BoardView, ctx?: CanvasRenderingContext2D): {
  minX: number; minY: number; maxX: number; maxY: number;
} {
  if (v.kind === "text" && ctx) {
    ctx.save();
    const px = Math.max(8, v.fontSize * view.zoom);
    ctx.font = `${px}px system-ui, -apple-system, sans-serif`;
    const lines = v.text.split("\n");
    const lineHeight = px * 1.5;
    let maxWidth = 0;
    for (const line of lines) maxWidth = Math.max(maxWidth, ctx.measureText(line).width);
    ctx.restore();
    const start = view.worldToPixels(v.pos);
    return {
      minX: start.x,
      maxX: start.x + maxWidth,
      minY: start.y - px,
      maxY: start.y - px + lines.length * lineHeight,
    };
  }
  const wbb = getBoundingBox(v);
  const a = view.worldToPixels({ x: wbb.minX, y: wbb.minY });
  const b = view.worldToPixels({ x: wbb.maxX, y: wbb.maxY });
  return {
    minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x),
    minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y),
  };
}

export function hitTest(
  v: Vector,
  screenPt: Point,
  view: BoardView,
  ctx?: CanvasRenderingContext2D,
): boolean {
  switch (v.kind) {
    case "line": {
      const a = view.worldToPixels(v.a);
      const b = view.worldToPixels(v.b);
      return distanceToSegment(screenPt, a, b) <= HIT_TOLERANCE_PX;
    }
    case "rect": {
      const a = view.worldToPixels(v.a);
      const b = view.worldToPixels(v.b);
      return distanceToRectOutline(screenPt, a, b) <= HIT_TOLERANCE_PX;
    }
    case "circle": {
      const c = view.worldToPixels(v.center);
      const rPx = v.radius * view.zoom;
      const d = Math.hypot(screenPt.x - c.x, screenPt.y - c.y);
      return Math.abs(d - rPx) <= HIT_TOLERANCE_PX;
    }
    case "polyline": {
      for (let i = 0; i < v.points.length - 1; i++) {
        const a = view.worldToPixels(v.points[i]!);
        const b = view.worldToPixels(v.points[i + 1]!);
        if (distanceToSegment(screenPt, a, b) <= HIT_TOLERANCE_PX) return true;
      }
      return false;
    }
    case "pencil":
    case "text": {
      const bb = bboxPx(v, view, ctx);
      const padX = Math.max(0, (MIN_BBOX_PX - (bb.maxX - bb.minX)) / 2);
      const padY = Math.max(0, (MIN_BBOX_PX - (bb.maxY - bb.minY)) / 2);
      return (
        screenPt.x >= bb.minX - padX && screenPt.x <= bb.maxX + padX &&
        screenPt.y >= bb.minY - padY && screenPt.y <= bb.maxY + padY
      );
    }
  }
}

export function findHit(
  vectors: Iterable<Vector>,
  screenPt: Point,
  view: BoardView,
  ctx?: CanvasRenderingContext2D,
): Vector | null {
  const arr = Array.from(vectors);
  for (let i = arr.length - 1; i >= 0; i--) {
    if (hitTest(arr[i]!, screenPt, view, ctx)) return arr[i]!;
  }
  return null;
}
