import {
  listFormFields,
  type FormFieldDescriptor,
  type PdfDocumentHandle,
} from '@pdfcraft/engine';

export type SchemaFieldType =
  | 'text'
  | 'multiline'
  | 'number'
  | 'date'
  | 'check'
  | 'radio'
  | 'select'
  | 'multiselect';

export interface SchemaField {
  id: string;
  type: SchemaFieldType;
  label: string;
  required: boolean;
  readOnly: boolean;
  value: string | boolean | string[] | null;
  options?: string[];
  /** Optional regex for client-side validation. Heuristic — inferred from id. */
  pattern?: string;
  /** Page this field lives on, for the split-view PDF preview. */
  page: number;
  /** /MaxLen — character limit for text fields. */
  maxLength?: number;
  /** True when /Ff bit 25 (Comb) is set + /MaxLen present — segmented input. */
  comb?: boolean;
  /** True when /Ff bit 14 (Password) is set — masked display. */
  password?: boolean;
}

export interface FormSchema {
  fields: SchemaField[];
  /** Map of fieldId → array of duplicate widget descriptors (same field on multiple pages). */
  widgetIndex: Record<string, FormFieldDescriptor[]>;
}

const ID_PATTERNS: Array<{ test: RegExp; pattern?: string; type?: SchemaFieldType }> = [
  { test: /^pan$|\bpan\b/i, pattern: '^[A-Z]{5}[0-9]{4}[A-Z]$' },
  { test: /\bemail\b/i, pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' },
  { test: /\bpin\b|pincode|zip/i, pattern: '^[0-9]{4,6}$', type: 'number' },
  { test: /\b(phone|mobile|tel)\b/i, pattern: '^[+0-9\\s-]{7,16}$' },
  { test: /\bdate\b|dob|birth/i, type: 'date' },
];

function deriveLabel(id: string): string {
  return id
    .replace(/[_-]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function mapType(d: FormFieldDescriptor): SchemaFieldType {
  switch (d.type) {
    case 'text':
      return 'text';
    case 'multiline':
      return 'multiline';
    case 'checkbox':
      return 'check';
    case 'radio':
      return 'radio';
    case 'dropdown':
      return 'select';
    case 'listbox':
      return 'multiselect';
    default:
      return 'text';
  }
}

/**
 * Walk a loaded PDF's AcroForm tree and emit a JSON schema. Duplicate widgets
 * (one field rendered on multiple pages) collapse to a single schema entry;
 * the underlying widgets stay in `widgetIndex` for callers who care.
 */
export async function extractFormSchema(handle: PdfDocumentHandle): Promise<FormSchema> {
  const descriptors = await listFormFields(handle);
  const widgetIndex: Record<string, FormFieldDescriptor[]> = {};
  for (const d of descriptors) {
    (widgetIndex[d.id] ??= []).push(d);
  }

  const fields: SchemaField[] = [];
  for (const [id, widgets] of Object.entries(widgetIndex)) {
    const first = widgets[0]!;
    let type = mapType(first);
    let pattern: string | undefined;
    for (const hint of ID_PATTERNS) {
      if (hint.test.test(id)) {
        pattern = hint.pattern;
        if (hint.type) type = hint.type;
        break;
      }
    }
    // Label precedence:
    //   1. pageLabel — extracted from rendered page text (the human
    //      label users actually see — "Address", "(i) PCA Principal
    //      is a 'swap dealer'…")
    //   2. /TU — author-set tooltip / alt-description
    //   3. deriveLabel(id) — beautified /T field name fallback
    const fd = first as FormFieldDescriptor & { label?: string; pageLabel?: string };
    const resolvedLabel = fd.pageLabel ?? fd.label ?? deriveLabel(id);

    fields.push({
      id,
      type,
      label: resolvedLabel,
      required: first.required,
      readOnly: first.readOnly,
      value: first.value,
      options: first.options,
      pattern,
      page: first.page,
      maxLength: first.maxLength,
      comb: first.comb,
      password: first.password,
    });
  }

  return { fields, widgetIndex };
}
