import type { Op } from "./vector-store";
import type { Vector } from "./vectors";
import type { AnchorView } from "./anchors";

export interface Submission {
  id: string;
  fromPeerId: string;
  fromName: string;
  ops: Op[];
  /** The submitter's pan/zoom at submission time. Host's preview uses this
   * if it covers all the modified vectors; otherwise falls back to fit-bbox. */
  submitterView: AnchorView;
  receivedAt: number;
}

export function newSubmissionId(): string {
  return (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.()
    ?? `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Compute the set of vector IDs touched by an op (and any nested batch ops). */
export function opAffectedIds(op: Op, into: Set<string> = new Set()): Set<string> {
  switch (op.kind) {
    case "add": into.add(op.vector.id); break;
    case "delete": into.add(op.vector.id); break;
    case "replace": into.add(op.after.id); break;
    case "batch": for (const o of op.ops) opAffectedIds(o, into); break;
  }
  return into;
}

/** Apply ops to a Map<id, Vector> in-place. Used for preview computation
 * without mutating the canonical store. */
export function applyOpsTo(map: Map<string, Vector>, op: Op): void {
  switch (op.kind) {
    case "add": map.set(op.vector.id, op.vector); break;
    case "delete": map.delete(op.vector.id); break;
    case "replace": map.set(op.after.id, op.after); break;
    case "batch": for (const o of op.ops) applyOpsTo(map, o); break;
  }
}
