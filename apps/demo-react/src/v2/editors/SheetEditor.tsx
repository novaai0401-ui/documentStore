/**
 * Native spreadsheet editor for .xlsx / .xls / .ods / .csv / .tsv. Reads with
 * SheetJS into an editable grid (per-sheet tabs), edits cells in place, and
 * saves back to the original family — or converts to PDF. No PDF round-trip to
 * view your data.
 */
import { useEffect, useMemo, useRef, useState, lazy, Suspense, type CSSProperties } from 'react';
import { TkxButton, TkxSelect } from 'tekivex-ui';
import { TkxDataExplorer, type DataRecord } from 'tekivex-ui/charts';
import { downloadBytes } from '../smart/util.js';
import { xlsxToPdf } from '../smart/convert.js';
import { evaluateSheet } from '../smart/formula.js';
import { AiAssistant } from './AiAssistant.js';
import { useBrandThemes } from './tools/useBrandThemes.js';
import { BrandButton } from './tools/BrandButton.js';
import { ToolPalette } from './tools/ToolPalette.js';
import type { InsertContent } from './tools/insertTools.js';
import { SaveTemplateButton } from './tools/SaveTemplateButton.js';
import { useAutosave } from '../persist/useAutosave.js';
import { buildXlsx as buildXlsxOffloaded } from '../workers/officeClient.js';
import { extractXlsxCharts, type EmbeddedChart } from '../smart/xlsxCharts.js';
import { EmbeddedCharts } from './EmbeddedCharts.js';
import { computeTotalsRow } from './tools/sheetOps.js';
import { useCollabMap } from '../collab/useCollabMap.js';
import { useShareLink } from '../collab/useShareLink.js';
import { CollabBar } from '../collab/CollabBar.js';
import type { Room } from '../collab/link.js';

interface Props {
  name: string;
  ext: string;
  bytes: Uint8Array;
  onOpenInPdf: (bytes: Uint8Array, name: string) => void;
  initialThemeId?: string;
  docId?: string;
  /** When set, the editor joins this live collaboration room on mount. */
  collabRoom?: Room;
}

interface Sheet { name: string; rows: string[][] }

const cellKey = (s: number, r: number, c: number) => `s${s}:r${r}:c${c}`;

/** Workbook → LWW entries: sheet names under 'meta', plus one key per non-empty
 *  cell. Empty cells are omitted to keep the snapshot small. */
const sheetsToEntries = (sheets: Sheet[]): Record<string, string> => {
  const e: Record<string, string> = { meta: JSON.stringify(sheets.map((sh) => ({ name: sh.name }))) };
  sheets.forEach((sh, s) => sh.rows.forEach((row, r) => row.forEach((v, c) => { if (v !== '') e[cellKey(s, r, c)] = v; })));
  return e;
};

/** LWW entries → workbook. Dimensions are inferred from the highest cell index
 *  present (so a grid grows to fit whatever peers have typed), unioned with the
 *  sheet names from 'meta'. */
const entriesToSheets = (e: Record<string, string>): Sheet[] => {
  let names: string[] = [];
  try { const m = JSON.parse(e.meta ?? '[]'); if (Array.isArray(m)) names = m.map((x: { name?: string }) => x.name ?? ''); } catch { /* no meta yet */ }
  const dims = new Map<number, { rows: number; cols: number }>();
  for (const key of Object.keys(e)) {
    const m = /^s(\d+):r(\d+):c(\d+)$/.exec(key);
    if (!m) continue;
    const s = Number(m[1]), r = Number(m[2]), c = Number(m[3]);
    const d = dims.get(s) ?? { rows: 0, cols: 0 };
    d.rows = Math.max(d.rows, r + 1); d.cols = Math.max(d.cols, c + 1);
    dims.set(s, d);
  }
  const count = Math.max(names.length, ...[...dims.keys()].map((s) => s + 1), 1);
  const sheets: Sheet[] = [];
  for (let s = 0; s < count; s++) {
    const d = dims.get(s) ?? { rows: 1, cols: 2 };
    const rows = Math.max(d.rows, 1), cols = Math.max(d.cols, 2);
    const grid = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => e[cellKey(s, r, c)] ?? ''));
    sheets.push({ name: names[s] || `Sheet${s + 1}`, rows: grid });
  }
  return sheets;
};

