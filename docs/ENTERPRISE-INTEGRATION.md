# Enterprise integration guide

Drop the editor into any React app, with any UI component library, in
four steps. No npm publish. No internal registry. No tarballs. No build
step on your side.

Works for environments that block public npm: banks, healthcare,
government, defense, anywhere with strict supply-chain controls.

## The 4-step recipe

```
1. Build the packages once (on the side that has internet)
2. Copy four folders into your repo
3. Add four lines to your package.json
4. Write a ~150-line adapter against your UI library
```

That's the whole integration. Every step is plain code/files. No
infrastructure decisions, no compliance reviews of third-party
services, no credentials.

---

## Step 1 — Build the packages

On a machine with internet, once:

```bash
git clone <this-repo> pdfcraft
cd pdfcraft
pnpm install
pnpm -r build
```

You now have:

```
pdfcraft/packages/
├── pdfcraft-parser/dist/
├── pdfcraft-engine/dist/
├── pdfcraft-form-schema/dist/
└── pdfcraft-ui-react/dist/
```

These four `dist/` folders are everything you need to ship.

---

## Step 2 — Copy into your repo

Take the four packages (the entire folder including `package.json` AND
`dist/`) and drop them in your project:

```
your-react-app/
├── package.json
├── src/
│   ├── App.tsx
│   ├── MyPdfAdapter.tsx           ← your adapter (Step 4)
│   └── DocumentEditor.tsx         ← your wrapper
└── vendor/
    └── pdfcraft/
        ├── pdfcraft-parser/
        │   ├── package.json
        │   └── dist/
        ├── pdfcraft-engine/
        │   ├── package.json
        │   └── dist/
        ├── pdfcraft-form-schema/
        │   ├── package.json
        │   └── dist/
        └── pdfcraft-ui-react/
            ├── package.json
            └── dist/
```

You commit this through your normal PR process. Security reviewers can
read every line — it's plain JS/TS in `dist/`.

---

## Step 3 — Wire up your `package.json`

Four `file:` dependencies + a couple of standard peers:

```json
{
  "dependencies": {
    "@pdfcraft/parser":      "file:./vendor/pdfcraft/pdfcraft-parser",
    "@pdfcraft/engine":      "file:./vendor/pdfcraft/pdfcraft-engine",
    "@pdfcraft/form-schema": "file:./vendor/pdfcraft/pdfcraft-form-schema",
    "@pdfcraft/ui-react":    "file:./vendor/pdfcraft/pdfcraft-ui-react",

    "pdfjs-dist": "^4.9.155",
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0"
  }
}
```

Then:

```bash
pnpm install
```

`pnpm` symlinks the folders into `node_modules/`. Standard imports just
work — `import { usePdfDocument } from '@pdfcraft/ui-react'` resolves
to your vendored copy. **Nothing reaches outside your network.**

Works identically with `npm install` and `yarn install`.

---

## Step 4 — Write your adapter

The adapter maps the editor's 9-method `UIAdapter` interface to your
UI library. It lives **inside your repo**, not as a separate
package, not published anywhere.

Template — fill in with your library's component names:

