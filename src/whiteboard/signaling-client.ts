const SIGNALING_URL = "wss://whiteboard-signal.andsmith.workers.dev/ws";

export type Role = "host" | "guest";

export interface Peer {
  peerId: string;
  name: string;
  isHost: boolean;
}

export type ServerMessage =
  | { type: "joined"; you: string; name: string; role: Role; host: string; peers: Peer[] }
  | { type: "peer-joined"; peerId: string; name: string; isHost: boolean }
  | { type: "peer-left"; peerId: string }
  | { type: "host-changed"; host: string }
  | { type: "host-gone" }
  | { type: "offer"; from: string; sdp: unknown }
  | { type: "answer"; from: string; sdp: unknown }
  | { type: "ice"; from: string; candidate: unknown }
  | { type: "error"; message: string };

export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "offer"; to: string; sdp: unknown }
  | { type: "answer"; to: string; sdp: unknown }
  | { type: "ice"; to: string; candidate: unknown }
  | { type: "promote"; to: string };

export interface SignalingHandlers {
  onMessage: (msg: ServerMessage) => void;
  onClose: () => void;
  onError: (msg: string) => void;
}

export interface Signaling {
  send: (msg: ClientMessage) => void;
  close: () => void;
}

export function connect(room: string, name: string, handlers: SignalingHandlers): Signaling {
  const url = `${SIGNALING_URL}?room=${encodeURIComponent(room)}`;
  const ws = new WebSocket(url);

  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ type: "join", name } satisfies ClientMessage));
  });

  ws.addEventListener("message", (e) => {
    try {
      const msg = JSON.parse(e.data as string) as ServerMessage;
      handlers.onMessage(msg);
    } catch {
      handlers.onError("malformed server message");
    }
  });

  ws.addEventListener("close", () => handlers.onClose());
  ws.addEventListener("error", () => handlers.onError("websocket error"));

  return {
    send: (msg) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
    close: () => {
      try { ws.close(); } catch { /* ignore */ }
    },
  };
}
