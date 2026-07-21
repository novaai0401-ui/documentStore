import type { JSX } from 'react';
import type { UIAdapter } from '@pdfcraft/ui-react';
import { tekivexAdapter } from '@pdfcraft/ui-adapter-tekivex';
import type { FormSchema, SchemaField } from '@pdfcraft/form-schema';
import { groupSchema, type TableGroup } from './table-grouping.js';

interface Props {
  schema: FormSchema;
  setFieldValue: (id: string, value: string | boolean | string[]) => void;
  onSave: () => void;
  /** UI adapter for rendering form fields. Defaults to tekivexAdapter.
   *  Swap to @pdfcraft/ui-adapter-html for a zero-dependency baseline, or
   *  pass your own to use MUI / Chakra / shadcn / etc. */
  adapter?: UIAdapter;
}

/**
 * Form view with a 3-column responsive grid.
 *
 * Layout rules:
 *   - Standalone (non-table) fields → 1 cell each → 3 per row at desktop.
 *   - Table groups (detected by table-grouping.ts via repeated field-name
 *     patterns like "field_1, field_2, …") → grid-column 1 / -1 so they
 *     span every column and consume the full row.
 *   - Submit button → also spans the full row.
 *   - At ≤ 900px viewport the grid drops to 2 columns; ≤ 600px to 1.
 *
 * Each field is rendered via a thin dispatcher around the supplied
 * UIAdapter — same switch DynamicForm uses internally, inlined here so
 * we can wrap each field in its own grid cell instead of relying on
 * adapter output being a single root element.
 */
