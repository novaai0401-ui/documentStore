import { describe, it, expect } from 'vitest';
import { STUDIO_TEMPLATES, TEMPLATE_CATEGORIES } from './templates.js';

describe('STUDIO_TEMPLATES', () => {
  it('every template has a unique id and builds a valid design', () => {
    const ids = new Set<string>();
    for (const t of STUDIO_TEMPLATES) {
      expect(t.id, `duplicate id ${t.id}`).not.toBe(undefined);
      expect(ids.has(t.id), `duplicate id ${t.id}`).toBe(false);
      ids.add(t.id);
      expect(TEMPLATE_CATEGORIES).toContain(t.category);
      const d = t.make();
      expect(d.w).toBeGreaterThan(0);
      expect(d.h).toBeGreaterThan(0);
      expect(Array.isArray(d.elements)).toBe(true);
      expect(d.elements.length).toBeGreaterThan(0);
      // every element carries an id + type, and stays on-canvas-ish (no NaN)
      for (const el of d.elements) {
        expect(el.id, `${t.id} element missing id`).toBeTruthy();
        expect(typeof el.type).toBe('string');
        if ('x' in el) { expect(Number.isFinite(el.x)).toBe(true); expect(Number.isFinite(el.y)).toBe(true); }
      }
    }
  });

  it('the new photo cards each expose a photo slot and a message', () => {
    for (const id of ['bday-photo-wish', 'bday-photo-bold', 'bday-photo-modern']) {
      const t = STUDIO_TEMPLATES.find((x) => x.id === id);
      expect(t, `missing template ${id}`).toBeTruthy();
      const d = t!.make();
      const slots = d.elements.filter((e) => e.type === 'image' && (e as { placeholder?: boolean }).placeholder);
      expect(slots.length, `${id} needs a photo slot`).toBeGreaterThanOrEqual(1);
      const hasText = d.elements.some((e) => e.type === 'text' && ((e as { text?: string }).text || '').length > 12);
      expect(hasText, `${id} needs a message`).toBe(true);
    }
  });

  it('the collage template has multiple photo slots and a message', () => {
    const t = STUDIO_TEMPLATES.find((x) => x.id === 'collage-message')!;
    const d = t.make();
    const slots = d.elements.filter((e) => e.type === 'image' && (e as { placeholder?: boolean }).placeholder);
    expect(slots.length).toBeGreaterThanOrEqual(4);
    const msg = d.elements.some((e) => e.type === 'text' && /memor|love|together/i.test((e as { text?: string }).text || ''));
    expect(msg).toBe(true);
  });
});
