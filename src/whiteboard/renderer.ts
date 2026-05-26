import type { AppState } from "./app-state";
import type { Vector } from "./vectors";

const CELL_WORLD = 20;
const HEAVY_EVERY = 5;
const BG_COLOR = "#F1FAFF";
const GRID_LIGHT = "rgba(0,0,0,0.06)";
const GRID_HEAVY = "rgba(0,0,0,0.12)";

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private dirty = true;
  private running = false;

  constructor(private canvas: HTMLCanvasElement, private state: AppState) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.start();
  }

  invalidate(): void {
    this.dirty = true;
  }

  resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.max(1, Math.round(w * this.dpr));
    this.canvas.height = Math.max(1, Math.round(h * this.dpr));
    this.dirty = true;
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      if (this.dirty) {
        this.render();
        this.dirty = false;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private render(): void {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);
    if (this.state.showGrid) this.drawGrid(w, h);

    for (const v of this.state.store.vectors.values()) {
      this.drawVector(v, 1);
    }
    if (this.state.inProgress) {
      this.drawVector(this.state.inProgress, 0.7);
    }
  }

  private drawGrid(w: number, h: number): void {
    const ctx = this.ctx;
    const view = this.state.view;
    const cellPx = CELL_WORLD * view.zoom;
    if (cellPx < 4) return;

    const minWorld = view.pixelsToWorld({ x: 0, y: 0 });
    const maxWorld = view.pixelsToWorld({ x: w, y: h });
    const startX = Math.floor(minWorld.x / CELL_WORLD) * CELL_WORLD;
    const startY = Math.floor(minWorld.y / CELL_WORLD) * CELL_WORLD;
    const step = CELL_WORLD;

    ctx.beginPath();
    for (let x = startX; x <= maxWorld.x + step; x += step) {
      if (Math.round(x / CELL_WORLD) % HEAVY_EVERY === 0) continue;
      const px = (x - view.origin.x) * view.zoom;
      ctx.moveTo(px, 0); ctx.lineTo(px, h);
    }
    for (let y = startY; y <= maxWorld.y + step; y += step) {
      if (Math.round(y / CELL_WORLD) % HEAVY_EVERY === 0) continue;
      const py = (y - view.origin.y) * view.zoom;
      ctx.moveTo(0, py); ctx.lineTo(w, py);
    }
    ctx.strokeStyle = GRID_LIGHT; ctx.lineWidth = 1; ctx.stroke();

    ctx.beginPath();
    for (let x = startX; x <= maxWorld.x + step; x += step) {
      if (Math.round(x / CELL_WORLD) % HEAVY_EVERY !== 0) continue;
      const px = (x - view.origin.x) * view.zoom;
      ctx.moveTo(px, 0); ctx.lineTo(px, h);
    }
    for (let y = startY; y <= maxWorld.y + step; y += step) {
      if (Math.round(y / CELL_WORLD) % HEAVY_EVERY !== 0) continue;
      const py = (y - view.origin.y) * view.zoom;
      ctx.moveTo(0, py); ctx.lineTo(w, py);
    }
    ctx.strokeStyle = GRID_HEAVY; ctx.stroke();
  }

  private drawVector(v: Vector, alpha: number): void {
    const ctx = this.ctx;
    const view = this.state.view;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = v.color;
    ctx.fillStyle = v.color;
    ctx.lineWidth = Math.max(0.5, v.thickness * view.zoom);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (v.kind) {
      case "pencil":
      case "polyline": {
        if (v.points.length < 2) {
          // A single click leaves a small dot
          if (v.points.length === 1) {
            const p = view.worldToPixels(v.points[0]!);
            ctx.beginPath();
            ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        ctx.beginPath();
        const p0 = view.worldToPixels(v.points[0]!);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < v.points.length; i++) {
          const p = view.worldToPixels(v.points[i]!);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        break;
      }
      case "line": {
        const a = view.worldToPixels(v.a);
        const b = view.worldToPixels(v.b);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        break;
      }
      case "rect": {
        const a = view.worldToPixels(v.a);
        const b = view.worldToPixels(v.b);
        ctx.beginPath();
        ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y),
                 Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        ctx.stroke();
        break;
      }
      case "circle": {
        const c = view.worldToPixels(v.center);
        const r = Math.max(0.5, v.radius * view.zoom);
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case "text": {
        const p = view.worldToPixels(v.pos);
        const px = Math.max(8, v.fontSize * view.zoom);
        ctx.font = `${px}px system-ui, -apple-system, sans-serif`;
        ctx.textBaseline = "alphabetic";
        ctx.fillText(v.text, p.x, p.y);
        break;
      }
    }
    ctx.restore();
  }
}
