import type { Tool, ToolContext } from "./tool";
import { eventCanvasPoint } from "./tool";
import { findHit } from "../hit-test";
import { translateVector, scaleVector, rotateVector, duplicateVector, getCenter } from "../vector-ops";
import type { Vector } from "../vectors";
import type { Op } from "../vector-store";
import { snap, snapAngle, type Point } from "../view";

type Mode = "idle" | "moving" | "menuOpen" | "rotating" | "scaling" | "placingDuplicate";

let mode: Mode = "idle";
/** Snapshot of every selected vector at the moment the action started, so
 * the live drag can compute absolute deltas and the commit step can record
 * proper replace ops. */
let originals: Map<string, Vector> = new Map();
/** World-space position of the initial click — used for absolute drag math. */
let dragStartWorld: Point | null = null;
/** Screen-space position where the radial menu was opened. */
let menuPos: Point | null = null;
/** Group anchor for rotate / scale: centroid of original group centers. */
let groupAnchorWorld: Point | null = null;

let rotateStartAngle = 0;
let scaleStartY = 0;

/** Mid-placement duplicate state. The vectors are NOT in the store; they
 * render via state.placingDuplicates. lastDragWorld is the prior cursor
 * world-position so we can translate by deltas as the mouse moves. */
let dupVectors: Vector[] = [];
let lastDragWorld: Point | null = null;

const RADIAL_RADIUS = 56;
const RADIAL_HIT_RADIUS = 24;

/** Five icons evenly spaced 72° apart around the cursor, starting at top
 * (rotate) and going clockwise. The order here defines the angular order. */
export const RADIAL_NAMES = ["rotate", "scale", "delete", "duplicate", "edit"] as const;
export type RadialIconName = (typeof RADIAL_NAMES)[number];

export function getRadialIconPositions(center: Point): Record<RadialIconName, Point> {
  const out: Record<string, Point> = {};
  const N = RADIAL_NAMES.length;
  for (let i = 0; i < N; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / N;
    out[RADIAL_NAMES[i]!] = {
      x: center.x + RADIAL_RADIUS * Math.cos(angle),
      y: center.y + RADIAL_RADIUS * Math.sin(angle),
    };
  }
  return out as Record<RadialIconName, Point>;
}

function hitTestIcon(menuPos: Point, cursor: Point): RadialIconName | null {
  const positions = getRadialIconPositions(menuPos);
  for (const name of RADIAL_NAMES) {
    const p = positions[name];
    if (Math.hypot(cursor.x - p.x, cursor.y - p.y) <= RADIAL_HIT_RADIUS) return name;
  }
  return null;
}

function canEditKind(kind: string): boolean {
  return kind === "text" || kind === "latex";
}

function getCanvasCtx(): CanvasRenderingContext2D | undefined {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement | null;
  return canvas?.getContext("2d") ?? undefined;
}

function reset(ctx: ToolContext): void {
  mode = "idle";
  originals.clear();
  dragStartWorld = null;
  menuPos = null;
  groupAnchorWorld = null;
  dupVectors = [];
  lastDragWorld = null;
  ctx.state.radialMenu = null;
  ctx.state.dragLockedTargetId = null;
  ctx.state.placingDuplicates = null;
  ctx.invalidate();
}

/** Ensure the clicked vector is part of the active selection. If it's not,
 * the selection is REPLACED with just this one vector (matching the user's
 * "modify sets selection like a single-target select-crop" intent). If it
 * IS already selected, the multi-selection is preserved so the whole group
 * gets dragged / transformed. */
function ensureSelectionIncludes(ctx: ToolContext, hit: Vector): void {
  if (!ctx.state.selectedIds.has(hit.id)) {
    ctx.state.selectedIds = new Set([hit.id]);
  }
}

/** Snapshot every currently-selected vector into `originals`. */
function captureOriginals(ctx: ToolContext): void {
  originals.clear();
  for (const id of ctx.state.selectedIds) {
    const v = ctx.state.store.vectors.get(id);
    if (v) originals.set(id, v);
  }
}

/** Group anchor = centroid of selected vectors' bounding-box centers. Used
 * as the pivot for group rotate and group scale. */
function computeGroupAnchor(): Point | null {
  if (originals.size === 0) return null;
  let sx = 0, sy = 0, n = 0;
  for (const v of originals.values()) {
    const c = centerOf(v);
    sx += c.x; sy += c.y; n++;
  }
  return n === 0 ? null : { x: sx / n, y: sy / n };
}

function centerOf(v: Vector): Point {
  return getCenter(v);
}

function startPlacingDuplicate(ctx: ToolContext, screenPt: Point): void {
  const author = ctx.getMyId();
  dupVectors = [];
  for (const v of originals.values()) dupVectors.push(duplicateVector(v, author));
  if (dupVectors.length === 0) { reset(ctx); return; }
  lastDragWorld = ctx.state.view.pixelsToWorld(screenPt);
  ctx.state.placingDuplicates = dupVectors.slice();
  mode = "placingDuplicate";
  ctx.invalidate();
}

