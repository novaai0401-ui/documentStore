import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'tekivex-ui';
import 'tekivex-ui/styles';
import { Landing } from './Landing.js';
import { Docs } from './Docs.js';
import { initAnalytics } from './analytics.js';
import { pyntraTheme } from './brandTheme.js';

// Apply the user's UI language (sets <html lang> + dir for RTL like Urdu/Arabic).
void import('./i18n.js').then((m) => m.setLang(m.detectLang())).catch(() => { /* */ });

// Google Analytics 4 (no-op unless VITE_GA_ID is set in a production build).
initAnalytics();

// Apply the saved Simple/Senior mode (larger, calmer UI) before first paint.
void import('./v2/simpleMode.js').then((m) => m.initSimple()).catch(() => { /* */ });

// Wire on-device AI (WebLLM) into the runtime IF the user opted in. No-op and no
// download otherwise; the model only fetches on first AI use when enabled.
void import('./v2/ai/local/webllm.js').then((m) => m.initLocalAi()).catch(() => { /* */ });

// Path-based split: visitors land DIRECTLY in the tools (the editor is the
// default at "/"). The marketing/SEO landing now lives at "/welcome" and the
// documentation at "/docs" — both still statically rendered for crawlers. The
// legacy "/app" path keeps working. Everything else falls through to the app.
const path = window.location.pathname.replace(/\/+$/, '');
const isDocs = path === '/docs' || path.endsWith('/docs');
const isWelcome = path === '/welcome' || path.endsWith('/welcome');
const isApp = !isDocs && !isWelcome;

// Register the service worker (offline app shell + asset cache) in production.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => { /* offline support is best-effort */ }); });
}

const root = createRoot(document.getElementById('root')!);

if (isApp) {
  const Editor = lazy(async () => {
    const [{ Workspace }, { ThemeProvider }, { configureWorker }, workerUrl] = await Promise.all([
      import('./v2/Workspace.js'),
      import('tekivex-ui'),
      import('@pdfcraft/engine'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    // Self-host the pdf.js worker from our own bundle — no third-party CDN, so it
    // works offline and nothing leaves the device.
    configureWorker(workerUrl.default);
    return {
      default: () => (
        <ThemeProvider theme={pyntraTheme}>
          <Workspace />
        </ThemeProvider>
      ),
    };
  });
  root.render(
    <StrictMode>
      <Suspense fallback={<div style={{ padding: 40, fontFamily: 'system-ui' }}>Loading editor…</div>}>
        <Editor />
      </Suspense>
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      <ThemeProvider theme={pyntraTheme}>
        {isDocs ? <Docs /> : <Landing />}
      </ThemeProvider>
    </StrictMode>,
  );
}
