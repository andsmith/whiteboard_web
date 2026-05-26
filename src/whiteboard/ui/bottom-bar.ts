import type { AppState } from "../app-state";
import { MIN_ZOOM, MAX_ZOOM } from "../view";
import { ICONS } from "./icons";

export interface BottomBarHandle {
  update: () => void;
}

const SLIDER_MIN = 0;
const SLIDER_MAX = 1000;

function zoomToSlider(z: number): number {
  const t = (Math.log(z) - Math.log(MIN_ZOOM)) / (Math.log(MAX_ZOOM) - Math.log(MIN_ZOOM));
  return Math.round(t * SLIDER_MAX);
}

function sliderToZoom(s: number): number {
  const t = s / SLIDER_MAX;
  return Math.exp(Math.log(MIN_ZOOM) + t * (Math.log(MAX_ZOOM) - Math.log(MIN_ZOOM)));
}

export type TrashMode = "trash" | "refresh";

export function mountBottomBar(opts: {
  state: AppState;
  isHost: () => boolean;
  trashMode: () => TrashMode;
  onZoomChange: (z: number) => void;
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

  const slider = document.getElementById("zoom-slider") as HTMLInputElement | null;
  if (slider) {
    slider.min = String(SLIDER_MIN);
    slider.max = String(SLIDER_MAX);
    slider.step = "1";
    slider.value = String(zoomToSlider(opts.state.view.zoom));
    slider.addEventListener("input", () => opts.onZoomChange(sliderToZoom(Number(slider.value))));
  }

  const update = () => {
    // Trash / Refresh — relabel & swap icon based on role
    const trashBtn = document.getElementById("btn-trash") as HTMLButtonElement | null;
    if (trashBtn) {
      const mode = opts.trashMode();
      const icon = mode === "trash" ? ICONS.trash! : ICONS.refresh!;
      trashBtn.innerHTML = icon;
      trashBtn.title = mode === "trash" ? "Trash my changes" : "Refresh from official state";
    }

    // Undo/redo disabled when stack empty
    const undoBtn = document.getElementById("btn-undo") as HTMLButtonElement | null;
    const redoBtn = document.getElementById("btn-redo") as HTMLButtonElement | null;
    if (undoBtn) undoBtn.disabled = !opts.state.store.canUndo();
    if (redoBtn) redoBtn.disabled = !opts.state.store.canRedo();

    // Toggle states
    document.getElementById("btn-snapgrid")?.classList.toggle("on", opts.state.snapToGrid);
    document.getElementById("btn-showgrid")?.classList.toggle("on", opts.state.showGrid);

    const label = document.getElementById("zoom-label");
    if (label) label.textContent = `Zoom: ${opts.state.view.zoom.toFixed(2)}`;
    if (slider) {
      const targetVal = String(zoomToSlider(opts.state.view.zoom));
      if (slider.value !== targetVal) slider.value = targetVal;
    }
  };
  update();
  return { update };
}
