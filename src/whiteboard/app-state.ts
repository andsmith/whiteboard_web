import { BoardView } from "./view";
import { VectorStore } from "./vector-store";
import type { ToolId } from "./tools/tool";
import type { TextVector, Vector } from "./vectors";
import type { Point } from "./view";

export const COLORS = [
  "#000000", "#808080",
  "#cc0000", "#ee8800",
  "#0040ff", "#ffd400",
  "#7700aa", "#22aa22",
] as const;

export type ColorHex = (typeof COLORS)[number];

export type RadialIcon = "delete" | "rotate" | "scale";

export interface RadialMenuState {
  pos: Point;             // screen-space position of cursor when opened
  targetId: string;       // "" for the select-tool's multi-target menus
  hoverIcon: RadialIcon | null;
}

export interface SelectionBoxState {
  startScreen: Point;
  endScreen: Point;
  /** Vector ids whose rendered bbox intersects the in-progress box. */
  candidates: Set<string>;
}

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
  /** Live preview of an in-progress drawing (line/rect/circle/polyline/pencil). */
  inProgress: Vector | null;
  /** Active text-editing target — typing keys appends/edits this vector. */
  textEditing: TextVector | null;
  /** Vector currently moused over by the modify tool. */
  hoverId: string | null;
  /** Radial menu state, while the menu is open. */
  radialMenu: RadialMenuState | null;
  /** While the user is mid-drag with the modify tool, wheel-zoom keeps
   * the dragged vector visually the same size (inverse-scale in world coords). */
  dragLockedTargetId: string | null;
  /** Persistent set selected by the select tool — drawn in blue. */
  selectedIds: Set<string>;
  /** In-progress selection box; while non-null its `candidates` are
   * highlighted green to show what will be selected on release. */
  selectionBox: SelectionBoxState | null;
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
    textEditing: null,
    hoverId: null,
    radialMenu: null,
    dragLockedTargetId: null,
    selectedIds: new Set(),
    selectionBox: null,
  };
}
