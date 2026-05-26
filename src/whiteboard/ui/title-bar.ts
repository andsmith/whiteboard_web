export interface TitleBarHandle {
  update: () => void;
}

export function mountTitleBar(opts: {
  getStatus: () => string;
  onToggleParticipants: () => void;
  getParticipantCount: () => number;
}): TitleBarHandle {
  const title = document.getElementById("title-text") as HTMLElement | null;
  const chip = document.getElementById("participants-chip") as HTMLButtonElement | null;

  chip?.addEventListener("click", opts.onToggleParticipants);

  const update = () => {
    if (title) title.textContent = `Whiteboard-Web (${opts.getStatus()})`;
    if (chip) chip.textContent = `Participants (${opts.getParticipantCount()})`;
  };
  update();
  return { update };
}
