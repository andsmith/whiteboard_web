function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

export function readRemoteSDP(): string {
  return el<HTMLTextAreaElement>("remote-sdp")?.value.trim() ?? "";
}

export function writeLocalSDP(sdp: string): void {
  const ta = el<HTMLTextAreaElement>("local-sdp");
  if (ta) ta.value = sdp;
}

export function setStatus(msg: string): void {
  const node = el<HTMLDivElement>("status");
  if (node) node.textContent = `status: ${msg}`;
}
