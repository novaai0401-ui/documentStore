import { describe, it, expect, beforeEach } from 'vitest';
import { memKv } from '../persist/kv.js';
import {
  configureBrandStore, emptyBrandKit, saveBrandKit, listBrandKits, deleteBrandKit,
  getActiveBrandKit, setActiveBrandId,
} from './brandStore.js';

beforeEach(() => configureBrandStore(memKv()));

describe('brand kit store', () => {
  it('saves, lists, and updates kits', async () => {
    const a = emptyBrandKit('Acme');
    await saveBrandKit(a);
    await saveBrandKit({ ...emptyBrandKit('Globex') });
    let kits = await listBrandKits();
    expect(kits.map((k) => k.name).sort()).toEqual(['Acme', 'Globex']);

    // Update in place (no duplicate index entry).
    await saveBrandKit({ ...a, name: 'Acme Inc' });
    kits = await listBrandKits();
    expect(kits.filter((k) => k.id === a.id)).toHaveLength(1);
    expect(kits.find((k) => k.id === a.id)?.name).toBe('Acme Inc');
  });

  it('tracks the active kit and clears it on delete', async () => {
    const a = emptyBrandKit('Acme');
    await saveBrandKit(a);
    await setActiveBrandId(a.id);
    expect((await getActiveBrandKit())?.id).toBe(a.id);

    await deleteBrandKit(a.id);
    expect(await listBrandKits()).toHaveLength(0);
    expect(await getActiveBrandKit()).toBeUndefined();
  });

  it('a fresh kit has a primary colour and fonts', () => {
    const k = emptyBrandKit();
    expect(k.colors.length).toBeGreaterThan(0);
    expect(k.fonts.heading).toBeTruthy();
    expect(k.fonts.body).toBeTruthy();
  });
});
