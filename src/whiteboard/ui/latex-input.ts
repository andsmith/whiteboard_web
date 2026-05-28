import type { AppState } from "../app-state";
import { renderLatex } from "../latex-render";

export interface LatexInputHandle {
  /** Re-evaluate visibility / contents from state. Idempotent. */
  update: () => void;
}

/** Mount the bottom-of-canvas LaTeX source input. Visibility is driven by
 * `state.latexEditing`: when non-null the textarea is shown and focused;
 * when null the bar hides itself. */
export function mountLatexInput(opts: {
  state: AppState;
  /** Commit current (Shift+Enter): push the in-progress vector into the store
   * and clear editing state. Implementation in main.ts so it can broadcast
   * via the existing commitVector flow. */
  onCommit: () => void;
  /** Cancel (Escape): drop in-progress edits; re-add the original vector if
   * the session was opened from the "edit" radial action. */
  onCancel: () => void;
  /** Re-render. */
  invalidate: () => void;
}): LatexInputHandle {
  const bar = document.getElementById("latex-input-bar") as HTMLDivElement | null;
  const textarea = document.getElementById("latex-input-textarea") as HTMLTextAreaElement | null;
  if (!bar || !textarea) return { update: () => {} };

  // Programmatic syncs from `update()` shouldn't trigger our `input` handler
  // (which would push state changes back into the same value).
  let suppressInput = false;

  const autosize = () => {
    textarea.style.height = "auto";
    const max = 6 * 22; // ~6 lines at our line-height
    textarea.style.height = Math.min(max, Math.max(22, textarea.scrollHeight)) + "px";
  };

  textarea.addEventListener("input", () => {
    if (suppressInput) return;
    const v = opts.state.latexEditing;
    if (!v) return;
    v.text = textarea.value;
    autosize();
    // Warm the KaTeX cache so the renderer's next draw can use it instantly.
    void renderLatex(v.text, v.color, v.fontSize)
      .then(() => opts.invalidate())
      .catch(() => { /* render errors handled inline by KaTeX */ });
    opts.invalidate();
  });

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.shiftKey) {
      // Commit. Browser would otherwise insert a newline.
      e.preventDefault();
      opts.onCommit();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      opts.onCancel();
      return;
    }
    // Plain Enter falls through → textarea inserts \n natively, our input
    // handler picks it up.
  });

  const update = () => {
    const v = opts.state.latexEditing;
    if (!v) {
      bar.style.display = "none";
      // Defocus so global key handling resumes.
      if (document.activeElement === textarea) textarea.blur();
      return;
    }
    bar.style.display = "flex";
    if (textarea.value !== v.text) {
      suppressInput = true;
      textarea.value = v.text;
      suppressInput = false;
    }
    autosize();
    // Focus when first shown.
    if (document.activeElement !== textarea) textarea.focus();
  };

  update();
  return { update };
}
