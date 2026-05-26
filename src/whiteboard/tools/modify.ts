import type { Tool, ToolContext } from "./tool";
import { eventCanvasPoint } from "./tool";
import { findHit } from "../hit-test";
import { translateVector, scaleVector, rotateVector, getCenter } from "../vector-ops";
import type { Vector } from "../vectors";
import type { Point } from "../view";

type Mode = "idle" | "moving" | "menuOpen" | "rotating" | "scaling";

let mode: Mode = "idle";
let targetId: string | null = null;
let original: Vector | null = null;
let lastWorld: Point | null = null;
let menuPos: Point | null = null;

let rotateStartAngle = 0;
let scaleStartY = 0;

const RADIAL_RADIUS = 56;
const RADIAL_HIT_RADIUS = 24;

export function getRadialIconPositions(center: Point): Record<"delete" | "rotate" | "scale", Point> {
  // 12 o'clock = rotate, 4 o'clock = scale, 8 o'clock = delete (120° apart)
  return {
    rotate: { x: center.x, y: center.y - RADIAL_RADIUS },
    scale: {
      x: center.x + RADIAL_RADIUS * Math.cos(Math.PI / 6),
      y: center.y + RADIAL_RADIUS * Math.sin(Math.PI / 6),
    },
    delete: {
      x: center.x - RADIAL_RADIUS * Math.cos(Math.PI / 6),
      y: center.y + RADIAL_RADIUS * Math.sin(Math.PI / 6),
    },
  };
}

function hitTestIcon(menuPos: Point, cursor: Point): "delete" | "rotate" | "scale" | null {
  const positions = getRadialIconPositions(menuPos);
  for (const name of ["delete", "rotate", "scale"] as const) {
    const p = positions[name];
    if (Math.hypot(cursor.x - p.x, cursor.y - p.y) <= RADIAL_HIT_RADIUS) return name;
  }
  return null;
}

function getCanvasCtx(): CanvasRenderingContext2D | undefined {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement | null;
  return canvas?.getContext("2d") ?? undefined;
}

function reset(ctx: ToolContext): void {
  mode = "idle";
  targetId = null;
  original = null;
  lastWorld = null;
  menuPos = null;
  ctx.state.radialMenu = null;
  ctx.state.dragLockedTargetId = null;
  ctx.invalidate();
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
  lastWorld = ctx.state.view.pixelsToWorld(screenPt);
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

    if (mode === "idle") {
      const hit = findHit(ctx.state.store.vectors.values(), screenPt, ctx.state.view, getCanvasCtx());
      const newId = hit?.id ?? null;
      if (newId !== ctx.state.hoverId) {
        ctx.state.hoverId = newId;
        ctx.invalidate();
      }
      return;
    }

    if (mode === "moving" && targetId) {
      const worldNow = ctx.state.view.pixelsToWorld(screenPt);
      if (lastWorld) {
        const dx = worldNow.x - lastWorld.x;
        const dy = worldNow.y - lastWorld.y;
        const current = ctx.state.store.vectors.get(targetId);
        if (current) {
          const moved = translateVector(current, dx, dy);
          ctx.state.store.apply({ kind: "replace", before: current, after: moved });
          ctx.invalidate();
        }
        lastWorld = worldNow;
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
      const delta = angleNow - rotateStartAngle;
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
      const icon = hitTestIcon(menuPos, eventCanvasPoint(e));
      if (icon === "delete" && targetId) {
        const v = ctx.state.store.vectors.get(targetId);
        if (v) ctx.state.store.applyAndRecord({ kind: "delete", vector: v });
        reset(ctx);
      } else if (icon === "rotate" && targetId) {
        const v = ctx.state.store.vectors.get(targetId);
        if (v) {
          ctx.state.radialMenu = null;
          startRotate(ctx, v, eventCanvasPoint(e));
        } else reset(ctx);
      } else if (icon === "scale" && targetId) {
        const v = ctx.state.store.vectors.get(targetId);
        if (v) {
          ctx.state.radialMenu = null;
          startScale(ctx, v, eventCanvasPoint(e));
        } else reset(ctx);
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
    ctx.state.hoverId = null;
    reset(ctx);
  },
};
