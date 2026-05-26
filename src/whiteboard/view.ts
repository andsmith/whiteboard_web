export interface Point { x: number; y: number; }

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 20;
export const GRID_CELL_WORLD = 20;

export function snap(p: Point, enabled: boolean): Point {
  if (!enabled) return p;
  return {
    x: Math.round(p.x / GRID_CELL_WORLD) * GRID_CELL_WORLD,
    y: Math.round(p.y / GRID_CELL_WORLD) * GRID_CELL_WORLD,
  };
}

export class BoardView {
  origin: Point = { x: 0, y: 0 };
  zoom = 1.0;

  pixelsToWorld(px: Point): Point {
    return { x: px.x / this.zoom + this.origin.x, y: px.y / this.zoom + this.origin.y };
  }

  worldToPixels(w: Point): Point {
    return { x: (w.x - this.origin.x) * this.zoom, y: (w.y - this.origin.y) * this.zoom };
  }

  pan(deltaPx: Point): void {
    this.origin.x -= deltaPx.x / this.zoom;
    this.origin.y -= deltaPx.y / this.zoom;
  }

  zoomAt(pivotPx: Point, newZoom: number): void {
    const worldBefore = this.pixelsToWorld(pivotPx);
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
    this.origin.x = worldBefore.x - pivotPx.x / this.zoom;
    this.origin.y = worldBefore.y - pivotPx.y / this.zoom;
  }
}
