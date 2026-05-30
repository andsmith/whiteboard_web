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
    // fontSize is ALWAYS world-space; the rendering path always uses
    // fontSize * zoom. The two scaling modes differ only in how the stored
    // world-fontSize is chosen at create time:
    //
    //   - Constant Text Scale (default): world-fontSize = dial * 3. Same
    //     dial value → same world size regardless of authoring zoom, so two
    //     "scale 12" labels authored at different zoom levels look the same
    //     size relative to other vectors. The ×3 is the user-requested
    //     bump so "scale 12" renders comfortably (≈ 36 px at zoom 1).
    //   - Text Scales with Zoom: world-fontSize = dial / zoom. The dial
    //     reads as screen pixels at the current zoom, but world size depends
    //     on authoring zoom so different-zoom-authored text differs visually.
    const fs = ctx.state.constantTextScale
      ? ctx.state.fontSize * 3
      : ctx.state.fontSize / Math.max(0.0001, ctx.state.view.zoom);
    const v: TextVector = {
      id: newVectorId(),
      kind: "text",
      author: ctx.getMyId(),
      color: ctx.state.color,
      thickness: 1,
      createdAt: Date.now(),
      pos: world,
      text: "",
      fontSize: fs,
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
