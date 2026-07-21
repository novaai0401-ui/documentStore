/**
 * Version history as a branching graph — Pillar B (local-first data) core. Today
 * snapshots are a flat list; this turns them into a DAG: each version points to
 * the parent it was created from, so "restore" creates a new version (a branch)
 * instead of losing the future, and you can compare/branch/merge. Pure graph
 * maths over snapshot metadata — fully unit-tested; the store + UI consume it.
 */

export interface VersionNode { id: string; parentId?: string; label: string; createdAt: number }

/** Map of node id → its children ids (in creation order). */
export function childrenMap(nodes: VersionNode[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const n of [...nodes].sort((a, b) => a.createdAt - b.createdAt)) {
    if (n.parentId) { const arr = m.get(n.parentId) ?? []; arr.push(n.id); m.set(n.parentId, arr); }
  }
  return m;
}

/** Root nodes (no parent, or parent missing from the set). */
export function roots(nodes: VersionNode[]): VersionNode[] {
  const ids = new Set(nodes.map((n) => n.id));
  return nodes.filter((n) => !n.parentId || !ids.has(n.parentId));
}

/** Branch tips — versions with no children (the latest on each line of work). */
export function tips(nodes: VersionNode[]): VersionNode[] {
  const parents = new Set(nodes.map((n) => n.parentId).filter(Boolean) as string[]);
  return nodes.filter((n) => !parents.has(n.id));
}

/** Root→node path (the lineage of a version), oldest first. */
export function lineage(id: string, nodes: VersionNode[]): VersionNode[] {
  const by = new Map(nodes.map((n) => [n.id, n]));
  const out: VersionNode[] = [];
  const seen = new Set<string>();
  let cur = by.get(id);
  while (cur && !seen.has(cur.id)) { out.push(cur); seen.add(cur.id); cur = cur.parentId ? by.get(cur.parentId) : undefined; }
  return out.reverse();
}

/** Nearest common ancestor of two versions, or undefined if none. */
export function commonAncestor(a: string, b: string, nodes: VersionNode[]): VersionNode | undefined {
  const al = lineage(a, nodes);
  const bset = new Set(lineage(b, nodes).map((n) => n.id));
  for (let i = al.length - 1; i >= 0; i--) if (bset.has(al[i]!.id)) return al[i];
  return undefined;
}

/** Stable display order: a depth-first walk from each root (children oldest-first),
 *  with a depth for indentation in a tree view. */
export function linearize(nodes: VersionNode[]): Array<{ node: VersionNode; depth: number }> {
  const kids = childrenMap(nodes);
  const by = new Map(nodes.map((n) => [n.id, n]));
  const out: Array<{ node: VersionNode; depth: number }> = [];
  const visit = (id: string, depth: number) => {
    const n = by.get(id); if (!n) return;
    out.push({ node: n, depth });
    for (const c of kids.get(id) ?? []) visit(c, depth + 1);
  };
  for (const r of roots(nodes).sort((a, b) => a.createdAt - b.createdAt)) visit(r.id, 0);
  return out;
}
