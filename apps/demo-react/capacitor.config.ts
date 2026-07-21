/**
 * Capacitor config — the native-shell path to Google Play, used when we want
 * Google Play Billing (the Pro subscription / credit packs in the monetization
 * spec). The lighter TWA path (twa-manifest.json + Bubblewrap) has NO billing;
 * pick Capacitor once in-app purchases go live. See docs/play-store-deploy.md.
 *
 * This file is inert until `@capacitor/core` + `@capacitor/android` are added
 * and `npx cap add android` is run — kept in the repo so the config is
 * versioned and reviewable. `server.url` is intentionally unset so the app
 * bundles the built `dist/` (offline-first); set it only for live-reload dev.
 */
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tekivex.pyntra',
  appName: 'Pyntra',
  webDir: 'dist',
  backgroundColor: '#0f172a',
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      backgroundColor: '#0f172a',
      showSpinner: false,
      launchAutoHide: true,
    },
  },
};

export default config;
