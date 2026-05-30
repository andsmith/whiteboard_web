/** Bump on every release so it's visible in the title bar.
 * Used to verify which build the browser is actually serving. */
export const APP_VERSION = "0.2.0";

export type TitleStatus = "Host" | "Guest - Editing" | "Guest - Viewing" | "Connecting" | "Disconnected";

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
  onToggleDebug: () => void;
  onToggleAnchors: () => void;
  getParticipantCount: () => number;
  getAnchorCount: () => number;
}): TitleBarHandle {
  const title = document.getElementById("title-text") as HTMLElement | null;
  const chip = document.getElementById("participants-chip") as HTMLButtonElement | null;
  const debugChip = document.getElementById("debug-chip") as HTMLButtonElement | null;
  const anchorsChip = document.getElementById("anchors-chip") as HTMLButtonElement | null;

  chip?.addEventListener("click", opts.onToggleParticipants);
  debugChip?.addEventListener("click", opts.onToggleDebug);
  anchorsChip?.addEventListener("click", opts.onToggleAnchors);

  const update = () => {
    if (title) {
      const info = opts.getTitle();
      title.textContent = ""; // clear before rebuild
      const lead = document.createTextNode(`Whiteboard-Web Version ${APP_VERSION}`);
      title.appendChild(lead);
      if (info.roomId && (info.status === "Host" || info.status === "Guest - Editing" || info.status === "Guest - Viewing")) {
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
    if (anchorsChip) anchorsChip.textContent = `Anchors (${opts.getAnchorCount()})`;
  };
  update();
  return { update };
}
