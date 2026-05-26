// URL of the deployed Cloudflare Worker (see turn-worker/) that mints
// ephemeral TURN credentials from metered.ca. After running
// `npx wrangler deploy` in turn-worker/, paste the printed URL here.
//
// Until this is set, the app falls back to STUN-only — which works on
// most home networks but will fail behind symmetric NATs and many
// corporate firewalls.
const WORKER_URL = "https://whiteboard-turn.andsmith.workers.dev/ice";

const STUN_FALLBACK: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

export async function loadIceServers(): Promise<RTCIceServer[]> {
  if (WORKER_URL.includes("REPLACE_ME")) {
    console.warn("[ice] WORKER_URL not configured — using STUN-only fallback");
    return STUN_FALLBACK;
  }
  try {
    const res = await fetch(WORKER_URL);
    if (!res.ok) throw new Error(`worker responded ${res.status}`);
    const data = (await res.json()) as { iceServers: RTCIceServer[] };
    return data.iceServers;
  } catch (err) {
    console.warn("[ice] failed to fetch TURN credentials, falling back to STUN-only:", err);
    return STUN_FALLBACK;
  }
}
