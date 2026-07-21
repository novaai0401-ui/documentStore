import { describe, it, expect, vi, afterEach } from 'vitest';
import { askAi } from './aiClient.js';

interface Captured { url: string; init: RequestInit }

function stubFetch(response: unknown): Captured[] {
  const calls: Captured[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { ok: true, json: async () => response } as unknown as Response;
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('askAi HTTP request shape', () => {
  it('OpenAI/Groq endpoint: folds system into a system message, no top-level `system`', async () => {
    const calls = stubFetch({ choices: [{ message: { content: 'answer' } }] });
    const out = await askAi({
      messages: [{ role: 'user', content: 'q1' }],
      context: 'DOCTEXT',
      config: { endpoint: 'https://api.groq.com/openai/v1/chat/completions', apiKey: 'k', model: 'llama' },
    });
    expect(out).toBe('answer');

    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.system).toBeUndefined(); // the Groq 400 trigger must be gone
    expect(body.model).toBe('llama');
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('DOCTEXT');
    expect(body.messages[1]).toEqual({ role: 'user', content: 'q1' });
    // Bearer auth, no anthropic headers.
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer k');
    expect(headers['anthropic-version']).toBeUndefined();
  });

  it('Anthropic endpoint: keeps top-level `system` + anthropic headers', async () => {
    const calls = stubFetch({ content: [{ type: 'text', text: 'reply' }] });
    const out = await askAi({
      messages: [{ role: 'user', content: 'q' }],
      context: 'CTX',
      config: { endpoint: 'https://api.anthropic.com/v1/messages', apiKey: 'sk', model: 'claude' },
    });
    expect(out).toBe('reply');

    const body = JSON.parse(calls[0]!.init.body as string);
    expect(typeof body.system).toBe('string');
    expect(body.system).toContain('CTX');
    expect(body.messages.find((m: { role: string }) => m.role === 'system')).toBeUndefined();
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  });
});
