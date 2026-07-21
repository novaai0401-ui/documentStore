/**
 * UIAdapter implementation backed by tekivex-ui.
 *
 * tekivex-ui is the default styled adapter shipped with editable-pdf.
 * The UIAdapter contract from @pdfcraft/ui-react is intentionally tiny
 * (9 methods) — consumers who prefer a different UI library can implement
 * their own adapter against the same contract and swap it in.
 *
 * tekivex-ui is a peer dependency; the consumer app installs it themselves.
 */
import { type ChangeEvent } from 'react';
import {
  TkxInput,
  TkxCheckbox,
  TkxSelect,
  TkxRadio,
  TkxRadioGroup,
  TkxButton,
  TkxDatePicker,
  TkxNumberInput,
} from 'tekivex-ui';
import type { UIAdapter } from '@pdfcraft/ui-react';
import { CombInput } from '@pdfcraft/ui-react';

function tkxVariant(v: 'primary' | 'secondary' | 'ghost' | undefined) {
  if (v === 'secondary') return 'outline' as const;
  if (v === 'ghost') return 'ghost' as const;
  return 'solid' as const;
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(d: Date | null): string {
  if (!d) return '';
  // YYYY-MM-DD round-trip (matches the schema's `date` field type).
  return d.toISOString().slice(0, 10);
}

export const tekivexAdapter: UIAdapter = {
  Text: ({ id, label, value, required, readOnly, error, onChange, maxLength, comb, password }) => {
    if (comb && maxLength) {
      // Comb fields don't fit tekivex's TkxInput visual style — render
      // the segmented primitive with a manual label row.
      return (
        <div className="tkx-comb">
          <label htmlFor={id} style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            {label}
            {required && <span style={{ color: '#d64545' }}> *</span>}
          </label>
          <CombInput id={id} value={value} maxLength={maxLength} readOnly={readOnly} onChange={onChange} />
          {error && <div style={{ color: '#d64545', fontSize: 12, marginTop: 4 }}>{error}</div>}
        </div>
      );
    }
    return (
      <TkxInput
        id={id}
        label={label}
        isRequired={required}
        readOnly={readOnly}
        isInvalid={!!error}
        error={error}
        value={value}
        type={password ? 'password' : 'text'}
        maxLength={maxLength}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
    );
  },

  Multiline: ({ id, label, value, required, readOnly, error, onChange, maxLength }) => (
    // tekivex-ui ships no TkxTextarea — use a styled <textarea> alongside
    // tekivex's label/error visual conventions.
    <div className="tkx-multiline">
      <label htmlFor={id} style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
        {label}
        {required && <span style={{ color: 'var(--tkx-color-danger, #d64545)' }}> *</span>}
      </label>
      <textarea
        id={id}
        value={value}
        readOnly={readOnly}
        rows={3}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 12px',
          border: `1px solid ${error ? '#d64545' : 'var(--tkx-color-border, #e4e7eb)'}`,
          borderRadius: 6,
          fontSize: 14,
          fontFamily: 'inherit',
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />
      {error && <div style={{ color: '#d64545', fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  ),

  Number: ({ id, label, value, required, readOnly, error, onChange }) => (
    <TkxNumberInput
      id={id}
      label={label}
      isReadOnly={readOnly}
      isInvalid={!!error}
      errorMessage={error}
      value={value === '' ? undefined : Number(value)}
      onChange={(v) => onChange(v === null ? '' : String(v))}
      {...({ isRequired: required } as Record<string, unknown>)}
    />
  ),

  Date: ({ id, label, value, required, readOnly, error, onChange }) => (
    <div className="tkx-date">
      <label htmlFor={id} style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
        {label}
        {required && <span style={{ color: '#d64545' }}> *</span>}
      </label>
      <TkxDatePicker
        value={parseDate(value)}
        onChange={(d) => onChange(formatDate(d))}
        {...({ isDisabled: readOnly, isInvalid: !!error, id } as Record<string, unknown>)}
      />
      {error && <div style={{ color: '#d64545', fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  ),

  Check: ({ id, label, value, readOnly, error, onChange }) => (
    <TkxCheckbox
      id={id}
      checked={Boolean(value)}
      disabled={readOnly}
      isInvalid={!!error}
      errorMessage={error}
      label={label}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
    />
  ),

  Radio: ({ id, label, value, options, readOnly, error, onChange }) => (
    <TkxRadioGroup
      name={id}
      label={label}
      value={value}
      onChange={(v: string) => onChange(v)}
      isInvalid={!!error}
      errorMessage={error}
      isDisabled={readOnly}
    >
      {options.map((opt) => (
        <TkxRadio key={opt} value={opt} label={opt} />
      ))}
    </TkxRadioGroup>
  ),

  Select: ({ id, label, value, options, readOnly, error, onChange }) => (
    <TkxSelect
      id={id}
      label={label}
      isDisabled={readOnly}
      isInvalid={!!error}
      errorMessage={error}
      value={value}
      onChange={(v) => onChange(typeof v === 'string' ? v : (v[0] ?? ''))}
      options={options.map((opt) => ({ value: opt, label: opt }))}
    />
  ),

  MultiSelect: ({ id, label, value, options, readOnly, error, onChange }) => (
    <TkxSelect
      id={id}
      label={label}
      isDisabled={readOnly}
      isInvalid={!!error}
      errorMessage={error}
      multiple
      value={value}
      onChange={(v) => onChange(Array.isArray(v) ? v : [v])}
      options={options.map((opt) => ({ value: opt, label: opt }))}
    />
  ),

  Button: ({ children, onClick, variant, disabled }) => (
    <TkxButton variant={tkxVariant(variant)} onClick={onClick} isDisabled={disabled}>
      {children}
    </TkxButton>
  ),
};
