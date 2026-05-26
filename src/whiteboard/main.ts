import "./styles.css";
import { createInitialState } from "./app-state";
import { CanvasRenderer } from "./renderer";
import { TOOLS } from "./tools/registry";
import type { ToolContext, ToolId } from "./tools/tool";
import { mountTitleBar, type TitleStatus } from "./ui/title-bar";
import { mountToolsPanel } from "./ui/tools-panel";
import { mountBottomBar, type TrashMode } from "./ui/bottom-bar";
import { mountDial } from "./ui/dials";
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

  // ---------- Drag-dials for thickness and fontsize ----------
  mountDial({
    buttonId: "btn-thickness",
    popupId: "thickness-popup",
    getValue: () => state.thickness,
    setValue: (v) => { state.thickness = v; },
    min: 1, max: 30, step: 1,
    render: (v) => {
      const valEl = document.getElementById("thickness-value");
      if (valEl) valEl.textContent = String(v);
      const line = document.querySelector<SVGLineElement>("#thickness-sample line");
      if (line) line.setAttribute("stroke-width", String(v));
    },
  });
  mountDial({
    buttonId: "btn-fontsize",
    popupId: "fontsize-popup",
    getValue: () => state.fontSize,
    setValue: (v) => { state.fontSize = v; },
    min: 6, max: 96, step: 1,
    render: (v) => {
      const valEl = document.getElementById("fontsize-value");
      if (valEl) valEl.textContent = String(v);
      const sample = document.getElementById("fontsize-sample");
      if (sample) sample.style.fontSize = `${v}px`;
    },
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

  // Pan-override state. Triggered by middle-button OR by left-button while
  // Control is held. Overrides whatever the current tool would do.
  let panLast: { x: number; y: number } | null = null;
  let ctrlHeld = false;

  const endPan = (e: PointerEvent) => {
    panLast = null;
    canvas.style.cursor = ctrlHeld ? "grab" : TOOLS[state.currentTool].cursor;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  // Suppress browser middle-click auto-scroll affordance.
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 1) e.preventDefault();
  });

  canvas.addEventListener("pointerdown", (e) => {
    // Middle button: tool can override (polyline finalizes), else pan.
    if (e.button === 1) {
      e.preventDefault();
      const tool = TOOLS[state.currentTool];
      if (tool.onMiddleClick) {
        tool.onMiddleClick(e, toolCtx);
      } else {
        panLast = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = "grabbing";
        (e.target as Element).setPointerCapture?.(e.pointerId);
      }
      return;
    }
    // Left button + Ctrl: pan override.
    if (e.button === 0 && e.ctrlKey) {
      e.preventDefault();
      panLast = { x: e.clientX, y: e.clientY };
      canvas.style.cursor = "grabbing";
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    TOOLS[state.currentTool].onPointerDown?.(e, toolCtx);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (panLast) {
      const dx = e.clientX - panLast.x;
      const dy = e.clientY - panLast.y;
      state.view.pan({ x: dx, y: dy });
      panLast = { x: e.clientX, y: e.clientY };
      invalidate();
      return;
    }
    TOOLS[state.currentTool].onPointerMove?.(e, toolCtx);
  });
  canvas.addEventListener("pointerup", (e) => {
    if (panLast) {
      endPan(e);
      return;
    }
    TOOLS[state.currentTool].onPointerUp?.(e, toolCtx);
  });
  canvas.addEventListener("pointercancel", (e) => {
    if (panLast) {
      endPan(e);
      return;
    }
    TOOLS[state.currentTool].onPointerUp?.(e, toolCtx);
  });

  // Track Ctrl key to preview the pan cursor before any click.
  window.addEventListener("keydown", (e) => {
    if (e.key === "Control" && !ctrlHeld) {
      ctrlHeld = true;
      if (!panLast) canvas.style.cursor = "grab";
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "Control" && ctrlHeld) {
      ctrlHeld = false;
      if (!panLast) canvas.style.cursor = TOOLS[state.currentTool].cursor;
    }
  });
  window.addEventListener("blur", () => {
    if (ctrlHeld) {
      ctrlHeld = false;
      if (!panLast) canvas.style.cursor = TOOLS[state.currentTool].cursor;
    }
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
