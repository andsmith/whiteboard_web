import type { Tool, ToolContext } from "./tool";
import { eventCanvasPoint } from "./tool";
import { newVectorId, type RectVector } from "../vectors";

let current: RectVector | null = null;

function cancel(ctx: ToolContext): void {
  current = null;
  ctx.state.inProgress = null;
  ctx.invalidate();
}

export const rectTool: Tool = {
  id: "rect",
  cursor: "crosshair",
  onPointerDown(e, ctx) {
    const world = ctx.state.view.pixelsToWorld(eventCanvasPoint(e));
    current = {
      id: newVectorId(),
      kind: "rect",
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
    current.b = ctx.state.view.pixelsToWorld(eventCanvasPoint(e));
    ctx.invalidate();
  },
  onPointerUp(_e, ctx) {
    if (!current) return;
    const final = current;
    current = null;
    ctx.state.inProgress = null;
    if (Math.abs(final.b.x - final.a.x) > 2 || Math.abs(final.b.y - final.a.y) > 2) {
      ctx.commitVector(final);
    }
    ctx.invalidate();
  },
  onDeselect: cancel,
};
