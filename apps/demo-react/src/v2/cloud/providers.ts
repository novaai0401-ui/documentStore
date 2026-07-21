/**
 * Catalog of "bring your own key" AI providers for the image/text modal.
 *
 * The old form only mentioned OpenAI, which made people think other keys
 * (Groq, Together, …) were unsupported. They are supported — every provider
 * here speaks the OpenAI-compatible shapes (`/images/generations`,
 * `/chat/completions`) that imageGen.ts / textGen.ts already post to. Picking
 * a provider just fills in the right endpoint and suggests models.
 *
 * Not every provider generates images: `images` is empty for text-only ones
 * (Groq, Mistral, OpenRouter, local servers). The UI uses that to show text
 * help instead of an image generator, rather than silently 404-ing.
 */

export interface AiProvider {
  /** Stable id, also stored on the saved config. */
  id: string;
  /** Human label shown in the dropdown. */
  label: string;
  /** OpenAI-compatible base URL, e.g. https://api.openai.com/v1 */
  endpoint: string;
  /** Suggested image models. Empty ⇒ this provider does not generate images. */
  images: string[];
  /** Suggested chat models (captions, ideas, rewrites). */
  chats: string[];
  /** Where to create an API key (shown as a hint link). */
  keyUrl?: string;
  /** Local servers (Ollama, LM Studio) need no key. */
  keyless?: boolean;
  /** One-line note shown under the picker. */
  note?: string;
}

export const CUSTOM_PROVIDER_ID = 'custom';

/**
 * Ordered for the dropdown. Image-capable providers first, then text-only,
 * then local, then a free-form "Custom" escape hatch.
 */
export const AI_PROVIDERS: AiProvider[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    images: ['gpt-image-1', 'dall-e-3', 'dall-e-2'],
    chats: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
    keyUrl: 'https://platform.openai.com/api-keys',
    note: 'Images + text. The default.',
  },
  {
    id: 'together',
    label: 'Together AI',
    endpoint: 'https://api.together.xyz/v1',
    images: ['black-forest-labs/FLUX.1-schnell-Free', 'black-forest-labs/FLUX.1-schnell'],
    chats: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'meta-llama/Llama-3.1-8B-Instruct-Turbo'],
    keyUrl: 'https://api.together.ai/settings/api-keys',
    note: 'Images (FLUX) + text. Has a free tier.',
  },
  {
    id: 'groq',
    label: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1',
    images: [],
    chats: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it'],
    keyUrl: 'https://console.groq.com/keys',
    note: 'Very fast text. No image generation — use it for captions & ideas.',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    endpoint: 'https://api.mistral.ai/v1',
    images: [],
    chats: ['mistral-small-latest', 'mistral-large-latest'],
    keyUrl: 'https://console.mistral.ai/api-keys',
    note: 'Text only in this app.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1',
    images: [],
    chats: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'meta-llama/llama-3.3-70b-instruct'],
    keyUrl: 'https://openrouter.ai/keys',
    note: 'One key, many text models.',
  },
  {
    id: 'ollama',
    label: 'Ollama (on your computer)',
    endpoint: 'http://localhost:11434/v1',
    images: [],
    chats: ['llama3.2', 'qwen2.5', 'mistral'],
    keyless: true,
    note: 'Runs locally. Start Ollama first; no key needed.',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (on your computer)',
    endpoint: 'http://localhost:1234/v1',
    images: [],
    chats: ['local-model'],
    keyless: true,
    note: 'Runs locally. Start the LM Studio server; no key needed.',
  },
  {
    id: CUSTOM_PROVIDER_ID,
    label: 'Custom / other',
    endpoint: '',
    images: [],
    chats: [],
    note: 'Any OpenAI-compatible endpoint. Enter the base URL and models yourself.',
  },
];

export function providerById(id: string | undefined | null): AiProvider | undefined {
  return id ? AI_PROVIDERS.find((p) => p.id === id) : undefined;
}

/**
 * Best-effort match of a saved endpoint back to a provider (so reopening the
 * settings restores the dropdown). Falls back to "custom".
 */
export function detectProvider(endpoint: string | undefined | null): string {
  const url = (endpoint ?? '').trim().toLowerCase();
  if (!url) return CUSTOM_PROVIDER_ID;
  const host = (() => {
    try { return new URL(url).host; } catch { return url; }
  })();
  for (const p of AI_PROVIDERS) {
    if (p.id === CUSTOM_PROVIDER_ID || !p.endpoint) continue;
    let ph = '';
    try { ph = new URL(p.endpoint).host; } catch { ph = p.endpoint; }
    if (ph && host === ph) return p.id;
  }
  return CUSTOM_PROVIDER_ID;
}

/** Does the chosen provider generate images? Custom endpoints are assumed yes. */
export function providerDoesImages(id: string | undefined | null): boolean {
  const p = providerById(id);
  if (!p) return true; // unknown/custom → let the user try
  if (p.id === CUSTOM_PROVIDER_ID) return true;
  return p.images.length > 0;
}
