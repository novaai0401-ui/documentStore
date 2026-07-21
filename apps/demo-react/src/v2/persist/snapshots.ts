/**
 * Version snapshots — point-in-time copies of a document you can name and
 * restore, stored locally alongside the library. Lightweight version history
 * without a server: save before a risky edit, browse past versions, restore one.
 * The KV is injectable so it can be unit-tested with an in-memory store.
 */
import { openKv, type Kv } from './kv.js';
import type { DocContent } from './docStore.js';

export interface SnapshotMeta {
  id: string;
  docId: string;
  label: string;
  createdAt: number;
  /** The version this one was created from — makes history a branching graph so a
   *  restore-then-edit forks a new line instead of overwriting the future. */
  parentId?: string;
}

export interface Snapshot extends SnapshotMeta {
  content: DocContent;
}

/** Keep history bounded so IndexedDB never grows without limit. */
const MAX_PER_DOC = 25;
const SNAP = (id: string) => `snap:${id}`;
const INDEX = (docId: string) => `snapidx:${docId}`;

let kv: Kv | null = null;
export function configureSnapshots(next: Kv): void { kv = next; }
const store = (): Kv => (kv ??= openKv());

function snapId(): string {
  return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Save a named snapshot of a document's content; prunes the oldest past the cap.
 *  `parentId` records which version it branched from (for the history graph). */
export async function saveSnapshot(docId: string, label: string, content: DocContent, parentId?: string): Promise<SnapshotMeta> {
  const kvs = store();
  const meta: SnapshotMeta = { id: snapId(), docId, label: label.trim() || new Date().toLocaleString(), createdAt: Date.now(), parentId };
  await kvs.set<Snapshot>(SNAP(meta.id), { ...meta, content });

  const index = (await kvs.get<SnapshotMeta[]>(INDEX(docId))) ?? [];
  index.unshift(meta); // newest first
  const keep = index.slice(0, MAX_PER_DOC);
  for (const dropped of index.slice(MAX_PER_DOC)) await kvs.del(SNAP(dropped.id));
  await kvs.set(INDEX(docId), keep);
  return meta;
}

/** Snapshots for a document, newest first. */
export async function listSnapshots(docId: string): Promise<SnapshotMeta[]> {
  return (await store().get<SnapshotMeta[]>(INDEX(docId))) ?? [];
}

/** Load one snapshot's full content. */
export async function getSnapshot(id: string): Promise<Snapshot | undefined> {
  return store().get<Snapshot>(SNAP(id));
}

export async function deleteSnapshot(docId: string, id: string): Promise<void> {
  const kvs = store();
  await kvs.del(SNAP(id));
  const index = (await kvs.get<SnapshotMeta[]>(INDEX(docId))) ?? [];
  await kvs.set(INDEX(docId), index.filter((m) => m.id !== id));
}
