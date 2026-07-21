# @pdfcraft/engine

Framework-agnostic PDF engine. Wraps `pdfjs-dist` (render) and `pdf-lib` (edit) behind one small facade.

No React. No DOM beyond a canvas. Same package works in a future Web Worker, Electron main, or Node (with a polyfill).

## API

```ts
import {
  loadDocument,
  renderPage,
  listFormFields,
  writeFormFields,
  saveDocument,
} from '@pdfcraft/engine';

const doc = await loadDocument(pdfBytes);

const { canvas } = await renderPage(doc, { pageNumber: 1, scale: 1.5 });
document.body.appendChild(canvas);

const fields = await listFormFields(doc);
await writeFormFields(doc, { name: 'Jane Doe', pan: 'ABCDE1234F' });

const savedBytes = await saveDocument(doc);
```

## Design rules

- **No UI**. This package never touches React, MUI, tekivex, anything.
- **No business logic**. Watermarks, redactions, etc. are separate plugins.
- **One handle, two reps**. Internally we keep a pdfjs-dist doc (render) and a pdf-lib doc (edit). Callers see one `PdfDocumentHandle`.
- **CSS-pixel awareness**. `renderPage` returns CSS-pixel dimensions so overlays can position themselves without re-querying the viewport. Device pixel ratio is handled inside.
