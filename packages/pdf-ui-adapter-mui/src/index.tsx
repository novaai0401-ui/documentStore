/**
 * Material UI implementation of the UIAdapter contract.
 *
 * MUI is a peer dependency — install @mui/material + its emotion peers
 * in your app, then `<AppV2 formAdapter={muiAdapter} />`.
 *
 * Every method maps the @pdfcraft/ui-react FieldProps to the closest MUI
 * primitive. The form view's layout, change handling, and field iteration
 * all stay on this side of the contract — this file is binding glue only.
 */
import type { ChangeEvent } from 'react';
import {
  TextField,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  Select,
  MenuItem,
  RadioGroup,
  Radio,
  FormLabel,
  Button,
} from '@mui/material';
import type { UIAdapter } from '@pdfcraft/ui-react';
import { CombInput } from '@pdfcraft/ui-react';

function variantFor(v: 'primary' | 'secondary' | 'ghost' | undefined) {
  if (v === 'secondary') return 'outlined' as const;
  if (v === 'ghost') return 'text' as const;
  return 'contained' as const;
}

export const muiAdapter: UIAdapter = {
  Text: ({ id, label, value, required, readOnly, error, onChange, maxLength, comb, password }) => {
    if (comb && maxLength) {
      return (
        <div style={{ margin: '8px 0' }}>
          <label htmlFor={id} style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>
            {label}{required ? ' *' : ''}
          </label>
          <CombInput id={id} value={value} maxLength={maxLength} readOnly={readOnly} onChange={onChange} />
          {error && <div style={{ color: '#d32f2f', fontSize: 12, marginTop: 4 }}>{error}</div>}
        </div>
      );
    }
    return (
      <TextField
        id={id}
        label={label}
        value={value}
        required={required}
        type={password ? 'password' : 'text'}
        InputProps={{ readOnly }}
        inputProps={{ maxLength }}
        error={!!error}
        helperText={error}
        fullWidth
        size="small"
        margin="dense"
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
    );
  },

  Multiline: ({ id, label, value, required, readOnly, error, onChange, maxLength }) => (
    <TextField
      id={id}
      label={label}
      value={value}
      required={required}
      InputProps={{ readOnly }}
      inputProps={{ maxLength }}
      error={!!error}
      helperText={error}
      multiline
      minRows={3}
      fullWidth
      size="small"
      margin="dense"
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
    />
  ),

  Number: ({ id, label, value, required, readOnly, error, onChange }) => (
    <TextField
      id={id}
      label={label}
      value={value}
      required={required}
      InputProps={{ readOnly, inputMode: 'numeric' }}
      type="number"
      error={!!error}
      helperText={error}
      fullWidth
      size="small"
      margin="dense"
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
    />
  ),

  Date: ({ id, label, value, required, readOnly, error, onChange }) => (
    <TextField
      id={id}
      label={label}
      value={value}
      required={required}
      InputProps={{ readOnly }}
      type="date"
      InputLabelProps={{ shrink: true }}
      error={!!error}
      helperText={error}
      fullWidth
      size="small"
      margin="dense"
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
    />
  ),

  Check: ({ id, label, value, readOnly, error, onChange }) => (
    <FormControl error={!!error}>
      <FormControlLabel
        control={
          <Checkbox
            id={id}
            checked={!!value}
            disabled={readOnly}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
          />
        }
        label={label}
      />
      {error && <FormHelperText>{error}</FormHelperText>}
    </FormControl>
  ),

  Radio: ({ id, label, value, options, readOnly, error, onChange }) => (
    <FormControl error={!!error}>
      <FormLabel>{label}</FormLabel>
      <RadioGroup
        name={id}
        value={value}
        onChange={(_, v: string) => onChange(v)}
      >
        {options.map((opt) => (
          <FormControlLabel
            key={opt}
            value={opt}
            control={<Radio disabled={readOnly} />}
            label={opt}
          />
        ))}
      </RadioGroup>
      {error && <FormHelperText>{error}</FormHelperText>}
    </FormControl>
  ),

  Select: ({ id, label, value, options, required, readOnly, error, onChange }) => (
    <FormControl fullWidth size="small" margin="dense" error={!!error} required={required}>
      <InputLabel id={`${id}-label`}>{label}</InputLabel>
      <Select
        labelId={`${id}-label`}
        id={id}
        label={label}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(String(e.target.value))}
      >
        {options.map((opt) => (
          <MenuItem key={opt} value={opt}>{opt}</MenuItem>
        ))}
      </Select>
      {error && <FormHelperText>{error}</FormHelperText>}
    </FormControl>
  ),

  MultiSelect: ({ id, label, value, options, required, readOnly, error, onChange }) => (
    <FormControl fullWidth size="small" margin="dense" error={!!error} required={required}>
      <InputLabel id={`${id}-label`}>{label}</InputLabel>
      <Select
        labelId={`${id}-label`}
        id={id}
        label={label}
        value={value}
        readOnly={readOnly}
        multiple
        onChange={(e) => {
          const v = e.target.value;
          onChange(Array.isArray(v) ? v.map(String) : [String(v)]);
        }}
      >
        {options.map((opt) => (
          <MenuItem key={opt} value={opt}>{opt}</MenuItem>
        ))}
      </Select>
      {error && <FormHelperText>{error}</FormHelperText>}
    </FormControl>
  ),

  Button: ({ children, onClick, variant, disabled }) => (
    <Button variant={variantFor(variant)} onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  ),
};
