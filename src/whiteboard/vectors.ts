import type { Point } from "./view";

export type VectorKind = "pencil" | "line" | "rect" | "circle" | "polyline" | "text";

export interface BaseVector {
  id: string;
  kind: VectorKind;
  author: string;        // peerId or "local"
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
}

export type Vector = PencilVector | LineVector | RectVector | CircleVector | PolylineVector | TextVector;

export function newVectorId(): string {
  return (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.()
    ?? `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
  }
}
