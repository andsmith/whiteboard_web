export interface Point { x: number; y: number; }

export const GRID_CELL_WORLD = 20;

export function snap(p: Point, enabled: boolean): Point {
  if (!enabled) return p;
  return {
    x: Math.round(p.x / GRID_CELL_WORLD) * GRID_CELL_WORLD,
    y: Math.round(p.y / GRID_CELL_WORLD) * GRID_CELL_WORLD,
  };
}

/** Snap an angle (radians) to the nearest 45° multiple if enabled. */
export function snapAngle(rad: number, enabled: boolean): number {
  if (!enabled) return rad;
  const step = Math.PI / 4;
  return Math.round(rad / step) * step;
}

export interface BBox {
  minX: number; minY: number; maxX: number; maxY: number;
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
    if (!Number.isFinite(newZoom) || newZoom <= 0) return;
    const worldBefore = this.pixelsToWorld(pivotPx);
    this.zoom = newZoom;
    this.origin.x = worldBefore.x - pivotPx.x / this.zoom;
    this.origin.y = worldBefore.y - pivotPx.y / this.zoom;
  }

  /** Centre a world-space bbox in the canvas with `paddingPx` empty margin
   * around it. Mutates origin + zoom together. */
  fitToBbox(bbox: BBox, canvasPx: { width: number; height: number }, paddingPx = 40): void {
    const bw = Math.max(1, bbox.maxX - bbox.minX);
    const bh = Math.max(1, bbox.maxY - bbox.minY);
    const availW = Math.max(1, canvasPx.width - paddingPx * 2);
    const availH = Math.max(1, canvasPx.height - paddingPx * 2);
    const z = Math.min(availW / bw, availH / bh);
    this.zoom = Math.max(0.01, z);
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;
    this.origin.x = cx - canvasPx.width / 2 / this.zoom;
    this.origin.y = cy - canvasPx.height / 2 / this.zoom;
  }

  /** True iff the world-space bbox is fully inside the current viewport. */
  containsBbox(bbox: BBox, canvasPx: { width: number; height: number }): boolean {
    const tl = this.worldToPixels({ x: bbox.minX, y: bbox.minY });
    const br = this.worldToPixels({ x: bbox.maxX, y: bbox.maxY });
    return tl.x >= 0 && tl.y >= 0 && br.x <= canvasPx.width && br.y <= canvasPx.height;
  }
}
