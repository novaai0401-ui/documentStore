/**
 * AI copy for Prompt-to-design — asks the app's own Groq proxy (`/api/ai/*`,
 * same one that powers "Write with AI" reels; key lives on the server, never in
 * the browser) to write the card's headline / subtitle / message from the
 * user's description. The LAYOUT stays fully on-device and deterministic
 * (promptDesign.ts); AI only improves the words. When the server has no key
 * configured the button hides and the built-in copy is used — nothing breaks.
 *
 * Message builder and parser are pure (unit-tested); only `generateCardCopy`
 * touches the network. Reuses aiScript's status probe for "is AI on?".
 */
import type { PromptCopy, AiCardSpec } from './promptDesign.js';

const CHAT_URL = '/api/ai/chat/completions';

export { isAiScriptEnabled as isDesignAiEnabled } from './aiScript.js';

/** System + user messages that turn a design description into card copy. */
export function buildCardCopyMessages(prompt: string): { role: 'system' | 'user'; content: string }[] {
  return [
    {
      role: 'system',
      content:
        'You write short greeting-card and poster copy for an Indian design app. ' +
        'Given the user\'s description of the card they want (occasion, scene, style, language), ' +
        'reply with ONLY a JSON object — no prose, no markdown fences — of the shape ' +
        '{"headline": string, "subtitle": string, "message": string}. ' +
        'Rules: headline ≤ 5 words (the big wish, e.g. "Happy Diwali"); ' +
        'subtitle ≤ 8 words (a warm second line — use the regional language/script if the user asks, e.g. Marathi, Bengali, Hindi); ' +
        'message ≤ 20 words across at most 2 lines separated by \\n (a heartfelt wish — NEVER repeat the user\'s instructions back). ' +
        'Match the requested language; default to English with a native-script subtitle for Indian festivals. ' +
        'Be culturally respectful: use proper devotional phrasing for festivals (e.g. "Ganpati Bappa Morya", "जय छठी मईया").',
    },
    { role: 'user', content: `Card description: ${prompt.trim()}\n\nWrite the card copy now.` },
  ];
}

/** Parse the model's reply into PromptCopy — tolerant of stray fences/prose,
 *  strict about shape. Throws a user-readable error on garbage. */
