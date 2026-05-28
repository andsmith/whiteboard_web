import type { Tool, ToolContext } from "./tool";
import { eventCanvasPoint } from "./tool";
import type { Vector } from "../vectors";
import type { Point } from "../view";
import { renderedBboxPx, bboxIntersects, findHit, type Bbox } from "../hit-test";
import { translateVector, scaleVector, rotateVector } from "../vector-ops";
import type { Op } from "../vector-store";
import { getRadialIconPositions } from "./modify";

type Mode = "idle" | "boxing" | "moving" | "menuOpen" | "rotating" | "scaling";

let mode: Mode = "idle";
let originals: Map<string, Vector> = new Map();
let dragLastWorld: Point | null = null;
let anchorWorld: Point | null = null;
let menuPos: Point | null = null;
let rotateStartAngle = 0;
let scaleStartY = 0;

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

type RadialIcon = "delete" | "rotate" | "scale";
function hitTestIcon(menuPos: Point, cursor: Point): RadialIcon | null {
  const positions = getRadialIconPositions(menuPos);
  for (const name of ["delete", "rotate", "scale"] as const) {
    const p = positions[name];
    if (Math.hypot(cursor.x - p.x, cursor.y - p.y) <= RADIAL_HIT_RADIUS) return name;
  }
  return null;
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
      dragLastWorld = ctx.state.view.pixelsToWorld(screenPt);
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

    if (mode === "boxing" && ctx.state.selectionBox) {
      ctx.state.selectionBox.endScreen = screenPt;
      ctx.state.selectionBox.candidates = recomputeCandidates(
        ctx, ctx.state.selectionBox.startScreen, screenPt,
      );
      ctx.invalidate();
      return;
    }

    if (mode === "moving" && dragLastWorld) {
      const currentWorld = ctx.state.view.pixelsToWorld(screenPt);
      const dx = currentWorld.x - dragLastWorld.x;
      const dy = currentWorld.y - dragLastWorld.y;
      for (const id of ctx.state.selectedIds) {
        const current = ctx.state.store.vectors.get(id);
        if (!current) continue;
        ctx.state.store.apply({ kind: "replace", before: current, after: translateVector(current, dx, dy) });
      }
      dragLastWorld = currentWorld;
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
      const delta = angle - rotateStartAngle;
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
      dragLastWorld = null;
      ctx.invalidate();
      return;
    }

    if (mode === "menuOpen" && menuPos) {
      const icon = hitTestIcon(menuPos, eventCanvasPoint(e));
      ctx.state.radialMenu = null;
      if (icon === "delete") {
        deleteSelection(ctx);
        mode = "idle";
        ctx.invalidate();
      } else if (icon === "rotate" && anchorWorld) {
        captureOriginals(ctx);
        const cw = ctx.state.view.pixelsToWorld(eventCanvasPoint(e));
        rotateStartAngle = Math.atan2(cw.y - anchorWorld.y, cw.x - anchorWorld.x);
        mode = "rotating";
        ctx.invalidate();
      } else if (icon === "scale") {
        captureOriginals(ctx);
        scaleStartY = eventCanvasPoint(e).y;
        mode = "scaling";
        ctx.invalidate();
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
    dragLastWorld = null;
    anchorWorld = null;
    menuPos = null;
    ctx.state.selectionBox = null;
    ctx.state.selectedIds.clear();
    ctx.state.radialMenu = null;
    ctx.invalidate();
  },
};
