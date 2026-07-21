# @pdfcraft/ui-react

Headless React bindings. Two hooks + one component + one interface — that's the whole API surface.

```ts
import { usePdfDocument, DynamicForm, type UIAdapter } from '@pdfcraft/ui-react';
```

## Hooks

- `usePdfDocument()` — loads a PDF, extracts the form schema, buffers edits, and serializes back to bytes on `save()`.
- `usePageRenderer({ doc, pageNumber, scale, container })` — renders one page into a DOM container you own.

## `<DynamicForm adapter={...} />`

Renders the auto-generated form using the UI library of your choice. The adapter is the only injection point; the rest of the form (layout, change handling, schema iteration) is shared.

## Writing an adapter

See `@pdfcraft/ui-adapter-html` for a 100-line reference and `@pdfcraft/ui-adapter-tekivex` for a styled production example.

The adapter interface is 9 methods. The simplest one (`Button`) is one line:

```tsx
const myAdapter: UIAdapter = {
  Button: ({ children, onClick, variant }) => (
    <button className={`btn btn-${variant}`} onClick={onClick}>{children}</button>
  ),
  // ...8 more
};
```

The headless package never imports a UI library, so installing it does not pull in tekivex, MUI, or anything else.
