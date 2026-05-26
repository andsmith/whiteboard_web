# whiteboard-turn (Cloudflare Worker)

Mints ephemeral TURN credentials by proxying to metered.ca. The browser
calls `GET <worker-url>/ice` and gets back `{ iceServers: [...] }` ready
to hand to `new RTCPeerConnection`.

The metered "Secret key" is held in a Cloudflare Worker secret — it
never reaches the browser.

## One-time setup

1. Edit `wrangler.toml` and set `METERED_DOMAIN` to the "Metered domain"
   value shown in your metered.ca app dashboard (e.g.
   `andsmith-whiteboard.metered.live`).
2. Install deps and authenticate Wrangler with your Cloudflare account:
   ```
   cd turn-worker
   npm install
   npx wrangler login
   ```
3. Store the metered secret key as a Worker secret (you'll be prompted
   to paste it):
   ```
   npx wrangler secret put METERED_API_KEY
   ```
4. Deploy:
   ```
   npx wrangler deploy
   ```
   Wrangler prints the Worker URL — something like
   `https://whiteboard-turn.<your-subdomain>.workers.dev`.

5. Paste that URL into `../src/whiteboard/ice-config.ts` (the
   `WORKER_URL` constant). Rebuild the site and push.

## Local development

`npm run dev` runs the Worker locally at `http://localhost:8787`.
You'll need the secret available locally too — create a `.dev.vars`
file (gitignored) with `METERED_API_KEY=<the secret>`.

## Updating

Code changes: edit `src/index.ts`, then `npx wrangler deploy`.
Config changes: edit `wrangler.toml`, then `npx wrangler deploy`.
Secret changes: re-run `npx wrangler secret put METERED_API_KEY`.

## What it does

- Accepts `GET /ice` from origins listed in `ALLOWED_ORIGINS`.
- Calls `https://<METERED_DOMAIN>/api/v1/turn/credentials?apiKey=<secret>`.
- Returns the iceServers array wrapped as `{ iceServers }` with CORS
  headers restricting access to the configured origins.

All other paths return 404. Disallowed origins get 403.
