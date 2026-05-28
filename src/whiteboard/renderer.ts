import type { AppState } from "./app-state";
import type { Vector, TextVector } from "./vectors";
import type { Anchor } from "./anchors";
import { applyOpsTo, opAffectedIds } from "./submissions";
import { getRadialIconPositions } from "./tools/modify";

export const ANCHOR_ICON_R = 14;     // hit-test radius in screen px
const PENDING_ALPHA = 0.55;
const PENDING_DASH = [6, 4];

const CELL_WORLD = 20;
const HEAVY_EVERY = 5;
const BG_COLOR = "#F1FAFF";
const GRID_LIGHT = "rgba(0,0,0,0.06)";
const GRID_HEAVY = "rgba(0,0,0,0.12)";
const HOVER_COLOR = "#39FF14";
const DRAG_COLOR = "#1080ff";
const RADIAL_ICON_R = 22;
const RADIAL_ICON_R_HOVER = 26;

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private dirty = true;
  private running = false;
  private lastTick = 0;

  constructor(private canvas: HTMLCanvasElement, private state: AppState) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.start();
  }

  invalidate(): void { this.dirty = true; }

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
      const now = performance.now();
      // Force re-render every 500ms while text is being edited so the
      // blinking cursor animates.
      if (!this.dirty && this.state.textEditing && now - this.lastTick > 500) {
        this.dirty = true;
      }
      if (this.dirty) {
        this.render();
        this.dirty = false;
        this.lastTick = now;
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

    // Compute the active preview overlay (host side) so we know which vector
    // IDs to skip-then-redraw with the pending style.
    const previewIds = this.activePreviewIds();
    const previewMap = previewIds ? this.buildPreviewMap() : null;
    const pendingIds = this.localPendingIds();

    for (const v of this.state.store.vectors.values()) {
      const isDragging = this.state.dragLockedTargetId === v.id;
      const isCandidate = this.state.selectionBox?.candidates.has(v.id) ?? false;
      const isSelected = this.state.selectedIds.has(v.id);
      const isHovered = this.state.hoverId === v.id;
      let override: string | undefined;
      if (isDragging || isSelected) override = DRAG_COLOR;
      else if (isCandidate || isHovered) override = HOVER_COLOR;

      // If the host is previewing a submission AND this vector is among the
      // affected ones, render the *preview* version instead of the current one.
      if (previewMap && previewIds && previewIds.has(v.id)) {
        const pv = previewMap.get(v.id);
        if (pv) this.drawVector(pv, { override, alpha: PENDING_ALPHA, dash: PENDING_DASH });
        continue; // skip the actual vector; preview replaces it visually
      }
      // Submitter-side pending visualization: anything affected by pendingOps
      // gets the same dashed/alpha cue.
      if (pendingIds.has(v.id)) {
        this.drawVector(v, { override, alpha: PENDING_ALPHA, dash: PENDING_DASH });
        continue;
      }
      this.drawVector(v, { override });
    }
    // Pure-add preview vectors (not in the host's store yet).
    if (previewMap && previewIds) {
      for (const id of previewIds) {
        if (this.state.store.vectors.has(id)) continue;
        const pv = previewMap.get(id);
        if (pv) this.drawVector(pv, { alpha: PENDING_ALPHA, dash: PENDING_DASH });
      }
    }
    if (this.state.inProgress) {
      this.drawVector(this.state.inProgress, { alpha: 0.7 });
    }
    // Mid-placement duplicate previews — rendered with the same alpha as
    // in-progress drawings so it's clear they aren't committed yet.
    if (this.state.placingDuplicates) {
      for (const v of this.state.placingDuplicates) {
        this.drawVector(v, { alpha: 0.7 });
      }
    }
    if (this.state.textEditing) {
      this.drawVector(this.state.textEditing, { alpha: 1.0 });
      this.drawTextCursor(this.state.textEditing);
    }
    // Anchors render on top of vectors, below transient UI overlays.
    for (const a of this.state.anchors.values()) {
      this.drawAnchor(a);
    }
    if (this.state.hoverAnchorId) {
      const a = this.state.anchors.get(this.state.hoverAnchorId);
      if (a) this.drawAnchorTooltip(a);
    }
    if (this.state.selectionBox) {
      this.drawSelectionBox();
    }
    if (this.state.radialMenu) {
      this.drawRadialMenu();
    }
  }

  private activePreviewIds(): Set<string> | null {
    const preview = this.state.activeSubmissionPreview;
    if (!preview || !preview.visible) return null;
    const submission = this.state.pendingSubmissions.find((s) => s.id === preview.submissionId);
    if (!submission) return null;
    const ids = new Set<string>();
    for (const op of submission.ops) opAffectedIds(op, ids);
    return ids;
  }

  private buildPreviewMap(): Map<string, Vector> | null {
    const preview = this.state.activeSubmissionPreview;
    if (!preview || !preview.visible) return null;
    const submission = this.state.pendingSubmissions.find((s) => s.id === preview.submissionId);
    if (!submission) return null;
    const map = new Map<string, Vector>(this.state.store.vectors);
    for (const op of submission.ops) applyOpsTo(map, op);
    return map;
  }

  private localPendingIds(): Set<string> {
    // Only meaningful for view-only users. For host / edit guests pendingOps
    // is always empty, so the set comes out empty too.
    const ids = new Set<string>();
    for (const op of this.state.pendingOps) opAffectedIds(op, ids);
    return ids;
  }

  private drawAnchor(a: Anchor): void {
    const ctx = this.ctx;
    const p = this.state.view.worldToPixels(a.position);
    const r = 14; // constant screen-space radius
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.strokeStyle = a.color;
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Mini anchor shape.
    ctx.beginPath();
    ctx.arc(0, -6, 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(0, 7);
    ctx.moveTo(-4, -1);
    ctx.lineTo(4, -1);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 4, 6, Math.PI * 0.16, Math.PI - Math.PI * 0.16);
    ctx.stroke();
    ctx.restore();
  }

  private drawAnchorTooltip(a: Anchor): void {
    const ctx = this.ctx;
    const p = this.state.view.worldToPixels(a.position);
    const text = a.name;
    ctx.save();
    ctx.font = "12px system-ui, -apple-system, sans-serif";
    const padX = 6;
    const metrics = ctx.measureText(text);
    const w = metrics.width + padX * 2;
    const h = 18;
    const x = p.x + 18;
    const y = p.y - h / 2;
    ctx.fillStyle = "rgba(0,0,0,0.78)";
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + padX, y + h / 2 + 0.5);
    ctx.restore();
  }

  private drawSelectionBox(): void {
    const box = this.state.selectionBox;
    if (!box) return;
    const ctx = this.ctx;
    const x = Math.min(box.startScreen.x, box.endScreen.x);
    const y = Math.min(box.startScreen.y, box.endScreen.y);
    const w = Math.abs(box.endScreen.x - box.startScreen.x);
    const h = Math.abs(box.endScreen.y - box.startScreen.y);
    ctx.save();
    ctx.fillStyle = "rgba(16, 128, 255, 0.08)";
    ctx.strokeStyle = "#1080ff";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
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

  private drawVector(v: Vector, opts: { alpha?: number; override?: string; dash?: number[] } = {}): void {
    const ctx = this.ctx;
    const view = this.state.view;
    ctx.save();
    ctx.globalAlpha = opts.alpha ?? 1;
    const color = opts.override ?? v.color;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(0.5, v.thickness * view.zoom);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (opts.dash) ctx.setLineDash(opts.dash);

    switch (v.kind) {
      case "pencil":
      case "polyline": {
        if (v.points.length < 2) {
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
        const centerW = { x: (v.a.x + v.b.x) / 2, y: (v.a.y + v.b.y) / 2 };
        const centerPx = view.worldToPixels(centerW);
        const wPx = Math.abs(v.b.x - v.a.x) * view.zoom;
        const hPx = Math.abs(v.b.y - v.a.y) * view.zoom;
        ctx.save();
        ctx.translate(centerPx.x, centerPx.y);
        if (v.rotation) ctx.rotate(v.rotation);
        ctx.beginPath();
        ctx.rect(-wPx / 2, -hPx / 2, wPx, hPx);
        ctx.stroke();
        ctx.restore();
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
        this.drawText(v, opts.override);
        break;
      }
    }
    ctx.restore();
  }

  private drawText(v: TextVector, override?: string): void {
    const ctx = this.ctx;
    const view = this.state.view;
    const px = Math.max(8, v.fontSize * view.zoom);
    ctx.font = `${px}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = override ?? v.color;
    const lineHeight = px * 1.5;
    const start = view.worldToPixels(v.pos);
    const lines = v.text.split("\n");
    ctx.save();
    ctx.translate(start.x, start.y);
    if (v.rotation) ctx.rotate(v.rotation);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i]!, 0, i * lineHeight);
    }
    ctx.restore();
  }

  private drawTextCursor(v: TextVector): void {
    const visible = (performance.now() / 500) % 2 < 1;
    if (!visible) return;
    const ctx = this.ctx;
    const view = this.state.view;
    const px = Math.max(8, v.fontSize * view.zoom);
    ctx.font = `${px}px system-ui, -apple-system, sans-serif`;
    const lines = v.text.split("\n");
    const lastLine = lines[lines.length - 1] ?? "";
    const w = ctx.measureText(lastLine).width;
    const start = view.worldToPixels(v.pos);
    const lineHeight = px * 1.5;
    const cx = start.x + w;
    const cy = start.y + (lines.length - 1) * lineHeight;
    ctx.save();
    ctx.strokeStyle = v.color;
    ctx.lineWidth = Math.max(1, px * 0.06);
    ctx.beginPath();
    ctx.moveTo(cx, cy - px * 0.95);
    ctx.lineTo(cx, cy);
    ctx.stroke();
    ctx.restore();
  }

  private drawRadialMenu(): void {
    const menu = this.state.radialMenu;
    if (!menu) return;
    const ctx = this.ctx;
    const positions = getRadialIconPositions(menu.pos);
    for (const name of ["rotate", "scale", "delete", "duplicate"] as const) {
      const pos = positions[name];
      const hovered = menu.hoverIcon === name;
      const r = hovered ? RADIAL_ICON_R_HOVER : RADIAL_ICON_R;

      // White background (borderless)
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.18)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Icon
      ctx.save();
      ctx.translate(pos.x, pos.y);
      if (hovered) ctx.scale(1.1, 1.1);
      this.drawRadialIcon(name);
      ctx.restore();
    }
  }

  private drawRadialIcon(name: "delete" | "rotate" | "scale" | "duplicate"): void {
    const ctx = this.ctx;
    switch (name) {
      case "delete": {
        ctx.strokeStyle = "#cc0000";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        const s = 8;
        ctx.beginPath();
        ctx.moveTo(-s, -s); ctx.lineTo(s, s);
        ctx.moveTo(s, -s); ctx.lineTo(-s, s);
        ctx.stroke();
        break;
      }
      case "rotate": {
        ctx.strokeStyle = "#0066cc";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        // arc from ~210° to ~510° (sweeps about 300°)
        ctx.arc(0, 0, 9, Math.PI * 7 / 6, Math.PI * 17 / 6);
        ctx.stroke();
        // arrowhead at end of arc
        const a = Math.PI * 17 / 6;
        const ex = 9 * Math.cos(a), ey = 9 * Math.sin(a);
        ctx.fillStyle = "#0066cc";
        // Tangent direction at end
        const tx = -Math.sin(a), ty = Math.cos(a);
        const nx = Math.cos(a), ny = Math.sin(a);
        const head = 5;
        ctx.beginPath();
        ctx.moveTo(ex + tx * head, ey + ty * head);
        ctx.lineTo(ex - tx * 0 + nx * head * 0.7, ey + ny * head * 0.7);
        ctx.lineTo(ex - tx * head * 0.6 - nx * head * 0.3, ey - ty * head * 0.6 - ny * head * 0.3);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "scale": {
        ctx.strokeStyle = "#202020";
        ctx.lineWidth = 1.4;
        ctx.strokeRect(-10, -10, 9, 9);
        ctx.strokeRect(-1, -1, 11, 11);
        // double-headed arrow from inner corner of small square (1,1)
        // to its corresponding corner in the big square (-1,-1)
        ctx.beginPath();
        ctx.moveTo(-1, -1);
        ctx.lineTo(1, 1);
        ctx.stroke();
        // arrowheads
        ctx.fillStyle = "#202020";
        ctx.beginPath();
        ctx.moveTo(-1, -1); ctx.lineTo(-4, -1); ctx.lineTo(-1, -4); ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(1, 1); ctx.lineTo(4, 1); ctx.lineTo(1, 4); ctx.closePath();
        ctx.fill();
        break;
      }
      case "duplicate": {
        // Two overlapping page outlines — bottom layer drawn first, top layer
        // offset up-left so it reads as "make a copy".
        ctx.strokeStyle = "#0a7a3a";
        ctx.fillStyle = "white";
        ctx.lineWidth = 1.6;
        ctx.lineJoin = "miter";
        // Bottom rect.
        ctx.beginPath();
        ctx.rect(-2, -2, 10, 10);
        ctx.fill();
        ctx.stroke();
        // Top rect (offset up-left).
        ctx.beginPath();
        ctx.rect(-7, -7, 10, 10);
        ctx.fill();
        ctx.stroke();
        // Plus sign centered in the top rect at (-2, -2).
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-2, -5); ctx.lineTo(-2, 1);
        ctx.moveTo(-5, -2); ctx.lineTo(1, -2);
        ctx.stroke();
        break;
      }
    }
  }
}
