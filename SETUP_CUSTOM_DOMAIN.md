# Set up `andsmith.net` as the custom domain for this GitHub Pages site

You are working in the `whiteboard_web` repo. Your job is to make the necessary
code/config changes so that the site serves correctly from the apex domain
`andsmith.net` instead of `andsmith.github.io/whiteboard_web/`.

DNS configuration at the registrar and the "Custom domain" field in GitHub
repo Settings → Pages are **out of scope** for this task — the human will do
those manually. You are only making the in-repo changes.

## Context

- Repo currently builds with Vite, deploys via `.github/workflows/deploy.yml`
  to GitHub Pages.
- `vite.config.ts` has `base: "/whiteboard_web/"` because the site is served
  from a project-page subpath today.
- On the apex domain `andsmith.net`, the site will be served from the root,
  so every absolute `/whiteboard_web/...` URL in built output will 404.
- The workflow deploys from a GitHub Actions workflow (not a branch), so a
  `CNAME` file is not auto-created — we have to ship one ourselves in `public/`
  so Vite copies it into `dist/`.

## Changes to make

### 1. `vite.config.ts`
Change `base: "/whiteboard_web/"` to `base: "/"`.

### 2. `index.html` (landing page at repo root)
Change the favicon and manifest hrefs from `/whiteboard_web/favicon.ico` and
`/whiteboard_web/manifest.json` to `/favicon.ico` and `/manifest.json`.

### 3. `whiteboard/index.html`
Same fix: `/whiteboard_web/favicon.ico` → `/favicon.ico`, and
`/whiteboard_web/manifest.json` → `/manifest.json`.

### 4. `manifest.json`
- `start_url`: `/whiteboard_web/whiteboard/` → `/whiteboard/`
- `scope`: `/whiteboard_web/` → `/`
- Icon `src` values: strip the `/whiteboard_web` prefix so they become
  `/assets/icons/icon-192.png` and `/assets/icons/icon-512.png`.

### 5. Create `public/CNAME`
Contents (one line, no trailing newline beyond what your editor adds):
```
andsmith.net
```
Vite copies everything in `public/` into `dist/` verbatim, so this ends up at
the root of the deployed artifact. GitHub Pages reads it to confirm the
custom domain.

### 6. `README.md`
Update the "Live site" line near the top from
`https://andsmith.github.io/whiteboard_web/` to `https://andsmith.net/`.

## Verify

After making the changes, run:
```
npm run build
```
This runs `tsc --noEmit && vite build`. Both must succeed.

Then sanity-check the output:
```
ls dist/
grep -r "whiteboard_web" dist/ || echo "clean: no stale /whiteboard_web paths"
cat dist/CNAME
```

You should see:
- `dist/CNAME` containing `andsmith.net`
- No `/whiteboard_web/` strings remaining in built HTML/JS/JSON
- `dist/whiteboard/index.html` present

## Commit

Single commit, message:
```
Switch base path to apex domain andsmith.net

- vite base: / instead of /whiteboard_web/
- Strip /whiteboard_web prefix from absolute asset paths in HTML and manifest
- Add public/CNAME so GitHub Pages serves the custom domain
- Update README live-site URL
```

Do **not** push. Leave the commit for the human to review and push.

## Out of scope (human will do)

- Add four A records at the DNS registrar pointing the apex to GitHub Pages
  IPs `185.199.108.153`, `.109.153`, `.110.153`, `.111.153`.
- Optionally add a `www` CNAME pointing to `andsmith.github.io.`.
- In repo Settings → Pages, set the "Custom domain" field to `andsmith.net`
  and tick "Enforce HTTPS" once the cert provisions.
- Verify with `dig andsmith.net +noall +answer`.
