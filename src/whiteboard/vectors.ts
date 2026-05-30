import type { Point } from "./view";

export type VectorKind = "pencil" | "line" | "rect" | "circle" | "polyline" | "text" | "latex";

export interface BaseVector {
  id: string;
  kind: VectorKind;
  /** peerId of the user that originally created (or duplicated) this vector.
   * Never changes once set. */
  author: string;
  /** peerId of the most recent modifier. Equals `author` when never modified
   * by anyone else. Stamped on every commit (add or replace.after). */
  lastEditor?: string;
  color: string;
  thickness: number;     // pixels at zoom=1
  createdAt: number;
}

export interface PencilVector extends BaseVector { kind: "pencil"; points: Point[]; }
export interface LineVector extends BaseVector { kind: "line"; a: Point; b: Point; }
export interface RectVector extends BaseVector {
  kind: "rect"; a: Point; b: Point;
  /** Rotation in radians around the rect's center, applied at render time. */
  rotation?: number;
}
export interface CircleVector extends BaseVector { kind: "circle"; center: Point; radius: number; }
export interface PolylineVector extends BaseVector { kind: "polyline"; points: Point[]; }
export interface TextVector extends BaseVector {
  kind: "text"; pos: Point; text: string; fontSize: number;
  /** Rotation in radians around `pos` (the top-left baseline anchor). */
  rotation?: number;
  /** When true, `fontSize` is interpreted as SCREEN pixels (constant size
   * regardless of zoom). When false/undefined, `fontSize` is world-space
   * (scales with zoom). Default = false to preserve existing semantics. */
  screenScale?: boolean;
}

export interface LatexVector extends BaseVector {
  kind: "latex"; pos: Point; text: string; fontSize: number;
  /** Rotation in radians around `pos` (top-left anchor of the rendered block). */
  rotation?: number;
  /** Same screen/world-scale switch as TextVector. */
  screenScale?: boolean;
}

export type Vector = PencilVector | LineVector | RectVector | CircleVector | PolylineVector | TextVector | LatexVector;

export function newVectorId(): string {
  return (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.()
    ?? `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Effective screen-pixel size of a text/latex vector, accounting for the
 * screenScale flag. Clamped to a readable minimum so very small text doesn't
 * disappear in world-scale mode at low zoom. */
export function effectiveTextPx(fontSize: number, screenScale: boolean | undefined, zoom: number): number {
  return screenScale ? Math.max(8, fontSize) : Math.max(8, fontSize * zoom);
}

export function getBoundingBox(v: Vector): { minX: number; minY: number; maxX: number; maxY: number } {
  switch (v.kind) {
    case "pencil":
    case "polyline": {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of v.points) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      }
      return { minX, minY, maxX, maxY };
    }
    case "line":
    case "rect":
      return {
        minX: Math.min(v.a.x, v.b.x), minY: Math.min(v.a.y, v.b.y),
        maxX: Math.max(v.a.x, v.b.x), maxY: Math.max(v.a.y, v.b.y),
      };
    case "circle":
      return {
        minX: v.center.x - v.radius, minY: v.center.y - v.radius,
        maxX: v.center.x + v.radius, maxY: v.center.y + v.radius,
      };
    case "text": {
      // Crude — actual width depends on font metrics; treat as a tiny box near pos.
      return { minX: v.pos.x, minY: v.pos.y - v.fontSize, maxX: v.pos.x + v.fontSize * 4, maxY: v.pos.y };
    }
    case "latex": {
      // Coarse — dimensions depend on KaTeX rendering. Approximate as 5×fontSize wide
      // per line so hit-tests still work before the cached image is available.
      const lines = Math.max(1, v.text.split("\n").length);
      return {
        minX: v.pos.x,
        minY: v.pos.y - v.fontSize,
        maxX: v.pos.x + v.fontSize * 5,
        maxY: v.pos.y + v.fontSize * 1.5 * (lines - 1),
      };
    }
  }
}
