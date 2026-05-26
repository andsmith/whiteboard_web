import { connect, type Signaling, type Peer, type ServerMessage } from "./signaling-client";

export type Role = "host" | "guest";
export type Perm = "edit" | "view";
export type RoomStatus = "idle" | "connecting" | "joined" | "ended";

export interface RoomManagerState {
  status: RoomStatus;
  roomId: string | null;
  you: string | null;
  yourName: string | null;
  hostId: string | null;
  peers: Map<string, Peer>;
  perms: Map<string, Perm>;
  endMessage: string | null;
}

export class RoomManager {
  state: RoomManagerState = freshState();
  onChange: () => void = () => {};
  private signaling: Signaling | null = null;

  isHost(): boolean {
    return this.state.you !== null && this.state.you === this.state.hostId;
  }

  myPerm(): Perm {
    if (!this.state.you || this.isHost()) return "edit";
    return this.state.perms.get(this.state.you) ?? "edit";
  }

  participantCount(): number {
    if (this.state.status !== "joined") return 0;
    return this.state.peers.size + 1;
  }

  enter(roomId: string, name: string): void {
    this.state = freshState();
    this.state.status = "connecting";
    this.state.roomId = roomId;
    this.state.yourName = name;
    this.onChange();
    this.signaling = connect(roomId, name, {
      onMessage: (m) => this.handleMessage(m),
      onClose: () => {
        if (this.state.status !== "ended") this.end("connection closed");
      },
      onError: (e) => this.end(`signaling error: ${e}`),
    });
  }

  leave(): void {
    if (this.signaling) {
      try { this.signaling.close(); } catch { /* ignore */ }
      this.signaling = null;
    }
    this.end(null);
  }

  promote(peerId: string): void {
    this.signaling?.send({ type: "promote", to: peerId });
  }

  setPerm(peerId: string, perm: Perm): void {
    this.state.perms.set(peerId, perm);
    // Future: signal to peer / over data channel. No server route for this yet.
    this.onChange();
  }

  private end(message: string | null): void {
    this.state.status = "ended";
    this.state.endMessage = message;
    this.onChange();
  }

  private handleMessage(msg: ServerMessage): void {
    if (this.state.status === "ended") return;
    switch (msg.type) {
      case "joined":
        this.state.status = "joined";
        this.state.you = msg.you;
        this.state.hostId = msg.host;
        this.state.peers.clear();
        for (const p of msg.peers) {
          this.state.peers.set(p.peerId, p);
          if (!this.state.perms.has(p.peerId)) this.state.perms.set(p.peerId, "edit");
        }
        break;
      case "peer-joined":
        this.state.peers.set(msg.peerId, { peerId: msg.peerId, name: msg.name, isHost: msg.isHost });
        if (!this.state.perms.has(msg.peerId)) this.state.perms.set(msg.peerId, "edit");
        break;
      case "peer-left":
        this.state.peers.delete(msg.peerId);
        this.state.perms.delete(msg.peerId);
        break;
      case "host-changed":
        this.state.hostId = msg.host;
        for (const p of this.state.peers.values()) {
          p.isHost = p.peerId === msg.host;
        }
        break;
      case "host-gone":
        this.end("Meeting ended (host left)");
        return;
    }
    this.onChange();
  }
}

function freshState(): RoomManagerState {
  return {
    status: "idle",
    roomId: null,
    you: null,
    yourName: null,
    hostId: null,
    peers: new Map(),
    perms: new Map(),
    endMessage: null,
  };
}
