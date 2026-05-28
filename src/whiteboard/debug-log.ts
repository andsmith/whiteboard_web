export type DebugKind =
  | "draw" | "modify" | "rtc" | "net" | "send" | "recv" | "info" | "warn";

export interface DebugEntry {
  ts: number;
  kind: DebugKind;
  msg: string;
}

const MAX_ENTRIES = 500;

export class DebugLog {
  entries: DebugEntry[] = [];
  onChange: () => void = () => {};

  log(kind: DebugKind, msg: string): void {
    this.entries.push({ ts: Date.now(), kind, msg });
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();
    // Mirror to console for the dev tools too.
    // eslint-disable-next-line no-console
    console.log(`[dbg ${kind}] ${msg}`);
    this.onChange();
  }

  clear(): void {
    this.entries.length = 0;
    this.onChange();
  }
}
