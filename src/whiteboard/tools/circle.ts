import type { Tool, ToolContext } from "./tool";
import { eventCanvasPoint } from "./tool";
import { newVectorId, type CircleVector } from "../vectors";

let current: CircleVector | null = null;
let centerWorld: { x: number; y: number } | null = null;

function cancel(ctx: ToolContext): void {
  current = null;
  centerWorld = null;
  ctx.state.inProgress = null;
  ctx.invalidate();
}

export const circleTool: Tool = {
  id: "circle",
  cursor: "crosshair",
  onPointerDown(e, ctx) {
    centerWorld = ctx.state.view.pixelsToWorld(eventCanvasPoint(e));
    current = {
      id: newVectorId(),
      kind: "circle",
      author: ctx.getMyId(),
      color: ctx.state.color,
      thickness: ctx.state.thickness,
      createdAt: Date.now(),
      center: centerWorld,
      radius: 0,
    };
    ctx.state.inProgress = current;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    ctx.invalidate();
  },
  onPointerMove(e, ctx) {
    if (!current || !centerWorld) return;
    const w = ctx.state.view.pixelsToWorld(eventCanvasPoint(e));
    const dx = w.x - centerWorld.x;
    const dy = w.y - centerWorld.y;
    current.radius = Math.sqrt(dx * dx + dy * dy);
    ctx.invalidate();
  },
  onPointerUp(_e, ctx) {
    if (!current) return;
    const final = current;
    current = null;
    centerWorld = null;
    ctx.state.inProgress = null;
    if (final.radius > 2) ctx.commitVector(final);
    ctx.invalidate();
  },
  onDeselect: cancel,
};
