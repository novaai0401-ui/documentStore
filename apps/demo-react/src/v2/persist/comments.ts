/**
 * Document comments — lightweight, local review notes attached to a document.
 * Add, list, resolve/reopen and delete; stored in the same local KV as the
 * library (injectable for tests). No server, nothing uploaded. This is the data
 * layer for async review/collaboration on top of the existing CRDT live editing.
 */
import { openKv, type Kv } from './kv.js';

export interface Comment {
  id: string;
  docId: string;
  author: string;
  text: string;
  createdAt: number;
  resolved: boolean;
}

const MAX_PER_DOC = 200;
const KEY = (docId: string) => `comments:${docId}`;

let kv: Kv | null = null;
export function configureComments(next: Kv): void { kv = next; }
const store = (): Kv => (kv ??= openKv());

function cid(): string {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function read(docId: string): Promise<Comment[]> {
  return (await store().get<Comment[]>(KEY(docId))) ?? [];
}
async function write(docId: string, list: Comment[]): Promise<void> {
  await store().set(KEY(docId), list.slice(-MAX_PER_DOC));
}

/** Append a comment (chronological order). Empty text is rejected. */
export async function addComment(docId: string, author: string, text: string): Promise<Comment | null> {
  if (!text.trim()) return null;
  const c: Comment = { id: cid(), docId, author: author.trim() || 'You', text: text.trim(), createdAt: Date.now(), resolved: false };
  await write(docId, [...(await read(docId)), c]);
  return c;
}

/** Comments for a document, oldest first. */
export function listComments(docId: string): Promise<Comment[]> {
  return read(docId);
}

export async function setResolved(docId: string, id: string, resolved: boolean): Promise<void> {
  await write(docId, (await read(docId)).map((c) => (c.id === id ? { ...c, resolved } : c)));
}

export async function deleteComment(docId: string, id: string): Promise<void> {
  await write(docId, (await read(docId)).filter((c) => c.id !== id));
}

/** Count of open (unresolved) comments — handy for a badge. */
export async function openCount(docId: string): Promise<number> {
  return (await read(docId)).filter((c) => !c.resolved).length;
}
