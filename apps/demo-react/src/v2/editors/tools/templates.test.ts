import { describe, it, expect } from 'vitest';
import { TEMPLATES, templatesByKind, type TemplateKind } from './templates.js';

describe('document templates directory', () => {
  it('has unique ids', () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every template produces seed content matching its kind', () => {
    for (const t of TEMPLATES) {
      const seed = t.make();
      expect(seed.kind).toBe(t.kind);
      expect(seed.name).toBeTruthy();
      expect(seed.ext).toBeTruthy();
      if (t.kind === 'text') expect(typeof seed.text).toBe('string');
      if (t.kind === 'word') expect(seed.html && seed.html.length).toBeTruthy();
      if (t.kind === 'sheet') { expect(Array.isArray(seed.rows)).toBe(true); expect(seed.rows!.length).toBeGreaterThan(0); }
      if (t.kind === 'slides') { expect(Array.isArray(seed.slides)).toBe(true); expect(seed.slides!.length).toBeGreaterThan(0); seed.slides!.forEach((s) => expect(typeof s.title).toBe('string')); }
    }
  });

  it('every editor kind has at least one template', () => {
    for (const kind of ['text', 'word', 'sheet', 'slides'] as TemplateKind[]) {
      expect(templatesByKind(kind).length).toBeGreaterThan(0);
    }
  });

  it('make() is pure — repeated calls return equal seeds', () => {
    const t = TEMPLATES.find((x) => x.id === 'readme')!;
    expect(t.make().text).toBe(t.make().text);
  });

  it('theme presets reference real theme ids', () => {
    const ids = new Set(['clean', 'midnight', 'aurora', 'sunset', 'forest', 'mono']);
    for (const t of TEMPLATES) {
      const theme = t.make().theme;
      if (theme !== undefined) expect(ids.has(theme), `${t.id} → ${theme}`).toBe(true);
    }
    // At least one built-in carries a non-clean preset so the feature is exercised.
    expect(TEMPLATES.some((t) => { const th = t.make().theme; return th && th !== 'clean'; })).toBe(true);
  });
});
