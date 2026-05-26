import "./styles.css";
import { createInitialState } from "./app-state";
import { CanvasRenderer } from "./renderer";
import { TOOLS } from "./tools/registry";
import type { ToolContext } from "./tools/tool";
import { mountTitleBar } from "./ui/title-bar";
import { mountToolsPanel } from "./ui/tools-panel";
import { mountBottomBar } from "./ui/bottom-bar";
import { mountParticipantsPanel } from "./ui/participants-panel";
import { mountJoinDialog } from "./ui/join-dialog";
import { RoomManager } from "./room-manager";
import { generateRoomId, isValidRoomId } from "./room-id";

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement | null;
  if (!canvas) return;

  const state = createInitialState();
  const room = new RoomManager();
  const renderer = new CanvasRenderer(canvas, state);
  const invalidate = () => renderer.invalidate();

  const toolCtx: ToolContext = { state, invalidate };

  // ---------- Helpers ----------
  const hashRoomId = (): string | null => {
    const raw = location.hash.replace(/^#/, "").trim();
    return raw && isValidRoomId(raw) ? raw : null;
  };

  const computeStatus = (): string => {
    if (room.state.status === "idle" || room.state.status === "ended") return "Disconnected";
    if (room.state.status === "connecting") return "Connecting";
    if (room.isHost()) return "Host";
    return room.myPerm() === "view" ? "View only" : "Guest";
  };

  // ---------- UI mounts ----------
  const titleBar = mountTitleBar({
    getStatus: computeStatus,
    getParticipantCount: () => room.participantCount(),
    onToggleParticipants: () => {
      state.participantsExpanded = !state.participantsExpanded;
      participantsPanel.update();
    },
  });

  const toolsPanel = mountToolsPanel({
    state,
    onToolChange: (t) => {
      state.currentTool = t;
      canvas.style.cursor = TOOLS[t].cursor;
      toolsPanel.update();
    },
    onColorChange: (c) => {
      state.color = c;
      toolsPanel.update();
    },
  });

  const bottomBar = mountBottomBar({
    state,
    isHost: () => room.isHost(),
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
    onUndo: () => { /* TODO when drawing exists */ },
    onRedo: () => { /* TODO when drawing exists */ },
    onClear: () => { /* TODO when drawing exists */ },
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
      // clear URL hash so we don't auto-prompt to rejoin
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
      // Force the participants panel closed so dialog isn't fighting with it
      state.participantsExpanded = false;
      participantsPanel.update();
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

  // Wheel zooms around cursor
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

  // ---------- Initial dialog ----------
  dialog.show();

  // ---------- Optional manual mode ----------
  if (new URLSearchParams(location.search).get("mode") === "manual") {
    import("./ui/manual-mode").then((m) => m.mountManualMode());
  }
});
