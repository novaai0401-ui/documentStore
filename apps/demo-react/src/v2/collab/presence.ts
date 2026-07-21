/**
 * Shared presence model for collaboration sessions. A peer is identified by a
 * short random id and carries a display name, a stable colour derived from that
 * id, and an optional cursor position. Both the text session and the structured
 * (map) session use this so the live-presence UI is identical everywhere.
 */
export interface Peer { id: string; name: string; color: string; cursor?: number; seen: number }

export const COLORS = ['#2e5bff', '#7c3aed', '#ea580c', '#15803d', '#db2777', '#0891b2', '#ca8a04'];

/** Deterministic colour for a peer id, so everyone renders the same peer alike. */
export const colorFor = (id: string): string => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]!;
