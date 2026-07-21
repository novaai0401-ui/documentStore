/**
 * The offline document library. Persists each open document (content + metadata)
 * to a KV store so a refresh or a closed tab never loses work, and lists recent
 * documents to reopen. Content is held in each editor's native shape — text,
 * Word HTML, sheet rows, slides, or PDF bytes — the same shapes templates use,
 * so reopening rebuilds the editor exactly.
 */
import { openKv, type Kv } from './kv.js';
import type { Slide } from '../smart/convert.js';
// Documents-only build: legacy design records may still exist in a user's local
// library, so these fields are kept for backward-compatible reads, but the
// creative studio (and its types) has been removed. They are typed opaquely.
type Design = unknown;
type AnchoredComment = unknown;

export type StoredKind = 'text' | 'word' | 'sheet' | 'slides' | 'pdf' | 'design';

export interface DocContent {
  text?: string;
  html?: string;
  rows?: string[][];
  slides?: Slide[];
  bytes?: Uint8Array;
  design?: Design;
  /** Multi-page designs (campaign). When present, `design` mirrors the active
   *  page for backward compatibility (older readers and library thumbnails). */
  pages?: Design[];
  /** Element-anchored review comments (design studio). */
  anchoredComments?: AnchoredComment[];
}

/** Lightweight listing entry (no heavy content) for the recent-documents view. */
export interface DocMeta {
  id: string;
  name: string;
  ext: string;
  kind: StoredKind;
  updatedAt: number;
  themeId?: string;
}

export interface DocRecord extends DocMeta {
  content: DocContent;
}

const DOC = (id: string) => `doc:${id}`;
const INDEX = 'doc:index';
const LAST = 'doc:last';
/** Cap the library so IndexedDB never grows unbounded; oldest are evicted. */
const MAX_DOCS = 50;

let kv: Kv | null = null;
const store = (): Kv => (kv ??= openKv());

/** Inject a KV (tests use an in-memory one). */
export function configureDocStore(next: Kv): void { kv = next; }

export function newDocId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const readIndex = async (): Promise<DocMeta[]> => (await store().get<DocMeta[]>(INDEX)) ?? [];
const writeIndex = (list: DocMeta[]) => store().set(INDEX, list);

/** Save (insert or update) a document and refresh the recents index, evicting
 *  the oldest documents past the cap. */
export async function saveDoc(rec: DocRecord): Promise<void> {
  await store().set(DOC(rec.id), rec);
  const meta: DocMeta = { id: rec.id, name: rec.name, ext: rec.ext, kind: rec.kind, updatedAt: rec.updatedAt, themeId: rec.themeId };
  let idx = [meta, ...(await readIndex()).filter((m) => m.id !== rec.id)];
  if (idx.length > MAX_DOCS) {
    const evict = idx.slice(MAX_DOCS);
    idx = idx.slice(0, MAX_DOCS);
    await Promise.all(evict.map((m) => store().del(DOC(m.id))));
  }
  await writeIndex(idx);
}

export const loadDoc = (id: string): Promise<DocRecord | undefined> => store().get<DocRecord>(DOC(id));

/** Save a copy of a document under a new id; returns the new id (or null). */
export async function duplicateDoc(id: string): Promise<string | null> {
  const rec = await loadDoc(id);
  if (!rec) return null;
  const newId = newDocId();
  await saveDoc({ ...rec, id: newId, name: `${rec.name} (copy)`, updatedAt: Date.now() });
  return newId;
}

/** Recent documents, newest first. */
export async function listRecent(limit = 12): Promise<DocMeta[]> {
  const idx = await readIndex();
  return [...idx].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
}

export async function deleteDoc(id: string): Promise<void> {
  await store().del(DOC(id));
  await writeIndex((await readIndex()).filter((m) => m.id !== id));
  if ((await getLastOpen()) === id) await store().del(LAST);
}

export const setLastOpen = (id: string): Promise<void> => store().set(LAST, id);
export const getLastOpen = (): Promise<string | undefined> => store().get<string>(LAST);
export const clearLastOpen = (): Promise<void> => store().del(LAST);
