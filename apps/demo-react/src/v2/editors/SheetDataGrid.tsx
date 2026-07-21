/**
 * Enterprise spreadsheet "Table view" powered by the unified `gridstorm` package
 * (gridstorm/react + gridstorm/plugins): column sort, multi-column filtering
 * (floating filter row), inline editing, range selection, copy/paste and column
 * resize. Edits are written back to the sheet model. A status bar shows live
 * aggregates (sum / avg / count / min / max) for numeric columns. Lazy-loaded.
 */
import { useMemo } from 'react';
import { GridStorm, type ReactColumnDef } from 'gridstorm/react';
import { SortingPlugin, FilteringPlugin, EditingPlugin, SelectionPlugin, ClipboardPlugin, ColumnResizePlugin } from 'gridstorm/plugins';
import 'gridstorm/theme';
import { columnStats } from '../smart/formula.js';

type Row = { __id: string } & Record<string, string>;

/** A column reads as numeric when every non-empty data cell parses as a number. */
function isNumericColumn(rows: string[][], c: number): boolean {
  let sawValue = false;
  for (let r = 1; r < rows.length; r++) {
    const v = (rows[r]?.[c] ?? '').trim();
    if (v === '') continue;
    if (Number.isNaN(Number(v))) return false;
    sawValue = true;
  }
  return sawValue;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export function SheetDataGrid({
  rows,
  dark,
  onCellChange,
}: {
  rows: string[][];
  dark?: boolean;
  onCellChange: (rowIndex: number, colIndex: number, value: string) => void;
}) {
  const header = rows[0] ?? [];

  const columns: ReactColumnDef<Row>[] = useMemo(
    () => header.map((h, c) => ({
      field: String(c),
      headerName: h.trim() || `Column ${c + 1}`,
      sortable: true,
      filterable: true,
      filter: isNumericColumn(rows, c) ? 'number' : 'text',
      editable: true,
      resizable: true,
      minWidth: 96,
    })),
    [header, rows],
  );

  const rowData: Row[] = useMemo(
    () => rows.slice(1).map((r, i) => {
      const o = { __id: String(i + 1) } as Row;
      header.forEach((_, c) => { o[String(c)] = r[c] ?? ''; });
      return o;
    }),
    [rows, header],
  );

  const plugins = useMemo(
    () => [SortingPlugin(), FilteringPlugin(), EditingPlugin(), SelectionPlugin(), ClipboardPlugin(), ColumnResizePlugin()],
    [],
  );

  const stats = useMemo(() => columnStats(rows), [rows]);

  return (
    <div className="ed-datagrid">
      <div className="ed-datagrid-grid">
        <GridStorm<Row>
          columns={columns}
          rowData={rowData}
          getRowId={(p) => p.data.__id}
          plugins={plugins}
          floatingFilter
          rowSelection="multiple"
          theme={dark ? 'dark' : 'light'}
          height="100%"
          onCellValueChanged={(e) => {
            const ri = Number(e.node.id);
            const ci = Number(e.colId);
            if (!Number.isNaN(ri) && !Number.isNaN(ci)) onCellChange(ri, ci, String(e.newValue ?? ''));
          }}
        />
      </div>
      <div className="ed-datagrid-status" role="status">
        <span className="ed-dg-rows">{rowData.length} row{rowData.length === 1 ? '' : 's'}</span>
        {stats.map((s) => (
          <span key={s.header} className="ed-dg-stat">
            <strong>{s.header}</strong> Σ {fmt(s.sum)} · avg {fmt(s.avg)} · n {s.count} · min {fmt(s.min)} · max {fmt(s.max)}
          </span>
        ))}
      </div>
    </div>
  );
}
