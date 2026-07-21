import { useEffect, useRef, useState } from 'react';
import { TkxInput, TkxCheckbox } from 'tekivex-ui';
import {
  askAi,
  saveAiConfig,
  type AiConfig,
  type AiMessage,
  type HostAskHook,
} from './aiClient.js';
import type { NewFieldKind } from '../Annotations.js';
import { buildGroundedQueryLocal } from '../smart/rag/answer.js';
import { detectLocalCaps } from './local/localGen.js';
import { localAiEnabled, setLocalAiEnabled, initLocalAi } from './local/webllm.js';

export interface FieldSuggestion {
  name: string;
  type: NewFieldKind;
  options?: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  config: AiConfig;
  onConfigChange: (c: AiConfig) => void;
  onAsk?: HostAskHook;
  /** Whole-document text for grounding (page-tagged). */
  getDocText: () => Promise<Array<{ page: number; text: string }>>;
  /** Filled AcroForm values (name → value) so the model can read what the
   *  user actually entered, not just the static labels. */
  getFormValues?: () => Array<{ name: string; value: string }>;
  /** Text + page captured by the "Ask AI" region tool, or null. */
  selection: { page: number; text: string } | null;
  onClearSelection: () => void;
  /** Drop an AI-suggested fillable field onto the page as an annotation. */
  onAddSuggestedField: (f: FieldSuggestion) => void;
}

interface ChatTurn extends AiMessage {
  /** Pages referenced, parsed from "(p. N)" citations for quick jumps. */
  cited?: number[];
}

const FIELD_SYSTEM = `You convert a flat (non-fillable) document into a fillable form. From the
document text, identify the blanks/labels a user would fill in. Respond with
ONLY a JSON array, no prose, each item: {"name": string, "type": one of
"text"|"multiline"|"checkbox"|"dropdown"|"date"|"signature", "options"?: string[]}.
Use "date" for dates, "signature" for signature lines, "dropdown" with options
for clear choice lists, "checkbox" for yes/no. Limit to the 20 most useful.`;

