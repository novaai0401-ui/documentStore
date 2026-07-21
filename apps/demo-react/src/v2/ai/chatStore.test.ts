import { describe, it, expect, beforeEach } from 'vitest';
import { titleFrom, toMarkdown, newChatId, configureChatStore, saveConversation, listConversations, getConversation, deleteConversation, type AiConversation } from './chatStore.js';

// In-memory KV so the CRUD round-trip is testable in Node.
function memKv() {
  const m = new Map<string, unknown>();
  return { get: async <T>(k: string) => m.get(k) as T | undefined, set: async <T>(k: string, v: T) => { m.set(k, v); }, del: async (k: string) => { m.delete(k); }, keys: async () => [...m.keys()] };
}
beforeEach(() => configureChatStore(memKv()));

const convo = (id: string, ts: number, q = 'Hello'): AiConversation => ({ id, title: q, turns: [{ role: 'user', content: q }, { role: 'assistant', content: 'Hi!' }], updatedAt: ts });

describe('AI chat store', () => {
  it('derives a title from the first user turn', () => {
    expect(titleFrom([{ role: 'assistant', content: 'x' }, { role: 'user', content: 'What is RAG?' }])).toBe('What is RAG?');
    expect(titleFrom([])).toBe('New chat');
  });

  it('exports a conversation to Markdown', () => {
    const md = toMarkdown(convo('c1', Date.now(), 'Summarize this'));
    expect(md).toContain('# Summarize this');
    expect(md).toContain('**You:**');
    expect(md).toContain('**AI:**');
  });

  it('mints unique ids', () => {
    expect(newChatId()).not.toBe(newChatId());
  });

  it('saves, lists (newest first), gets and deletes', async () => {
    await saveConversation(convo('c1', 1));
    await saveConversation(convo('c2', 2));
    expect((await listConversations()).map((m) => m.id)).toEqual(['c2', 'c1']);
    expect((await getConversation('c1'))?.turns).toHaveLength(2);
    await deleteConversation('c1');
    expect((await listConversations()).map((m) => m.id)).toEqual(['c2']);
    expect(await getConversation('c1')).toBeNull();
  });

  it('upserts without duplicating the index entry', async () => {
    await saveConversation(convo('c1', 1));
    await saveConversation({ ...convo('c1', 5), title: 'Updated' });
    const list = await listConversations();
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toBe('Updated');
  });
});
