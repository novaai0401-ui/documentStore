/**
 * WebLLM plugin for the on-device generation runtime (Pillar A). This is the
 * actual WebGPU model that makes localGen "light up": it lazily imports
 * @mlc-ai/web-llm (a separate bundle chunk), spins up an MLC engine for a small
 * instruct model, and exposes a LocalGenerator. Registered via
 * registerLocalGenerator so the rest of the pipeline is unchanged.
 *
 * Opt-in by design: a model is a large download, so we NEVER auto-fetch on page
 * load. The user enables on-device AI (setLocalAiEnabled), and even then the
 * weights download lazily on first use and are cached by the browser.
 */
import { registerLocalGenerator, detectLocalCaps, pickLocalModel, type LocalGenerator } from './localGen.js';

/** Our model ids → MLC (WebLLM) model ids. */
const MLC_MODELS: Record<string, string> = {
  'qwen2.5-0.5b-instruct': 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
  'phi-3.5-mini-instruct': 'Phi-3.5-mini-instruct-q4f16_1-MLC',
};
export function mlcModelId(localId: string): string | null { return MLC_MODELS[localId] ?? null; }

const ENABLE_KEY = 'pyntra:local-ai';
export function localAiEnabled(): boolean { try { return localStorage.getItem(ENABLE_KEY) === 'on'; } catch { return false; } }
export function setLocalAiEnabled(on: boolean): void { try { localStorage.setItem(ENABLE_KEY, on ? 'on' : 'off'); } catch { /* */ } }

/**
 * Build a LocalGenerator backed by WebLLM, or null if the device/model can't run
 * or the engine fails to load. Heavy import is dynamic so it stays out of the
 * main bundle. `onProgress` reports the one-time model download/init.
 */
export async function createWebllmGenerator(onProgress?: (p: { text: string; progress: number }) => void): Promise<LocalGenerator | null> {
  const model = pickLocalModel(detectLocalCaps());
  const mlcId = model && mlcModelId(model.id);
  if (!mlcId) return null;
  try {
    const webllm = await import('@mlc-ai/web-llm');
    const engine = await webllm.CreateMLCEngine(mlcId, { initProgressCallback: (r) => onProgress?.({ text: r.text, progress: r.progress }) });
    return async (prompt, opts) => {
      const res = await engine.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: opts?.maxTokens ?? 512,
        temperature: 0.6,
      });
      return res.choices?.[0]?.message?.content ?? '';
    };
  } catch {
    return null; // unsupported / load failure → caller falls back to the heuristic stub
  }
}

/** Wire WebLLM into the runtime IF the user has opted in and the device supports
 *  WebGPU. Safe to call once at startup; a no-op otherwise. The model itself only
 *  downloads on first actual AI use (the registered factory is lazy). */
export function initLocalAi(onProgress?: (p: { text: string; progress: number }) => void): void {
  if (!localAiEnabled()) return;
  if (!detectLocalCaps().webgpu) return;
  registerLocalGenerator(() => createWebllmGenerator(onProgress));
}
