# Shipping Pyntra to the Google Play Store

Pyntra is a PWA (`apps/demo-react`). Two supported ways to get it on Play:

| Path | Effort | In-app billing | Use when |
|---|---|---|---|
| **TWA** (Trusted Web Activity, via Bubblewrap) | ~30 min | ❌ none | You just want the app on Play, monetize on the web |
| **Capacitor** (native shell) | ~1 day | ✅ Google Play Billing | You want the Pro subscription / credit packs **inside** the app |

Both wrap the **same deployed PWA** — you do not rebuild the UI. Start with TWA;
switch to Capacitor when in-app purchases go live (see `docs/monetization-spec.md`).

The config for both lives in the repo already:

- `apps/demo-react/public/.well-known/assetlinks.json` — Digital Asset Links (TWA)
- `apps/demo-react/twa-manifest.json` — Bubblewrap config (TWA)
- `apps/demo-react/capacitor.config.ts` — Capacitor config (native path)
- `apps/demo-react/public/manifest.webmanifest` — already Play-ready (id, 192/512/maskable icons, `standalone`)

Replace the placeholder domain `pyntra.tekivex.com` and package id
`com.tekivex.pyntra` with your own before building.

---

## Prerequisites (both paths)

1. **A Google Play Developer account** ($25 one-time). https://play.google.com/console
2. **The PWA deployed over HTTPS** at a stable domain, serving
   `manifest.webmanifest` and `.well-known/assetlinks.json` (Vite copies
   everything in `public/` verbatim, so both ship automatically on
   `pnpm --filter demo-react build`).
3. **JDK 17** and, for Capacitor, **Android Studio** + the Android SDK.

---

## Path A — TWA with Bubblewrap (fastest, no billing)

```bash
npm i -g @bubblewrap/cli
cd apps/demo-react

# 1. Init from the checked-in manifest (edit host/packageId first).
bubblewrap init --manifest ./twa-manifest.json

# 2. Build the signed app bundle. Bubblewrap creates ./android.keystore
#    on first run — BACK IT UP; losing it means you can never update the app.
bubblewrap build            # → app-release-bundle.aab + app-release-signed.apk
```

### Wire up Digital Asset Links (removes the browser URL bar)

The app and the website must vouch for each other, or the TWA shows a Chrome
address bar.

1. Get your **app signing SHA-256 fingerprint**. If you use Play App Signing
   (recommended), copy it from **Play Console → Setup → App integrity → App
   signing key certificate**. For a local keystore:
   ```bash
   keytool -list -v -keystore android.keystore -alias android | grep SHA256
   ```
2. Paste it into `public/.well-known/assetlinks.json` in place of
   `REPLACE_WITH_YOUR_APP_SIGNING_SHA256_FINGERPRINT` (you can list several).
3. Redeploy the site and confirm it is publicly reachable:
   ```
   https://YOUR_DOMAIN/.well-known/assetlinks.json
   ```
   Verify with Google's tester:
   https://developers.google.com/digital-asset-links/tools/generator

4. Upload the `.aab` to Play Console → create a release.

---

## Path B — Capacitor (native shell, enables Google Play Billing)

Use this when you want the Pro subscription and credit packs purchasable
in-app (Play takes 15% on subscriptions after year one / on the first
$1M, 30% otherwise).

```bash
cd apps/demo-react
pnpm add @capacitor/core @capacitor/cli @capacitor/android
pnpm --filter demo-react build        # produces dist/
npx cap add android                   # reads capacitor.config.ts
npx cap sync
npx cap open android                  # build the signed AAB in Android Studio
```

`capacitor.config.ts` bundles the built `dist/` into the app (offline-first).
Leave `server.url` unset for production; set it only for live-reload dev.

### Billing plugin

The billing abstraction already has an inert Play provider
(`src/v2/billing/billing.ts` → `playBillingProvider`). To make it live:

1. Add a Capacitor billing plugin, e.g. `@capgo/capacitor-purchases` or
   RevenueCat's `@revenuecat/purchases-capacitor`.
2. Create the products in **Play Console → Monetize → Products**
   (subscription `pyntra.pro.monthly` / `pyntra.pro.yearly`, and managed
   products for credit packs — SKUs live in `src/v2/billing/products.ts`).
3. Implement `playBillingProvider.purchase()` against the plugin and call the
   server-side verification chokepoint (`purchaseAndUnlock(..., verifyUrl)`),
   then `setEntitlement(...)`. **Never trust the client** — verify the purchase
   token with Google's Purchases API and store entitlements server-side.
4. Handle **Real-time Developer Notifications (RTDN)** via Pub/Sub for
   renewals, cancellations and refunds (see the monetization spec).

---

## Play listing checklist

- **Package name** is permanent — pick carefully (`com.tekivex.pyntra`).
- Icon 512×512, feature graphic 1024×500, ≥2 phone screenshots.
- Privacy policy URL (Pyntra is on-device; the only network egress is the
  user's own AI key — state that plainly).
- **Data safety form:** declare "no data collected/shared" for the core app;
  if AI is used, disclose that prompts go to the user-configured provider.
- Content rating questionnaire, target audience, ads declaration (none).
- Target the latest `targetSdkVersion` Play requires that cycle.

## Keep the keystore safe

Whichever path you choose, **back up the signing keystore + password** (or use
Play App Signing). Losing it means you can never publish an update under the
same listing.
