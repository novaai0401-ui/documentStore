/**
 * Theme list + resolver that includes the active brand kit as a selectable theme.
 * Every document editor uses this so "your brand" shows up in the theme picker
 * next to the built-in presets, and a saved `brand:<id>` themeId resolves to the
 * live kit. Falls back to the built-in presets when no kit is active.
 */
import { useCallback, useEffect, useState } from 'react';
import { THEMES, themeById as builtinThemeById, type DocTheme } from './themes.js';
import { getActiveBrandKit } from '../../studio/brandStore.js';
import { brandKitToTheme } from './brandTheme.js';

export function useBrandThemes(): { themes: DocTheme[]; resolve: (id: string) => DocTheme; reload: () => void } {
  const [brandTheme, setBrandTheme] = useState<DocTheme | null>(null);
  const reload = useCallback(() => { void getActiveBrandKit().then((k) => setBrandTheme(k ? brandKitToTheme(k) : null)); }, []);
  useEffect(() => { reload(); }, [reload]);

  const themes = brandTheme ? [brandTheme, ...THEMES] : THEMES;
  const resolve = (id: string): DocTheme => (brandTheme && id === brandTheme.id ? brandTheme : builtinThemeById(id));
  return { themes, resolve, reload };
}
