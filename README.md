# pdfcraft

A production-grade PDF editor that runs entirely in the browser. Open
encrypted forms, fill them out, add new fields, place signatures,
search and annotate, save the result back as a real PDF — no server
round-trips, no third-party PDF reader/writer libraries in the runtime
path.

```
┌─────────────────────────────────────────────────────────────┐
│  pdf.js (vendored) → rendering: canvas + AnnotationLayer     │
│  @pdfcraft/parser   → AcroForm read + incremental write      │
│  @pdfcraft/engine   → orchestrates the two reps              │
│  @pdfcraft/ui-react → headless React hooks + BYO-UI contract │
│  @pdfcraft/ui-adapter-{html,mui,tekivex} → styled bindings   │
└─────────────────────────────────────────────────────────────┘
```

**Links:** [Live editor](https://editable-pdf.onrender.com/app/) ·
[Documentation](https://editable-pdf.onrender.com/docs) ·
[Landing page](https://editable-pdf.onrender.com/) ·
[llms.txt](https://editable-pdf.onrender.com/llms.txt) (for AI agents).

**Built ourselves, no external runtime decoders/crypto:** an AES (FIPS-197)
cipher + CFB reader + ECMA-376 agile decryption (open password-protected
Office), a baseline TIFF decoder + PNG encoder, an sRGB ICC-profile generator
(PDF/A), and OOXML writers (Word/PowerPoint export). Capabilities aren't gated
behind a paid API.

## What you can do

| Feature | Read | Write |
|---|---|---|
| Text / multiline / number / date fields                 | ✓ | ✓ |
| Checkboxes (any "on" state name)                        | ✓ | ✓ |
| Radio groups                                            | ✓ | ✓ |
| Dropdowns + listboxes (display ↔ export values)         | ✓ | ✓ |
| Signature widgets                                       | ✓ | placeholder |
| /MaxLen, /Ff comb, /Ff password                          | ✓ | ✓ |
| Encrypted PDFs (RC4, AES-128, AES-256 / V1-5, R2-6)      | ✓ | ✓ |
| Hybrid xref (classic + /XRefStm)                         | ✓ | n/a |
| Linearized PDFs                                          | ✓ | n/a |
| Filters: Flate, ASCIIHex, ASCII85, LZW, RunLength        | ✓ | Flate |
| Document outline (bookmarks)                             | ✓ | n/a |
| Overlay tools: text, highlight, draw, eraser, redact, crop, hyperlink, stamp, sign, image, shapes | n/a | ✓ |
| Add new AcroForm fields                                 | n/a | ✓ |
| Word-like text editing on flat PDFs (click a line → edit the real text) | ✓ | ✓ |
| OCR for scanned / image-only PDFs (Tesseract.js) → editable + searchable + AI-readable | ✓ | ✓ |
| AI assistant: ask about the whole doc or a dragged region, summarize, AI-rewrite a text box, auto-detect form fields | ✓ | n/a |
| **Smart Tools** (✨): agentic editing (with preview), PII redaction, in-place translation, version compare (text + **pixel/visual** diff), table→CSV/JSON, auto-outline, smart-sign, read-aloud, accessibility audit | ✓ | ✓ |
| PDF/UA structure tagging (/StructTreeRoot, /MarkInfo, /Lang, /ViewerPreferences) | n/a | ✓ |
| Agent-native: `@pdfcraft/mcp` MCP server exposes extract / fill / tag / **true-redact-and-verify** as tools an AI agent can call, fully locally | n/a | ✓ |
| Embeddable SDK licensing (`@pdfcraft/sdk`): free in dev, offline-verified license key in production, badge otherwise — no license server, no phone-home | n/a | ✓ |
| Page organization: reorder / delete / rotate pages, **merge** (append other PDFs) — via incremental update, original untouched | n/a | ✓ |
| Watermark (diagonal, translucent) & page numbers across all pages | n/a | ✓ |
| Open **any document in a native editor** — Word in rich text, Excel/CSV/ODS in an editable grid, **PowerPoint/ODP in a slide editor**, Markdown/text/HTML in a text editor, PDFs & images in the PDF editor; save back to the original format or convert to any other | ✓ | ✓ |
| **Convert**: PDF → text / **Markdown** (inline images) / editable **Word (.docx)** (text + tables + images) / **Excel (.xlsx)** (table sheets + full text) / **CSV** / **EPUB**; PDF → page images (PNG/JPEG, zipped); images → PDF; text/Markdown/HTML/**DOCX**/**PPTX**/**CSV**/**XLSX** → PDF (with rendered tables & embedded images) | ✓ | ✓ |
| **Optimize**: compress (rasterize at chosen DPI/quality), flatten form fields, extract embedded images | n/a | ✓ |

**Password-protected Office files** (.docx/.xlsx/.pptx with ECMA-376 *agile*
encryption) are unlocked entirely in the browser with our own implementation —
a from-scratch CFB/OLE2 reader, an AES (FIPS-197) block cipher (Web Crypto can't
do AES-CBC without padding), and Web Crypto for the SHA key derivation. No
server, no native dependency. (TIFF images are likewise decoded by our own
baseline TIFF decoder + PNG encoder; **PDF/A** export uses our own generated
sRGB **ICC profile** — the colorimetric constants are public, so there's no
downloaded asset.)

**Compliance posture:** everything runs client-side — no upload, no processor,
no DPA, no BAA (see [docs/compliance.md](docs/compliance.md) for the
GDPR/HIPAA reasoning, the verifiability checklist incl. a recommended CSP, and
the honest exceptions). Strategy context: [docs/market-strategy-research.md](docs/market-strategy-research.md).

UX layer adds: side-by-side form ↔ PDF view, page thumbnails sidebar,
document outline sidebar, full-text search, page rotation, print,
undo/redo, keyboard shortcuts, required-field validation.

## Quickstart

```bash
pnpm install
pnpm --filter demo-react dev
```

Open the URL Vite prints, drop in any PDF.

### Tests

```bash
pnpm -r test          # unit tests (parser + demo smart/ engines), runs in CI
pnpm --filter demo-react exec playwright install chromium
pnpm --filter demo-react test:e2e   # Playwright UI smoke (opens a PDF, drives Smart Tools)
```

The e2e suite is intentionally separate from `pnpm -r test` so CI never blocks
on browser binaries; run it locally (or in a browser-provisioned CI job).

## Use in your own app

### If you can publish to (or pull from) an npm registry

```bash
pnpm add @pdfcraft/engine @pdfcraft/ui-react @pdfcraft/ui-adapter-tekivex tekivex-ui
```

```tsx
import { AppV2 } from './path-to-demo-or-roll-your-own';
import { tekivexAdapter } from '@pdfcraft/ui-adapter-tekivex';
import { ThemeProvider, auroraLight } from 'tekivex-ui';

<ThemeProvider theme={auroraLight}>
  <AppV2 formAdapter={tekivexAdapter} />
</ThemeProvider>
```

Every UI element is gated by an `AppV2` prop:
`showSwitch`, `showHelp`, `showSave`, `showPrint`, `showActionToolbar`,
`showThumbnails`, `showOutline`, `showRotate`, `showSearch`, `showAi`,
`validateRequiredOnSave`, `defaultMode`, `enabledTools`, `formAdapter`,
`onPersist`, `onAiAsk`.

### Word-like editing of non-editable PDFs

Pick the **Edit text** tool and click any line on the page. pdfcraft reads
the real text (its words, font size and position) from the page's text layer
and drops you into an editable box already filled with it — retype like you
would in Word or Notepad. Saving never rewrites the PDF's internals: the
original run is whited-out and your text redrawn on top via the same
incremental-update path, so the source bytes stay intact and the file can't
be corrupted.

> Fully image-only scans (no text layer) have nothing to read directly —
> run **OCR** first (below) to recover one, then Edit-text and the AI work
> the same way. Without OCR, the Edit-text box opens blank so you can still
> type over the area.

### OCR for scanned PDFs

OCR recognizes **13 languages** (English, Spanish, French, German, Italian, Portuguese, Dutch, Russian, Arabic, Hindi, Chinese, Japanese, Korean) — pick one in the scanned-document banner; the model downloads on first use.

When you open an image-only scan, pdfcraft detects the missing text layer
and offers a one-click **OCR** (also always available via the **OCR** button
in the top bar). It renders each page, runs Tesseract.js over it, and feeds
the recovered line-level text — with positions — into the same text cache
that powers editing, search context, and the AI assistant. After OCR you can
click a line to edit it like any digital PDF, or ask the AI about the scan.

Tesseract.js is **lazy-loaded** (dynamic import → its own code-split chunk),
so it never weighs down the initial bundle; the wasm core + English model are
fetched the first time you OCR. For offline / air-gapped / enterprise
deployments, self-host those assets and point the OCR engine at your origin
(same pattern as self-hosting the pdf.js worker):

```ts
import { configureOcr } from './v2/ocr';
configureOcr({
  workerPath: '/assets/tesseract/worker.min.js',
  corePath: '/assets/tesseract/',
  langPath: '/assets/tesseract/lang',  // holds eng.traineddata.gz
  language: 'eng',
});
```

After OCR, the **completion toast offers "Embed searchable text layer"** — it
writes the recovered text as an *invisible* (render-mode-3) layer aligned to
the scanned glyphs, so on Save the scan becomes real selectable / searchable /
screen-reader-readable text while the image stays untouched.

### AI assistant

The **✦ Ask AI** button opens a side panel that grounds answers in the
document's extracted text. It can:

- **Answer questions about the whole document** with `(p. N)` page citations.
- **Ask about any part** — pick the **Ask AI** tool and drag a rectangle over
  a region; the text inside is sent to the panel scoped to just that part.
- **Summarize / extract key facts** in one click.
- **AI-rewrite a text box** — the ✨ control on any editable text box offers
  rewrite / fix grammar / shorten / make formal.
- **Auto-detect form fields** — turn a flat form into a fillable one; click ＋
  to drop a suggested field onto the page, then drag it into place.

There's no backend, so the model connection is up to you. Three layers, in
priority order:

1. **`onAiAsk` prop** — a host hook `(\{ messages, context, system \}) => Promise<string>`.
   Wire it to your own server-side proxy so no API key ever touches the
   browser. Recommended for production.
2. **In-app endpoint + key** — entered in the panel's ⚙ settings and kept only
   in the user's `localStorage`. The request shape is auto-detected from the
   URL: Anthropic Messages (`…/v1/messages`) or OpenAI-style
   (`…/chat/completions` — OpenAI, Groq, OpenRouter, Together, Mistral, Ollama,
   LM Studio, …). Fine for personal/demo use.
3. **Offline fallback** — with neither configured, a local extractive helper
   answers from the document text (keyword retrieval + summary) so every AI
   surface stays usable with no key and no network.

### Smart Tools (✨)

The **✨ Smart Tools** button opens a hub of higher-order capabilities.
Each is a thin UI over a pure engine module in `src/v2/smart/`, and anything
that edits the document does so by appending overlay annotations — the same
incremental-update path as every manual edit, so **the source PDF is never
mutated** and every change is undoable before you Save.

| Tool | What it does | Needs AI? |
|---|---|---|
| **AI Edit** | Plain-English, document-wide editing — "redact every SSN", "change all 2025 to 2026", "black out 'Acme Corp'". Maps the instruction to typed ops and applies them everywhere. | Free-form: yes. `redact <type>` / `redact "literal"` / `replace A with B`: works offline. |
| **Redact PII** | Regex + Luhn scan for emails, SSNs, phones, credit cards, IPs, dates → **true redaction**: a content-stream interpreter physically removes the glyphs under each box on Save (not just a black rectangle), **plus a verifier** that re-reads the exported file and certifies no text survives in any redacted region — the check the Manafort (2019) and DOJ Epstein-files (2025) redactions failed. | No |
| **Translate** | Translates every line in place, keeping its position/size. Works on scans after OCR. | Yes |
| **Tables** | Geometric row/column clustering turns a PDF table into structured data → copy/Download **CSV / JSON**. | No |
| **Outline** | Heading detection (font-size heuristic) builds a clickable table of contents with page jumps, even for PDFs with no bookmarks. | No |
| **Sign** | Finds signature/date cues and proposes fillable fields next to them; drop one or all onto the page. | No |
| **Compare** | Pick a previous version; an LCS line-diff shows exactly what was added/removed, with an optional AI "what changed and why it matters" summary. | Diff: no. Summary: yes. |
| **Read aloud** | Web Speech text-to-speech with voice/speed control and per-line tracking. | No (browser-native) |
| **Convert** | Multi-format in/out, all client-side. **Open** Word (.docx), PowerPoint (.pptx), Excel (.xlsx), CSV, Markdown, HTML, text or images (PNG/JPEG/WEBP/GIF/BMP/SVG) — each converted to PDF in the browser and opened in the editor. DOCX (mammoth) and HTML keep structure incl. **rendered tables and embedded images**; PPTX → one section per slide; spreadsheets/CSV → **laid-out tables**; WEBP/GIF/BMP/SVG rasterized via canvas. **Export** the PDF as **text**, **Markdown** (detected headings + inline images), editable **Word .docx** (text + detected tables + extracted images, hand-built OOXML — no writer dep), **Excel .xlsx** (table sheets + a full-text sheet), a single combined **CSV**, a reflowable **EPUB**, or **page images** (PNG/JPEG, zipped); build a PDF **from images / text / Markdown / HTML**. Clean layout with standard fonts — no CSS rendering, stated plainly. | No |
| **Optimize** | **Compress** (rasterize each page to JPEG at a chosen DPI/quality and rebuild at the original geometry — image-only output, so the trade-off is stated), **flatten** form fields into static page content, **extract** embedded raster images as PNGs, and **PDF/A** (image-based PDF/A-1b for archiving — with our own generated sRGB ICC OutputIntent + XMP, no fonts to embed; built to spec, certify with veraPDF). | No |
| **Access** | **Compliance audit → remediate → certify**: audits against the criteria regulators cite (EN 301 549 / WCAG 2.1 AA / PDF/UA — EAA, ADA Title II, §508) with a downloadable filed-ready HTML report; one-click remediation writes marked content + `/StructTreeRoot` + `/ParentTree` + `/Lang` + title, then **independently re-audits the exported bytes** so the certified report describes the actual file. Human-review items (alt text, heading semantics) are listed as such — no over-claiming. | No |

The three AI-backed tools reuse the same connection layers as Ask AI (host
hook → in-app key → offline), and degrade gracefully: deterministic commands,
PII redaction, table/outline extraction, signing, the diff itself, read-aloud,
and the audit all run with **no key and no network**.

**PDF/UA tagging depth:** the Access tab writes *real* marked content —
each page's `/Contents` is bracketed in `/P <</MCID 0>> BDC … EMC` and bound
to a `/StructTreeRoot → Document → /P`-per-page tree through a `/ParentTree`,
with `/StructParents` on every page — so a validator sees the content as
*tagged*, not just a dangling structure tree. Tagging is **per-paragraph**:
every text object (`BT…ET`) is bracketed as its own marked-content sequence
with a matching `/P` structure element (pages with no text objects fall back
to one whole-page region).

> Redaction is genuine content removal — a content-stream interpreter
> (`@pdfcraft/parser` `redact.ts`) tracks text-positioning operators and blanks
> the string operand of any `Tj`/`TJ`/`'`/`"` whose box intersects a redaction
> rectangle, then draws the black bar on top; an independent verifier re-reads
> the export to certify it. In-place translation/replacement are still
> flat-overlay (white-out the original run, redraw on top). This
> is crisp for targeted edits and best-effort on dense, multi-column layouts —
> exactly where a structural re-flow engine would be the deeper follow-up.

### If your company blocks public npm (the vendor approach)

Most enterprises (banks, healthcare, gov) won't allow `pnpm add` from
the public registry and won't host an internal one for third-party
libraries. The simplest path that needs **no registry, no tarball, no
publish step** is to vendor the built `dist/` folders directly into
your repo and reference them with `file:` paths.

> **For the full walkthrough — including a complete adapter template,
> the tool-configuration matrix, the `onPersist` hook patterns,
> worker self-hosting, and what your security team needs to know — see
> [docs/ENTERPRISE-INTEGRATION.md](./docs/ENTERPRISE-INTEGRATION.md).**
> The summary below is enough to get started.

**Step 1 — build the packages once**

```bash
git clone <this repo>
cd editable-pdf
pnpm install
pnpm -r build
```

**Step 2 — copy the four packages into your repo**

```
your-react-app/
├── package.json
├── src/
└── vendor/
    └── editable-pdf/
        ├── pdf-core-parser/          (package.json + dist/)
        ├── pdf-core-engine/          (package.json + dist/)
        ├── pdf-core-form-schema/     (package.json + dist/)
        └── pdf-core-ui-react/        (package.json + dist/)
```

**Step 3 — point your `package.json` at the folders**

```json
{
  "dependencies": {
    "@pdfcraft/parser":      "file:./vendor/editable-pdf/pdf-core-parser",
    "@pdfcraft/engine":      "file:./vendor/editable-pdf/pdf-core-engine",
    "@pdfcraft/form-schema": "file:./vendor/editable-pdf/pdf-core-form-schema",
    "@pdfcraft/ui-react":    "file:./vendor/editable-pdf/pdf-core-ui-react",
    "pdfjs-dist": "^4.9.155",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

```bash
pnpm install
```

pnpm symlinks the folders into `node_modules/` — `import { usePdfDocument }
from '@pdfcraft/ui-react'` just works. No registry touched.

**Step 4 — write your adapter in src/, not as a separate package**

The adapter is just a regular React file in your project, mapping the
9-method `UIAdapter` contract to your design system. No package
boundary, no publish:

```tsx
// src/MyAdapter.tsx
import type { UIAdapter } from '@pdfcraft/ui-react';
import { CombInput } from '@pdfcraft/ui-react';
import { MyInput, MyCheckbox, MySelect, MyButton } from '@yourcompany/ui-kit';

export const myAdapter: UIAdapter = {
  Text: ({ id, label, value, required, readOnly, error, onChange, maxLength, comb, password }) => (
    comb && maxLength
      ? <CombInput id={id} value={value} maxLength={maxLength} readOnly={readOnly} onChange={onChange} />
      : <MyInput {...{ id, label, value, required, readOnly, maxLength,
                       type: password ? 'password' : 'text', errorText: error,
                       onChange: (e) => onChange(e.target.value) }} />
  ),
  // ...Multiline, Number, Date, Check, Radio, Select, MultiSelect, Button
};
```

See `docs/BYO-ADAPTER.md` for the full 9-method walkthrough.

**Updating later** — when a new version ships, replace the contents of
`vendor/editable-pdf/`, run `pnpm install` again. The diff lands in
your repo's git history as a normal PR.

### Bring your own UI library

The `@pdfcraft/ui-react` `UIAdapter` contract is intentionally tiny (9
methods). Reference adapters live in `@pdfcraft/ui-adapter-{html, mui,
tekivex}`; write your own for Chakra, shadcn, Ant Design, or
in-house design systems. See `docs/BYO-ADAPTER.md`.

### Self-host the pdf.js worker

The engine defaults to a cdnjs URL for the pdf.js worker — fine for
prototypes, blocked by strict CSP in most enterprise environments.
Self-host with one line at app bootstrap:

```ts
import { configureWorker } from '@pdfcraft/engine';

configureWorker('/static/pdf.worker.min.mjs');
// Your bundler copies pdfjs-dist/build/pdf.worker.min.mjs to /static/
```

## Packages

| Package | Description |
|---|---|
| `@pdfcraft/parser`            | From-scratch PDF reader/writer. Zero third-party PDF deps. |
| `@pdfcraft/engine`            | Orchestrates pdf.js (render) + parser (read/write). |
| `@pdfcraft/form-schema`       | AcroForm → JSON schema for the form view. |
| `@pdfcraft/ui-react`          | Headless React hooks (`usePdfDocument`, `usePageRenderer`) + adapter contract. |
| `@pdfcraft/ui-adapter-html`   | Zero-dep reference adapter. |
| `@pdfcraft/ui-adapter-mui`    | Material UI adapter. |
| `@pdfcraft/ui-adapter-tekivex`| tekivex-ui adapter (default in the demo). |

## Architecture

Two parallel representations of every loaded PDF:

1. **pdf.js** owns rendering — canvas painting, AnnotationLayer for
   form widgets, text content for search.
2. **@pdfcraft/parser** owns mutation — walks the AcroForm tree,
   handles incremental update serialization, manages encryption and
   appearance streams.

The engine keeps both in sync. Edits in the form view go through the
parser; field-value changes inside pdf.js's AnnotationLayer feed back
through `applyValuesToStorage` so the canvas reflects them.

Saves use the PDF incremental-update mechanism: the original file
bytes stay verbatim, modified objects + a new xref subsection + a new
trailer are appended at the end. Encrypted PDFs round-trip with their
original `/Encrypt` dict preserved — saved bytes stay password-protected.

## Tests

```
node packages/pdf-core-parser/__tests__/smoke.mjs      # AcroForm round-trip
node packages/pdf-core-parser/__tests__/crypto.mjs     # MD5 + RC4 + AES vectors
node packages/pdf-core-parser/__tests__/filters.mjs    # Hex, ASCII85, RLE, LZW, Flate
```

## Project status

`v2/cleanup` branch is the active line. Roadmap remaining:
testing/distribution (Playwright suite, npm publish, CDN), more
adapters (Chakra, shadcn, Ant Design), form-engine polish (computed
fields, XMP, Info dict).

## License

**Proprietary. All Rights Reserved.** See [LICENSE](./LICENSE) for the
full terms.

This software is not open source. Reading, evaluating, or experimenting
with the code is permitted; reproducing, redistributing, or building a
competing product is not. Commercial deployment requires a separate
written agreement with the copyright holder.

Published packages on npm are minified, contain a copyright banner, and
carry the proprietary license file inside the tarball — anyone who
installs the package agrees to those terms at install time.
