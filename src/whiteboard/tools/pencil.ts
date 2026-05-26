import type { Tool, ToolContext } from "./tool";
import { eventCanvasPoint } from "./tool";
import type { PencilVector } from "../vectors";
import { newVectorId } from "../vectors";

let current: PencilVector | null = null;

function cancel(ctx: ToolContext): void {
  current = null;
  ctx.state.inProgress = null;
  ctx.invalidate();
}

export const pencilTool: Tool = {
  id: "pencil",
  cursor: "crosshair",
  onPointerDown(e, ctx) {
    const screen = eventCanvasPoint(e);
    const world = ctx.state.view.pixelsToWorld(screen);
    current = {
      id: newVectorId(),
      kind: "pencil",
      author: ctx.getMyId(),
      color: ctx.state.color,
      thickness: ctx.state.thickness,
      createdAt: Date.now(),
      points: [world],
    };
    ctx.state.inProgress = current;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    ctx.invalidate();
  },
  onPointerMove(e, ctx) {
    if (!current) return;
    const world = ctx.state.view.pixelsToWorld(eventCanvasPoint(e));
    current.points.push(world);
    ctx.invalidate();
  },
  onPointerUp(_e, ctx) {
    if (!current) return;
    const final = current;
    current = null;
    ctx.state.inProgress = null;
    if (final.points.length >= 2) ctx.commitVector(final);
    ctx.invalidate();
  },
  onDeselect: cancel,
};
