# @pdfcraft/form-schema

AcroForm → JSON schema bridge. Powers Mode 2 (dynamic form rendering).

## Why

In Mode 1, the user edits fields directly on the PDF canvas. In Mode 2, the form is *generated* on the side as plain inputs, the user fills it, and the PDF updates live. To make that work, we need a representation of "what fields exist" that is decoupled from PDF coordinates — a JSON schema.

## API

```ts
import { extractFormSchema } from '@pdfcraft/form-schema';
import { loadDocument } from '@pdfcraft/engine';

const doc = await loadDocument(pdfBytes);
const schema = await extractFormSchema(doc);

for (const field of schema.fields) {
  console.log(field.id, field.label, field.type, field.required);
}
```

## Heuristics

- **Label**: derived from the field id (snake_case → Title Case).
- **Type**: maps AcroForm classification (text/checkbox/dropdown/etc.) plus id-name hints (`pan` → text with pattern, `dob` → date, `pin` → number).
- **Pattern**: regex inferred from common id names (PAN, email, pincode, phone).

If the PDF was authored well (descriptive field names), the inferred schema is usually good enough. For poorly-named fields, callers should override the schema after extraction.
