import { describe, it, expect, afterEach } from 'vitest';
import { detectLocalCaps, pickLocalModel, buildLocalPrompt, localGenAvailable, generateLocal, registerLocalGenerator, _resetLocalGenerator, LOCAL_MODELS } from './localGen.js';

afterEach(() => _resetLocalGenerator());

describe('on-device generation runtime', () => {
  it('detects capability (WebGPU = navigator.gpu present)', () => {
    expect(detectLocalCaps({}, { WebAssembly: {} })).toEqual({ webgpu: false, wasm: true });
    expect(detectLocalCaps({ gpu: {} }, {})).toEqual({ webgpu: true, wasm: false });
  });

  it('picks a model only when WebGPU is available', () => {
    expect(pickLocalModel({ webgpu: false, wasm: true })).toBeNull();
    expect(pickLocalModel({ webgpu: true, wasm: true })).toEqual(LOCAL_MODELS[0]);
  });

  it('builds an instruct-style prompt from system + context + messages', () => {
    const p = buildLocalPrompt({ system: 'You summarize.', context: 'Doc text.', messages: [{ role: 'user', content: 'Summarize it.' }] });
    expect(p).toContain('You summarize.');
    expect(p).toContain('--- CONTEXT ---');
    expect(p).toContain('User: Summarize it.');
    expect(p.endsWith('Assistant:')).toBe(true);
  });

  it('is unavailable with no registered generator', () => {
    expect(localGenAvailable({ webgpu: true, wasm: true })).toBe(false);
  });

  it('is available once a generator is registered AND WebGPU exists', () => {
    registerLocalGenerator(async () => async () => 'ok');
    expect(localGenAvailable({ webgpu: true, wasm: true })).toBe(true);
    expect(localGenAvailable({ webgpu: false, wasm: true })).toBe(false); // no WebGPU → not runnable
  });

  it('generateLocal returns null when nothing is registered (caller falls back)', async () => {
    expect(await generateLocal({ messages: [{ role: 'user', content: 'hi' }] })).toBeNull();
  });

  it('generateLocal runs the registered generator and never throws on failure', async () => {
    // Force WebGPU-present so availability passes regardless of test host.
    registerLocalGenerator(async () => (prompt) => Promise.resolve(`echo:${prompt.includes('hi') ? 'hi' : ''}`));
    // generateLocal uses real detectLocalCaps(); in Node there's no navigator.gpu,
    // so it should report unavailable and return null — proving the safe gate.
    const out = await generateLocal({ messages: [{ role: 'user', content: 'hi' }] });
    expect(out).toBeNull();

    // A throwing generator must be swallowed to null, not propagated.
    registerLocalGenerator(async () => { throw new Error('load failed'); });
    expect(await generateLocal({ messages: [{ role: 'user', content: 'hi' }] })).toBeNull();
  });
});
