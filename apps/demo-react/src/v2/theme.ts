/**
 * App theme (light / dark / system). Persists the choice, reflects it onto
 * <html data-theme> for the CSS layer to key off, follows the OS when set to
 * "system", and keeps the browser UI <meta name=theme-color> in sync. Pure
 * helpers are exported so the resolution logic can be unit-tested without a DOM.
 */
export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const KEY = 'pdfcraft.theme';
const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#2e5bff', dark: '#0b1220' };

/** Cycle order for a single toggle button: light → dark → system → light. */
export function nextChoice(c: ThemeChoice): ThemeChoice {
  return c === 'light' ? 'dark' : c === 'dark' ? 'system' : 'light';
}

/** Resolve a choice to a concrete theme, given whether the OS prefers dark. */
export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): ResolvedTheme {
  if (choice === 'system') return systemPrefersDark ? 'dark' : 'light';
  return choice;
}

export function loadChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch { /* storage blocked */ }
  return 'system';
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Apply a choice: persist it, set <html data-theme>, sync the theme-color meta. */
export function applyChoice(choice: ThemeChoice): ResolvedTheme {
  const resolved = resolveTheme(choice, systemPrefersDark());
  try { localStorage.setItem(KEY, choice); } catch { /* ignore */ }
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolved);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLOR[resolved]);
  }
  return resolved;
}

/** Subscribe to OS theme changes while the choice is "system". Returns an unsubscribe. */
export function watchSystem(onChange: () => void): () => void {
  if (typeof matchMedia !== 'function') return () => undefined;
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
