import { initBoard } from "./board";
import { createPeer, createOffer, acceptOffer, acceptAnswer } from "./rtc";
import { readRemoteSDP, writeLocalSDP, setStatus } from "./signaling";
import { loadIceServers } from "./ice-config";

window.addEventListener("DOMContentLoaded", async () => {
  const canvas = document.getElementById("board") as HTMLCanvasElement | null;
  if (canvas) initBoard(canvas);

  setStatus("loading TURN credentials...");
  const iceServers = await loadIceServers();
  const peer = createPeer({ iceServers });
  setStatus("idle");

  peer.addEventListener("connectionstatechange", () => {
    setStatus(`peer: ${peer.connectionState}`);
  });

  document.getElementById("btn-create-offer")?.addEventListener("click", async () => {
    const sdp = await createOffer(peer);
    writeLocalSDP(sdp);
    setStatus("offer created — copy to peer");
  });

  document.getElementById("btn-accept-offer")?.addEventListener("click", async () => {
    const remote = readRemoteSDP();
    if (!remote) return setStatus("paste a remote offer first");
    const answer = await acceptOffer(peer, remote);
    writeLocalSDP(answer);
    setStatus("answer created — copy back to peer");
  });

  document.getElementById("btn-accept-answer")?.addEventListener("click", async () => {
    const remote = readRemoteSDP();
    if (!remote) return setStatus("paste a remote answer first");
    await acceptAnswer(peer, remote);
    setStatus("answer applied");
  });

  console.log("[whiteboard] stub ready");
});
