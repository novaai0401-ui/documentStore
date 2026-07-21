# @pdfcraft/ui-adapter-tekivex

Default styled UIAdapter using tekivex-ui components.

```tsx
import { DynamicForm } from '@pdfcraft/ui-react';
import { tekivexAdapter } from '@pdfcraft/ui-adapter-tekivex';

<DynamicForm schema={schema} adapter={tekivexAdapter} onChange={setFieldValue} />;
```

Tekivex-ui is a **peer dependency** — install it in your app:

```
pnpm add tekivex-ui @pdfcraft/ui-adapter-tekivex
```

If a tekivex component is missing or you don't have tekivex installed, the adapter falls back to plain HTML inputs so it still renders.

To use a different library, swap the adapter — see [@pdfcraft/ui-adapter-html](../pdf-ui-adapter-html) for a vanilla example, or write your own using the same 9-method interface.
