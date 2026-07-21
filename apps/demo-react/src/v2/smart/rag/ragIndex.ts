/**
 * In-memory retrieval index. An Embedder turns text into vectors; the index
 * keeps chunk vectors and answers nearest-neighbour queries. The Embedder is
 * injected, so the lexical (no-download) embedder and a future on-device neural
 * embedder are interchangeable. Pure aside from the injected embedder.
 */
import type { Chunk } from './chunk.js';
import { topK } from './vector.js';

export interface Embedder {
  /** Vector dimensionality. */
  dim: number;
  /** Embed a batch of texts into vectors (one per input). */
  embed(texts: string[]): Promise<number[][]>;
}

export interface IndexedChunk extends Chunk {
  vector: number[];
}

export interface Retrieved {
  chunk: Chunk;
  score: number;
}

export class RagIndex {
  private chunks: IndexedChunk[] = [];

  add(items: IndexedChunk[]): void {
    this.chunks.push(...items);
  }

  get size(): number {
    return this.chunks.length;
  }

  /** Top-k chunks by cosine similarity to a query vector (best first). */
  query(queryVec: number[], k = 4): Retrieved[] {
    return topK(queryVec, this.chunks.map((c) => c.vector), k)
      .filter((r) => r.score > 0)
      .map((r) => ({ chunk: this.chunks[r.index]!, score: r.score }));
  }
}

/** Embed chunks and build an index in one step. */
export async function buildIndex(embedder: Embedder, chunks: Chunk[]): Promise<RagIndex> {
  const idx = new RagIndex();
  if (chunks.length === 0) return idx;
  const vectors = await embedder.embed(chunks.map((c) => c.text));
  idx.add(chunks.map((c, i) => ({ ...c, vector: vectors[i] ?? [] })));
  return idx;
}

/** Embed a question and retrieve its top-k supporting chunks. */
export async function retrieve(index: RagIndex, embedder: Embedder, question: string, k = 4): Promise<Retrieved[]> {
  const [qv] = await embedder.embed([question]);
  return qv ? index.query(qv, k) : [];
}
