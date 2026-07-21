/**
 * Embedder selection — chooses the best available embedder for a corpus.
 *
 * Today: a TF-IDF embedder fitted to the document (zero download, 100% local).
 * Future drop-in: an on-device neural sentence-embedder (ONNX Runtime Web,
 * WebGPU→wasm, weights self-hosted under /models and cached in OPFS). Because it
 * implements the same Embedder interface, retrieval quality upgrades from lexical
 * to true semantic with no change to the pipeline. We never reach out to a
 * third-party model host — if no self-hosted model is present, we stay lexical.
 */
import type { Embedder } from './ragIndex.js';
import { buildTfidfEmbedder } from './lexical.js';

/** Optional neural embedder factory; wired in once a self-hosted model exists. */
let neuralFactory: (() => Promise<Embedder | null>) | null = null;

/** Register an on-device neural embedder factory (returns null if unavailable). */
export function registerNeuralEmbedder(factory: () => Promise<Embedder | null>): void {
  neuralFactory = factory;
}

/**
 * The embedder to use for `corpus`. Tries the registered neural embedder; on any
 * failure or absence, falls back to a TF-IDF embedder fitted to the corpus.
 */
export async function selectEmbedder(corpus: string[]): Promise<Embedder> {
  if (neuralFactory) {
    try {
      const neural = await neuralFactory();
      if (neural) return neural;
    } catch { /* fall through to local */ }
  }
  return buildTfidfEmbedder(corpus);
}
