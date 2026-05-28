import type { DebugLog } from "../debug-log";

export interface DebugPanelHandle {
  update: () => void;
}

export function mountDebugPanel(opts: {
  log: DebugLog;
  isExpanded: () => boolean;
  onToggle: () => void;
}): DebugPanelHandle {
  const panel = document.getElementById("debug-panel") as HTMLElement | null;
  const tab = document.getElementById("debug-tab") as HTMLElement | null;
  const list = document.getElementById("debug-list") as HTMLElement | null;
  const collapseBtn = document.getElementById("btn-collapse-debug") as HTMLButtonElement | null;
  const clearBtn = document.getElementById("btn-debug-clear") as HTMLButtonElement | null;

  tab?.addEventListener("click", () => { if (!opts.isExpanded()) opts.onToggle(); });
  collapseBtn?.addEventListener("click", () => { if (opts.isExpanded()) opts.onToggle(); });
  clearBtn?.addEventListener("click", () => opts.log.clear());

  const update = () => {
    if (!panel) return;
    const expanded = opts.isExpanded();
    panel.classList.toggle("expanded", expanded);
    if (!list) return;
    // Rebuild — entry count is bounded, so this is cheap enough.
    list.innerHTML = "";
    for (const e of opts.log.entries) {
      const li = document.createElement("li");
      li.className = `debug-entry debug-${e.kind}`;
      const ts = new Date(e.ts).toISOString().slice(11, 23);
      const tsSpan = document.createElement("span");
      tsSpan.className = "debug-ts";
      tsSpan.textContent = ts;
      const kindSpan = document.createElement("span");
      kindSpan.className = "debug-kind";
      kindSpan.textContent = e.kind;
      const msgSpan = document.createElement("span");
      msgSpan.className = "debug-msg";
      msgSpan.textContent = e.msg;
      li.append(tsSpan, kindSpan, msgSpan);
      list.appendChild(li);
    }
    // Auto-scroll to newest only when expanded (cheaper, also avoids reflow churn).
    if (expanded) list.scrollTop = list.scrollHeight;
  };

  opts.log.onChange = update;
  update();
  return { update };
}
