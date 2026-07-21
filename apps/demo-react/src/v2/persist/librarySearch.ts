/**
 * Local semantic search across the whole library. Loads every stored document,
 * extracts and chunks its text, fits a TF-IDF embedder to the combined corpus,
 * and ranks chunks against the query — returning the best passages with their
 * source document. 100% on-device; nothing is uploaded.
 */
import { listRecent, loadDoc, type StoredKind } from './docStore.js';
import { docToText } from './docText.js';
import { chunkText, type Chunk } from '../smart/rag/chunk.js';
import { buildIndex, retrieve } from '../smart/rag/ragIndex.js';
import { selectEmbedder } from '../smart/rag/embedderSelect.js';

export interface LibraryHit {
  docId: string;
  name: string;
  kind: StoredKind;
  page?: number;
  snippet: string;
  score: number;
}

interface Meta { docId: string; name: string; kind: StoredKind }

const snippet = (text: string, max = 180): string => (text.length <= max ? text : text.slice(0, max).replace(/\s+\S*$/, '') + '…');

/** Rank passages across all saved documents for `query` (best first). */
export async function searchLibrary(query: string, k = 8): Promise<LibraryHit[]> {
  if (!query.trim()) return [];
  const metas = await listRecent(50);

  const chunks: Chunk[] = [];
  // Key by a globally-unique chunk id (buildIndex copies chunk objects, so a
  // reference-keyed map would miss).
  const metaOf = new Map<string, Meta>();
  for (const m of metas) {
    const rec = await loadDoc(m.id);
    if (!rec) continue;
    for (const pg of docToText(rec)) {
      for (const ch of chunkText(pg.text, { size: 700, overlap: 100, page: pg.page })) {
        const id = `${m.id}#${ch.id}`;
        chunks.push({ ...ch, id });
        metaOf.set(id, { docId: m.id, name: m.name, kind: m.kind });
      }
    }
  }
  if (chunks.length === 0) return [];

  const embedder = await selectEmbedder(chunks.map((c) => c.text));
  const index = await buildIndex(embedder, chunks);
  const hits = await retrieve(index, embedder, query, k);

  const out = hits.flatMap((h) => {
    const meta = metaOf.get(h.chunk.id);
    return meta ? [{ docId: meta.docId, name: meta.name, kind: meta.kind, page: h.chunk.page, snippet: snippet(h.chunk.text), score: h.score }] : [];
  });
  if (out.length) return out;

  // Fallback: plain keyword/substring scan. The on-device lexical embedder scores
  // 0 when no query term overlaps the vocabulary, so a literal search (a name, a
  // phrase) would otherwise find nothing even though the text is right there.
  return keywordScan(chunks, metaOf, query, k);
}

/** Case-insensitive substring/keyword match over the chunks (always finds literal text). */
function keywordScan(chunks: Chunk[], metaOf: Map<string, Meta>, query: string, k: number): LibraryHit[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  if (!terms.length) return [];
  const seen = new Set<string>();
  const scored: LibraryHit[] = [];
  for (const ch of chunks) {
    const low = ch.text.toLowerCase();
    let score = 0;
    for (const t of terms) if (low.includes(t)) score++;
    if (!score) continue;
    const meta = metaOf.get(ch.id);
    if (!meta || seen.has(meta.docId + '#' + ch.page)) continue;
    seen.add(meta.docId + '#' + ch.page);
    scored.push({ docId: meta.docId, name: meta.name, kind: meta.kind, page: ch.page, snippet: snippet(ch.text), score: score / terms.length });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, k);
}
