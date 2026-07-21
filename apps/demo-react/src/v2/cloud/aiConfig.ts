/**
 * "Bring your own model" config. pdfcraft's core is 100% on-device; the only way
 * any data leaves is if YOU explicitly configure your own AI endpoint here and use
 * an online feature. The endpoint + key are stored locally (IndexedDB) and used
 * solely to call the endpoint you entered — pdfcraft has no server in the loop.
 */
import { openKv, type Kv } from '../persist/kv.js';

export interface AiImageConfig {
  /** Base URL of an OpenAI-compatible API, e.g. https://api.openai.com/v1 */
  endpoint: string;
  apiKey: string;
  /** Image model id, e.g. gpt-image-1 / dall-e-3 / your self-hosted model name. */
  model: string;
  /** Optional chat/completions model for text help, e.g. gpt-4o-mini. */
  chatModel?: string;
  /** Which provider preset was chosen (see providers.ts). Optional/back-compat. */
  provider?: string;
}

const KEY = 'cloud:ai-image';

let kv: Kv | null = null;
const store = (): Kv => (kv ??= openKv());
/** Inject a KV (tests use an in-memory one). */
export function configureAiStore(next: Kv): void { kv = next; }

export const getAiImageConfig = (): Promise<AiImageConfig | undefined> => store().get<AiImageConfig>(KEY);
export const setAiImageConfig = (c: AiImageConfig): Promise<void> => store().set(KEY, c);
export const clearAiImageConfig = (): Promise<void> => store().del(KEY);

/** A config is usable only when all three fields are filled in. */
export function isConfigured(c: AiImageConfig | undefined | null): c is AiImageConfig {
  return !!c && !!c.endpoint.trim() && !!c.apiKey.trim() && !!c.model.trim();
}
