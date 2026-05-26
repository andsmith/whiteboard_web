import type { AppState } from "./app-state";

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
  }

  private drawGrid(w: number, h: number): void {
    const ctx = this.ctx;
    const view = this.state.view;

    // If cells would be too small to see, skip the grid (and prevent perf hits).
    const cellPx = CELL_WORLD * view.zoom;
    if (cellPx < 4) return;

    const minWorld = view.pixelsToWorld({ x: 0, y: 0 });
    const maxWorld = view.pixelsToWorld({ x: w, y: h });
    const startX = Math.floor(minWorld.x / CELL_WORLD) * CELL_WORLD;
    const startY = Math.floor(minWorld.y / CELL_WORLD) * CELL_WORLD;
    const stepWorld = CELL_WORLD;

    // Light lines
    ctx.beginPath();
    for (let x = startX; x <= maxWorld.x + stepWorld; x += stepWorld) {
      if (Math.round(x / CELL_WORLD) % HEAVY_EVERY === 0) continue;
      const px = (x - view.origin.x) * view.zoom;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
    }
    for (let y = startY; y <= maxWorld.y + stepWorld; y += stepWorld) {
      if (Math.round(y / CELL_WORLD) % HEAVY_EVERY === 0) continue;
      const py = (y - view.origin.y) * view.zoom;
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
    }
    ctx.strokeStyle = GRID_LIGHT;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Heavy lines (every 5th)
    ctx.beginPath();
    for (let x = startX; x <= maxWorld.x + stepWorld; x += stepWorld) {
      if (Math.round(x / CELL_WORLD) % HEAVY_EVERY !== 0) continue;
      const px = (x - view.origin.x) * view.zoom;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
    }
    for (let y = startY; y <= maxWorld.y + stepWorld; y += stepWorld) {
      if (Math.round(y / CELL_WORLD) % HEAVY_EVERY !== 0) continue;
      const py = (y - view.origin.y) * view.zoom;
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
    }
    ctx.strokeStyle = GRID_HEAVY;
    ctx.stroke();
  }
}
