import type { Vector } from "./vectors";
import type { Op } from "./vector-store";
import type { Anchor, AnchorView } from "./anchors";
import type { Submission } from "./submissions";

/** Per-peer permission, mirrors RoomManager's Perm. */
export type PermLite = "edit" | "view";

export type DataMessage =
  | { type: "snapshot"; vectors: Vector[]; anchors: Anchor[]; perms: Array<[string, PermLite]> }
  | { type: "op"; op: Op }
  | { type: "anchor-add"; anchor: Anchor }
  | { type: "anchor-delete"; anchorId: string }
  | { type: "presence-dirty"; dirty: boolean }
  | { type: "submission"; submission: Submission }
  | { type: "submission-result"; submissionId: string; result: "accept" | "reject" }
  | { type: "perm-update"; peerId: string; perm: PermLite };

// Re-export for callers that wire the message into other systems.
export type { AnchorView };

export interface PeerConnectionsHandlers {
  onMessage: (from: string, msg: DataMessage) => void;
  onChannelOpen: (peerId: string) => void;
  onChannelClose: (peerId: string) => void;
  onLog?: (msg: string) => void;
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
    if (this.peers.has(peerId)) {
      this.handlers.onLog?.(`initiate(${short(peerId)}): already connected, skipping`);
      return;
    }
    this.handlers.onLog?.(`initiate → ${short(peerId)}: creating offer`);
    const pc = this.createPeer(peerId);
    const channel = pc.createDataChannel("whiteboard", { ordered: true });
    this.wireChannel(peerId, channel);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.signaling.send({ type: "offer", to: peerId, sdp: offer });
      this.handlers.onLog?.(`offer → ${short(peerId)} sent`);
    } catch (err) {
      console.warn("[peer] initiate failed:", err);
      this.handlers.onLog?.(`initiate(${short(peerId)}) FAILED: ${String(err)}`);
      this.closeConnection(peerId);
    }
  }

  async handleOffer(from: string, sdp: unknown): Promise<void> {
    this.handlers.onLog?.(`offer ← ${short(from)} received`);
    let pc = this.peers.get(from);
    if (!pc) pc = this.createPeer(from);
    pc.ondatachannel = (e) => {
      this.handlers.onLog?.(`ondatachannel ← ${short(from)} (readyState=${e.channel.readyState})`);
      this.wireChannel(from, e.channel);
    };
    try {
      await pc.setRemoteDescription(sdp as RTCSessionDescriptionInit);
      await this.drainPendingIce(from);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.signaling.send({ type: "answer", to: from, sdp: answer });
      this.handlers.onLog?.(`answer → ${short(from)} sent`);
    } catch (err) {
      console.warn("[peer] handleOffer failed:", err);
      this.handlers.onLog?.(`handleOffer(${short(from)}) FAILED: ${String(err)}`);
      this.closeConnection(from);
    }
  }

  async handleAnswer(from: string, sdp: unknown): Promise<void> {
    this.handlers.onLog?.(`answer ← ${short(from)} received`);
    const pc = this.peers.get(from);
    if (!pc) {
      this.handlers.onLog?.(`handleAnswer(${short(from)}) DROPPED: no pc`);
      return;
    }
    try {
      await pc.setRemoteDescription(sdp as RTCSessionDescriptionInit);
      await this.drainPendingIce(from);
    } catch (err) {
      console.warn("[peer] handleAnswer failed:", err);
      this.handlers.onLog?.(`handleAnswer(${short(from)}) FAILED: ${String(err)}`);
    }
  }

  async handleIce(from: string, candidate: unknown): Promise<void> {
    const pc = this.peers.get(from);
    if (!pc || !candidate) {
      this.handlers.onLog?.(`ice ← ${short(from)} DROPPED: ${pc ? "no candidate" : "no pc"}`);
      return;
    }
    if (!pc.remoteDescription) {
      const queue = this.pendingIce.get(from) ?? [];
      queue.push(candidate as RTCIceCandidateInit);
      this.pendingIce.set(from, queue);
      this.handlers.onLog?.(`ice ← ${short(from)} queued (no remoteDescription yet, queue=${queue.length})`);
      return;
    }
    try {
      await pc.addIceCandidate(candidate as RTCIceCandidateInit);
      this.handlers.onLog?.(`ice ← ${short(from)} applied`);
    } catch (err) {
      console.warn("[peer] addIceCandidate failed:", err);
      this.handlers.onLog?.(`ice ← ${short(from)} FAILED: ${String(err)}`);
    }
  }

  closeConnection(peerId: string): void {
    this.handlers.onLog?.(`closeConnection(${short(peerId)})`);
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
    if (!ch || ch.readyState !== "open") {
      this.handlers.onLog?.(`sendTo(${short(peerId)}) FAILED: ch=${ch ? ch.readyState : "missing"}`);
      return false;
    }
    try {
      ch.send(JSON.stringify(msg));
      this.handlers.onLog?.(`→ ${short(peerId)} ${describeDataMessage(msg)}`);
      return true;
    } catch (err) {
      this.handlers.onLog?.(`sendTo(${short(peerId)}) THREW: ${String(err)}`);
      return false;
    }
  }

  sendToAll(msg: DataMessage): void {
    const data = JSON.stringify(msg);
    let sent = 0;
    let skipped = 0;
    for (const [peerId, ch] of this.channels.entries()) {
      if (ch.readyState !== "open") { skipped++; continue; }
      try {
        ch.send(data);
        sent++;
        this.handlers.onLog?.(`→ ${short(peerId)} ${describeDataMessage(msg)}`);
      } catch (err) {
        this.handlers.onLog?.(`sendToAll(${short(peerId)}) THREW: ${String(err)}`);
      }
    }
    if (sent === 0) {
      this.handlers.onLog?.(`sendToAll DROPPED ${describeDataMessage(msg)} (channels=${this.channels.size}, skipped=${skipped})`);
    }
  }

  hasOpenChannelTo(peerId: string): boolean {
    return this.channels.get(peerId)?.readyState === "open";
  }

  private createPeer(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peers.set(peerId, pc);
    pc.onicecandidate = (e) => {
      if (!e.candidate) {
        this.handlers.onLog?.(`ice gathering for ${short(peerId)} complete`);
        return;
      }
      this.signaling.send({ type: "ice", to: peerId, candidate: e.candidate.toJSON() });
    };
    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      this.handlers.onLog?.(`pc(${short(peerId)}) iceState=${s}`);
      if (s === "failed" || s === "disconnected" || s === "closed") {
        // Don't close on transient disconnects; only on hard failures.
        if (s === "failed" || s === "closed") this.closeConnection(peerId);
      }
    };
    pc.onconnectionstatechange = () => {
      this.handlers.onLog?.(`pc(${short(peerId)}) connectionState=${pc.connectionState}`);
    };
    pc.onsignalingstatechange = () => {
      this.handlers.onLog?.(`pc(${short(peerId)}) signalingState=${pc.signalingState}`);
    };
    return pc;
  }

  private wireChannel(peerId: string, ch: RTCDataChannel): void {
    this.channels.set(peerId, ch);
    this.handlers.onLog?.(`wireChannel(${short(peerId)}) readyState=${ch.readyState}`);
    // If the channel already opened by the time we wired it, fire onopen manually.
    if (ch.readyState === "open") {
      queueMicrotask(() => this.handlers.onChannelOpen(peerId));
    }
    ch.onopen = () => {
      this.handlers.onLog?.(`channel(${short(peerId)}) OPEN`);
      this.handlers.onChannelOpen(peerId);
    };
    ch.onclose = () => {
      this.handlers.onLog?.(`channel(${short(peerId)}) CLOSE`);
      this.handlers.onChannelClose(peerId);
    };
    ch.onerror = (ev) => {
      this.handlers.onLog?.(`channel(${short(peerId)}) ERROR: ${String((ev as ErrorEvent).message ?? ev.type)}`);
    };
    ch.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as DataMessage;
        this.handlers.onLog?.(`← ${short(peerId)} ${describeDataMessage(msg)}`);
        this.handlers.onMessage(peerId, msg);
      } catch (err) {
        console.warn("[peer] bad message:", err);
        this.handlers.onLog?.(`← ${short(peerId)} bad message: ${String(err)}`);
      }
    };
  }

  private async drainPendingIce(from: string): Promise<void> {
    const queue = this.pendingIce.get(from);
    if (!queue) return;
    const pc = this.peers.get(from);
    this.pendingIce.delete(from);
    if (!pc) return;
    this.handlers.onLog?.(`drainPendingIce(${short(from)}): ${queue.length}`);
    for (const c of queue) {
      try { await pc.addIceCandidate(c); } catch { /* ignore */ }
    }
  }
}