```tsx
// src/MyPdfAdapter.tsx
import type { UIAdapter } from '@pdfcraft/ui-react';
import { CombInput } from '@pdfcraft/ui-react';

// Your library — already in your project
import {
  MyInput,
  MyTextarea,
  MySelect,
  MyMultiSelect,
  MyCheckbox,
  MyRadioGroup,
  MyDatePicker,
  MyButton,
} from '@yourcompany/ui-kit';

export const myAdapter: UIAdapter = {

  Text: ({ id, label, value, required, readOnly, error, onChange,
          maxLength, comb, password }) => {
    // Comb fields (SSN, phone) render as N segmented cells.
    // CombInput is provided by @pdfcraft/ui-react.
    if (comb && maxLength) {
      return (
        <MyInput.Label htmlFor={id} required={required} error={error}>
          {label}
          <CombInput
            id={id}
            value={value}
            maxLength={maxLength}
            readOnly={readOnly}
            onChange={onChange}
          />
        </MyInput.Label>
      );
    }
    return (
      <MyInput
        id={id}
        label={label}
        value={value}
        type={password ? 'password' : 'text'}
        required={required}
        readOnly={readOnly}
        maxLength={maxLength}
        errorText={error}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  },

  Multiline: ({ id, label, value, required, readOnly, error, onChange, maxLength }) => (
    <MyTextarea
      id={id}
      label={label}
      value={value}
      required={required}
      readOnly={readOnly}
      maxLength={maxLength}
      errorText={error}
      onChange={(e) => onChange(e.target.value)}
    />
  ),

  Number: ({ id, label, value, required, readOnly, error, onChange, maxLength }) => (
    <MyInput
      id={id}
      label={label}
      value={value}
      type="number"
      required={required}
      readOnly={readOnly}
      maxLength={maxLength}
      errorText={error}
      onChange={(e) => onChange(e.target.value)}
    />
  ),

  Date: ({ id, label, value, required, readOnly, error, onChange }) => (
    <MyDatePicker
      id={id}
      label={label}
      value={value}                              // ISO date string YYYY-MM-DD
      required={required}
      readOnly={readOnly}
      errorText={error}
      onChange={(v) => onChange(v ?? '')}
    />
  ),

  Check: ({ id, label, value, readOnly, error, onChange }) => (
    <MyCheckbox
      id={id}
      label={label}
      checked={value}
      disabled={readOnly}
      errorText={error}
      onChange={(e) => onChange(e.target.checked)}
    />
  ),

  Radio: ({ id, label, value, options, readOnly, error, onChange }) => (
    <MyRadioGroup
      id={id}
      label={label}
      value={value}
      options={options}                          // string[]
      disabled={readOnly}
      errorText={error}
      onChange={(v) => onChange(v)}
    />
  ),

  Select: ({ id, label, value, options, required, readOnly, error, onChange }) => (
    <MySelect
      id={id}
      label={label}
      value={value}
      options={options}                          // string[]
      required={required}
      disabled={readOnly}
      errorText={error}
      onChange={(v) => onChange(v)}
    />
  ),

  MultiSelect: ({ id, label, value, options, required, readOnly, error, onChange }) => (
    <MyMultiSelect
      id={id}
      label={label}
      value={value}                              // string[]
      options={options}
      required={required}
      disabled={readOnly}
      errorText={error}
      onChange={(v) => onChange(Array.isArray(v) ? v : [v])}
    />
  ),

  Button: ({ children, onClick, variant, disabled }) => (
    <MyButton
      onClick={onClick}
      variant={variant ?? 'primary'}            // primary | secondary | ghost
      disabled={disabled}
    >
      {children}
    </MyButton>
  ),
};
```

If your library has a different prop name (e.g. `helperText` instead
of `errorText`), just rename — the editor doesn't care. The adapter is
free-form glue.

---

## Using the editor in your app

```tsx
// src/DocumentEditor.tsx
import { AppV2 } from './pdf-editor';      // see "Embedding the editor shell" below
import { myAdapter } from './MyPdfAdapter';
import { MyThemeProvider } from '@yourcompany/ui-kit';

export function DocumentEditor({ documentId }: { documentId: string }) {
  return (
    <MyThemeProvider>
      <AppV2
        formAdapter={myAdapter}
        onPersist={async ({ docId, pdfBytes, values, savedAt }) => {
          await fetch(`/api/documents/${documentId}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/pdf' },
            body: pdfBytes,
          });
        }}
        // Tool gates — pick what to expose. See full list below.
        showSwitch
        showSearch
        showThumbnails
        showOutline
        showSave
        showPrint
        validateRequiredOnSave
        enabledTools={['select', 'add-text', 'highlight', 'sign', 'add-fields']}
      />
    </MyThemeProvider>
  );
}
```

That's the entire integration. Whatever `MyThemeProvider` brings —
brand colors, fonts, spacing, dark mode — applies to every form field
the editor renders.

---

## Embedding the editor shell

The full editor UI (toolbar, sidebar, page view, form view) lives in
`apps/demo-react/src/v2/`. Two ways to use it:

**Option A — Copy it into your repo**

```bash
cp -r pdfcraft/apps/demo-react/src/v2 your-app/src/pdf-editor
```

Now you own it. Customize freely. Re-take edits when we ship new
features by diffing the upstream `v2/` against yours.

**Option B — Roll your own shell**

If you only want certain pieces, skip `AppV2` and use the hooks
directly:

```tsx
import { useState, useRef } from 'react';
import { usePdfDocument, usePageRenderer, DynamicForm } from '@pdfcraft/ui-react';
import { myAdapter } from './MyPdfAdapter';

