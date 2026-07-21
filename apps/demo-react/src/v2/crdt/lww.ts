/**
 * Last-writer-wins register and map — the structured-data half of the CRDT
 * toolkit, for things where merging means "the most recent write wins" rather
 * than weaving (spreadsheet cells, slide titles/body, document settings).
 * Conflicts resolve by OpId order (clock, then site), so every replica agrees
 * on the winner without coordination. Writes are commutative and idempotent.
 */
import { idLt, type OpId } from './id.js';

export interface LwwEntry<T> { value: T | undefined; at: OpId }

/** A single last-writer-wins value. */
export class LWWRegister<T> {
  private entry: LwwEntry<T> | null = null;

  get value(): T | undefined { return this.entry?.value; }
  get stamp(): OpId | undefined { return this.entry?.at; }

  /** Apply a write; keeps it only if it's newer than the current value. */
  set(value: T | undefined, at: OpId): boolean {
    if (this.entry && !idLt(this.entry.at, at)) return false; // older or equal — ignore
    this.entry = { value, at };
    return true;
  }
}

/** A last-writer-wins map; deletion is a write of `undefined`. */
export class LWWMap<T> {
  private regs = new Map<string, LWWRegister<T>>();

  private reg(key: string): LWWRegister<T> {
    let r = this.regs.get(key);
    if (!r) { r = new LWWRegister<T>(); this.regs.set(key, r); }
    return r;
  }

  set(key: string, value: T, at: OpId): boolean { return this.reg(key).set(value, at); }
  delete(key: string, at: OpId): boolean { return this.reg(key).set(undefined, at); }
  get(key: string): T | undefined { return this.regs.get(key)?.value; }
  has(key: string): boolean { return this.regs.get(key)?.value !== undefined; }

  /** Live entries (deleted keys excluded), key → value. */
  entries(): Array<[string, T]> {
    const out: Array<[string, T]> = [];
    for (const [k, r] of this.regs) { const v = r.value; if (v !== undefined) out.push([k, v]); }
    return out;
  }

  keys(): string[] { return this.entries().map(([k]) => k); }
  get size(): number { return this.entries().length; }
}
