import { initBoard } from "./board";
import { createPeer, createOffer, acceptOffer, acceptAnswer } from "./rtc";
import { readRemoteSDP, writeLocalSDP, setStatus } from "./signaling";
import { loadIceServers } from "./ice-config";

window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("board") as HTMLCanvasElement | null;
  if (canvas) initBoard(canvas);

  const local = document.getElementById("local-sdp") as HTMLTextAreaElement | null;
  if (local) local.value = "";
  const remote = document.getElementById("remote-sdp") as HTMLTextAreaElement | null;
  if (remote) remote.value = "";

  setStatus("loading TURN credentials...");
  const peerPromise = loadIceServers().then((iceServers) => {
    const p = createPeer({ iceServers });
    p.addEventListener("connectionstatechange", () => {
      setStatus(`peer: ${p.connectionState}`);
    });
    setStatus("idle");
    return p;
  });

  document.getElementById("btn-create-offer")?.addEventListener("click", async () => {
    setStatus("creating offer...");
    const peer = await peerPromise;
    const sdp = await createOffer(peer);
    writeLocalSDP(sdp);
    setStatus("offer created — copy to peer");
  });

  document.getElementById("btn-accept-offer")?.addEventListener("click", async () => {
    const remoteSdp = readRemoteSDP();
    if (!remoteSdp) return setStatus("paste a remote offer first");
    setStatus("creating answer...");
    const peer = await peerPromise;
    const answer = await acceptOffer(peer, remoteSdp);
    writeLocalSDP(answer);
    setStatus("answer created — copy back to peer");
  });

  document.getElementById("btn-accept-answer")?.addEventListener("click", async () => {
    const remoteSdp = readRemoteSDP();
    if (!remoteSdp) return setStatus("paste a remote answer first");
    const peer = await peerPromise;
    await acceptAnswer(peer, remoteSdp);
    setStatus("answer applied");
  });

  console.log("[whiteboard] stub ready");
});
