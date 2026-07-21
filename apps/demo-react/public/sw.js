/*
 * Pyntra service worker — offline app shell + asset cache.
 * Navigation requests use network-first (cache the visited route's HTML so it
 * loads offline next time); hashed static assets use cache-first (immutable).
 * Everything is same-origin only — cross-origin requests pass straight through.
 * Bump CACHE on release to drop stale assets.
 */
const CACHE = 'pdfcraft-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave cross-origin alone

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
        return res;
      } catch {
        return (await caches.match(req))
          || (await caches.match('/app'))
          || (await caches.match('/'))
          || Response.error();
      }
    })());
    return;
  }

  const cacheable = url.pathname.startsWith('/assets/')
    || url.pathname === '/manifest.webmanifest'
    || url.pathname.endsWith('.svg');

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok && cacheable) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    } catch {
      return cached || Response.error();
    }
  })());
});

// ── Background reminders (on-device, no server) ──────────────────────────────
// Reads the reminders the app mirrored into IndexedDB, and on the day (India
// time) shows a notification — even if the app isn't open. Fires from Periodic
// Background Sync where supported (Chrome/Android installed PWA).
function idbGet(key) {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open('pyntra', 1);
      open.onupgradeneeded = () => { try { if (!open.result.objectStoreNames.contains('kv')) open.result.createObjectStore('kv'); } catch (e) { /* */ } };
      open.onerror = () => resolve([]);
      open.onsuccess = () => {
        try {
          const rq = open.result.transaction('kv', 'readonly').objectStore('kv').get(key);
          rq.onsuccess = () => resolve(Array.isArray(rq.result) ? rq.result : []);
          rq.onerror = () => resolve([]);
        } catch (e) { resolve([]); }
      };
    } catch (e) { resolve([]); }
  });
}
function istMD(offsetDays) {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', month: '2-digit', day: '2-digit' })
    .format(new Date(Date.now() + (offsetDays || 0) * 86400000));
  const [m, d] = s.split('-').map(Number);
  return { m, d };
}
// Fixed-date festivals — the FALLBACK when the app hasn't mirrored the dated
// calendar into IndexedDB yet (must match festivalCalendar.ts fixed set).
// Lunar festivals (Diwali, Ganesh Chaturthi, Durga Puja, Chhath, Eid…) come
// from the 'festivals' IDB mirror the app writes, with verified yearly dates.
const FIXED_FESTIVALS = [
  { m: 1, d: 1, name: 'New Year' }, { m: 1, d: 14, name: 'Makar Sankranti / Pongal' }, { m: 1, d: 26, name: 'Republic Day' },
  { m: 4, d: 14, name: 'Baisakhi' }, { m: 8, d: 15, name: 'Independence Day' }, { m: 10, d: 2, name: 'Gandhi Jayanti' },
  { m: 11, d: 14, name: "Children's Day" }, { m: 12, d: 25, name: 'Christmas' },
];
async function noteForDay(offsetDays) {
  const { m, d } = istMD(offsetDays);
  const reminders = await idbGetReminders();
  const names = reminders.filter((r) => r && r.month === m && r.day === d).map((r) => r.name);
  const mirrored = await idbGet('festivals');
  const fests = mirrored.length
    ? mirrored.filter((f) => f && f.m === m && f.d === d).map((f) => (f.emoji ? f.emoji + ' ' : '') + f.name)
    : FIXED_FESTIVALS.filter((f) => f.m === m && f.d === d).map((f) => f.name);
  const parts = names.concat(fests);
  if (!parts.length) return null;
  const tomorrow = offsetDays === 1;
  const title = fests.length && !names.length
    ? (tomorrow ? '🗓️ ' + fests[0] + ' is tomorrow!' : '🎉 ' + fests[0] + ' today!')
    : (tomorrow ? '🗓️ A special day tomorrow!' : '🎉 A special day today!');
  const body = parts.join(', ') + (tomorrow ? ' — get your card ready on Pyntra' : ' — open Pyntra to make a card');
  return { title, body, tag: 'pyntra-reminders-' + (tomorrow ? 'tmrw-' : '') + m + '-' + d };
}
function idbGetReminders() { return idbGet('reminders'); }
async function showTodaysReminderNote() {
  // Today's note wins; otherwise a heads-up for tomorrow so people can prepare.
  const note = (await noteForDay(0)) || (await noteForDay(1));
  if (!note) return;
  await self.registration.showNotification(note.title, {
    body: note.body, icon: '/icon.svg', badge: '/icon.svg', tag: note.tag,
  });
}
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'pyntra-reminders') event.waitUntil(showTodaysReminderNote());
});
// Server Web Push path (optional, future) — show whatever the server sent.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { /* */ }
  event.waitUntil(self.registration.showNotification(data.title || '🎉 Pyntra', {
    body: data.body || 'You have a card to make today!', icon: '/icon.svg', badge: '/icon.svg',
  }));
});

// Focus (or open) the app when a collaboration notification is tapped.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) { await c.focus(); return; } }
    if (self.clients.openWindow) await self.clients.openWindow('/app');
  })());
});
