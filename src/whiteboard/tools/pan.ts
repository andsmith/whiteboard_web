import type { Tool } from "./tool";

let last: { x: number; y: number } | null = null;

export const panTool: Tool = {
  id: "pan",
  cursor: "grab",
  onPointerDown(e, _ctx) {
    const target = e.target as Element;
    target.setPointerCapture?.(e.pointerId);
    last = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement | null)?.style.setProperty("cursor", "grabbing");
  },
  onPointerMove(e, ctx) {
    if (last === null) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    ctx.state.view.pan({ x: dx, y: dy });
    last = { x: e.clientX, y: e.clientY };
    ctx.invalidate();
  },
  onPointerUp(e, _ctx) {
    last = null;
    const target = e.target as Element;
    target.releasePointerCapture?.(e.pointerId);
    (e.currentTarget as HTMLElement | null)?.style.setProperty("cursor", "grab");
  },
};
