import { COLORS, type ColorHex } from "../app-state";

export interface AnchorDialogHandle {
  /** Open the dialog. Resolves with the user's choice, or null on cancel. */
  prompt: () => Promise<{ name: string; color: ColorHex } | null>;
}

export function mountAnchorDialog(): AnchorDialogHandle {
  const dialog = document.getElementById("anchor-dialog") as HTMLDialogElement | null;
  const nameInput = document.getElementById("anchor-name") as HTMLInputElement | null;
  const swatchHost = document.getElementById("anchor-swatches") as HTMLElement | null;
  const btnSave = document.getElementById("anchor-btn-save") as HTMLButtonElement | null;
  const btnCancel = document.getElementById("anchor-btn-cancel") as HTMLButtonElement | null;

  let currentColor: ColorHex = COLORS[0];
  let resolve: ((v: { name: string; color: ColorHex } | null) => void) | null = null;

  const renderSwatches = () => {
    if (!swatchHost) return;
    swatchHost.innerHTML = "";
    for (const c of COLORS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "anchor-swatch";
      btn.style.backgroundColor = c;
      btn.dataset.color = c;
      btn.title = c;
      if (c === currentColor) btn.classList.add("selected");
      btn.addEventListener("click", () => {
        currentColor = c;
        swatchHost.querySelectorAll<HTMLButtonElement>(".anchor-swatch").forEach((b) => {
          b.classList.toggle("selected", b.dataset.color === c);
        });
      });
      swatchHost.appendChild(btn);
    }
  };
  renderSwatches();

  const refreshSaveBtn = () => {
    if (btnSave) btnSave.disabled = (nameInput?.value.trim().length ?? 0) === 0;
  };
  nameInput?.addEventListener("input", refreshSaveBtn);
  nameInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btnSave?.click();
    } else if (e.key === "Escape") {
      e.preventDefault();
      btnCancel?.click();
    }
  });

  const closeWith = (result: { name: string; color: ColorHex } | null) => {
    if (dialog?.open) dialog.close();
    const r = resolve;
    resolve = null;
    r?.(result);
  };

  btnCancel?.addEventListener("click", () => closeWith(null));
  btnSave?.addEventListener("click", () => {
    const name = nameInput?.value.trim() ?? "";
    if (!name) return;
    closeWith({ name, color: currentColor });
  });

  // Native dialog 'cancel' event (Esc key when dialog has the focus).
  dialog?.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeWith(null);
  });

  return {
    prompt() {
      return new Promise((res) => {
        // If a previous prompt is still open (shouldn't happen), reject it.
        if (resolve) { resolve(null); }
        resolve = res;
        currentColor = COLORS[0];
        if (nameInput) nameInput.value = "";
        renderSwatches();
        refreshSaveBtn();
        if (dialog && !dialog.open) {
          try { dialog.showModal(); } catch { dialog.setAttribute("open", ""); }
        }
        nameInput?.focus();
      });
    },
  };
}
