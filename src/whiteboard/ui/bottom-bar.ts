import type { AppState } from "../app-state";
import { MIN_ZOOM, MAX_ZOOM } from "../view";
import { ICONS } from "./icons";

export interface BottomBarHandle {
  update: () => void;
}

const SLIDER_MIN = 0;
const SLIDER_MAX = 1000;

function zoomToSlider(z: number): number {
  // log mapping so the thumb feels linear across [MIN_ZOOM, MAX_ZOOM]
  const t = (Math.log(z) - Math.log(MIN_ZOOM)) / (Math.log(MAX_ZOOM) - Math.log(MIN_ZOOM));
  return Math.round(t * SLIDER_MAX);
}

function sliderToZoom(s: number): number {
  const t = s / SLIDER_MAX;
  return Math.exp(Math.log(MIN_ZOOM) + t * (Math.log(MAX_ZOOM) - Math.log(MIN_ZOOM)));
}

export function mountBottomBar(opts: {
  state: AppState;
  isHost: () => boolean;
  onZoomChange: (z: number) => void;
  onShowGridToggle: () => void;
  onSnapGridToggle: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
}): BottomBarHandle {
  // Populate icon HTML into pre-existing buttons
  const setIcon = (id: string, icon: string) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = icon;
  };
  setIcon("btn-undo", ICONS.undo!);
  setIcon("btn-redo", ICONS.redo!);
  setIcon("btn-clear", ICONS.clear!);
  setIcon("btn-thickness", ICONS.thickness!);
  setIcon("btn-fontsize", ICONS.fontsize!);
  setIcon("btn-snapgrid", ICONS.snapgrid!);
  setIcon("btn-showgrid", ICONS.grid!);

  document.getElementById("btn-undo")?.addEventListener("click", opts.onUndo);
  document.getElementById("btn-redo")?.addEventListener("click", opts.onRedo);
  document.getElementById("btn-clear")?.addEventListener("click", opts.onClear);
  document.getElementById("btn-snapgrid")?.addEventListener("click", opts.onSnapGridToggle);
  document.getElementById("btn-showgrid")?.addEventListener("click", opts.onShowGridToggle);

  const slider = document.getElementById("zoom-slider") as HTMLInputElement | null;
  if (slider) {
    slider.min = String(SLIDER_MIN);
    slider.max = String(SLIDER_MAX);
    slider.step = "1";
    slider.value = String(zoomToSlider(opts.state.view.zoom));
    slider.addEventListener("input", () => {
      const z = sliderToZoom(Number(slider.value));
      opts.onZoomChange(z);
    });
  }

  const update = () => {
    // Clear button host-only
    const clearBtn = document.getElementById("btn-clear");
    if (clearBtn) clearBtn.style.display = opts.isHost() ? "" : "none";

    // Toggle states
    document.getElementById("btn-snapgrid")?.classList.toggle("on", opts.state.snapToGrid);
    document.getElementById("btn-showgrid")?.classList.toggle("on", opts.state.showGrid);

    // Zoom label + slider
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
