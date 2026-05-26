import type { Vector } from "./vectors";
import type { Op } from "./vector-store";

export type DataMessage =
  | { type: "snapshot"; vectors: Vector[] }
  | { type: "op"; op: Op };

export interface PeerConnectionsHandlers {
  onMessage: (from: string, msg: DataMessage) => void;
  onChannelOpen: (peerId: string) => void;
  onChannelClose: (peerId: string) => void;
}

export type RelayMessage =
  | { type: "offer"; to: string; sdp: unknown }
  | { type: "answer"; to: string; sdp: unknown }
  | { type: "ice"; to: string; candidate: unknown };

export interface SignalingSender {
  send(msg: RelayMessage): void;
}

export class PeerConnections {
  private peers = new Map<string, RTCPeerConnection>();
  private channels = new Map<string, RTCDataChannel>();
  private pendingIce = new Map<string, RTCIceCandidateInit[]>();

  constructor(
    private iceServers: RTCIceServer[],
    private signaling: SignalingSender,
    private handlers: PeerConnectionsHandlers,
  ) {}

  /** Initiator side: create connection + data channel + send offer. */
  async initiate(peerId: string): Promise<void> {
    if (this.peers.has(peerId)) return;
    const pc = this.createPeer(peerId);
    const channel = pc.createDataChannel("whiteboard", { ordered: true });
    this.wireChannel(peerId, channel);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.signaling.send({ type: "offer", to: peerId, sdp: offer });
    } catch (err) {
      console.warn("[peer] initiate failed:", err);
      this.closeConnection(peerId);
    }
  }

  async handleOffer(from: string, sdp: unknown): Promise<void> {
    let pc = this.peers.get(from);
    if (!pc) pc = this.createPeer(from);
    pc.ondatachannel = (e) => this.wireChannel(from, e.channel);
    try {
      await pc.setRemoteDescription(sdp as RTCSessionDescriptionInit);
      await this.drainPendingIce(from);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.signaling.send({ type: "answer", to: from, sdp: answer });
    } catch (err) {
      console.warn("[peer] handleOffer failed:", err);
      this.closeConnection(from);
    }
  }

  async handleAnswer(from: string, sdp: unknown): Promise<void> {
    const pc = this.peers.get(from);
    if (!pc) return;
    try {
      await pc.setRemoteDescription(sdp as RTCSessionDescriptionInit);
      await this.drainPendingIce(from);
    } catch (err) {
      console.warn("[peer] handleAnswer failed:", err);
    }
  }

  async handleIce(from: string, candidate: unknown): Promise<void> {
    const pc = this.peers.get(from);
    if (!pc || !candidate) return;
    if (!pc.remoteDescription) {
      const queue = this.pendingIce.get(from) ?? [];
      queue.push(candidate as RTCIceCandidateInit);
      this.pendingIce.set(from, queue);
      return;
    }
    try {
      await pc.addIceCandidate(candidate as RTCIceCandidateInit);
    } catch (err) {
      console.warn("[peer] addIceCandidate failed:", err);
    }
  }

  closeConnection(peerId: string): void {
    try { this.channels.get(peerId)?.close(); } catch { /* ignore */ }
    try { this.peers.get(peerId)?.close(); } catch { /* ignore */ }
    this.channels.delete(peerId);
    this.peers.delete(peerId);
    this.pendingIce.delete(peerId);
  }

  closeAll(): void {
    for (const id of Array.from(this.peers.keys())) this.closeConnection(id);
  }

  sendTo(peerId: string, msg: DataMessage): boolean {
    const ch = this.channels.get(peerId);
    if (!ch || ch.readyState !== "open") return false;
    try { ch.send(JSON.stringify(msg)); return true; } catch { return false; }
  }

  sendToAll(msg: DataMessage): void {
    const data = JSON.stringify(msg);
    for (const ch of this.channels.values()) {
      if (ch.readyState !== "open") continue;
      try { ch.send(data); } catch { /* ignore */ }
    }
  }

  hasOpenChannelTo(peerId: string): boolean {
    return this.channels.get(peerId)?.readyState === "open";
  }

  private createPeer(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peers.set(peerId, pc);
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      this.signaling.send({ type: "ice", to: peerId, candidate: e.candidate.toJSON() });
    };
    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      if (s === "failed" || s === "disconnected" || s === "closed") {
        // Don't close on transient disconnects; only on hard failures.
        if (s === "failed" || s === "closed") this.closeConnection(peerId);
      }
    };
    return pc;
  }

  private wireChannel(peerId: string, ch: RTCDataChannel): void {
    this.channels.set(peerId, ch);
    ch.onopen = () => this.handlers.onChannelOpen(peerId);
    ch.onclose = () => this.handlers.onChannelClose(peerId);
    ch.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as DataMessage;
        this.handlers.onMessage(peerId, msg);
      } catch (err) {
        console.warn("[peer] bad message:", err);
      }
    };
  }

  private async drainPendingIce(from: string): Promise<void> {
    const queue = this.pendingIce.get(from);
    if (!queue) return;
    const pc = this.peers.get(from);
    this.pendingIce.delete(from);
    if (!pc) return;
    for (const c of queue) {
      try { await pc.addIceCandidate(c); } catch { /* ignore */ }
    }
  }
}
