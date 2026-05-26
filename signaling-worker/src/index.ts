interface Env {
  ROOMS: DurableObjectNamespace;
  ALLOWED_ORIGINS: string;
}

function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function isAllowed(origin: string, allowed: string[]): boolean {
  return allowed.includes(origin);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") ?? "";
    const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);

    if (req.method === "OPTIONS") {
      const corsOrigin = isAllowed(origin, allowed) ? origin : "";
      return new Response(null, { status: 204, headers: corsHeaders(corsOrigin) });
    }

    if (url.pathname === "/ws") {
      // The WS upgrade comes from the browser; check origin.
      if (!isAllowed(origin, allowed)) {
        return new Response("forbidden", { status: 403 });
      }
      const room = url.searchParams.get("room");
      if (!room || !/^[a-z0-9-]{3,64}$/.test(room)) {
        return new Response("invalid room id", { status: 400 });
      }
      const id = env.ROOMS.idFromName(room);
      const stub = env.ROOMS.get(id);
      return stub.fetch(req);
    }

    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

interface Member {
  socket: WebSocket;
  name: string;
}

type ClientMsg =
  | { type: "join"; name: string }
  | { type: "offer"; to: string; sdp: unknown }
  | { type: "answer"; to: string; sdp: unknown }
  | { type: "ice"; to: string; candidate: unknown }
  | { type: "promote"; to: string };

export class Room {
  private hostId: string | null = null;
  private members: Map<string, Member> = new Map();

  constructor(_state: DurableObjectState, _env: Env) {}

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("ws upgrade required", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.attach(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private attach(socket: WebSocket): void {
    const peerId = crypto.randomUUID().slice(0, 8);
    let joined = false;

    socket.addEventListener("message", (event) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(event.data as string) as ClientMsg;
      } catch {
        return;
      }

      if (msg.type === "join") {
        if (joined) return;
        const name = String(msg.name ?? "").trim().slice(0, 40);
        if (!name) {
          socket.send(JSON.stringify({ type: "error", message: "name required" }));
          socket.close(1008, "name required");
          return;
        }
        joined = true;
        const isHost = this.members.size === 0;
        if (isHost) this.hostId = peerId;
        this.members.set(peerId, { socket, name });

        const others = [...this.members.entries()]
          .filter(([id]) => id !== peerId)
          .map(([id, m]) => ({ peerId: id, name: m.name, isHost: id === this.hostId }));

        socket.send(JSON.stringify({
          type: "joined",
          you: peerId,
          name,
          role: isHost ? "host" : "guest",
          host: this.hostId,
          peers: others,
        }));

        this.broadcastExcept(peerId, {
          type: "peer-joined",
          peerId,
          name,
          isHost,
        });
        return;
      }

      if (!joined) {
        socket.send(JSON.stringify({ type: "error", message: "must join first" }));
        return;
      }

      if (msg.type === "offer" || msg.type === "answer" || msg.type === "ice") {
        const target = this.members.get(msg.to);
        if (!target) return;
        // Strip "to", add "from"
        const { to: _to, ...rest } = msg;
        target.socket.send(JSON.stringify({ ...rest, from: peerId }));
        return;
      }

      if (msg.type === "promote") {
        if (peerId !== this.hostId) return;
        if (!this.members.has(msg.to)) return;
        this.hostId = msg.to;
        this.broadcastAll({ type: "host-changed", host: this.hostId });
        return;
      }
    });

    socket.addEventListener("close", () => {
      if (!joined) return;
      this.members.delete(peerId);
      if (peerId === this.hostId) {
        this.hostId = null;
        this.broadcastAll({ type: "host-gone" });
        for (const m of this.members.values()) {
          try { m.socket.close(1000, "host left"); } catch { /* ignore */ }
        }
        this.members.clear();
      } else {
        this.broadcastAll({ type: "peer-left", peerId });
      }
    });
  }

  private broadcastExcept(except: string, msg: unknown): void {
    const data = JSON.stringify(msg);
    for (const [id, m] of this.members) {
      if (id === except) continue;
      try { m.socket.send(data); } catch { /* ignore */ }
    }
  }

  private broadcastAll(msg: unknown): void {
    const data = JSON.stringify(msg);
    for (const m of this.members.values()) {
      try { m.socket.send(data); } catch { /* ignore */ }
    }
  }
}
