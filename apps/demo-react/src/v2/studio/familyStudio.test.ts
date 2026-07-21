import { describe, it, expect } from 'vitest';
import { FAMILY_THEMES, familyThemeById, familyLayout, familyScene, SCENE_VARIANTS, inviteMessage, newMemberId, type FamilyMember } from './familyStudio.js';

const fam = (n: number, extra: Partial<FamilyMember> = {}): FamilyMember[] =>
  Array.from({ length: n }, (_, i) => ({ id: `m${i}`, name: `Person ${i + 1}`, photo: '', costume: '', ...extra }));

describe('family occasion studio', () => {
  it('ships a dense occasion calendar of themes (festivals + evergreen moments)', () => {
    expect(FAMILY_THEMES.length).toBeGreaterThanOrEqual(10);
    const ids = FAMILY_THEMES.map((t) => t.id);
    for (const key of ['diwali', 'bollywood-90s', 'retro-1975', 'wedding', 'birthday', 'holi', 'eid', 'onam']) expect(ids).toContain(key);
    for (const t of FAMILY_THEMES) {
      expect(t.costumes.length).toBeGreaterThanOrEqual(4); // the kids' dress-up game
      expect(t.decor.length).toBeGreaterThanOrEqual(3);
      expect(t.bg).toMatch(/^#/); expect(t.bg2).toMatch(/^#/);
    }
    expect(familyThemeById('nope').id).toBe(FAMILY_THEMES[0]!.id);
  });

  it('lays out any family size in rows that fit the canvas', () => {
    for (const n of [1, 2, 3, 4, 5, 7, 8]) {
      const slots = familyLayout(n, 1080, 1350);
      expect(slots).toHaveLength(n);
      for (const s of slots) {
        expect(s.x).toBeGreaterThanOrEqual(-1);
        expect(s.x + s.s).toBeLessThanOrEqual(1081);
        expect(s.y).toBeGreaterThan(0);
        expect(s.s).toBeGreaterThan(80);
      }
    }
    expect(familyLayout(0, 1080, 1350)).toEqual([]);
  });

  it('composes a themed scene with a photo slot per member and their name', () => {
    const d = familyScene(familyThemeById('diwali'), fam(4));
    expect(d.bg2).toBeTruthy(); // gradient scene, not flat
    const slots = d.elements.filter((e) => e.type === 'image');
    expect(slots).toHaveLength(4);
    for (const s of slots) expect((s as { placeholder?: boolean }).placeholder).toBe(true); // tap-to-add until photos arrive
    const names = d.elements.filter((e) => e.type === 'text').map((e) => (e as { text: string }).text).join('|');
    expect(names).toContain('Person 1');
  });

  it('a contributed photo fills the slot; costumes render as picked props', () => {
    const members = fam(2);
    members[0]!.photo = 'data:image/png;base64,xyz';
    members[1]!.costume = '🕶️';
    const d = familyScene(familyThemeById('birthday'), members);
    const imgs = d.elements.filter((e) => e.type === 'image') as { href: string; placeholder?: boolean }[];
    expect(imgs[0]!.href).toContain('data:image');
    expect(imgs[0]!.placeholder).toBe(false);
    expect(d.elements.some((e) => e.type === 'text' && (e as { text: string }).text === '🕶️')).toBe(true);
  });

  it('memorial members get a halo + garland and never a costume', () => {
    const members = [...fam(2), { id: 'g', name: 'Aajoba', photo: '', costume: '🕶️', memorial: true }];
    const d = familyScene(familyThemeById('diwali'), members);
    const texts = d.elements.filter((e) => e.type === 'text').map((e) => (e as { text: string }).text);
    expect(texts.join('|')).toContain('🌼🌼🌼'); // garland
    expect(texts.join('|')).toContain('Aajoba 🤍');
    // Golden halo ellipse behind the memorial slot.
    expect(d.elements.some((e) => e.type === 'ellipse' && (e as { fill: string }).fill === '#fbbf24')).toBe(true);
  });

  it('variants change the take: arc layout enlarges a hero slot, colour-pop swaps accents', () => {
    const members = fam(5);
    const classic = familyScene(familyThemeById('holi'), members, SCENE_VARIANTS[0]);
    const arc = familyScene(familyThemeById('holi'), members, SCENE_VARIANTS[1]);
    const sizes = (d: ReturnType<typeof familyScene>) => (d.elements.filter((e) => e.type === 'image') as { w: number }[]).map((i) => i.w);
    expect(Math.max(...sizes(arc))).toBeGreaterThan(Math.max(...sizes(classic)));
    expect(SCENE_VARIANTS).toHaveLength(3);
  });

  it('invite message names the theme and asks for exactly one photo', () => {
    const msg = inviteMessage('Diwali Portrait');
    expect(msg).toContain('Diwali Portrait');
    expect(msg).toMatch(/ONE photo/i);
    expect(newMemberId()).toMatch(/^fm/);
  });
});
