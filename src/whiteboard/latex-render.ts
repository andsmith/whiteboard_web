// LaTeX rendering pipeline for the whiteboard.
//
// KaTeX produces HTML; canvas needs an image. We wrap the rendered HTML in an
// SVG <foreignObject>, turn it into a Blob URL, and load it as an Image. Once
// loaded the Image can be drawn via ctx.drawImage. Results are cached per
// (source, color, fontSize) so repeated draws/edits are cheap.

import katex from "katex";
import "katex/dist/katex.css";
// The host page imports the KaTeX stylesheet above (Vite extracts @font-face
// rules so the fonts load). But the SVG <foreignObject> trick we use to
// rasterize KaTeX onto canvas creates an isolated document context that does
// NOT inherit the host page's stylesheets — without inlining the CSS into the
// SVG, KaTeX HTML would render unstyled. The `?inline` query makes Vite hand
// us the raw CSS string for embedding.
// @ts-expect-error virtual module — Vite resolves this at build time.
import katexCssRaw from "katex/dist/katex.min.css?inline";

export interface LatexImage {
  /** The fully-loaded image (canvas-ready). */
  image: HTMLImageElement;
  /** Logical (CSS-pixel) width of the rendered block. */
  width: number;
  /** Logical (CSS-pixel) height of the rendered block. */
  height: number;
}

const CACHE_LIMIT = 200;
const cache = new Map<string, LatexImage>();
const inflight = new Map<string, Promise<LatexImage>>();
/** Where we measure rendered HTML to pick an SVG viewBox. Created lazily. */
let measureHost: HTMLDivElement | null = null;

function cacheKey(source: string, color: string, fontSize: number): string {
  // Two-decimal precision on fontSize keeps the cache hot during dial drags.
  return `${color}|${fontSize.toFixed(2)}|${source}`;
}

function bumpCache(key: string, value: LatexImage): void {
  // Maintain rough LRU order: re-insert moves the key to the end of the Map.
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

function ensureMeasureHost(): HTMLDivElement {
  if (measureHost) return measureHost;
  const div = document.createElement("div");
  div.style.position = "fixed";
  div.style.left = "-99999px";
  div.style.top = "0";
  div.style.visibility = "hidden";
  div.style.pointerEvents = "none";
  // Don't let parent layout clip the measurement.
  div.style.whiteSpace = "nowrap";
  document.body.appendChild(div);
  measureHost = div;
  return div;
}

/** Render every line via KaTeX, joined by <br/>. Empty source yields a
 * single non-breaking space so the measurement returns a sane bbox. */
function renderLines(source: string): string {
  const lines = source.length === 0 ? [" "] : source.split("\n");
  const htmlPerLine = lines.map((line) => {
    const text = line.length === 0 ? " " : line;
    try {
      return katex.renderToString(text, {
        output: "html",
        throwOnError: false,
        displayMode: false,
      });
    } catch {
      // KaTeX shouldn't throw with throwOnError:false but be defensive.
      const escaped = text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c));
      return `<span style="color:#c44">${escaped}</span>`;
    }
  });
  return htmlPerLine.map((h) => `<div>${h}</div>`).join("");
}

function measure(html: string, fontSize: number, color: string): { width: number; height: number; styledHtml: string } {
  const host = ensureMeasureHost();
  host.style.color = color;
  host.style.fontSize = `${fontSize}px`;
  host.style.lineHeight = "1.5";
  host.innerHTML = html;
  // Width: scrollWidth captures the natural content width when the host is
  // sized to white-space:nowrap. Height: clientHeight when display is block.
  // Force the host to behave as a block but with auto width.
  host.style.display = "inline-block";
  const rect = host.getBoundingClientRect();
  // Pad slightly so descenders / accents are not clipped.
  const width = Math.ceil(rect.width) + 4;
  const height = Math.ceil(rect.height) + 4;
  return { width, height, styledHtml: html };
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;",
  }[c] ?? c));
}

function buildSvg(inner: string, width: number, height: number, fontSize: number, color: string): string {
  // Inline the KaTeX CSS so the rasterized SVG renders with proper math
  // styling — foreignObject doesn't inherit the host page's stylesheets.
  // The @font-face rules inside the CSS reference URLs (TTF / WOFF2 paths
  // bundled by Vite). When the SVG is loaded as an <img>, the browser
  // resolves these against the SVG's *document URI*, which is a blob:
  // URL with no useful base — so the KaTeX fonts won't load. The math
  // still renders correctly using the browser's serif fallback; the only
  // visible difference is slightly less polished glyphs.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`
    + `<foreignObject x="0" y="0" width="100%" height="100%">`
    + `<div xmlns="http://www.w3.org/1999/xhtml">`
    + `<style>${katexCssRaw}</style>`
    + `<div style="font-size:${fontSize}px;line-height:1.5;color:${escapeXml(color)};display:inline-block;">`
    + inner
    + `</div>`
    + `</div>`
    + `</foreignObject>`
    + `</svg>`;
}

function svgToImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      // Image still references the blob URL while drawing — revoke only after
      // the next macrotask to be safe across browsers.
      setTimeout(() => URL.revokeObjectURL(url), 0);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

/** Return the cached image if any, else null. Never kicks off work. */
export function getCachedLatex(source: string, color: string, fontSize: number): LatexImage | null {
  const key = cacheKey(source, color, fontSize);
  return cache.get(key) ?? null;
}

/** Idempotent — returns the same promise if a render is already in flight
 * for this (source, color, fontSize). Resolves to a cached image. */
export function renderLatex(source: string, color: string, fontSize: number): Promise<LatexImage> {
  const key = cacheKey(source, color, fontSize);
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(key);
  if (pending) return pending;

  const job = (async () => {
    const html = renderLines(source);
    const { width, height } = measure(html, fontSize, color);
    const svg = buildSvg(html, width, height, fontSize, color);
    const image = await svgToImage(svg);
    const result: LatexImage = { image, width, height };
    bumpCache(key, result);
    return result;
  })();

  inflight.set(key, job);
  job.finally(() => inflight.delete(key));
  return job;
}
