import type { Anchor } from "../anchors";

export interface AnchorsPanelHandle {
  update: () => void;
}

export function mountAnchorsPanel(opts: {
  getAnchors: () => Map<string, Anchor>;
  isExpanded: () => boolean;
  onToggle: () => void;
  onNavigate: (anchorId: string) => void;
  onDelete: (anchorId: string) => void;
  canEdit: () => boolean;
}): AnchorsPanelHandle {
  const panel = document.getElementById("anchors-panel") as HTMLElement | null;
  const tab = document.getElementById("anchors-tab") as HTMLElement | null;
  const list = document.getElementById("anchors-list") as HTMLElement | null;
  const collapseBtn = document.getElementById("btn-collapse-anchors") as HTMLButtonElement | null;

  tab?.addEventListener("click", () => { if (!opts.isExpanded()) opts.onToggle(); });
  collapseBtn?.addEventListener("click", () => { if (opts.isExpanded()) opts.onToggle(); });

  const update = () => {
    if (!panel) return;
    panel.classList.toggle("expanded", opts.isExpanded());

    if (!list) return;
    const anchors = Array.from(opts.getAnchors().values())
      .sort((a, b) => a.createdAt - b.createdAt);

    list.innerHTML = "";
    if (anchors.length === 0) {
      const li = document.createElement("li");
      li.className = "anchor-row empty";
      li.textContent = "(no anchors yet)";
      list.appendChild(li);
      return;
    }

    for (const a of anchors) {
      const li = document.createElement("li");
      li.className = "anchor-row";

      const dot = document.createElement("span");
      dot.className = "anchor-dot";
      dot.style.backgroundColor = a.color;
      li.appendChild(dot);

      const name = document.createElement("button");
      name.type = "button";
      name.className = "anchor-name-btn";
      name.textContent = a.name;
      name.title = `Navigate to "${a.name}"`;
      name.addEventListener("click", () => opts.onNavigate(a.id));
      li.appendChild(name);

      if (opts.canEdit()) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "anchor-del-btn";
        del.title = "Delete anchor";
        del.textContent = "×";
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          opts.onDelete(a.id);
        });
        li.appendChild(del);
      }

      list.appendChild(li);
    }
  };

  update();
  return { update };
}
