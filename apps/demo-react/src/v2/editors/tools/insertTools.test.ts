import { describe, it, expect } from 'vitest';
import { INSERT_TOOLS, toolsForKind, groupedToolsForKind, TOOL_GROUPS, type DocKind } from './insertTools.js';

describe('content-tools registry', () => {
  it('has unique tool ids', () => {
    const ids = INSERT_TOOLS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every tool declares at least one kind and a usable content form', () => {
    for (const t of INSERT_TOOLS) {
      expect(t.kinds.length).toBeGreaterThan(0);
      const c = t.content;
      const hasForm = !!(c.markdown || c.html || c.text || c.slide || c.rows);
      expect(hasForm, `${t.id} has no content`).toBe(true);
    }
  });

  it('every tool sits in a known group', () => {
    const groups = new Set(TOOL_GROUPS.map((g) => g.id));
    for (const t of INSERT_TOOLS) expect(groups.has(t.group)).toBe(true);
  });

  it('toolsForKind only returns tools that declare that kind', () => {
    for (const kind of ['markdown', 'text', 'html', 'word', 'sheet', 'slide'] as DocKind[]) {
      for (const t of toolsForKind(kind)) expect(t.kinds).toContain(kind);
    }
  });

  it('slide tools carry a slide payload; sheet tools carry rows', () => {
    for (const t of toolsForKind('slide')) expect(t.content.slide).toBeDefined();
    for (const t of toolsForKind('sheet')) expect(t.content.rows).toBeDefined();
  });

  it('document kinds expose a rich palette; grouped view drops empty groups', () => {
    expect(toolsForKind('markdown').length).toBeGreaterThanOrEqual(8);
    const grouped = groupedToolsForKind('markdown');
    expect(grouped.length).toBeGreaterThan(0);
    for (const g of grouped) expect(g.tools.length).toBeGreaterThan(0);
    // Flattened grouped tools equal the flat list for that kind.
    expect(grouped.flatMap((g) => g.tools).length).toBe(toolsForKind('markdown').length);
  });
});
