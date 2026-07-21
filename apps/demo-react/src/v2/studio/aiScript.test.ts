import { describe, it, expect } from 'vitest';
import { buildScriptMessages, parseScriptResponse, tidyScript } from './aiScript.js';

describe('aiScript prompt + parsing', () => {
  it('builds a system+user pair with clamped line count and defaults', () => {
    const msgs = buildScriptMessages('morning habits', { lines: 99, tone: 'funny', language: 'Hinglish' });
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('10 lines'); // clamped to max 10
    expect(msgs[0].content).toContain('Hinglish');
    expect(msgs[0].content).toContain('funny');
    expect(msgs[1].content).toContain('morning habits');
  });

  it('defaults language/tone and a sensible line count', () => {
    const s = buildScriptMessages('x')[0].content;
    expect(s).toContain('English');
    expect(s).toContain('5 lines');
  });

  it('extracts the assistant text from the chat-completions shape', () => {
    const out = parseScriptResponse({ choices: [{ message: { content: 'Line one\nLine two' } }] });
    expect(out).toBe('Line one\nLine two');
  });

  it('throws a helpful error on empty content', () => {
    expect(() => parseScriptResponse({ choices: [{ message: { content: '' } }] })).toThrow(/empty/i);
    expect(() => parseScriptResponse({})).toThrow();
  });

  it('tidies markdown bullets, numbering, fences and wrapping quotes', () => {
    const raw = '```\n1. First hook\n- Second line\n* Third\n"Call to action"\n```';
    const out = tidyScript(raw);
    expect(out).toBe('First hook\nSecond line\nThird\nCall to action');
  });
});
