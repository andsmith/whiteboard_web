# whiteboard_web

Collaborative whiteboard (p2p, browser-based) over WebRTC.

Live site: https://andsmith.github.io/whiteboard_web/

## Layout

- `index.html` — personal landing page.
- `whiteboard/` — the whiteboard web app.
- `src/` — TypeScript source.
- `lib/`, `workers/`, `wasm/`, `assets/` — placeholders for shared code, web workers, wasm modules, and static assets.

## Development

```
npm install
npm run dev
```

Open the printed localhost URL. The landing page links to `/whiteboard/`.

## Build

```
npm run build
npm run preview
```

`npm run build` runs `tsc --noEmit` then `vite build`, emitting to `dist/`.

## Deploy

Pushes to `main` trigger `.github/workflows/deploy.yml` which builds and publishes
to GitHub Pages. In repo Settings → Pages, set source to **GitHub Actions**.

## Signaling

For now, WebRTC signaling is manual SDP copy/paste between two browser tabs
(no backend). A real signaling server may be added later.
