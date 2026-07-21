import { useCallback, useEffect, useRef, useState } from 'react';
import { TkxButton } from 'tekivex-ui';
import { usePdfDocument } from '@pdfcraft/ui-react';
import { applyValuesToStorage, collectFormStorage } from '@pdfcraft/engine';
import { PdfView } from './PdfView.js';
import { FullPageForm } from './FullPageForm.js';
import { HelpDrawer } from './HelpDrawer.js';
import {
  persistToLocalStorage,
  persistToServer,
  type PersistPayload,
  type ServerPersistHook,
} from './persist.js';
import { ActionToolbar, TOOL_HINTS, type ToolName } from './ActionToolbar.js';
import { useAnnotationPrompts, type Annotation, type NewFieldKind, type AiTextAction } from './Annotations.js';
import { annotationsToOverlays, annotationsToNewFields } from './overlay-bridge.js';
import { FieldTypePicker } from './FieldTypePicker.js';
import { usePageText } from './pdfText.js';
import { AiPanel, type FieldSuggestion } from './ai/AiPanel.js';
import { askAi, loadAiConfig, type AiConfig, type HostAskHook } from './ai/aiClient.js';
import { SmartPanel } from './SmartPanel.js';
import { invisibleTextLayer, type PageRuns } from './smart/util.js';
import { fileToPdf, OPENABLE_ACCEPT } from './smart/convert.js';
import { setOcrLanguage, OCR_LANGUAGES } from './ocr.js';
import { verifyRedactions, type RedactReport } from './smart/redactVerify.js';
import { configureLicense, validateLicense, shouldShowBadge, type LicenseInfo } from '@pdfcraft/sdk';
import { PasswordPrompt } from './PasswordPrompt.js';
import { Thumbnails } from './Thumbnails.js';
import { OutlineSidebar } from './OutlineSidebar.js';
import { useTextSearch } from './useTextSearch.js';
import { ToolPalette } from './editors/tools/ToolPalette.js';
import type { InsertContent } from './editors/tools/insertTools.js';
import type { UIAdapter } from '@pdfcraft/ui-react';
import 'pdfjs-dist/web/pdf_viewer.css';
import 'tekivex-ui/styles';
import './v2.css';
import './editors/workspace.css';

interface AppV2Props {
  /** Optional bridge to a backend. Receives the saved payload after every
   *  successful save. Without this, the data is held in localStorage only. */
  onPersist?: ServerPersistHook;
  /** Show the OFF/ON switch between PDF and Form view. Default true. */
  showSwitch?: boolean;
  /** Show the Help (?) button. Default true. */
  showHelp?: boolean;
  /** Show the Save button. Default true. */
  showSave?: boolean;
  /** Show the action toolbar (Add Text / Highlight / etc). Default true. */
  showActionToolbar?: boolean;
  /** Show the thumbnails sidebar toggle in the top bar. Default true. */
  showThumbnails?: boolean;
  /** Show the outline (bookmarks) sidebar toggle in the top bar. Default true. */
  showOutline?: boolean;
  /** Show the page rotation buttons in the top bar. Default true. */
  showRotate?: boolean;
  /** Show the Print button in the top bar. Default true. */
  showPrint?: boolean;
  /** Show the search input in the top bar. Default true. */
  showSearch?: boolean;
  /** Run a required-fields check before save and surface missing ones
   *  in a banner. Default true. */
  validateRequiredOnSave?: boolean;
  /** Initial / forced mode when the switch is hidden. Default 'pdf'. */
  defaultMode?: 'pdf' | 'form';
  /** Whitelist of tools to expose. Omit to show all. */
  enabledTools?: ToolName[];
  /** UI adapter for the form view. Defaults to tekivexAdapter. Pass
   *  @pdfcraft/ui-adapter-html for a zero-dep baseline, or your own
   *  adapter implementing the 9-method UIAdapter contract for MUI /
   *  Chakra / shadcn / etc. */
  formAdapter?: UIAdapter;
  /** Show the AI assistant button + panel. Default true. */
  showAi?: boolean;
  /** Show the Smart Tools button + panel (redact PII, tables, outline,
   *  sign, read-aloud, accessibility, and AI doc operations). Default true. */
  showSmart?: boolean;
  /** Host hook for AI requests. When provided, the in-app endpoint/key are
   *  ignored and every AI call is delegated here — wire this to your own
   *  server-side proxy so no key lives in the browser. */
  onAiAsk?: HostAskHook;
  /** SDK license key (production embedding). Free in development; without a
   *  valid key, production shows a small "Built with pdfcraft" badge. */
  licenseKey?: string;
  /** Pre-loaded document to open on mount (used by the multi-format
   *  Workspace to hand the PDF editor an already-opened/converted file). */
  initialDoc?: { bytes: Uint8Array; name: string };
  /** Show the top-bar file picker. The Workspace owns a global Open button,
   *  so it hides AppV2's. Default true. */
  showOpen?: boolean;
}

