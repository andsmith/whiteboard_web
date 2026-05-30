// Distinct user-color palette for participant-hover highlights. Deliberately
// not overlapping with the 8 drawing colors in app-state.ts COLORS so the
// highlight color can never be confused with a real shape color.

export const USER_COLORS = [
  "#e6194B", "#3cb44b", "#ffe119", "#4363d8", "#f58231",
  "#911eb4", "#42d4f4", "#f032e6", "#469990", "#9A6324",
] as const;

/** Deterministic per-user color. FNV-1a 32-bit hash → palette index. */
export function userColor(peerId: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < peerId.length; i++) {
    h ^= peerId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return USER_COLORS[(h >>> 0) % USER_COLORS.length]!;
}
