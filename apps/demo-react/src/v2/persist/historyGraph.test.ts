import { describe, it, expect } from 'vitest';
import { childrenMap, roots, tips, lineage, commonAncestor, linearize, type VersionNode } from './historyGraph.js';

//  v1 ─ v2 ─ v3        (main line)
//        └── v4 ─ v5   (branch from v2, e.g. after a restore)
const nodes: VersionNode[] = [
  { id: 'v1', label: '1', createdAt: 1 },
  { id: 'v2', parentId: 'v1', label: '2', createdAt: 2 },
  { id: 'v3', parentId: 'v2', label: '3', createdAt: 3 },
  { id: 'v4', parentId: 'v2', label: '4', createdAt: 4 },
  { id: 'v5', parentId: 'v4', label: '5', createdAt: 5 },
];

describe('historyGraph', () => {
  it('maps children in creation order', () => {
    expect(childrenMap(nodes).get('v2')).toEqual(['v3', 'v4']);
  });
  it('finds roots and branch tips', () => {
    expect(roots(nodes).map((n) => n.id)).toEqual(['v1']);
    expect(tips(nodes).map((n) => n.id).sort()).toEqual(['v3', 'v5']); // two open branches
  });
  it('computes lineage oldest→node', () => {
    expect(lineage('v5', nodes).map((n) => n.id)).toEqual(['v1', 'v2', 'v4', 'v5']);
  });
  it('finds the nearest common ancestor across branches', () => {
    expect(commonAncestor('v3', 'v5', nodes)?.id).toBe('v2');
    expect(commonAncestor('v3', 'v3', nodes)?.id).toBe('v3');
  });
  it('linearizes into a depth-annotated tree', () => {
    const lin = linearize(nodes);
    expect(lin.map((x) => x.node.id)).toEqual(['v1', 'v2', 'v3', 'v4', 'v5']);
    expect(lin.find((x) => x.node.id === 'v4')!.depth).toBe(2);
  });
  it('treats nodes whose parent is missing as roots (orphan-safe)', () => {
    expect(roots([{ id: 'x', parentId: 'gone', label: 'x', createdAt: 1 }]).map((n) => n.id)).toEqual(['x']);
  });
});
