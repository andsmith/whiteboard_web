import type { Tool, ToolContext } from "./tool";
import { eventCanvasPoint } from "./tool";
import type { Vector, TextVector, LatexVector } from "../vectors";
import { snap, snapAngle, type Point } from "../view";
import { renderedBboxPx, bboxIntersects, findHit, type Bbox } from "../hit-test";
import { translateVector, scaleVector, rotateVector, duplicateVector } from "../vector-ops";
import type { Op } from "../vector-store";
import { getRadialIconPositions, type RadialIconName } from "./modify";

type Mode = "idle" | "boxing" | "moving" | "menuOpen" | "rotating" | "scaling" | "placingDuplicate";

let mode: Mode = "idle";
let originals: Map<string, Vector> = new Map();
let dragStartWorld: Point | null = null;
let anchorWorld: Point | null = null;
let menuPos: Point | null = null;
let rotateStartAngle = 0;
let scaleStartY = 0;

/** Mid-placement duplicate state (mirrors the same in modify.ts but kept per-tool). */
let dupVectors: Vector[] = [];
let lastDragWorld: Point | null = null;

const RADIAL_HIT_RADIUS = 24;

function getCanvasCtx(): CanvasRenderingContext2D | undefined {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement | null;
  return canvas?.getContext("2d") ?? undefined;
}

function recomputeCandidates(ctx: ToolContext, startScreen: Point, endScreen: Point): Set<string> {
  const selBbox: Bbox = {
    minX: Math.min(startScreen.x, endScreen.x),
    maxX: Math.max(startScreen.x, endScreen.x),
    minY: Math.min(startScreen.y, endScreen.y),
    maxY: Math.max(startScreen.y, endScreen.y),
  };
  const result = new Set<string>();
  const canvasCtx = getCanvasCtx();
  for (const v of ctx.state.store.vectors.values()) {
    if (bboxIntersects(renderedBboxPx(v, ctx.state.view, canvasCtx), selBbox)) {
      result.add(v.id);
    }
  }
  return result;
}

function clickedSelectedVectorId(ctx: ToolContext, screenPt: Point): string | null {
  if (ctx.state.selectedIds.size === 0) return null;
  const canvasCtx = getCanvasCtx();
  const selected: Vector[] = [];
  for (const id of ctx.state.selectedIds) {
    const v = ctx.state.store.vectors.get(id);
    if (v) selected.push(v);
  }
  return findHit(selected, screenPt, ctx.state.view, canvasCtx)?.id ?? null;
}

function captureOriginals(ctx: ToolContext): void {
  originals.clear();
  for (const id of ctx.state.selectedIds) {
    const v = ctx.state.store.vectors.get(id);
    if (v) originals.set(id, v);
  }
}

function commitTransformBatch(ctx: ToolContext): void {
  const ops: Op[] = [];
  for (const [id, before] of originals) {
    const after = ctx.state.store.vectors.get(id);
    if (after && after !== before) ops.push({ kind: "replace", before, after });
  }
  if (ops.length > 0) ctx.state.store.recordOnly({ kind: "batch", ops });
  originals.clear();
}

function revertTransform(ctx: ToolContext): void {
  for (const [id, before] of originals) {
    const current = ctx.state.store.vectors.get(id);
    if (current) ctx.state.store.apply({ kind: "replace", before: current, after: before });
  }
  originals.clear();
}

function openRadial(ctx: ToolContext, screenPt: Point, pointerId: number, target: EventTarget | null): void {
  mode = "menuOpen";
  menuPos = screenPt;
  anchorWorld = ctx.state.view.pixelsToWorld(screenPt);
  ctx.state.radialMenu = { pos: screenPt, targetId: "", hoverIcon: null };
  (target as Element | null)?.setPointerCapture?.(pointerId);
  ctx.invalidate();
}

