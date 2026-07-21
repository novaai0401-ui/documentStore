/**
 * Collaboration notifications — let people editing a shared document get a system
 * notification when someone else edits it or joins, scoped to the link (only
 * people with the share link are in the room). Uses the service worker's
 * showNotification when available (so it works on Android/installed PWAs, where
 * the `new Notification()` constructor is disallowed), falling back to the
 * constructor on desktop. Honest scope: these fire while the document is open in
 * a tab/PWA — true push when the app is fully closed needs a push server, which
 * Pyntra's no-server, privacy-first model deliberately avoids.
 */
const KEY = 'pyntra:collab-notify';

export function notifySupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notifyEnabled(): boolean {
  if (!notifySupported()) return false;
  try { return localStorage.getItem(KEY) === '1' && Notification.permission === 'granted'; } catch { return false; }
}

/** Ask for permission (needs a user gesture) and remember the choice. */
export async function enableNotifications(): Promise<boolean> {
  if (!notifySupported()) return false;
  let perm = Notification.permission;
  if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch { return false; } }
  if (perm === 'granted') { try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ } return true; }
  return false;
}

export function disableNotifications(): void {
  try { localStorage.setItem(KEY, '0'); } catch { /* ignore */ }
}

/** Throttle helper (pure): has at least `minGapMs` elapsed since the last fire? */
export function shouldNotify(now: number, lastAt: number, minGapMs = 8000): boolean {
  return now - lastAt >= minGapMs;
}

async function show(title: string, body: string, tag: string): Promise<void> {
  if (!notifyEnabled()) return;
  const opts = { body, tag, icon: '/icon-192.png', badge: '/icon-192.png', silent: false } as NotificationOptions;
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) { await reg.showNotification(title, opts); return; }
    }
    new Notification(title, opts);
  } catch { /* notifications best-effort */ }
}

let lastEditAt = 0;
/** Fire (throttled) when a remote edit arrives — only while this tab is hidden. */
export function notifyEdit(docName = 'a shared document'): void {
  if (!notifyEnabled()) return;
  if (typeof document !== 'undefined' && !document.hidden) return; // active editor doesn't need a ping
  const now = Date.now();
  if (!shouldNotify(now, lastEditAt)) return;
  lastEditAt = now;
  void show('✏️ Live edit', `Someone just edited ${docName}.`, 'pyntra-collab-edit');
}

/** Fire when a new collaborator joins the room. */
export function notifyJoin(name: string, docName = 'a shared document'): void {
  void show('👋 Collaborator joined', `${name} joined ${docName}.`, 'pyntra-collab-join');
}
