import { BoardView } from "./view";
import { VectorStore } from "./vector-store";
import type { ToolId } from "./tools/tool";
import type { Vector } from "./vectors";

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
  store: VectorStore;
  /** Live preview vector being drawn — rendered but not yet committed. */
  inProgress: Vector | null;
}

export function createInitialState(): AppState {
  return {
    view: new BoardView(),
    currentTool: "pan",
    color: COLORS[0],
    thickness: 2,
    fontSize: 16,
    showGrid: true,
    snapToGrid: false,
    participantsExpanded: true,
    store: new VectorStore(),
    inProgress: null,
  };
}
