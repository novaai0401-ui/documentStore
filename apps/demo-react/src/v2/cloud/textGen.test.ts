import { describe, it, expect } from 'vitest';
import { buildChatRequest, parseChatResponse, canChat, bulletPrompt, summaryPrompt, letterPrompt, jdLetterPrompt, jdSummaryPrompt } from './textGen.js';

const cfg = { endpoint: 'https://api.example.com/v1/', apiKey: 'sk-x', model: 'gpt-image-1', chatModel: 'gpt-4o-mini' };

describe('textGen', () => {
  it('builds an OpenAI-style chat request with the chat model', () => {
    const { url, init } = buildChatRequest(cfg, [{ role: 'user', content: 'hi' }]);
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.messages[0]).toEqual({ role: 'user', content: 'hi' });
  });

  it('falls back to the image model when no chatModel is set', () => {
    const body = JSON.parse(buildChatRequest({ ...cfg, chatModel: undefined }, []).init.body as string);
    expect(body.model).toBe('gpt-image-1');
  });

  it('parses the assistant message; throws on empty', () => {
    expect(parseChatResponse({ choices: [{ message: { content: '• Did a thing' } }] })).toBe('• Did a thing');
    expect(() => parseChatResponse({ choices: [] })).toThrow();
  });

  it('canChat requires endpoint, key and a chat model', () => {
    expect(canChat(cfg)).toBe(true);
    expect(canChat({ ...cfg, chatModel: '' })).toBe(false);
    expect(canChat(undefined)).toBe(false);
  });

  it('bulletPrompt includes the role and existing notes', () => {
    const m = bulletPrompt('Designer', 'Acme', 'made stuff');
    expect(m[1].content).toContain('Designer');
    expect(m[1].content).toContain('Acme');
    expect(m[1].content).toContain('made stuff');
  });

  it('summaryPrompt and letterPrompt carry the key details', () => {
    expect(summaryPrompt('Jane', 'PM', 'Acme').map((m) => m.content).join(' ')).toContain('Jane');
    const l = letterPrompt('Jane', 'PM', 'Globex', 'roles').map((m) => m.content).join(' ');
    expect(l).toContain('Globex');
    expect(l).toContain('Jane');
  });

  it('job-description prompts include the pasted JD', () => {
    expect(jdLetterPrompt('Jane', 'PM', 'Globex', 'Must know SQL').map((m) => m.content).join(' ')).toContain('Must know SQL');
    expect(jdSummaryPrompt('PM', 'roles', 'Needs leadership').map((m) => m.content).join(' ')).toContain('Needs leadership');
  });
});
