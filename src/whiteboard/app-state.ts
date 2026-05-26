import { BoardView } from "./view";
import type { ToolId } from "./tools/tool";

export const COLORS = [
  "#000000", "#808080",
  "#cc0000", "#ee8800",
  "#0040ff", "#ffd400",
  "#7700aa", "#22aa22",
] as const;

export type ColorHex = (typeof COLORS)[number];

export interface AppState {
  view: BoardView;
  currentTool: ToolId;
  color: ColorHex;
  thickness: number;
  fontSize: number;
  showGrid: boolean;
  snapToGrid: boolean;
  participantsExpanded: boolean;
}

export function createInitialState(): AppState {
  return {
    view: new BoardView(),
    currentTool: "pan",
    color: COLORS[0],
    thickness: 2,
    fontSize: 14,
    showGrid: true,
    snapToGrid: false,
    participantsExpanded: false,
  };
}
