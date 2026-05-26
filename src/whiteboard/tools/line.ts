import type { Tool, ToolContext } from "./tool";
import { eventCanvasPoint } from "./tool";
import { newVectorId, type LineVector } from "../vectors";
import { snap } from "../view";

let current: LineVector | null = null;

function cancel(ctx: ToolContext): void {
  current = null;
  ctx.state.inProgress = null;
  ctx.invalidate();
}

export const lineTool: Tool = {
  id: "line",
  cursor: "crosshair",
  onPointerDown(e, ctx) {
    const world = snap(ctx.state.view.pixelsToWorld(eventCanvasPoint(e)), ctx.state.snapToGrid);
    current = {
      id: newVectorId(),
      kind: "line",
      author: ctx.getMyId(),
      color: ctx.state.color,
      thickness: ctx.state.thickness,
      createdAt: Date.now(),
      a: world, b: world,
    };
    ctx.state.inProgress = current;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    ctx.invalidate();
  },
  onPointerMove(e, ctx) {
    if (!current) return;
    current.b = snap(ctx.state.view.pixelsToWorld(eventCanvasPoint(e)), ctx.state.snapToGrid);
    ctx.invalidate();
  },
  onPointerUp(_e, ctx) {
    if (!current) return;
    const final = current;
    current = null;
    ctx.state.inProgress = null;
    const dx = final.b.x - final.a.x;
    const dy = final.b.y - final.a.y;
    if (dx * dx + dy * dy > 4) ctx.commitVector(final);
    ctx.invalidate();
  },
  onDeselect: cancel,
};