// gridstorm-powered Table view (sort/filter/edit) — only loaded when opened.
const SheetDataGrid = lazy(() => import('./SheetDataGrid.js').then((m) => ({ default: m.SheetDataGrid })));

export function SheetEditor({ name, ext, bytes, onOpenInPdf, initialThemeId, docId, collabRoom }: Props) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ai, setAi] = useState(false);
  const [view, setView] = useState<'grid' | 'table' | 'charts'>('grid');
  const charts = view === 'charts';
  const editable = view === 'grid';
  const [focusCell, setFocusCell] = useState<{ r: number; c: number } | null>(null);
  const [embedded, setEmbedded] = useState<EmbeddedChart[]>([]);
  const [themeId, setThemeId] = useState(initialThemeId ?? 'clean');
  const { themes, resolve, reload } = useBrandThemes();
  const theme = resolve(themeId);
  const { room, isHost, copied, share, copyLink } = useShareLink('sheet', collabRoom);
  const pdfTheme = themeId === 'clean' ? undefined : { bg: theme.bg, fg: theme.fg, heading: theme.heading };
  // Drive the live grid's look from the selected theme (header tint, banding,
  // borders, focus, font). 8-digit hex appends alpha so tints sit over any base.
  const sheetVars = {
    ['--sheet-bg']: theme.panel,
    ['--sheet-fg']: theme.fg,
    ['--sheet-head-bg']: `${theme.accent}1f`,
    ['--sheet-head-fg']: theme.heading,
    ['--sheet-band']: `${theme.fg}0a`,
    ['--sheet-border']: `${theme.fg}24`,
    ['--sheet-accent']: theme.accent,
    ['--sheet-focus']: `${theme.accent}1f`,
    ['--sheet-font']: theme.fontBody,
  } as CSSProperties;

  // Active sheet → chart records (header row = keys, numeric cells parsed).
  const records: DataRecord[] = useMemo(() => {
    const sh = sheets?.[active];
    if (!sh || sh.rows.length < 2) return [];
    const head = sh.rows[0]!.map((h, c) => (h.trim() || `Col ${c + 1}`));
    return sh.rows.slice(1).filter((r) => r.some((c) => c.trim() !== '')).map((r) => {
      const rec: DataRecord = {};
      head.forEach((h, c) => {
        const v = (r[c] ?? '').trim();
        rec[h] = v === '' ? null : v !== '' && !isNaN(Number(v)) ? Number(v) : v;
      });
      return rec;
    });
  }, [sheets, active]);

  // Live formula values for the active sheet (=SUM(A1:A3), =A1*B1, …).
  const display = useMemo(() => evaluateSheet(sheets?.[active]?.rows ?? []), [sheets, active]);

  useEffect(() => {
    let cancelled = false;
    // A joiner arrives with no bytes — start blank and let the host's snapshot
    // fill the grid in.
    if (bytes.length === 0) { setSheets([{ name: 'Sheet1', rows: [['', ''], ['', '']] }]); return; }
    (async () => {
      try {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(bytes, { type: 'array' });
        const parsed: Sheet[] = wb.SheetNames.map((n) => {
          const grid = XLSX.utils.sheet_to_json(wb.Sheets[n]!, { header: 1, blankrows: false, defval: '' }) as unknown[][];
          const rows = grid.map((r) => (r ?? []).map((c) => (c == null ? '' : String(c))));
          // Pad to a uniform column count + a few spare columns/rows for editing.
          const cols = Math.max(2, ...rows.map((r) => r.length)) + 1;
          const padded = rows.map((r) => { const c = [...r]; while (c.length < cols) c.push(''); return c; });
          while (padded.length < Math.max(1, rows.length) + 1) padded.push(new Array(cols).fill(''));
          return { name: n, rows: padded.length ? padded : [new Array(cols).fill('')] };
        });
        if (!cancelled) setSheets(parsed.length ? parsed : [{ name: 'Sheet1', rows: [['', '']] }]);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); }
      // Surface any charts the file carried (SheetJS drops them); shown in the
      // Charts tab so the user sees what was in their workbook.
      const charts = await extractXlsxCharts(bytes);
      if (!cancelled && charts.length) setEmbedded(charts);
    })();
    return () => { cancelled = true; };
  }, [bytes]);

  // Live collaboration: each cell is its own LWW key, so two people typing in
  // different cells never conflict. Structural changes broadcast a fresh
  // snapshot. Remote changes rebuild the grid (growing it to fit).
  const collab = useCollabMap({
    room, name: 'You', isHost,
    seed: () => sheetsToEntries(sheets ?? []),
    onRemote: (e) => { const ns = entriesToSheets(e); setSheets(ns); setActive((a) => Math.min(a, ns.length - 1)); },
  });

  const setCell = (s: number, r: number, c: number, v: string) => {
    setSheets((prev) => {
      if (!prev) return prev;
      const next = prev.map((sh) => ({ ...sh, rows: sh.rows.map((row) => [...row]) }));
      next[s]!.rows[r]![c] = v;
      return next;
    });
    if (room) collab.set({ [cellKey(s, r, c)]: v });
  };

  // Grid tools — operate on the active sheet, then broadcast the new snapshot so
  // structural changes (rows/cols/sort/clear) reach collaborators.
  const mutate = (fn: (rows: string[][]) => string[][]) => {
    if (!sheets) return;
    const next = sheets.map((sh, i) => (i === active ? { ...sh, rows: fn(sh.rows.map((r) => [...r])) } : sh));
    setSheets(next);
    if (room) collab.set(sheetsToEntries(next));
  };
  const addRow = () => mutate((rows) => [...rows, new Array(rows[0]?.length ?? 2).fill('')]);
  const addCol = () => mutate((rows) => rows.map((r) => [...r, '']));

  // Spreadsheet keyboard navigation: Enter moves down (Shift+Enter up), Tab moves
  // right (Shift+Tab left), Up/Down arrows move between rows. Moving past the edge
  // grows the grid, so the canvas feels infinite like a real spreadsheet.
  const gridRef = useRef<HTMLTableElement | null>(null);
  const focusCellAt = (r: number, c: number) => {
    requestAnimationFrame(() => {
      const el = gridRef.current?.querySelector<HTMLInputElement>(`input[data-cell="${r}-${c}"]`);
      if (el) { el.focus(); el.select(); }
    });
  };
  const gridKeyDown = (r: number, c: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const rows = sheets?.[active]?.rows ?? [];
    const nRows = rows.length, nCols = rows[0]?.length ?? 0;
    if (e.key === 'Enter') {
      e.preventDefault();
      const nr = r + (e.shiftKey ? -1 : 1);
      if (nr < 0) return;
      if (nr >= nRows) addRow();
      focusCellAt(nr, c);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const nc = c + (e.shiftKey ? -1 : 1);
      if (nc < 0) return;
      if (nc >= nCols) addCol();
      focusCellAt(r, nc);
    } else if (e.key === 'ArrowDown' && r + 1 < nRows) {
      e.preventDefault(); focusCellAt(r + 1, c);
    } else if (e.key === 'ArrowUp' && r - 1 >= 0) {
      e.preventDefault(); focusCellAt(r - 1, c);
    }
  };
  const delRow = () => mutate((rows) => (rows.length > 1 ? rows.slice(0, -1) : rows));
  const delCol = () => mutate((rows) => ((rows[0]?.length ?? 0) > 1 ? rows.map((r) => r.slice(0, -1)) : rows));
  const sort = (asc: boolean) => mutate((rows) => {
    if (rows.length < 3) return rows;
    const [head, ...body] = rows;
    body.sort((a, b) => {
      const av = a[0] ?? '', bv = b[0] ?? '';
      const an = Number(av), bn = Number(bv);
      const cmp = av !== '' && bv !== '' && !isNaN(an) && !isNaN(bn) ? an - bn : av.localeCompare(bv);
      return asc ? cmp : -cmp;
    });
    return [head!, ...body];
  });
  const clearSheet = () => mutate((rows) => rows.map((r) => r.map(() => '')));
  const addTotals = () => mutate((rows) => { const totals = computeTotalsRow(rows.filter((r) => r.some((c) => c.trim() !== ''))); return totals ? [...rows, totals] : rows; });
  // A data-tool snippet appends its rows to the active sheet, widening the grid
  // to fit (and dropping a leading blank row if the sheet is still empty).
  const insertContent = (c: InsertContent) => {
    if (!c.rows || !c.rows.length) return;
    mutate((rows) => {
      const cur = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
      const width = Math.max(c.rows!.reduce((m, r) => Math.max(m, r.length), 0), ...cur.map((r) => r.length), 2);
      const pad = (r: string[]) => { const x = [...r]; while (x.length < width) x.push(''); return x; };
      return [...cur, ...c.rows!].map(pad);
    });
  };

  // Built off the main thread (worker) so a large workbook export never janks
  // the grid; falls back to inline if the worker can't spawn.
  const buildXlsx = (): Promise<Uint8Array> => buildXlsxOffloaded(sheets!.map((sh) => ({ name: sh.name, rows: sh.rows })));
  const buildCsv = async (): Promise<string> => {
    const XLSX = await import('xlsx');
    return XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(sheets![active]!.rows));
  };

  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const csvLike = ext === 'csv' || ext === 'tsv';

  // Capture the active sheet as a template seed, trimming trailing empty rows
  // and columns so the saved template starts clean.
  const templateRows = (): string[][] => {
    const rows = (sheets?.[active]?.rows ?? []).filter((r) => r.some((c) => c.trim() !== ''));
    if (!rows.length) return [['']];
    let w = Math.max(1, ...rows.map((r) => r.length));
    while (w > 1 && rows.every((r) => (r[w - 1] ?? '').trim() === '')) w--;
    return rows.map((r) => r.slice(0, w));
  };

  // Autosave the whole workbook (all sheets) as xlsx bytes.
  useAutosave(docId, async () => (docId && sheets ? { id: docId, name, ext: 'xlsx', kind: 'sheet', updatedAt: Date.now(), themeId, content: { bytes: await buildXlsx() } } : null), [sheets, themeId, name, docId]);

  if (error) return <div className="ed-error">Couldn’t read the spreadsheet: {error}</div>;
  if (!sheets) return <div className="ed-loading">Loading spreadsheet…</div>;

  return (
    <div className="ed">
      <div className="ed-bar">
        <span className="ed-kind">Spreadsheet · {name}.{ext}</span>
        <div className="ed-actions">
          {csvLike ? (
            <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy} onClick={() => run(async () => { const blob = new Blob([await buildCsv()], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name}.${ext}`; a.click(); })}>Save .{ext}</TkxButton>
          ) : (
            <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy} onClick={() => run(async () => downloadBytes(`${name}.xlsx`, await buildXlsx(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))}>Save Excel</TkxButton>
          )}
          <TkxButton variant="outline" size="sm" disabled={busy} onClick={() => run(async () => downloadBytes(`${name}.xlsx`, await buildXlsx(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))}>Download Excel</TkxButton>
          <TkxButton variant="outline" size="sm" disabled={busy} onClick={() => run(async () => downloadBytes(`${name}.pdf`, await xlsxToPdf(await buildXlsx(), undefined, pdfTheme), 'application/pdf'))}>Download PDF</TkxButton>
          <TkxButton variant="ghost" size="sm" disabled={busy} onClick={() => run(async () => onOpenInPdf(await xlsxToPdf(await buildXlsx(), undefined, pdfTheme), name))}>Open in PDF editor</TkxButton>
          {!room && <TkxButton variant="outline" size="sm" onClick={() => void share()} title="Create a private link to edit this spreadsheet together in real time">🔗 Share</TkxButton>}
          <SaveTemplateButton defaultName={name} getSeed={() => ({ name, ext: 'xlsx', kind: 'sheet', rows: templateRows(), theme: themeId })} />
          <TkxButton variant={ai ? 'solid' : 'outline'} colorScheme="primary" size="sm" onClick={() => setAi((v) => !v)}>✦ AI</TkxButton>
        </div>
      </div>
      {room && <CollabBar room={room} peers={collab.peers} ready={collab.ready} relayStatus={collab.relayStatus} copied={copied} onCopy={() => void copyLink()} />}
      <div className="ed-body-row">
       <div className="ed-sheet-col">
      <div className="ed-sheet-toolbar" role="toolbar" aria-label="Grid tools">
        <button className={view === 'grid' ? 'ed-tool--on' : ''} onClick={() => setView('grid')}>▦ Grid</button>
        <button className={view === 'table' ? 'ed-tool--on' : ''} onClick={() => setView('table')} title="Sort, filter and resize like a database table (gridstorm)">⊞ Table</button>
        <button className={charts ? 'ed-tool--on' : ''} onClick={() => setView('charts')}>📊 Charts{embedded.length > 0 ? ` (${embedded.length})` : ''}</button>
        <span className="ed-rt-sep" />
        <button onClick={addRow} disabled={!editable}>＋ Row</button>
        <button onClick={addCol} disabled={!editable}>＋ Column</button>
        <button onClick={delRow} disabled={!editable}>－ Row</button>
        <button onClick={delCol} disabled={!editable}>－ Column</button>
        <span className="ed-rt-sep" />
        <button onClick={() => sort(true)} disabled={!editable} title="Sort by first column ascending">⇅ A→Z</button>
        <button onClick={() => sort(false)} disabled={!editable} title="Sort by first column descending">⇅ Z→A</button>
        <button onClick={addTotals} disabled={!editable} title="Append a totals row summing numeric columns">Σ Totals</button>
        <button onClick={clearSheet} disabled={!editable} title="Clear all cells">⌫ Clear</button>
        <span className="ed-rt-sep" />
        <ToolPalette kind="sheet" onInsert={insertContent} label="＋ Insert data" />
        <span className="ed-rt-sep" />
        <span className="ed-tool-label">Theme</span>
        <TkxSelect size="sm" value={themeId} options={themes.map((t) => ({ value: t.id, label: t.name }))} onChange={(v) => setThemeId(v as string)} />
          <BrandButton onChange={reload} />
      </div>
      {sheets.length > 1 && (
        <div className="ed-tabs">
          {sheets.map((s, i) => (
            <button key={i} className={'ed-tab' + (i === active ? ' ed-tab--active' : '')} onClick={() => setActive(i)}>{s.name}</button>
          ))}
        </div>
      )}
      {charts ? (
        <div className="ed-charts">
          {/* Charts that came embedded in the uploaded file, rendered as-authored. */}
          <EmbeddedCharts charts={embedded} />
          {records.length ? (
            <>
              {embedded.length > 0 && <div className="ed-embed-charts-head">📈 Explore this sheet</div>}
              <TkxDataExplorer initialData={records} allowedCharts={['bar', 'line', 'area', 'pie', 'scatter']} chartHeight={440} />
            </>
          ) : embedded.length === 0 ? (
            <div className="ed-charts-empty">Add a header row and at least one data row to chart this sheet.</div>
          ) : null}
        </div>
      ) : view === 'table' ? (
        <div className="ed-grid-wrap" style={sheetVars}>
          <Suspense fallback={<div className="ed-status">Loading table…</div>}>
            <SheetDataGrid
              rows={display}
              dark={typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'}
              onCellChange={(r, c, v) => setCell(active, r, c, v)}
            />
          </Suspense>
        </div>
      ) : (
        <div className="ed-grid-wrap" style={sheetVars}>
          <table className="ed-grid" ref={gridRef}>
            <tbody>
              {sheets[active]!.rows.map((row, r) => (
                <tr key={r}>
                  <th className="ed-grid-rownum">{r + 1}</th>
                  {row.map((cell, c) => {
                    const focused = focusCell?.r === r && focusCell?.c === c;
                    return (
                      <td key={c} className={cell.trimStart().startsWith('=') ? 'ed-grid-formula' : undefined}>
                        <input
                          data-cell={`${r}-${c}`}
                          value={focused ? cell : (display[r]?.[c] ?? cell)}
                          onFocus={() => setFocusCell({ r, c })}
                          onBlur={() => setFocusCell(null)}
                          onChange={(e) => setCell(active, r, c, e.target.value)}
                          onKeyDown={(e) => gridKeyDown(r, c, e)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
       </div>
        {ai && (
          <AiAssistant
            kind="spreadsheet"
            getContext={() => sheets.map((sh) => `Sheet "${sh.name}":\n` + sh.rows.map((r) => r.join('\t')).join('\n')).join('\n\n')}
            onClose={() => setAi(false)}
            quickActions={[
              { label: 'Summarize data', prompt: 'Summarize what this spreadsheet contains and the key takeaways.' },
              { label: 'Find totals', prompt: 'Compute the totals/averages of the numeric columns and report them.' },
              { label: 'Spot anomalies', prompt: 'Point out any anomalies, outliers, or inconsistencies in this data.' },
              { label: 'Explain columns', prompt: 'Explain what each column likely represents.' },
            ]}
          />
        )}
      </div>
    </div>
  );
}