function commitPlacingDuplicate(ctx: ToolContext): void {
  if (dupVectors.length === 0) { reset(ctx); return; }
  const ops: Op[] = dupVectors.map((v) => ({ kind: "add", vector: v }));
  ctx.state.store.applyAndRecord(ops.length === 1 ? ops[0]! : { kind: "batch", ops });
  // The freshly-placed copies become the new selection so the user can
  // immediately drag/transform them as a group again.
  ctx.state.selectedIds = new Set(dupVectors.map((v) => v.id));
  reset(ctx);
}

/** Edit only fires when EXACTLY one text/latex vector is selected. */
function tryOpenEdit(ctx: ToolContext): void {
  if (ctx.state.selectedIds.size !== 1) { reset(ctx); return; }
  const id = ctx.state.selectedIds.values().next().value;
  if (!id) { reset(ctx); return; }
  const v = ctx.state.store.vectors.get(id);
  if (!v || !canEditKind(v.kind)) { reset(ctx); return; }
  ctx.state.editingOriginal = v;
  ctx.state.store.apply({ kind: "delete", vector: v });
  if (v.kind === "text") {
    ctx.state.textEditing = { ...v, text: v.text };
    reset(ctx);
    ctx.switchTool("text");
  } else if (v.kind === "latex") {
    ctx.state.latexEditing = { ...v, text: v.text };
    reset(ctx);
    ctx.switchTool("latex");
  } else {
    reset(ctx);
  }
}

/** Apply the active transform mode (rotate/scale) to every vector in
 * `originals`, given the live cursor position. Used both during the drag and
 * implicitly via the wheel inverse-scale hook. */
function applyGroupRotate(ctx: ToolContext, screenPt: Point, shiftKey: boolean): void {
  if (!groupAnchorWorld) return;
  const worldNow = ctx.state.view.pixelsToWorld(screenPt);
  const angleNow = Math.atan2(worldNow.y - groupAnchorWorld.y, worldNow.x - groupAnchorWorld.x);
  let delta = angleNow - rotateStartAngle;
  if (shiftKey) delta = snapAngle(delta, true);
  for (const [id, orig] of originals) {
    const rotated = rotateVector(orig, delta, groupAnchorWorld);
    const current = ctx.state.store.vectors.get(id);
    if (current) ctx.state.store.apply({ kind: "replace", before: current, after: rotated });
  }
}

function applyGroupScale(ctx: ToolContext, screenPt: Point): void {
  if (!groupAnchorWorld) return;
  const dy = scaleStartY - screenPt.y;
  const factor = Math.max(0.05, Math.pow(1.01, dy));
  for (const [id, orig] of originals) {
    const scaled = scaleVector(orig, factor, groupAnchorWorld);
    const current = ctx.state.store.vectors.get(id);
    if (current) ctx.state.store.apply({ kind: "replace", before: current, after: scaled });
  }
}

function commitTransformBatch(ctx: ToolContext): void {
  const me = ctx.getMyId();
  const ops: Op[] = [];
  for (const [id, before] of originals) {
    const current = ctx.state.store.vectors.get(id);
    if (current && current !== before) {
      const after = { ...current, lastEditor: me };
      ctx.state.store.vectors.set(after.id, after);
      ops.push({ kind: "replace", before, after });
    }
  }
  if (ops.length > 0) {
    ctx.state.store.recordOnly(ops.length === 1 ? ops[0]! : { kind: "batch", ops });
  }
}

function revertTransform(ctx: ToolContext): void {
  for (const [id, before] of originals) {
    const current = ctx.state.store.vectors.get(id);
    if (current) ctx.state.store.apply({ kind: "replace", before: current, after: before });
  }
}

function deleteSelection(ctx: ToolContext): void {
  const ops: Op[] = [];
  for (const id of ctx.state.selectedIds) {
    const v = ctx.state.store.vectors.get(id);
    if (v) ops.push({ kind: "delete", vector: v });
  }
  if (ops.length > 0) {
    ctx.state.store.applyAndRecord(ops.length === 1 ? ops[0]! : { kind: "batch", ops });
  }
  ctx.state.selectedIds.clear();
}

function openRadialMenu(
  ctx: ToolContext, hit: Vector, screenPt: Point, pointerId: number, target: EventTarget | null,
): void {
  ensureSelectionIncludes(ctx, hit);
  captureOriginals(ctx);
  groupAnchorWorld = computeGroupAnchor();
  mode = "menuOpen";
  menuPos = screenPt;
  ctx.state.radialMenu = { pos: screenPt, targetId: hit.id, hoverIcon: null };
  (target as Element | null)?.setPointerCapture?.(pointerId);
  ctx.invalidate();
}

