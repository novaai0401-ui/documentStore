/**
 * AI chat session store — keeps "Ask AI" conversations in the browser (IndexedDB)
 * so a refresh or reopen restores the thread, and lets the user export a chat to
 * a local Markdown file. BYOK-friendly: only the conversation text is stored
 * locally; the API key lives in the separate AI config and is never written here.
 * Pure helpers (title, markdown) are unit-tested; CRUD uses the shared KV.
 */
import { openKv, type Kv } from '../persist/kv.js';

export interface AiTurn { role: 'user' | 'assistant'; content: string }
export interface AiConversation { id: string; title: string; turns: AiTurn[]; updatedAt: number }
export interface AiConvoMeta { id: string; title: string; updatedAt: number }

const KEY = (id: string) => `aichat:${id}`;
const INDEX = 'aichat:index';
const MAX = 60;

let kv: Kv | null = null;
const store = (): Kv => (kv ??= openKv());
/** Test seam. */
export function configureChatStore(next: Kv): void { kv = next; }

export function newChatId(): string { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/** A short title from the first user turn (or a fallback). */
export function titleFrom(turns: AiTurn[]): string {
  const first = turns.find((t) => t.role === 'user')?.content.replace(/\s+/g, ' ').trim();
  return first ? first.slice(0, 48) : 'New chat';
}

/** Export a conversation as readable Markdown for local download. */
export function toMarkdown(c: AiConversation): string {
  const head = `# ${c.title}\n\n_${new Date(c.updatedAt).toLocaleString()}_\n`;
  const body = c.turns.map((t) => `\n**${t.role === 'user' ? 'You' : 'AI'}:**\n\n${t.content}\n`).join('');
  return head + body;
}

const readIndex = async (): Promise<AiConvoMeta[]> => (await store().get<AiConvoMeta[]>(INDEX)) ?? [];

/** Conversations, newest first (metadata only). */
export async function listConversations(): Promise<AiConvoMeta[]> {
  return [...(await readIndex())].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getConversation(id: string): Promise<AiConversation | null> {
  return (await store().get<AiConversation>(KEY(id))) ?? null;
}

/** Upsert a conversation and keep the index (capped, oldest evicted). */
export async function saveConversation(c: AiConversation): Promise<void> {
  const kvs = store();
  await kvs.set(KEY(c.id), c);
  const meta: AiConvoMeta = { id: c.id, title: c.title, updatedAt: c.updatedAt };
  let index = (await readIndex()).filter((m) => m.id !== c.id);
  index.unshift(meta);
  if (index.length > MAX) { for (const drop of index.slice(MAX)) await kvs.del(KEY(drop.id)); index = index.slice(0, MAX); }
  await kvs.set(INDEX, index);
}

export async function deleteConversation(id: string): Promise<void> {
  const kvs = store();
  await kvs.del(KEY(id));
  await kvs.set(INDEX, (await readIndex()).filter((m) => m.id !== id));
}