export function AiPanel({
  open,
  onClose,
  config,
  onConfigChange,
  onAsk,
  getDocText,
  getFormValues,
  selection,
  onClearSelection,
  onAddSuggestedField,
}: Props) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(!config.endpoint && !onAsk);
  /** Panel chrome: normal sidebar, minimized pill, or maximized workspace. */
  const [view, setView] = useState<'normal' | 'min' | 'max'>('normal');
  const [suggestions, setSuggestions] = useState<FieldSuggestion[] | null>(null);
  const [ctxInfo, setCtxInfo] = useState<{ chars: number; pages: number; fields: number } | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const offline = !onAsk && !(config.endpoint && config.apiKey);

  // Summarize what the AI can actually read, so "the document is empty" is
  // never a surprise. Recomputes when the document (getDocText identity)
  // changes; both callbacks are memoized by the host.
  useEffect(() => {
    let cancelled = false;
    getDocText()
      .then((pages) => {
        if (cancelled) return;
        const chars = pages.reduce((n, p) => n + p.text.length, 0);
        setCtxInfo({ chars, pages: pages.length, fields: getFormValues?.().length ?? 0 });
      })
      .catch(() => { if (!cancelled) setCtxInfo(null); });
    return () => { cancelled = true; };
  }, [getDocText, getFormValues]);

  // Auto-scroll the thread on new turns.
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [turns, busy]);

  // Surface a region selection as a context chip and seed a default prompt.
  // Intentionally keyed on `selection` only — we don't want to re-seed the
  // prompt every keystroke.
  const seededFor = useRef<unknown>(null);
  useEffect(() => {
    if (selection && seededFor.current !== selection) {
      seededFor.current = selection;
      setInput((cur) => (cur ? cur : 'Explain this part of the document.'));
    }
  }, [selection]);

  async function buildContext(question: string): Promise<string> {
    // Only use the region selection when it actually captured text — an empty
    // drag falls back to the whole document instead of "nothing to explain".
    if (selection && selection.text.trim()) {
      return `The user selected this region on page ${selection.page}:\n"""\n${selection.text}\n"""`;
    }
    const pages = await getDocText();
    const whole = () => pages.map((p) => `[Page ${p.page}]\n${p.text}`).join('\n\n');
    const totalChars = pages.reduce((n, p) => n + p.text.length, 0);

    let ctx: string;
    // For long documents, retrieve only the passages relevant to the question
    // (on-device, no model/network) so the answer stays grounded and in-budget;
    // short documents are sent whole.
    if (totalChars > 6000 && question.trim()) {
      const { passages } = await buildGroundedQueryLocal(pages, question, 6);
      ctx = passages.length
        ? passages.map((p) => `[Page ${p.chunk.page ?? '?'}]\n${p.chunk.text}`).join('\n\n')
        : whole();
    } else {
      ctx = whole();
    }

    const values = getFormValues?.() ?? [];
    if (values.length) {
      ctx += '\n\n[Filled form field values]\n' + values.map((v) => `${v.name}: ${v.value}`).join('\n');
    }
    return ctx;
  }

  function citationsOf(text: string): number[] {
    const out = new Set<number>();
    const re = /\(p\.?\s*(\d+)\)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) out.add(Number(m[1]));
    return [...out];
  }

  async function run(userText: string, system?: string): Promise<string | null> {
    setError(null);
    setBusy(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const context = await buildContext(userText);
      const history = turns.map<AiMessage>((t) => ({ role: t.role, content: t.content }));
      const reply = await askAi({
        messages: [...history, { role: 'user', content: userText }],
        context,
        system,
        config,
        onAsk,
        signal: ctrl.signal,
      });
      return reply;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function send(text: string) {
    const userText = text.trim();
    if (!userText || busy) return;
    setInput('');
    setSuggestions(null);
    setTurns((t) => [...t, { role: 'user', content: userText }]);
    const reply = await run(userText);
    if (reply != null) {
      setTurns((t) => [...t, { role: 'assistant', content: reply, cited: citationsOf(reply) }]);
    }
    onClearSelection();
  }

  async function detectFields() {
    if (busy) return;
    setSuggestions(null);
    setError(null);
    const reply = await run('List the fillable fields for this document.', FIELD_SYSTEM);
    if (reply == null) return;
    const parsed = parseFieldJson(reply);
    setSuggestions(parsed.length ? parsed : heuristicFields(await getDocText()));
  }

  if (!open) return null;

  if (view === 'min') {
    return (
      <button className="v2-panel-pill v2-panel-pill--right" onClick={() => setView('normal')} aria-label="Restore Ask AI">
        ✦ Ask AI
      </button>
    );
  }

  return (
    <aside className={'v2-ai' + (view === 'max' ? ' v2-ai--max' : '')} aria-label="AI assistant">
      <header className="v2-ai__head">
        <strong className="v2-ai__title">✦ Ask AI</strong>
        <div className="v2-ai__head-actions">
          <button className="v2-icon-btn v2-icon-btn--small" onClick={() => setView('min')} aria-label="Minimize" title="Minimize">—</button>
          <button
            className="v2-icon-btn v2-icon-btn--small"
            onClick={() => setView((v) => (v === 'max' ? 'normal' : 'max'))}
            aria-label={view === 'max' ? 'Restore size' : 'Maximize'}
            title={view === 'max' ? 'Restore' : 'Maximize'}
          >{view === 'max' ? '❐' : '⛶'}</button>
          <button
            className="v2-icon-btn v2-icon-btn--small"
            onClick={() => setShowSettings((s) => !s)}
            title="AI settings"
            aria-pressed={showSettings}
          >⚙</button>
          <button className="v2-icon-btn v2-icon-btn--small" onClick={onClose} aria-label="Close AI">×</button>
        </div>
      </header>

      {showSettings && (
        <Settings
          config={config}
          offline={offline}
          hostManaged={!!onAsk}
          onChange={(c) => { onConfigChange(c); saveAiConfig(c); }}
        />
      )}

      <div className="v2-ai__quick">
        <button className="v2-ai__chip" disabled={busy} onClick={() => send('Summarize this document in 5 bullet points.')}>Summarize</button>
        <button className="v2-ai__chip" disabled={busy} onClick={() => send('What are the key dates, names, and amounts in this document?')}>Key facts</button>
        <button className="v2-ai__chip" disabled={busy} onClick={detectFields}>Detect form fields</button>
      </div>

      {offline && (
        <div className="v2-ai__note">
          Offline mode — answers come from a local keyword/extractive helper. Add an endpoint + key in ⚙ for full AI.
        </div>
      )}

      {ctxInfo && !selection && (
        <div className={'v2-ai__ctx' + (ctxInfo.chars === 0 ? ' v2-ai__ctx--warn' : '')}>
          {ctxInfo.chars === 0
            ? '⚠ No selectable text found in this document — run OCR (top bar) so the AI can read it.'
            : `Grounded in ${ctxInfo.chars.toLocaleString()} chars across ${ctxInfo.pages} page${ctxInfo.pages === 1 ? '' : 's'}${ctxInfo.fields ? ` + ${ctxInfo.fields} filled field${ctxInfo.fields === 1 ? '' : 's'}` : ''}.`}
        </div>
      )}

      {selection && (
        <div className="v2-ai__selection">
          <span className="v2-ai__selection-tag">Selected · p.{selection.page}</span>
          <span className="v2-ai__selection-text">{selection.text.slice(0, 140) || '(no text found in region)'}</span>
          <button className="v2-icon-btn v2-icon-btn--small" onClick={onClearSelection} aria-label="Clear selection">×</button>
        </div>
      )}

      <div className="v2-ai__thread" ref={threadRef}>
        {turns.length === 0 && !suggestions && (
          <p className="v2-ai__empty">
            Ask anything about this document, or drag the <strong>Ask AI</strong> tool over a region to ask about just that part.
          </p>
        )}
        {turns.map((t, i) => (
          <div key={i} className={'v2-ai__turn v2-ai__turn--' + t.role}>
            <div className="v2-ai__bubble">{renderText(t.content)}</div>
          </div>
        ))}
        {suggestions && (
          <div className="v2-ai__suggest">
            <div className="v2-ai__suggest-head">
              {suggestions.length} suggested field{suggestions.length === 1 ? '' : 's'} — click ＋ to drop one on the current page, then drag it into place.
            </div>
            {suggestions.map((s, i) => (
              <div key={i} className="v2-ai__suggest-row">
                <span className="v2-ai__suggest-type">{s.type}</span>
                <span className="v2-ai__suggest-name">{s.name}</span>
                <button
                  className="v2-icon-btn v2-icon-btn--small"
                  title="Add this field to the page"
                  onClick={() => onAddSuggestedField(s)}
                >＋</button>
              </div>
            ))}
          </div>
        )}
        {busy && <div className="v2-ai__turn v2-ai__turn--assistant"><div className="v2-ai__bubble v2-ai__bubble--typing">Thinking…</div></div>}
      </div>

      {error && <div className="v2-ai__error">{error}</div>}

      <form
        className="v2-ai__compose"
        onSubmit={(e) => { e.preventDefault(); send(input); }}
      >
        <textarea
          className="v2-ai__input"
          value={input}
          placeholder="Ask about the document…"
          rows={2}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
          }}
        />
        <button className="v2-ai__send" type="submit" disabled={busy || !input.trim()}>Send</button>
      </form>
    </aside>
  );
}

