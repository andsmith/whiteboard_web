import type { AppState, ColorHex } from "../app-state";
import { COLORS } from "../app-state";
import type { ToolId } from "../tools/tool";
import { NAV_TOOL_ORDER, DRAW_TOOL_ORDER } from "../tools/registry";
import { ICONS } from "./icons";

export interface ToolsPanelHandle {
  update: () => void;
}

export function mountToolsPanel(opts: {
  state: AppState;
  onToolChange: (t: ToolId) => void;
  onColorChange: (c: ColorHex) => void;
  onHome: () => void;
}): ToolsPanelHandle {
  const navHost = document.getElementById("nav-tools") as HTMLElement | null;
  const drawHost = document.getElementById("draw-tools") as HTMLElement | null;
  const colorsHost = document.getElementById("colors-group") as HTMLElement | null;

  const renderTools = (host: HTMLElement | null, ids: ToolId[]) => {
    if (!host) return;
    host.innerHTML = "";
    for (const t of ids) {
      const btn = document.createElement("button");
      btn.className = "tool-btn";
      btn.dataset.tool = t;
      btn.title = capitalize(t);
      btn.innerHTML = ICONS[t] ?? "";
      btn.addEventListener("click", () => opts.onToolChange(t));
      host.appendChild(btn);
    }
  };
  renderTools(navHost, NAV_TOOL_ORDER);
  renderTools(drawHost, DRAW_TOOL_ORDER);

  // Home button — sits in the nav-tools grid alongside select/pan/modify.
  // Not a tool: clicking it never sets currentTool, just resets the camera.
  if (navHost) {
    const homeBtn = document.createElement("button");
    homeBtn.className = "tool-btn home-btn";
    homeBtn.id = "btn-home";
    homeBtn.title = "Home (reset pan/zoom)";
    homeBtn.innerHTML = ICONS.home ?? "";
    homeBtn.addEventListener("click", opts.onHome);
    navHost.appendChild(homeBtn);
  }

  if (colorsHost) {
    colorsHost.innerHTML = "";
    for (const c of COLORS) {
      const btn = document.createElement("button");
      btn.className = "color-btn";
      btn.style.backgroundColor = c;
      btn.dataset.color = c;
      btn.title = c;
      btn.addEventListener("click", () => opts.onColorChange(c));
      colorsHost.appendChild(btn);
    }
  }

  const update = () => {
    [navHost, drawHost].forEach((host) => {
      host?.querySelectorAll<HTMLButtonElement>(".tool-btn").forEach((b) => {
        b.classList.toggle("selected", b.dataset.tool === opts.state.currentTool);
      });
    });
    colorsHost?.querySelectorAll<HTMLButtonElement>(".color-btn").forEach((b) => {
      b.classList.toggle("selected", b.dataset.color === opts.state.color);
    });
  };
  update();
  return { update };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
