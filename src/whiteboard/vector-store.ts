import type { Vector } from "./vectors";

export type Op =
  | { kind: "add"; vector: Vector }
  | { kind: "delete"; vector: Vector }
  | { kind: "replace"; before: Vector; after: Vector }
  | { kind: "batch"; ops: Op[] };

function invert(op: Op): Op {
  switch (op.kind) {
    case "add": return { kind: "delete", vector: op.vector };
    case "delete": return { kind: "add", vector: op.vector };
    case "replace": return { kind: "replace", before: op.after, after: op.before };
    case "batch": return { kind: "batch", ops: op.ops.slice().reverse().map(invert) };
  }
}

export class VectorStore {
  vectors: Map<string, Vector> = new Map();
  /** Fires when a local mutation should be broadcast to peers. Remote ops
   * applied via apply() do NOT fire this. */
  onLocalChange?: (op: Op) => void;
  private undoStack: Op[] = [];
  private redoStack: Op[] = [];

  /** Apply op to state without touching undo/redo (used by undo/redo themselves and remote ops). */
  apply(op: Op): void {
    switch (op.kind) {
      case "add":
        this.vectors.set(op.vector.id, op.vector);
        break;
      case "delete":
        this.vectors.delete(op.vector.id);
        break;
      case "replace":
        this.vectors.set(op.after.id, op.after);
        break;
      case "batch":
        for (const o of op.ops) this.apply(o);
        break;
    }
  }

  /** Apply op and push onto undo stack; clears redo. */
  applyAndRecord(op: Op): void {
    this.apply(op);
    this.undoStack.push(op);
    this.redoStack.length = 0;
    this.onLocalChange?.(op);
  }

  /** Record an op as undoable without applying it (caller has already
   * mutated state directly, e.g. across many intermediate drag frames). */
  recordOnly(op: Op): void {
    this.undoStack.push(op);
    this.redoStack.length = 0;
    this.onLocalChange?.(op);
  }

  undo(): Op | null {
    const op = this.undoStack.pop();
    if (!op) return null;
    const inv = invert(op);
    this.apply(inv);
    this.redoStack.push(op);
    this.onLocalChange?.(inv);
    return inv;
  }

  redo(): Op | null {
    const op = this.redoStack.pop();
    if (!op) return null;
    this.apply(op);
    this.undoStack.push(op);
    this.onLocalChange?.(op);
    return op;
  }

  /** Wipe the undo/redo stacks (called when remote ops invalidate them). */
  clearHistory(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }

  /** Delete all vectors matching `filter` as one undoable batch. */
  deleteWhere(filter: (v: Vector) => boolean): void {
    const ops: Op[] = [];
    for (const v of this.vectors.values()) {
      if (filter(v)) ops.push({ kind: "delete", vector: v });
    }
    if (ops.length === 0) return;
    this.applyAndRecord({ kind: "batch", ops });
  }

  serialize(): string {
    return JSON.stringify({
      version: 1,
      vectors: Array.from(this.vectors.values()),
    }, null, 2);
  }

  /** Replaces all vectors with the contents of the JSON snapshot. */
  deserialize(json: string): void {
    const data = JSON.parse(json) as { version?: number; vectors?: Vector[] };
    if (data.version !== 1 || !Array.isArray(data.vectors)) {
      throw new Error("Unrecognized whiteboard file format");
    }
    this.vectors.clear();
    for (const v of data.vectors) this.vectors.set(v.id, v);
    this.clearHistory();
  }
}
