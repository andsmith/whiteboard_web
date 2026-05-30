import { BoardView } from "./view";
import { VectorStore, type Op } from "./vector-store";
import type { ToolId } from "./tools/tool";
import type { TextVector, LatexVector, Vector } from "./vectors";
import type { Point } from "./view";
import type { Anchor } from "./anchors";
import type { Submission } from "./submissions";

export const COLORS = [
  "#000000", "#808080",
  "#cc0000", "#ee8800",
  "#0040ff", "#ffd400",
  "#7700aa", "#22aa22",
] as const;

export type ColorHex = (typeof COLORS)[number];

export type RadialIcon = "delete" | "rotate" | "scale" | "duplicate" | "edit";

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

export interface PreviewState {
  submissionId: string;
  visible: boolean;
  savedView: { origin: Point; zoom: number };
}

export interface AppState {
  view: BoardView;
  currentTool: ToolId;
  color: ColorHex;
  thickness: number;
  fontSize: number;
  showGrid: boolean;
  snapToGrid: boolean;
  /** When true, new text/latex vectors are created with screenScale=true so
   * their on-screen size stays constant as the user zooms. When false
   * (default), text scales with zoom the same as every other vector. */
  constantTextScale: boolean;
  participantsExpanded: boolean;
  debugExpanded: boolean;
  anchorsExpanded: boolean;
  store: VectorStore;
  /** Live preview of an in-progress drawing (line/rect/circle/polyline/pencil). */
  inProgress: Vector | null;
  /** Active text-editing target — typing keys appends/edits this vector. */
  textEditing: TextVector | null;
  /** Active LaTeX-editing target — bottom-bar input writes to this vector. */
  latexEditing: LatexVector | null;
  /** If the current edit session was opened via the "edit" radial action,
   * this is the original vector that was removed from the store. On cancel
   * we re-add it so no work is lost. */
  editingOriginal: Vector | null;
  /** Vector currently moused over by the modify tool. */
  hoverId: string | null;
  /** Anchor currently moused over (for the on-canvas name tooltip). */
  hoverAnchorId: string | null;
  /** Participant whose name is currently moused over in the Participants
   * panel. Renderer overrides the color of vectors authored by this peerId. */
  highlightedAuthorId: string | null;
  /** Radial menu state, while the menu is open. */
  radialMenu: RadialMenuState | null;
  /** While the user is mid-drag with the modify tool, wheel-zoom keeps
   * the dragged vector visually the same size (inverse-scale in world coords). */
  dragLockedTargetId: string | null;
  /** Vectors currently being placed after a duplicate action. They follow the
   * mouse until the next left-click (commits) or Escape (discards). Not in the
   * authoritative store yet — rendered as a preview overlay. */
  placingDuplicates: Vector[] | null;
  /** Persistent set selected by the select tool — drawn in blue. */
  selectedIds: Set<string>;
  /** In-progress selection box; while non-null its `candidates` are
   * highlighted green to show what will be selected on release. */
  selectionBox: SelectionBoxState | null;
  /** Bookmarks of pan/zoom + colored marker. Synced via host. */
  anchors: Map<string, Anchor>;
  /** View-only users accumulate ops here as they draw; ops are also applied
   * to the local store so the user sees them. The list is flushed on Submit. */
  pendingOps: Op[];
  /** Host-side queue of inbound submissions awaiting review. */
  pendingSubmissions: Submission[];
  /** Active preview state on the host while reviewing a submission. */
  activeSubmissionPreview: PreviewState | null;
  /** Host-side: which peers have signalled having local pending changes. */
  peerDirty: Map<string, boolean>;
  /** Submitter-side: transient flag set after a rejection so the UI can show
   * a "rejected — keep refining" hint. Cleared on next op or after a few sec. */
  lastRejectedAt: number | null;
}

export function createInitialState(): AppState {
  return {
    view: new BoardView(),
    currentTool: "pan",
    color: COLORS[0],
    thickness: 2,
    fontSize: 12,
    showGrid: true,
    snapToGrid: false,
    constantTextScale: true,
    participantsExpanded: true,
    debugExpanded: false,
    anchorsExpanded: false,
    store: new VectorStore(),
    inProgress: null,
    textEditing: null,
    latexEditing: null,
    editingOriginal: null,
    hoverId: null,
    hoverAnchorId: null,
    highlightedAuthorId: null,
    radialMenu: null,
    dragLockedTargetId: null,
    placingDuplicates: null,
    selectedIds: new Set(),
    selectionBox: null,
    anchors: new Map(),
    pendingOps: [],
    pendingSubmissions: [],
    activeSubmissionPreview: null,
    peerDirty: new Map(),
    lastRejectedAt: null,
  };
}
