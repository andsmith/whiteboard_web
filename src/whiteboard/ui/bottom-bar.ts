import type { AppState } from "../app-state";
import { ICONS } from "./icons";

export interface BottomBarHandle {
  update: () => void;
}

export type TrashMode = "trash" | "refresh";

export function mountBottomBar(opts: {
  state: AppState;
  isHost: () => boolean;
  trashMode: () => TrashMode;
  onShowGridToggle: () => void;
  onSnapGridToggle: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onTrash: () => void;
  onSave: () => void;
  onLoad: () => void;
}): BottomBarHandle {
  const setIcon = (id: string, icon: string) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = icon;
  };
  setIcon("btn-undo", ICONS.undo!);
  setIcon("btn-redo", ICONS.redo!);
  setIcon("btn-trash", ICONS.trash!);
  setIcon("btn-save", ICONS.save!);
  setIcon("btn-load", ICONS.load!);
  setIcon("btn-thickness", ICONS.thickness!);
  setIcon("btn-fontsize", ICONS.fontsize!);
  setIcon("btn-snapgrid", ICONS.snapgrid!);
  setIcon("btn-showgrid", ICONS.grid!);

  document.getElementById("btn-undo")?.addEventListener("click", opts.onUndo);
  document.getElementById("btn-redo")?.addEventListener("click", opts.onRedo);
  document.getElementById("btn-trash")?.addEventListener("click", opts.onTrash);
  document.getElementById("btn-save")?.addEventListener("click", opts.onSave);
  document.getElementById("btn-load")?.addEventListener("click", opts.onLoad);
  document.getElementById("btn-snapgrid")?.addEventListener("click", opts.onSnapGridToggle);
  document.getElementById("btn-showgrid")?.addEventListener("click", opts.onShowGridToggle);
  // btn-thickness and btn-fontsize have their pointer handlers wired by mountDial().

  const update = () => {
    const trashBtn = document.getElementById("btn-trash") as HTMLButtonElement | null;
    if (trashBtn) {
      const mode = opts.trashMode();
      trashBtn.innerHTML = mode === "trash" ? ICONS.trash! : ICONS.refresh!;
      trashBtn.title = mode === "trash" ? "Trash my changes" : "Refresh from official state";
    }

    const undoBtn = document.getElementById("btn-undo") as HTMLButtonElement | null;
    const redoBtn = document.getElementById("btn-redo") as HTMLButtonElement | null;
    if (undoBtn) undoBtn.disabled = !opts.state.store.canUndo();
    if (redoBtn) redoBtn.disabled = !opts.state.store.canRedo();

    document.getElementById("btn-snapgrid")?.classList.toggle("on", opts.state.snapToGrid);
    document.getElementById("btn-showgrid")?.classList.toggle("on", opts.state.showGrid);

    const label = document.getElementById("zoom-label");
    if (label) label.textContent = `Zoom: ${opts.state.view.zoom.toFixed(2)}`;
  };
  update();
  return { update };
}
