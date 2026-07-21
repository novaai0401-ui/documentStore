import { describe, it, expect } from 'vitest';
import { chunkText, chunkPages } from './chunk.js';
import { cosine, normalize, topK, dot } from './vector.js';
import { tokenize, lexicalVector, lexicalEmbedder } from './lexical.js';
import { buildIndex, retrieve, RagIndex } from './ragIndex.js';
import { groundedPrompt, formatContext } from './ragPrompt.js';

describe('chunkText', () => {
  it('returns one chunk for short text and empty for blank', () => {
    expect(chunkText('hello world')).toHaveLength(1);
    expect(chunkText('   \n  ')).toEqual([]);
  });

  it('splits long text into overlapping, word-aligned chunks', () => {
    const text = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const chunks = chunkText(text, { size: 80, overlap: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => !c.text.includes('  '))).toBe(true);
    // consecutive chunks overlap (share a boundary word)
    const firstTail = chunks[0]!.text.split(' ').slice(-1)[0]!;
    expect(chunks[1]!.text).toContain(firstTail.replace(/\W/g, ''));
  });

  it('chunkPages preserves page numbers', () => {
    const out = chunkPages([{ page: 1, text: 'alpha beta' }, { page: 2, text: 'gamma delta' }]);
    expect(out.map((c) => c.page)).toEqual([1, 2]);
  });
});

describe('vector math', () => {
  it('cosine: identical = 1, orthogonal = 0, zero-safe', () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
  it('normalize makes a unit vector', () => {
    const n = normalize([3, 4]);
    expect(dot(n, n)).toBeCloseTo(1, 6);
  });
  it('topK returns best-first', () => {
    const r = topK([1, 0], [[0, 1], [1, 0], [0.7, 0.7]], 2);
    expect(r[0]!.index).toBe(1);
    expect(r).toHaveLength(2);
  });
});

describe('lexical embedder', () => {
  it('tokenizes to lowercase alphanumerics ≥2 chars', () => {
    expect(tokenize('Hello, a WORLD-42!')).toEqual(['hello', 'world', '42']);
  });
  it('produces unit vectors and ranks lexically-similar text higher', () => {
    const q = lexicalVector('annual revenue and profit');
    expect(dot(q, q)).toBeCloseTo(1, 5);
    const close = cosine(q, lexicalVector('the annual revenue grew, profit rose'));
    const far = cosine(q, lexicalVector('a cat sat on the warm mat'));
    expect(close).toBeGreaterThan(far);
  });
});

describe('index + retrieval (end-to-end with lexical embedder)', () => {
  it('retrieves the most relevant chunk', async () => {
    const chunks = chunkPages([
      { page: 1, text: 'The cat sat on the mat and purred softly.' },
      { page: 2, text: 'Quarterly revenue rose 20% driven by enterprise sales.' },
      { page: 3, text: 'The mountain trail was steep and covered in snow.' },
    ], { size: 200 });
    const index = await buildIndex(lexicalEmbedder, chunks);
    expect(index.size).toBe(chunks.length);
    const hits = await retrieve(index, lexicalEmbedder, 'how did revenue and sales perform?', 1);
    expect(hits[0]!.chunk.page).toBe(2);
  });

  it('empty index returns nothing', async () => {
    const idx = new RagIndex();
    expect(idx.query([1, 2, 3], 3)).toEqual([]);
  });
});

describe('groundedPrompt', () => {
  it('embeds page-cited context and the question', () => {
    const passages = [{ chunk: { id: '2:0', text: 'Revenue rose 20%.', page: 2, start: 0 }, score: 0.9 }];
    expect(formatContext(passages)).toContain('[1, p.2] Revenue rose 20%.');
    const msgs = groundedPrompt('What about revenue?', passages);
    expect(msgs[0]!.role).toBe('system');
    expect(msgs[1]!.content).toContain('Revenue rose 20%.');
    expect(msgs[1]!.content).toContain('What about revenue?');
  });
});

import { buildGroundedQuery } from './answer.js';

describe('buildGroundedQuery (one-call orchestration)', () => {
  it('chunks, retrieves and builds grounded messages', async () => {
    const pages = [
      { page: 1, text: 'Onboarding takes two weeks and covers tools and process.' },
      { page: 2, text: 'The refund policy allows returns within 30 days of purchase.' },
    ];
    const { messages, passages } = await buildGroundedQuery(pages, 'what is the refund window?', lexicalEmbedder, 2);
    expect(passages[0]!.chunk.page).toBe(2);
    expect(messages[1]!.content).toContain('refund');
  });
});

import { buildTfidfEmbedder } from './lexical.js';
import { selectEmbedder, registerNeuralEmbedder } from './embedderSelect.js';
import { cosine as cos } from './vector.js';

describe('TF-IDF embedder', () => {
  it('down-weights corpus-common terms so a rare match ranks higher', async () => {
    const corpus = ['common alpha', 'common beta', 'common gamma', 'common unicorn'];
    const emb = buildTfidfEmbedder(corpus);
    const [q, rare, commonOnly] = await emb.embed(['common unicorn', 'common unicorn', 'common delta']);
    // The doc sharing the rare term "unicorn" should be closer than one sharing
    // only the ubiquitous "common".
    expect(cos(q!, rare!)).toBeGreaterThan(cos(q!, commonOnly!));
  });

  it('produces unit vectors', async () => {
    const emb = buildTfidfEmbedder(['hello world', 'foo bar baz']);
    const [v] = await emb.embed(['hello foo']);
    expect(Math.hypot(...v!)).toBeCloseTo(1, 5);
  });
});

describe('selectEmbedder', () => {
  it('falls back to TF-IDF when no neural embedder is registered', async () => {
    const emb = await selectEmbedder(['a b c', 'd e f']);
    expect(typeof emb.embed).toBe('function');
    expect(emb.dim).toBeGreaterThan(0);
  });

  it('uses a registered neural embedder, and falls back if it fails', async () => {
    const fake = { dim: 3, embed: (t: string[]) => Promise.resolve(t.map(() => [1, 0, 0])) };
    registerNeuralEmbedder(() => Promise.resolve(fake));
    expect(await selectEmbedder(['x'])).toBe(fake);
    registerNeuralEmbedder(() => Promise.reject(new Error('no model')));
    const fellBack = await selectEmbedder(['x']);
    expect(fellBack).not.toBe(fake);
    registerNeuralEmbedder(() => Promise.resolve(null)); // reset to "none"
  });
});

import { buildGroundedQueryLocal } from './answer.js';
import { registerNeuralEmbedder as regNeural } from './embedderSelect.js';
import { lexicalEmbedder as lex } from './lexical.js';

describe('neural embedder seam (drop-in)', () => {
  it('routes buildGroundedQueryLocal through a registered neural embedder', async () => {
    let used = false;
    regNeural(() => { used = true; return Promise.resolve(lex); }); // stand-in for the on-device model
    const { passages } = await buildGroundedQueryLocal(
      [{ page: 1, text: 'The refund window is thirty days.' }, { page: 2, text: 'Onboarding lasts two weeks.' }],
      'refund window?',
      1,
    );
    expect(used).toBe(true);            // the seam invoked the neural factory
    expect(passages[0]!.chunk.page).toBe(1);
    regNeural(() => Promise.resolve(null)); // reset for other tests
  });
});
