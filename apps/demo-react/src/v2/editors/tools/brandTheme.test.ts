import { describe, it, expect } from 'vitest';
import { brandKitToTheme } from './brandTheme.js';
import { emptyBrandKit } from './brandStore.js';

describe('brandKitToTheme', () => {
  it('maps the primary colour to the accent and a dark colour to headings/text', () => {
    const kit = { ...emptyBrandKit('Acme'), colors: ['#2e5bff', '#0f172a', '#ffffff'], fonts: { heading: 'Georgia', body: 'Arial' } };
    const t = brandKitToTheme(kit);
    expect(t.id).toBe('brand:' + kit.id);
    expect(t.name).toBe('Acme (brand)');
    expect(t.accent).toBe('#2e5bff');       // primary → accent
    expect(t.heading).toBe('#0f172a');      // darkest → heading
    expect(t.fg).toBe('#0f172a');
    expect(t.bg).toBe('#ffffff');           // a near-white in the palette → background
    expect(t.fontHeading).toBe('Georgia');
    expect(t.fontBody).toBe('Arial');
  });

  it('falls back to white background when no light colour is present', () => {
    const kit = { ...emptyBrandKit('Dark'), colors: ['#3b0764', '#1e1b4b'] };
    const t = brandKitToTheme(kit);
    expect(t.bg).toBe('#ffffff');
    expect(t.heading).toBe('#3b0764'); // darkest of the two by luminance
  });
});
