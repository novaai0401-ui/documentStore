/**
 * useIsMobile — reactive small-screen detection via matchMedia, so components can
 * restructure (not just restyle) on phones: collapse a dense toolbar into a
 * bottom sheet, swap an inline row for an overflow menu, etc. SSR-safe (defaults
 * to false when `matchMedia` is unavailable).
 */
import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 640px)';

function subscribe(cb: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Generic reactive media query, for components needing a different breakpoint
 *  than the phone one — e.g. a dense toolbar that must also collapse on tablets
 *  and small laptops, where it would otherwise wrap into rows and eat the
 *  canvas. SSR-safe (false when matchMedia is unavailable). */
export function useMediaQuery(query: string): boolean {
  const sub = (cb: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    const mql = window.matchMedia(query);
    mql.addEventListener('change', cb);
    return () => mql.removeEventListener('change', cb);
  };
  const snap = () => (typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches);
  return useSyncExternalStore(sub, snap, () => false);
}
