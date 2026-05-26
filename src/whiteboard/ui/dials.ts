export interface DialOpts {
  buttonId: string;
  popupId: string;
  getValue: () => number;
  setValue: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  render: (v: number) => void;
  sensitivity?: number; // pixels of vertical drag for full range (default 240)
}

export interface Dial {
  destroy: () => void;
}

export function mountDial(opts: DialOpts): Dial {
  const btn = document.getElementById(opts.buttonId) as HTMLElement | null;
  const popup = document.getElementById(opts.popupId) as HTMLElement | null;
  if (!btn || !popup) return { destroy: () => {} };

  const sensitivity = opts.sensitivity ?? 240;
  let active = false;
  let startY = 0;
  let startValue = 0;
  let activePointerId: number | null = null;

  const positionPopup = () => {
    const r = btn.getBoundingClientRect();
    popup.style.left = `${r.left + r.width / 2}px`;
    popup.style.top = `${r.top}px`;
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    active = true;
    activePointerId = e.pointerId;
    startY = e.clientY;
    startValue = opts.getValue();
    btn.setPointerCapture?.(e.pointerId);
    btn.classList.add("dragging");
    popup.style.display = "block";
    positionPopup();
    opts.render(startValue);
  };

  const computeValue = (clientY: number): number => {
    const dy = startY - clientY; // up = positive
    const range = opts.max - opts.min;
    let v = startValue + (dy / sensitivity) * range;
    v = Math.max(opts.min, Math.min(opts.max, v));
    if (opts.step) v = Math.round(v / opts.step) * opts.step;
    return v;
  };

  const onMove = (e: PointerEvent) => {
    if (!active || e.pointerId !== activePointerId) return;
    const v = computeValue(e.clientY);
    opts.setValue(v);
    opts.render(v);
  };

  const onUp = (e: PointerEvent) => {
    if (!active || e.pointerId !== activePointerId) return;
    active = false;
    activePointerId = null;
    btn.releasePointerCapture?.(e.pointerId);
    btn.classList.remove("dragging");
    popup.style.display = "none";
  };

  btn.addEventListener("pointerdown", onDown);
  btn.addEventListener("pointermove", onMove);
  btn.addEventListener("pointerup", onUp);
  btn.addEventListener("pointercancel", onUp);

  return {
    destroy: () => {
      btn.removeEventListener("pointerdown", onDown);
      btn.removeEventListener("pointermove", onMove);
      btn.removeEventListener("pointerup", onUp);
      btn.removeEventListener("pointercancel", onUp);
    },
  };
}
