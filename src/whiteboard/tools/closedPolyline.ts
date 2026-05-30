import type { Tool, ToolContext } from "./tool";
import { eventCanvasPoint } from "./tool";
import { newVectorId, type PolylineVector } from "../vectors";
import { snap, type Point } from "../view";

// Mirror of polyline.ts but commits with `closed: true`. Kept as its own tool
// instance so each can have independent in-progress state without one tool's
// pending vertices leaking into the other.
let committed: Point[] = [];
let cursorWorld: Point | null = null;
let proto: Omit<PolylineVector, "points"> | null = null;

function setInProgress(ctx: ToolContext): void {
  if (!proto) {
    ctx.state.inProgress = null;
    return;
  }
  const previewPoints = cursorWorld ? [...committed, cursorWorld] : [...committed];
  // Render the in-progress preview as a closed shape too so the user sees
  // what they'll get on commit.
  ctx.state.inProgress = { ...proto, points: previewPoints, closed: true };
}

function cancel(ctx: ToolContext): void {
  committed = [];
  cursorWorld = null;
  proto = null;
  ctx.state.inProgress = null;
  ctx.invalidate();
}

function finalize(ctx: ToolContext): void {
  if (!proto || committed.length < 3) {
    // A closed polyline needs at least 3 distinct points to make sense.
    cancel(ctx);
    return;
  }
  ctx.commitVector({ ...proto, points: committed.slice(), closed: true });
  cancel(ctx);
}

export const closedPolylineTool: Tool = {
  id: "closed-polyline",
  cursor: "crosshair",
  onPointerDown(e, ctx) {
    const world = snap(ctx.state.view.pixelsToWorld(eventCanvasPoint(e)), ctx.state.snapToGrid);
    if (proto && committed.length >= 3 && e.detail >= 2) {
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
  onDoubleClick(_e, ctx) {
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
