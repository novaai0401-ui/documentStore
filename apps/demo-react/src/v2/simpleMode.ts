/**
 * Simple / Senior mode — one switch that makes the whole app easier for people
 * who find small text and dense controls hard (elderly users, first-timers, low
 * vision): larger type, bigger tap targets, more spacing, stronger contrast.
 * Applied as `data-simple="1"` on <html>, styled in simple.css. Persisted.
 */
const KEY = 'pyntra:simple';

export function getSimple(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}
export function setSimple(on: boolean): void {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* */ }
  if (typeof document !== 'undefined') document.documentElement.setAttribute('data-simple', on ? '1' : '0');
}
export function toggleSimple(): boolean { const next = !getSimple(); setSimple(next); return next; }
/** Apply the saved preference on load (call once at startup). */
export function initSimple(): void { if (getSimple()) setSimple(true); }
