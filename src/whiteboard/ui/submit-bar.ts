import type { Submission } from "../submissions";

export interface SubmitBarHandle {
  update: () => void;
}

/** Bottom-of-canvas overlay. Renders in one of three modes:
 *   - hidden (no pending state)
 *   - guest mode: green "Submit changes to host" button (and a "rejected" hint)
 *   - host mode: "<Name> made changes: [show/hide preview] [accept] [reject]"
 * The mode is determined by the getters passed in.
 */
export function mountSubmitBar(opts: {
  /** Number of locally-pending ops on the current user (view-only). */
  getPendingCount: () => number;
  /** Most-recent rejection timestamp, or null. */
  getLastRejectedAt: () => number | null;
  /** Host-side: oldest unresolved submission. */
  getActiveSubmission: () => Submission | null;
  /** Host-side: is the preview currently visible? */
  isPreviewVisible: () => boolean;
  /** Host-side count of pending submissions (for the "+N more" hint). */
  getPendingSubmissionsCount: () => number;
  onSubmit: () => void;
  onTogglePreview: () => void;
  onAccept: () => void;
  onReject: () => void;
}): SubmitBarHandle {
  const bar = document.getElementById("submit-bar") as HTMLElement | null;
  if (!bar) return { update: () => {} };

  // Initial structure — populated/swapped depending on mode.
  bar.innerHTML = "";

  const update = () => {
    const active = opts.getActiveSubmission();
    const pendingCount = opts.getPendingCount();
    const lastRej = opts.getLastRejectedAt();

    if (active) {
      // Host review mode.
      bar.className = "submit-bar host-review";
      bar.style.display = "flex";
      bar.innerHTML = "";

      const label = document.createElement("span");
      label.className = "submit-bar-label";
      const extra = opts.getPendingSubmissionsCount() - 1;
      label.textContent = extra > 0
        ? `${active.fromName} made changes (+${extra} more queued):`
        : `${active.fromName} made changes:`;
      bar.appendChild(label);

      const showBtn = document.createElement("button");
      showBtn.type = "button";
      showBtn.className = "submit-bar-btn neutral";
      showBtn.textContent = opts.isPreviewVisible() ? "Hide preview" : "Show preview";
      showBtn.addEventListener("click", opts.onTogglePreview);
      bar.appendChild(showBtn);

      const acceptBtn = document.createElement("button");
      acceptBtn.type = "button";
      acceptBtn.className = "submit-bar-btn accept";
      acceptBtn.textContent = "Accept";
      acceptBtn.addEventListener("click", opts.onAccept);
      bar.appendChild(acceptBtn);

      const rejectBtn = document.createElement("button");
      rejectBtn.type = "button";
      rejectBtn.className = "submit-bar-btn reject";
      rejectBtn.textContent = "Reject";
      rejectBtn.addEventListener("click", opts.onReject);
      bar.appendChild(rejectBtn);
      return;
    }

    if (pendingCount > 0) {
      // Guest submit mode.
      bar.className = "submit-bar guest-submit";
      bar.style.display = "flex";
      bar.innerHTML = "";

      const label = document.createElement("span");
      label.className = "submit-bar-label";
      label.textContent = `You have ${pendingCount} pending change${pendingCount === 1 ? "" : "s"}.`;
      bar.appendChild(label);

      const submitBtn = document.createElement("button");
      submitBtn.type = "button";
      submitBtn.className = "submit-bar-btn submit-green";
      submitBtn.textContent = "Submit changes to host";
      submitBtn.addEventListener("click", opts.onSubmit);
      bar.appendChild(submitBtn);

      // Rejection hint: show for ~6 seconds after a reject.
      if (lastRej && Date.now() - lastRej < 6000) {
        const hint = document.createElement("span");
        hint.className = "submit-bar-hint reject-hint";
        hint.textContent = "Host rejected your last submission — keep refining.";
        bar.appendChild(hint);
      }
      return;
    }

    // Nothing to show.
    bar.style.display = "none";
    bar.className = "submit-bar";
    bar.innerHTML = "";
  };

  update();
  return { update };
}
