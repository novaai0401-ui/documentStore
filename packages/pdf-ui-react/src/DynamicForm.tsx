import { Fragment } from 'react';
import type { FormSchema, SchemaField } from '@pdfcraft/form-schema';
import type { UIAdapter } from './adapter.js';

export interface DynamicFormProps {
  schema: FormSchema;
  adapter: UIAdapter;
  onChange: (id: string, value: string | boolean | string[]) => void;
  /** Optional per-field validation errors keyed by field id. */
  errors?: Record<string, string>;
  /** Called when the user clicks the submit button. */
  onSubmit?: () => void;
  submitLabel?: string;
}

function renderField(field: SchemaField, adapter: UIAdapter, onChange: DynamicFormProps['onChange'], error?: string) {
  const common = {
    id: field.id,
    label: field.label,
    required: field.required,
    readOnly: field.readOnly,
    error,
    // Text-shaped extras — adapters may or may not honor them but they
    // are always in scope. /MaxLen, comb formatting, password masking.
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
        ...common,
        value: (field.value as string) ?? '',
        options: field.options ?? [],
        onChange: (v) => onChange(field.id, v),
      });
    case 'select':
      return adapter.Select({
        ...common,
        value: (field.value as string) ?? '',
        options: field.options ?? [],
        onChange: (v) => onChange(field.id, v),
      });
    case 'multiselect':
      return adapter.MultiSelect({
        ...common,
        value: (field.value as string[]) ?? [],
        options: field.options ?? [],
        onChange: (v) => onChange(field.id, v),
      });
  }
}

export function DynamicForm({ schema, adapter, onChange, errors, onSubmit, submitLabel = 'Save' }: DynamicFormProps) {
  return (
    <div className="pdf-dynamic-form">
      {schema.fields.map((field) => (
        <Fragment key={field.id}>{renderField(field, adapter, onChange, errors?.[field.id])}</Fragment>
      ))}
      {onSubmit && (
        <div className="pdf-dynamic-form__actions">
          {adapter.Button({ children: submitLabel, onClick: onSubmit, variant: 'primary' })}
        </div>
      )}
    </div>
  );
}
