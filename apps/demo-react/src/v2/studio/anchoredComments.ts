/**
 * Element-anchored comments — Pillar D (collaboration depth) core. Unlike the
 * existing document-level comments, these attach to a specific design element (and
 * page), so a reviewer can say "make THIS bigger". The shape is CRDT-friendly
 * (immutable ops keyed by id) so it can ride the existing encrypted collab map
 * later. Pure list transforms here — fully unit-tested; UI/sync wire it up.
 */

export interface AnchoredComment {
  id: string;
  page: number;        // page index in a multi-page campaign (0 for single)
  elementId: string;   // the design element this is about
  author: string;
  text: string;
  createdAt: number;
  resolved?: boolean;
  orphaned?: boolean;  // its element was deleted but the thread is kept for context
}

export function addComment(list: AnchoredComment[], c: AnchoredComment): AnchoredComment[] {
  return [...list.filter((x) => x.id !== c.id), c];
}

export function editComment(list: AnchoredComment[], id: string, text: string): AnchoredComment[] {
  return list.map((c) => (c.id === id ? { ...c, text } : c));
}

export function resolveComment(list: AnchoredComment[], id: string, resolved = true): AnchoredComment[] {
  return list.map((c) => (c.id === id ? { ...c, resolved } : c));
}

export function deleteComment(list: AnchoredComment[], id: string): AnchoredComment[] {
  return list.filter((c) => c.id !== id);
}

/** Comments for one element on a page, oldest first. */
export function commentsFor(list: AnchoredComment[], page: number, elementId: string): AnchoredComment[] {
  return list.filter((c) => c.page === page && c.elementId === elementId).sort((a, b) => a.createdAt - b.createdAt);
}

/** Count of unresolved, non-orphaned comments (for a badge). */
export function openCount(list: AnchoredComment[]): number {
  return list.filter((c) => !c.resolved && !c.orphaned).length;
}

/** Element ids on a page that have at least one open comment (for canvas dots). */
export function annotatedElements(list: AnchoredComment[], page: number): Set<string> {
  return new Set(list.filter((c) => c.page === page && !c.resolved && !c.orphaned).map((c) => c.elementId));
}

/**
 * When elements are deleted, don't drop their threads — mark them orphaned so the
 * discussion survives (and stops showing as an active anchor). `liveByPage` maps
 * page index → the set of element ids that still exist.
 */
export function reconcile(list: AnchoredComment[], liveByPage: Map<number, Set<string>>): AnchoredComment[] {
  return list.map((c) => {
    const live = liveByPage.get(c.page)?.has(c.elementId) ?? false;
    return live === !c.orphaned ? c : { ...c, orphaned: !live };
  });
}
