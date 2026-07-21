/**
 * Bridge between a plain text surface (textarea / contenteditable value) and the
 * RGA. `diffToOps` turns "the text used to be X, now it's Y" into the minimal
 * insert/delete against the CRDT — by finding the common prefix and suffix and
 * treating the middle as one replaced region. That covers typing, backspace,
 * paste, and select-and-replace, which is how a text box actually changes
 * between change events.
 */
import { RGA, type RgaOp } from './rga.js';

export function diffToOps(rga: RGA, next: string): RgaOp[] {
  const prev = rga.toString();
  if (prev === next) return [];
  const min = Math.min(prev.length, next.length);
  let p = 0;
  while (p < min && prev[p] === next[p]) p++;
  let s = 0;
  while (s < min - p && prev[prev.length - 1 - s] === next[next.length - 1 - s]) s++;
  const delCount = prev.length - p - s;
  const insStr = next.slice(p, next.length - s);
  const ops: RgaOp[] = [];
  if (delCount > 0) ops.push(...rga.deleteAt(p, delCount));
  if (insStr) ops.push(...rga.insertAt(p, insStr));
  return ops;
}

/**
 * A collaborative text value: a CRDT plus a thin API editors bind to. Local
 * edits go through `setText` (which returns ops to broadcast); remote ops come
 * in through `applyRemote`. `onChange` fires whenever the text changes from a
 * remote op so the UI can refresh. Transport-agnostic — the network layer
 * (Phase 3) just moves the op arrays.
 */
export class CrdtText {
  readonly rga: RGA;
  private listeners = new Set<(text: string) => void>();

  constructor(initial = '', site?: string) {
    this.rga = new RGA(site);
    if (initial) this.rga.insertAt(0, initial);
  }

  get text(): string { return this.rga.toString(); }

  /** Apply a local edit; returns the ops to send to peers (empty if no change). */
  setText(next: string): RgaOp[] { return diffToOps(this.rga, next); }

  /** Apply ops from a peer and notify listeners with the new text. */
  applyRemote(ops: RgaOp[]): void {
    if (!ops.length) return;
    this.rga.applyAll(ops);
    const t = this.text;
    for (const fn of this.listeners) fn(t);
  }

  onChange(fn: (text: string) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Op log a late joiner can apply to catch up to the current state. */
  snapshot(): RgaOp[] { return this.rga.snapshot(); }
}
