/**
 * Documentation page, served at "/docs". Self-contained, semantic, keyword-rich
 * HTML so it indexes well for search engines and AI assistants, with copyable
 * code examples for embedding Pyntra. Built with Tekivex chrome under
 * auroraLight; content is plain semantic markup for accessibility + SEO.
 */
import { TkxBadge, TkxSEO, seoSchema } from 'tekivex-ui';
import './docs.css';

const APP_URL = '/app';
const SITE = 'https://pyntra.tekivex.com';
const REPO_URL = 'https://github.com/novaai0401-ui/pdfcraft';

function Code({ children }: { children: string }) {
  return <pre className="docs-code"><code>{children}</code></pre>;
}

const TOC: Array<{ id: string; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'quickstart', label: 'Quickstart' },
  { id: 'open', label: 'Open any document' },
  { id: 'convert', label: 'Convert & export' },
  { id: 'editing', label: 'Editing tools' },
  { id: 'smart', label: 'Smart Tools' },
  { id: 'ai', label: 'AI assistant' },
  { id: 'security', label: 'Security & privacy' },
  { id: 'embed', label: 'Embed the SDK' },
  { id: 'adapter', label: 'Bring your own UI' },
  { id: 'enterprise', label: 'Enterprise & self-hosting' },
  { id: 'mcp', label: 'Agents (MCP)' },
  { id: 'faq', label: 'FAQ' },
];

