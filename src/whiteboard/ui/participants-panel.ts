import type { RoomManagerState, Perm } from "../room-manager";

export interface ParticipantsPanelHandle {
  update: () => void;
}

export function mountParticipantsPanel(opts: {
  getState: () => RoomManagerState;
  isHost: () => boolean;
  isExpanded: () => boolean;
  /** Host-side: peers that have signalled local pending changes. */
  getPeerDirty: () => Map<string, boolean>;
  onToggle: () => void;
  onPromote: (peerId: string) => void;
  onPermChange: (peerId: string, perm: Perm) => void;
  onLeave: () => void;
}): ParticipantsPanelHandle {
  const panel = document.getElementById("participants-panel") as HTMLElement | null;
  const tab = document.getElementById("participants-tab") as HTMLElement | null;
  const list = document.getElementById("participants-list") as HTMLElement | null;
  const header = document.getElementById("participants-header") as HTMLElement | null;
  const collapseBtn = document.getElementById("btn-collapse-participants") as HTMLButtonElement | null;
  const leaveBtn = document.getElementById("btn-leave-meeting") as HTMLButtonElement | null;

  tab?.addEventListener("click", () => {
    if (!opts.isExpanded()) opts.onToggle();
  });
  collapseBtn?.addEventListener("click", () => {
    if (opts.isExpanded()) opts.onToggle();
  });
  leaveBtn?.addEventListener("click", opts.onLeave);

  const update = () => {
    if (!panel) return;
    const expanded = opts.isExpanded();
    panel.classList.toggle("expanded", expanded);

    const state = opts.getState();
    const total = state.status === "joined" ? state.peers.size + 1 : 0;

    if (tab) tab.textContent = `▸ ${total}`;
    if (header) header.textContent = `Participants (${total})`;

    if (list) {
      list.innerHTML = "";
      if (state.status !== "joined" || !state.you) {
        const li = document.createElement("li");
        li.className = "participant empty";
        li.textContent = "(not in a meeting)";
        list.appendChild(li);
        return;
      }

      const youIsHost = state.you === state.hostId;
      const entries = [
        { peerId: state.you, name: state.yourName ?? "you", isHost: youIsHost, isYou: true },
        ...[...state.peers.values()].map((p) => ({ ...p, isYou: false })),
      ];

      for (const p of entries) {
        const li = document.createElement("li");
        li.className = "participant";

        const name = document.createElement("span");
        name.className = "p-name";
        name.textContent = p.name;
        li.appendChild(name);

        if (p.isYou) li.appendChild(tag("you", "you"));
        if (p.isHost) li.appendChild(tag("host", "host"));

        if (!p.isYou && !p.isHost) {
          const perm = state.perms.get(p.peerId) ?? "edit";
          if (perm === "view") li.appendChild(tag("view", "view only"));
          if (opts.isHost() && opts.getPeerDirty().get(p.peerId)) {
            li.appendChild(tag("dirty", "pending"));
          }
        }

        if (opts.isHost() && !p.isYou && !p.isHost) {
          const perm = state.perms.get(p.peerId) ?? "edit";
          const permBtn = document.createElement("button");
          permBtn.className = "p-action";
          permBtn.textContent = perm === "edit" ? "→ View only" : "→ Allow edit";
          permBtn.addEventListener("click", () => {
            opts.onPermChange(p.peerId, perm === "edit" ? "view" : "edit");
          });
          li.appendChild(permBtn);

          const promoteBtn = document.createElement("button");
          promoteBtn.className = "p-action";
          promoteBtn.textContent = "Make host";
          promoteBtn.addEventListener("click", () => opts.onPromote(p.peerId));
          li.appendChild(promoteBtn);
        }

        list.appendChild(li);
      }
    }
  };

  update();
  return { update };
}

function tag(cls: string, text: string): HTMLElement {
  const t = document.createElement("span");
  t.className = `tag tag-${cls}`;
  t.textContent = text;
  return t;
}
