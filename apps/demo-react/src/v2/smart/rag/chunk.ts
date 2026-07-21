/**
 * Text chunking for retrieval. Splits a document into overlapping, word-aligned
 * passages small enough to embed and rank, large enough to carry context. Pure
 * and deterministic — no DOM, no network.
 */
export interface Chunk {
  id: string;
  text: string;
  /** 1-based page/section the chunk came from, when known. */
  page?: number;
  /** Char offset of the chunk within the (whitespace-normalised) source. */
  start: number;
}

export interface ChunkOptions {
  /** Target chunk length in characters. */
  size?: number;
  /** Overlap between consecutive chunks (carries context across the seam). */
  overlap?: number;
  page?: number;
}

/** Split one block of text into overlapping, word-boundary chunks. */
export function chunkText(text: string, opts: ChunkOptions = {}): Chunk[] {
  const size = Math.max(64, opts.size ?? 900);
  const overlap = Math.min(Math.max(0, opts.overlap ?? 150), size - 1);
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const chunks: Chunk[] = [];
  let start = 0;
  let n = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      // Prefer to break on the last space inside the window, not mid-word.
      const back = clean.lastIndexOf(' ', end);
      if (back > start + size - overlap) end = back;
    }
    const slice = clean.slice(start, end).trim();
    if (slice) chunks.push({ id: `${opts.page ?? 0}:${n++}`, text: slice, start, page: opts.page });
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

/** Chunk a multi-page/section document, preserving page numbers in each chunk. */
export function chunkPages(pages: Array<{ page: number; text: string }>, opts: ChunkOptions = {}): Chunk[] {
  return pages.flatMap((p) => chunkText(p.text, { ...opts, page: p.page }));
}
