import type { FormSchema, SchemaField } from '@pdfcraft/form-schema';
import type { FormFieldDescriptor } from '@pdfcraft/engine';

export interface TableGroup {
  /** Stable id derived from the column base names. */
  id: string;
  /** Page number this table lives on. */
  page: number;
  /** Column descriptors (one per detected base name). */
  columns: Array<{ base: string; label: string }>;
  /** Rows × columns of schema field ids; null means "cell missing". */
  cells: Array<Array<string | null>>;
}

export interface GroupedSchema {
  /** Standalone fields not part of any detected table. */
  standalone: SchemaField[];
  /** Tables detected from numeric-suffix clusters. */
  tables: TableGroup[];
}

/**
 * Detect tabular field clusters from the schema. Heuristic:
 *   Names like "Foo", "Foo0", "Foo1", ..., "FooN" share a base and
 *   represent rows of a single column. When multiple such bases share
 *   the SAME page AND the SAME row count, they form columns of a
 *   single table.
 *
 * This is a syntactic heuristic — it works on the producer's own
 * convention (filled-form 15G uses exactly this pattern). It doesn't
 * try to be smart about /Rect coordinates.
 */
export function groupSchema(schema: FormSchema): GroupedSchema {
  const standalone: SchemaField[] = [];
  const byBase: Record<string, Array<{ index: number; field: SchemaField }>> = {};

  for (const f of schema.fields) {
    const { base, index } = decompose(f.id);
    if (index === null) {
      standalone.push(f);
      continue;
    }
    (byBase[base] ??= []).push({ index, field: f });
  }

  // Bases with only one entry aren't really a column — promote back to standalone.
  for (const [base, entries] of Object.entries(byBase)) {
    if (entries.length < 2) {
      for (const e of entries) standalone.push(e.field);
      delete byBase[base];
    }
  }

  // Group bases by (page, sortedIndices) so we can pair columns that
  // share the same row structure.
  type Column = { base: string; page: number; indices: number[]; byIndex: Map<number, SchemaField> };
  const columns: Column[] = [];
  for (const [base, entries] of Object.entries(byBase)) {
    entries.sort((a, b) => a.index - b.index);
    const page = entries[0]!.field.page;
    const indices = entries.map((e) => e.index);
    const byIndex = new Map(entries.map((e) => [e.index, e.field] as const));
    columns.push({ base, page, indices, byIndex });
  }

  // Sibling test: same page + same exact index set => one table.
  const tables: TableGroup[] = [];
  const used = new Set<string>();
  for (const col of columns) {
    if (used.has(col.base)) continue;
    const siblings = columns.filter(
      (c) =>
        !used.has(c.base) &&
        c.page === col.page &&
        c.indices.length === col.indices.length &&
        c.indices.every((idx, i) => idx === col.indices[i]),
    );
    if (siblings.length < 2) {
      // Single column — treat each cell as standalone (rare for our use case).
      for (const f of col.byIndex.values()) standalone.push(f);
      used.add(col.base);
      continue;
    }
    for (const s of siblings) used.add(s.base);
    const rowCount = col.indices.length;
    const cells: Array<Array<string | null>> = [];
    for (let r = 0; r < rowCount; r++) {
      const row: Array<string | null> = [];
      for (const s of siblings) {
        const f = s.byIndex.get(col.indices[r]!);
        row.push(f?.id ?? null);
      }
      cells.push(row);
    }
    tables.push({
      id: siblings.map((s) => s.base).join('|'),
      page: col.page,
      columns: siblings.map((s) => ({ base: s.base, label: prettify(s.base) })),
      cells,
    });
  }

  // Sort fields so they appear in the order a human reads the PDF.
  // PDF authors almost always number their fields ("1.", "2.", ...) and
  // expect that order in the form view. When two fields are both numbered,
  // numeric order wins. When they're not, fall back to visual order:
  // (page, top-of-page first via Y desc, left-to-right via X asc).
  const rectOf = (id: string): [number, number] => {
    const widgets = schema.widgetIndex[id];
    const first = widgets?.[0] as FormFieldDescriptor | undefined;
    if (!first) return [0, 0];
    return [first.rect[0], first.rect[1]];
  };
  const leadingNumber = (id: string): number | null => {
    // First, prefer a leading number — "1 Foo", "1. Foo", "(1)", "Q1 Foo".
    const start = /^(?:Q|\()?(\d+)[\s.):]/.exec(id);
    if (start) return Number(start[1]);
    // Some PDF producers put the section number in the middle, e.g.
    // "responsible for paying 3 PAN of the person" — the producer's odd
    // way of naming "3. PAN of the person responsible for paying". Find
    // a numeric token followed by a capital letter (the label's start).
    const middle = / (\d+) [A-Z]/.exec(id);
    if (middle) return Number(middle[1]);
    return null;
  };
  standalone.sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    const an = leadingNumber(a.id);
    const bn = leadingNumber(b.id);
    // Both have a leading number — prefer numeric order. Author intent wins.
    if (an !== null && bn !== null) return an - bn;
    // Only one has a number — numbered fields come first on their page.
    if (an !== null) return -1;
    if (bn !== null) return 1;
    // Neither has a number — visual order.
    const [ax, ay] = rectOf(a.id);
    const [bx, by] = rectOf(b.id);
    if (Math.abs(ay - by) > 4) return by - ay;
    return ax - bx;
  });
  tables.sort((a, b) => a.page - b.page);

  return { standalone, tables };
}

/**
 * Split an id into a base + numeric suffix. "Foo" → base "Foo", index null.
 * "Foo" / "Foo0" / "Foo1" are all considered the same base; the first
 * (no suffix) gets index 0 by convention so it sorts at the start.
 */
function decompose(id: string): { base: string; index: number | null } {
  const m = /^(.+?)(\d+)$/.exec(id);
  if (m) return { base: m[1]!.replace(/\s+$/, ''), index: Number(m[2]!) + 1 };
  return { base: id, index: null };
}

function prettify(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
