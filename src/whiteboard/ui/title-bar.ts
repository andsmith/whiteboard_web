export type TitleStatus = "Host" | "Guest" | "View only" | "Connecting" | "Disconnected";

export interface TitleInfo {
  status: TitleStatus;
  roomId: string | null;
}

export interface TitleBarHandle {
  update: () => void;
}

export function mountTitleBar(opts: {
  getTitle: () => TitleInfo;
  onToggleParticipants: () => void;
  getParticipantCount: () => number;
}): TitleBarHandle {
  const title = document.getElementById("title-text") as HTMLElement | null;
  const chip = document.getElementById("participants-chip") as HTMLButtonElement | null;

  chip?.addEventListener("click", opts.onToggleParticipants);

  const update = () => {
    if (title) {
      const info = opts.getTitle();
      title.textContent = ""; // clear before rebuild
      const lead = document.createTextNode("Whiteboard-Web");
      title.appendChild(lead);
      if (info.roomId && (info.status === "Host" || info.status === "Guest" || info.status === "View only")) {
        title.appendChild(document.createTextNode(` — ${info.status} at: `));
        const code = document.createElement("code");
        code.className = "room-id";
        code.textContent = info.roomId;
        title.appendChild(code);
      } else {
        title.appendChild(document.createTextNode(` (${info.status})`));
      }
    }
    if (chip) chip.textContent = `Participants (${opts.getParticipantCount()})`;
  };
  update();
  return { update };
}
