import type { Point } from "./view";
import type { ColorHex } from "./app-state";

export interface AnchorView {
  origin: Point;
  zoom: number;
}

export interface Anchor {
  id: string;
  name: string;
  color: ColorHex;
  /** peerId of the user that created it. */
  author: string;
  createdAt: number;
  /** Saved pan/zoom — clicking the anchor restores this. */
  view: AnchorView;
  /** World coord that was the screen center at save time. Used to place
   * the on-canvas icon (constant screen size regardless of zoom). */
  position: Point;
}

export function newAnchorId(): string {
  return (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.()
    ?? `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
