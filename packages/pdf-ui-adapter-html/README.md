# @pdfcraft/ui-adapter-html

Zero-dependency UIAdapter built from plain HTML inputs. Use it when you want to style the dynamic form yourself with Tailwind, CSS Modules, or any other styling approach — no UI component library required.

```tsx
import { DynamicForm } from '@pdfcraft/ui-react';
import { htmlAdapter } from '@pdfcraft/ui-adapter-html';

<DynamicForm schema={schema} adapter={htmlAdapter} onChange={setFieldValue} />;
```

This package is also the reference for the adapter contract. Read `src/index.tsx` — it's ~100 lines and shows how to implement every method.

## CSS

The adapter emits these class names:
- `.pdf-row`, `.pdf-row__label`, `.pdf-row__required`, `.pdf-row__error`
- `.pdf-radio-group`
- `.pdf-btn`, `.pdf-btn--primary`, `.pdf-btn--secondary`, `.pdf-btn--ghost`

Style them as you wish. The package ships no CSS.
