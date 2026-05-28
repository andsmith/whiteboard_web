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
import { mountDebugPanel } from "./ui/debug-panel";
import { RoomManager } from "./room-manager";
import { generateRoomId, isValidRoomId } from "./room-id";
import type { Vector } from "./vectors";
import { scaleVector, getCenter } from "./vector-ops";
import { PeerConnections, type DataMessage } from "./peer-connections";
import type { Op } from "./vector-store";
import { loadIceServers } from "./ice-config";
import { DebugLog } from "./debug-log";

const MY_ID = `local-${Math.random().toString(36).slice(2, 8)}`;

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement | null;
  if (!canvas) return;

  const state = createInitialState();
  const room = new RoomManager();
  const renderer = new CanvasRenderer(canvas, state);
  const invalidate = () => renderer.invalidate();
  const debugLog = new DebugLog();

  const getMyId = (): string => room.state.you ?? MY_ID;
  const myName = (): string => room.state.yourName ?? "(local)";

  const commitVector = (v: Vector): void => {
    debugLog.log("draw", `${v.kind} by ${myName()} ${shapeCoords(v)} id=${shortId(v.id)}`);
    state.store.applyAndRecord({ kind: "add", vector: v });
    bottomBar.update();
    invalidate();
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
      if (state.participantsExpanded) state.debugExpanded = false;
      participantsPanel.update();
      debugPanel.update();
    },
    onToggleDebug: () => {
      state.debugExpanded = !state.debugExpanded;
      if (state.debugExpanded) state.participantsExpanded = false;
      debugPanel.update();
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
    onHome: () => {
      state.view.origin = { x: 0, y: 0 };
      state.view.zoom = 1;
      bottomBar.update();
      invalidate();
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
      if (state.participantsExpanded) state.debugExpanded = false;
      participantsPanel.update();
      debugPanel.update();
    },
    onPromote: (peerId) => room.promote(peerId),
    onPermChange: (peerId, perm) => room.setPerm(peerId, perm),
    onLeave: () => {
      room.leave();
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    },
  });

  const debugPanel = mountDebugPanel({
    log: debugLog,
    isExpanded: () => state.debugExpanded,
    onToggle: () => {
      state.debugExpanded = !state.debugExpanded;
      if (state.debugExpanded) state.participantsExpanded = false;
      debugPanel.update();
      participantsPanel.update();
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
      stopPeerConnections();
      dialog.show(room.state.endMessage ?? "");
    }
  };

  // ---------- Peer-to-peer vector sync ----------
  let peerConnections: PeerConnections | null = null;
  let peerConnectionsPromise: Promise<PeerConnections> | null = null;
  let iceServersCache: RTCIceServer[] | null = null;

  const applyRemoteSnapshot = (vectors: Vector[]): void => {
    // First-join snapshot from host: replace local store with the official set.
    // (Conflict-aware merge with local additions is a TODO.)
    state.store.vectors.clear();
    for (const v of vectors) state.store.vectors.set(v.id, v);
    state.store.clearHistory();
    bottomBar.update();
    invalidate();
  };

  const handlePeerMessage = (from: string, msg: DataMessage): void => {
    if (msg.type === "snapshot") {
      debugLog.log("recv", `snapshot ← ${shortId(from)}: ${msg.vectors.length} vectors`);
      applyRemoteSnapshot(msg.vectors);
    } else if (msg.type === "op") {
      debugLog.log("recv", `op ← ${shortId(from)}: ${describeOpLocal(msg.op)}`);
      // Remote op: apply without recording in undo, and wipe our local
      // undo history per the spec (remote changes invalidate it).
      state.store.apply(msg.op);
      state.store.clearHistory();
      bottomBar.update();
      invalidate();
    }
  };

  const startPeerConnections = (): Promise<PeerConnections> => {
    if (peerConnectionsPromise) return peerConnectionsPromise;
    debugLog.log("rtc", "startPeerConnections: fetching ICE servers");
    peerConnectionsPromise = (async () => {
      if (!iceServersCache) iceServersCache = await loadIceServers();
      debugLog.log("rtc", `ICE servers ready (${iceServersCache.length} entries)`);
      const pc = new PeerConnections(
        iceServersCache,
        { send: (m) => {
          debugLog.log("send", `signaling: ${m.type} → ${shortId(m.to)}`);
          room.send(m);
        } },
        {
          onMessage: handlePeerMessage,
          onChannelOpen: (peerId) => {
            debugLog.log("rtc", `data channel OPEN with ${shortId(peerId)}`);
            // Host pushes the current vector set to a newly-connected guest.
            if (room.isHost()) {
              const vectors = Array.from(state.store.vectors.values());
              debugLog.log("send", `snapshot → ${shortId(peerId)}: ${vectors.length} vectors`);
              pc.sendTo(peerId, { type: "snapshot", vectors });
            }
          },
          onChannelClose: (peerId) => {
            debugLog.log("rtc", `data channel CLOSE with ${shortId(peerId)}`);
          },
          onLog: (m) => debugLog.log("rtc", m),
        },
      );
      peerConnections = pc;
      return pc;
    })();
    return peerConnectionsPromise;
  };

  function stopPeerConnections(): void {
    peerConnections?.closeAll();
    peerConnections = null;
    peerConnectionsPromise = null;
  }

  // Broadcast local ops (only host broadcasts to all guests for now).
  state.store.onLocalChange = (op) => {
    debugLog.log("modify", `local op: ${describeOpLocal(op)}`);
    if (!room.isHost()) {
      debugLog.log("info", `not host — op NOT broadcast (guest editor mode not implemented)`);
      return;
    }
    if (!peerConnections) {
      debugLog.log("warn", `host op DROPPED — peerConnections not ready yet`);
      return;
    }
    peerConnections.sendToAll({ type: "op", op });
  };

  // Drive WebRTC setup off the raw signaling stream. Every handler routes
  // through startPeerConnections() so signaling messages that arrive before
  // the lazy ICE-server fetch resolves are still applied to the same
  // PeerConnections instance (rather than dropped via `peerConnections?.`).
  room.onServerMessage = (msg) => {
    switch (msg.type) {
      case "joined":
        debugLog.log("net", `joined room: you=${shortId(msg.you)} role=${msg.role} host=${shortId(msg.host)} peers=[${msg.peers.map((p) => `${p.name}/${shortId(p.peerId)}`).join(", ")}]`);
        // We've joined. Spin up peer-connections (lazy).
        // A guest who joined an existing room waits for the host's offer.
        if (msg.role === "host") {
          // Existing peers (if any reconnected) would already be in msg.peers.
          // In the normal first-create flow this list is empty.
          for (const p of msg.peers) {
            void startPeerConnections().then((pc) => pc.initiate(p.peerId));
          }
        } else {
          void startPeerConnections();
        }
        break;
      case "peer-joined":
        debugLog.log("net", `peer-joined: ${msg.name}/${shortId(msg.peerId)} (isHost=${msg.isHost})`);
        // Host initiates connection to new guest. Guests do nothing.
        if (room.isHost()) {
          void startPeerConnections().then((pc) => pc.initiate(msg.peerId));
        }
        break;
      case "peer-left":
        debugLog.log("net", `peer-left: ${shortId(msg.peerId)}`);
        peerConnections?.closeConnection(msg.peerId);
        break;
      case "offer":
        debugLog.log("recv", `signaling: offer ← ${shortId(msg.from)}`);
        void startPeerConnections().then((pc) => pc.handleOffer(msg.from, msg.sdp));
        break;
      case "answer":
        debugLog.log("recv", `signaling: answer ← ${shortId(msg.from)}`);
        void startPeerConnections().then((pc) => pc.handleAnswer(msg.from, msg.sdp));
        break;
      case "ice":
        debugLog.log("recv", `signaling: ice ← ${shortId(msg.from)}`);
        void startPeerConnections().then((pc) => pc.handleIce(msg.from, msg.candidate));
        break;
      case "host-changed":
        debugLog.log("net", `host-changed: new host = ${shortId(msg.host)}`);
        // TODO: tear down + rebuild connections around the new host.
        break;
      case "host-gone":
        debugLog.log("net", `host-gone (meeting ended)`);
        break;
      case "error":
        debugLog.log("warn", `signaling error: ${msg.message}`);
        break;
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

  // Wheel zoom around cursor. If a modify-tool drag is in progress, the
  // dragged vector is inversely scaled in world coords so its screen size
  // stays constant.
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    const rect = canvas.getBoundingClientRect();
    const oldZoom = state.view.zoom;
    state.view.zoomAt(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      oldZoom * factor,
    );
    const inverseFactor = oldZoom / state.view.zoom;
    if (state.dragLockedTargetId && inverseFactor !== 1) {
      const current = state.store.vectors.get(state.dragLockedTargetId);
      if (current) {
        const scaled = scaleVector(current, inverseFactor, getCenter(current));
        state.store.apply({ kind: "replace", before: current, after: scaled });
      }
    }
    bottomBar.update();
    invalidate();
  }, { passive: false });

  // Clear hover state on mouse leave (modify tool).
  canvas.addEventListener("pointerleave", () => {
    if (state.hoverId !== null) {
      state.hoverId = null;
      invalidate();
    }
  });

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

function shortId(id: string | null | undefined): string {
  if (!id) return "?";
  return id.length > 8 ? id.slice(0, 8) : id;
}

function shapeCoords(v: Vector): string {
  const r = (n: number) => Math.round(n);
  switch (v.kind) {
    case "line":
    case "rect":
      return `(${r(v.a.x)},${r(v.a.y)})→(${r(v.b.x)},${r(v.b.y)})`;
    case "circle":
      return `c(${r(v.center.x)},${r(v.center.y)}) r=${r(v.radius)}`;
    case "pencil":
    case "polyline":
      return `${v.points.length} pts, first=(${r(v.points[0]?.x ?? 0)},${r(v.points[0]?.y ?? 0)})`;
    case "text":
      return `(${r(v.pos.x)},${r(v.pos.y)}) "${v.text.slice(0, 20)}"`;
  }
}

function describeOpLocal(op: Op): string {
  switch (op.kind) {
    case "add": return `add ${op.vector.kind} ${shortId(op.vector.id)} ${shapeCoords(op.vector)}`;
    case "delete": return `delete ${op.vector.kind} ${shortId(op.vector.id)}`;
    case "replace": return `replace ${op.after.kind} ${shortId(op.after.id)} → ${shapeCoords(op.after)}`;
    case "batch": return `batch[${op.ops.length}]: ${op.ops.slice(0, 3).map(describeOpLocal).join("; ")}${op.ops.length > 3 ? "..." : ""}`;
  }
}
