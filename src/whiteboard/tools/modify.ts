import type { Tool, ToolContext } from "./tool";
import { eventCanvasPoint } from "./tool";
import { findHit } from "../hit-test";
import { translateVector, scaleVector, rotateVector, getCenter, duplicateVector } from "../vector-ops";
import type { Vector } from "../vectors";
import { snap, snapAngle, type Point } from "../view";

type Mode = "idle" | "moving" | "menuOpen" | "rotating" | "scaling" | "placingDuplicate";

let mode: Mode = "idle";
let targetId: string | null = null;
let original: Vector | null = null;
/** World-space position of the initial click — used for absolute drag math. */
let dragStartWorld: Point | null = null;
let menuPos: Point | null = null;

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

/** True iff this vector kind supports the "edit" radial action. */
function canEdit(kind: string): boolean {
  return kind === "text" || kind === "latex";
}

function getCanvasCtx(): CanvasRenderingContext2D | undefined {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement | null;
  return canvas?.getContext("2d") ?? undefined;
}

function reset(ctx: ToolContext): void {
  mode = "idle";
  targetId = null;
  original = null;
  dragStartWorld = null;
  menuPos = null;
  dupVectors = [];
  lastDragWorld = null;
  ctx.state.radialMenu = null;
  ctx.state.dragLockedTargetId = null;
  ctx.state.placingDuplicates = null;
  ctx.invalidate();
}

function startPlacingDuplicate(ctx: ToolContext, source: Vector, screenPt: Point): void {
  const copy = duplicateVector(source, ctx.getMyId());
  dupVectors = [copy];
  lastDragWorld = ctx.state.view.pixelsToWorld(screenPt);
  ctx.state.placingDuplicates = dupVectors.slice();
  mode = "placingDuplicate";
  ctx.invalidate();
}

function commitPlacingDuplicate(ctx: ToolContext): void {
  if (dupVectors.length === 0) { reset(ctx); return; }
  const ops = dupVectors.map((v) => ({ kind: "add" as const, vector: v }));
  ctx.state.store.applyAndRecord(ops.length === 1
    ? ops[0]!
    : { kind: "batch", ops });
  reset(ctx);
}

/** Open a text or latex vector for editing via the radial "edit" action.
 * Removes the vector from the store (so only the in-progress copy is visible)
 * and stashes the original on state.editingOriginal so Escape can restore it.
 * Then switches to the appropriate tool. The actual edit UI is the existing
 * in-canvas cursor (text) or the bottom-bar input (latex). */
