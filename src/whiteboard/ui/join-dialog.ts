import { isValidRoomId } from "../room-id";

export interface JoinDialogHandle {
  show: (message?: string) => void;
  close: () => void;
}

const NAME_KEY = "whiteboard:name";

export function mountJoinDialog(opts: {
  onCreate: (name: string) => void;
  onJoin: (name: string, roomId: string) => void;
  getHashRoomId: () => string | null;
}): JoinDialogHandle {
  const dialog = document.getElementById("join-dialog") as HTMLDialogElement | null;
  const nameInput = document.getElementById("dlg-name") as HTMLInputElement | null;
  const btnEnter = document.getElementById("dlg-btn-enter") as HTMLButtonElement | null;
  const btnCreate = document.getElementById("dlg-btn-create") as HTMLButtonElement | null;
  const btnJoin = document.getElementById("dlg-btn-join") as HTMLButtonElement | null;
  const nameState = document.getElementById("dlg-name-state") as HTMLElement | null;
  const status = document.getElementById("dlg-status") as HTMLElement | null;
  const hashInfo = document.getElementById("dlg-hash-info") as HTMLElement | null;
  const hashRoomDisplay = document.getElementById("dlg-hash-room") as HTMLElement | null;

  let nameCommitted = false;

  const saved = safeLocalGet(NAME_KEY);
  if (saved && nameInput) {
    nameInput.value = saved;
    nameCommitted = true;
  }

  const refresh = () => {
    const name = nameInput?.value.trim() ?? "";
    const hasName = name.length > 0;
    if (btnEnter) {
      btnEnter.disabled = !hasName;
      btnEnter.textContent = nameCommitted ? "Change" : "Enter";
    }
    if (btnCreate) btnCreate.disabled = !nameCommitted || !hasName;
    if (btnJoin) btnJoin.disabled = !nameCommitted || !hasName;
    if (nameState) {
      nameState.textContent = nameCommitted ? "✓ saved" : (hasName ? "press Enter to confirm" : "");
    }
    if (nameInput) nameInput.readOnly = nameCommitted;

    const hashRoom = opts.getHashRoomId();
    if (hashInfo) hashInfo.style.display = hashRoom ? "" : "none";
    if (hashRoomDisplay) hashRoomDisplay.textContent = hashRoom ?? "";
  };

  function commitName(): void {
    const name = nameInput?.value.trim() ?? "";
    if (!name) return;
    safeLocalSet(NAME_KEY, name);
    nameCommitted = true;
    refresh();
  }

  nameInput?.addEventListener("input", () => {
    nameCommitted = false;
    refresh();
  });
  nameInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitName();
    }
  });
  btnEnter?.addEventListener("click", () => {
    if (nameCommitted) {
      nameCommitted = false;
      refresh();
      nameInput?.focus();
      nameInput?.select();
    } else {
      commitName();
    }
  });

  btnCreate?.addEventListener("click", () => {
    const name = nameInput?.value.trim() ?? "";
    if (!name || !nameCommitted) return;
    opts.onCreate(name);
  });

  btnJoin?.addEventListener("click", () => {
    const name = nameInput?.value.trim() ?? "";
    if (!name || !nameCommitted) return;
    let roomId = opts.getHashRoomId();
    if (!roomId) {
      const entered = window.prompt("Room ID to join (e.g. brave-azure-fox):");
      if (!entered) return;
      const trimmed = entered.trim().replace(/^#/, "");
      if (!isValidRoomId(trimmed)) {
        if (status) status.textContent = `Invalid room ID: ${trimmed}`;
        return;
      }
      roomId = trimmed;
    }
    opts.onJoin(name, roomId);
  });

  window.addEventListener("hashchange", refresh);
  refresh();

  return {
    show(message?: string) {
      if (status) status.textContent = message ?? "";
      if (dialog && !dialog.open) {
        try { dialog.showModal(); } catch { dialog.setAttribute("open", ""); }
      }
      refresh();
      // Move focus to the action user can take next
      if (nameCommitted) {
        if (opts.getHashRoomId()) btnJoin?.focus();
        else btnCreate?.focus();
      } else {
        nameInput?.focus();
      }
    },
    close() {
      if (dialog?.open) dialog.close();
    },
  };
}

function safeLocalGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function safeLocalSet(k: string, v: string): void {
  try { localStorage.setItem(k, v); } catch { /* ignore */ }
}
