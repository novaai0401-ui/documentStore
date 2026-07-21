/**
 * On-device generative AI runtime — Pillar A of the platform architecture. This
 * mirrors the RAG embedder's proven pattern: detect device capability, then use a
 * REGISTERED local generator (a WebGPU model, wired in as a plugin) if one is
 * available, otherwise let the caller fall back. The heavy model (e.g. WebLLM /
 * a small instruct model) is NOT bundled — it's registered via
 * registerLocalGenerator(), so this runtime ships today, is fully unit-tested,
 * and "lights up" the moment a model plugin is added, with zero pipeline change.
 *
 * Once registered, this becomes a new tier in ai/aiClient: smarter than the
 * extractive offline stub, fully private (no key, no upload), no network.
 */

export interface LocalCaps { webgpu: boolean; wasm: boolean }

/** Detect what the device can run. WebGPU is required for a usable LLM; pure-wasm
 *  inference is too slow to offer, so we treat it as "not runnable" for now. */
export function detectLocalCaps(nav: unknown = (globalThis as { navigator?: unknown }).navigator, glob: unknown = globalThis): LocalCaps {
  const n = nav as { gpu?: unknown } | undefined;
  const g = glob as { WebAssembly?: unknown };
  return { webgpu: !!n && typeof n.gpu !== 'undefined', wasm: typeof g.WebAssembly !== 'undefined' };
}

export interface LocalModel { id: string; label: string; engine: 'webllm'; approxMB: number }
/** Curated tiny instruct models a browser can realistically run on WebGPU. */
export const LOCAL_MODELS: LocalModel[] = [
  { id: 'qwen2.5-0.5b-instruct', label: 'Qwen2.5 0.5B (fast, ~300 MB)', engine: 'webllm', approxMB: 300 },
  { id: 'phi-3.5-mini-instruct', label: 'Phi-3.5 mini (better, ~2 GB)', engine: 'webllm', approxMB: 2200 },
];

/** The best model the device can run, or null if none (no WebGPU). */
export function pickLocalModel(caps: LocalCaps): LocalModel | null {
  if (!caps.webgpu) return null;
  return LOCAL_MODELS[0] ?? null; // default to the small, broadly-runnable model
}

export interface LocalAskParams { system?: string; messages: { role: 'user' | 'assistant'; content: string }[]; context?: string }

/** Flatten a chat request into a single instruct-style prompt for a local model. */
export function buildLocalPrompt(p: LocalAskParams): string {
  const parts: string[] = [];
  if (p.system) parts.push(p.system.trim());
  if (p.context && p.context.trim()) parts.push('--- CONTEXT ---\n' + p.context.trim());
  for (const m of p.messages) parts.push(`${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`);
  parts.push('Assistant:');
  return parts.join('\n\n');
}

export type LocalGenerator = (prompt: string, opts?: { maxTokens?: number; signal?: AbortSignal; onToken?: (t: string) => void }) => Promise<string>;

let factory: (() => Promise<LocalGenerator | null>) | null = null;
let cached: LocalGenerator | null = null;

/** Register a model plugin that lazily provides a generator (or null if it can't
 *  load). Called once at startup by whatever bundles the WebGPU model. */
export function registerLocalGenerator(f: () => Promise<LocalGenerator | null>): void { factory = f; cached = null; }

/** Test seam. */
export function _resetLocalGenerator(): void { factory = null; cached = null; }

/** True when a generator plugin is registered AND the device can run a model. */
export function localGenAvailable(caps: LocalCaps = detectLocalCaps()): boolean {
  return !!factory && pickLocalModel(caps) !== null;
}

/**
 * Run on-device generation. Returns the text, or null if no local model is
 * available or it failed — so callers (aiClient) cleanly fall back. Never throws.
 */
export async function generateLocal(params: LocalAskParams, opts?: { maxTokens?: number; signal?: AbortSignal }): Promise<string | null> {
  if (!localGenAvailable()) return null;
  try {
    cached ??= await factory!();
    if (!cached) return null;
    const out = await cached(buildLocalPrompt(params), opts);
    return out?.trim() || null;
  } catch {
    return null; // any failure → caller falls back to the heuristic stub
  }
}
