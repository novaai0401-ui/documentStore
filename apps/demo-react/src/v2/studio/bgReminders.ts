/**
 * Background reminders — lets a saved reminder pop as a notification on the day
 * even when the app isn't open, WITHOUT a server (privacy-preserving, in keeping
 * with "nothing leaves your device"):
 *   • reminders are mirrored into IndexedDB (the service worker can read it),
 *   • Periodic Background Sync wakes the worker ~daily to check & notify.
 *
 * Support is partial by platform: Periodic Background Sync is Chrome/Android
 * (installed PWA) only. Where it's unavailable (iOS Safari, Firefox), this is a
 * graceful no-op and the on-open "Today" banner still greets the user. True
 * push when the tab was never opened would need a server + Web Push (a separate,
 * opt-in feature); this stays fully on-device.
 */
import type { Reminder } from './reminders.js';

const DB = 'pyntra', STORE = 'kv', KEY = 'reminders', FEST_KEY = 'festivals', SYNC_TAG = 'pyntra-reminders';

function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => { try { if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE); } catch { /* */ } };
      open.onerror = () => resolve(null);
      open.onsuccess = () => {
        try {
          const tx = open.result.transaction(STORE, mode);
          const rq = fn(tx.objectStore(STORE));
          rq.onsuccess = () => resolve(rq.result);
          rq.onerror = () => resolve(null);
        } catch { resolve(null); }
      };
    } catch { resolve(null); }
  });
}

/** Keep the worker-readable copy of reminders in step with localStorage. */
export async function mirrorReminders(list: Reminder[]): Promise<void> {
  await withStore('readwrite', (s) => s.put(list, KEY));
}

/** Mirror the next ~60 days of DATED festivals (incl. lunar ones like Diwali,
 *  Ganesh Chaturthi, Durga Puja, Chhath, whose dates the service worker can't
 *  compute itself) into IndexedDB, so background notifications cover every
 *  festival — not just the fixed-date ones hard-coded in the worker. */
export async function mirrorFestivals(): Promise<void> {
  try {
    const { upcomingFestivals } = await import('./festivalCalendar.js');
    const list = upcomingFestivals(60)
      .filter((u) => u.inDays <= 60)
      .map((u) => ({ name: u.f.name, emoji: u.f.emoji, m: u.m, d: u.d, year: u.year }));
    await withStore('readwrite', (s) => s.put(list, FEST_KEY));
  } catch { /* calendar unavailable — worker falls back to fixed dates */ }
}

/** Turn on notifications for this device and, where supported, register the
 *  daily background check. Returns a status the UI can show. */
export async function enableBackgroundReminders(): Promise<'granted' | 'denied' | 'default' | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported';
  let perm = Notification.permission;
  if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch { return 'default'; } }
  if (perm !== 'granted') return perm;
  try {
    const reg = await navigator.serviceWorker?.ready;
    // Periodic Background Sync (Chrome/Android installed PWA) — best-effort.
    const anyReg = reg as unknown as { periodicSync?: { register: (tag: string, opts: { minInterval: number }) => Promise<void> } };
    if (anyReg?.periodicSync) {
      try {
        const status = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName });
        if (status.state === 'granted') await anyReg.periodicSync.register(SYNC_TAG, { minInterval: 12 * 60 * 60 * 1000 });
      } catch { /* not available — on-open banner still covers it */ }
    }
  } catch { /* no SW — fine */ }
  // Give the worker the dated festival list so lunar festivals notify too.
  void mirrorFestivals();
  // Also subscribe to the server's festival push (reaches iOS & closed tabs);
  // no-op unless the server is configured with VAPID keys.
  void subscribeServerPush();
  return 'granted';
}

function urlB64ToUint8(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Subscribe this device to the server's FESTIVAL push (opt-in, festivals only —
 *  no personal data leaves the device). No-op unless the server has VAPID keys.
 *  This is what reaches iPhones and closed tabs (where Periodic Sync can't). */
export async function subscribeServerPush(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || typeof PushManager === 'undefined') return false;
    const r = await fetch('/api/push/vapid');
    if (!r.ok) return false;
    const { enabled, publicKey } = await r.json();
    if (!enabled || !publicKey) return false;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(publicKey) as unknown as BufferSource });
    const resp = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) });
    return resp.ok;
  } catch { return false; }
}

/** Build the notification for a day, given the names already matched to today.
 *  Pure (no I/O) so it's unit-testable and shared in intent with the worker. */
export function todayNotification(reminderNames: string[], festivalNames: string[]): { title: string; body: string } | null {
  return dayNotification(reminderNames, festivalNames, 'today');
}

/** Like todayNotification but also covers the day-before heads-up ("Diwali
 *  tomorrow — get your card ready"), so people can prepare in advance. */
export function dayNotification(reminderNames: string[], festivalNames: string[], when: 'today' | 'tomorrow'): { title: string; body: string } | null {
  const parts = [...reminderNames, ...festivalNames];
  if (!parts.length) return null;
  if (when === 'tomorrow') {
    const title = festivalNames.length && !reminderNames.length ? `🗓️ ${festivalNames[0]} is tomorrow!` : '🗓️ A special day tomorrow!';
    return { title, body: `${parts.join(', ')} — get your card ready on Pyntra` };
  }
  const title = festivalNames.length && !reminderNames.length ? `🎉 ${festivalNames[0]} today!` : '🎉 A special day today!';
  return { title, body: `${parts.join(', ')} — open Pyntra to make a card` };
}

const NOTIFIED_KEY = 'pyntra:notifiedOn';

/**
 * Foreground fallback — run on every app open. Where Periodic Background Sync
 * doesn't exist (iOS Safari, Firefox, uninstalled tabs) the daily background
 * check never fires, so this covers the moment the user IS here: if today or
 * tomorrow holds a saved reminder or a festival, show one notification (per
 * day, deduped via localStorage). Also refreshes the worker's IDB mirrors.
 */
export async function maybeNotifyToday(): Promise<boolean> {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
    const { loadReminders, upcomingReminders, istToday } = await import('./reminders.js');
    const { upcomingFestivals } = await import('./festivalCalendar.js');
    const t = istToday();
    const stamp = `${t.y}-${t.m}-${t.d}`;
    try { if (localStorage.getItem(NOTIFIED_KEY) === stamp) return false; } catch { /* */ }
    const reminders = loadReminders();
    void mirrorReminders(reminders);
    void mirrorFestivals();
    const rs = upcomingReminders(reminders, 1);
    const fs = upcomingFestivals(40).filter((u) => u.inDays <= 1);
    const note =
      dayNotification(rs.filter((x) => x.inDays === 0).map((x) => x.r.name), fs.filter((x) => x.inDays === 0).map((x) => `${x.f.emoji} ${x.f.name}`), 'today')
      ?? dayNotification(rs.filter((x) => x.inDays === 1).map((x) => x.r.name), fs.filter((x) => x.inDays === 1).map((x) => `${x.f.emoji} ${x.f.name}`), 'tomorrow');
    if (!note) return false;
    const opts = { body: note.body, icon: '/icon.svg', badge: '/icon.svg', tag: `pyntra-day-${stamp}` };
    try {
      const reg = await navigator.serviceWorker?.ready;
      if (reg) await reg.showNotification(note.title, opts);
      else new Notification(note.title, opts);
    } catch { try { new Notification(note.title, opts); } catch { return false; } }
    try { localStorage.setItem(NOTIFIED_KEY, stamp); } catch { /* */ }
    return true;
  } catch { return false; }
}