export function Docs() {
  return (
    <div className="docs">
      <TkxSEO
        title="Pyntra Documentation — Edit, convert & embed PDFs, Word, Excel & PowerPoint in the browser"
        description="How to use and embed Pyntra: open and edit Word/PowerPoint/Excel/OpenDocument/Markdown/images natively, convert to any format, OCR, redact, sign, use AI, and integrate the SDK — all 100% in the browser."
        canonical={`${SITE}/docs`}
        keywords="Pyntra docs, pdf editor sdk, embed pdf editor react, convert pdf to word api, docx to pdf in browser, document converter library"
        ogType="article"
        robots="index, follow, max-snippet:-1"
        schema={seoSchema.article({
          headline: 'Pyntra Documentation',
          description: 'Guide to using and embedding Pyntra — the in-browser PDF & document editor and converter.',
          url: `${SITE}/docs`,
          author: 'Pyntra',
          datePublished: '2026-06-14',
        })}
      />
      <header className="docs-top">
        <a className="docs-brand" href="/">Pyntra</a>
        <nav className="docs-topnav">
          <a href="/">Home</a>
          <a href={APP_URL}>Open editor</a>
        </nav>
      </header>

      <div className="docs-body">
        <aside className="docs-toc" aria-label="On this page">
          <strong>Documentation</strong>
          <ul>{TOC.map((t) => <li key={t.id}><a href={`#${t.id}`}>{t.label}</a></li>)}</ul>
        </aside>

        <main className="docs-main">
          <section id="overview">
            <TkxBadge variant="primary" size="sm">Documentation</TkxBadge>
            <h1>Pyntra documentation</h1>
            <p className="docs-lead">
              Pyntra is a production-grade, 100%-in-the-browser PDF editor and universal document
              converter. It opens PDFs and Office/OpenDocument/image files, edits and converts them, and
              never uploads your data. This guide covers using the app and embedding it in your own product.
            </p>
            <p>Everything below runs client-side — no server, no API keys required for the core tools, and no data ever leaves the browser.</p>
          </section>

          <section id="quickstart">
            <h2>Quickstart</h2>
            <p>Open the hosted editor and drop in a file, or run it locally:</p>
            <Code>{`git clone ${REPO_URL}
cd editable-pdf
pnpm install
pnpm --filter demo-react dev   # open the URL Vite prints`}</Code>
            <p>Run the test suite (parser, engine, and Smart-Tools modules):</p>
            <Code>{`pnpm -r test`}</Code>
          </section>

          <section id="open">
            <h2>Open any document — in its native editor</h2>
            <p>
              Use the global <strong>Open…</strong> button. Pyntra routes each format to a native editor —
              <strong> Word</strong> opens in a rich-text editor, <strong>spreadsheets</strong> in an editable
              grid, <strong>PowerPoint</strong> in a slide editor, <strong>Markdown / text / HTML</strong> in a
              text editor, and <strong>PDFs &amp; images</strong> in the PDF editor. From any editor you can save
              back to the original format or convert to others. Supported inputs:
            </p>
            <ul>
              <li><strong>PDF</strong> — including encrypted (RC4/AES) and linearized files.</li>
              <li><strong>Word</strong> <code>.docx</code> — headings, run formatting (bold/italic/underline/colour/size), alignment, tables, and embedded images.</li>
              <li><strong>PowerPoint</strong> <code>.pptx</code> — one section per slide.</li>
              <li><strong>Excel</strong> <code>.xlsx</code>/<code>.xls</code> and <strong>CSV/TSV</strong> — rendered as laid-out tables.</li>
              <li><strong>OpenDocument</strong> <code>.odt</code> / <code>.ods</code> / <code>.odp</code>.</li>
              <li><strong>RTF, Markdown, HTML, plain text</strong>.</li>
              <li><strong>Images</strong> — PNG, JPEG, WEBP, GIF, BMP, SVG, and <strong>TIFF</strong> (decoded by our own TIFF decoder).</li>
            </ul>
            <p><strong>Password-protected Office files</strong> (modern agile encryption) are unlocked in-browser; you’re prompted for the password on open.</p>
            <p>Programmatically, the same dispatch is exported:</p>
            <Code>{`import { fileToPdf } from 'pdfcraft/convert';

// Returns { bytes, name } (PDF), or null if the file already is a PDF.
const result = await fileToPdf(file /*, password? */);
if (result) openInEditor(result.bytes, result.name);`}</Code>
          </section>

          <section id="convert">
            <h2>Convert &amp; export</h2>
            <p>Open the <strong>✨ Smart Tools → Convert</strong> tab to export the current document to:</p>
            <ul>
              <li><strong>Word</strong> <code>.docx</code> — text + detected tables + extracted images (a hand-built OOXML package).</li>
              <li><strong>Excel</strong> <code>.xlsx</code> — one sheet per detected table plus a full-text sheet.</li>
              <li><strong>PowerPoint</strong> <code>.pptx</code> — one slide per page.</li>
              <li><strong>EPUB</strong> — a reflowable e-book.</li>
              <li><strong>Markdown</strong> (with detected headings + inline images), <strong>CSV</strong>, <strong>plain text</strong>.</li>
              <li><strong>Page images</strong> — PNG or JPEG at a chosen DPI, zipped.</li>
            </ul>
            <p>And in <strong>Optimize</strong>: compress, flatten form fields, extract embedded images, and <strong>PDF/A-1b</strong> for archiving.</p>
            <p>Build a PDF from scratch out of images, Markdown, HTML, or text:</p>
            <Code>{`import { markdownToPdf, imagesToPdf } from 'pdfcraft/convert';

const pdf = await markdownToPdf('# Title\\n\\nSome **text** and a list:\\n- one\\n- two');
const fromImages = await imagesToPdf([{ bytes: pngBytes, type: 'png' }]);`}</Code>
          </section>

          <section id="editing">
            <h2>Editing tools</h2>
            <ul>
              <li><strong>Edit text</strong> — click any line and retype, even on flat PDFs; the original run is whited-out and your text redrawn via incremental update.</li>
              <li><strong>Highlight, draw, shapes, eraser, crop, hyperlink, stamp, image, signature</strong>.</li>
              <li><strong>Forms</strong> — fill existing fields or add new text/checkbox/radio/dropdown/signature fields.</li>
              <li><strong>Pages</strong> — reorder, delete, rotate, and merge other PDFs.</li>
              <li><strong>Watermark &amp; page numbers</strong> across every page.</li>
              <li><strong>OCR</strong> — recover editable, searchable text from scans in 13 languages.</li>
            </ul>
          </section>

          <section id="smart">
            <h2>Smart Tools</h2>
            <p>The <strong>✨</strong> button opens a hub of higher-order capabilities, each a thin UI over a pure module — all undoable and applied via the same incremental-update path:</p>
            <ul>
              <li><strong>AI Edit</strong> — plain-English, document-wide editing.</li>
              <li><strong>Redact PII</strong> — regex + Luhn scan → true redaction + a verifier that proves the text is gone.</li>
              <li><strong>Translate</strong>, <strong>Tables → CSV/JSON</strong>, <strong>Outline</strong>, <strong>Sign</strong>, <strong>Compare</strong> (text + pixel diff), <strong>Read aloud</strong>, <strong>Access</strong> (WCAG/PDF-UA audit → remediate → certify).</li>
              <li><strong>Convert</strong> and <strong>Optimize</strong> (above).</li>
            </ul>
          </section>

          <section id="ai">
            <h2>AI assistant — in every editor</h2>
            <p>
              An <strong>✦ AI</strong> assistant is available in every editor — Word, spreadsheets, slides, text,
              and PDF. It grounds answers in the current document and offers format-tailored actions: summarize,
              improve writing, continue, make formal (Word/text); analyze data, find totals, spot anomalies
              (spreadsheets); add or expand slides and write speaker notes (decks). Generated content can be
              inserted straight back into the document. Wire the connection three ways, in priority order:
            </p>
            <Code>{`<AppV2
  // 1. Production: proxy through your server so no key touches the browser
  onAiAsk={async ({ messages, context, system }) => callMyProxy(...)}
/>

// 2. In-app endpoint + key (kept only in localStorage) — auto-detects
//    Anthropic (/v1/messages) or OpenAI-style (/chat/completions) shapes.
// 3. Offline fallback — a local extractive helper answers with no key.`}</Code>
          </section>

          <section id="security">
            <h2>Security &amp; privacy</h2>
            <p>
              There is no backend. Files are read, edited, encrypted/decrypted, OCR’d, redacted, and converted
              entirely in the browser. That means <strong>no upload, no data processor, no DPA, and no BAA</strong> —
              Pyntra is GDPR- and HIPAA-friendly by architecture. Redaction is genuine glyph removal verified by
              re-reading the export. For locked-down deployments, self-host the pdf.js worker and OCR assets and add a
              strict Content-Security-Policy.
            </p>
          </section>

          <section id="embed">
            <h2>Embed the SDK</h2>
            <p>Drop the editor into a React app and gate every UI element with props:</p>
            <Code>{`import { AppV2 } from 'pdfcraft';
import { tekivexAdapter } from '@pdfcraft/ui-adapter-tekivex';
import { ThemeProvider, auroraLight } from 'tekivex-ui';

<ThemeProvider theme={auroraLight}>
  <AppV2
    formAdapter={tekivexAdapter}
    showSmart showAi showActionToolbar
    onPersist={async (payload) => save(payload)}   // optional backend bridge
    licenseKey={import.meta.env.VITE_PDFCRAFT_KEY}  // offline-verified
  />
</ThemeProvider>`}</Code>
            <p>Props include <code>showSwitch, showHelp, showSave, showPrint, showThumbnails, showOutline, showRotate, showSearch, enabledTools, defaultMode, validateRequiredOnSave, onAiAsk</code>.</p>
          </section>

          <section id="adapter">
            <h2>Bring your own UI</h2>
            <p>The <code>UIAdapter</code> contract is nine methods. Map them to your design system (Chakra, shadcn, Ant Design, in-house):</p>
            <Code>{`import type { UIAdapter } from '@pdfcraft/ui-react';

export const myAdapter: UIAdapter = {
  Text:     (p) => <MyInput {...p} />,
  Multiline:(p) => <MyTextarea {...p} />,
  Number:   (p) => <MyNumber {...p} />,
  Date:     (p) => <MyDate {...p} />,
  Check:    (p) => <MyCheckbox {...p} />,
  Radio:    (p) => <MyRadioGroup {...p} />,
  Select:   (p) => <MySelect {...p} />,
  MultiSelect: (p) => <MyMultiSelect {...p} />,
  Button:   (p) => <MyButton {...p} />,
};`}</Code>
            <p>Reference adapters ship for plain HTML, Material UI, and Tekivex.</p>
          </section>

          <section id="enterprise">
            <h2>Enterprise &amp; self-hosting</h2>
            <p>If your company blocks the public npm registry, vendor the built <code>dist/</code> folders and reference them with <code>file:</code> paths — no registry, no tarball, no publish step:</p>
            <Code>{`{
  "dependencies": {
    "@pdfcraft/parser":      "file:./vendor/editable-pdf/pdf-core-parser",
    "@pdfcraft/engine":      "file:./vendor/editable-pdf/pdf-core-engine",
    "@pdfcraft/form-schema": "file:./vendor/editable-pdf/pdf-core-form-schema",
    "@pdfcraft/ui-react":    "file:./vendor/editable-pdf/pdf-core-ui-react"
  }
}`}</Code>
            <p>Self-host the worker for strict-CSP environments:</p>
            <Code>{`import { configureWorker } from '@pdfcraft/engine';
configureWorker('/static/pdf.worker.min.mjs');`}</Code>
          </section>

          <section id="mcp">
            <h2>Agents (MCP)</h2>
            <p>
              Pyntra ships <code>@pdfcraft/mcp</code>, a Model Context Protocol server that exposes
              <strong> extract, fill, tag, and true-redact-and-verify</strong> as tools an AI agent can call —
              fully locally. Combined with the <a href="/llms.txt">llms.txt</a> and
              <a href="/.well-known/ai-plugin.json"> ai-plugin manifest</a>, any AI assistant can discover and
              operate Pyntra.
            </p>
          </section>

          <section id="faq">
            <h2>FAQ</h2>
            <h3>Is it free?</h3>
            <p>Every tool is free in the browser. Commercial embedding uses an offline-verified license key with no metering.</p>
            <h3>Do files get uploaded?</h3>
            <p>No — everything runs locally in the browser.</p>
            <h3>Which formats are supported?</h3>
            <p>See <a href="#open">Open any document</a> and <a href="#convert">Convert &amp; export</a>.</p>
          </section>

          <footer className="docs-footer">
            <a href="/">Home</a> · <a href={APP_URL}>Open editor</a> · <a href="/llms.txt">llms.txt</a>
            <span>© {new Date().getFullYear()} Pyntra</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
