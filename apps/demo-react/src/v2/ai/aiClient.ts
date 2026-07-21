/**
 * Pluggable AI client.
 *
 * There is no backend in pdfcraft, so the model connection is a host
 * concern. This module supports three layers, in priority order:
 *
 *   1. A host-supplied `onAsk` function (the `AppV2` prop). Full control —
 *      the host can proxy to their own server, inject auth, log, etc.
 *   2. A configurable HTTP endpoint + API key entered in the UI and kept in
 *      localStorage. By default this targets the Anthropic Messages API
 *      shape, but any Anthropic-compatible proxy works. NOTE: putting a key
 *      in the browser is fine for personal/demo use but exposes it to the
 *      page — production deployments should use option 1 with a server-side
 *      proxy and leave the key field blank.
 *   3. An offline heuristic stub, so the feature is fully usable with no key
 *      and no network (extractive summary + keyword Q&A over the doc text).
 *
 * Nothing here is committed with secrets; the key only ever lives in the
 * user's own localStorage.
 */

import { generateLocal } from './local/localGen.js';

export interface AiConfig {
  /** Messages endpoint. Empty → use the offline stub. */
  endpoint: string;
  /** API key. Sent as x-api-key (+ Bearer) — never persisted server-side. */
  apiKey: string;
  /** Model id. */
  model: string;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  endpoint: '',
  model: 'claude-opus-4-8',
  apiKey: '',
};

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AskParams {
  /** Conversation so far (excluding the system prompt). */
  messages: AiMessage[];
  /** Document/region context the model should ground its answer in. */
  context: string;
  /** Overrides the default system prompt when set. */
  system?: string;
  config: AiConfig;
  /** Host override — when provided, this is used and config is ignored. */
  onAsk?: HostAskHook;
  signal?: AbortSignal;
}

/** Host hook signature exposed as the `AppV2` `onAiAsk` prop. */
export type HostAskHook = (params: {
  messages: AiMessage[];
  context: string;
  system: string;
}) => Promise<string>;

const DEFAULT_SYSTEM = `You are an assistant embedded in a PDF editor. Answer questions about the
user's document using ONLY the provided document text as ground truth. Be
concise and specific. When you reference information, cite the page like
"(p. 3)". If the answer is not in the document, say so plainly.`;

const CONTEXT_LIMIT = 60_000;

function clampContext(context: string): string {
  return context.length > CONTEXT_LIMIT ? context.slice(0, CONTEXT_LIMIT) + '\n…[truncated]' : context;
}

/**
 * Ask the model. Resolves to the assistant's text. Falls back to the
 * offline stub when no host hook and no endpoint+key are configured.
 */
export async function askAi(params: AskParams): Promise<string> {
  const { messages, context, config, onAsk, signal } = params;
  const system = (params.system ?? DEFAULT_SYSTEM) + '\n\n--- DOCUMENT ---\n' + clampContext(context);

  if (onAsk) {
    return onAsk({ messages, context, system });
  }

  if (config.endpoint && config.apiKey) {
    return askOverHttp(config, system, messages, signal);
  }

  // On-device model (if a WebGPU generator plugin is registered) — fully private,
  // smarter than the extractive stub. Returns null when unavailable.
  const local = await generateLocal({ system: params.system ?? DEFAULT_SYSTEM, messages, context }, { signal });
  if (local) return local;

  // Offline heuristic fallback.
  return stubAnswer(messages, context);
}

/**
 * POST to the configured endpoint. Two request shapes are supported and
 * auto-detected from the URL:
 *
 *   • OpenAI / chat-completions shape (OpenAI, Groq, Together, Mistral,
 *     OpenRouter, LM Studio, Ollama, …) — endpoints ending in
 *     `/chat/completions`. The system prompt is the first message with
 *     role:"system"; there is NO top-level `system` property (sending one is
 *     a 400 "property 'system' is unsupported", e.g. on Groq).
 *   • Anthropic Messages shape — `/v1/messages`. Top-level `system`, plus the
 *     anthropic-* headers.
 *
 * The response parser already tolerates both `choices[].message.content`
 * (OpenAI) and `content[].text` (Anthropic).
 */
function isOpenAiShape(endpoint: string): boolean {
  return /\/chat\/completions\/?$/i.test(endpoint.trim());
}

