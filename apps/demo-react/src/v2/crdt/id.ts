/**
 * Identity and logical-clock primitives for our in-house CRDTs. Every change
 * carries an OpId — a Lamport clock value plus a unique site id — which gives a
 * deterministic total order across all replicas. Concurrent operations are
 * ordered by (clock, site), so two machines that have seen the same operations
 * always agree on the result regardless of arrival order.
 */
export interface OpId {
  /** Lamport clock — counts causal progress, monotonically increasing per site. */
  c: number;
  /** Site id — unique per editing client; breaks ties between equal clocks. */
  s: string;
}

/** Stable string key for an OpId (for maps/sets). */
export const keyOf = (id: OpId): string => `${id.c}@${id.s}`;

export const idEq = (a: OpId, b: OpId): boolean => a.c === b.c && a.s === b.s;

/** Total order: by clock, then by site id. */
export const idLt = (a: OpId, b: OpId): boolean => (a.c < b.c) || (a.c === b.c && a.s < b.s);

/** Compare for sorting (ascending). */
export const idCmp = (a: OpId, b: OpId): number => (a.c - b.c) || (a.s < b.s ? -1 : a.s > b.s ? 1 : 0);

/** Generate a random, collision-resistant site id. */
export function newSiteId(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

/**
 * A per-site Lamport clock. `tick()` mints the next id for a local change;
 * `observe()` advances the clock past a remote id so locally-minted ids always
 * sort after everything seen so far.
 */
export class Clock {
  private n = 0;
  constructor(public readonly site: string = newSiteId()) {}

  tick(): OpId {
    this.n += 1;
    return { c: this.n, s: this.site };
  }

  observe(id: OpId): void {
    if (id.c > this.n) this.n = id.c;
  }

  /** Current clock value (for tests / snapshots). */
  get value(): number { return this.n; }
}