export function parseCardCopy(raw: string): PromptCopy {
  const match = raw.replace(/```(?:json)?/g, '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('The AI reply had no copy in it. Try rephrasing.');
  let obj: unknown;
  try { obj = JSON.parse(match[0]); } catch { throw new Error('The AI reply could not be read. Try again.'); }
  const o = obj as Record<string, unknown>;
  const pick = (k: string, max: number): string | undefined => {
    const v = o[k];
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
  };
  const copy: PromptCopy = { headline: pick('headline', 60), subtitle: pick('subtitle', 80), message: pick('message', 160) };
  if (!copy.headline && !copy.message) throw new Error('The AI reply had no usable copy. Try again.');
  return copy;
}

/** System + user messages asking the model to DESIGN the whole card — palette
 *  (incl. gradient), motifs, typography style and layout — as a compact JSON
 *  spec our renderer draws. This is "AI creates the card", not "AI writes the
 *  words": the model makes every visual decision, rendering stays on-device. */
export function buildCardDesignMessages(prompt: string): { role: 'system' | 'user'; content: string }[] {
  return [
    {
      role: 'system',
      content:
        'You are a greeting-card ART DIRECTOR for an Indian design app. From the user\'s description, design a complete card. ' +
        'Reply with ONLY a JSON object — no prose, no markdown fences — of the shape ' +
        '{"bg": "#hex", "bg2": "#hex", "accent": "#hex", "ink": "#hex", "hero": "one emoji", "scatter": ["4 emoji"], ' +
        '"headline": string, "subtitle": string, "message": string, "style": "bold"|"elegant"|"cute"|"3d", "photo": boolean}. ' +
        'Rules: bg→bg2 is a modern gradient (aurora/duotone — 2026 palettes like butter yellow, lilac, emerald-teal, sunset coral; NOT muddy). ' +
        'accent = headline colour with strong contrast on the gradient; ink = supporting text colour, readable on the gradient. ' +
        'hero is the single central motif emoji (for deities NEVER use animal emoji — use 🕉️ 🪷 🪔 🙏). scatter = 4 small decoration emoji. ' +
        'style: "3d" for playful balloon-text moments (kids, birthdays), "elegant" for weddings/anniversaries/festivals, "bold" for hype, "cute" for soft. ' +
        'photo:true when the user mentions a person, "my photo", family, or a personalised card — the card then gets a tap-to-add photo slot. ' +
        'headline ≤ 5 words; subtitle ≤ 8 words (use native script for Indian festivals — e.g. Marathi, Bengali, Hindi — matching the occasion/region); ' +
        'message ≤ 20 words over max 2 lines separated by \\n. Never repeat the user\'s instructions back as card text. Be culturally respectful and devotionally correct.',
    },
    { role: 'user', content: `Card description: ${prompt.trim()}\n\nDesign the card now.` },
  ];
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Parse + validate the model's design spec. Throws readable errors. */
export function parseCardDesign(raw: string): AiCardSpec {
  const match = raw.replace(/```(?:json)?/g, '').match(/\{[\s\S]*\}/);
  if (!match) throw new Error('The AI reply had no design in it. Try rephrasing.');
  let o: Record<string, unknown>;
  try { o = JSON.parse(match[0]) as Record<string, unknown>; } catch { throw new Error('The AI reply could not be read. Try again.'); }
  const hex = (k: string, fallback?: string): string => {
    const v = o[k];
    if (typeof v === 'string' && HEX.test(v.trim())) return v.trim();
    if (fallback) return fallback;
    throw new Error('The AI design was incomplete. Try again.');
  };
  const str = (k: string, max: number): string | undefined => {
    const v = o[k];
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
  };
  const headline = str('headline', 60);
  if (!headline) throw new Error('The AI design had no headline. Try again.');
  const scatter = Array.isArray(o.scatter) ? (o.scatter as unknown[]).filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, 4) : [];
  const style = o.style;
  return {
    bg: hex('bg'),
    bg2: typeof o.bg2 === 'string' && HEX.test((o.bg2 as string).trim()) ? (o.bg2 as string).trim() : undefined,
    accent: hex('accent', '#ffffff'),
    ink: hex('ink', '#ffffff'),
    hero: str('hero', 8) ?? '💌',
    scatter: scatter.length ? scatter : ['✨', '🎉', '💫', '⭐'],
    headline,
    subtitle: str('subtitle', 80),
    message: str('message', 160),
    style: style === 'bold' || style === 'elegant' || style === 'cute' || style === '3d' ? style : undefined,
    photo: o.photo === true,
  };
}

/** Ask the proxy to design the whole card. Throws user-readable errors. */
export async function generateCardDesign(prompt: string, signal?: AbortSignal): Promise<AiCardSpec> {
  if (!prompt.trim()) throw new Error('Describe the card first — occasion, scene and style.');
  let res: Response;
  try {
    res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: buildCardDesignMessages(prompt), temperature: 0.8, max_tokens: 400 }),
      signal,
    });
  } catch {
    throw new Error('Could not reach the AI service. Check your connection and try again.');
  }
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error || `AI request failed (${res.status}).`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('The AI returned nothing. Try again.');
  return parseCardDesign(content);
}

/** Ask the proxy to write card copy for the prompt. Throws a user-readable
 *  Error on failure (disabled, quota, network). */
export async function generateCardCopy(prompt: string, signal?: AbortSignal): Promise<PromptCopy> {
  if (!prompt.trim()) throw new Error('Describe the card first — occasion, scene and style.');
  let res: Response;
  try {
    res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: buildCardCopyMessages(prompt), temperature: 0.7, max_tokens: 220 }),
      signal,
    });
  } catch {
    throw new Error('Could not reach the AI service. Check your connection and try again.');
  }
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error || `AI request failed (${res.status}).`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('The AI returned nothing. Try again.');
  return parseCardCopy(content);
}
