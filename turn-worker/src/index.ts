interface Env {
  METERED_DOMAIN: string;
  METERED_API_KEY: string;
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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get("Origin") ?? "";
    const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
    const corsOrigin = allowed.includes(origin) ? origin : "";

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(corsOrigin) });
    }
    if (!corsOrigin) {
      return new Response("forbidden", { status: 403 });
    }

    const url = new URL(req.url);
    if (url.pathname !== "/ice") {
      return new Response("not found", { status: 404, headers: corsHeaders(corsOrigin) });
    }

    const upstream = `https://${env.METERED_DOMAIN}/api/v1/turn/credentials?apiKey=${env.METERED_API_KEY}`;
    const res = await fetch(upstream);
    if (!res.ok) {
      return new Response(`metered upstream: ${res.status}`, {
        status: 502,
        headers: corsHeaders(corsOrigin),
      });
    }

    const iceServers = await res.json();
    return new Response(JSON.stringify({ iceServers }), {
      headers: { "Content-Type": "application/json", ...corsHeaders(corsOrigin) },
    });
  },
} satisfies ExportedHandler<Env>;
