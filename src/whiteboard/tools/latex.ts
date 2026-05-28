import type { Tool, ToolContext } from "./tool";
import { eventCanvasPoint } from "./tool";
import { newVectorId, type LatexVector } from "../vectors";
import { snap } from "../view";

/** Commit the in-progress latex vector (Shift+Enter equivalent) if non-empty.
 * Empty edits are discarded. Also clears editingOriginal so the cancel path
 * in latex-input.ts doesn't re-add a now-replaced vector. */
function commitCurrent(ctx: ToolContext): void {
  const v = ctx.state.latexEditing;
  if (!v) return;
  if (v.text.length > 0) {
    ctx.commitVector(v);
  }
  ctx.state.latexEditing = null;
  ctx.state.editingOriginal = null;
  ctx.invalidate();
}

export const latexTool: Tool = {
  id: "latex",
  cursor: "text",
  onPointerDown(e, ctx) {
    if (e.button !== 0) return;
    // Clicking again while editing commits the current one and starts a new
    // one at the new location.
    commitCurrent(ctx);
    const world = snap(ctx.state.view.pixelsToWorld(eventCanvasPoint(e)), ctx.state.snapToGrid);
    const v: LatexVector = {
      id: newVectorId(),
      kind: "latex",
      author: ctx.getMyId(),
      color: ctx.state.color,
      thickness: 1,
      createdAt: Date.now(),
      pos: world,
      text: "",
      fontSize: ctx.state.fontSize / Math.max(0.0001, ctx.state.view.zoom),
    };
    ctx.state.latexEditing = v;
    ctx.state.editingOriginal = null;
    ctx.invalidate();
  },
  onDeselect(ctx) {
    // Switching tools mid-edit commits whatever has been typed so far.
    commitCurrent(ctx);
  },
};
