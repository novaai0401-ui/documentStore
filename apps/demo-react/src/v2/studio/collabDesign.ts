/**
 * Map a Design to/from the flat string-keyed entries an LWW-Map collaboration
 * session syncs. Each element is its own key (`el:<id>`), with `order` holding the
 * z-order and `meta` the artboard — so two people editing different elements never
 * conflict, and images (data-URL hrefs) ride along inside each element's JSON, so
 * a shared design carries its pictures. The mapping round-trips exactly, which the
 * editor relies on to avoid echoing remote changes back.
 */
import type { Design, Element } from './model.js';

export function designToEntries(d: Design): Record<string, string> {
  const e: Record<string, string> = {
    meta: JSON.stringify({ w: d.w, h: d.h, background: d.background }),
    order: JSON.stringify(d.elements.map((el) => el.id)),
  };
  for (const el of d.elements) e['el:' + el.id] = JSON.stringify(el);
  return e;
}

export function entriesToDesign(entries: Record<string, string>): Design {
  let meta = { w: 1080, h: 1080, background: '#ffffff' };
  try { const m = JSON.parse(entries.meta ?? ''); if (m && typeof m.w === 'number' && typeof m.h === 'number') meta = { w: m.w, h: m.h, background: String(m.background ?? '#ffffff') }; } catch { /* keep default */ }
  let order: string[] = [];
  try { const o = JSON.parse(entries.order ?? '[]'); if (Array.isArray(o)) order = o.filter((x): x is string => typeof x === 'string'); } catch { /* none */ }
  const elements: Element[] = [];
  for (const id of order) {
    const raw = entries['el:' + id];
    if (!raw) continue;
    try { const el = JSON.parse(raw) as Element; if (el && el.id === id) elements.push(el); } catch { /* skip bad */ }
  }
  return { w: meta.w, h: meta.h, background: meta.background, elements };
}

/** Keys in `cur` whose value changed vs `prev` (used to push only what moved). */
export function changedEntries(prev: Record<string, string>, cur: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k in cur) if (cur[k] !== prev[k]) out[k] = cur[k];
  return out;
}