function hitTestIcon(menuPos: Point, cursor: Point): RadialIconName | null {
  const positions = getRadialIconPositions(menuPos);
  for (const name of ["rotate", "scale", "delete", "duplicate", "edit"] as const) {
    const p = positions[name];
    if (Math.hypot(cursor.x - p.x, cursor.y - p.y) <= RADIAL_HIT_RADIUS) return name;
  }
  return null;
}

/** True if the current selection is exactly one text or latex vector. */
function singleEditableSelected(ctx: ToolContext): TextVector | LatexVector | null {
  if (ctx.state.selectedIds.size !== 1) return null;
  const id = ctx.state.selectedIds.values().next().value;
  if (!id) return null;
  const v = ctx.state.store.vectors.get(id);
  if (!v) return null;
  if (v.kind === "text") return v;
  if (v.kind === "latex") return v;
  return null;
}

function startPlacingDuplicateSelection(ctx: ToolContext, screenPt: Point): void {
  const author = ctx.getMyId();
  const ids = Array.from(ctx.state.selectedIds);
  dupVectors = [];
  for (const id of ids) {
    const v = ctx.state.store.vectors.get(id);
    if (v) dupVectors.push(duplicateVector(v, author));
  }
  if (dupVectors.length === 0) { mode = "idle"; ctx.invalidate(); return; }
  lastDragWorld = ctx.state.view.pixelsToWorld(screenPt);
  ctx.state.placingDuplicates = dupVectors.slice();
  mode = "placingDuplicate";
  ctx.invalidate();
}

function commitPlacingDuplicate(ctx: ToolContext): void {
  if (dupVectors.length === 0) { mode = "idle"; ctx.state.placingDuplicates = null; ctx.invalidate(); return; }
  const ops: Op[] = dupVectors.map((v) => ({ kind: "add", vector: v }));
  ctx.state.store.applyAndRecord(ops.length === 1 ? ops[0]! : { kind: "batch", ops });
  // Select the freshly-placed copies so the user can immediately keep editing them.
  ctx.state.selectedIds = new Set(dupVectors.map((v) => v.id));
  dupVectors = [];
  lastDragWorld = null;
  ctx.state.placingDuplicates = null;
  mode = "idle";
  ctx.invalidate();
}

function cancelPlacingDuplicate(ctx: ToolContext): void {
  dupVectors = [];
  lastDragWorld = null;
  ctx.state.placingDuplicates = null;
  mode = "idle";
  ctx.invalidate();
}

function deleteSelection(ctx: ToolContext): void {
  const ops: Op[] = [];
  for (const id of ctx.state.selectedIds) {
    const v = ctx.state.store.vectors.get(id);
    if (v) ops.push({ kind: "delete", vector: v });
  }
  if (ops.length > 0) ctx.state.store.applyAndRecord({ kind: "batch", ops });
  ctx.state.selectedIds.clear();
}

