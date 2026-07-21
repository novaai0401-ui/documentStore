# Push notifications & reminders — deploy notes

Pyntra's reminder/festival notifications work in **two layers**. You only need to
configure the second one, and only if you want notifications that reach the
device when the app is closed (including iPhones).

## 1. On-device (works out of the box, no config)

- Personal reminders (birthdays/anniversaries/milestones) are stored **only on
  the device** (localStorage + IndexedDB). Nothing is sent anywhere.
- On the day (India time), the home shows a **"Today"** banner with a ready card.
- On **Chrome/Android installed PWAs**, a Periodic Background Sync also pops a
  local notification even if the app isn't open.
- On iOS Safari / Firefox this last part is a no-op — the on-open banner still
  works. To cover those, enable layer 2.

Nothing to configure. This layer never sends data to a server.

## 2. Server Web Push (optional — reaches iPhones & closed tabs)

This sends **festival** notifications only (public data — no personal reminder
ever leaves the device) to devices that opted in. It's **off unless you set
VAPID keys**; with none set, `/api/push/vapid` reports `disabled` and no
scheduler runs.

### Step 1 — generate a VAPID key pair (once)

```bash
npx web-push generate-vapid-keys
# Public Key:  BN...   (87 chars)
# Private Key: xy...
```

Keep the **private key secret**. The same pair is reused across deploys — don't
regenerate, or existing subscriptions stop working.

### Step 2 — set them in Render → Environment

| Variable | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | the Public Key from step 1 |
| `VAPID_PRIVATE_KEY` | the Private Key from step 1 |
| `VAPID_SUBJECT` | `mailto:you@yourdomain.com` (or `https://yourdomain.com`) |

Redeploy. On boot the log prints `Web Push enabled — N subscription(s) loaded`.

### Step 3 — users opt in

In the app: **🔔 Reminders → "Turn on reminders on this device"**. That requests
notification permission and (where the server is configured) subscribes the
device to festival push. iOS users must first **Add to Home Screen** (iOS 16.4+).

### What gets sent, and when

- A scheduler ticks hourly and, once at/after **08:00 IST**, pushes that day's
  festivals (fixed dates + the published 2026/2027 lunar dates in
  `festivalCalendar.ts` / mirrored in `serve.mjs`) to all subscribers.
- Dead subscriptions (HTTP 404/410) are pruned automatically.
- Subscriptions are stored in `push-subs.json` (gitignored). Render's disk is
  ephemeral, so a redeploy clears them — users re-subscribe on next visit. For
  durable storage, point `SUBS_FILE` at a mounted disk or a small KV store.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/push/vapid` | `{ enabled, publicKey }` for the client to subscribe |
| POST | `/api/push/subscribe` | store a PushSubscription |
| POST | `/api/push/unsubscribe` | remove one (`{ endpoint }`) |

### Keeping festival dates current

Lunar festival dates shift yearly. Update **both**:
- `apps/demo-react/src/v2/studio/festivalCalendar.ts` (`LUNAR_FESTIVALS[].perYear`)
- `scripts/serve.mjs` (`PUSH_LUNAR`)

Add each new year's dates from a verified Panchang source. A year with no entry
simply shows "date varies" and sends no festival push — never a wrong date.
