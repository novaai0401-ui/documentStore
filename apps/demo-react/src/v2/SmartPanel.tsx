/**
 * Smart Tools — a slide-over hub for the "no other web PDF tool does this"
 * features. Each tab is a thin UI over a pure engine module in ./smart:
 *
 *   • Redact PII   — scan text/OCR for sensitive data → real redactions
 *   • Tables       — geometric table detection → CSV / JSON export
 *   • Outline      — heading detection → clickable table of contents
 *   • Sign         — propose signature/date fields next to cues
 *   • Read aloud   — Web Speech TTS with karaoke highlight
 *   • Access       — accessibility audit (text layer, title, language)
 *
 * All analysis runs on the page-run bundles handed in via `loadAllRuns`
 * (scale-1 space), and anything that edits the document does so by appending
 * annotations through `onAddAnnotations` — the same incremental-update path
 * as every other edit, so the source PDF is never mutated.
 */
import { useEffect, useRef, useState } from 'react';
import { TkxButton, TkxInput, TkxSelect, TkxSlider, TkxCheckbox, TkxFileUpload } from 'tekivex-ui';
import type { Annotation } from './Annotations.js';
import type { PageRuns } from './smart/util.js';
import { downloadText, downloadBytes, makeId, watermarkAnnotations, pageNumberAnnotations } from './smart/util.js';
import { pdfRunsToText, pdfRunsToMarkdown, runsToDocx, sheetsToXlsx, pagesToSheetRows, pagesToSlides, tablesToCombinedCsv, runsToEpub, imagesToPdf, textToPdf, markdownToPdf, htmlToPdf, pdfToImages, fileToPdf, toEmbeddableImage, OPENABLE_ACCEPT, type ImageInput, type DocxImage } from './smart/convert.js';
import { pagesToPptx } from './smart/pptxExport.js';
import { compressPdf, flattenPdf, extractImages } from './smart/optimize.js';
import { pdfToPdfA } from './smart/pdfa.js';
import { zipStore } from './smart/zip.js';
import type { RedactReport } from './smart/redactVerify.js';
import { auditPdfBytes, renderReportHtml, type A11yComplianceReport } from './smart/a11yReport.js';
import { scanPii, piiToRedactions, PII_LABELS, type PiiType, type PiiMatch } from './smart/pii.js';
import { extractTables, tableToCsv, tableToJson, type ExtractedTable } from './smart/tables.js';
import { detectHeadings, type HeadingEntry } from './smart/headings.js';
import { suggestSignatureFields, type SignatureSuggestion } from './smart/signature.js';
import {
  createReadAloud,
  listVoices,
  ttsSupported,
  type ReadAloudController,
} from './smart/readAloud.js';
import { parseCommandOffline, parseCommandWithAi, planOps, type AgentPlan } from './smart/agentic.js';
import {
  planTranslation,
  aiTranslator,
  onDeviceTranslator,
  onDeviceTranslationSupported,
  LANGUAGES,
  type TranslateChange,
} from './smart/translate.js';
import { extractFileLines, diffLines, diffStats, explainDiff, type DiffEntry } from './smart/compare.js';
import { visualDiff, renderPageDataUrl, type VisualDiffResult } from './smart/visualDiff.js';
import type { AiConfig, HostAskHook } from './ai/aiClient.js';

type TabId = 'agent' | 'pages' | 'marks' | 'convert' | 'optimize' | 'redact' | 'translate' | 'tables' | 'outline' | 'sign' | 'compare' | 'speak' | 'a11y';

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'agent', label: 'AI Edit', icon: '🪄' },
  { id: 'pages', label: 'Pages', icon: '📄' },
  { id: 'convert', label: 'Convert', icon: '🔄' },
  { id: 'optimize', label: 'Optimize', icon: '🗜️' },
  { id: 'marks', label: 'Watermark', icon: '🏷️' },
  { id: 'redact', label: 'Redact PII', icon: '🛡️' },
  { id: 'translate', label: 'Translate', icon: '🌐' },
  { id: 'tables', label: 'Tables', icon: '▦' },
  { id: 'outline', label: 'Outline', icon: '❡' },
  { id: 'sign', label: 'Sign', icon: '✍️' },
  { id: 'compare', label: 'Compare', icon: '⇆' },
  { id: 'speak', label: 'Read aloud', icon: '🔊' },
  { id: 'a11y', label: 'Access', icon: '♿' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  /** All pages' runs in scale-1 space (lazy — computed on first use). */
  loadAllRuns: () => Promise<PageRuns[]>;
  getMeta: () => Promise<{ title: string | null; language: string | null }>;
  /** Append generated edits (redactions, new fields) to the document. */
  onAddAnnotations: (anns: Annotation[]) => void;
  onJumpToPage: (page: number) => void;
  /** Kick the existing OCR pass (offered by the a11y audit). */
  onRunOcr: () => void;
  /** Write a tagged (PDF/UA-style) copy: structure tree + metadata, then
   *  download. Returns the exported bytes so the Access tab can re-audit
   *  the actual output and certify it. */
  onTagAccessible: (opts: { lang: string; title?: string; headings: HeadingEntry[] }) => Promise<Uint8Array | null>;
  /** Export + independently verify that redaction regions contain no
   *  recoverable text ("Prove it's gone"). */
  onVerifyRedactions: () => Promise<RedactReport>;
  /** Current document bytes (compliance audit input) + display name. */
  getDocBytes: () => Uint8Array | null;
  /** Materialize the current document *with pending edits* burned in — the
   *  input for Convert/Optimize so exports reflect what the user sees. */
  getCurrentPdfBytes: () => Promise<Uint8Array | null>;
  /** Open freshly-generated PDF bytes in the editor (Convert/Optimize "Open"). */
  onOpenBytes: (bytes: Uint8Array, name: string) => void;
  docName: string;
  /** Page count of the open document (for the Pages organizer). */
  pageCount: number;
  /** Apply page organization (reorder/delete/rotate/append) and download. */
  onApplyPageOps: (opts: { order: number[]; rotate: Record<number, number>; appendFiles: File[] }) => Promise<void>;
  /** AI plumbing for the model-backed tabs (AI Edit, Translate, Compare). */
  aiConfig: AiConfig;
  onAsk?: HostAskHook;
  aiOffline: boolean;
}

export function SmartPanel({
  open,
  onClose,
  loadAllRuns,
  getMeta,
  onAddAnnotations,
  onJumpToPage,
  onRunOcr,
  onTagAccessible,
  onVerifyRedactions,
  getDocBytes,
  getCurrentPdfBytes,
  onOpenBytes,
  docName,
  pageCount,
  onApplyPageOps,
  aiConfig,
  onAsk,
  aiOffline,
}: Props) {
  const [tab, setTab] = useState<TabId>('agent');
  /** Panel chrome: normal sidebar, minimized pill, or maximized workspace. */
  const [view, setView] = useState<'normal' | 'min' | 'max'>('normal');
  const [pages, setPages] = useState<PageRuns[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 6000);
  };

  // Lazily load (and cache) the run bundles the first time the panel opens.
  // Errors are surfaced (not swallowed) so a failing tool never just "does
  // nothing"; an empty document is called out so the user can run OCR.
  const ensurePages = async (): Promise<PageRuns[]> => {
    if (pages) return pages;
    setLoading(true);
    try {
      const p = await loadAllRuns();
      setPages(p);
      const chars = p.reduce((n, pg) => n + pg.runs.reduce((m, r) => m + r.text.length, 0), 0);
      if (chars === 0) {
        flash('No selectable text found on any page. If this is a scan, run OCR first (top bar), then retry.');
      }
      return p;
    } catch (e) {
      flash('Could not read the document: ' + (e instanceof Error ? e.message : String(e)));
      return [];
    } finally {
      setLoading(false);
    }
  };

  // Reset cached analysis when the panel is closed so a new doc re-scans.
  useEffect(() => {
    if (!open) setPages(null);
  }, [open]);

  if (!open) return null;

  if (view === 'min') {
    return (
      <TkxButton className="v2-panel-pill v2-panel-pill--left" variant="ghost" size="sm" onClick={() => setView('normal')} aria-label="Restore Smart Tools">
        ✨ Smart Tools
      </TkxButton>
    );
  }

  return (
    <aside className={'v2-smart' + (view === 'max' ? ' v2-smart--max' : '')} aria-label="Smart tools">
      <header className="v2-smart__head">
        <strong className="v2-smart__title">✨ Smart Tools</strong>
        <div className="v2-panel-actions">
          <TkxButton className="v2-icon-btn v2-icon-btn--small" variant="ghost" size="sm" onClick={() => setView('min')} aria-label="Minimize" title="Minimize">—</TkxButton>
          <TkxButton
            className="v2-icon-btn v2-icon-btn--small" variant="ghost" size="sm"
            onClick={() => setView((v) => (v === 'max' ? 'normal' : 'max'))}
            aria-label={view === 'max' ? 'Restore size' : 'Maximize'}
            title={view === 'max' ? 'Restore' : 'Maximize'}
          >{view === 'max' ? '❐' : '⛶'}</TkxButton>
          <TkxButton className="v2-icon-btn v2-icon-btn--small" variant="ghost" size="sm" onClick={onClose} aria-label="Close smart tools">×</TkxButton>
        </div>
      </header>

      <nav className="v2-smart__tabs" role="tablist">
        {TABS.map((t) => (
          <TkxButton
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={'v2-smart__tab' + (tab === t.id ? ' v2-smart__tab--active' : '')}
            onClick={() => setTab(t.id)}
          >
            <span className="v2-smart__tab-icon" aria-hidden>{t.icon}</span>
            <span>{t.label}</span>
          </TkxButton>
        ))}
      </nav>

      <div className="v2-smart__body">
        {loading && <div className="v2-smart__loading">Reading document…</div>}
        {tab === 'agent' && <AgentTab ensurePages={ensurePages} onAddAnnotations={onAddAnnotations} aiConfig={aiConfig} onAsk={onAsk} aiOffline={aiOffline} flash={flash} />}
        {tab === 'translate' && <TranslateTab ensurePages={ensurePages} onAddAnnotations={onAddAnnotations} aiConfig={aiConfig} onAsk={onAsk} aiOffline={aiOffline} flash={flash} />}
        {tab === 'compare' && <CompareTab ensurePages={ensurePages} getDocBytes={getDocBytes} aiConfig={aiConfig} onAsk={onAsk} aiOffline={aiOffline} />}
        {tab === 'pages' && <PagesTab pageCount={pageCount} onApply={onApplyPageOps} flash={flash} />}
        {tab === 'convert' && <ConvertTab ensurePages={ensurePages} getCurrentPdfBytes={getCurrentPdfBytes} onOpenBytes={onOpenBytes} docName={docName} flash={flash} />}
        {tab === 'optimize' && <OptimizeTab getCurrentPdfBytes={getCurrentPdfBytes} onOpenBytes={onOpenBytes} docName={docName} flash={flash} />}
        {tab === 'marks' && <MarksTab ensurePages={ensurePages} onAddAnnotations={onAddAnnotations} onJumpToPage={onJumpToPage} flash={flash} />}
        {tab === 'redact' && <RedactTab ensurePages={ensurePages} onAddAnnotations={onAddAnnotations} onVerifyRedactions={onVerifyRedactions} flash={flash} />}
        {tab === 'tables' && <TablesTab ensurePages={ensurePages} flash={flash} />}
        {tab === 'outline' && <OutlineTab ensurePages={ensurePages} onJumpToPage={onJumpToPage} />}
        {tab === 'sign' && <SignTab ensurePages={ensurePages} onAddAnnotations={onAddAnnotations} onJumpToPage={onJumpToPage} flash={flash} />}
        {tab === 'speak' && <SpeakTab ensurePages={ensurePages} onJumpToPage={onJumpToPage} flash={flash} />}
        {tab === 'a11y' && <A11yTab ensurePages={ensurePages} getMeta={getMeta} onRunOcr={onRunOcr} onTagAccessible={onTagAccessible} getDocBytes={getDocBytes} docName={docName} flash={flash} />}
      </div>

      {toast && <div className="v2-smart__toast" onClick={() => setToast(null)}>{toast}</div>}
    </aside>
  );
}

