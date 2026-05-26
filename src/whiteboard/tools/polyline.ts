import type { Tool, ToolContext } from "./tool";
import { eventCanvasPoint } from "./tool";
import { newVectorId, type PolylineVector } from "../vectors";
import { snap, type Point } from "../view";

let committed: Point[] = [];
let cursorWorld: Point | null = null;
let proto: Omit<PolylineVector, "points"> | null = null;

function setInProgress(ctx: ToolContext): void {
  if (!proto) {
    ctx.state.inProgress = null;
    return;
  }
  const previewPoints = cursorWorld ? [...committed, cursorWorld] : [...committed];
  ctx.state.inProgress = { ...proto, points: previewPoints };
}

function cancel(ctx: ToolContext): void {
  committed = [];
  cursorWorld = null;
  proto = null;
  ctx.state.inProgress = null;
  ctx.invalidate();
}

function finalize(ctx: ToolContext): void {
  if (!proto || committed.length < 2) {
    cancel(ctx);
    return;
  }
  ctx.commitVector({ ...proto, points: committed.slice() });
  cancel(ctx);
}

export const polylineTool: Tool = {
  id: "polyline",
  cursor: "crosshair",
  onPointerDown(e, ctx) {
    const world = snap(ctx.state.view.pixelsToWorld(eventCanvasPoint(e)), ctx.state.snapToGrid);
    // Double-click on second-or-later vertex finalizes
    if (proto && committed.length >= 2 && e.detail >= 2) {
      finalize(ctx);
      return;
    }
    if (!proto) {
      proto = {
        id: newVectorId(),
        kind: "polyline",
        author: ctx.getMyId(),
        color: ctx.state.color,
        thickness: ctx.state.thickness,
        createdAt: Date.now(),
      };
    }
    committed.push(world);
    cursorWorld = world;
    setInProgress(ctx);
    ctx.invalidate();
  },
  onPointerMove(e, ctx) {
    if (!proto) return;
    cursorWorld = snap(ctx.state.view.pixelsToWorld(eventCanvasPoint(e)), ctx.state.snapToGrid);
    setInProgress(ctx);
    ctx.invalidate();
  },
  onMiddleClick(_e, ctx) {
    finalize(ctx);
  },
  onKeyDown(e, ctx) {
    if (e.key === "Enter") {
      e.preventDefault();
      finalize(ctx);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel(ctx);
    }
  },
  onDeselect: cancel,
};
