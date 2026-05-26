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
  const roomInput = document.getElementById("dlg-room-code") as HTMLInputElement | null;
  const btnEnter = document.getElementById("dlg-btn-enter") as HTMLButtonElement | null;
  const btnCreate = document.getElementById("dlg-btn-create") as HTMLButtonElement | null;
  const btnJoin = document.getElementById("dlg-btn-join") as HTMLButtonElement | null;
  const nameState = document.getElementById("dlg-name-state") as HTMLElement | null;
  const status = document.getElementById("dlg-status") as HTMLElement | null;

  let nameCommitted = false;

  // Pre-fill name from localStorage but do NOT auto-commit — the user must
  // explicitly press Enter / click the button to confirm before dismissing.
  const saved = safeLocalGet(NAME_KEY);
  if (saved && nameInput) nameInput.value = saved;

  // Pre-fill room code from URL fragment if present.
  const fillRoomFromHash = () => {
    const hashRoom = opts.getHashRoomId();
    if (hashRoom && roomInput && !roomInput.value.trim()) roomInput.value = hashRoom;
  };
  fillRoomFromHash();

  const currentName = (): string => nameInput?.value.trim() ?? "";
  const currentRoom = (): string => (roomInput?.value.trim() ?? "").replace(/^#/, "");

  const refresh = () => {
    const name = currentName();
    const hasName = name.length > 0;
    const room = currentRoom();
    const validRoom = room.length > 0 && isValidRoomId(room);

    if (btnEnter) {
      btnEnter.disabled = !hasName;
      btnEnter.textContent = nameCommitted ? "Change" : "Enter";
    }
    if (btnCreate) btnCreate.disabled = !nameCommitted || !hasName;
    if (btnJoin) btnJoin.disabled = !nameCommitted || !hasName || !validRoom;

    if (nameState) {
      nameState.textContent = nameCommitted
        ? "✓ saved"
        : (hasName ? "press Enter to confirm" : "");
    }
  };

  function commitName(): void {
    const name = currentName();
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

  // The button always commits the current field value. Label is purely
  // informational ("Enter" before first commit, "Change" once committed).
  btnEnter?.addEventListener("click", commitName);

  roomInput?.addEventListener("input", refresh);
  roomInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      btnJoin?.click();
    }
  });

  btnCreate?.addEventListener("click", () => {
    const name = currentName();
    if (!name || !nameCommitted) return;
    opts.onCreate(name);
  });

  btnJoin?.addEventListener("click", () => {
    const name = currentName();
    if (!name || !nameCommitted) return;
    const room = currentRoom();
    if (!room || !isValidRoomId(room)) {
      if (status) status.textContent = `Invalid meeting code: ${room || "(empty)"}`;
      return;
    }
    if (status) status.textContent = "";
    opts.onJoin(name, room);
  });

  window.addEventListener("hashchange", fillRoomFromHash);
  refresh();

  return {
    show(message?: string) {
      if (status) status.textContent = message ?? "";
      fillRoomFromHash();
      if (dialog && !dialog.open) {
        try { dialog.showModal(); } catch { dialog.setAttribute("open", ""); }
      }
      refresh();
      // Focus: name field if empty, else the natural next step.
      if (!currentName()) {
        nameInput?.focus();
      } else if (!nameCommitted) {
        nameInput?.focus();
        nameInput?.select();
      } else if (currentRoom() && isValidRoomId(currentRoom())) {
        btnJoin?.focus();
      } else {
        btnCreate?.focus();
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