// ── Redact PII ────────────────────────────────────────────────────────────────

const ALL_TYPES: PiiType[] = ['email', 'ssn', 'phone', 'credit-card', 'iban', 'ip', 'date'];

function RedactTab({
  ensurePages,
  onAddAnnotations,
  onVerifyRedactions,
  flash,
}: {
  ensurePages: () => Promise<PageRuns[]>;
  onAddAnnotations: (a: Annotation[]) => void;
  onVerifyRedactions: () => Promise<RedactReport>;
  flash: (m: string) => void;
}) {
  // Dates default off — usually not sensitive.
  const [types, setTypes] = useState<Set<PiiType>>(new Set(['email', 'ssn', 'phone', 'credit-card', 'iban', 'ip']));
  const [matches, setMatches] = useState<PiiMatch[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [report, setReport] = useState<RedactReport | null>(null);
  const [verifying, setVerifying] = useState(false);
  const pagesRef = useRef<PageRuns[]>([]);

  const verify = async () => {
    setVerifying(true);
    setReport(null);
    try {
      const r = await onVerifyRedactions();
      setReport(r);
      if (r.total === 0) flash('No redaction boxes to verify yet — scan & redact first, or use the Redact tool.');
    } catch (e) {
      flash('Verification failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setVerifying(false);
    }
  };

  const scan = async () => {
    const pages = await ensurePages();
    pagesRef.current = pages;
    const found = scanPii(pages, types);
    setMatches(found);
    setSelected(new Set(found.map((_, i) => i)));
  };

  const apply = () => {
    if (!matches) return;
    const anns = piiToRedactions(pagesRef.current, matches, selected);
    if (anns.length === 0) {
      flash('No matches selected.');
      return;
    }
    onAddAnnotations(anns);
    flash(`Added ${anns.length} redaction${anns.length === 1 ? '' : 's'}. Review on the page, then Save to burn them in.`);
    setMatches(null);
  };

  // One click: scan with the enabled types and redact everything found.
  const redactAll = async () => {
    const pages = await ensurePages();
    pagesRef.current = pages;
    const found = scanPii(pages, types);
    if (found.length === 0) { setMatches([]); setSelected(new Set()); flash('No sensitive data found for the selected types.'); return; }
    const anns = piiToRedactions(pages, found);
    onAddAnnotations(anns);
    setMatches(null);
    flash(`Found and redacted ${anns.length} item${anns.length === 1 ? '' : 's'}. Review on the page, then Save to burn them in.`);
  };

  return (
    <div className="v2-smart__pane">
      <p className="v2-smart__lead">Find sensitive data and black it out for real — on Save the covered text is removed from the file, not just hidden.</p>
      <div className="v2-smart__checks">
        {ALL_TYPES.map((t) => (
          <label key={t} className="v2-smart__check">
            <TkxCheckbox
              size="sm"
              checked={types.has(t)}
              onChange={(e) => {
                const next = new Set(types);
                if (e.target.checked) next.add(t);
                else next.delete(t);
                setTypes(next);
              }}
            />
            <span>{PII_LABELS[t]}</span>
          </label>
        ))}
      </div>
      <div className="v2-smart__redact-actions">
        <TkxButton className="v2-smart__btn" variant="solid" colorScheme="primary" size="sm" onClick={() => void redactAll()} disabled={types.size === 0} title="Scan and black out every match in one step">⚡ Find &amp; redact all</TkxButton>
        <TkxButton className="v2-smart__btn" variant="outline" size="sm" onClick={scan} disabled={types.size === 0} title="Scan and review matches before redacting">Scan &amp; review…</TkxButton>
      </div>

      {matches && (
        <>
          <div className="v2-smart__result-head">
            {matches.length} match{matches.length === 1 ? '' : 'es'} found
            {matches.length > 0 && (
              <TkxButton className="v2-smart__link" variant="link" size="sm" onClick={() => setSelected(new Set(selected.size === matches.length ? [] : matches.map((_, i) => i)))}>
                {selected.size === matches.length ? 'Deselect all' : 'Select all'}
              </TkxButton>
            )}
          </div>
          <ul className="v2-smart__list">
            {matches.map((m, i) => (
              <li key={i} className="v2-smart__list-row">
                <label className="v2-smart__check">
                  <TkxCheckbox
                    size="sm"
                    checked={selected.has(i)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(i);
                      else next.delete(i);
                      setSelected(next);
                    }}
                  />
                  <span className="v2-smart__pii-type">{m.type}</span>
                  <span className="v2-smart__pii-val">{m.value}</span>
                  <span className="v2-smart__pii-page">p.{m.page}</span>
                </label>
              </li>
            ))}
          </ul>
          {matches.length > 0 && (
            <TkxButton className="v2-smart__btn" variant="solid" colorScheme="primary" size="sm" onClick={apply}>
              Redact {selected.size} selected
            </TkxButton>
          )}
        </>
      )}

      <div className="v2-smart__verify-box">
        <strong>Prove it's gone 🔒</strong>
        <p className="v2-smart__note">Exports the redacted PDF and independently re-reads it to confirm no text survives under any black box — the check the DOJ's Epstein files (Dec 2025) and the Manafort filing (2019) failed.</p>
        <TkxButton className="v2-smart__btn" variant="outline" size="sm" onClick={verify} disabled={verifying}>
          {verifying ? 'Verifying…' : 'Verify redaction'}
        </TkxButton>
        {report && report.total > 0 && (
          <div className={'v2-smart__verify ' + (report.ok ? 'v2-smart__verify--ok' : 'v2-smart__verify--fail')}>
            <div className="v2-smart__verify-head">
              {report.ok
                ? `✓ Certified clean — ${report.total} region${report.total === 1 ? '' : 's'}, no recoverable text.`
                : `✕ FAILED — ${report.total - report.cleanCount} of ${report.total} region${report.total === 1 ? '' : 's'} still contain recoverable text. Do NOT distribute.`}
            </div>
            {!report.ok && (
              <ul className="v2-smart__list">
                {report.regions.filter((r) => !r.clean).slice(0, 8).map((r, i) => (
                  <li key={i} className="v2-smart__list-row">
                    <span className="v2-smart__pii-page">p.{r.page}</span>
                    <span className="v2-smart__pii-val">leaked: “{r.leaked.slice(0, 60)}”</span>
                  </li>
                ))}
              </ul>
            )}
            {report.ok && report.certificate && (
              <TkxButton className="v2-smart__link" variant="link" size="sm" onClick={() => downloadText('redaction-certificate.txt', report.certificate!)}>
                Download certificate
              </TkxButton>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tables ──────────────────────────────────────────────────────────────────

function TablesTab({ ensurePages, flash }: { ensurePages: () => Promise<PageRuns[]>; flash: (m: string) => void }) {
  const [tables, setTables] = useState<ExtractedTable[] | null>(null);

  const detect = async () => {
    const pages = await ensurePages();
    const found = pages.flatMap((p) => extractTables(p));
    setTables(found);
  };

  return (
    <div className="v2-smart__pane">
      <p className="v2-smart__lead">Turn tables in the PDF into usable data. Works best on tables with clearly separated columns.</p>
      <TkxButton className="v2-smart__btn" variant="outline" size="sm" onClick={detect}>Detect tables</TkxButton>
      {tables && tables.length === 0 && <p className="v2-smart__empty">No clearly tabular regions found.</p>}
      {tables?.map((t, i) => (
        <div key={i} className="v2-smart__table-card">
          <div className="v2-smart__table-head">
            <span>Page {t.page} · {t.rows.length}×{t.rows[0]?.length ?? 0}</span>
            <span className="v2-smart__conf">{Math.round(t.confidence * 100)}% confident</span>
          </div>
          <div className="v2-smart__table-scroll">
            <table className="v2-smart__table">
              <tbody>
                {t.rows.slice(0, 8).map((row, r) => (
                  <tr key={r}>{row.map((c, ci) => <td key={ci}>{c}</td>)}</tr>
                ))}
              </tbody>
            </table>
            {t.rows.length > 8 && <div className="v2-smart__table-more">+{t.rows.length - 8} more rows</div>}
          </div>
          <div className="v2-smart__row-actions">
            <TkxButton className="v2-smart__link" variant="link" size="sm" onClick={() => { navigator.clipboard?.writeText(tableToCsv(t)); flash('CSV copied to clipboard.'); }}>Copy CSV</TkxButton>
            <TkxButton className="v2-smart__link" variant="link" size="sm" onClick={() => downloadText(`table-p${t.page}.csv`, tableToCsv(t), 'text/csv')}>Download CSV</TkxButton>
            <TkxButton className="v2-smart__link" variant="link" size="sm" onClick={() => downloadText(`table-p${t.page}.json`, tableToJson(t), 'application/json')}>Download JSON</TkxButton>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Outline ───────────────────────────────────────────────────────────────────

function OutlineTab({ ensurePages, onJumpToPage }: { ensurePages: () => Promise<PageRuns[]>; onJumpToPage: (p: number) => void }) {
  const [headings, setHeadings] = useState<HeadingEntry[] | null>(null);

  const generate = async () => {
    const pages = await ensurePages();
    setHeadings(detectHeadings(pages));
  };

  return (
    <div className="v2-smart__pane">
      <p className="v2-smart__lead">Build a clickable table of contents from the document's headings — even if it has no bookmarks.</p>
      <TkxButton className="v2-smart__btn" variant="outline" size="sm" onClick={generate}>Generate outline</TkxButton>
      {headings && headings.length === 0 && <p className="v2-smart__empty">No clear headings detected.</p>}
      {headings && headings.length > 0 && (
        <ul className="v2-smart__toc">
          {headings.map((h, i) => (
            <li key={i} style={{ paddingLeft: (h.level - 1) * 14 }}>
              <TkxButton className="v2-smart__toc-item" variant="ghost" size="sm" onClick={() => onJumpToPage(h.page)}>
                <span className="v2-smart__toc-text">{h.text}</span>
                <span className="v2-smart__toc-page">{h.page}</span>
              </TkxButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Sign ──────────────────────────────────────────────────────────────────────

function SignTab({
  ensurePages,
  onAddAnnotations,
  onJumpToPage,
  flash,
}: {
  ensurePages: () => Promise<PageRuns[]>;
  onAddAnnotations: (a: Annotation[]) => void;
  onJumpToPage: (p: number) => void;
  flash: (m: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<SignatureSuggestion[] | null>(null);
  const pagesRef = useRef<PageRuns[]>([]);

  const find = async () => {
    const pages = await ensurePages();
    pagesRef.current = pages;
    setSuggestions(suggestSignatureFields(pages));
  };

  const toAnnotation = (s: SignatureSuggestion): Annotation | null => {
    const page = pagesRef.current.find((p) => p.page === s.page);
    if (!page) return null;
    return {
      id: makeId(),
      page: s.page,
      pageCssWidth: page.vpWidth,
      pageCssHeight: page.vpHeight,
      kind: 'new-field',
      x: s.x,
      y: s.y,
      width: s.width,
      height: s.height,
      fieldType: s.fieldType,
      fieldName: s.name,
    };
  };

  const addOne = (s: SignatureSuggestion) => {
    const a = toAnnotation(s);
    if (a) {
      onAddAnnotations([a]);
      onJumpToPage(s.page);
      flash(`Added ${s.fieldType} field on page ${s.page}. Drag to fine-tune, then Save.`);
    }
  };

  const addAll = () => {
    if (!suggestions) return;
    const anns = suggestions.map(toAnnotation).filter((a): a is Annotation => a !== null);
    if (anns.length) {
      onAddAnnotations(anns);
      flash(`Added ${anns.length} fillable field${anns.length === 1 ? '' : 's'}.`);
      setSuggestions(null);
    }
  };

  return (
    <div className="v2-smart__pane">
      <p className="v2-smart__lead">Spot where signatures and dates belong and drop fillable fields there.</p>
      <TkxButton className="v2-smart__btn" variant="outline" size="sm" onClick={find}>Find signature spots</TkxButton>
      {suggestions && suggestions.length === 0 && <p className="v2-smart__empty">No signature/date cues found.</p>}
      {suggestions && suggestions.length > 0 && (
        <>
          <TkxButton className="v2-smart__link" variant="link" size="sm" onClick={addAll}>Add all {suggestions.length}</TkxButton>
          <ul className="v2-smart__list">
            {suggestions.map((s, i) => (
              <li key={i} className="v2-smart__list-row">
                <span className="v2-smart__pii-type">{s.fieldType}</span>
                <span className="v2-smart__pii-val">“{s.cue}”</span>
                <span className="v2-smart__pii-page">p.{s.page}</span>
                <TkxButton className="v2-icon-btn v2-icon-btn--small" variant="ghost" size="sm" title="Add this field" onClick={() => addOne(s)}>＋</TkxButton>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ── Read aloud ────────────────────────────────────────────────────────────────

function SpeakTab({ ensurePages, onJumpToPage, flash }: { ensurePages: () => Promise<PageRuns[]>; onJumpToPage: (p: number) => void; flash: (m: string) => void }) {
  const [segments, setSegments] = useState<Array<{ page: number; text: string }> | null>(null);
  const [current, setCurrent] = useState(-1);
  const [rate, setRate] = useState(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => listVoices());
  const [voiceName, setVoiceName] = useState('');
  const [playing, setPlaying] = useState(false);
  const ctrlRef = useRef<ReadAloudController | null>(null);
  // Chrome silently pauses speechSynthesis after ~15s; a periodic
  // pause→resume keeps long reads alive.
  const keepAliveRef = useRef<number | null>(null);

  useEffect(() => {
    if (!ttsSupported()) return;
    const update = () => setVoices(listVoices());
    update();
    window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);

  // Stop speech + keepalive if the tab unmounts.
  useEffect(() => () => {
    ctrlRef.current?.stop();
    if (keepAliveRef.current) window.clearInterval(keepAliveRef.current);
  }, []);

  const stopKeepAlive = () => {
    if (keepAliveRef.current) {
      window.clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
  };

  const play = async () => {
    let segs = segments;
    if (!segs) {
      const pages = await ensurePages();
      segs = pages.flatMap((p) => p.runs.map((r) => ({ page: p.page, text: r.text })).filter((s) => s.text.trim()));
      setSegments(segs);
    }
    if (!segs || segs.length === 0) {
      flash('No readable text found. If this is a scan, run OCR first, then try again.');
      return;
    }
    const ctrl = createReadAloud((i) => {
      setCurrent(i);
      if (i < 0) {
        setPlaying(false);
        stopKeepAlive();
      } else if (segs && segs[i]) onJumpToPage(segs[i]!.page);
    });
    ctrlRef.current = ctrl;
    ctrl.start(segs, { rate, voice: voices.find((v) => v.name === voiceName) ?? null });
    setPlaying(true);
    stopKeepAlive();
    keepAliveRef.current = window.setInterval(() => {
      const s = window.speechSynthesis;
      if (s.speaking && !s.paused) { s.pause(); s.resume(); }
    }, 10_000);
  };

  if (!ttsSupported()) {
    return <div className="v2-smart__pane"><p className="v2-smart__empty">This browser doesn't support speech synthesis.</p></div>;
  }

  return (
    <div className="v2-smart__pane">
      <p className="v2-smart__lead">Have the document read to you, line by line, with the current line tracked.</p>
      <label className="v2-smart__field">
        <span>Voice</span>
        <TkxSelect
          size="sm"
          value={voiceName}
          options={[{ value: '', label: 'Default' }, ...voices.map((v) => ({ value: v.name, label: `${v.name} (${v.lang})` }))]}
          onChange={(v) => setVoiceName(v as string)}
        />
      </label>
      <label className="v2-smart__field">
        <span>Speed {rate.toFixed(1)}×</span>
        <TkxSlider size="sm" min={0.5} max={2} step={0.1} value={rate} onChange={setRate} />
      </label>
      <div className="v2-smart__row-actions">
        {!playing && <TkxButton className="v2-smart__btn" variant="solid" colorScheme="primary" size="sm" onClick={play}>▶ Play</TkxButton>}
        {playing && <TkxButton className="v2-smart__btn" variant="outline" size="sm" onClick={() => { ctrlRef.current?.pause(); }}>⏸ Pause</TkxButton>}
        {playing && <TkxButton className="v2-smart__btn" variant="outline" size="sm" onClick={() => { ctrlRef.current?.resume(); }}>⏵ Resume</TkxButton>}
        <TkxButton className="v2-smart__btn" variant="outline" size="sm" onClick={() => { ctrlRef.current?.stop(); setPlaying(false); setCurrent(-1); stopKeepAlive(); }}>⏹ Stop</TkxButton>
      </div>
      {current >= 0 && segments?.[current] && (
        <div className="v2-smart__speaking">
          <span className="v2-smart__pii-page">p.{segments[current]!.page}</span>
          <span>{segments[current]!.text}</span>
        </div>
      )}
    </div>
  );
}

// ── Accessibility ─────────────────────────────────────────────────────────────

function A11yTab({
  ensurePages,
  getMeta,
  onRunOcr,
  onTagAccessible,
  getDocBytes,
  docName,
  flash,
}: {
  ensurePages: () => Promise<PageRuns[]>;
  getMeta: () => Promise<{ title: string | null; language: string | null }>;
  onRunOcr: () => void;
  onTagAccessible: (opts: { lang: string; title?: string; headings: HeadingEntry[] }) => Promise<Uint8Array | null>;
  getDocBytes: () => Uint8Array | null;
  docName: string;
  flash: (m: string) => void;
}) {
  const [report, setReport] = useState<A11yComplianceReport | null>(null);
  /** 'before' = audit of the open document; 'after' = audit of the exported,
   *  remediated bytes (the certified one). */
  const [reportKind, setReportKind] = useState<'before' | 'after'>('before');
  const [lang, setLang] = useState('en-US');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState<null | 'audit' | 'tag'>(null);

  const audit = async () => {
    setBusy('audit');
    try {
      const bytes = getDocBytes();
      if (!bytes) return;
      const meta = await getMeta();
      if (meta.language) setLang(meta.language);
      if (meta.title) setTitle(meta.title);
      const pages = await ensurePages();
      const headings = detectHeadings(pages);
      setReport(await auditPdfBytes(bytes, `${docName}.pdf`, headings.length));
      setReportKind('before');
    } catch (e) {
      flash('Audit failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
    }
  };

  // Remediate (tag + download), then independently re-audit the EXPORTED
  // bytes — the certified report describes the actual file, not intent.
  const remediate = async () => {
    setBusy('tag');
    try {
      const pages = await ensurePages();
      const headings = detectHeadings(pages);
      const tagged = await onTagAccessible({ lang: lang.trim() || 'en-US', title: title.trim() || undefined, headings });
      if (!tagged) {
        flash('Remediation produced no output.');
        return;
      }
      setReport(await auditPdfBytes(tagged, `${docName}-accessible.pdf`, headings.length));
      setReportKind('after');
      flash('Remediated, downloaded, and re-audited the exported copy.');
    } catch (e) {
      flash('Remediation failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
    }
  };

  const downloadReport = () => {
    if (!report) return;
    const note =
      reportKind === 'after'
        ? 'This report was generated from the remediated, exported file (independent re-parse of the actual bytes).'
        : 'This report describes the document BEFORE remediation. Use “Remediate & certify” to fix machine-checkable failures and produce a post-remediation report.';
    downloadText(`${docName}-accessibility-report.html`, renderReportHtml(report, note), 'text/html');
  };

  return (
    <div className="v2-smart__pane">
      <p className="v2-smart__lead">
        Audit against the criteria regulators cite (EN 301 549 / WCAG 2.1 AA / PDF/UA — EAA, ADA Title II, Section 508), remediate, then certify the exported file.
      </p>
      <TkxButton className="v2-smart__btn" variant="outline" size="sm" onClick={audit} disabled={busy !== null}>
        {busy === 'audit' ? 'Auditing…' : 'Run compliance audit'}
      </TkxButton>

      {report && (
        <>
          <div className={'v2-smart__a11y ' + (report.ok ? 'v2-smart__a11y--pass' : 'v2-smart__a11y--fail')}>
            <div className="v2-smart__a11y-head">
              <span aria-hidden>{report.ok ? '✓' : '✕'}</span>
              <strong>
                {reportKind === 'after' ? 'Remediated file: ' : ''}
                {report.ok
                  ? `No machine-checkable failures (${report.passCount} pass, ${report.reviewCount} need human review)`
                  : `${report.failCount} failure(s) · ${report.passCount} pass · ${report.reviewCount} human review`}
              </strong>
            </div>
          </div>
          <ul className="v2-smart__list">
            {report.criteria.map((c) => (
              <li key={c.id} className="v2-smart__list-row">
                <span className={'v2-smart__pii-type'} style={{ background: c.status === 'pass' ? '#dcfce7' : c.status === 'fail' ? '#fee2e2' : '#fef9c3', color: c.status === 'pass' ? '#166534' : c.status === 'fail' ? '#b91c1c' : '#854d0e' }}>
                  {c.status}
                </span>
                <span className="v2-smart__pii-val" title={c.evidence}>{c.label}</span>
              </li>
            ))}
          </ul>
          <div className="v2-smart__row-actions">
            <TkxButton className="v2-smart__link" variant="link" size="sm" onClick={downloadReport}>Download report (HTML)</TkxButton>
            {report.criteria.some((c) => c.id === 'text-layer' && c.status === 'fail') && (
              <TkxButton className="v2-smart__link" variant="link" size="sm" onClick={onRunOcr}>Run OCR to add a text layer →</TkxButton>
            )}
          </div>
        </>
      )}

      <div className="v2-smart__tag-box">
        <strong>Remediate & certify</strong>
        <p className="v2-smart__note">Tags the document (marked content + structure tree + /ParentTree + language + title + DisplayDocTitle), downloads the accessible copy, then independently re-audits the exported bytes and produces the post-remediation report.</p>
        <TkxInput label="Language (BCP-47)" value={lang} placeholder="en-US" onChange={(e) => setLang(e.target.value)} />
        <TkxInput label="Title" value={title} placeholder="Document title" onChange={(e) => setTitle(e.target.value)} />
        <TkxButton className="v2-smart__btn" variant="solid" colorScheme="primary" size="sm" disabled={busy !== null} onClick={remediate}>
          {busy === 'tag' ? 'Remediating…' : 'Remediate, re-audit & download'}
        </TkxButton>
        <p className="v2-smart__note">Tagging is per-paragraph: every text object gets its own marked-content sequence and structure element. Items marked “review” (alt text, heading semantics) need human judgement and are listed as such in the report — no over-claiming.</p>
      </div>
    </div>
  );
}

// ── AI Edit (agentic) ─────────────────────────────────────────────────────────

const AGENT_EXAMPLES = [
  'Redact every SSN and email',
  'Change all "2025" to "2026"',
  'Black out all phone numbers',
];

function AgentTab({
  ensurePages,
  onAddAnnotations,
  aiConfig,
  onAsk,
  aiOffline,
  flash,
}: {
  ensurePages: () => Promise<PageRuns[]>;
  onAddAnnotations: (a: Annotation[]) => void;
  aiConfig: AiConfig;
  onAsk?: HostAskHook;
  aiOffline: boolean;
  flash: (m: string) => void;
}) {
  const [command, setCommand] = useState('');
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<AgentPlan | null>(null);
  const [keep, setKeep] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Phase 1: interpret the instruction and PREVIEW the concrete changes —
  // nothing is applied to the document yet.
  const preview = async (cmd: string) => {
    const instruction = cmd.trim();
    if (!instruction || busy) return;
    setBusy(true);
    setError(null);
    setPlan(null);
    try {
      let ops = parseCommandOffline(instruction);
      if (ops.length === 0 && !aiOffline) {
        ops = await parseCommandWithAi(instruction, aiConfig, onAsk);
      }
      if (ops.length === 0) {
        setError(
          aiOffline
            ? "Couldn't interpret that offline. Try “redact all emails”, “black out 'Acme Corp'”, or “replace X with Y” — or add an AI key in the Ask-AI panel for free-form commands."
            : "The model didn't return a runnable edit. Try rephrasing.",
        );
        return;
      }
      const pages = await ensurePages();
      const p = planOps(pages, ops);
      if (p.changes.length === 0) {
        setError('No matching text found for that instruction.');
        return;
      }
      setPlan(p);
      setKeep(new Set(p.changes.map((_, i) => i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Phase 2: apply only the kept changes.
  const apply = () => {
    if (!plan) return;
    const anns = plan.changes.filter((_, i) => keep.has(i)).flatMap((c) => c.annotations);
    if (anns.length === 0) {
      flash('Nothing selected to apply.');
      return;
    }
    onAddAnnotations(anns);
    flash(`Applied ${keep.size} change(s). Review on the page, undo if needed, then Save.`);
    setPlan(null);
    setCommand('');
  };

  return (
    <div className="v2-smart__pane">
      <p className="v2-smart__lead">Tell the document what to change in plain English. You'll see a preview of every change and confirm before anything is applied.</p>
      <textarea
        className="v2-smart__textarea"
        rows={2}
        placeholder="e.g. Redact every SSN and email address"
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); preview(command); } }}
      />
      <div className="v2-smart__row-actions">
        <TkxButton className="v2-smart__btn" variant="solid" colorScheme="primary" size="sm" disabled={busy || !command.trim()} onClick={() => preview(command)}>
          {busy ? 'Working…' : 'Preview changes'}
        </TkxButton>
      </div>
      <div className="v2-smart__examples">
        {AGENT_EXAMPLES.map((ex) => (
          <TkxButton key={ex} className="v2-smart__chip" variant="outline" size="sm" onClick={() => { setCommand(ex); preview(ex); }} disabled={busy}>{ex}</TkxButton>
        ))}
      </div>
      {aiOffline && <p className="v2-smart__note">Offline: deterministic commands (redact &lt;type&gt;, redact "literal", replace A with B) work now. Add an AI key in the Ask-AI panel for free-form instructions.</p>}
      {error && <div className="v2-smart__err">{error}</div>}

      {plan && (
        <>
          <div className="v2-smart__result-head">
            {plan.changes.length} change{plan.changes.length === 1 ? '' : 's'} to review
            <TkxButton className="v2-smart__link" variant="link" size="sm" onClick={() => setKeep(new Set(keep.size === plan.changes.length ? [] : plan.changes.map((_, i) => i)))}>
              {keep.size === plan.changes.length ? 'Deselect all' : 'Select all'}
            </TkxButton>
          </div>
          <ul className="v2-smart__list">
            {plan.changes.map((c, i) => (
              <li key={i} className="v2-smart__list-row">
                <label className="v2-smart__check">
                  <TkxCheckbox
                    size="sm"
                    checked={keep.has(i)}
                    onChange={(e) => {
                      const next = new Set(keep);
                      if (e.target.checked) next.add(i);
                      else next.delete(i);
                      setKeep(next);
                    }}
                  />
                  <span className="v2-smart__pii-type">{c.kind}</span>
                  {c.kind === 'redact' ? (
                    <span className="v2-smart__chg-redact">{c.before}</span>
                  ) : (
                    <span className="v2-smart__chg-replace">
                      <span className="v2-smart__chg-before">{c.before}</span>
                      <span className="v2-smart__chg-arrow"> → </span>
                      <span className="v2-smart__chg-after">{c.after}</span>
                    </span>
                  )}
                  <span className="v2-smart__pii-page">p.{c.page}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="v2-smart__row-actions">
            <TkxButton className="v2-smart__btn" variant="solid" colorScheme="primary" size="sm" onClick={apply}>Apply {keep.size} change{keep.size === 1 ? '' : 's'}</TkxButton>
            <TkxButton className="v2-smart__btn" variant="outline" size="sm" onClick={() => setPlan(null)}>Cancel</TkxButton>
          </div>
        </>
      )}
    </div>
  );
}

// ── Translate ─────────────────────────────────────────────────────────────────

function TranslateTab({
  ensurePages,
  onAddAnnotations,
  aiConfig,
  onAsk,
  aiOffline,
  flash,
}: {
  ensurePages: () => Promise<PageRuns[]>;
  onAddAnnotations: (a: Annotation[]) => void;
  aiConfig: AiConfig;
  onAsk?: HostAskHook;
  aiOffline: boolean;
  flash: (m: string) => void;
}) {
  const [lang, setLang] = useState('Spanish');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [plan, setPlan] = useState<TranslateChange[] | null>(null);
  const [keep, setKeep] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const onDeviceOk = onDeviceTranslationSupported(lang);
  const canTranslate = !aiOffline || onDeviceOk;

  const preview = async () => {
    setError(null);
    setPlan(null);
    const pages = await ensurePages();
    if (pages.length === 0) return;
    // Prefer the AI translator (higher quality); fall back to on-device.
    const translator = !aiOffline
      ? aiTranslator(lang, aiConfig, onAsk)
      : await onDeviceTranslator(lang);
    if (!translator) {
      setError('No translator available. Add an AI key in the Ask-AI panel, or use a browser with the built-in Translator API.');
      return;
    }
    setProgress({ done: 0, total: pages.length });
    try {
      const changes = await planTranslation(pages, translator, (done, total) => setProgress({ done, total }));
      if (changes.length === 0) {
        setError('Nothing to translate (no text found).');
        return;
      }
      setPlan(changes);
      setKeep(new Set(changes.map((_, i) => i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  const apply = () => {
    if (!plan) return;
    const anns = plan.filter((_, i) => keep.has(i)).flatMap((c) => c.annotations);
    if (anns.length === 0) {
      flash('Nothing selected to apply.');
      return;
    }
    onAddAnnotations(anns);
    flash(`Applied ${keep.size} translated line(s). Review on the page, then Save.`);
    setPlan(null);
  };

  return (
    <div className="v2-smart__pane">
      <p className="v2-smart__lead">Translate every line in place, keeping its position and size. Preview before applying. Works on scans too (run OCR first).</p>
      <label className="v2-smart__field">
        <span>Target language</span>
        <TkxSelect size="sm" value={lang} options={LANGUAGES.map((l) => ({ value: l, label: l }))} onChange={(v) => { setLang(v as string); setPlan(null); }} />
      </label>
      {aiOffline && (
        <p className="v2-smart__note">
          {onDeviceOk
            ? 'No AI key — using the browser’s built-in on-device translator (offline). Assumes English source.'
            : 'No AI key and no on-device Translator API in this browser. Add an AI key in the Ask-AI panel (⚙), or use Chrome with the built-in Translator.'}
        </p>
      )}
      <TkxButton className="v2-smart__btn" variant="solid" colorScheme="primary" size="sm" disabled={!!progress || !canTranslate} onClick={preview}>
        {progress ? `Translating… page ${progress.done}/${progress.total}` : `Preview translation to ${lang}`}
      </TkxButton>
      {error && <div className="v2-smart__err">{error}</div>}

      {plan && (
        <>
          <div className="v2-smart__result-head">
            {plan.length} line{plan.length === 1 ? '' : 's'} to translate
            <TkxButton className="v2-smart__link" variant="link" size="sm" onClick={() => setKeep(new Set(keep.size === plan.length ? [] : plan.map((_, i) => i)))}>
              {keep.size === plan.length ? 'Deselect all' : 'Select all'}
            </TkxButton>
          </div>
          <ul className="v2-smart__list">
            {plan.map((c, i) => (
              <li key={i} className="v2-smart__list-row">
                <label className="v2-smart__check">
                  <TkxCheckbox size="sm" checked={keep.has(i)} onChange={(e) => {
                    const next = new Set(keep);
                    if (e.target.checked) next.add(i); else next.delete(i);
                    setKeep(next);
                  }} />
                  <span className="v2-smart__chg-replace">
                    <span className="v2-smart__chg-before">{c.before}</span>
                    <span className="v2-smart__chg-arrow"> → </span>
                    <span className="v2-smart__chg-after">{c.after}</span>
                  </span>
                  <span className="v2-smart__pii-page">p.{c.page}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="v2-smart__row-actions">
            <TkxButton className="v2-smart__btn" variant="solid" colorScheme="primary" size="sm" onClick={apply}>Apply {keep.size} line{keep.size === 1 ? '' : 's'}</TkxButton>
            <TkxButton className="v2-smart__btn" variant="outline" size="sm" onClick={() => setPlan(null)}>Cancel</TkxButton>
          </div>
        </>
      )}
    </div>
  );
}

// ── Compare ───────────────────────────────────────────────────────────────────

function CompareTab({
  ensurePages,
  getDocBytes,
  aiConfig,
  onAsk,
  aiOffline,
}: {
  ensurePages: () => Promise<PageRuns[]>;
  getDocBytes: () => Uint8Array | null;
  aiConfig: AiConfig;
  onAsk?: HostAskHook;
  aiOffline: boolean;
}) {
  const [diff, setDiff] = useState<DiffEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [oldBytes, setOldBytes] = useState<Uint8Array | null>(null);
  const [visual, setVisual] = useState<VisualDiffResult | null>(null);
  const [visualBusy, setVisualBusy] = useState(false);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setDiff(null);
    setExplanation(null);
    setVisual(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setOldBytes(bytes);
      const [pages, oldLines] = await Promise.all([ensurePages(), extractFileLines(file)]);
      const currentLines = pages.flatMap((p) => p.runs.map((r) => r.text)).filter(Boolean);
      // Picked file = previous version (old); current doc = new.
      setDiff(diffLines(oldLines, currentLines));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runVisual = async () => {
    const newBytes = getDocBytes();
    if (!oldBytes || !newBytes) return;
    setVisualBusy(true);
    setError(null);
    try {
      setVisual(await visualDiff(oldBytes, newBytes));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setVisualBusy(false);
    }
  };

  const explain = async () => {
    if (!diff) return;
    setBusy(true);
    setError(null);
    try {
      setExplanation(await explainDiff(diff, aiConfig, onAsk));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const stats = diff ? diffStats(diff) : null;

  return (
    <div className="v2-smart__pane">
      <p className="v2-smart__lead">Compare this document against a previous version and see exactly what changed.</p>
      <TkxFileUpload
        variant="button"
        accept="application/pdf"
        isDisabled={busy}
        label={busy ? 'Comparing…' : 'Choose previous version (PDF)…'}
        onChange={(files) => onPick(files[0])}
      />
      {error && <div className="v2-smart__err">{error}</div>}
      {stats && (
        <>
          <div className="v2-smart__diff-stats">
            <span className="v2-smart__diff-add">+{stats.added} added</span>
            <span className="v2-smart__diff-del">−{stats.removed} removed</span>
            <span className="v2-smart__diff-same">{stats.unchanged} unchanged</span>
          </div>
          {!aiOffline && (
            <TkxButton className="v2-smart__btn" variant="solid" colorScheme="primary" size="sm" onClick={explain} disabled={busy}>
              {busy ? 'Summarizing…' : '✦ Explain the changes'}
            </TkxButton>
          )}
          {explanation && <div className="v2-smart__explain">{explanation.split('\n').map((l, i) => <div key={i}>{l}</div>)}</div>}
          <div className="v2-smart__diff">
            {diff!.filter((e) => e.type !== 'same').slice(0, 300).map((e, i) => (
              <div key={i} className={'v2-smart__diff-line v2-smart__diff-line--' + e.type}>
                <span className="v2-smart__diff-sign">{e.type === 'add' ? '+' : '−'}</span>
                <span>{e.text}</span>
              </div>
            ))}
          </div>

          <TkxButton className="v2-smart__btn" variant="outline" size="sm" onClick={runVisual} disabled={visualBusy || !oldBytes}>
            {visualBusy ? 'Rendering…' : '▦ Visual diff (catches layout, images, signatures)'}
          </TkxButton>
          {visual && <VisualDiffView visual={visual} getNewBytes={getDocBytes} />}
        </>
      )}
    </div>
  );
}

function VisualDiffView({ visual, getNewBytes }: { visual: VisualDiffResult; getNewBytes: () => Uint8Array | null }) {
  const changed = visual.pages.filter((p) => p.onlyIn || p.regions.length > 0);
  if (changed.length === 0) {
    return <div className="v2-smart__a11y v2-smart__a11y--pass"><div className="v2-smart__a11y-head"><span aria-hidden>✓</span><strong>No visual changes</strong></div><p>Both versions render pixel-identically.</p></div>;
  }
  return (
    <div className="v2-smart__pane">
      <div className="v2-smart__result-head">{changed.length} page(s) changed visually</div>
      {changed.map((pg) => (
        <VisualDiffPage key={pg.page} pg={pg} getNewBytes={getNewBytes} />
      ))}
    </div>
  );
}

function VisualDiffPage({ pg, getNewBytes }: { pg: VisualDiffResult['pages'][number]; getNewBytes: () => Uint8Array | null }) {
  const [src, setSrc] = useState<string>('');
  const W = 240;
  useEffect(() => {
    let cancelled = false;
    if (pg.onlyIn === 'old') { setSrc(''); return; }
    const bytes = getNewBytes();
    if (!bytes) return;
    renderPageDataUrl(bytes, pg.page, W).then((u) => { if (!cancelled) setSrc(u); }).catch(() => {});
    return () => { cancelled = true; };
  }, [pg, getNewBytes]);

  return (
    <div className="v2-smart__vdiff">
      <div className="v2-smart__vdiff-head">
        Page {pg.page}
        {pg.onlyIn === 'new' && <span className="v2-smart__diff-add"> · added</span>}
        {pg.onlyIn === 'old' && <span className="v2-smart__diff-del"> · removed</span>}
        {!pg.onlyIn && <span className="v2-smart__conf"> · {Math.round(pg.changeRatio * 100)}% pixels</span>}
      </div>
      {pg.onlyIn === 'old' ? (
        <div className="v2-smart__note">Present only in the previous version.</div>
      ) : (
        <div className="v2-smart__vdiff-canvas" style={{ width: W }}>
          {src && <img src={src} width={W} alt={`Page ${pg.page}`} />}
          {pg.regions.map((r, i) => (
            <span key={i} className="v2-smart__vdiff-box" style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }} />
          ))}
        </div>
      )}
    </div>
  );
}


// ── Pages (organize / merge) ──────────────────────────────────────────────────

interface PageRow {
  /** 1-based page number in the SOURCE document. */
  src: number;
  rotate: number;
  deleted: boolean;
}

function PagesTab({
  pageCount,
  onApply,
  flash,
}: {
  pageCount: number;
  onApply: (opts: { order: number[]; rotate: Record<number, number>; appendFiles: File[] }) => Promise<void>;
  flash: (m: string) => void;
}) {
  const [rows, setRows] = useState<PageRow[]>(() =>
    Array.from({ length: pageCount }, (_, i) => ({ src: i + 1, rotate: 0, deleted: false })),
  );
  const [appendFiles, setAppendFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const move = (i: number, dir: -1 | 1) => {
    setRows((r) => {
      const j = i + dir;
      if (j < 0 || j >= r.length) return r;
      const next = [...r];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  };
  const cycleRotate = (i: number) =>
    setRows((r) => r.map((row, k) => (k === i ? { ...row, rotate: (row.rotate + 90) % 360 } : row)));
  const toggleDelete = (i: number) =>
    setRows((r) => r.map((row, k) => (k === i ? { ...row, deleted: !row.deleted } : row)));

  const kept = rows.filter((r) => !r.deleted);
  const dirty =
    appendFiles.length > 0 ||
    kept.length !== rows.length ||
    rows.some((r, i) => r.src !== i + 1 || r.rotate !== 0);

  const apply = async () => {
    if (kept.length === 0 && appendFiles.length === 0) {
      flash('Cannot produce a PDF with zero pages.');
      return;
    }
    setBusy(true);
    try {
      const rotate: Record<number, number> = {};
      for (const r of kept) if (r.rotate !== 0) rotate[r.src] = r.rotate;
      await onApply({ order: kept.map((r) => r.src), rotate, appendFiles });
      flash('Reorganized PDF downloaded.');
    } catch (e) {
      flash('Page operation failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="v2-smart__pane">
      <p className="v2-smart__lead">Reorder, rotate, or delete pages — and merge other PDFs onto the end. Downloads a reorganized copy; the open document is untouched.</p>
      <ul className="v2-smart__list">
        {rows.map((r, i) => (
          <li key={r.src} className={'v2-smart__list-row' + (r.deleted ? ' v2-smart__page-row--deleted' : '')}>
            <span className="v2-smart__pii-type">p.{r.src}</span>
            <span className="v2-smart__pii-val">
              Position {i + 1}
              {r.rotate ? ` · rotated ${r.rotate}°` : ''}
              {r.deleted ? ' · deleted' : ''}
            </span>
            <TkxButton className="v2-icon-btn v2-icon-btn--small" variant="ghost" size="sm" disabled={i === 0} onClick={() => move(i, -1)} title="Move up" aria-label={`Move page ${r.src} up`}>↑</TkxButton>
            <TkxButton className="v2-icon-btn v2-icon-btn--small" variant="ghost" size="sm" disabled={i === rows.length - 1} onClick={() => move(i, 1)} title="Move down" aria-label={`Move page ${r.src} down`}>↓</TkxButton>
            <TkxButton className="v2-icon-btn v2-icon-btn--small" variant="ghost" size="sm" onClick={() => cycleRotate(i)} disabled={r.deleted} title="Rotate 90°" aria-label={`Rotate page ${r.src}`}>⟳</TkxButton>
            <TkxButton className="v2-icon-btn v2-icon-btn--small" variant="ghost" size="sm" onClick={() => toggleDelete(i)} title={r.deleted ? 'Restore' : 'Delete'} aria-label={`${r.deleted ? 'Restore' : 'Delete'} page ${r.src}`}>{r.deleted ? '⮌' : '🗑'}</TkxButton>
          </li>
        ))}
      </ul>

      <TkxFileUpload
        variant="button"
        accept="application/pdf"
        multiple
        label="＋ Merge: append PDF(s) at the end…"
        onChange={(files) => { if (files.length) setAppendFiles((cur) => [...cur, ...files]); }}
      />
      {appendFiles.length > 0 && (
        <ul className="v2-smart__list">
          {appendFiles.map((f, i) => (
            <li key={i} className="v2-smart__list-row">
              <span className="v2-smart__pii-type">append</span>
              <span className="v2-smart__pii-val">{f.name}</span>
              <TkxButton className="v2-icon-btn v2-icon-btn--small" variant="ghost" size="sm" onClick={() => setAppendFiles((cur) => cur.filter((_, k) => k !== i))} aria-label={`Remove ${f.name}`}>×</TkxButton>
            </li>
          ))}
        </ul>
      )}

      <div className="v2-smart__row-actions">
        <TkxButton className="v2-smart__btn" variant="solid" colorScheme="primary" size="sm" disabled={busy || !dirty} onClick={apply}>
          {busy ? 'Applying…' : `Apply & download (${kept.length + (appendFiles.length ? '+' : '')} page${kept.length === 1 && !appendFiles.length ? '' : 's'})`}
        </TkxButton>
        <TkxButton className="v2-smart__btn" variant="outline" size="sm" disabled={busy || !dirty} onClick={() => { setRows(Array.from({ length: pageCount }, (_, i) => ({ src: i + 1, rotate: 0, deleted: false }))); setAppendFiles([]); }}>
          Reset
        </TkxButton>
      </div>
      <p className="v2-smart__note">Merging from password-protected PDFs isn't supported. Deleted pages' form fields become inert in the copy.</p>
    </div>
  );
}


// ── Watermark / page numbers ──────────────────────────────────────────────────

// ── Convert (Track 2: multi-format in / out) ────────────────────────────────────

const baseName = (n: string) => n.replace(/\.[^.]+$/, '') || 'document';

function ConvertTab({
  ensurePages,
  getCurrentPdfBytes,
  onOpenBytes,
  docName,
  flash,
}: {
  ensurePages: () => Promise<PageRuns[]>;
  getCurrentPdfBytes: () => Promise<Uint8Array | null>;
  onOpenBytes: (bytes: Uint8Array, name: string) => void;
  docName: string;
  flash: (m: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [imgFormat, setImgFormat] = useState<'png' | 'jpg'>('png');
  const [imgDpi, setImgDpi] = useState(144);
  const [makeKind, setMakeKind] = useState<'text' | 'markdown' | 'html'>('markdown');
  const [makeText, setMakeText] = useState('# My document\n\nType or paste **text**, Markdown, or HTML here, then build a PDF.\n\n- runs entirely in your browser\n- no upload');
  const name = baseName(docName);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (e) { flash('Failed: ' + (e instanceof Error ? e.message : String(e))); } finally { setBusy(null); }
  };

  const exportText = () => run('text', async () => {
    const pages = await ensurePages();
    if (pages.length === 0) return;
    const text = pdfRunsToText(pages);
    if (!text.trim()) { flash('No selectable text found — if this is a scan, run OCR first.'); return; }
    downloadText(`${name}.txt`, text);
    flash('Exported page text as .txt');
  });

  const headingsFor = (pages: PageRuns[]) => detectHeadings(pages).map((h) => ({ page: h.page, level: h.level, text: h.text }));
  const tablesFor = (pages: PageRuns[]) => pages.flatMap((p) => extractTables(p).map((t) => ({ page: t.page, rows: t.rows })));
  // Extract embedded images from the current document (browser-only; best effort).
  const imagesFor = async (): Promise<Array<{ page: number; bytes: Uint8Array; width: number; height: number }>> => {
    const bytes = await getCurrentPdfBytes();
    if (!bytes) return [];
    try { return await extractImages(bytes); } catch { return []; }
  };
  const toB64 = (u8: Uint8Array) => { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!); return btoa(s); };

  const exportMarkdown = () => run('md', async () => {
    const pages = await ensurePages();
    if (pages.length === 0) return;
    if (!pdfRunsToText(pages).trim()) { flash('No selectable text found — if this is a scan, run OCR first.'); return; }
    let md = pdfRunsToMarkdown(pages, headingsFor(pages));
    const imgs = await imagesFor();
    if (imgs.length) md += `\n\n## Images\n\n` + imgs.map((im) => `![page ${im.page} image](data:image/png;base64,${toB64(im.bytes)})`).join('\n\n') + '\n';
    downloadText(`${name}.md`, md, 'text/markdown');
    flash(`Exported Markdown (.md)${imgs.length ? ` with ${imgs.length} inline image(s)` : ''}.`);
  });

  const exportDocx = () => run('docx', async () => {
    const pages = await ensurePages();
    if (pages.length === 0) return;
    if (!pdfRunsToText(pages).trim()) { flash('No selectable text found — if this is a scan, run OCR first.'); return; }
    const images: DocxImage[] = (await imagesFor()).map((im) => ({ page: im.page, data: im.bytes, width: im.width, height: im.height }));
    const bytes = runsToDocx(pages, headingsFor(pages), { tables: tablesFor(pages), images });
    downloadBytes(`${name}.docx`, bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    flash(`Exported an editable Word document (.docx)${images.length ? ` with ${images.length} image(s)` : ''}.`);
  });

  const exportXlsx = () => run('xlsx', async () => {
    const pages = await ensurePages();
    if (pages.length === 0) return;
    const tables = tablesFor(pages);
    const sheets = [
      ...tables.map((t, i) => ({ name: `Table ${i + 1} (p${t.page})`, rows: t.rows })),
      { name: 'Document text', rows: pagesToSheetRows(pages) },
    ];
    const bytes = await sheetsToXlsx(sheets);
    downloadBytes(`${name}.xlsx`, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    flash(`Exported Excel (.xlsx): ${tables.length} table sheet(s) + full document text.`);
  });

  const exportCsv = () => run('csv', async () => {
    const pages = await ensurePages();
    if (pages.length === 0) return;
    const tables = tablesFor(pages);
    if (tables.length === 0) { flash('No tables detected. Use Excel (.xlsx) for the full document text.'); return; }
    downloadText(`${name}.csv`, tablesToCombinedCsv(tables), 'text/csv');
    flash(`Exported ${tables.length} detected table(s) to a single CSV.`);
  });

  const exportEpub = () => run('epub', async () => {
    const pages = await ensurePages();
    if (pages.length === 0) return;
    if (!pdfRunsToText(pages).trim()) { flash('No selectable text found — if this is a scan, run OCR first.'); return; }
    const bytes = runsToEpub(pages, headingsFor(pages), name);
    downloadBytes(`${name}.epub`, bytes, 'application/epub+zip');
    flash('Exported a reflowable e-book (.epub).');
  });

  const exportPptx = () => run('pptx', async () => {
    const pages = await ensurePages();
    if (pages.length === 0) return;
    if (!pdfRunsToText(pages).trim()) { flash('No selectable text found — if this is a scan, run OCR first.'); return; }
    const bytes = pagesToPptx(pagesToSlides(pages));
    downloadBytes(`${name}.pptx`, bytes, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    flash(`Exported ${pages.length} slide(s) to PowerPoint (.pptx).`);
  });

  const openAnyDoc = (files: File[]) => run('open', async () => {
    const f = files[0];
    if (!f) return;
    let converted: { bytes: Uint8Array; name: string } | null;
    try {
      converted = await fileToPdf(f);
    } catch (e) {
      if ((e instanceof Error ? e.message : '') !== 'PASSWORD_REQUIRED') throw e;
      const pw = window.prompt(`"${f.name}" is password-protected. Enter its password:`);
      if (pw == null) return;
      converted = await fileToPdf(f, pw);
    }
    if (!converted) { flash('That’s already a PDF — use the top-bar Open button.'); return; }
    onOpenBytes(converted.bytes, converted.name);
    flash(`Opened ${f.name} as PDF in the editor.`);
  });

  const exportImages = () => run('images', async () => {
    const bytes = await getCurrentPdfBytes();
    if (!bytes) { flash('Open a PDF first.'); return; }
    const imgs = await pdfToImages(bytes, { dpi: imgDpi, format: imgFormat });
    if (imgs.length === 1) {
      downloadBytes(`${name}-p1.${imgFormat}`, imgs[0]!.bytes, imgFormat === 'png' ? 'image/png' : 'image/jpeg');
    } else {
      const pad = String(imgs.length).length;
      const zip = zipStore(imgs.map((im) => ({ name: `${name}-p${String(im.page).padStart(pad, '0')}.${im.ext}`, data: im.bytes })));
      downloadBytes(`${name}-images.zip`, zip, 'application/zip');
    }
    flash(`Exported ${imgs.length} page image(s) at ${imgDpi} DPI.`);
  });

  const buildFromText = (open: boolean) => run('make', async () => {
    if (!makeText.trim()) { flash('Type some content first.'); return; }
    const bytes = makeKind === 'markdown' ? await markdownToPdf(makeText) : makeKind === 'html' ? await htmlToPdf(makeText) : await textToPdf(makeText);
    if (open) onOpenBytes(bytes, 'new-document');
    else downloadBytes('new-document.pdf', bytes, 'application/pdf');
    flash(open ? 'Opened the generated PDF in the editor.' : 'Built a PDF from your content.');
  });

  const onPickImages = (files: File[], open: boolean) => run('imgpdf', async () => {
    if (files.length === 0) return;
    const inputs: ImageInput[] = [];
    for (const f of files) {
      const img = await toEmbeddableImage(new Uint8Array(await f.arrayBuffer()), f.name.split('.').pop() ?? '', f.type);
      if (img) inputs.push({ ...img, name: f.name });
    }
    const { bytes, embedded, skipped } = await imagesToPdf(inputs);
    if (embedded === 0) { flash('None of those files were supported images (PNG/JPEG/WEBP/GIF/BMP/SVG/TIFF).'); return; }
    if (open) onOpenBytes(bytes, 'images');
    else downloadBytes('images.pdf', bytes, 'application/pdf');
    flash(`Built a ${embedded}-page PDF from images${skipped ? ` (${skipped} skipped)` : ''}.`);
  });

  return (
    <div className="v2-smart__pane">
      <p className="v2-smart__lead">Convert between formats — all in your browser, nothing uploaded.</p>

      <div className="v2-smart__tag-box">
        <strong>Open any document</strong>
        <p className="v2-smart__note">Word (.docx), PowerPoint (.pptx), Excel (.xlsx), OpenDocument (.odt/.ods/.odp), RTF, CSV, Markdown, HTML, text, or an image (PNG/JPEG/WEBP/GIF/BMP/SVG/TIFF) — converted to PDF and opened here. Password-protected Office files prompt for the password.</p>
        <TkxFileUpload variant="button" accept={OPENABLE_ACCEPT} isDisabled={!!busy} label="Choose a document…" onChange={openAnyDoc} />
      </div>

      <div className="v2-smart__tag-box">
        <strong>Export this PDF</strong>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <TkxButton className="v2-smart__btn" variant="outline" size="sm" disabled={!!busy} onClick={exportText}>{busy === 'text' ? 'Extracting…' : 'Text (.txt)'}</TkxButton>
          <TkxButton className="v2-smart__btn" variant="outline" size="sm" disabled={!!busy} onClick={exportMarkdown}>{busy === 'md' ? 'Extracting…' : 'Markdown (.md)'}</TkxButton>
          <TkxButton className="v2-smart__btn" variant="outline" size="sm" disabled={!!busy} onClick={exportDocx}>{busy === 'docx' ? 'Building…' : 'Word (.docx)'}</TkxButton>
          <TkxButton className="v2-smart__btn" variant="outline" size="sm" disabled={!!busy} onClick={exportXlsx}>{busy === 'xlsx' ? 'Building…' : 'Excel (.xlsx)'}</TkxButton>
          <TkxButton className="v2-smart__btn" variant="outline" size="sm" disabled={!!busy} onClick={exportCsv}>{busy === 'csv' ? 'Building…' : 'CSV'}</TkxButton>
          <TkxButton className="v2-smart__btn" variant="outline" size="sm" disabled={!!busy} onClick={exportEpub}>{busy === 'epub' ? 'Building…' : 'EPUB'}</TkxButton>
          <TkxButton className="v2-smart__btn" variant="outline" size="sm" disabled={!!busy} onClick={exportPptx}>{busy === 'pptx' ? 'Building…' : 'PowerPoint (.pptx)'}</TkxButton>
        </div>
        <p className="v2-smart__note">Word (text + detected tables + embedded images), Excel (table sheets + full text), combined CSV, and reflowable EPUB — all fully editable, not a pixel copy.</p>
        <label className="v2-smart__field">
          <span>Page images</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <TkxSelect size="sm" value={imgFormat} options={[{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPEG' }]} onChange={(v) => setImgFormat(v as 'png' | 'jpg')} />
            <TkxSelect size="sm" value={String(imgDpi)} options={[96, 144, 216, 300].map((d) => ({ value: String(d), label: `${d} DPI` }))} onChange={(v) => setImgDpi(Number(v))} />
          </span>
        </label>
        <TkxButton className="v2-smart__btn" variant="outline" size="sm" disabled={!!busy} onClick={exportImages}>{busy === 'images' ? 'Rendering…' : 'Export page images (zip)'}</TkxButton>
      </div>

      <div className="v2-smart__tag-box">
        <strong>Images → PDF</strong>
        <p className="v2-smart__note">Pick one or more images (PNG/JPEG/WEBP/GIF/BMP/SVG/TIFF); each becomes a page.</p>
        <TkxFileUpload variant="button" accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,.tif,.tiff" multiple isDisabled={!!busy} label="Choose images…" onChange={(files) => onPickImages(files, false)} />
      </div>

      <div className="v2-smart__tag-box">
        <strong>Text / Markdown / HTML → PDF</strong>
        <label className="v2-smart__field">
          <span>Input format</span>
          <TkxSelect size="sm" value={makeKind} options={[{ value: 'markdown', label: 'Markdown' }, { value: 'text', label: 'Plain text' }, { value: 'html', label: 'HTML' }]} onChange={(v) => setMakeKind(v as 'text' | 'markdown' | 'html')} />
        </label>
        <textarea className="v2-smart__textarea" rows={6} value={makeText} onChange={(e) => setMakeText(e.target.value)} />
        <div style={{ display: 'flex', gap: 8 }}>
          <TkxButton className="v2-smart__btn" variant="solid" colorScheme="primary" size="sm" isLoading={busy === 'make'} loadingText="Building…" disabled={!!busy} onClick={() => buildFromText(false)}>Download PDF</TkxButton>
          <TkxButton className="v2-smart__btn" variant="outline" size="sm" disabled={!!busy} onClick={() => buildFromText(true)}>Open in editor</TkxButton>
        </div>
        <p className="v2-smart__note">Clean basic layout (standard fonts, no CSS rendering) — honest, not a pixel-perfect renderer.</p>
      </div>
    </div>
  );
}

// ── Optimize (Track 3: compress / flatten / extract images) ─────────────────────

function OptimizeTab({
  getCurrentPdfBytes,
  onOpenBytes,
  docName,
  flash,
}: {
  getCurrentPdfBytes: () => Promise<Uint8Array | null>;
  onOpenBytes: (bytes: Uint8Array, name: string) => void;
  docName: string;
  flash: (m: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [level, setLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [result, setResult] = useState<{ before: number; after: number; bytes: Uint8Array } | null>(null);
  const name = baseName(docName);
  const fmtKB = (n: number) => (n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (e) { flash('Failed: ' + (e instanceof Error ? e.message : String(e))); } finally { setBusy(null); }
  };

  const doCompress = () => run('compress', async () => {
    const bytes = await getCurrentPdfBytes();
    if (!bytes) { flash('Open a PDF first.'); return; }
    const preset = level === 'high' ? { dpi: 96, quality: 0.45 } : level === 'low' ? { dpi: 150, quality: 0.75 } : { dpi: 120, quality: 0.6 };
    const r = await compressPdf(bytes, preset);
    setResult({ before: r.originalSize, after: r.newSize, bytes: r.bytes });
    const pct = Math.round((1 - r.newSize / r.originalSize) * 100);
    flash(pct > 0 ? `Compressed ${fmtKB(r.originalSize)} → ${fmtKB(r.newSize)} (−${pct}%).` : `Result (${fmtKB(r.newSize)}) wasn’t smaller — this PDF is already lean.`);
  });

  const doFlatten = () => run('flatten', async () => {
    const bytes = await getCurrentPdfBytes();
    if (!bytes) { flash('Open a PDF first.'); return; }
    const r = await flattenPdf(bytes);
    if (!r.hadForm) { flash('No interactive form fields to flatten.'); return; }
    downloadBytes(`${name}-flattened.pdf`, r.bytes, 'application/pdf');
    flash(`Flattened ${r.fieldCount} form field(s) into the page — values are now permanent.`);
  });

  const doExtract = () => run('extract', async () => {
    const bytes = await getCurrentPdfBytes();
    if (!bytes) { flash('Open a PDF first.'); return; }
    const imgs = await extractImages(bytes);
    if (imgs.length === 0) { flash('No embedded raster images found (vector-only or undecodable).'); return; }
    if (imgs.length === 1) {
      downloadBytes(`${name}-image.png`, imgs[0]!.bytes, 'image/png');
    } else {
      const pad = String(imgs.length).length;
      const zip = zipStore(imgs.map((im, i) => ({ name: `${name}-p${im.page}-img${String(i + 1).padStart(pad, '0')}.png`, data: im.bytes })));
      downloadBytes(`${name}-images.zip`, zip, 'application/zip');
    }
    flash(`Extracted ${imgs.length} embedded image(s).`);
  });

  const doPdfA = () => run('pdfa', async () => {
    const bytes = await getCurrentPdfBytes();
    if (!bytes) { flash('Open a PDF first.'); return; }
    const out = await pdfToPdfA(bytes, { title: name });
    downloadBytes(`${name}-pdfa.pdf`, out, 'application/pdf');
    flash('Exported an image-based PDF/A-1b (archival) — built to spec; certify with veraPDF.');
  });

  return (
    <div className="v2-smart__pane">
      <p className="v2-smart__lead">Shrink, flatten, archive, and unpack PDFs — all in your browser.</p>

      <div className="v2-smart__tag-box">
        <strong>Compress</strong>
        <p className="v2-smart__note">Rasterizes each page to shrink bloated/scanned PDFs. The result is image-only, so selectable text is lost — keep the original if you need the text.</p>
        <label className="v2-smart__field">
          <span>Level</span>
          <TkxSelect
            size="sm"
            value={level}
            options={[
              { value: 'low', label: 'Low — best quality (150 DPI)' },
              { value: 'medium', label: 'Medium — balanced (120 DPI)' },
              { value: 'high', label: 'High — smallest (96 DPI)' },
            ]}
            onChange={(v) => setLevel(v as 'low' | 'medium' | 'high')}
          />
        </label>
        <TkxButton className="v2-smart__btn" variant="solid" colorScheme="primary" size="sm" isLoading={busy === 'compress'} loadingText="Compressing…" disabled={!!busy} onClick={doCompress}>Compress PDF</TkxButton>
        {result && (
          <div className="v2-smart__result">
            <p>{fmtKB(result.before)} → <strong>{fmtKB(result.after)}</strong> ({Math.round((1 - result.after / result.before) * 100)}% smaller)</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <TkxButton className="v2-smart__link" variant="link" size="sm" onClick={() => downloadBytes(`${name}-compressed.pdf`, result.bytes, 'application/pdf')}>Download</TkxButton>
              <TkxButton className="v2-smart__link" variant="link" size="sm" onClick={() => onOpenBytes(result.bytes, `${name}-compressed`)}>Open in editor</TkxButton>
            </div>
          </div>
        )}
      </div>

      <div className="v2-smart__tag-box">
        <strong>Flatten form fields</strong>
        <p className="v2-smart__note">Bake form values into the page so they render everywhere and can’t be edited.</p>
        <TkxButton className="v2-smart__btn" variant="outline" size="sm" isLoading={busy === 'flatten'} loadingText="Flattening…" disabled={!!busy} onClick={doFlatten}>Flatten & download</TkxButton>
      </div>

      <div className="v2-smart__tag-box">
        <strong>Extract images</strong>
        <p className="v2-smart__note">Pull the embedded raster images out as PNGs.</p>
        <TkxButton className="v2-smart__btn" variant="outline" size="sm" isLoading={busy === 'extract'} loadingText="Extracting…" disabled={!!busy} onClick={doExtract}>Extract embedded images</TkxButton>
      </div>

      <div className="v2-smart__tag-box">
        <strong>PDF/A (archival)</strong>
        <p className="v2-smart__note">Convert to image-based PDF/A-1b for long-term archiving — our own sRGB ICC OutputIntent + XMP, no fonts to embed. Built to spec; image-only (no selectable text). Certify with veraPDF.</p>
        <TkxButton className="v2-smart__btn" variant="solid" colorScheme="primary" size="sm" isLoading={busy === 'pdfa'} loadingText="Archiving…" disabled={!!busy} onClick={doPdfA}>Convert to PDF/A</TkxButton>
      </div>
    </div>
  );
}

function MarksTab({
  ensurePages,
  onAddAnnotations,
  onJumpToPage,
  flash,
}: {
  ensurePages: () => Promise<PageRuns[]>;
  onAddAnnotations: (a: Annotation[]) => void;
  onJumpToPage: (p: number) => void;
  flash: (m: string) => void;
}) {
  const [text, setText] = useState('CONFIDENTIAL');
  const [opacity, setOpacity] = useState(0.18);
  const [numFormat, setNumFormat] = useState('{n} / {total}');
  const [busy, setBusy] = useState(false);

  const addWatermark = async () => {
    if (!text.trim()) { flash('Enter watermark text first.'); return; }
    setBusy(true);
    try {
      const pages = await ensurePages();
      if (pages.length === 0) return;
      const anns = watermarkAnnotations(pages, text, { opacity });
      onAddAnnotations(anns);
      onJumpToPage(1);
      flash(`Watermark "${text.trim()}" added to ${anns.length} page(s). Save to keep it.`);
    } catch (e) {
      flash('Failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const addPageNumbers = async () => {
    setBusy(true);
    try {
      const pages = await ensurePages();
      if (pages.length === 0) return;
      const anns = pageNumberAnnotations(pages, { format: numFormat });
      onAddAnnotations(anns);
      onJumpToPage(1);
      flash(`Page numbers added to ${anns.length} page(s). Save to keep them.`);
    } catch (e) {
      flash('Failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="v2-smart__pane">
      <p className="v2-smart__lead">Stamp a diagonal watermark or footer page numbers across every page. Added as overlays — review on the page, undo anytime, Save to bake in.</p>

      <div className="v2-smart__tag-box">
        <strong>Watermark</strong>
        <TkxInput label="Text" value={text} onChange={(e) => setText(e.target.value)} placeholder="CONFIDENTIAL" />
        <label className="v2-smart__field">
          <span>Opacity {Math.round(opacity * 100)}%</span>
          <TkxSlider size="sm" min={0.05} max={0.6} step={0.01} value={opacity} onChange={setOpacity} />
        </label>
        <TkxButton className="v2-smart__btn" variant="solid" colorScheme="primary" size="sm" isLoading={busy} loadingText="Adding…" disabled={busy} onClick={addWatermark}>Add watermark to all pages</TkxButton>
      </div>

      <div className="v2-smart__tag-box">
        <strong>Page numbers</strong>
        <p className="v2-smart__note">Use {'{n}'} for the page number and {'{total}'} for the count.</p>
        <TkxInput label="Format" value={numFormat} onChange={(e) => setNumFormat(e.target.value)} placeholder="{n} / {total}" />
        <TkxButton className="v2-smart__btn" variant="solid" colorScheme="primary" size="sm" isLoading={busy} loadingText="Adding…" disabled={busy} onClick={addPageNumbers}>Add page numbers</TkxButton>
      </div>
    </div>
  );
}
