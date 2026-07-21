/**
 * Templates-as-data — Pillar C of the platform architecture. Today templates are
 * TypeScript functions baked into the bundle; this turns a design (single or
 * multi-page) into a portable, versioned JSON "template pack" that can be
 * exported, shared, validated and re-imported with no code change. The Design
 * model is already JSON-serialisable, so this is a thin, deterministic schema +
 * validator + migrator. Pure and fully unit-tested.
 */
import type { Design, Element } from './model.js';

export const TEMPLATE_FORMAT = 'pyntra-template';
export const TEMPLATE_VERSION = 1;

export interface TemplatePack {
  format: typeof TEMPLATE_FORMAT;
  version: number;
  name: string;
  /** One or more pages (a single design is stored as a one-page pack). */
  pages: Design[];
  meta?: { author?: string; tags?: string[]; createdAt?: number };
}

const ELEMENT_TYPES = new Set(['text', 'rect', 'ellipse', 'line', 'image']);

/** Structural validation of a Design (defensive — imports come from outside). */
export function isValidDesign(d: unknown): d is Design {
  if (!d || typeof d !== 'object') return false;
  const o = d as Record<string, unknown>;
  if (typeof o.w !== 'number' || typeof o.h !== 'number' || o.w <= 0 || o.h <= 0) return false;
  if (typeof o.background !== 'string') return false;
  if (!Array.isArray(o.elements)) return false;
  return (o.elements as unknown[]).every((el) => {
    if (!el || typeof el !== 'object') return false;
    const e = el as Record<string, unknown>;
    return typeof e.id === 'string' && typeof e.type === 'string' && ELEMENT_TYPES.has(e.type)
      && ['x', 'y', 'w', 'h'].every((k) => typeof e[k] === 'number');
  });
}

/** Build a template pack from one or more pages. */
export function makeTemplatePack(name: string, pages: Design[], meta?: TemplatePack['meta']): TemplatePack {
  return { format: TEMPLATE_FORMAT, version: TEMPLATE_VERSION, name: (name || 'Untitled template').slice(0, 80), pages, meta: { createdAt: Date.now(), ...meta } };
}

/** Serialise a pack to pretty JSON for download/sharing. */
export function exportTemplatePack(name: string, pages: Design[], meta?: TemplatePack['meta']): string {
  return JSON.stringify(makeTemplatePack(name, pages, meta), null, 2);
}

/** Future-proofing: bring older packs up to the current version. v1 is the base. */
function migrate(pack: TemplatePack): TemplatePack {
  // (no migrations yet — placeholder so old packs never hard-fail)
  return { ...pack, version: TEMPLATE_VERSION };
}

/**
 * Parse + validate a template pack JSON string. Throws a clear error on anything
 * malformed so the importer can show it. Strips unknown top-level fields.
 */
export function parseTemplatePack(json: string): TemplatePack {
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { throw new Error('Not valid JSON.'); }
  if (!raw || typeof raw !== 'object') throw new Error('Empty or invalid template file.');
  const o = raw as Record<string, unknown>;
  if (o.format !== TEMPLATE_FORMAT) throw new Error('This isn’t a Pyntra template file.');
  if (typeof o.version !== 'number' || o.version > TEMPLATE_VERSION) throw new Error(`Template version ${String(o.version)} is newer than this app supports.`);
  const pages = Array.isArray(o.pages) ? o.pages : [];
  if (!pages.length || !pages.every(isValidDesign)) throw new Error('Template has no valid pages.');
  return migrate({
    format: TEMPLATE_FORMAT,
    version: o.version,
    name: typeof o.name === 'string' && o.name ? o.name.slice(0, 80) : 'Imported template',
    pages: pages as Design[],
    meta: (o.meta && typeof o.meta === 'object') ? (o.meta as TemplatePack['meta']) : undefined,
  });
}

/** Give every element fresh ids so an imported template doesn't collide with the
 *  current document's element ids (important once it's edited/merged). */
export function reidPages(pages: Design[], newId: () => string): Design[] {
  return pages.map((d) => ({ ...d, elements: d.elements.map((el): Element => ({ ...el, id: newId() })) }));
}
