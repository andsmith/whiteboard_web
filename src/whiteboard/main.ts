import { initBoard } from "./board";
import { createPeer, createOffer, acceptOffer, acceptAnswer } from "./rtc";
import { readRemoteSDP, writeLocalSDP, setStatus } from "./signaling";
import { loadIceServers } from "./ice-config";
import { connect, type Signaling, type Peer, type ServerMessage } from "./signaling-client";
import { generateRoomId, isValidRoomId } from "./room-id";

const NAME_KEY = "whiteboard:name";

interface RoomState {
  signaling: Signaling;
  roomId: string;
  you: string;
  hostId: string;
  peers: Map<string, Peer>;
}

let roomState: RoomState | null = null;

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("board") as HTMLCanvasElement | null;
  if (canvas) initBoard(canvas);

  setupLobby();
  setupManualSdp();

  window.addEventListener("hashchange", refreshLobbyForHash);
});

/* ============================================================
 * Lobby (pre-room) UI
 * ============================================================ */

let nameCommitted = false;

function setupLobby(): void {
  const nameInput = el<HTMLInputElement>("name-input");
  const btnEnter = el<HTMLButtonElement>("btn-enter-name");
  const btnCreate = el<HTMLButtonElement>("btn-create");
  const btnJoin = el<HTMLButtonElement>("btn-join");
  const nameState = el<HTMLSpanElement>("name-state");

  const saved = safeLocalGet(NAME_KEY);
  if (saved && nameInput) {
    nameInput.value = saved;
    nameCommitted = true;
  }

  const refresh = () => {
    const name = nameInput?.value.trim() ?? "";
    const hasName = name.length > 0;
    if (btnEnter) {
      btnEnter.disabled = !hasName;
      btnEnter.textContent = nameCommitted ? "Change" : "Enter";
    }
    if (btnCreate) btnCreate.disabled = !nameCommitted || !hasName;
    if (btnJoin) btnJoin.disabled = !nameCommitted || !hasName;
    if (nameState) nameState.textContent = nameCommitted ? "✓ saved" : (hasName ? "press Enter to confirm" : "");
    if (nameInput) nameInput.readOnly = nameCommitted;
  };
  refresh();

  nameInput?.addEventListener("input", () => {
    nameCommitted = false;
    refresh();
  });
  nameInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitName();
    }
  });
  btnEnter?.addEventListener("click", () => {
    if (nameCommitted) {
      nameCommitted = false;
      refresh();
      nameInput?.focus();
      nameInput?.select();
    } else {
      commitName();
    }
  });

  function commitName(): void {
    const name = nameInput?.value.trim() ?? "";
    if (!name) return;
    safeLocalSet(NAME_KEY, name);
    nameCommitted = true;
    refresh();
  }

  btnCreate?.addEventListener("click", () => {
    const name = nameInput?.value.trim() ?? "";
    if (!name || !nameCommitted) return;
    const roomId = generateRoomId();
    location.hash = roomId;
    enterRoom(roomId, name);
  });

  btnJoin?.addEventListener("click", () => {
    const name = nameInput?.value.trim() ?? "";
    if (!name || !nameCommitted) return;
    let roomId = hashRoomId();
    if (!roomId) {
      const entered = window.prompt("Room ID to join (from shared link, e.g. brave-azure-fox):");
      if (!entered) return;
      const trimmed = entered.trim().replace(/^#/, "");
      if (!isValidRoomId(trimmed)) {
        setLobbyStatus(`invalid room id: ${trimmed}`);
        return;
      }
      roomId = trimmed;
      location.hash = roomId;
    }
    enterRoom(roomId, name);
  });

  refreshLobbyForHash();
}

