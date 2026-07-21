/**
 * Install-as-app control. On Chromium (Android/desktop) it captures the
 * `beforeinstallprompt` event and offers a one-tap install. Browsers without
 * that event still get a button with platform-specific "Add to Home Screen"
 * instructions (iOS Safari has no install event; Firefox/Samsung on Android
 * install via the browser menu). Hides itself once the app is already running
 * installed (standalone display mode).
 */
import { useEffect, useState } from 'react';
import { TkxButton } from 'tekivex-ui';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallButton() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) { setInstalled(true); return; }
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as InstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
  const isAndroid = /android/i.test(ua);
  const isMobile = isIos || isAndroid || /Mobi/i.test(ua);

  // Show when we have a native prompt, or on any phone (so we can guide the user
  // through the manual "Add to Home Screen"). Hide on desktop with no prompt.
  if (!deferred && !isMobile) return null;

  const onClick = async () => {
    if (deferred) { await deferred.prompt(); await deferred.userChoice.catch(() => undefined); setDeferred(null); return; }
    setHint((v) => !v);
  };

  return (
    <span className="pwa-install">
      <TkxButton variant="outline" size="sm" onClick={() => void onClick()} title="Install Pyntra as an app on this device">⤓ Install app</TkxButton>
      {hint && !deferred && (
        <span className="pwa-install-hint" role="status">
          {isIos
            ? <>On iPhone/iPad in <strong>Safari</strong>: tap the <strong>Share</strong> icon, then <strong>Add to Home Screen</strong>.</>
            : <>Open the browser <strong>menu (⋮)</strong>, then tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</>}
        </span>
      )}
    </span>
  );
}
