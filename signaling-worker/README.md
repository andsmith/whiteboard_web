# whiteboard-signal (Cloudflare Worker + Durable Object)

WebSocket signaling for the whiteboard app. Holds the membership list
for each room and forwards offers/answers/ICE between peers. **No
whiteboard data flows through here** — once peers connect, the data
channel is direct (host ↔ each guest).

The Durable Object `Room` is the per-room actor: one instance per
room ID, holds the connected sockets, decides who's host, broadcasts
membership changes.

## Setup

```
cd signaling-worker
npm install
npx wrangler login           # if not already logged in
npx wrangler deploy
```

The first deploy creates the Worker at
`https://whiteboard-signal.andsmith.workers.dev` and provisions the
Durable Object namespace.

There are no secrets to configure — origin allowlist is in
`wrangler.toml` under `ALLOWED_ORIGINS`.

## Local development

```
npm run dev
```

Runs the Worker at `http://localhost:8787`. WebSocket endpoint is
`ws://localhost:8787/ws?room=<id>`.

## Protocol

WebSocket endpoint: `GET /ws?room=<roomId>` where `roomId` matches
`/^[a-z0-9-]{3,64}$/`. The room is created lazily on first connection
— the first peer to join becomes the host.

### Client → server

| type      | fields                    | who can send         |
| --------- | ------------------------- | -------------------- |
| `join`    | `name`                    | once, before others  |
| `offer`   | `to`, `sdp`               | any joined peer      |
| `answer`  | `to`, `sdp`               | any joined peer      |
| `ice`     | `to`, `candidate`         | any joined peer      |
| `promote` | `to`                      | host only            |

### Server → client

| type           | fields                                       |
| -------------- | -------------------------------------------- |
| `joined`       | `you`, `name`, `role`, `host`, `peers[]`     |
| `peer-joined`  | `peerId`, `name`, `isHost`                   |
| `peer-left`    | `peerId`                                     |
| `offer`        | `from`, `sdp`                                |
| `answer`       | `from`, `sdp`                                |
| `ice`          | `from`, `candidate`                          |
| `host-changed` | `host` (new host peer id)                    |
| `host-gone`    | (room is over; server closes all sockets)    |
| `error`        | `message`                                    |

### Room lifecycle

- Empty room → first joiner becomes host.
- Host disconnects without promoting → `host-gone` to everyone, all
  sockets closed, room dies. No auto-promote.
- Host explicitly `promote`s a guest → `host-changed` broadcast; the
  promoting peer becomes a guest.
- A guest disconnects → `peer-left` broadcast.

## Security notes

- Room IDs are essentially passwords. The client picks them; the
  default ID format is "three-random-words" (~20 bits of entropy).
  Fine for ephemeral meetings, not for sensitive content. If anyone
  guesses the ID before you join, they could become host.
- Origin allowlist enforced at the upgrade — only browsers on
  `andsmith.net` (and localhost dev) can connect.
- The server doesn't authenticate identities; the `name` field is
  whatever the client claims. Treat it as a display label, not proof.