function hashRoomId(): string | null {
  const raw = location.hash.replace(/^#/, "").trim();
  return raw && isValidRoomId(raw) ? raw : null;
}

function refreshLobbyForHash(): void {
  const roomId = hashRoomId();
  const prompt = el<HTMLSpanElement>("join-prompt");
  const display = el<HTMLElement>("join-room-id");
  if (roomId) {
    if (display) display.textContent = roomId;
    prompt?.removeAttribute("hidden");
  } else {
    prompt?.setAttribute("hidden", "");
  }
}

/* ============================================================
 * In-room UI + signaling
 * ============================================================ */

function enterRoom(roomId: string, name: string): void {
  setLobbyStatus(`connecting to ${roomId}...`);

  const signaling = connect(roomId, name, {
    onMessage: (msg) => handleServerMessage(msg, roomId),
    onClose: () => {
      if (!roomState) {
        setLobbyStatus("connection closed before joining");
      }
      teardownRoom();
    },
    onError: (m) => setLobbyStatus(`signaling error: ${m}`),
  });

  // roomState is fully populated once the "joined" message arrives.
  // Stash signaling early so teardown can find it if WS closes prematurely.
  roomState = {
    signaling,
    roomId,
    you: "",
    hostId: "",
    peers: new Map(),
  };
}

function handleServerMessage(msg: ServerMessage, roomId: string): void {
  if (!roomState) return;

  switch (msg.type) {
    case "joined":
      roomState.you = msg.you;
      roomState.hostId = msg.host;
      roomState.peers.clear();
      for (const p of msg.peers) roomState.peers.set(p.peerId, p);
      showInRoom(roomId);
      renderRoom();
      break;
    case "peer-joined":
      roomState.peers.set(msg.peerId, { peerId: msg.peerId, name: msg.name, isHost: msg.isHost });
      renderRoom();
      break;
    case "peer-left":
      roomState.peers.delete(msg.peerId);
      renderRoom();
      break;
    case "host-changed":
      roomState.hostId = msg.host;
      for (const p of roomState.peers.values()) p.isHost = (p.peerId === msg.host);
      renderRoom();
      break;
    case "host-gone":
      setLobbyStatus("meeting ended (host left)");
      teardownRoom();
      break;
    case "error":
      setLobbyStatus(`server error: ${msg.message}`);
      break;
    // offer / answer / ice handled in step 3
  }
}

function showInRoom(roomId: string): void {
  el<HTMLDivElement>("lobby")?.setAttribute("hidden", "");
  el<HTMLDivElement>("in-room")?.removeAttribute("hidden");
  const display = el<HTMLElement>("room-id-display");
  if (display) display.textContent = roomId;
}

function renderRoom(): void {
  if (!roomState) return;
  const list = el<HTMLUListElement>("participants");
  if (!list) return;
  list.innerHTML = "";

  const youIsHost = roomState.you === roomState.hostId;
  const youName = safeLocalGet(NAME_KEY) ?? "you";

  const entries = [
    { peerId: roomState.you, name: youName, isHost: youIsHost, isYou: true },
    ...[...roomState.peers.values()].map((p) => ({ ...p, isYou: false })),
  ];

  for (const p of entries) {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = p.name;
    li.appendChild(label);

    if (p.isYou) {
      const tag = document.createElement("span");
      tag.className = "tag you";
      tag.textContent = "you";
      li.appendChild(tag);
    }
    if (p.isHost) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "host";
      li.appendChild(tag);
    }
    if (youIsHost && !p.isYou && !p.isHost) {
      const btn = document.createElement("button");
      btn.textContent = "Make host";
      btn.addEventListener("click", () => promote(p.peerId));
      li.appendChild(btn);
    }
    list.appendChild(li);
  }

  const status = el<HTMLElement>("room-status");
  if (status) status.textContent = `connected as ${youIsHost ? "host" : "guest"} • ${entries.length} participant${entries.length === 1 ? "" : "s"}`;
}

function promote(peerId: string): void {
  if (!roomState) return;
  roomState.signaling.send({ type: "promote", to: peerId });
}

function teardownRoom(): void {
  if (roomState) {
    try { roomState.signaling.close(); } catch { /* ignore */ }
    roomState = null;
  }
  el<HTMLDivElement>("in-room")?.setAttribute("hidden", "");
  el<HTMLDivElement>("lobby")?.removeAttribute("hidden");
  const list = el<HTMLUListElement>("participants");
  if (list) list.innerHTML = "";
  if (location.hash) {
    history.replaceState(null, "", location.pathname + location.search);
    refreshLobbyForHash();
  }
}

function setLobbyStatus(msg: string): void {
  const node = el<HTMLDivElement>("lobby-status");
  if (node) node.textContent = msg;
}

// Wire up share-link copy and leave buttons
window.addEventListener("DOMContentLoaded", () => {
  el<HTMLButtonElement>("btn-copy-url")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      const btn = el<HTMLButtonElement>("btn-copy-url");
      if (btn) {
        const original = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => { if (btn) btn.textContent = original; }, 1200);
      }
    } catch { /* ignore */ }
  });
  el<HTMLButtonElement>("btn-leave")?.addEventListener("click", () => {
    teardownRoom();
  });
});

/* ============================================================
 * Manual SDP path (unchanged from before; will move behind ?mode=manual)
 * ============================================================ */

function setupManualSdp(): void {
  const local = el<HTMLTextAreaElement>("local-sdp");
  if (local) local.value = "";
  const remote = el<HTMLTextAreaElement>("remote-sdp");
  if (remote) remote.value = "";

  setStatus("loading TURN credentials...");
  const peerPromise = loadIceServers().then((iceServers) => {
    const p = createPeer({ iceServers });
    p.addEventListener("connectionstatechange", () => {
      setStatus(`peer: ${p.connectionState}`);
    });
    setStatus("idle");
    return p;
  });

  el<HTMLButtonElement>("btn-create-offer")?.addEventListener("click", async () => {
    setStatus("creating offer...");
    const peer = await peerPromise;
    const sdp = await createOffer(peer);
    writeLocalSDP(sdp);
    setStatus("offer created — copy to peer");
  });

  el<HTMLButtonElement>("btn-accept-offer")?.addEventListener("click", async () => {
    const remoteSdp = readRemoteSDP();
    if (!remoteSdp) return setStatus("paste a remote offer first");
    setStatus("creating answer...");
    const peer = await peerPromise;
    const answer = await acceptOffer(peer, remoteSdp);
    writeLocalSDP(answer);
    setStatus("answer created — copy back to peer");
  });

  el<HTMLButtonElement>("btn-accept-answer")?.addEventListener("click", async () => {
    const remoteSdp = readRemoteSDP();
    if (!remoteSdp) return setStatus("paste a remote answer first");
    const peer = await peerPromise;
    await acceptAnswer(peer, remoteSdp);
    setStatus("answer applied");
  });
}

/* ============================================================
 * Helpers
 * ============================================================ */

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function safeLocalGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}

function safeLocalSet(k: string, v: string): void {
  try { localStorage.setItem(k, v); } catch { /* ignore */ }
}
