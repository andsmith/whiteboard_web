import type { Tool } from "./tool";
import { eventCanvasPoint } from "./tool";
import { newVectorId, type TextVector } from "../vectors";
import { snap } from "../view";

export const textTool: Tool = {
  id: "text",
  cursor: "text",
  onPointerDown(e, ctx) {
    const text = window.prompt("Text:");
    if (text === null || text === "") return;
    const world = snap(ctx.state.view.pixelsToWorld(eventCanvasPoint(e)), ctx.state.snapToGrid);
    const v: TextVector = {
      id: newVectorId(),
      kind: "text",
      author: ctx.getMyId(),
      color: ctx.state.color,
      thickness: 1,
      createdAt: Date.now(),
      pos: world,
      text,
      fontSize: ctx.state.fontSize,
    };
    ctx.commitVector(v);
    ctx.invalidate();
  },
};
