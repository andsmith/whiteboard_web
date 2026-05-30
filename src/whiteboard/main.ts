import "./styles.css";
import { createInitialState } from "./app-state";
import { CanvasRenderer, ANCHOR_ICON_R } from "./renderer";
import { TOOLS } from "./tools/registry";
import type { ToolContext, ToolId, ActionDef, ActionId } from "./tools/tool";
import { mountTitleBar, type TitleStatus } from "./ui/title-bar";
import { mountToolsPanel } from "./ui/tools-panel";
import { mountBottomBar, type TrashMode } from "./ui/bottom-bar";
import { mountDial } from "./ui/dials";
import { mountParticipantsPanel } from "./ui/participants-panel";
import { mountJoinDialog } from "./ui/join-dialog";
import { mountDebugPanel } from "./ui/debug-panel";
import { mountAnchorsPanel } from "./ui/anchors-panel";
import { mountAnchorDialog } from "./ui/anchor-dialog";
import { mountSubmitBar } from "./ui/submit-bar";
import { mountLatexInput } from "./ui/latex-input";
import { renderLatex } from "./latex-render";
import { RoomManager } from "./room-manager";
import { generateRoomId, isValidRoomId } from "./room-id";
import { getBoundingBox, type Vector } from "./vectors";
import { scaleVector, getCenter } from "./vector-ops";
import { PeerConnections, type DataMessage } from "./peer-connections";
import type { Op } from "./vector-store";
import { loadIceServers } from "./ice-config";
import { DebugLog } from "./debug-log";
import { newAnchorId, type Anchor } from "./anchors";
import { newSubmissionId, applyOpsTo, opAffectedIds, type Submission } from "./submissions";
import type { BBox } from "./view";

const MY_ID = `local-${Math.random().toString(36).slice(2, 8)}`;

