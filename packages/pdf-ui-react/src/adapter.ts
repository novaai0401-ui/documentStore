import type { ReactNode } from 'react';

export interface FieldProps<T> {
  id: string;
  label: string;
  value: T;
  required: boolean;
  readOnly: boolean;
  error?: string;
  onChange: (next: T) => void;
  /** /MaxLen — character limit for text-shaped fields. */
  maxLength?: number;
  /** True when /Ff bit 25 + /MaxLen are set — render as N segmented cells. */
  comb?: boolean;
  /** True when /Ff bit 14 is set — mask input as bullets. */
  password?: boolean;
}

export interface SelectFieldProps extends FieldProps<string> {
  options: string[];
}

export interface MultiSelectFieldProps extends FieldProps<string[]> {
  options: string[];
}

export interface ButtonProps {
  children: ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
}

/**
 * Bring-your-own UI library. Implement this interface to render the
 * dynamic form with Material UI, Chakra, shadcn, tekivex, or plain HTML.
 *
 * See `@pdfcraft/ui-adapter-html` for a 100-line reference implementation.
 */
export interface UIAdapter {
  Text: (p: FieldProps<string>) => ReactNode;
  Multiline: (p: FieldProps<string>) => ReactNode;
  Number: (p: FieldProps<string>) => ReactNode;
  Date: (p: FieldProps<string>) => ReactNode;
  Check: (p: FieldProps<boolean>) => ReactNode;
  Radio: (p: SelectFieldProps) => ReactNode;
  Select: (p: SelectFieldProps) => ReactNode;
  MultiSelect: (p: MultiSelectFieldProps) => ReactNode;
  Button: (p: ButtonProps) => ReactNode;
}
