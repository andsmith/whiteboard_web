import type { Tool, ToolContext } from "./tool";
import { eventCanvasPoint } from "./tool";
import { newVectorId, type TextVector } from "../vectors";
import { snap } from "../view";

function commitCurrent(ctx: ToolContext): void {
  const v = ctx.state.textEditing;
  if (!v) return;
  if (v.text.length > 0) {
    ctx.commitVector(v);
  }
  ctx.state.textEditing = null;
  ctx.invalidate();
}

export const textTool: Tool = {
  id: "text",
  cursor: "text",
  onPointerDown(e, ctx) {
    if (e.button !== 0) return;
    commitCurrent(ctx);
    const world = snap(ctx.state.view.pixelsToWorld(eventCanvasPoint(e)), ctx.state.snapToGrid);
    // state.fontSize is "screen pixels at the current zoom level". The
    // vector stores world-space size, so render = world * zoom yields the
    // chosen screen size for as long as the user stays at this zoom.
    const v: TextVector = {
      id: newVectorId(),
      kind: "text",
      author: ctx.getMyId(),
      color: ctx.state.color,
      thickness: 1,
      createdAt: Date.now(),
      pos: world,
      text: "",
      fontSize: ctx.state.fontSize / Math.max(0.0001, ctx.state.view.zoom),
    };
    ctx.state.textEditing = v;
    ctx.invalidate();
  },
  onKeyDown(e, ctx) {
    const v = ctx.state.textEditing;
    if (!v) return;
    if (e.key === "Escape") {
      e.preventDefault();
      commitCurrent(ctx);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      v.text += "\n";
      ctx.invalidate();
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      v.text = v.text.slice(0, -1);
      ctx.invalidate();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      v.text += "    ";
      ctx.invalidate();
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      v.text += e.key;
      ctx.invalidate();
    }
  },
  onDeselect(ctx) {
    commitCurrent(ctx);
  },
};
