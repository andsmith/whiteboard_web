import type { AppState } from "../app-state";
import type { Vector } from "../vectors";

export type ToolId =
  | "select" | "pan" | "modify"
  | "pencil" | "line" | "rect" | "circle" | "text" | "polyline";

export interface ToolContext {
  state: AppState;
  invalidate: () => void;
  getMyId: () => string;
  commitVector: (v: Vector) => void;
}

export interface Tool {
  id: ToolId;
  cursor: string;
  onPointerDown?(e: PointerEvent, ctx: ToolContext): void;
  onPointerMove?(e: PointerEvent, ctx: ToolContext): void;
  onPointerUp?(e: PointerEvent, ctx: ToolContext): void;
  onKeyDown?(e: KeyboardEvent, ctx: ToolContext): void;
  /** Called when switching away from this tool. Cancels any in-progress state. */
  onDeselect?(ctx: ToolContext): void;
  /** Middle-button click. If a tool implements this, it overrides the
   * default middle-click pan. */
  onMiddleClick?(e: PointerEvent, ctx: ToolContext): void;
}

/** Action button shown in the toolbar — unlike Tool, it does not become the
 * active pointer-tool when clicked. Clicking just fires onClick (e.g., opens
 * a dialog). Used for the "create anchor" button. */
export type ActionId = "anchor-create";

export interface ActionDef {
  id: ActionId;
  /** Key into the icons.ts ICONS map. */
  iconId: string;
  title: string;
  /** Returns true if the action is currently disabled (e.g., view-only user
   * trying to use an editor-only action). */
  isDisabled?(ctx: ToolContext): boolean;
  onClick(ctx: ToolContext): void;
}

export function eventCanvasPoint(e: PointerEvent): { x: number; y: number } {
  const target = e.currentTarget as HTMLElement | null;
  if (!target) return { x: e.clientX, y: e.clientY };
  const rect = target.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}
