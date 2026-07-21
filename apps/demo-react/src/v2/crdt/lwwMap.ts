/**
 * A last-writer-wins map CRDT — the structured-document counterpart to the text
 * RGA. Each key holds a value tagged with a Lamport timestamp and the writer's
 * site id; on a conflict the higher timestamp wins, ties broken deterministically
 * by site id. That makes it strongly eventually consistent: every replica that
 * has seen the same set of ops holds exactly the same map, regardless of order.
 *
 * It powers collaboration in the structured editors where edits naturally land on
 * distinct keys — different spreadsheet cells, different slide fields — so
 * concurrent edits don't conflict at all, and the rare same-key clash resolves
 * the same way everywhere.
 */
export interface LwwOp {
  key: string;
  value: string;
  /** Lamport timestamp. */
  t: number;
  /** Writer site id (tiebreak). */
  site: string;
}

interface Entry { value: string; t: number; site: string }

export class LwwMap {
  private map = new Map<string, Entry>();
  private clock = 0;

  constructor(readonly site: string) {}

  /** Record a local write and return the op to broadcast. The Lamport clock is
   *  bumped past everything seen so far, so a fresh local edit always wins. */
  set(key: string, value: string): LwwOp {
    const t = ++this.clock;
    this.map.set(key, { value, t, site: this.site });
    return { key, value, t, site: this.site };
  }

  /** Apply a remote op. Returns true if it changed our state. */
  apply(op: LwwOp): boolean {
    if (op.t > this.clock) this.clock = op.t;
    const cur = this.map.get(op.key);
    if (cur && (cur.t > op.t || (cur.t === op.t && cur.site >= op.site))) return false;
    this.map.set(op.key, { value: op.value, t: op.t, site: op.site });
    return true;
  }

  /** Apply many ops; returns true if any changed our state. */
  applyAll(ops: LwwOp[]): boolean {
    let changed = false;
    for (const op of ops) if (this.apply(op)) changed = true;
    return changed;
  }

  get(key: string): string | undefined { return this.map.get(key)?.value; }
  has(key: string): boolean { return this.map.has(key); }

  /** Every entry as a broadcastable op list (for catching up a new joiner). */
  snapshot(): LwwOp[] {
    return [...this.map.entries()].map(([key, e]) => ({ key, value: e.value, t: e.t, site: e.site }));
  }

  /** Current key→value view. */
  entries(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, e] of this.map) out[k] = e.value;
    return out;
  }
}