export function FullPageForm({ schema, setFieldValue, onSave, adapter = tekivexAdapter }: Props) {
  if (schema.fields.length === 0) {
    return (
      <div className="v2-form-page">
        <div className="v2-form-page__inner v2-form-page__inner--empty">
          <h2>No fillable fields detected</h2>
          <p>This usually means one of the following:</p>
          <ul>
            <li>
              <strong>XFA form.</strong> Some government forms use Adobe&apos;s XML-based XFA format. We
              don&apos;t read XFA yet — only the classic AcroForm widgets.
            </li>
            <li>
              <strong>Scanned image.</strong> The PDF is a picture of a form, not a fillable one.
            </li>
            <li>
              <strong>Form fields stripped.</strong> Some &quot;flattened&quot; PDFs (often used for
              archival) have removed their form widgets.
            </li>
          </ul>
          <p className="v2-form-page__hint">
            Check the browser console for diagnostic output from <code>[@pdfcraft/engine]</code>.
          </p>
        </div>
      </div>
    );
  }

  const grouped = groupSchema(schema);
  const fieldsById = new Map(schema.fields.map((f) => [f.id, f] as const));

  return (
    <div className="v2-form-page">
      <div className="v2-form-page__inner">
        <header className="v2-form-page__header">
          <h2>Fill the form</h2>
          <p>
            {schema.fields.length} field{schema.fields.length === 1 ? '' : 's'}
            {grouped.tables.length > 0 && (
              <> · {grouped.tables.length} table{grouped.tables.length === 1 ? '' : 's'} detected</>
            )}
            . Changes here will appear on the PDF when you flip the switch off.
          </p>
        </header>

        <div className="v2-form-grid">
          {/* Tables come first, each spanning the full row. */}
          {grouped.tables.map((table) => (
            <div key={table.id} className="v2-form-grid__full">
              <TableSection table={table} fieldsById={fieldsById} setFieldValue={setFieldValue} />
            </div>
          ))}

          {/* Standalone fields — consecutive runs of check/radio fields
           *  collapse into a single grid cell so they stack vertically in
           *  one column instead of scattering across multiple columns of
           *  the 3-col grid. */}
          {renderStandaloneCells(grouped.standalone, adapter, setFieldValue)}

          {/* Submit row — spans full width. */}
          <div className="v2-form-grid__full v2-form-grid__actions">
            {adapter.Button({
              children: 'Save & Download PDF',
              onClick: onSave,
              variant: 'primary',
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   Field-cell renderer
// ─────────────────────────────────────────────────────────────────────────────

type ChangeFn = (id: string, value: string | boolean | string[]) => void;

/**
 * Render just the adapter output for one field — no grid-cell wrapper.
 * Used both directly (wrapped in a 1-cell div) and inside multi-item
 * group cells where the group div owns the grid-cell role.
 */
function renderFieldBody(field: SchemaField, adapter: UIAdapter, onChange: ChangeFn) {
  const common = {
    id: field.id,
    label: field.label,
    required: field.required,
    readOnly: field.readOnly,
    error: undefined as string | undefined,
    maxLength: field.maxLength,
    comb: field.comb,
    password: field.password,
  };
  switch (field.type) {
    case 'text':
      return adapter.Text({ ...common, value: (field.value as string) ?? '', onChange: (v) => onChange(field.id, v) });
    case 'multiline':
      return adapter.Multiline({ ...common, value: (field.value as string) ?? '', onChange: (v) => onChange(field.id, v) });
    case 'number':
      return adapter.Number({ ...common, value: (field.value as string) ?? '', onChange: (v) => onChange(field.id, v) });
    case 'date':
      return adapter.Date({ ...common, value: (field.value as string) ?? '', onChange: (v) => onChange(field.id, v) });
    case 'check':
      return adapter.Check({ ...common, value: Boolean(field.value), onChange: (v) => onChange(field.id, v) });
    case 'radio':
      return adapter.Radio({
        ...common, value: (field.value as string) ?? '', options: field.options ?? [],
        onChange: (v) => onChange(field.id, v),
      });
    case 'select':
      return adapter.Select({
        ...common, value: (field.value as string) ?? '', options: field.options ?? [],
        onChange: (v) => onChange(field.id, v),
      });
    case 'multiselect':
      return adapter.MultiSelect({
        ...common, value: (field.value as string[]) ?? [], options: field.options ?? [],
        onChange: (v) => onChange(field.id, v),
      });
    default:
      return null;
  }
}

/**
 * Walk the standalone-fields list and emit grid cells. Consecutive
 * runs of check or radio fields are collapsed into a single cell that
 * stacks its members vertically — so the layout stops scattering
 * checkboxes across columns.
 *
 * Layout rules:
 *   - text/number/date/select → 1 grid cell, 1 column wide
 *   - multiline/multiselect → 1 grid cell, 2 columns wide
 *   - consecutive same-type check fields → 1 grid cell, 1 column wide,
 *     all members stacked
 *   - consecutive same-type radio fields → same idea
 *   - mixing types breaks the run
 */
function renderStandaloneCells(
  fields: SchemaField[],
  adapter: UIAdapter,
  onChange: ChangeFn,
): JSX.Element[] {
  const out: JSX.Element[] = [];
  let runType: 'check' | 'radio' | null = null;
  let runItems: SchemaField[] = [];

  const flush = () => {
    if (runItems.length === 0) return;
    const first = runItems[0]!;
    const key = `group-${first.id}`;
    out.push(
      <div key={key} className="v2-form-grid__field v2-form-grid__group">
        {runItems.map((f) => (
          <div key={f.id} className="v2-form-grid__group-item">
            {renderFieldBody(f, adapter, onChange)}
          </div>
        ))}
      </div>,
    );
    runItems = [];
    runType = null;
  };

  for (const field of fields) {
    if (field.type === 'check' || field.type === 'radio') {
      if (runType === field.type) {
        runItems.push(field);
      } else {
        flush();
        runType = field.type;
        runItems = [field];
      }
      continue;
    }

    flush();
    const wide = field.type === 'multiline' || field.type === 'multiselect';
    const cls = 'v2-form-grid__field' + (wide ? ' v2-form-grid__field--wide' : '');
    out.push(
      <div key={field.id} className={cls}>
        {renderFieldBody(field, adapter, onChange)}
      </div>,
    );
  }
  flush();
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
//   Table section — unchanged from before, just wrapped in a full-width grid cell
// ─────────────────────────────────────────────────────────────────────────────

interface TableProps {
  table: TableGroup;
  fieldsById: Map<string, SchemaField>;
  setFieldValue: (id: string, value: string | boolean | string[]) => void;
}

function TableSection({ table, fieldsById, setFieldValue }: TableProps) {
  return (
    <div className="v2-form-table">
      <table>
        <thead>
          <tr>
            <th className="v2-form-table__rowhead">#</th>
            {table.columns.map((col) => (
              <th key={col.base}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.cells.map((row, ri) => (
            <tr key={ri}>
              <td className="v2-form-table__rowhead">{ri + 1}</td>
              {row.map((fieldId, ci) => {
                const f = fieldId ? fieldsById.get(fieldId) : undefined;
                return (
                  <td key={ci}>
                    {f ? (
                      <input
                        type="text"
                        value={String(f.value ?? '')}
                        onChange={(e) => setFieldValue(f.id, e.target.value)}
                      />
                    ) : (
                      <span className="v2-form-table__empty">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
