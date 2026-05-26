import { createPeer, createOffer, acceptOffer, acceptAnswer } from "../rtc";
import { loadIceServers } from "../ice-config";

export function mountManualMode(): void {
  // Create the section if absent.
  let section = document.getElementById("manual-section");
  if (!section) {
    section = document.createElement("section");
    section.id = "manual-section";
    section.innerHTML = `
      <button id="manual-close" class="manual-close" title="Close debug panel">×</button>
      <h3>Manual signaling (debug)</h3>
      <p>Direct SDP copy/paste — bypasses signaling server. Two-peer only.</p>
      <div class="row">
        <button id="btn-create-offer">Create offer</button>
        <button id="btn-accept-offer">Accept pasted offer → create answer</button>
        <button id="btn-accept-answer">Accept pasted answer</button>
      </div>
      <label>Local SDP (copy to peer):
        <textarea id="local-sdp" readonly autocomplete="off"
          placeholder="generated offer/answer appears here"></textarea>
      </label>
      <label>Remote SDP (paste from peer):
        <textarea id="remote-sdp" autocomplete="off"
          placeholder="paste peer's offer or answer here"></textarea>
      </label>
      <div id="manual-status">status: idle</div>
    `;
    document.body.appendChild(section);
  }

  const localSdp = document.getElementById("local-sdp") as HTMLTextAreaElement | null;
  const remoteSdp = document.getElementById("remote-sdp") as HTMLTextAreaElement | null;
  const statusEl = document.getElementById("manual-status");
  if (localSdp) localSdp.value = "";
  if (remoteSdp) remoteSdp.value = "";

  const setStatus = (m: string) => { if (statusEl) statusEl.textContent = `status: ${m}`; };

  setStatus("loading TURN credentials...");
  const peerPromise = loadIceServers().then((iceServers) => {
    const p = createPeer({ iceServers });
    p.addEventListener("connectionstatechange", () => setStatus(`peer: ${p.connectionState}`));
    setStatus("idle");
    return p;
  });

  document.getElementById("manual-close")?.addEventListener("click", () => {
    section?.remove();
  });

  document.getElementById("btn-create-offer")?.addEventListener("click", async () => {
    setStatus("creating offer...");
    const peer = await peerPromise;
    const sdp = await createOffer(peer);
    if (localSdp) localSdp.value = sdp;
    setStatus("offer created — copy to peer");
  });

  document.getElementById("btn-accept-offer")?.addEventListener("click", async () => {
    const r = remoteSdp?.value.trim() ?? "";
    if (!r) return setStatus("paste a remote offer first");
    setStatus("creating answer...");
    const peer = await peerPromise;
    const answer = await acceptOffer(peer, r);
    if (localSdp) localSdp.value = answer;
    setStatus("answer created — copy back to peer");
  });

  document.getElementById("btn-accept-answer")?.addEventListener("click", async () => {
    const r = remoteSdp?.value.trim() ?? "";
    if (!r) return setStatus("paste a remote answer first");
    const peer = await peerPromise;
    await acceptAnswer(peer, r);
    setStatus("answer applied");
  });
}
