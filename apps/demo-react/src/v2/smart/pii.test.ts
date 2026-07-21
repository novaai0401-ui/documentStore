import { describe, it, expect } from 'vitest';
import { scanPii, piiToRedactions, type PiiType } from './pii.js';
import type { PageRuns } from './util.js';
import type { TextRun } from '../pdfText.js';

const run = (text: string): TextRun => ({ text, x: 0, y: 0, width: 100, height: 10, fontSize: 10 });
const page = (...lines: string[]): PageRuns => ({ page: 1, vpWidth: 600, vpHeight: 800, source: 'text', runs: lines.map(run) });
const all = new Set<PiiType>(['email', 'ssn', 'phone', 'credit-card', 'iban', 'ip', 'date']);
const scanLine = (text: string, types = all) => scanPii([page(text)], types);

describe('scanPii detectors', () => {
  it('finds emails, SSNs and IPs', () => {
    expect(scanLine('reach me at jane.doe@example.co.uk').map((m) => m.type)).toContain('email');
    expect(scanLine('SSN 123-45-6789').some((m) => m.type === 'ssn')).toBe(true);
    expect(scanLine('host 192.168.0.1').some((m) => m.type === 'ip')).toBe(true);
    expect(scanLine('not an ip 999.999.0.1').some((m) => m.type === 'ip')).toBe(false);
  });

  it('accepts a Luhn-valid card and rejects an invalid one', () => {
    expect(scanLine('card 4111 1111 1111 1111').some((m) => m.type === 'credit-card')).toBe(true);
    expect(scanLine('card 4111 1111 1111 1112').some((m) => m.type === 'credit-card')).toBe(false);
  });

  it('validates IBANs with the mod-97 check', () => {
    expect(scanLine('IBAN GB82 WEST 1234 5698 7654 32').some((m) => m.type === 'iban')).toBe(true);
    expect(scanLine('IBAN GB82 WEST 1234 5698 7654 33').some((m) => m.type === 'iban')).toBe(false);
  });

  it('only returns the enabled types', () => {
    const out = scanLine('a@b.com 123-45-6789', new Set<PiiType>(['ssn']));
    expect(out.every((m) => m.type === 'ssn')).toBe(true);
  });

  it('reports page, value and span offsets', () => {
    const [m] = scanLine('x a@b.com');
    expect(m).toMatchObject({ page: 1, type: 'email', value: 'a@b.com', runIndex: 0, start: 2 });
    expect(m!.end).toBe(2 + 'a@b.com'.length);
  });
});

describe('piiToRedactions', () => {
  it('produces one annotation per (selected) match', () => {
    const pages = [page('a@b.com and c@d.com')];
    const matches = scanPii(pages, new Set<PiiType>(['email']));
    expect(matches).toHaveLength(2);
    expect(piiToRedactions(pages, matches)).toHaveLength(2);
    expect(piiToRedactions(pages, matches, new Set([0]))).toHaveLength(1);
  });
});
