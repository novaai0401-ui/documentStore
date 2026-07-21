import { describe, it, expect } from 'vitest';
import { safeUrl, sanitizeStyle, sanitizeHtml, escapeHtml, ALLOWED_TAGS, FORBIDDEN_TAGS } from './sanitize.js';

describe('safeUrl', () => {
  it('allows http(s), mailto, tel, relative, anchors, and inline images', () => {
    expect(safeUrl('https://example.com')).toBe('https://example.com');
    expect(safeUrl('http://x.org/a?b#c')).toBe('http://x.org/a?b#c');
    expect(safeUrl('mailto:a@b.com')).toBe('mailto:a@b.com');
    expect(safeUrl('/local/path')).toBe('/local/path');
    expect(safeUrl('page.html')).toBe('page.html');
    expect(safeUrl('#section')).toBe('#section');
    expect(safeUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });

  it('blocks dangerous schemes', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('  JavaScript:alert(1)')).toBeNull();
    expect(safeUrl('vbscript:msgbox(1)')).toBeNull();
    expect(safeUrl('data:text/html,<script>')).toBeNull();
    expect(safeUrl('')).toBeNull();
  });
});

describe('sanitizeStyle', () => {
  it('keeps safe declarations and drops the rest', () => {
    expect(sanitizeStyle('color: red; font-weight: bold')).toBe('color: red; font-weight: bold');
    expect(sanitizeStyle('position: fixed; color: blue')).toBe('color: blue');
  });
  it('drops values with url()/expression/markup', () => {
    expect(sanitizeStyle('background: url(javascript:x)')).toBe('');
    expect(sanitizeStyle('background-color: expression(alert(1))')).toBe('');
    expect(sanitizeStyle('color: <script>')).toBe('');
  });
});

describe('tag policy', () => {
  it('allows formatting tags and forbids script-like tags', () => {
    expect(ALLOWED_TAGS.has('p')).toBe(true);
    expect(ALLOWED_TAGS.has('table')).toBe(true);
    expect(ALLOWED_TAGS.has('script')).toBe(false);
    expect(FORBIDDEN_TAGS.has('script')).toBe(true);
    expect(FORBIDDEN_TAGS.has('iframe')).toBe(true);
    expect(FORBIDDEN_TAGS.has('style')).toBe(true);
  });
});

describe('sanitizeHtml (no-DOM fallback escapes — always safe)', () => {
  it('escapes when there is no DOMParser (Node/SSR)', () => {
    // In the Node test environment DOMParser is undefined, so output is escaped.
    const out = sanitizeHtml('<script>alert(1)</script><b>hi</b>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });
  it('escapeHtml neutralizes angle brackets and quotes', () => {
    expect(escapeHtml('<a href="x">')).toBe('&lt;a href=&quot;x&quot;&gt;');
  });
});
