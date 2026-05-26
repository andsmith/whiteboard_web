export function createPeer(config: RTCConfiguration): RTCPeerConnection {
  return new RTCPeerConnection(config);
}

async function waitForIceComplete(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const check = () => {
      if (peer.iceGatheringState === "complete") {
        peer.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    };
    peer.addEventListener("icegatheringstatechange", check);
  });
}

export async function createOffer(peer: RTCPeerConnection): Promise<string> {
  peer.createDataChannel("whiteboard");
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  await waitForIceComplete(peer);
  return JSON.stringify(peer.localDescription);
}

export async function acceptOffer(peer: RTCPeerConnection, remoteSdp: string): Promise<string> {
  const desc = JSON.parse(remoteSdp) as RTCSessionDescriptionInit;
  await peer.setRemoteDescription(desc);
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  await waitForIceComplete(peer);
  return JSON.stringify(peer.localDescription);
}

export async function acceptAnswer(peer: RTCPeerConnection, remoteSdp: string): Promise<void> {
  const desc = JSON.parse(remoteSdp) as RTCSessionDescriptionInit;
  await peer.setRemoteDescription(desc);
}
