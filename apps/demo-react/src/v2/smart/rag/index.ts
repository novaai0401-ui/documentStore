/** Public API for the on-device retrieval (RAG) pipeline. */
export { chunkText, chunkPages, type Chunk, type ChunkOptions } from './chunk.js';
export { dot, cosine, normalize, topK, type Ranked } from './vector.js';
export { tokenize, lexicalVector, lexicalEmbedder, buildTfidfEmbedder } from './lexical.js';
export { RagIndex, buildIndex, retrieve, type Embedder, type IndexedChunk, type Retrieved } from './ragIndex.js';
export { groundedPrompt, formatContext } from './ragPrompt.js';
export { buildGroundedQuery, buildGroundedQueryLocal, type GroundedQuery } from './answer.js';
export { selectEmbedder, registerNeuralEmbedder } from './embedderSelect.js';