async function askOverHttp(
  config: AiConfig,
  system: string,
  messages: AiMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const openai = isOpenAiShape(config.endpoint);

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  let body: Record<string, unknown>;

  if (openai) {
    // Bearer auth; system prompt folded into the messages array.
    headers.authorization = `Bearer ${config.apiKey}`;
    body = {
      model: config.model,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: system },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    };
  } else {
    // Anthropic Messages shape.
    headers['x-api-key'] = config.apiKey;
    headers.authorization = `Bearer ${config.apiKey}`;
    headers['anthropic-version'] = '2023-06-01';
    // Required by the Anthropic API to allow calls straight from a browser.
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
    body = {
      model: config.model,
      max_tokens: 1024,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };
  }

  const res = await fetch(config.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`AI request failed (${res.status}). ${detail.slice(0, 300)}`);
  }
  const data: unknown = await res.json();
  return extractText(data);
}

/** Pull the assistant text out of common response shapes. */
function extractText(data: unknown): string {
  const d = data as Record<string, unknown>;
  // Anthropic: { content: [{ type:'text', text }] }
  if (Array.isArray(d?.content)) {
    const parts = (d.content as Array<{ type?: string; text?: string }>)
      .filter((c) => c.type === 'text' || typeof c.text === 'string')
      .map((c) => c.text ?? '');
    if (parts.length) return parts.join('\n').trim();
  }
  // OpenAI-ish: { choices: [{ message: { content } }] }
  const choices = d?.choices as Array<{ message?: { content?: string }; text?: string }> | undefined;
  if (choices?.length) return (choices[0].message?.content ?? choices[0].text ?? '').trim();
  // Plain shapes.
  if (typeof d?.text === 'string') return d.text.trim();
  if (typeof d?.reply === 'string') return d.reply.trim();
  return JSON.stringify(data).slice(0, 500);
}

// ─────────────────────────────────────────────────────────────────────────────
//   Offline stub — keeps every AI surface usable with no key / no network.
//   Extractive only: it never invents text, it locates relevant lines.
// ─────────────────────────────────────────────────────────────────────────────

const STOP = new Set(
  'the a an and or of to in on for with is are was were be by as at this that it from your you our we i what which who how why when where summarize summary explain tell me about please give'.split(
    ' ',
  ),
);

export function stubAnswer(messages: AiMessage[], context: string): string {
  const q = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const lines = context.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return 'No readable text was found in this document, so the offline assistant has nothing to work with. Add an AI endpoint + key in Settings for full answers.';
  }
  const lower = q.toLowerCase();

  const wantsSummary = /summar|overview|tl;?dr|what is this|key points?|about/.test(lower);
  if (wantsSummary || q.trim() === '') {
    const head = lines.slice(0, 8);
    return (
      '**Offline summary** (extractive — connect an AI endpoint in Settings for a real summary):\n\n' +
      head.map((l) => `• ${l.slice(0, 160)}`).join('\n') +
      `\n\n_Document has ${lines.length} text lines._`
    );
  }

  // Keyword retrieval: score lines by overlap with the question's keywords.
  const terms = lower
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  if (terms.length === 0) {
    return 'Offline mode needs a keyword to search for. Try asking about a specific word in the document, or add an AI endpoint + key in Settings.';
  }
  const scored = lines
    .map((l) => {
      const ll = l.toLowerCase();
      const score = terms.reduce((s, t) => s + (ll.includes(t) ? 1 : 0), 0);
      return { l, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  if (scored.length === 0) {
    return `I couldn't find “${terms.join(', ')}” in the document text (offline keyword search). Add an AI endpoint + key in Settings for a smarter answer.`;
  }
  return (
    '**Offline keyword match** (connect an AI endpoint for reasoning):\n\n' +
    scored.map((s) => `• ${s.l.slice(0, 200)}`).join('\n')
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   localStorage persistence for the config
// ─────────────────────────────────────────────────────────────────────────────

const STORE_KEY = 'pdfcraft.ai.config';

export function loadAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { ...DEFAULT_AI_CONFIG };
    return { ...DEFAULT_AI_CONFIG, ...(JSON.parse(raw) as Partial<AiConfig>) };
  } catch {
    return { ...DEFAULT_AI_CONFIG };
  }
}

export function saveAiConfig(cfg: AiConfig): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}
