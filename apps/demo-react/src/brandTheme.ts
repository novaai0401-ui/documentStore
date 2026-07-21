/**
 * Pyntra brand theme — a refined "Modern SaaS" (Linear/Notion-style) palette.
 * tekivex-ui themes everything from these 12 tokens, so tuning them re-skins every
 * Tkx control at once: cool near-white surfaces, soft hairline borders, near-black
 * (not pure black) text, a muted slate for secondary text, and the brand blue as
 * the single restrained accent. Built on the auroraLight preset via createTheme so
 * any tokens we don't override keep sensible defaults.
 */
import { auroraLight, createTheme, type ThemeTokens } from 'tekivex-ui';

export const BRAND_BLUE = '#2e5bff';

export const pyntraTheme: ThemeTokens = createTheme(auroraLight, {
  bg: '#f6f7f9',         // app canvas — subtle cool gray, not stark white
  surface: '#ffffff',    // cards, panels, modals
  surfaceAlt: '#f1f3f6', // secondary fills, hover, input backgrounds
  border: '#e5e8ec',     // hairline borders — quiet, premium
  text: '#16181d',       // near-black for crisp, high-contrast type
  textMuted: '#6b7280',  // slate for secondary / meta text
  primary: BRAND_BLUE,   // the one accent — matches the logo, focus, links
  secondary: '#475467',  // refined slate
  danger: '#e5484d',
  warning: '#f59e0b',
  success: '#12a150',
  info: BRAND_BLUE,
});
