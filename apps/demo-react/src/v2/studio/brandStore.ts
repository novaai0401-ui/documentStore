/**
 * Brand kits — a saved identity (logo, colour palette, heading/body fonts) the
 * user can apply across the Design Studio and document editors, so everything they
 * make stays on-brand. Stored locally in the same KV the document library uses;
 * the logo is a data URL, so nothing leaves the device. Pure CRUD here; the UI and
 * the "apply" wiring live in the editors.
 */
import { openKv, type Kv } from '../persist/kv.js';

export interface BrandKit {
  id: string;
  name: string;
  /** Logo as a data URL (optional). */
  logo?: string;
  /** Brand colours (hex), first is treated as the primary. */
  colors: string[];
  fonts: { heading: string; body: string };
}

const KEY = (id: string) => `brand:${id}`;
const INDEX = 'brand:index';
const ACTIVE = 'brand:active';

let kv: Kv | null = null;
const store = (): Kv => (kv ??= openKv());
/** Inject a KV (tests use an in-memory one). */
export function configureBrandStore(next: Kv): void { kv = next; }

export function newBrandId(): string {
  return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export const DEFAULT_FONTS = { heading: 'Inter, system-ui, sans-serif', body: 'Inter, system-ui, sans-serif' };

export function emptyBrandKit(name = 'My brand'): BrandKit {
  return { id: newBrandId(), name, colors: ['#2e5bff', '#0f172a', '#64748b', '#ffffff'], fonts: { ...DEFAULT_FONTS } };
}

const readIndex = async (): Promise<string[]> => (await store().get<string[]>(INDEX)) ?? [];

export async function listBrandKits(): Promise<BrandKit[]> {
  const ids = await readIndex();
  const kits = await Promise.all(ids.map((id) => store().get<BrandKit>(KEY(id))));
  return kits.filter((k): k is BrandKit => !!k);
}

export async function saveBrandKit(kit: BrandKit): Promise<void> {
  await store().set(KEY(kit.id), kit);
  const ids = await readIndex();
  if (!ids.includes(kit.id)) await store().set(INDEX, [kit.id, ...ids]);
}

export async function deleteBrandKit(id: string): Promise<void> {
  await store().del(KEY(id));
  await store().set(INDEX, (await readIndex()).filter((x) => x !== id));
  if ((await getActiveBrandId()) === id) await store().del(ACTIVE);
}

export const getActiveBrandId = (): Promise<string | undefined> => store().get<string>(ACTIVE);
export const setActiveBrandId = (id: string | null): Promise<void> => (id ? store().set(ACTIVE, id) : store().del(ACTIVE));

/** The active kit (or undefined if none chosen / it was deleted). */
export async function getActiveBrandKit(): Promise<BrandKit | undefined> {
  const id = await getActiveBrandId();
  return id ? store().get<BrandKit>(KEY(id)) : undefined;
}
