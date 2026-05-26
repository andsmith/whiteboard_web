import type { AppState, ColorHex } from "../app-state";
import { COLORS } from "../app-state";
import type { ToolId } from "../tools/tool";
import { TOOL_ORDER } from "../tools/registry";
import { ICONS } from "./icons";

export interface ToolsPanelHandle {
  update: () => void;
}

export function mountToolsPanel(opts: {
  state: AppState;
  onToolChange: (t: ToolId) => void;
  onColorChange: (c: ColorHex) => void;
}): ToolsPanelHandle {
  const toolsHost = document.getElementById("tools-group") as HTMLElement | null;
  const colorsHost = document.getElementById("colors-group") as HTMLElement | null;

  // Render tools (3x2 grid)
  if (toolsHost) {
    toolsHost.innerHTML = "";
    for (const t of TOOL_ORDER) {
      const btn = document.createElement("button");
      btn.className = "tool-btn";
      btn.dataset.tool = t;
      btn.title = capitalize(t);
      btn.innerHTML = ICONS[t] ?? "";
      btn.addEventListener("click", () => opts.onToolChange(t));
      toolsHost.appendChild(btn);
    }
  }

  // Render colors (4x2 grid)
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
    toolsHost?.querySelectorAll<HTMLButtonElement>(".tool-btn").forEach((b) => {
      b.classList.toggle("selected", b.dataset.tool === opts.state.currentTool);
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
