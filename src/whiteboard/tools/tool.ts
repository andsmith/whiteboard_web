import type { AppState } from "../app-state";

export type ToolId = "pencil" | "line" | "rect" | "circle" | "select" | "pan";

export interface ToolContext {
  state: AppState;
  invalidate: () => void;
}

export interface Tool {
  id: ToolId;
  cursor: string;
  onPointerDown?(e: PointerEvent, ctx: ToolContext): void;
  onPointerMove?(e: PointerEvent, ctx: ToolContext): void;
  onPointerUp?(e: PointerEvent, ctx: ToolContext): void;
}