// ── settings sub-panel ───────────────────────────────────────────────────────

function Settings({
  config,
  offline,
  hostManaged,
  onChange,
}: {
  config: AiConfig;
  offline: boolean;
  hostManaged: boolean;
  onChange: (c: AiConfig) => void;
}) {
  return (
    <div className="v2-ai__settings">
      {hostManaged ? (
        <p className="v2-ai__settings-note">AI is wired by the host app (onAiAsk). These fields are unused.</p>
      ) : (
        <>
          <TkxInput
            label="Endpoint URL"
            type="url"
            value={config.endpoint}
            placeholder="https://api.anthropic.com/v1/messages"
            onChange={(e) => onChange({ ...config, endpoint: e.target.value })}
          />
          <TkxInput
            label="API key"
            type="password"
            value={config.apiKey}
            placeholder="sk-…  (stored only in your browser)"
            onChange={(e) => onChange({ ...config, apiKey: e.target.value })}
          />
          <TkxInput
            label="Model"
            type="text"
            value={config.model}
            onChange={(e) => onChange({ ...config, model: e.target.value })}
          />
          <p className="v2-ai__settings-note">
            {offline
              ? 'No endpoint/key set — using the offline helper.'
              : 'Works with Anthropic (…/v1/messages) and OpenAI-style (…/chat/completions, e.g. Groq, OpenRouter, Together, Ollama) endpoints — the shape is auto-detected. Calls go straight from your browser; for production, proxy server-side via the onAiAsk prop and leave the key blank.'}
          </p>
          <LocalAiToggle />
        </>
      )}
    </div>
  );
}