export const selectTool: Tool = {
  id: "select",
  cursor: "default",

  onPointerDown(e, ctx) {
    if (e.button !== 0) return;
    const screenPt = eventCanvasPoint(e);

    // Placing-duplicate: left-click anywhere commits the placement.
    if (mode === "placingDuplicate") {
      e.preventDefault();
      commitPlacingDuplicate(ctx);
      return;
    }

    // Click to commit an in-progress rotate or scale.
    if (mode === "rotating" || mode === "scaling") {
      commitTransformBatch(ctx);
      mode = "idle";
      ctx.invalidate();
      return;
    }

    // Shift+click on a selected vector → radial menu over the selection.
    if (e.shiftKey && ctx.state.selectedIds.size > 0 && clickedSelectedVectorId(ctx, screenPt)) {
      e.preventDefault();
      openRadial(ctx, screenPt, e.pointerId, e.target);
      return;
    }

    // Click on a selected vector → start moving the whole selection.
    if (clickedSelectedVectorId(ctx, screenPt)) {
      mode = "moving";
      captureOriginals(ctx);
      dragStartWorld = ctx.state.view.pixelsToWorld(screenPt);
      (e.target as Element).setPointerCapture?.(e.pointerId);
      ctx.invalidate();
      return;
    }

    // Otherwise: start a new selection box (clearing any prior selection).
    mode = "boxing";
    ctx.state.selectedIds.clear();
    ctx.state.selectionBox = {
      startScreen: screenPt,
      endScreen: screenPt,
      candidates: new Set(),
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
    ctx.invalidate();
  },

  onMiddleClick(e, ctx) {
    if (mode === "rotating" || mode === "scaling") {
      commitTransformBatch(ctx);
      mode = "idle";
      ctx.invalidate();
      return;
    }
    if (ctx.state.selectedIds.size === 0) return;
    openRadial(ctx, eventCanvasPoint(e), e.pointerId, e.target);
  },

  onPointerMove(e, ctx) {
    const screenPt = eventCanvasPoint(e);

    if (mode === "placingDuplicate") {
      if (!lastDragWorld) return;
      const worldNow = ctx.state.view.pixelsToWorld(screenPt);
      const targetClick = e.shiftKey ? snap(worldNow, true) : worldNow;
      const dx = targetClick.x - lastDragWorld.x;
      const dy = targetClick.y - lastDragWorld.y;
      lastDragWorld = targetClick;
      for (let i = 0; i < dupVectors.length; i++) {
        dupVectors[i] = translateVector(dupVectors[i]!, dx, dy);
      }
      ctx.state.placingDuplicates = dupVectors.slice();
      ctx.invalidate();
      return;
    }

    if (mode === "boxing" && ctx.state.selectionBox) {
      ctx.state.selectionBox.endScreen = screenPt;
      ctx.state.selectionBox.candidates = recomputeCandidates(
        ctx, ctx.state.selectionBox.startScreen, screenPt,
      );
      ctx.invalidate();
      return;
    }

    if (mode === "moving" && dragStartWorld) {
      // Absolute drag against captured originals; shift snaps the click-point
      // to the grid so the whole selection lands cleanly.
      const worldNow = ctx.state.view.pixelsToWorld(screenPt);
      const targetClick = e.shiftKey ? snap(worldNow, true) : worldNow;
      const dx = targetClick.x - dragStartWorld.x;
      const dy = targetClick.y - dragStartWorld.y;
      for (const [id, orig] of originals) {
        const moved = translateVector(orig, dx, dy);
        const current = ctx.state.store.vectors.get(id);
        if (current) ctx.state.store.apply({ kind: "replace", before: current, after: moved });
      }
      ctx.invalidate();
      return;
    }

    if (mode === "menuOpen" && menuPos) {
      const icon = hitTestIcon(menuPos, screenPt);
      if (ctx.state.radialMenu && ctx.state.radialMenu.hoverIcon !== icon) {
        ctx.state.radialMenu = { ...ctx.state.radialMenu, hoverIcon: icon };
        ctx.invalidate();
      }
      return;
    }

    if (mode === "rotating" && anchorWorld) {
      const currentWorld = ctx.state.view.pixelsToWorld(screenPt);
      const angle = Math.atan2(currentWorld.y - anchorWorld.y, currentWorld.x - anchorWorld.x);
      let delta = angle - rotateStartAngle;
      if (e.shiftKey) delta = snapAngle(delta, true); // snap to 45°
      for (const [id, orig] of originals) {
        const rotated = rotateVector(orig, delta, anchorWorld);
        const current = ctx.state.store.vectors.get(id);
        if (current) ctx.state.store.apply({ kind: "replace", before: current, after: rotated });
      }
      ctx.invalidate();
      return;
    }

    if (mode === "scaling" && anchorWorld) {
      const dy = scaleStartY - screenPt.y;
      const factor = Math.max(0.05, Math.pow(1.01, dy));
      for (const [id, orig] of originals) {
        const scaled = scaleVector(orig, factor, anchorWorld);
        const current = ctx.state.store.vectors.get(id);
        if (current) ctx.state.store.apply({ kind: "replace", before: current, after: scaled });
      }
      ctx.invalidate();
      return;
    }
  },

  onPointerUp(e, ctx) {
    if (mode === "boxing" && ctx.state.selectionBox) {
      ctx.state.selectedIds = new Set(ctx.state.selectionBox.candidates);
      ctx.state.selectionBox = null;
      mode = "idle";
      ctx.invalidate();
      return;
    }

    if (mode === "moving") {
      commitTransformBatch(ctx);
      mode = "idle";
      dragStartWorld = null;
      ctx.invalidate();
      return;
    }

    if (mode === "menuOpen" && menuPos) {
      const screenPt = eventCanvasPoint(e);
      const icon = hitTestIcon(menuPos, screenPt);
      ctx.state.radialMenu = null;
      if (icon === "delete") {
        deleteSelection(ctx);
        mode = "idle";
        ctx.invalidate();
      } else if (icon === "rotate" && anchorWorld) {
        captureOriginals(ctx);
        const cw = ctx.state.view.pixelsToWorld(screenPt);
        rotateStartAngle = Math.atan2(cw.y - anchorWorld.y, cw.x - anchorWorld.x);
        mode = "rotating";
        ctx.invalidate();
      } else if (icon === "scale") {
        captureOriginals(ctx);
        scaleStartY = screenPt.y;
        mode = "scaling";
        ctx.invalidate();
      } else if (icon === "duplicate") {
        (e.target as Element | null)?.releasePointerCapture?.(e.pointerId);
        startPlacingDuplicateSelection(ctx, screenPt);
      } else if (icon === "edit") {
        const v = singleEditableSelected(ctx);
        if (v) {
          (e.target as Element | null)?.releasePointerCapture?.(e.pointerId);
          // Remove from store so only the in-progress copy renders; stash
          // the original so Escape can restore it.
          ctx.state.editingOriginal = v;
          ctx.state.store.apply({ kind: "delete", vector: v });
          if (v.kind === "text") {
            ctx.state.textEditing = { ...v, text: v.text };
            mode = "idle";
            ctx.state.selectedIds.clear();
            ctx.switchTool("text");
          } else {
            ctx.state.latexEditing = { ...v, text: v.text };
            mode = "idle";
            ctx.state.selectedIds.clear();
            ctx.switchTool("latex");
          }
        } else {
          mode = "idle";
          ctx.invalidate();
        }
      } else {
        mode = "idle";
        ctx.invalidate();
      }
      return;
    }
  },

  onKeyDown(e, ctx) {
    if (e.key === "Escape") {
      if (mode === "rotating" || mode === "scaling") {
        revertTransform(ctx);
        mode = "idle";
        ctx.invalidate();
        e.preventDefault();
      } else if (mode === "menuOpen") {
        ctx.state.radialMenu = null;
        mode = "idle";
        ctx.invalidate();
        e.preventDefault();
      } else if (mode === "placingDuplicate") {
        cancelPlacingDuplicate(ctx);
        e.preventDefault();
      } else if (ctx.state.selectedIds.size > 0) {
        ctx.state.selectedIds.clear();
        ctx.invalidate();
        e.preventDefault();
      }
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && mode === "idle" && ctx.state.selectedIds.size > 0) {
      deleteSelection(ctx);
      ctx.invalidate();
      e.preventDefault();
    }
  },

  onDeselect(ctx) {
    if (mode === "rotating" || mode === "scaling") revertTransform(ctx);
    mode = "idle";
    originals.clear();
    dragStartWorld = null;
    anchorWorld = null;
    menuPos = null;
    dupVectors = [];
    lastDragWorld = null;
    ctx.state.placingDuplicates = null;
    ctx.state.selectionBox = null;
    // NOTE: do NOT clear selectedIds here. Selection persists across tool
    // switches so the global Delete/Backspace handler in main.ts can act on
    // it from any tool. Press Escape inside the select tool to clear.
    ctx.state.radialMenu = null;
    ctx.invalidate();
  },
};