function openEdit(ctx: ToolContext, v: Vector): void {
  ctx.state.editingOriginal = v;
  // Remove from store but DON'T record — we'll record either an add (Escape)
  // or the new edited version (commit). Either way the original is gone.
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

function openRadialMenu(ctx: ToolContext, hit: Vector, screenPt: Point, pointerId: number, target: EventTarget | null): void {
  mode = "menuOpen";
  targetId = hit.id;
  original = hit;
  menuPos = screenPt;
  ctx.state.radialMenu = { pos: screenPt, targetId: hit.id, hoverIcon: null };
  (target as Element | null)?.setPointerCapture?.(pointerId);
  ctx.invalidate();
}

function startMove(ctx: ToolContext, hit: Vector, screenPt: Point, pointerId: number, target: EventTarget | null): void {
  mode = "moving";
  targetId = hit.id;
  original = hit;
  dragStartWorld = ctx.state.view.pixelsToWorld(screenPt);
  ctx.state.dragLockedTargetId = hit.id;
  (target as Element | null)?.setPointerCapture?.(pointerId);
  ctx.invalidate();
}

function startRotate(ctx: ToolContext, hit: Vector, screenPt: Point): void {
  mode = "rotating";
  targetId = hit.id;
  original = hit;
  const center = getCenter(hit);
  const worldNow = ctx.state.view.pixelsToWorld(screenPt);
  rotateStartAngle = Math.atan2(worldNow.y - center.y, worldNow.x - center.x);
  ctx.invalidate();
}

function startScale(ctx: ToolContext, hit: Vector, screenPt: Point): void {
  mode = "scaling";
  targetId = hit.id;
  original = hit;
  scaleStartY = screenPt.y;
  ctx.invalidate();
}

function commitTransform(ctx: ToolContext): void {
  if (!targetId || !original) return;
  const final = ctx.state.store.vectors.get(targetId);
  if (final && final !== original) {
    ctx.state.store.recordOnly({ kind: "replace", before: original, after: final });
  }
}

export const modifyTool: Tool = {
  id: "modify",
  cursor: "default",

  onPointerDown(e, ctx) {
    if (e.button !== 0) return;
    const screenPt = eventCanvasPoint(e);

    // Placing-duplicate mode: left-click anywhere commits the placement.
    if (mode === "placingDuplicate") {
      e.preventDefault();
      commitPlacingDuplicate(ctx);
      return;
    }

    // If in a continuation mode, a click commits.
    if (mode === "rotating" || mode === "scaling") {
      commitTransform(ctx);
      reset(ctx);
      return;
    }

    const hit = findHit(ctx.state.store.vectors.values(), screenPt, ctx.state.view, getCanvasCtx());
    if (!hit) return;

    // Shift+left-click → radial menu (same as middle-click via onMiddleClick)
    if (e.shiftKey) {
      e.preventDefault();
      openRadialMenu(ctx, hit, screenPt, e.pointerId, e.target);
      return;
    }

    startMove(ctx, hit, screenPt, e.pointerId, e.target);
  },
  onMiddleClick(e, ctx) {
    if (mode === "rotating" || mode === "scaling") {
      commitTransform(ctx);
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

    if (mode === "moving" && targetId && original && dragStartWorld) {
      // Absolute drag: translation = (target click-point) - (initial click-point).
      // Shift-hold snaps the click-point to the grid so the object lands cleanly.
      const worldNow = ctx.state.view.pixelsToWorld(screenPt);
      const targetClick = e.shiftKey ? snap(worldNow, true) : worldNow;
      const dx = targetClick.x - dragStartWorld.x;
      const dy = targetClick.y - dragStartWorld.y;
      const moved = translateVector(original, dx, dy);
      const current = ctx.state.store.vectors.get(targetId);
      if (current) {
        ctx.state.store.apply({ kind: "replace", before: current, after: moved });
        ctx.invalidate();
      }
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

    if (mode === "rotating" && targetId && original) {
      const worldNow = ctx.state.view.pixelsToWorld(screenPt);
      const center = getCenter(original);
      const angleNow = Math.atan2(worldNow.y - center.y, worldNow.x - center.x);
      let delta = angleNow - rotateStartAngle;
      if (e.shiftKey) delta = snapAngle(delta, true); // snap to 45°
      const rotated = rotateVector(original, delta, center);
      const current = ctx.state.store.vectors.get(targetId);
      if (current) {
        ctx.state.store.apply({ kind: "replace", before: current, after: rotated });
        ctx.invalidate();
      }
      return;
    }

    if (mode === "scaling" && targetId && original) {
      const dy = scaleStartY - screenPt.y;
      const factor = Math.max(0.05, Math.pow(1.01, dy));
      const center = getCenter(original);
      const scaled = scaleVector(original, factor, center);
      const current = ctx.state.store.vectors.get(targetId);
      if (current) {
        ctx.state.store.apply({ kind: "replace", before: current, after: scaled });
        ctx.invalidate();
      }
      return;
    }
  },

  onPointerUp(e, ctx) {
    if (mode === "moving") {
      commitTransform(ctx);
      reset(ctx);
      return;
    }
    if (mode === "menuOpen" && menuPos) {
      const screenPt = eventCanvasPoint(e);
      const icon = hitTestIcon(menuPos, screenPt);
      if (icon === "delete" && targetId) {
        const v = ctx.state.store.vectors.get(targetId);
        if (v) ctx.state.store.applyAndRecord({ kind: "delete", vector: v });
        reset(ctx);
      } else if (icon === "rotate" && targetId) {
        const v = ctx.state.store.vectors.get(targetId);
        if (v) {
          ctx.state.radialMenu = null;
          startRotate(ctx, v, screenPt);
        } else reset(ctx);
      } else if (icon === "scale" && targetId) {
        const v = ctx.state.store.vectors.get(targetId);
        if (v) {
          ctx.state.radialMenu = null;
          startScale(ctx, v, screenPt);
        } else reset(ctx);
      } else if (icon === "duplicate" && targetId) {
        const v = ctx.state.store.vectors.get(targetId);
        if (v) {
          ctx.state.radialMenu = null;
          (e.target as Element | null)?.releasePointerCapture?.(e.pointerId);
          startPlacingDuplicate(ctx, v, screenPt);
        } else reset(ctx);
      } else if (icon === "edit" && targetId) {
        const v = ctx.state.store.vectors.get(targetId);
        if (v && canEdit(v.kind)) {
          (e.target as Element | null)?.releasePointerCapture?.(e.pointerId);
          openEdit(ctx, v);
        } else {
          // Edit unsupported for this vector kind — silently dismiss the menu.
          reset(ctx);
        }
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
        // revert to original
        if (targetId && original) {
          const current = ctx.state.store.vectors.get(targetId);
          if (current) ctx.state.store.apply({ kind: "replace", before: current, after: original });
        }
        reset(ctx);
        e.preventDefault();
      } else if (mode === "menuOpen") {
        reset(ctx);
        e.preventDefault();
      } else if (mode === "placingDuplicate") {
        // Discard the duplicates — they were never added to the store.
        reset(ctx);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      // Quick delete: if a vector is hovered (and not in another mode), delete it.
      if (mode === "idle" && ctx.state.hoverId) {
        const v = ctx.state.store.vectors.get(ctx.state.hoverId);
        if (v) ctx.state.store.applyAndRecord({ kind: "delete", vector: v });
        ctx.state.hoverId = null;
        ctx.invalidate();
        e.preventDefault();
      }
    }
  },

  onDeselect(ctx) {
    if (mode === "rotating" || mode === "scaling") {
      // Revert mid-transform if user switches tools.
      if (targetId && original) {
        const current = ctx.state.store.vectors.get(targetId);
        if (current) ctx.state.store.apply({ kind: "replace", before: current, after: original });
      }
    }
    // placingDuplicate: silently discard the unplaced copies.
    ctx.state.hoverId = null;
    reset(ctx);
  },
};
