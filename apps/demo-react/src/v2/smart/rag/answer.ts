/**
 * One-call RAG orchestration: chunk a document, embed + index it, retrieve the
 * passages most relevant to a question, and build a grounded prompt. The caller
 * supplies the embedder (lexical now, on-device neural later) and runs the chat
 * model on the returned messages — keeping retrieval local and model-agnostic.
 */
import type { ChatMessage } from '../../cloud/textGen.js';
import { chunkPages, type Chunk, type ChunkOptions } from './chunk.js';
import { buildIndex, retrieve, type Embedder, type Retrieved } from './ragIndex.js';
import { groundedPrompt } from './ragPrompt.js';
import { selectEmbedder } from './embedderSelect.js';

export interface GroundedQuery {
  messages: ChatMessage[];
  passages: Retrieved[];
}

/** Build the grounded chat messages + supporting passages for a question. */
export async function buildGroundedQuery(
  pages: Array<{ page: number; text: string }>,
  question: string,
  embedder: Embedder,
  k = 4,
  chunkOpts?: ChunkOptions,
): Promise<GroundedQuery> {
  const index = await buildIndex(embedder, chunkPages(pages, chunkOpts));
  const passages = await retrieve(index, embedder, question, k);
  return { messages: groundedPrompt(question, passages), passages };
}

/**
 * Zero-config grounded query: chunk the document, fit the best available local
 * embedder (TF-IDF now, on-device neural when present) to those chunks, then
 * retrieve and build the prompt. Nothing leaves the device.
 */
export async function buildGroundedQueryLocal(
  pages: Array<{ page: number; text: string }>,
  question: string,
  k = 4,
  chunkOpts?: ChunkOptions,
): Promise<GroundedQuery> {
  const chunks: Chunk[] = chunkPages(pages, chunkOpts);
  const embedder = await selectEmbedder(chunks.map((c) => c.text));
  const index = await buildIndex(embedder, chunks);
  const passages = await retrieve(index, embedder, question, k);
  return { messages: groundedPrompt(question, passages), passages };
}
