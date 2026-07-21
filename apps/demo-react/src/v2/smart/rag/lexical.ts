/**
 * Zero-download lexical embedder. Maps text to a fixed-dimension, L2-normalised
 * vector via feature hashing of unigrams + bigrams, so cosine similarity works
 * as a lexical retriever with no model and no network. It implements the same
 * Embedder interface as the (future) on-device neural embedder, so the rest of
 * the RAG pipeline is identical — swap the embedder, keep everything else.
 */
import type { Embedder } from './ragIndex.js';
import { normalize } from './vector.js';

const DIM = 512;

/** Lowercase alphanumeric tokens, length ≥ 2. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []);
}

/** Stable 32-bit FNV-1a hash → bucket index. */
function bucket(token: string, dim: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % dim;
}

/** Feature-hash buckets for each unigram + bigram occurrence in `text`. */
function* bucketsOf(text: string, dim: number): Generator<number> {
  const toks = tokenize(text);
  for (let i = 0; i < toks.length; i++) {
    yield bucket(toks[i]!, dim);
    if (i + 1 < toks.length) yield bucket(toks[i]! + '_' + toks[i + 1]!, dim);
  }
}

export function lexicalVector(text: string, dim = DIM): number[] {
  const v = new Array<number>(dim).fill(0);
  for (const b of bucketsOf(text, dim)) v[b] += 1;
  return normalize(v);
}

export const lexicalEmbedder: Embedder = {
  dim: DIM,
  embed: (texts: string[]) => Promise.resolve(texts.map((t) => lexicalVector(t, DIM))),
};

/**
 * A TF-IDF-weighted lexical embedder fitted to a corpus. Terms common across the
 * corpus are down-weighted and rare, distinctive terms dominate — markedly better
 * retrieval relevance than raw term counts, still zero-download and deterministic.
 * The query is embedded with the same IDF weights so cosine stays meaningful.
 */
export function buildTfidfEmbedder(corpus: string[], dim = DIM): Embedder {
  const N = Math.max(1, corpus.length);
  const df = new Array<number>(dim).fill(0);
  for (const doc of corpus) {
    const seen = new Set<number>();
    for (const b of bucketsOf(doc, dim)) seen.add(b);
    for (const b of seen) df[b] += 1;
  }
  const idf = df.map((d) => Math.log(1 + N / (1 + d)));
  const embed = (text: string): number[] => {
    const v = new Array<number>(dim).fill(0);
    for (const b of bucketsOf(text, dim)) v[b] += idf[b]!; // term frequency × IDF
    return normalize(v);
  };
  return { dim, embed: (texts: string[]) => Promise.resolve(texts.map(embed)) };
}
