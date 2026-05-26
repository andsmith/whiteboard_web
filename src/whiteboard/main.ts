import "./styles.css";
import { createInitialState } from "./app-state";
import { CanvasRenderer } from "./renderer";
import { TOOLS } from "./tools/registry";
import type { ToolContext, ToolId } from "./tools/tool";
import { mountTitleBar, type TitleStatus } from "./ui/title-bar";
import { mountToolsPanel } from "./ui/tools-panel";
import { mountBottomBar, type TrashMode } from "./ui/bottom-bar";
import { mountParticipantsPanel } from "./ui/participants-panel";
import { mountJoinDialog } from "./ui/join-dialog";
import { RoomManager } from "./room-manager";
import { generateRoomId, isValidRoomId } from "./room-id";
import type { Vector } from "./vectors";

const MY_ID = `local-${Math.random().toString(36).slice(2, 8)}`;

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement | null;
  if (!canvas) return;

  const state = createInitialState();
  const room = new RoomManager();
  const renderer = new CanvasRenderer(canvas, state);
  const invalidate = () => renderer.invalidate();

  const getMyId = (): string => room.state.you ?? MY_ID;

  const commitVector = (v: Vector): void => {
    state.store.applyAndRecord({ kind: "add", vector: v });
    bottomBar.update();
    invalidate();
    // TODO (Phase B): if editor, send vector to host; if host, broadcast.
  };

  const toolCtx: ToolContext = { state, invalidate, getMyId, commitVector };

  // ---------- Helpers ----------
  const hashRoomId = (): string | null => {
    const raw = location.hash.replace(/^#/, "").trim();
    return raw && isValidRoomId(raw) ? raw : null;
  };

  const computeStatus = (): TitleStatus => {
    if (room.state.status === "idle" || room.state.status === "ended") return "Disconnected";
    if (room.state.status === "connecting") return "Connecting";
    if (room.isHost()) return "Host";
    return room.myPerm() === "view" ? "View only" : "Guest";
  };

  const trashMode = (): TrashMode => {
    // Until editor-mode plumbing exists: host & solo => trash, view-only guest => refresh.
    if (room.state.status !== "joined") return "trash";
    if (room.isHost()) return "trash";
    return room.myPerm() === "view" ? "refresh" : "trash";
  };

  const switchTool = (t: ToolId): void => {
    const prev = state.currentTool;
    if (prev === t) return;
    TOOLS[prev].onDeselect?.(toolCtx);
    state.currentTool = t;
    canvas.style.cursor = TOOLS[t].cursor;
    toolsPanel.update();
    invalidate();
  };

  // ---------- UI mounts ----------
  const titleBar = mountTitleBar({
    getTitle: () => ({ status: computeStatus(), roomId: room.state.roomId }),
    getParticipantCount: () => room.participantCount(),
    onToggleParticipants: () => {
      state.participantsExpanded = !state.participantsExpanded;
      participantsPanel.update();
    },
  });

  const toolsPanel = mountToolsPanel({
    state,
    onToolChange: switchTool,
    onColorChange: (c) => {
      state.color = c;
      toolsPanel.update();
    },
  });

  const bottomBar = mountBottomBar({
    state,
    isHost: () => room.isHost(),
    trashMode,
    onZoomChange: (z) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      state.view.zoomAt({ x: w / 2, y: h / 2 }, z);
      bottomBar.update();
      invalidate();
    },
    onShowGridToggle: () => {
      state.showGrid = !state.showGrid;
      bottomBar.update();
      invalidate();
    },
    onSnapGridToggle: () => {
      state.snapToGrid = !state.snapToGrid;
      bottomBar.update();
    },
    onUndo: () => {
      state.store.undo();
      bottomBar.update();
      invalidate();
    },
    onRedo: () => {
      state.store.redo();
      bottomBar.update();
      invalidate();
    },
    onTrash: () => {
      // For now (no networking): delete vectors I authored.
      const myId = getMyId();
      state.store.deleteWhere((v) => v.author === myId);
      bottomBar.update();
      invalidate();
    },
    onSave: () => saveToFile(state.store.serialize()),
    onLoad: () => loadFromFile().then((json) => {
      if (json === null) return;
      try {
        state.store.deserialize(json);
        bottomBar.update();
        invalidate();
      } catch (err) {
        window.alert(`Load failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  });

  const participantsPanel = mountParticipantsPanel({
    getState: () => room.state,
    isHost: () => room.isHost(),
    isExpanded: () => state.participantsExpanded,
    onToggle: () => {
      state.participantsExpanded = !state.participantsExpanded;
      participantsPanel.update();
    },
    onPromote: (peerId) => room.promote(peerId),
    onPermChange: (peerId, perm) => room.setPerm(peerId, perm),
    onLeave: () => {
      room.leave();
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    },
  });

  const dialog = mountJoinDialog({
    getHashRoomId: hashRoomId,
    onCreate: (name) => {
      const roomId = generateRoomId();
      location.hash = roomId;
      room.enter(roomId, name);
      dialog.close();
    },
    onJoin: (name, roomId) => {
      if (location.hash.replace(/^#/, "") !== roomId) location.hash = roomId;
      room.enter(roomId, name);
      dialog.close();
    },
  });

  // ---------- Wire RoomManager → UI ----------
  room.onChange = () => {
    titleBar.update();
    bottomBar.update();
    participantsPanel.update();
    if (room.state.status === "ended") {
      dialog.show(room.state.endMessage ?? "");
    }
  };

  // ---------- Canvas pointer events → current tool ----------
  canvas.style.cursor = TOOLS[state.currentTool].cursor;
  canvas.addEventListener("pointerdown", (e) => {
    TOOLS[state.currentTool].onPointerDown?.(e, toolCtx);
  });
  canvas.addEventListener("pointermove", (e) => {
    TOOLS[state.currentTool].onPointerMove?.(e, toolCtx);
  });
  canvas.addEventListener("pointerup", (e) => {
    TOOLS[state.currentTool].onPointerUp?.(e, toolCtx);
  });
  canvas.addEventListener("pointercancel", (e) => {
    TOOLS[state.currentTool].onPointerUp?.(e, toolCtx);
  });

  // Wheel zoom around cursor (only when no in-progress drawing)
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    const rect = canvas.getBoundingClientRect();
    state.view.zoomAt(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      state.view.zoom * factor,
    );
    bottomBar.update();
    invalidate();
  }, { passive: false });

  // Global keyboard for tools (polyline Enter/Escape)
  window.addEventListener("keydown", (e) => {
    // Ignore when typing in input fields
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    TOOLS[state.currentTool].onKeyDown?.(e, toolCtx);
  });

  // ---------- Initial dialog ----------
  dialog.show();

  // ---------- Optional manual mode ----------
  if (new URLSearchParams(location.search).get("mode") === "manual") {
    import("./ui/manual-mode").then((m) => m.mountManualMode());
  }
});

function saveToFile(json: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `whiteboard-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadFromFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        const text = await file.text();
        resolve(text);
      } catch {
        resolve(null);
      }
    });
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}
