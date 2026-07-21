/**
 * A sequence CRDT for collaborative text — a causal-tree / RGA. Each character
 * is a node with a unique OpId and an "origin" (the id of the character it was
 * typed after). The document order is a pre-order walk of the tree where
 * siblings of the same origin are sorted by id descending, so concurrent
 * insertions at the same spot converge to the same order on every replica.
 * Deletions are tombstones (the node stays, hidden), which keeps later
 * insertions that referenced it well-defined.
 *
 * Operations are commutative and idempotent: applying the same set of ops in
 * any order, with duplicates, yields the same text. Ops that arrive before
 * their causal dependency (an insert before its origin, or a delete before its
 * insert) are buffered and integrated once the dependency lands — so no
 * ordering guarantees are required from the transport.
 */
import { Clock, idEq, idLt, keyOf, type OpId } from './id.js';

export type RgaOp =
  | { t: 'ins'; id: OpId; origin: OpId | null; ch: string }
  | { t: 'del'; id: OpId };

interface Node { id: OpId; origin: OpId | null; ch: string; deleted: boolean }

const ROOT = '';

export class RGA {
  private clock: Clock;
  private nodes = new Map<string, Node>();
  /** origin key → child nodes, kept sorted by id descending. */
  private children = new Map<string, Node[]>();
  /** Inserts waiting for their origin to arrive, keyed by the missing origin. */
  private pendingIns = new Map<string, Node[]>();
  /** Deletes that arrived before their target insert. */
  private pendingDel = new Set<string>();

  constructor(site?: string) {
    this.clock = new Clock(site);
  }

  get site(): string { return this.clock.site; }

  // ── reads ──────────────────────────────────────────────────────────────────

  /** All nodes in document order, including tombstones. */
  private order(): Node[] {
    const out: Node[] = [];
    const walk = (originKey: string) => {
      for (const node of this.children.get(originKey) ?? []) {
        out.push(node);
        walk(keyOf(node.id));
      }
    };
    walk(ROOT);
    return out;
  }

  /** Visible (non-deleted) nodes in document order. */
  private visible(): Node[] { return this.order().filter((n) => !n.deleted); }

  toString(): string { return this.visible().map((n) => n.ch).join(''); }

  get length(): number { return this.visible().length; }

  // ── local edits (produce ops) ────────────────────────────────────────────────

  /** Insert `text` at visible index `pos`; returns the generated ops. */
  insertAt(pos: number, text: string): RgaOp[] {
    const vis = this.visible();
    let originId: OpId | null = pos <= 0 ? null : (vis[Math.min(pos, vis.length) - 1]?.id ?? null);
    const ops: RgaOp[] = [];
    for (const ch of text) {
      const id = this.clock.tick();
      const op: RgaOp = { t: 'ins', id, origin: originId, ch };
      this.integrateInsert(id, originId, ch);
      ops.push(op);
      originId = id; // chain subsequent chars after the one just inserted
    }
    return ops;
  }

  /** Delete `count` visible characters starting at visible index `pos`. */
  deleteAt(pos: number, count = 1): RgaOp[] {
    const vis = this.visible();
    const ops: RgaOp[] = [];
    for (let i = 0; i < count; i++) {
      const node = vis[pos + i];
      if (!node) break;
      node.deleted = true;
      ops.push({ t: 'del', id: node.id });
    }
    return ops;
  }

  // ── remote ops ───────────────────────────────────────────────────────────────

  apply(op: RgaOp): void {
    if (op.t === 'ins') {
      this.clock.observe(op.id);
      this.integrateInsert(op.id, op.origin, op.ch);
    } else {
      this.clock.observe(op.id);
      const node = this.nodes.get(keyOf(op.id));
      if (node) node.deleted = true;
      else this.pendingDel.add(keyOf(op.id)); // delete before insert — buffer
    }
  }

  applyAll(ops: Iterable<RgaOp>): void { for (const op of ops) this.apply(op); }

  // ── integration ──────────────────────────────────────────────────────────────

  private integrateInsert(id: OpId, origin: OpId | null, ch: string): void {
    const idKey = keyOf(id);
    if (this.nodes.has(idKey)) return; // idempotent
    // Buffer until the origin exists, so out-of-order delivery still converges.
    if (origin && !this.nodes.has(keyOf(origin))) {
      const k = keyOf(origin);
      const list = this.pendingIns.get(k) ?? [];
      list.push({ id, origin, ch, deleted: false });
      this.pendingIns.set(k, list);
      return;
    }
    const node: Node = { id, origin, ch, deleted: this.pendingDel.delete(idKey) };
    this.nodes.set(idKey, node);
    const ok = origin ? keyOf(origin) : ROOT;
    const siblings = this.children.get(ok) ?? [];
    // Insert keeping siblings sorted by id descending (newer ids first).
    let i = 0;
    while (i < siblings.length && idLt(id, siblings[i]!.id)) i++;
    siblings.splice(i, 0, node);
    this.children.set(ok, siblings);
    // Drain any inserts that were waiting on this node.
    const waiting = this.pendingIns.get(idKey);
    if (waiting) {
      this.pendingIns.delete(idKey);
      for (const w of waiting) this.integrateInsert(w.id, w.origin, w.ch);
    }
  }

  // ── snapshot / restore (for late joiners) ────────────────────────────────────

  /** Full state as an op log that recreates this document when applied fresh. */
  snapshot(): RgaOp[] {
    const ops: RgaOp[] = [];
    for (const n of this.order()) {
      ops.push({ t: 'ins', id: n.id, origin: n.origin, ch: n.ch });
      if (n.deleted) ops.push({ t: 'del', id: n.id });
    }
    return ops;
  }

  static fromSnapshot(ops: RgaOp[], site?: string): RGA {
    const rga = new RGA(site);
    rga.applyAll(ops);
    return rga;
  }

  /** True when no buffered ops remain waiting on missing dependencies. */
  get settled(): boolean { return this.pendingIns.size === 0; }
}

/** Helper: idEq re-exported for binding code that diffs node ids. */
export { idEq };