function short(peerId: string): string {
  return peerId.length > 8 ? peerId.slice(0, 8) : peerId;
}

function describeDataMessage(msg: DataMessage): string {
  switch (msg.type) {
    case "snapshot": return `snapshot[${msg.vectors.length}v ${msg.anchors.length}a ${msg.perms.length}p]`;
    case "op": return `op:${describeOp(msg.op)}`;
    case "anchor-add": return `anchor-add ${short(msg.anchor.id)} "${msg.anchor.name}"`;
    case "anchor-delete": return `anchor-delete ${short(msg.anchorId)}`;
    case "presence-dirty": return `presence-dirty=${msg.dirty}`;
    case "submission": return `submission ${short(msg.submission.id)} ops=${msg.submission.ops.length}`;
    case "submission-result": return `submission-${msg.result} ${short(msg.submissionId)}`;
    case "perm-update": return `perm-update ${short(msg.peerId)}=${msg.perm}`;
  }
}

function describeOp(op: Op): string {
  switch (op.kind) {
    case "add": return `add ${op.vector.kind} id=${short(op.vector.id)}`;
    case "delete": return `delete ${op.vector.kind} id=${short(op.vector.id)}`;
    case "replace": return `replace ${op.after.kind} id=${short(op.after.id)}`;
    case "batch": return `batch[${op.ops.length}]`;
  }
}
