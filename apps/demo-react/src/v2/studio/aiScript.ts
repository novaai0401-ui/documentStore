/**
 * AI script-writing for the Text-to-video (Script → reel) tool.
 *
 * Calls the app's OWN same-origin proxy at `/api/ai/*` — never a third-party
 * endpoint and never with a key in the browser. The proxy (scripts/serve.mjs)
 * holds the Groq key(s) from the server environment and rotates them on quota,
 * so this feature is free for every visitor when the site owner has configured a
 * key on Render. When no key is configured the proxy reports `enabled:false`,
 * `isAiScriptEnabled()` resolves false, and the UI simply hides the button.
 *
 * The prompt builder and response parser are pure (unit-tested); only
 * `generateReelScript` / `isAiScriptEnabled` touch the network.
 */

const STATUS_URL = '/api/ai/status';
const CHAT_URL = '/api/ai/chat/completions';

export interface ScriptOptions {
  /** Rough length: how many short lines/scenes the reel should have. */
  lines?: number;
  /** Tone, e.g. "energetic", "calm", "funny", "professional". */
  tone?: string;
  /** Output language, e.g. "English", "Hindi", "Hinglish", "Marathi". */
  language?: string;
}

/** True when the server has an AI key configured (probes the proxy once). */
export async function isAiScriptEnabled(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(STATUS_URL, { signal });
    if (!res.ok) return false;
    const data = (await res.json()) as { enabled?: boolean };
    return !!data.enabled;
  } catch {
    return false;
  }
}

/** System + user messages that turn a topic into a punchy, caption-ready reel
 *  script — one short thought per line, no scene numbers or camera directions. */
export function buildScriptMessages(topic: string, opts: ScriptOptions = {}): { role: 'system' | 'user'; content: string }[] {
  const lines = Math.min(Math.max(opts.lines ?? 5, 3), 10);
  const tone = opts.tone?.trim() || 'energetic and friendly';
  const language = opts.language?.trim() || 'English';
  return [
    {
      role: 'system',
      content:
        `You are a short-form video scriptwriter for Instagram Reels, YouTube Shorts and WhatsApp status. ` +
        `Write scripts that are punchy and easy to read as on-screen captions. ` +
        `Rules: reply with ONLY the script — no title, no preamble, no hashtags, no emojis unless essential, ` +
        `no scene numbers and no camera or director notes. ` +
        `Put ONE short thought on each line (roughly ${lines} lines). ` +
        `Start with a strong hook line and end with a clear call-to-action. ` +
        `Language: ${language}. Tone: ${tone}.`,
    },
    { role: 'user', content: `Topic: ${topic.trim()}\n\nWrite the reel script now.` },
  ];
}

/** Pull the assistant text out of the OpenAI/Groq chat-completions shape. */
export function parseScriptResponse(json: unknown): string {
  const content = (json as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('The AI returned an empty script. Try rephrasing the topic.');
  return tidyScript(content);
}

/** Strip stray markdown/quotes/leading bullets so the text drops straight into
 *  the script box as clean caption lines. */
export function tidyScript(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, '')) // unwrap code fences
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/^["'“”]+|["'“”]+$/g, '').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Generate a reel script from a topic via the server proxy. Throws a
 *  user-readable Error on failure (quota, network, disabled). */
export async function generateReelScript(topic: string, opts: ScriptOptions = {}, signal?: AbortSignal): Promise<string> {
  if (!topic.trim()) throw new Error('Type a topic first, e.g. “3 morning habits that changed my life”.');
  let res: Response;
  try {
    res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: buildScriptMessages(topic, opts), temperature: 0.8, max_tokens: 500 }),
      signal,
    });
  } catch {
    throw new Error('Could not reach the AI service. Check your connection and try again.');
  }
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error || `AI request failed (${res.status}).`);
  }
  return parseScriptResponse(await res.json());
}
