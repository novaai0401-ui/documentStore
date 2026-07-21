# Bring-Your-Own UI Adapter

The form view in `@pdfcraft/ui-react`'s `<DynamicForm>` doesn't bake any
component library in. Layout, change handling, schema iteration, table
grouping, and submit all live on its side. Visual rendering of every
field type is delegated to a `UIAdapter` you pass in.

This means **your app's form picks up your team's design system for
free** — there's no need to fight a component-library wrapper or reskin
ours.

## The contract

```ts
import type { ReactNode } from 'react';

export interface FieldProps<T> {
  id: string;
  label: string;
  value: T;
  required: boolean;
  readOnly: boolean;
  error?: string;
  onChange: (next: T) => void;
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

export interface UIAdapter {
  Text:        (p: FieldProps<string>)        => ReactNode;
  Multiline:   (p: FieldProps<string>)        => ReactNode;
  Number:      (p: FieldProps<string>)        => ReactNode;
  Date:        (p: FieldProps<string>)        => ReactNode;
  Check:       (p: FieldProps<boolean>)       => ReactNode;
  Radio:       (p: SelectFieldProps)          => ReactNode;
  Select:      (p: SelectFieldProps)          => ReactNode;
  MultiSelect: (p: MultiSelectFieldProps)     => ReactNode;
  Button:      (p: ButtonProps)               => ReactNode;
}
```

Nine methods. Each returns one rendered field. The form view feeds
`value` + `onChange` in; you return whatever component your design
system uses.

## 5-minute tutorial

Build an adapter for **your** library. Example: plain Tailwind:

```tsx
// tailwind-adapter.tsx
import type { UIAdapter } from '@pdfcraft/ui-react';

const Row = ({ label, required, error, children }: any) => (
  <label className="block mb-3">
    <span className="block text-sm font-medium mb-1">
      {label}{required && <span className="text-red-500"> *</span>}
    </span>
    {children}
    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
  </label>
);

const cls = "w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export const tailwindAdapter: UIAdapter = {
  Text: ({ label, value, required, readOnly, error, onChange }) => (
    <Row label={label} required={required} error={error}>
      <input type="text" className={cls} value={value} readOnly={readOnly}
             onChange={(e) => onChange(e.target.value)} />
    </Row>
  ),
  // ...the rest follow the same pattern
};
```

Use it:

```tsx
<AppV2 formAdapter={tailwindAdapter} />
```

That's it. Your team's brand applies; the editor knows nothing about it.

## Ready-made adapters

| Adapter | Package | Status |
|---|---|---|
| Plain HTML (zero deps) | `@pdfcraft/ui-adapter-html`     | reference / fallback |
| tekivex-ui              | `@pdfcraft/ui-adapter-tekivex`  | default; shipped with demo |
| Material UI             | `@pdfcraft/ui-adapter-mui`      | available |
| Chakra UI               | `@pdfcraft/ui-adapter-chakra`   | roadmap |
| shadcn / Radix          | `@pdfcraft/ui-adapter-shadcn`   | roadmap |
| Ant Design              | `@pdfcraft/ui-adapter-antd`     | roadmap |

## Common gotchas

- **Wrap your app in your library's provider** (MUI's `<ThemeProvider>`,
  Chakra's `<ChakraProvider>`, etc.) — outside `<AppV2>`. The adapter
  is just rendering primitives; it doesn't set up themes.
- **Return real React nodes**, not strings — the form expects to render
  them as children.
- **Don't swallow `onChange`** — the form's two-way sync with the PDF
  depends on it.
- **`readOnly` vs `disabled`** — most libraries differentiate. For
  AcroForm fields, prefer read-only (user can copy text but not edit).
- **`required` is metadata** — render an indicator (`*`), but the form
  view doesn't currently block save on missing required fields. Pair
  with your own validation if you need that.

## Mixing in your own field types

If your domain has extra types (currency, IBAN, sliders…), extend the
adapter with extra methods and dispatch from a custom `<DynamicForm>`
wrapper. The contract above is the minimum; nothing stops you adding
to it.

## Issues / contributing

Adapter not behaving? File an issue with the schema you're rendering
plus the component-library version. PRs for additional ready-made
adapters welcome.
