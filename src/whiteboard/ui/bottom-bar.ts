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
  onTextScaleModeToggle: () => void;
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
  document.getElementById("btn-textscalemode")?.addEventListener("click", opts.onTextScaleModeToggle);
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

    // Text scaling mode toggle — icon + tooltip swap with the active mode.
    const tsBtn = document.getElementById("btn-textscalemode") as HTMLButtonElement | null;
    if (tsBtn) {
      const constant = opts.state.constantTextScale;
      tsBtn.classList.toggle("on", constant);
      tsBtn.innerHTML = constant ? ICONS["textscale-const"]! : ICONS["textscale-zoom"]!;
      tsBtn.title = constant
        ? "Constant Text Scale — new text/LaTeX stays the same screen size at any zoom. Click to switch to 'Text Scales with Zoom'."
        : "Text Scales with Zoom — new text/LaTeX gets bigger when you zoom in. Click to switch to 'Constant Text Scale'.";
    }

    const label = document.getElementById("zoom-label");
    if (label) label.textContent = `Zoom: ${opts.state.view.zoom.toFixed(2)}`;
  };
  update();
  return { update };
}