export function MinimalEditor() {
  const { doc, schema, load, setFieldValue, save, state } = usePdfDocument();
  const containerRef = useRef<HTMLDivElement>(null);

  usePageRenderer({
    doc, pageNumber: 1, scale: 1.25,
    container: containerRef.current,
    withFormLayer: true,
  });

  return (
    <div>
      <input type="file" accept=".pdf"
        onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          await load(new Uint8Array(await f.arrayBuffer()));
        }} />
      <div ref={containerRef} />
      {schema && (
        <DynamicForm
          schema={schema}
          adapter={myAdapter}
          onChange={setFieldValue}
          onSubmit={async () => {
            const bytes = await save();
            /* persist however you like */
          }}
        />
      )}
    </div>
  );
}
```

`AppV2` is just an opinionated composition of these primitives. Use
either depending on how much UI you want for free.

---

## Tool configuration

Every tool can be turned on or off per deployment via the `AppV2`
props. Two layers of control:

### Top-level UI sections — boolean gates

```tsx
<AppV2
  showSwitch                  // PDF / Form mode toggle
  showHelp                    // Help drawer button
  showSave                    // Save button
  showPrint                   // Print button
  showActionToolbar           // The annotation toolbar (drawing tools)
  showThumbnails              // Page thumbnails sidebar
  showOutline                 // Document outline / bookmarks sidebar
  showRotate                  // Page rotation buttons
  showSearch                  // Full-text search input
  validateRequiredOnSave      // Required-field warning banner on save
/>
```

Every one defaults to `true`. Pass `false` to hide. Combine to taste —
e.g. a read-only viewer:

```tsx
<AppV2
  showSwitch={false}
  showActionToolbar={false}
  showSave={false}
  showPrint
  showSearch
  showThumbnails
  showOutline
  defaultMode="pdf"
/>
```

### Action toolbar — per-tool whitelist

The annotation toolbar has 13 tools. Pass `enabledTools` to allow only
the ones you want:

```tsx
<AppV2
  enabledTools={[
    'select',        // Default arrow cursor
    'add-text',      // Drop editable text boxes
    'edit-text',     // White-out + edit existing text
    'eraser',        // White-out a region
    'draw',          // Free-hand draw
    'highlight',     // Translucent yellow box
    'shapes',        // Outlined rect / ellipse
    'image',         // Place an image
    'hyperlink',     // Clickable link
    'sign',          // Signature pad
    'stamp',         // APPROVED / REJECTED / etc.
    'crop',          // Crop region marker
    'add-fields',    // Place new AcroForm fields
    'redact',        // Black-bar redaction
  ]}