function startMove(
  ctx: ToolContext, hit: Vector, screenPt: Point, pointerId: number, target: EventTarget | null,
): void {
  ensureSelectionIncludes(ctx, hit);
  captureOriginals(ctx);
  mode = "moving";
  dragStartWorld = ctx.state.view.pixelsToWorld(screenPt);
  // Wheel-inverse-scale hook only makes sense for a single-vector drag.
  ctx.state.dragLockedTargetId = originals.size === 1 ? hit.id : null;
  (target as Element | null)?.setPointerCapture?.(pointerId);
  ctx.invalidate();
}

export const modifyTool: Tool = {
  id: "modify",
  cursor: "default",

  onPointerDown(e, ctx) {
    if (e.button !== 0) return;
    const screenPt = eventCanvasPoint(e);

    // Placing-duplicate: left-click commits the placement.
    if (mode === "placingDuplicate") {
      e.preventDefault();
      commitPlacingDuplicate(ctx);
      return;
    }

    // If in a continuation mode, a click commits.
    if (mode === "rotating" || mode === "scaling") {
      commitTransformBatch(ctx);
      reset(ctx);
      return;
    }

    const hit = findHit(ctx.state.store.vectors.values(), screenPt, ctx.state.view, getCanvasCtx());
    if (!hit) {
      // Click on empty canvas clears the selection — same affordance the
      // select tool's box-select gives by dragging an empty region.
      if (ctx.state.selectedIds.size > 0) {
        ctx.state.selectedIds.clear();
        ctx.invalidate();
      }
      return;
    }

    // Shift+left-click → radial menu (same as middle-click via onMiddleClick).
    if (e.shiftKey) {
      e.preventDefault();
      openRadialMenu(ctx, hit, screenPt, e.pointerId, e.target);
      return;
    }

    startMove(ctx, hit, screenPt, e.pointerId, e.target);
  },

  onMiddleClick(e, ctx) {
    if (mode === "rotating" || mode === "scaling") {
      commitTransformBatch(ctx);
      reset(ctx);
      return;
    }
    const screenPt = eventCanvasPoint(e);
    const hit = findHit(ctx.state.store.vectors.values(), screenPt, ctx.state.view, getCanvasCtx());
    if (!hit) return;
    openRadialMenu(ctx, hit, screenPt, e.pointerId, e.target);
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

    if (mode === "idle") {
      const hit = findHit(ctx.state.store.vectors.values(), screenPt, ctx.state.view, getCanvasCtx());
      const newId = hit?.id ?? null;
      if (newId !== ctx.state.hoverId) {
        ctx.state.hoverId = newId;
        ctx.invalidate();
      }
      return;
    }

    if (mode === "moving" && dragStartWorld) {
      // Absolute group drag against captured originals.
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

    if (mode === "rotating") {
      applyGroupRotate(ctx, screenPt, e.shiftKey);
      ctx.invalidate();
      return;
    }

    if (mode === "scaling") {
      applyGroupScale(ctx, screenPt);
      ctx.invalidate();
      return;
    }
  },

  onPointerUp(e, ctx) {
    if (mode === "moving") {
      commitTransformBatch(ctx);
      reset(ctx);
      return;
    }
    if (mode === "menuOpen" && menuPos) {
      const screenPt = eventCanvasPoint(e);
      const icon = hitTestIcon(menuPos, screenPt);
      if (icon === "delete") {
        deleteSelection(ctx);
        reset(ctx);
      } else if (icon === "rotate") {
        // Enter continuation rotate mode against the captured originals.
        if (groupAnchorWorld) {
          const cw = ctx.state.view.pixelsToWorld(screenPt);
          rotateStartAngle = Math.atan2(cw.y - groupAnchorWorld.y, cw.x - groupAnchorWorld.x);
        }
        ctx.state.radialMenu = null;
        mode = "rotating";
        ctx.invalidate();
      } else if (icon === "scale") {
        scaleStartY = screenPt.y;
        ctx.state.radialMenu = null;
        mode = "scaling";
        ctx.invalidate();
      } else if (icon === "duplicate") {
        ctx.state.radialMenu = null;
        (e.target as Element | null)?.releasePointerCapture?.(e.pointerId);
        startPlacingDuplicate(ctx, screenPt);
      } else if (icon === "edit") {
        (e.target as Element | null)?.releasePointerCapture?.(e.pointerId);
        tryOpenEdit(ctx);
      } else {
        reset(ctx);
      }
      return;
    }
    // rotating / scaling are committed by next click, not by pointerup
  },

  onKeyDown(e, ctx) {
    if (e.key === "Escape") {
      if (mode === "rotating" || mode === "scaling") {
        revertTransform(ctx);
        reset(ctx);
        e.preventDefault();
      } else if (mode === "menuOpen") {
        reset(ctx);
        e.preventDefault();
      } else if (mode === "placingDuplicate") {
        reset(ctx);
        e.preventDefault();
      }
      return;
    }
    // (Global Delete/Backspace handler covers selection deletion in main.ts.)
  },

  onDeselect(ctx) {
    if (mode === "rotating" || mode === "scaling") revertTransform(ctx);
    ctx.state.hoverId = null;
    reset(ctx);
  },
};
