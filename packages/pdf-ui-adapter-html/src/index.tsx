import type { UIAdapter } from '@pdfcraft/ui-react';
import { CombInput } from '@pdfcraft/ui-react';

function Row({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pdf-row" data-error={error ? 'true' : undefined}>
      <label htmlFor={id} className="pdf-row__label">
        {label}
        {required && <span className="pdf-row__required"> *</span>}
      </label>
      {children}
      {error && <div className="pdf-row__error">{error}</div>}
    </div>
  );
}

export const htmlAdapter: UIAdapter = {
  Text: ({ id, label, value, required, readOnly, error, onChange, maxLength, comb, password }) => (
    <Row id={id} label={label} required={required} error={error}>
      {comb && maxLength ? (
        <CombInput id={id} value={value} maxLength={maxLength} readOnly={readOnly} onChange={onChange} />
      ) : (
        <input
          id={id}
          type={password ? 'password' : 'text'}
          value={value}
          readOnly={readOnly}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Row>
  ),
  Multiline: ({ id, label, value, required, readOnly, error, onChange, maxLength }) => (
    <Row id={id} label={label} required={required} error={error}>
      <textarea
        id={id}
        value={value}
        readOnly={readOnly}
        rows={3}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    </Row>
  ),
  Number: ({ id, label, value, required, readOnly, error, onChange }) => (
    <Row id={id} label={label} required={required} error={error}>
      <input
        id={id}
        type="number"
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
      />
    </Row>
  ),
  Date: ({ id, label, value, required, readOnly, error, onChange }) => (
    <Row id={id} label={label} required={required} error={error}>
      <input
        id={id}
        type="date"
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
      />
    </Row>
  ),
  Check: ({ id, label, value, required, readOnly, error, onChange }) => (
    <Row id={id} label={label} required={required} error={error}>
      <input
        id={id}
        type="checkbox"
        checked={value}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.checked)}
      />
    </Row>
  ),
  Radio: ({ id, label, value, options, required, readOnly, error, onChange }) => (
    <Row id={id} label={label} required={required} error={error}>
      <div className="pdf-radio-group">
        {options.map((opt) => (
          <label key={opt}>
            <input
              type="radio"
              name={id}
              value={opt}
              checked={value === opt}
              disabled={readOnly}
              onChange={() => onChange(opt)}
            />
            {opt}
          </label>
        ))}
      </div>
    </Row>
  ),
  Select: ({ id, label, value, options, required, readOnly, error, onChange }) => (
    <Row id={id} label={label} required={required} error={error}>
      <select id={id} value={value} disabled={readOnly} onChange={(e) => onChange(e.target.value)}>
        <option value="" />
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </Row>
  ),
  MultiSelect: ({ id, label, value, options, required, readOnly, error, onChange }) => (
    <Row id={id} label={label} required={required} error={error}>
      <select
        id={id}
        multiple
        value={value}
        disabled={readOnly}
        onChange={(e) => onChange(Array.from(e.target.selectedOptions, (o) => o.value))}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </Row>
  ),
  Button: ({ children, onClick, variant = 'primary', disabled }) => (
    <button
      type="button"
      className={`pdf-btn pdf-btn--${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  ),
};