/>
```

Omit `enabledTools` to expose all 13. Use cases:

| Use case | `enabledTools` |
|---|---|
| Pure form-filler | `[]` (hides toolbar entirely if `showActionToolbar={false}`) |
| Sign-only flow | `['sign']` |
| Form designer | `['select', 'add-fields']` |
| Reviewer markup | `['highlight', 'add-text', 'draw', 'stamp']` |
| Redaction-only | `['select', 'redact']` |

---

## The `onPersist` hook

Your bridge to your backend. Fires every time the user saves.

```ts
onPersist?: (payload: {
  docId: string;                              // Stem of the uploaded filename
  pdfBytes: Uint8Array;                       // The complete saved PDF
  values: Record<string, string | boolean | string[]>;
                                              // Form values, also baked into pdfBytes
  savedAt: string;                            // ISO timestamp
}) => Promise<void>;
```

Examples:

```tsx
// Simplest — POST the PDF bytes
onPersist={async ({ pdfBytes }) => {
  await fetch('/api/save', { method: 'POST', body: pdfBytes });
}}

// With audit headers
onPersist={async ({ docId, pdfBytes, values, savedAt }) => {
  await fetch(`/api/contracts/${docId}/v/${savedAt}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${await getToken()}`,
      'X-Idempotency-Key': crypto.randomUUID(),
      'Content-Type': 'application/pdf',
    },
    body: pdfBytes,
  });
  // Also store structured values for downstream ETL
  await fetch(`/api/contracts/${docId}/fields`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  });
}}

// With document-store + workflow trigger
onPersist={async ({ docId, pdfBytes, values }) => {
  const fileKey = await uploadToS3(pdfBytes, `contracts/${docId}.pdf`);
  await fetch('/api/workflow/start', {
    method: 'POST',
    body: JSON.stringify({ template: 'contract-review', fileKey, values }),
  });
}}
```

If `onPersist` is omitted, the editor falls back to `localStorage`
(useful in development, never in production).

---

## Self-hosting the pdf.js worker

The pdf.js library needs a worker file at runtime. The engine defaults
to a public CDN URL — usually blocked by enterprise CSP. Override it
once at app bootstrap:

```ts
import { configureWorker } from '@pdfcraft/engine';

configureWorker('/static/pdf.worker.min.mjs');
```

Then make sure your bundler copies the worker into your static-asset
pipeline. With Vite:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { copyFileSync } from 'node:fs';

export default defineConfig({
  plugins: [
    {
      name: 'copy-pdfjs-worker',
      buildStart() {
        copyFileSync(
          'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
          'public/pdf.worker.min.mjs',
        );
      },
    },
  ],
});
```

Webpack/Rspack equivalent uses `copy-webpack-plugin`. Either way the
worker ends up at `/pdf.worker.min.mjs` (or wherever you point it) on
your own domain — no external requests.

---

## Updating the editor later

When we ship a new version:

1. Re-run `pnpm -r build` on the upstream copy.
2. Replace the contents of your `vendor/pdfcraft/` folder.
3. `pnpm install`.
4. Commit through your normal PR process.

The diff is plain JS — code review reads exactly like an upgrade of
any other internal package.

---

## What you don't need

To restate the obvious — none of these are part of the integration:

- ❌ npm publish / npm login
- ❌ Internal registry (Artifactory, Verdaccio, Nexus)
- ❌ License keys / activation
- ❌ Telemetry opt-out — there is no telemetry
- ❌ Cloud account anywhere
- ❌ Connection to anthropic.com or any other host (after self-hosting
  the worker)
- ❌ Build step beyond your existing app's bundler
- ❌ Custom Vite/Webpack plugins (just the worker-copy one)

What you do need:

- ✅ A React 18 or 19 app
- ✅ Your design-system components in scope
- ✅ A backend endpoint that accepts the saved PDF bytes

---

## Reference

| Topic | Where |
|---|---|
| Full `UIAdapter` contract | `docs/BYO-ADAPTER.md` |
| Parser internals (encryption, xref, overlays) | `packages/pdfcraft-parser/src/` |
| Engine API surface | `packages/pdfcraft-engine/src/index.ts` |
| Demo source (copy-paste fodder) | `apps/demo-react/src/v2/` |
| Tests | `packages/pdfcraft-parser/__tests__/` |

If your security team needs a deeper dive on any of the above — supply
chain, encryption posture, audit hooks — point them at this file and
the parser source. Both are short and self-contained.
