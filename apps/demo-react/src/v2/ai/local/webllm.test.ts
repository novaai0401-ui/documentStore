import { describe, it, expect, beforeEach } from 'vitest';
import { mlcModelId, localAiEnabled, setLocalAiEnabled } from './webllm.js';

// Environment-independent localStorage stub (the runner may use the node env).
beforeEach(() => {
  const m = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
  } as Storage;
});

describe('webllm plugin (pure parts)', () => {

  it('maps our model ids to MLC ids (and null for unknown)', () => {
    expect(mlcModelId('qwen2.5-0.5b-instruct')).toBe('Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
    expect(mlcModelId('phi-3.5-mini-instruct')).toContain('Phi-3.5');
    expect(mlcModelId('nope')).toBeNull();
  });

  it('on-device AI is opt-in: off by default, persists when toggled', () => {
    expect(localAiEnabled()).toBe(false);          // never on by default → no surprise downloads
    setLocalAiEnabled(true);
    expect(localAiEnabled()).toBe(true);
    setLocalAiEnabled(false);
    expect(localAiEnabled()).toBe(false);
  });
});