window.addEventListener("DOMContentLoaded", () => {
  const canvasOrNull = document.getElementById("canvas") as HTMLCanvasElement | null;
  if (!canvasOrNull) return;
  const canvas: HTMLCanvasElement = canvasOrNull;

  const state = createInitialState();
  const room = new RoomManager();
  const renderer = new CanvasRenderer(canvas, state);
  const invalidate = () => renderer.invalidate();
  const debugLog = new DebugLog();

  const getMyId = (): string => room.state.you ?? MY_ID;
  const myName = (): string => room.state.yourName ?? "(local)";

  const commitVector = (v: Vector): void => {
    // Stamp lastEditor on every commit. For brand-new vectors this equals
    // `author`; for edited text/latex vectors it tells later viewers who most
    // recently touched the content.
    v.lastEditor = getMyId();
    debugLog.log("draw", `${v.kind} by ${myName()} ${shapeCoords(v)} id=${shortId(v.id)}`);
    state.store.applyAndRecord({ kind: "add", vector: v });
    bottomBar.update();
    invalidate();
  };

  // switchTool is defined below; toolCtx references it lazily so the
  // forward declaration is fine. (Arrow function captures the binding.)
  const toolCtx: ToolContext = {
    state, invalidate, getMyId, commitVector,
    switchTool: (t) => switchTool(t),
  };

  // ---------- Helpers ----------
  const hashRoomId = (): string | null => {
    const raw = location.hash.replace(/^#/, "").trim();
    return raw && isValidRoomId(raw) ? raw : null;
  };

  const computeStatus = (): TitleStatus => {
    if (room.state.status === "idle" || room.state.status === "ended") return "Disconnected";
    if (room.state.status === "connecting") return "Connecting";
    if (room.isHost()) return "Host";
    return room.myPerm() === "view" ? "Guest - Viewing" : "Guest - Editing";
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

  // Mutually-exclusive sidebar toggle: opening one collapses the others.
  const collapseAllRightPanels = () => {
    state.participantsExpanded = false;
    state.debugExpanded = false;
    state.anchorsExpanded = false;
  };
  const updateRightPanels = () => {
    participantsPanel.update();
    debugPanel.update();
    anchorsPanel.update();
  };

  // ---------- UI mounts ----------
  const titleBar = mountTitleBar({
    getTitle: () => ({ status: computeStatus(), roomId: room.state.roomId }),
    getParticipantCount: () => room.participantCount(),
    getAnchorCount: () => state.anchors.size,
    onToggleParticipants: () => {
      const next = !state.participantsExpanded;
      collapseAllRightPanels();
      state.participantsExpanded = next;
      updateRightPanels();
    },
    onToggleDebug: () => {
      const next = !state.debugExpanded;
      collapseAllRightPanels();
      state.debugExpanded = next;
      updateRightPanels();
    },
    onToggleAnchors: () => {
      const next = !state.anchorsExpanded;
      collapseAllRightPanels();
      state.anchorsExpanded = next;
      updateRightPanels();
    },
  });

  // Action definitions: the anchor-create button. Disabled for view-only.
  const actions: Record<ActionId, ActionDef> = {
    "anchor-create": {
      id: "anchor-create",
      iconId: "anchor",
      title: "Save anchor (bookmark this view)",
      isDisabled: () => room.myPerm() === "view",
      onClick: () => { void createAnchorFlow(); },
    },
  };

  const toolsPanel = mountToolsPanel({
    state,
    actions,
    onToolChange: switchTool,
    onColorChange: (c) => {
      state.color = c;
      toolsPanel.update();
    },
    onAction: (id) => {
      const def = actions[id];
      if (def.isDisabled?.(toolCtx)) return;
      def.onClick(toolCtx);
    },
    isActionDisabled: (id) => actions[id].isDisabled?.(toolCtx) ?? false,
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
    onTextScaleModeToggle: () => {
      state.constantTextScale = !state.constantTextScale;
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
      // View-only user: trash button is "refresh" — discard local pending
      // ops and re-sync from the host's snapshot.
      if (room.myPerm() === "view" && !room.isHost()) {
        if (state.pendingOps.length === 0) return;
        // Invert each pending op (most-recent first) and apply to reset to
        // the host's authoritative state.
        for (let i = state.pendingOps.length - 1; i >= 0; i--) {
          const op = state.pendingOps[i]!;
          state.store.apply(invertForRevert(op));
        }
        state.pendingOps.length = 0;
        state.lastRejectedAt = null;
        if (peerConnections) {
          peerConnections.sendToAll({ type: "presence-dirty", dirty: false });
        }
        submitBar.update();
        bottomBar.update();
        invalidate();
        return;
      }
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
    getPeerDirty: () => state.peerDirty,
    onToggle: () => {
      const next = !state.participantsExpanded;
      collapseAllRightPanels();
      state.participantsExpanded = next;
      updateRightPanels();
    },
    onPromote: (peerId) => room.promote(peerId),
    onPermChange: (peerId, perm) => {
      room.setPerm(peerId, perm);
      // Tell every peer (especially the target) about the change.
      if (peerConnections) {
        debugLog.log("send", `perm-update → all: ${shortId(peerId)}=${perm}`);
        peerConnections.sendToAll({ type: "perm-update", peerId, perm });
      }
    },
    onHoverAuthor: (peerId) => {
      state.highlightedAuthorId = peerId;
      invalidate();
    },
    onClickAuthor: (peerId) => {
      // Populate selectedIds with every vector authored by this peer, then
      // switch to the modify tool so the user can immediately act on them.
      const ids = new Set<string>();
      for (const v of state.store.vectors.values()) {
        if (v.author === peerId) ids.add(v.id);
      }
      state.selectedIds = ids;
      // Clear hover-highlight so the selection-blue dominates.
      state.highlightedAuthorId = null;
      switchTool("modify");
      invalidate();
    },
    onLeave: () => {
      room.leave();
      if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    },
  });

  const debugPanel = mountDebugPanel({
    log: debugLog,
    isExpanded: () => state.debugExpanded,
    onToggle: () => {
      const next = !state.debugExpanded;
      collapseAllRightPanels();
      state.debugExpanded = next;
      updateRightPanels();
    },
  });

  const anchorsPanel = mountAnchorsPanel({
    getAnchors: () => state.anchors,
    isExpanded: () => state.anchorsExpanded,
    canEdit: () => room.myPerm() !== "view",
    onToggle: () => {
      const next = !state.anchorsExpanded;
      collapseAllRightPanels();
      state.anchorsExpanded = next;
      updateRightPanels();
    },
    onNavigate: (id) => navigateToAnchor(id),
    onDelete: (id) => deleteAnchor(id),
  });

  const anchorDialog = mountAnchorDialog();

  const submitBar = mountSubmitBar({
    getPendingCount: () => state.pendingOps.length,
    getLastRejectedAt: () => state.lastRejectedAt,
    getActiveSubmission: () => state.pendingSubmissions[0] ?? null,
    isPreviewVisible: () => state.activeSubmissionPreview?.visible ?? false,
    getPendingSubmissionsCount: () => state.pendingSubmissions.length,
    onSubmit: () => submitPendingOps(),
    onTogglePreview: () => toggleSubmissionPreview(),
    onAccept: () => acceptActiveSubmission(),
    onReject: () => rejectActiveSubmission(),
  });

  // Tick the submit-bar every second so the rejected-hint can fade out.
  setInterval(() => submitBar.update(), 1000);

  // Bottom-bar LaTeX source input. Visibility driven by state.latexEditing.
  const latexInput = mountLatexInput({
    state,
    invalidate,
    onCommit: () => {
      const v = state.latexEditing;
      if (!v) return;
      if (v.text.length > 0) {
        commitVector(v);  // adds + broadcasts via the usual path
      } else if (state.editingOriginal) {
        // Empty commit on an edit session: restore the original.
        state.store.applyAndRecord({ kind: "add", vector: state.editingOriginal });
      }
      state.latexEditing = null;
      state.editingOriginal = null;
      latexInput.update();
      invalidate();
    },
    onCancel: () => {
      // Restore the original if this was an edit session.
      if (state.editingOriginal) {
        state.store.applyAndRecord({ kind: "add", vector: state.editingOriginal });
      }
      state.latexEditing = null;
      state.editingOriginal = null;
      latexInput.update();
      invalidate();
    },
  });

  // Drive the latex-input visibility on every render tick — no separate
  // observer needed; this is cheap and idempotent.
  setInterval(() => latexInput.update(), 200);

  // The text tool's "edit" flow uses state.textEditing too. When the user
  // clicks elsewhere (committing the edited text) we need to restore the
  // original if they made it empty. Wrap commitVector once.
  // (Implementation note: text.ts always uses ctx.commitVector for non-empty
  // text, so a non-empty commit just naturally replaces the original. Empty
  // text discards — restore from editingOriginal in that case.)
  // We hook this via a small interval that watches for textEditing leaving
  // a populated state without a commit while editingOriginal exists.
  let lastTextEditing: typeof state.textEditing = null;
  setInterval(() => {
    if (lastTextEditing && !state.textEditing && state.editingOriginal) {
      // textEditing was cleared (probably by commitCurrent or a tool switch).
      // If the cleared vector was empty AND we had an original, restore it.
      if (lastTextEditing.text.length === 0) {
        state.store.applyAndRecord({ kind: "add", vector: state.editingOriginal });
        invalidate();
      }
      state.editingOriginal = null;
    }
    lastTextEditing = state.textEditing;
  }, 200);

  // Warm the KaTeX cache as soon as we mount so the first user keystroke
  // doesn't take a font-load hit.
  void renderLatex(" ", "#000000", 16).catch(() => { /* ignore */ });

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
    toolsPanel.update();   // perm changes can disable anchor-create
    anchorsPanel.update(); // canEdit depends on perm
    submitBar.update();
    if (room.state.status === "ended") {
      stopPeerConnections();
      // Wipe collaborative state — we're leaving the room.
      state.anchors.clear();
      state.pendingOps.length = 0;
      state.pendingSubmissions.length = 0;
      state.activeSubmissionPreview = null;
      state.peerDirty.clear();
      anchorsPanel.update();
      submitBar.update();
      dialog.show(room.state.endMessage ?? "");
    }
  };

  // ---------- Peer-to-peer vector sync ----------
  let peerConnections: PeerConnections | null = null;
  let peerConnectionsPromise: Promise<PeerConnections> | null = null;
  let iceServersCache: RTCIceServer[] | null = null;

  const applyRemoteSnapshot = (vectors: Vector[], anchors: Anchor[], perms: Array<[string, "edit" | "view"]>): void => {
    // First-join snapshot from host: replace local store with the official set.
    state.store.vectors.clear();
    for (const v of vectors) state.store.vectors.set(v.id, v);
    state.store.clearHistory();
    state.anchors.clear();
    for (const a of anchors) state.anchors.set(a.id, a);
    // Sync perms — important so the guest knows its own perm and the
    // submission flow can engage for view-only users.
    room.state.perms.clear();
    for (const [pid, perm] of perms) room.state.perms.set(pid, perm);
    // Re-apply any local pending ops on top so view-only users' in-flight work
    // survives a snapshot. (Fixes the lossy-snapshot caveat for view-only users.)
    for (const op of state.pendingOps) state.store.apply(op);
    titleBar.update();
    participantsPanel.update();
    anchorsPanel.update();
    bottomBar.update();
    toolsPanel.update();
    submitBar.update();
    invalidate();
  };

  const handlePeerMessage = (from: string, msg: DataMessage): void => {
    switch (msg.type) {
      case "snapshot":
        debugLog.log("recv", `snapshot ← ${shortId(from)}: ${msg.vectors.length}v ${msg.anchors.length}a ${msg.perms.length}p`);
        applyRemoteSnapshot(msg.vectors, msg.anchors, msg.perms);
        break;
      case "op":
        debugLog.log("recv", `op ← ${shortId(from)}: ${describeOpLocal(msg.op)}`);
        // Remote op: apply without recording in undo, and wipe our local
        // undo history per the spec (remote changes invalidate it).
        state.store.apply(msg.op);
        state.store.clearHistory();
        bottomBar.update();
        invalidate();
        // Host relays the op to OTHER guests so they all converge. Skip the
        // originating sender — they already applied locally and would have
        // their undo clobbered by a self-echo.
        if (room.isHost() && peerConnections) {
          peerConnections.sendToAllExcept(from, { type: "op", op: msg.op });
        }
        break;
      case "anchor-add":
        debugLog.log("recv", `anchor-add ← ${shortId(from)} "${msg.anchor.name}"`);
        state.anchors.set(msg.anchor.id, msg.anchor);
        // Host relays to other guests (not back to the sender).
        if (room.isHost() && peerConnections) {
          peerConnections.sendToAllExcept(from, { type: "anchor-add", anchor: msg.anchor });
        }
        titleBar.update();
        anchorsPanel.update();
        invalidate();
        break;
      case "anchor-delete":
        debugLog.log("recv", `anchor-delete ← ${shortId(from)} ${shortId(msg.anchorId)}`);
        state.anchors.delete(msg.anchorId);
        if (room.isHost() && peerConnections) {
          peerConnections.sendToAllExcept(from, { type: "anchor-delete", anchorId: msg.anchorId });
        }
        titleBar.update();
        anchorsPanel.update();
        invalidate();
        break;
      case "presence-dirty":
        debugLog.log("recv", `presence-dirty ← ${shortId(from)} dirty=${msg.dirty}`);
        if (room.isHost()) {
          if (msg.dirty) state.peerDirty.set(from, true);
          else state.peerDirty.delete(from);
          participantsPanel.update();
        }
        break;
      case "submission":
        debugLog.log("recv", `submission ← ${shortId(from)} ops=${msg.submission.ops.length}`);
        if (room.isHost()) {
          state.pendingSubmissions.push(msg.submission);
          submitBar.update();
        }
        break;
      case "submission-result":
        debugLog.log("recv", `submission-${msg.result} ← ${shortId(from)}`);
        if (msg.result === "accept") {
          // Submitter side: our pending ops will arrive as a normal `op` from
          // the host (the host applied via applyAndRecord which broadcasts).
          // So we just clear our pendingOps and pendingDirty signal.
          state.pendingOps.length = 0;
          state.lastRejectedAt = null;
          if (peerConnections) peerConnections.sendToAll({ type: "presence-dirty", dirty: false });
        } else {
          state.lastRejectedAt = Date.now();
        }
        submitBar.update();
        invalidate();
        break;
      case "perm-update":
        debugLog.log("recv", `perm-update ← ${shortId(from)} ${shortId(msg.peerId)}=${msg.perm}`);
        room.state.perms.set(msg.peerId, msg.perm);
        // If host relays (someone else sent it to us), echo to other guests.
        if (room.isHost() && peerConnections && from !== getMyId()) {
          peerConnections.sendToAll({ type: "perm-update", peerId: msg.peerId, perm: msg.perm });
        }
        // If our own perm changed, refresh things that depend on it.
        if (msg.peerId === getMyId()) {
          titleBar.update();
          bottomBar.update();
          toolsPanel.update();
          anchorsPanel.update();
          submitBar.update();
        }
        participantsPanel.update();
        break;
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
            // Host pushes the current vector + anchor + perms set to a newly-
            // connected guest. The perms entry tells the guest their own perm
            // (otherwise myPerm() defaults to "edit" and the submission flow
            // never engages).
            if (room.isHost()) {
              const vectors = Array.from(state.store.vectors.values());
              const anchors = Array.from(state.anchors.values());
              const perms: Array<[string, "edit" | "view"]> = Array.from(room.state.perms.entries());
              debugLog.log("send", `snapshot → ${shortId(peerId)}: ${vectors.length}v ${anchors.length}a ${perms.length}p`);
              pc.sendTo(peerId, { type: "snapshot", vectors, anchors, perms });
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

  // Route local ops based on role:
  //   - host: broadcast to all guests.
  //   - view-only guest: accumulate into pendingOps and signal presence-dirty
  //                      to host; clear lastRejectedAt since the user has made
  //                      a new edit.
  //   - edit guest: send to host (only peer we have a channel to). The host
  //                 re-broadcasts to other guests via sendToAllExcept.
  state.store.onLocalChange = (op) => {
    debugLog.log("modify", `local op: ${describeOpLocal(op)}`);
    if (!peerConnections) {
      debugLog.log("warn", `op DROPPED — peerConnections not ready yet`);
      return;
    }
    if (room.isHost()) {
      peerConnections.sendToAll({ type: "op", op });
      return;
    }
    if (room.myPerm() === "view") {
      const wasEmpty = state.pendingOps.length === 0;
      state.pendingOps.push(op);
      state.lastRejectedAt = null;
      submitBar.update();
      if (wasEmpty) {
        debugLog.log("send", `presence-dirty → host: true`);
        peerConnections.sendToAll({ type: "presence-dirty", dirty: true });
      }
      return;
    }
    // perm=edit guest — real-time sync via the host as relay.
    peerConnections.sendToAll({ type: "op", op });
  };

  // ---------- Anchors ----------
  async function createAnchorFlow(): Promise<void> {
    const choice = await anchorDialog.prompt();
    if (!choice) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const center = state.view.pixelsToWorld({ x: w / 2, y: h / 2 });
    const anchor: Anchor = {
      id: newAnchorId(),
      name: choice.name,
      color: choice.color,
      author: getMyId(),
      createdAt: Date.now(),
      view: { origin: { ...state.view.origin }, zoom: state.view.zoom },
      position: center,
    };
    state.anchors.set(anchor.id, anchor);
    debugLog.log("draw", `anchor "${anchor.name}" by ${myName()} id=${shortId(anchor.id)}`);
    titleBar.update();
    anchorsPanel.update();
    invalidate();
    // Sync: host broadcasts to all; non-host sends to host (host re-broadcasts
    // on receipt via the handler above).
    if (peerConnections) {
      peerConnections.sendToAll({ type: "anchor-add", anchor });
    }
  }

  function navigateToAnchor(id: string): void {
    const a = state.anchors.get(id);
    if (!a) return;
    state.view.origin = { ...a.view.origin };
    state.view.zoom = a.view.zoom;
    bottomBar.update();
    invalidate();
  }

  function deleteAnchor(id: string): void {
    if (!state.anchors.has(id)) return;
    state.anchors.delete(id);
    titleBar.update();
    anchorsPanel.update();
    invalidate();
    if (peerConnections) {
      peerConnections.sendToAll({ type: "anchor-delete", anchorId: id });
    }
  }

  // ---------- Submission flow (view-only guest side) ----------
  function submitPendingOps(): void {
    if (state.pendingOps.length === 0) return;
    if (!peerConnections) {
      debugLog.log("warn", "submit: peerConnections not ready");
      return;
    }
    const submission: Submission = {
      id: newSubmissionId(),
      fromPeerId: getMyId(),
      fromName: myName(),
      ops: state.pendingOps.slice(),
      submitterView: { origin: { ...state.view.origin }, zoom: state.view.zoom },
      receivedAt: Date.now(),
    };
    debugLog.log("send", `submission → host: ${submission.ops.length} ops`);
    peerConnections.sendToAll({ type: "submission", submission });
    // Keep pendingOps locally until we hear back. On accept we clear them; on
    // reject they stay so the user can keep refining.
  }

  // ---------- Submission flow (host side) ----------
  function toggleSubmissionPreview(): void {
    const active = state.pendingSubmissions[0];
    if (!active) return;
    const existing = state.activeSubmissionPreview;
    if (existing && existing.submissionId === active.id) {
      // Toggle visible flag.
      if (existing.visible) {
        // Hide: restore saved view.
        state.view.origin = { ...existing.savedView.origin };
        state.view.zoom = existing.savedView.zoom;
        existing.visible = false;
      } else {
        // Show again.
        showPreview(active);
        existing.visible = true;
      }
      submitBar.update();
      invalidate();
      return;
    }
    // New preview entry — save current view and zoom appropriately.
    state.activeSubmissionPreview = {
      submissionId: active.id,
      visible: true,
      savedView: { origin: { ...state.view.origin }, zoom: state.view.zoom },
    };
    showPreview(active);
    submitBar.update();
    invalidate();
  }

  function showPreview(submission: Submission): void {
    // Compute the bbox of every vector affected by submission.ops (using the
    // *post-op* vectors). If the submitter's view contains it, use that;
    // otherwise fit-bbox.
    const map = new Map(state.store.vectors);
    for (const op of submission.ops) applyOpsTo(map, op);
    const affected = new Set<string>();
    for (const op of submission.ops) opAffectedIds(op, affected);
    const bbox = computeBboxForIds(map, affected);
    if (!bbox) {
      // No affected vectors? Just use submitter's view.
      state.view.origin = { ...submission.submitterView.origin };
      state.view.zoom = submission.submitterView.zoom;
      return;
    }
    // Try submitter's view first.
    const trial = { origin: { ...submission.submitterView.origin }, zoom: submission.submitterView.zoom };
    const savedOrigin = { ...state.view.origin };
    const savedZoom = state.view.zoom;
    state.view.origin = trial.origin;
    state.view.zoom = trial.zoom;
    const canvasPx = { width: canvas.clientWidth, height: canvas.clientHeight };
    if (state.view.containsBbox(bbox, canvasPx)) {
      // Submitter's view works. Keep it.
    } else {
      // Otherwise fit-bbox.
      state.view.origin = savedOrigin;
      state.view.zoom = savedZoom;
      state.view.fitToBbox(bbox, canvasPx, 60);
    }
    bottomBar.update();
  }

  function acceptActiveSubmission(): void {
    const active = state.pendingSubmissions[0];
    if (!active) return;
    // Restore host's view before applying.
    if (state.activeSubmissionPreview?.submissionId === active.id) {
      state.view.origin = { ...state.activeSubmissionPreview.savedView.origin };
      state.view.zoom = state.activeSubmissionPreview.savedView.zoom;
    }
    const batch: Op = { kind: "batch", ops: active.ops };
    debugLog.log("modify", `accept submission from ${active.fromName}: ${active.ops.length} ops`);
    state.store.applyAndRecord(batch);   // applies + broadcasts via onLocalChange
    if (peerConnections) {
      peerConnections.sendToAll({ type: "submission-result", submissionId: active.id, result: "accept" });
    }
    state.pendingSubmissions.shift();
    state.activeSubmissionPreview = null;
    // Host's local belief: that peer no longer has pending (the submitter
    // clears their pendingOps on accept).
    state.peerDirty.delete(active.fromPeerId);
    submitBar.update();
    participantsPanel.update();
    bottomBar.update();
    invalidate();
  }

  function rejectActiveSubmission(): void {
    const active = state.pendingSubmissions[0];
    if (!active) return;
    if (state.activeSubmissionPreview?.submissionId === active.id) {
      state.view.origin = { ...state.activeSubmissionPreview.savedView.origin };
      state.view.zoom = state.activeSubmissionPreview.savedView.zoom;
    }
    debugLog.log("modify", `reject submission from ${active.fromName}`);
    if (peerConnections) {
      peerConnections.sendToAll({ type: "submission-result", submissionId: active.id, result: "reject" });
    }
    state.pendingSubmissions.shift();
    state.activeSubmissionPreview = null;
    // The submitter still has local pending changes; host's peerDirty stays true.
    submitBar.update();
    bottomBar.update();
    invalidate();
  }

  function computeBboxForIds(map: Map<string, Vector>, ids: Set<string>): BBox | null {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let any = false;
    for (const id of ids) {
      const v = map.get(id);
      if (!v) continue;
      const b = getBoundingBox(v);
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;
      any = true;
    }
    return any ? { minX, minY, maxX, maxY } : null;
  }

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

  const eventCanvasPos = (e: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  /** Hit-test all anchors at the given canvas-space pixel position.
   * Returns the topmost anchor id under the point, or null. */
  const anchorAt = (canvasPx: { x: number; y: number }): string | null => {
    // Iterate in reverse insertion order so later anchors win when stacked.
    const ids = Array.from(state.anchors.keys()).reverse();
    for (const id of ids) {
      const a = state.anchors.get(id);
      if (!a) continue;
      const p = state.view.worldToPixels(a.position);
      const dx = canvasPx.x - p.x;
      const dy = canvasPx.y - p.y;
      if (dx * dx + dy * dy <= ANCHOR_ICON_R * ANCHOR_ICON_R) return id;
    }
    return null;
  };

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
    // Anchor hit-test: clicking an anchor navigates, regardless of tool.
    // Exception: while placing a duplicate the click must commit placement,
    // not navigate. The tool consumes the click in that case.
    if (e.button === 0 && !state.placingDuplicates) {
      const id = anchorAt(eventCanvasPos(e));
      if (id) {
        e.preventDefault();
        navigateToAnchor(id);
        return;
      }
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
    // Hover over an anchor → show name tooltip (and switch cursor).
    // Suppress while placing a duplicate so the tooltip doesn't obscure the
    // preview, and so the cursor stays consistent.
    if (!state.placingDuplicates) {
      const hoverId = anchorAt(eventCanvasPos(e));
      if (hoverId !== state.hoverAnchorId) {
        state.hoverAnchorId = hoverId;
        canvas.style.cursor = hoverId ? "pointer" : TOOLS[state.currentTool].cursor;
        invalidate();
      }
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

  // Clear hover state on mouse leave (modify tool + anchors).
  canvas.addEventListener("pointerleave", () => {
    let dirty = false;
    if (state.hoverId !== null) { state.hoverId = null; dirty = true; }
    if (state.hoverAnchorId !== null) { state.hoverAnchorId = null; dirty = true; }
    if (dirty) invalidate();
  });

  // Global keyboard for tools (polyline Enter/Escape) + a tool-independent
  // Delete/Backspace that wipes the current selection. Selection persists
  // across tool switches, so this handler lets the user select with the
  // select tool then delete from any other tool.
  window.addEventListener("keydown", (e) => {
    // Ignore when typing in input fields
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

    // Ctrl/Cmd-Z = undo; Ctrl/Cmd-Y or Ctrl/Cmd-Shift-Z = redo.
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (e.key === "z" || e.key === "Z")) {
      if (e.shiftKey) state.store.redo();
      else state.store.undo();
      bottomBar.update();
      invalidate();
      e.preventDefault();
      return;
    }
    if (ctrl && (e.key === "y" || e.key === "Y")) {
      state.store.redo();
      bottomBar.update();
      invalidate();
      e.preventDefault();
      return;
    }

    if ((e.key === "Delete" || e.key === "Backspace") && state.selectedIds.size > 0) {
      const ops: Op[] = [];
      for (const id of state.selectedIds) {
        const v = state.store.vectors.get(id);
        if (v) ops.push({ kind: "delete", vector: v });
      }
      if (ops.length > 0) {
        state.store.applyAndRecord(ops.length === 1 ? ops[0]! : { kind: "batch", ops });
      }
      state.selectedIds.clear();
      bottomBar.update();
      invalidate();
      e.preventDefault();
      return;
    }

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
    case "latex":
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

function invertForRevert(op: Op): Op {
  switch (op.kind) {
    case "add": return { kind: "delete", vector: op.vector };
    case "delete": return { kind: "add", vector: op.vector };
    case "replace": return { kind: "replace", before: op.after, after: op.before };
    case "batch": return { kind: "batch", ops: op.ops.slice().reverse().map(invertForRevert) };
  }
}