/** Opt-in on-device AI (WebLLM). Off by default — a model is a large download. */
function LocalAiToggle() {
  const [on, setOn] = useState(localAiEnabled());
  const webgpu = detectLocalCaps().webgpu;
  return (
    <div className="v2-ai__field" style={{ marginTop: 8 }}>
      <TkxCheckbox
        label={`Run AI on my device${!webgpu ? ' — needs a WebGPU browser (Chrome/Edge)' : ''}`}
        checked={on}
        disabled={!webgpu}
        onChange={(e) => { const v = e.target.checked; setOn(v); setLocalAiEnabled(v); if (v) initLocalAi(); }}
      />
      <p className="v2-ai__settings-note">
        {on
          ? 'On-device AI is on. A small model (~300 MB) downloads on first use and is cached — fully private, no key, no upload, works offline.'
          : 'Private, offline AI with no key or endpoint. Requires WebGPU; a small model downloads once on first use.'}
      </p>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Very small markdown-ish renderer: **bold** + line breaks. Avoids pulling
 *  a markdown dependency for the few constructs the model tends to emit. */
function renderText(text: string) {
  return text.split('\n').map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
      p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>,
    );
    return <div key={i}>{parts}</div>;
  });
}

const VALID_TYPES = new Set(['text', 'multiline', 'checkbox', 'dropdown', 'date', 'signature']);

function parseFieldJson(reply: string): FieldSuggestion[] {
  const start = reply.indexOf('[');
  const end = reply.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(reply.slice(start, end + 1)) as Array<Record<string, unknown>>;
    return arr
      .map((o) => ({
        name: String(o.name ?? '').trim(),
        type: (VALID_TYPES.has(String(o.type)) ? String(o.type) : 'text') as NewFieldKind,
        options: Array.isArray(o.options) ? (o.options as unknown[]).map(String) : undefined,
      }))
      .filter((f) => f.name)
      .slice(0, 20);
  } catch {
    return [];
  }
}

/** Offline fallback for field detection: lines that look like labels
 *  ("Name:", "Date of birth ____") become text/date fields. */
function heuristicFields(pages: Array<{ page: number; text: string }>): FieldSuggestion[] {
  const out: FieldSuggestion[] = [];
  const seen = new Set<string>();
  for (const p of pages) {
    for (const raw of p.text.split('\n')) {
      const line = raw.trim();
      const m = line.match(/^([A-Za-z][A-Za-z .,/'()-]{1,48}?)\s*[:_]/);
      if (!m) continue;
      const name = m[1].trim();
      if (name.length < 2 || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      const type: NewFieldKind = /date|d\.o\.b|dob|year/i.test(name)
        ? 'date'
        : /sign/i.test(name)
          ? 'signature'
          : 'text';
      out.push({ name, type });
      if (out.length >= 20) return out;
    }
  }
  return out;
}