export function AppV2({
  onPersist,
  showSwitch = true,
  showHelp = true,
  showSave = true,
  showActionToolbar = true,
  showThumbnails = true,
  showOutline = true,
  showRotate = true,
  showPrint = true,
  showSearch = true,
  validateRequiredOnSave = true,
  defaultMode = 'pdf',
  enabledTools,
  formAdapter,
  showAi = true,
  showSmart = true,
  onAiAsk,
  licenseKey,
  initialDoc,
  showOpen = true,
}: AppV2Props = {}) {
  const { doc, schema, load, setFieldValue, save, state, error, encryptedError } = usePdfDocument();
  const [mode, setMode] = useState<'pdf' | 'form'>(defaultMode);
  const [helpOpen, setHelpOpen] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [renderVersion, setRenderVersion] = useState(0);
  const [scale, setScale] = useState(1.25);
  const [activeTool, setActiveTool] = useState<ToolName>('select');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  /** Selected field type on the Add-Field sub-toolbar. */
  const [newFieldKind, setNewFieldKind] = useState<NewFieldKind>('text');
  /** Visible page in the main stack — driven by IntersectionObserver
   *  inside PdfView. Also drives the Thumbnails sidebar highlight. */
  const [currentPage, setCurrentPage] = useState(1);
  /** When set, PdfView scrolls that page into view. Bumped by clicking
   *  on a thumbnail. Stored as `{page, bump}` because clicking the same
   *  thumb twice should still trigger the scroll. */
  const [scrollReq, setScrollReq] = useState<{ page: number; bump: number }>({ page: 1, bump: 0 });
  /** Rotation in degrees, applied to every page on render. */
  const [rotation, setRotation] = useState(0);
  /** Thumbnails sidebar visibility. */
  const [thumbsOpen, setThumbsOpen] = useState(false);
  /** Outline (bookmarks) sidebar visibility. */
  const [outlineOpen, setOutlineOpen] = useState(false);
  /** Names of required fields that were empty at the last save attempt.
   *  Surfaced via a non-blocking banner; user can dismiss or jump-to. */
  const [missingRequired, setMissingRequired] = useState<string[]>([]);
  /** Search state — query text + cursor index live in the hook. */
  const [searchInputValue, setSearchInputValue] = useState('');
  const search = useTextSearch(doc);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const didFitRef = useRef(false);
  // ── AI assistant state ──────────────────────────────────────────────────
  const pageText = usePageText(doc);
  const [aiOpen, setAiOpen] = useState(false);
  const [smartOpen, setSmartOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Surfaced when opening a non-PDF document (md/docx/html/txt/image) fails
  // to convert, or while a conversion is in progress.
  const [openStatus, setOpenStatus] = useState<{ kind: 'busy' | 'error'; msg: string } | null>(null);
  // Shown briefly after a non-PDF file is converted to PDF for editing.
  const [convertedNote, setConvertedNote] = useState<string | null>(null);
  const [aiConfig, setAiConfig] = useState<AiConfig>(() => loadAiConfig());
  /** Text + page captured by the Ask-AI region tool, fed to the panel. */
  const [aiSelection, setAiSelection] = useState<{ page: number; text: string } | null>(null);
  const aiOffline = !onAiAsk && !(aiConfig.endpoint && aiConfig.apiKey);
  // ── SDK license (tldraw model: free in dev, badge without a key in prod) ──
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  useEffect(() => {
    configureLicense(licenseKey ?? null);
    let cancelled = false;
    validateLicense().then((info) => { if (!cancelled) setLicense(info); });
    return () => { cancelled = true; };
  }, [licenseKey]);
  // ── OCR (scanned-PDF) state ─────────────────────────────────────────────
  /** Progress while OCR is running, else null. */
  const [ocrStatus, setOcrStatus] = useState<{ done: number; total: number } | null>(null);
  /** True when the doc looks like an image-only scan and hasn't been OCR'd. */
  const [scanned, setScanned] = useState(false);
  /** One-shot confirmation banner after OCR completes. */
  const [ocrMsg, setOcrMsg] = useState<string | null>(null);
  /** Tesseract recognition language for OCR (Tesseract code, e.g. 'eng'). */
  const [ocrLang, setOcrLang] = useState('eng');
  /** True after OCR recovered text on scanned pages — offer to embed it as a
   *  searchable text layer in the saved file. */
  const [ocrEmbedReady, setOcrEmbedReady] = useState(false);
  // True while the user has explicitly closed the password modal — keeps
  // it hidden until they pick another file.
  const [passwordCancelled, setPasswordCancelled] = useState(false);
  // Undo / redo: snapshot the annotations array on every mutation. We
  // keep up to 50 snapshots — plenty for editing without exploding RAM.
  const [history, setHistory] = useState<Annotation[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const setAnnotationsWithHistory = useCallback((next: Annotation[]) => {
    setAnnotations(next);
    setHistory((h) => {
      const truncated = h.slice(0, historyIndex + 1);
      const appended = [...truncated, next];
      return appended.length > 50 ? appended.slice(appended.length - 50) : appended;
    });
    setHistoryIndex((i) => Math.min(i + 1, 49));
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (!canUndo) return;
    const i = historyIndex - 1;
    setHistoryIndex(i);
    setAnnotations(history[i] ?? []);
  }, [canUndo, history, historyIndex]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    const i = historyIndex + 1;
    setHistoryIndex(i);
    setAnnotations(history[i] ?? []);
  }, [canRedo, history, historyIndex]);
  const docIdRef = useRef<string>('untitled');
  // Hold the raw bytes of the currently-being-loaded file so a password
  // retry can re-load without making the user re-pick the file.
  const lastBytesRef = useRef<Uint8Array | null>(null);

  const { prompts, modalNode } = useAnnotationPrompts();

  // Open freshly-generated PDF bytes (from a non-PDF conversion, or the
  // Convert/Optimize tools) in the editor, just like dropping a file — but the
  // source is an in-memory Uint8Array.
  const openGeneratedBytes = useCallback(
    (bytes: Uint8Array, name: string) => {
      docIdRef.current = name || 'document';
      lastBytesRef.current = bytes;
      setPasswordCancelled(false);
      void load(bytes);
    },
    [load],
  );

  // Open a document handed in by the Workspace shell (PDF / converted image).
  const initialLoadedRef = useRef(false);
  useEffect(() => {
    if (initialDoc && !initialLoadedRef.current) {
      initialLoadedRef.current = true;
      openGeneratedBytes(initialDoc.bytes, initialDoc.name);
    }
  }, [initialDoc, openGeneratedBytes]);

  const handleFile = useCallback(
    async (file: File) => {
      docIdRef.current = file.name.replace(/\.[^.]+$/, '') || 'untitled';
      setOpenStatus(null);
      setConvertedNote(null);
      // Non-PDF documents (Markdown, Word, HTML, text, images) are converted
      // to a PDF in-browser, then opened like any other file. fileToPdf
      // returns null for an actual PDF, which falls through to the direct path.
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      if (!isPdf) {
        setOpenStatus({ kind: 'busy', msg: `Converting ${file.name} to PDF…` });
        const noteConverted = () => setConvertedNote(`Converted ${file.name} to PDF for editing. Export it back to Word, Excel, PowerPoint, EPUB, Markdown and more from ✨ Smart Tools → Convert.`);
        try {
          const converted = await fileToPdf(file);
          if (converted) { setOpenStatus(null); noteConverted(); openGeneratedBytes(converted.bytes, converted.name); return; }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg === 'PASSWORD_REQUIRED') {
            const pw = window.prompt(`"${file.name}" is password-protected. Enter its password:`);
            if (pw == null) { setOpenStatus(null); return; }
            try {
              const converted = await fileToPdf(file, pw);
              if (converted) { setOpenStatus(null); noteConverted(); openGeneratedBytes(converted.bytes, converted.name); return; }
            } catch (e2) {
              setOpenStatus({ kind: 'error', msg: `Couldn't open ${file.name}: ${e2 instanceof Error ? e2.message : String(e2)}` });
              return;
            }
          }
          setOpenStatus({ kind: 'error', msg: `Couldn't open ${file.name}: ${msg}` });
          return;
        }
      }
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      lastBytesRef.current = bytes;
      setPasswordCancelled(false);
      setOpenStatus(null);
      await load(bytes);
    },
    [load, openGeneratedBytes],
  );

  const handlePasswordSubmit = useCallback(
    async (password: string) => {
      if (!lastBytesRef.current) return;
      // load() handles its own error/encryptedError state — we just retry.
      await load(lastBytesRef.current, { password });
    },
    [load],
  );

  const handlePasswordCancel = useCallback(() => {
    // Drop the in-flight file. The user can pick another, or re-open
    // the same one and retry.
    lastBytesRef.current = null;
    docIdRef.current = 'untitled';
    // The hook's state stays in 'needs-password' until a new load(). To
    // get back to the idle empty state we trigger a no-op load of zero
    // bytes — which will fail benignly — and the UI guards on state.
    // Simpler: reload the page-level state by letting the existing
    // 'needs-password' state coexist with an "X" close button that just
    // hides the modal. Tracked via local hideCancelledPrompt below.
    setPasswordCancelled(true);
  }, []);

  // ── sync on toggle ──────────────────────────────────────────────────────
  const syncPdfToForm = useCallback(() => {
    if (!doc) return;
    const fromStorage = collectFormStorage(doc);
    for (const [id, value] of Object.entries(fromStorage)) setFieldValue(id, value);
  }, [doc, setFieldValue]);

  const syncFormToPdf = useCallback(async () => {
    if (!doc || !schema) return;
    const values: Record<string, string | boolean | string[]> = {};
    for (const f of schema.fields) {
      if (f.value !== null && f.value !== undefined) values[f.id] = f.value as never;
    }
    await applyValuesToStorage(doc, values);
    setRenderVersion((v) => v + 1);
  }, [doc, schema]);

  const handleModeChange = useCallback(
    async (next: 'pdf' | 'form') => {
      if (next === mode) return;
      if (next === 'form') syncPdfToForm();
      else await syncFormToPdf();
      setMode(next);
    },
    [mode, syncPdfToForm, syncFormToPdf],
  );

  // ── save ────────────────────────────────────────────────────────────────
  const persistAll = useCallback(
    async (pdfBytes: Uint8Array): Promise<void> => {
      const values: Record<string, string | boolean | string[]> = {};
      if (schema) {
        for (const f of schema.fields) {
          if (f.value !== null && f.value !== undefined) values[f.id] = f.value as never;
        }
      }
      const payload: PersistPayload = {
        docId: docIdRef.current,
        pdfBytes,
        values,
        savedAt: new Date().toISOString(),
      };
      persistToLocalStorage(payload);
      await persistToServer(payload, onPersist);
      setLastSavedAt(payload.savedAt);
    },
    [schema, onPersist],
  );

  const materializePdf = useCallback(async (): Promise<Uint8Array | null> => {
    if (!doc) return null;
    if (mode === 'form') await syncFormToPdf();
    else syncPdfToForm();
    const overlays = await annotationsToOverlays(annotations);
    const newFields = annotationsToNewFields(annotations);
    return save({ overlays, newFields });
  }, [doc, save, mode, syncFormToPdf, syncPdfToForm, annotations]);

  const handleSave = useCallback(async () => {
    // Quick required-fields check — non-blocking warning, the user
    // can still save. AcroForm /Ff bit 2 set + value missing.
    if (validateRequiredOnSave && schema) {
      const missing: string[] = [];
      for (const f of schema.fields) {
        if (!f.required) continue;
        const v = f.value;
        const empty =
          v === null || v === undefined ||
          (typeof v === 'string' && v.trim() === '') ||
          (Array.isArray(v) && v.length === 0) ||
          v === false;
        if (empty) missing.push(f.id);
      }
      setMissingRequired(missing);
    }

    setIsSaving(true);
    try {
      const bytes = await materializePdf();
      if (!bytes) return;
      await persistAll(bytes);
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${docIdRef.current}-edited.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsSaving(false);
    }
  }, [materializePdf, persistAll, validateRequiredOnSave, schema]);

  const handlePrint = useCallback(async () => {
    const bytes = await materializePdf();
    if (!bytes) return;
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    // Hidden iframe approach: works in every browser without popup-blocker
    // tripwires. The browser's PDF plugin renders inside the frame, then
    // we trigger its print dialog. We keep the URL alive until after the
    // print dialog closes — Safari notably needs the blob to stay live.
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.src = url;
    document.body.appendChild(frame);
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch (e) {
        console.warn('print failed:', e);
      }
      // Defer cleanup so the print dialog has time to read the blob.
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
        frame.remove();
      }, 30_000);
    };
  }, [materializePdf]);

  const rotateCW = useCallback(() => setRotation((r) => (r + 90) % 360), []);
  const rotateCCW = useCallback(() => setRotation((r) => (r + 270) % 360), []);
  const jumpToPage = useCallback((page: number) => {
    setScrollReq((s) => ({ page, bump: s.bump + 1 }));
  }, []);

  // ── AI handlers ───────────────────────────────────────────────────────────
  // Ask-AI region tool: pull the text under the dragged rect and open the
  // panel scoped to just that part of the document.
  const handleAiRegion = useCallback(
    async (
      page: number,
      rect: { x: number; y: number; width: number; height: number },
      cssW: number,
      cssH: number,
    ) => {
      const text = await pageText.getTextInRect(page, rect, cssW, cssH);
      setAiSelection({ page, text });
      setAiOpen(true);
      setActiveTool('select');
    },
    [pageText],
  );

  // AI-assisted editing inside a text box. Offline, apply a small local
  // transform so the button still does something predictable.
  const handleAiText = useCallback(
    async (text: string, action: AiTextAction): Promise<string> => {
      if (aiOffline) return localTextTransform(text, action);
      const instruction: Record<AiTextAction, string> = {
        rewrite: 'Rewrite the text to read more clearly.',
        fix: 'Fix any spelling and grammar mistakes.',
        shorten: 'Make the text shorter while keeping its meaning.',
        formal: 'Rewrite the text in a professional, formal tone.',
      };
      return askAi({
        messages: [{ role: 'user', content: text }],
        context: '',
        system: `${instruction[action]} Return ONLY the resulting text, with no preamble, quotes, or explanation.`,
        config: aiConfig,
        onAsk: onAiAsk,
      });
    },
    [aiOffline, aiConfig, onAiAsk],
  );

  // Drop an AI-suggested field onto the current page as a draggable
  // new-field annotation; the user repositions it, then saves.
  const handleAddSuggestedField = useCallback(
    (f: FieldSuggestion) => {
      const slot = document.querySelector<HTMLElement>(`[data-page-number="${currentPage}"] .v2-pdf-view__page`);
      const cssW = slot?.firstElementChild?.clientWidth ?? 800;
      const cssH = (slot?.firstElementChild as HTMLElement | null)?.clientHeight ?? 1000;
      const existing = annotations.filter((a) => a.kind === 'new-field' && a.page === currentPage).length;
      const annot: Annotation = {
        id: 'a' + Math.random().toString(36).slice(2, 9),
        page: currentPage,
        pageCssWidth: cssW,
        pageCssHeight: cssH,
        kind: 'new-field',
        x: 60,
        y: 80 + existing * 44,
        width: f.type === 'signature' ? 200 : 220,
        height: f.type === 'multiline' ? 64 : 28,
        fieldType: f.type,
        fieldName: f.name,
        options: f.options,
      };
      setAnnotationsWithHistory([...annotations, annot]);
    },
    [annotations, currentPage, setAnnotationsWithHistory],
  );

  const getDocText = useCallback(() => pageText.getDocText(), [pageText]);

  // Filled AcroForm values for AI grounding — so the model reads what the user
  // entered (Name/PAN/amounts), not just the static labels on the page.
  const getFormValues = useCallback((): Array<{ name: string; value: string }> => {
    if (!schema) return [];
    const out: Array<{ name: string; value: string }> = [];
    for (const f of schema.fields) {
      const v = f.value;
      if (v === null || v === undefined || v === '' || v === false) continue;
      out.push({ name: f.id, value: Array.isArray(v) ? v.join(', ') : String(v) });
    }
    return out;
  }, [schema]);

  // ── Smart Tools wiring ────────────────────────────────────────────────────
  // All pages' runs in scale-1 space — the analysis substrate for every
  // Smart tool. Loaded lazily when a tool first needs it.
  const loadAllRuns = useCallback(async (): Promise<PageRuns[]> => {
    if (!doc) return [];
    const out: PageRuns[] = [];
    for (let p = 1; p <= doc.pageCount; p++) {
      const r = await pageText.getPageRuns(p);
      if (r) out.push({ page: p, ...r });
    }
    return out;
  }, [doc, pageText]);

  // Append generated edits (redactions, fields, replacements) to the document
  // through the same history-tracked annotation path as manual edits.
  const addAnnotations = useCallback(
    (anns: Annotation[]) => {
      if (anns.length) setAnnotationsWithHistory([...annotations, ...anns]);
    },
    [annotations, setAnnotationsWithHistory],
  );

  // Drop a content-tool snippet onto the current page as an editable text
  // annotation. PDFs have no caret, so a snippet inserts its plain-text form at
  // a sensible offset; the user then drags/edits it like any text box.
  const handleInsertSnippet = useCallback(
    (content: InsertContent) => {
      const plain = (content.text ?? content.markdown ?? (content.html ? content.html.replace(/<[^>]+>/g, ' ') : '') ?? '')
        .replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (!plain) return;
      const slot = document.querySelector<HTMLElement>(`[data-page-number="${currentPage}"] .v2-pdf-view__page`);
      const cssW = slot?.firstElementChild?.clientWidth ?? 800;
      const cssH = (slot?.firstElementChild as HTMLElement | null)?.clientHeight ?? 1000;
      const existing = annotations.filter((a) => a.kind === 'text' && a.page === currentPage).length;
      const fontSize = 14;
      const lines = plain.split('\n').length;
      const annot: Annotation = {
        id: 'a' + Math.random().toString(36).slice(2, 9),
        page: currentPage,
        pageCssWidth: cssW,
        pageCssHeight: cssH,
        kind: 'text',
        x: 56,
        y: 72 + (existing % 6) * 30,
        width: 360,
        height: Math.max(28, Math.round(lines * fontSize * 1.4) + 8),
        text: plain,
        fontSize,
        color: '#111111',
      };
      addAnnotations([annot]);
    },
    [annotations, currentPage, addAnnotations],
  );

  // Persist OCR results as an invisible, searchable text layer over the
  // scanned image so the saved PDF has real selectable text on reload.
  const embedOcrTextLayer = useCallback(async () => {
    if (!doc) return;
    const anns: Annotation[] = [];
    for (let p = 1; p <= doc.pageCount; p++) {
      const r = await pageText.getPageRuns(p);
      if (r && r.source === 'ocr') anns.push(...invisibleTextLayer({ page: p, ...r }));
    }
    if (anns.length === 0) {
      setOcrMsg('No OCR text to embed.');
      return;
    }
    addAnnotations(anns);
    setOcrEmbedReady(false);
    setOcrMsg(`Added a searchable text layer (${anns.length} lines). Save to bake it into the PDF — the scan stays visible, the text becomes selectable & searchable.`);
  }, [doc, pageText, addAnnotations]);

  // "Prove it's gone": export the PDF (which physically strips text under
  // redaction boxes), then independently re-extract the saved bytes and verify
  // every redaction region is clean. Never trusts the editor's own word.
  const handleVerifyRedactions = useCallback(async (): Promise<RedactReport> => {
    const boxes = annotations
      .filter((a): a is Annotation & { kind: 'redact' } => a.kind === 'redact')
      .map((a) => ({
        page: a.page, x: a.x, y: a.y, width: a.width, height: a.height,
        pageCssWidth: a.pageCssWidth, pageCssHeight: a.pageCssHeight,
      }));
    const bytes = await materializePdf();
    if (!bytes) return { ok: true, total: 0, cleanCount: 0, regions: [] };
    return verifyRedactions(bytes, boxes);
  }, [annotations, materializePdf]);

  // Page organization export: reorder/delete/rotate the source pages and
  // optionally append other PDFs, then download the result. Standalone
  // export — pending annotations are not burned in (page numbers refer to
  // the original document).
  const handleApplyPageOps = useCallback(
    async (opts: { order: number[]; rotate: Record<number, number>; appendFiles: File[] }): Promise<void> => {
      if (!doc) return;
      const appendPdfBytes: Uint8Array[] = [];
      for (const f of opts.appendFiles) appendPdfBytes.push(new Uint8Array(await f.arrayBuffer()));
      const bytes = await save({ pages: { order: opts.order, rotate: opts.rotate, appendPdfBytes } });
      if (!bytes) return;
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const aEl = document.createElement('a');
      aEl.href = url;
      aEl.download = `${docIdRef.current}-pages.pdf`;
      aEl.click();
      URL.revokeObjectURL(url);
    },
    [doc, save],
  );

  // Write a tagged (PDF/UA-style) copy: structure tree + language + title +
  // the "tagged" marker, via the parser's incremental-update accessibility
  // pass, then download it. Current annotations are included so the tagged
  // copy reflects any pending edits.
  const tagAndSave = useCallback(
    async (opts: { lang: string; title?: string; headings: Array<{ page: number; level: number; text: string }> }): Promise<Uint8Array | null> => {
      if (!doc) return null;
      if (mode === 'form') await syncFormToPdf();
      else syncPdfToForm();
      const overlays = await annotationsToOverlays(annotations);
      const newFields = annotationsToNewFields(annotations);
      const bytes = await save({
        overlays,
        newFields,
        info: opts.title ? { title: opts.title } : {},
        a11y: { lang: opts.lang, headings: opts.headings.map((h) => ({ page: h.page, level: h.level, text: h.text })) },
      });
      if (!bytes) return null;
      await persistAll(bytes);
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${docIdRef.current}-accessible.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      // Returned so the Access tab can independently re-audit the actual
      // exported bytes and produce a certified compliance report.
      return bytes;
    },
    [doc, mode, syncFormToPdf, syncPdfToForm, annotations, save, persistAll],
  );

  // OCR every page that lacks an embedded text layer, populating the shared
  // text cache so Edit-text and Ask-AI work on scans. Pages that already
  // have selectable text are skipped.
  const runOcr = useCallback(async () => {
    if (!doc || ocrStatus) return;
    setOcrLanguage(ocrLang);
    setScanned(false);
    setOcrMsg(null);
    setOcrStatus({ done: 0, total: doc.pageCount });
    let ocrPages = 0;
    let hadText = 0;
    let failed = 0;
    for (let p = 1; p <= doc.pageCount; p++) {
      try {
        const r = await pageText.ocrPage(p);
        if (r.ocr && r.reason !== 'already-ocr') ocrPages++;
        else if (r.reason === 'has-text') hadText++;
      } catch (e) {
        failed++;
        console.warn('OCR failed on page', p, e);
      }
      setOcrStatus({ done: p, total: doc.pageCount });
    }
    setOcrStatus(null);
    setOcrEmbedReady(ocrPages > 0);
    // Distinguish the three outcomes so "nothing happened" is never silent.
    if (ocrPages > 0) {
      setOcrMsg(`OCR complete — recovered text on ${ocrPages} page${ocrPages === 1 ? '' : 's'}. You can now use Edit text and Ask AI on this scan.`);
    } else if (failed > 0 && hadText === 0) {
      setOcrMsg(`OCR failed on ${failed} page${failed === 1 ? '' : 's'} (see the browser console for details).`);
    } else {
      setOcrMsg('Every page already has selectable text — no OCR needed.');
    }
  }, [doc, ocrStatus, pageText, ocrLang]);

  // When the search cursor changes, scroll the current match's page in.
  useEffect(() => {
    const m = search.matches[search.current];
    if (m) jumpToPage(m.page);
  }, [search.current, search.matches, jumpToPage]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      // Don't intercept typing inside form inputs.
      const target = e.target as HTMLElement | null;
      const inEditable =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (e.key === 'Escape' && activeTool !== 'select') {
        e.preventDefault();
        setActiveTool('select');
        return;
      }
      if (mod && e.key.toLowerCase() === 'f' && showSearch) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if (e.key === 'Escape' && searchInputValue) {
        e.preventDefault();
        setSearchInputValue('');
        search.setQuery('');
        return;
      }
      if (inEditable) return;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (showSave) handleSave();
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (mod && (e.shiftKey && e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTool, showSave, handleSave, undo, redo, showSearch, searchInputValue, search]);

  const docReady = state === 'ready' && !!doc && !!schema;
  const pdfMode = mode === 'pdf';

  // Scale the page to fit the viewport width (so it isn't clipped, esp. on phones).
  const fitWidth = useCallback(() => {
    const main = mainRef.current;
    const page = main?.querySelector<HTMLElement>('[data-page-number]');
    if (!main || !page) return;
    const base = page.getBoundingClientRect().width / scale; // unscaled page width
    if (base <= 0) return;
    const target = (main.clientWidth - 24) / base;
    setScale(Math.max(0.25, Math.min(3, Math.round(target * 100) / 100)));
  }, [scale]);

  // Auto fit-to-width the first time a document opens on a small screen.
  useEffect(() => {
    if (!docReady || didFitRef.current) return;
    if (window.innerWidth >= 700) { didFitRef.current = true; return; }
    const t = setTimeout(() => { fitWidth(); didFitRef.current = true; }, 350);
    return () => clearTimeout(t);
  }, [docReady, fitWidth]);

  // When a fresh document looks like an image-only scan, suggest OCR.
  useEffect(() => {
    let cancelled = false;
    setScanned(false);
    setOcrMsg(null);
    if (docReady) {
      pageText.needsOcr().then((b) => { if (!cancelled) setScanned(b); }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [docReady, doc, pageText]);

  return (
    <div className="v2-app">
      <header className="v2-bar">
        <div className="v2-bar__group v2-bar__group--left">
          <span className="v2-bar__brand">Pyntra</span>
          {showOpen && (
          <label className="v2-bar__file" title="Open PDF, Word, PowerPoint, Excel, OpenDocument, RTF, Markdown, HTML, text, or an image">
            <input
              type="file"
              accept={OPENABLE_ACCEPT}
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <span>Open…</span>
          </label>
          )}
          {docIdRef.current !== 'untitled' && state === 'ready' && (
            <span className="v2-bar__filename">{docIdRef.current}.pdf</span>
          )}
        </div>

        {docReady && pdfMode && (
          <div className="v2-bar__group v2-bar__group--center">
            {showThumbnails && (
              <TkxButton variant="ghost" size="sm"
                className={'v2-icon-btn' + (thumbsOpen ? ' v2-icon-btn--active' : '')}
                onClick={() => setThumbsOpen((o) => !o)}
                aria-label="Toggle thumbnails"
                aria-pressed={thumbsOpen}
                title="Page thumbnails"
              >☰</TkxButton>
            )}
            {showOutline && (
              <TkxButton variant="ghost" size="sm"
                className={'v2-icon-btn' + (outlineOpen ? ' v2-icon-btn--active' : '')}
                onClick={() => setOutlineOpen((o) => !o)}
                aria-label="Toggle outline"
                aria-pressed={outlineOpen}
                title="Document outline (bookmarks)"
              >☷</TkxButton>
            )}
            <span className="v2-bar__page">
              Page <strong>{currentPage}</strong> / {doc.pageCount}
            </span>
            <div className="v2-bar__sep" />
            <div className="v2-bar__zoom">
              <TkxButton variant="ghost" size="sm" className="v2-icon-btn" aria-label="Zoom out"
                onClick={() => setScale((s) => Math.max(0.5, Math.round((s - 0.25) * 100) / 100))}>−</TkxButton>
              <span className="v2-bar__zoom-value">{Math.round(scale * 100)}%</span>
              <TkxButton variant="ghost" size="sm" className="v2-icon-btn" aria-label="Zoom in"
                onClick={() => setScale((s) => Math.min(3, Math.round((s + 0.25) * 100) / 100))}>+</TkxButton>
              <TkxButton variant="ghost" size="sm" className="v2-icon-btn" aria-label="Fit page to width" title="Fit to width" onClick={fitWidth}>⤢</TkxButton>
            </div>
            {showRotate && (
              <>
                <div className="v2-bar__sep" />
                <TkxButton variant="ghost" size="sm" className="v2-icon-btn" onClick={rotateCCW}
                  aria-label="Rotate counter-clockwise" title="Rotate left 90°">↺</TkxButton>
                <TkxButton variant="ghost" size="sm" className="v2-icon-btn" onClick={rotateCW}
                  aria-label="Rotate clockwise" title="Rotate right 90°">↻</TkxButton>
              </>
            )}
            {showActionToolbar && (
              <>
                <div className="v2-bar__sep" />
                <ToolPalette kind="pdf" onInsert={handleInsertSnippet} />
              </>
            )}
          </div>
        )}

        <div className="v2-bar__group v2-bar__group--right">
          {showSearch && docReady && (
            <div className="v2-search">
              <input
                ref={searchInputRef}
                type="search"
                className="v2-search__input"
                placeholder="Find in document (Ctrl+F)"
                value={searchInputValue}
                onChange={(e) => {
                  setSearchInputValue(e.target.value);
                  search.setQuery(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (e.shiftKey) search.prev();
                    else search.next();
                  } else if (e.key === 'Escape') {
                    setSearchInputValue('');
                    search.setQuery('');
                  }
                }}
              />
              {searchInputValue && (
                <span className="v2-search__count">
                  {search.busy
                    ? '…'
                    : search.total === 0
                      ? '0'
                      : `${search.current + 1} / ${search.total}`}
                </span>
              )}
              {search.total > 0 && (
                <>
                  <TkxButton variant="ghost" size="sm" className="v2-icon-btn v2-icon-btn--small"
                    onClick={search.prev} aria-label="Previous match" title="Previous (Shift+Enter)">▲</TkxButton>
                  <TkxButton variant="ghost" size="sm" className="v2-icon-btn v2-icon-btn--small"
                    onClick={search.next} aria-label="Next match" title="Next (Enter)">▼</TkxButton>
                </>
              )}
            </div>
          )}
          {showSwitch && (
            <label className="v2-switch" title="Off: edit directly on the PDF. On: edit via a full-page form.">
              <input
                type="checkbox"
                checked={mode === 'form'}
                onChange={(e) => handleModeChange(e.target.checked ? 'form' : 'pdf')}
                disabled={!docReady}
              />
              <span className="v2-switch__track"><span className="v2-switch__thumb" /></span>
              <span className="v2-switch__label">{mode === 'form' ? 'Form' : 'PDF'}</span>
            </label>
          )}
          <TkxButton variant="ghost" size="sm"
            className="v2-icon-btn"
            onClick={undo}
            disabled={!canUndo}
            aria-label="Undo"
            title="Undo (Ctrl/⌘+Z)"
          >↶</TkxButton>
          <TkxButton variant="ghost" size="sm"
            className="v2-icon-btn"
            onClick={redo}
            disabled={!canRedo}
            aria-label="Redo"
            title="Redo (Ctrl/⌘+Shift+Z)"
          >↷</TkxButton>
          {showActionToolbar && (
            <TkxButton variant="ghost" size="sm"
              className={'v2-icon-btn v2-ocr-btn' + (scanned ? ' v2-ocr-btn--suggest' : '')}
              onClick={runOcr}
              disabled={!docReady || !!ocrStatus}
              aria-label="Make scanned text editable (OCR)"
              title="OCR — make a scanned PDF's text editable & searchable"
            >{ocrStatus ? `OCR ${ocrStatus.done}/${ocrStatus.total}` : 'OCR'}</TkxButton>
          )}
          {showAi && (
            <TkxButton variant="ghost" size="sm"
              className={'v2-icon-btn v2-ai-toggle' + (aiOpen ? ' v2-icon-btn--active' : '')}
              onClick={() => setAiOpen((o) => !o)}
              disabled={!docReady}
              aria-label="Ask AI"
              aria-pressed={aiOpen}
              title="Ask AI about this document"
            >✦</TkxButton>
          )}
          {showSmart && (
            <TkxButton variant="ghost" size="sm"
              className={'v2-icon-btn v2-smart-toggle' + (smartOpen ? ' v2-icon-btn--active' : '')}
              onClick={() => setSmartOpen((o) => !o)}
              disabled={!docReady}
              aria-label="Smart tools"
              aria-pressed={smartOpen}
              title="Smart tools — redact PII, extract tables, outline, sign, read aloud, accessibility"
            >✨</TkxButton>
          )}
          {showHelp && (
            <TkxButton variant="ghost" size="sm" className="v2-icon-btn" onClick={() => setHelpOpen(true)} aria-label="Help" title="Help">?</TkxButton>
          )}
          {showPrint && (
            <TkxButton variant="ghost" size="sm"
              className="v2-icon-btn"
              onClick={handlePrint}
              disabled={!docReady}
              aria-label="Print"
              title="Print"
            >⎙</TkxButton>
          )}
          {showSave && (
            <TkxButton
              variant="solid"
              colorScheme="primary"
              size="sm"
              className="v2-bar__save"
              isLoading={isSaving}
              loadingText="Saving…"
              onClick={handleSave}
              disabled={!docReady}
              title="Save (Ctrl/⌘+S)"
            >Save</TkxButton>
          )}
        </div>
      </header>

      {convertedNote && (
        <div className="v2-convert-note" role="status">
          <span>📄 {convertedNote}</span>
          <TkxButton variant="ghost" size="sm" className="v2-convert-note__close" onClick={() => setConvertedNote(null)} aria-label="Dismiss">×</TkxButton>
        </div>
      )}

      <main className="v2-main" ref={mainRef}>
        {state === 'idle' && !openStatus && (
          <div className="v2-empty">
            <p className="v2-empty__title">Open a document to begin.</p>
            <p className="v2-empty__hint">
              PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), CSV, Markdown, HTML, text, or an
              image (PNG/JPEG/WEBP/GIF/BMP/SVG/TIFF) — anything but PDF is converted to PDF in your
              browser, then edited like any other file.
            </p>
          </div>
        )}
        {openStatus?.kind === 'busy' && <div className="v2-empty">{openStatus.msg}</div>}
        {openStatus?.kind === 'error' && <div className="v2-empty v2-empty--error">{openStatus.msg}</div>}
        {state === 'loading' && !openStatus && <div className="v2-empty">Loading…</div>}
        {state === 'error' && !openStatus && (
          <div className="v2-empty v2-empty--error">
            <p className="v2-empty__title">This file couldn’t be opened — it may be damaged or not a real PDF.</p>
            <p className="v2-empty__hint">Try re-downloading it, or re-saving it from the app that made it, then open it again.{error?.message ? ` (Technical detail: ${error.message})` : ''}</p>
          </div>
        )}
        {state === 'needs-password' && passwordCancelled && (
          <div className="v2-empty">
            <p className="v2-empty__title">This PDF is password-protected.</p>
            <p className="v2-empty__hint">
              Re-open the file to try again, or pick another PDF.
            </p>
          </div>
        )}

        {docReady && pdfMode && showActionToolbar && (
          <>
            <ActionToolbar active={activeTool} onSelect={setActiveTool} enabled={enabledTools} />
            {activeTool === 'add-fields' && (
              <FieldTypePicker active={newFieldKind} onSelect={setNewFieldKind} />
            )}
            {activeTool !== 'select' && (
              <div className="v2-tool-hint" role="status">
                <strong>
                  {activeTool.split('-').map((s) => s[0]!.toUpperCase() + s.slice(1)).join(' ')}
                </strong>
                <span>{TOOL_HINTS[activeTool]}</span>
                <TkxButton variant="ghost" size="sm" className="v2-tool-hint__done" onClick={() => setActiveTool('select')}>
                  Done
                </TkxButton>
              </div>
            )}
          </>
        )}

        {docReady && (
          <div className={'v2-stage' + (pdfMode && (thumbsOpen || outlineOpen) ? ' v2-stage--with-sidebar' : '')}>
            {pdfMode && outlineOpen && (
              <OutlineSidebar doc={doc} onSelectPage={jumpToPage} />
            )}
            {pdfMode && thumbsOpen && (
              <Thumbnails
                doc={doc}
                currentPage={currentPage}
                onSelectPage={jumpToPage}
              />
            )}
            {pdfMode ? (
              <PdfView
                doc={doc}
                scale={scale}
                rotation={rotation}
                scrollRequest={scrollReq}
                onCurrentPageChange={setCurrentPage}
                searchMatches={search.matches}
                searchCurrentIndex={search.current}
                formOverlayOpen={false}
                renderVersion={renderVersion}
                annotations={annotations}
                onAnnotationsChange={setAnnotationsWithHistory}
                activeTool={activeTool}
                newFieldKind={newFieldKind}
                onPromptStamp={prompts.onPromptStamp}
                onPromptHyperlink={prompts.onPromptHyperlink}
                onPromptSign={prompts.onPromptSign}
                onPromptImage={prompts.onPromptImage}
                onPromptFieldName={prompts.onPromptFieldName}
                resolveEditText={pageText.getHitAt}
                onAiRegion={handleAiRegion}
                onAiText={showAi ? handleAiText : undefined}
              />
            ) : (
              <FullPageForm schema={schema!} setFieldValue={setFieldValue} onSave={handleSave} adapter={formAdapter} />
            )}
          </div>
        )}
        {missingRequired.length > 0 && (
          <div className="v2-validation-banner" role="alert">
            <strong>{missingRequired.length}</strong> required field
            {missingRequired.length === 1 ? '' : 's'} empty:{' '}
            {missingRequired.slice(0, 6).map((name, i) => (
              <TkxButton variant="ghost" size="sm"
                key={name}
                type="button"
                className="v2-validation-banner__field"
                onClick={() => {
                  // Switch to form view + scroll to it via DOM id.
                  if (mode !== 'form') handleModeChange('form');
                  window.setTimeout(() => {
                    const el = document.getElementById(name);
                    if (el) {
                      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                      el.focus();
                    }
                  }, 60);
                }}
              >{name}{i < Math.min(missingRequired.length, 6) - 1 ? ',' : ''}</TkxButton>
            ))}
            {missingRequired.length > 6 && (
              <span> + {missingRequired.length - 6} more</span>
            )}
            <TkxButton variant="ghost" size="sm"
              className="v2-validation-banner__dismiss"
              onClick={() => setMissingRequired([])}
              aria-label="Dismiss"
            >×</TkxButton>
          </div>
        )}
        {scanned && !ocrStatus && (
          <div className="v2-ocr-banner" role="status">
            <span>📄 This looks like a scanned PDF — its text isn't selectable. Run OCR to make it editable and AI-readable.</span>
            <select
              className="v2-ocr-banner__lang"
              value={ocrLang}
              onChange={(e) => setOcrLang(e.target.value)}
              aria-label="OCR language"
              title="Recognition language"
            >
              {OCR_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            <TkxButton variant="solid" colorScheme="primary" size="sm" className="v2-ocr-banner__run" onClick={runOcr}>Run OCR</TkxButton>
            <TkxButton variant="ghost" size="sm" className="v2-ocr-banner__dismiss" onClick={() => setScanned(false)} aria-label="Dismiss">×</TkxButton>
          </div>
        )}
        {ocrStatus && (
          <div className="v2-toast">
            Running OCR… page {ocrStatus.done} / {ocrStatus.total}
            {ocrStatus.done === 0 ? ' (first run downloads the language model)' : ''}
          </div>
        )}
        {ocrMsg && (
          <div className="v2-toast v2-toast--ocr">
            <span onClick={() => setOcrMsg(null)}>{ocrMsg}</span>
            {ocrEmbedReady && (
              <TkxButton variant="solid" colorScheme="primary" size="sm" className="v2-ocr-banner__run" onClick={embedOcrTextLayer}>
                Embed searchable text layer
              </TkxButton>
            )}
          </div>
        )}
        {lastSavedAt && (
          <div className="v2-toast">
            Saved at {new Date(lastSavedAt).toLocaleTimeString()} (localStorage{onPersist ? ' + server' : ''})
          </div>
        )}
      </main>

      {license && shouldShowBadge(license) && (
        <a
          className="v2-license-badge"
          href="https://pyntra.tekivex.com"
          target="_blank"
          rel="noreferrer"
          title={license.reason ?? 'Production use requires an SDK license.'}
        >Built with Pyntra</a>
      )}
      {modalNode}
      <PasswordPrompt
        open={state === 'needs-password' && !passwordCancelled}
        retry={!!encryptedError?.wasAttempted}
        onSubmit={handlePasswordSubmit}
        onCancel={handlePasswordCancel}
      />
      {showHelp && <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />}
      {showAi && docReady && (
        <AiPanel
          open={aiOpen}
          onClose={() => setAiOpen(false)}
          config={aiConfig}
          onConfigChange={setAiConfig}
          onAsk={onAiAsk}
          getDocText={getDocText}
          getFormValues={getFormValues}
          selection={aiSelection}
          onClearSelection={() => setAiSelection(null)}
          onAddSuggestedField={handleAddSuggestedField}
        />
      )}
      {showSmart && docReady && (
        <SmartPanel
          open={smartOpen}
          onClose={() => setSmartOpen(false)}
          loadAllRuns={loadAllRuns}
          getMeta={pageText.getMeta}
          onAddAnnotations={addAnnotations}
          onJumpToPage={jumpToPage}
          onRunOcr={runOcr}
          onTagAccessible={tagAndSave}
          onVerifyRedactions={handleVerifyRedactions}
          getDocBytes={() => doc.sourceBytes}
          getCurrentPdfBytes={materializePdf}
          onOpenBytes={openGeneratedBytes}
          docName={docIdRef.current}
          pageCount={doc.pageCount}
          onApplyPageOps={handleApplyPageOps}
          aiConfig={aiConfig}
          onAsk={onAiAsk}
          aiOffline={aiOffline}
        />
      )}
    </div>
  );
}

/** Offline text transforms for the in-box ✨ control. Deliberately tiny —
 *  real rewriting needs a model; this keeps the button honest with no key. */
function localTextTransform(text: string, action: AiTextAction): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  switch (action) {
    case 'fix': {
      const capped = collapsed.charAt(0).toUpperCase() + collapsed.slice(1);
      return /[.!?]$/.test(capped) ? capped : capped + '.';
    }
    case 'shorten': {
      const firstSentence = collapsed.split(/(?<=[.!?])\s/)[0] ?? collapsed;
      return firstSentence.length < collapsed.length ? firstSentence : collapsed.slice(0, Math.ceil(collapsed.length / 2)).trim() + '…';
    }
    case 'formal':
    case 'rewrite':
    default:
      // Can't truly rewrite offline; return the cleaned-up text unchanged.
      return collapsed;
  }
}
