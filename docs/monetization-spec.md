# Pyntra — AI Monetization: Spec & Architecture

**Model chosen:** Credits + Pro subscription (per product decision).
**Status:** Design spec — nothing here is built yet.
**Scope:** How to charge for AI in a consumer, Play-Store-distributed app while
keeping the free, private, on-device experience intact.

---

## 0. The core problem this solves

Today **there is no place to meter or bill anything.** Every AI call is either
on-device (WebLLM, Tesseract, background-removal) or **bring-your-own-key
straight from the browser** to an endpoint the user configures. There is no
backend, no accounts, no credits, no paywall. The only monetization primitive in
the repo is the offline SDK license key (`@pdfcraft/sdk`), which is disarmed by a
placeholder public key and is a *licensing* gate, not *billing*.

So charging for AI is **net-new infrastructure**. The whole design below exists
to create the one thing missing: **a server-side chokepoint** that (a) holds the
real provider keys, (b) meters usage, and (c) is gated by a real payment.

> **Brand tension to hold:** the landing page currently brags "no subscription
> trap, no usage metering, no phone-home." That positioning is the *privacy*
> story. Adding metered AI does not have to break it — the plan keeps a fully
> functional **free tier that stays on-device / BYO-key with no account and no
> metering**, and only the *convenience* path (our servers, our keys) is
> metered. But the enterprise-PDF story and the consumer-Pyntra story are now
> two different products; the README/landing copy for the consumer app needs to
> say "free forever on-device; optional paid cloud AI," not "never metered."

---

## 1. Product & packaging

Three tiers. The dividing line is **who runs the AI and who holds the key.**

| | **Free** | **Pyntra Pro** (subscription) | **Credits** (consumable) |
|---|---|---|---|
| Price | $0 | ~$4.99/mo or ~$39.99/yr *(placeholder)* | Packs: 100 / 500 / 1500 *(placeholder)* |
| AI runs on | On-device (WebLLM/Tesseract) **or** the user's own key | Our proxy | Our proxy |
| Premium templates & sticker/clipart packs | ✗ | ✓ | ✗ (unless also Pro) |
| Watermark-free / HD / video export | ✗ (watermark) | ✓ | ✗ |
| Generative AI (images, avatars, prompt-to-design) | BYO-key only | Included monthly credit allowance, then credits | Pay per use |
| Deterministic/on-device AI (bg-remove simple, PII, translate via browser API, OCR) | ✓ free | ✓ free | ✓ free |

**Why this split works:**
- The **free tier keeps every feature functional** (on-device or BYO-key), so
  the privacy brand and the "no account needed" promise survive.
- **Pro** monetizes *content and convenience* (premium templates, watermark-free
  exports) — highest margin, no per-call cost, and the easiest recurring revenue.
- **Credits** monetize the *expensive generative calls* (image/avatar
  generation) whose cost scales per use — a subscription alone can't cost-cover
  a user who generates 500 AI images.

Pro includes a **monthly credit allowance** (e.g. 200 credits/mo) so most Pro
users never buy a pack; heavy users top up with credits. This is the standard
Canva/Picsart/Adobe-Express shape.

---

## 2. What people actually pay for (build priority)

Ranked by willingness-to-pay for a consumer card/design app:

1. **AI image generation** — text-to-image backgrounds/art. #1 paid feature everywhere.
2. **AI avatar / cartoon-me** — huge with younger users; ties to the avatar builder already shipped.
3. **Background removal (HQ) + image upscaling** — universal, obvious value.
4. **Prompt-to-design** — "make a jungle-theme 5th-birthday card" → finished design.
5. **AI writing** — greeting messages, captions, wishes in any language/tone (cheap to serve, great funnel).
6. **Premium animated templates & clipart/sticker packs** — *no AI*, pure content gating, best margin.
7. **Watermark-free / HD / video exports.**

Items 6–7 need **no AI infra** — they're pure entitlement checks and can ship
first (Phase 1) to validate willingness-to-pay before the proxy exists.

---

## 3. System architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│  Pyntra client (PWA / Capacitor Android app)                          │
│                                                                         │
│  Free path (unchanged):   on-device WebLLM / Tesseract / bg-remove      │
│                           or BYO-key → provider directly                │
│                                                                         │
│  Paid path:               ─► POST /ai/*  (with user's session JWT)      │
│                           ─► Google Play Billing (IAP) for money         │
└───────────────┬───────────────────────────────┬───────────────────────┘
                │ session JWT                    │ purchase token
                ▼                                ▼
┌───────────────────────────────┐   ┌───────────────────────────────────┐
│  AI Proxy  (serverless)        │   │  Billing service (serverless)      │
│  - authenticates the user      │   │  - verifies Play purchase tokens    │
│  - checks entitlement/credits  │◄──┤  - Play RTDN webhook (renew/refund) │
│  - calls provider w/ OUR key   │   │  - Stripe webhook (web)             │
│  - meters actual usage         │   │  - writes entitlements + credits    │
│  - debits credits atomically   │   └──────────────┬────────────────────┘
└───────────────┬────────────────┘                  │
                ▼                                    ▼
   Anthropic / OpenAI-image / Replicate     ┌──────────────────────┐
   (real keys, server-side only)            │  Datastore (Postgres) │
                                            │  users, entitlements, │
                                            │  credit_ledger, txns  │
                                            └──────────────────────┘
```

**Everything money- or key-related lives server-side.** The client never sees a
provider key and never decides the credit balance — it only *displays* it.

**Hosting:** Cloudflare Workers + D1/Postgres, or Vercel Functions + Neon
Postgres. Both are cheap, serverless, and globally distributed (matters for a
mobile audience). Provider keys live in the platform's secret store.

---

## 4. Components in detail

### 4.1 AI proxy (`/ai/*`)
The metering chokepoint. One endpoint family, provider-agnostic behind it.

Request flow for a paid AI call:
1. Verify the caller's **session JWT** (from Google Sign-In, §4.3).
2. Look up **entitlement** (Pro? active?) and **credit balance**.
3. Compute the call's **credit price** (§7) from the operation type.
4. **Reserve** credits (atomic decrement with a ledger row `type=reserve`).
5. Call the provider with **our** key. Stream the result back.
6. On success, **finalize** the reservation against *actual* metered usage
   (for token-priced calls, reconcile to real `usage`); on failure, **refund**
   the reservation. Both are ledger rows — the balance is always the ledger sum.

The existing client AI layers stay: **host-hook → in-app key → on-device →
offline stub**. We add one more, highest-priority when the user is signed in and
paid: **Pyntra Cloud** (our proxy). The client's `aiClient.ts` /
`cloud/textGen.ts` / `cloud/imageGen.ts` already target generic shapes, so this
is a new "provider" whose endpoint is our proxy and whose auth is the session
JWT (no API key in the browser).

Operations the proxy exposes: `text` (chat/rewrite/caption/wishes),
`image` (text-to-image), `avatar` (image gen w/ avatar prompt scaffold),
`prompt-design`, `upscale`, `matte-hq` (if we move HQ background removal
server-side — optional; it can stay on-device and free).

### 4.2 Credits ledger + entitlements
**Ledger, not a balance column.** Balance = `SUM(delta)` over `credit_ledger`
for the user. Every grant, purchase, reserve, finalize, refund, and monthly Pro
allowance is an append-only row. This makes disputes, refunds, and audits
trivial and prevents double-spend races (enforce with a DB transaction +
`SELECT … FOR UPDATE` or a Worker durable object per user).

**Entitlement** is derived state: `pro_active = now < pro_expires_at`. Recomputed
from the latest verified purchase/RTDN event, cached on the user row.

### 4.3 Auth
Consumer app → **Google Sign-In** (already the Play identity). The client gets a
Google ID token, exchanges it at `/auth/session` for a short-lived Pyntra session
JWT the proxy trusts. No passwords, no PII beyond a stable account id + email.
For the web app, same Google Sign-In (or email magic link) → same session JWT.
Anonymous/free users need **no account at all** — they never hit the proxy.

### 4.4 Google Play Billing (the money, on Android)
Google **requires** Play Billing for digital goods in a Play-distributed app —
we cannot use Stripe for IAP inside the Android app. Flow:
1. Client launches Play Billing (`@capacitor-community/in-app-purchases` or the
   RevenueCat SDK) for a product: `pyntra_pro_monthly`, `pyntra_pro_yearly`,
   `credits_100`, `credits_500`, `credits_1500`.
2. On purchase, the client sends the **purchase token** to `/billing/play/verify`.
3. The server verifies the token **server-side** against the Google Play
   Developer API (never trust the client's word), then writes the entitlement or
   credit grant to the ledger.
4. **Real-time Developer Notifications (RTDN)** via Pub/Sub → `/billing/play/rtdn`
   webhook handles renewals, cancellations, refunds, grace period, and holds —
   webhooks are the source of truth for subscription state, not the client.

**RevenueCat is worth strongly considering** — it wraps Play Billing (and later
App Store), does server-side receipt validation, entitlement management, and
RTDN handling for you, and has a generous free tier. It removes most of §4.4's
custom code. Trade-off: a third-party in the billing path (a dependency and a
data-sharing consideration to weigh against the privacy brand).

### 4.5 Web billing (Stripe)
The app is also a web PWA. On the web, **Stripe** handles Pro subscriptions and
credit packs (Play Billing is Android-only). Same `/billing/stripe/webhook` →
same ledger/entitlement writes. Entitlements are unified server-side, so a user
who buys Pro on the web is Pro in the Android app and vice-versa (identity is
their Google account).

> Keep Play and Stripe **prices aligned** but note Google/Apple take ~15–30%;
> price with that in mind, and never cross-sell the web/Stripe option *from
> inside the Android app* (Play policy violation).

---

## 5. Data model (minimal)

```
users(id, google_sub, email, created_at,
      pro_active bool, pro_expires_at, pro_source)         -- derived cache

credit_ledger(id, user_id, delta int, type, ref, created_at)
      -- type ∈ grant | purchase | pro_allowance | reserve | finalize | refund
      -- balance(user) = SUM(delta) WHERE user_id = ?

purchases(id, user_id, platform, product_id, token,
          status, verified_at, raw)                        -- Play/Stripe receipts

ai_calls(id, user_id, op, provider, model,
         credits_charged, tokens_in, tokens_out,
         provider_cost_usd, status, created_at)            -- metering + cost truth
```

`ai_calls` gives you real unit economics (credits charged vs. provider cost) so
you can tune the credit table (§7) against actuals, not guesses.

---

## 6. API surface

```
POST /auth/session            google_id_token → { session_jwt }
GET  /me                      → { pro_active, credits, allowance_reset_at }

POST /ai/text                 { op, messages|prompt, tone, lang } → stream
POST /ai/image                { prompt, size, quality } → { url|b64 }
POST /ai/avatar               { traits|prompt } → { svg|png }
POST /ai/prompt-design        { brief, format } → { design json }
POST /ai/upscale              { image, factor } → { image }

POST /billing/play/verify     { purchase_token, product_id } → { ok, state }
POST /billing/play/rtdn       (Pub/Sub push; Google → us)
POST /billing/stripe/webhook  (Stripe → us)
POST /billing/stripe/checkout { product_id } → { checkout_url }   (web only)
```

Every `/ai/*` call: auth → entitlement/credit check → reserve → provide →
finalize/refund. Return a structured `402`-style error (`{ error:
"insufficient_credits", needed, have }`) so the client can show the paywall.

---

## 7. Credit economics (grounded in real pricing)

**Cost basis — text (Anthropic, current per-MTok):** Opus 4.8 $5 in / $25 out ·
Sonnet 5 $3 / $15 (intro $2 / $10 through 2026-08-31) · Haiku 4.5 $1 / $5.
Prompt caching: cache **reads ≈ 0.1×** input price, cache **writes 1.25×** (5-min)
or 2× (1-hour) — cache the shared system/scaffold prefix and the per-call input
cost is dominated by the user's short prompt.

**Example real costs** (typical greeting-app calls):

| Operation | Model | ~tokens or unit | ~provider cost |
|---|---|---|---|
| AI wish/caption/rewrite | Haiku 4.5 | 500 in / 300 out | **~$0.002** |
| AI writing (higher quality) | Sonnet 5 | 500 in / 300 out | ~$0.006 |
| Prompt-to-design (text plan) | Sonnet 5 | 2k in / 2k out | ~$0.036 |
| Text-to-image (standard 1024²) | image provider | 1 image | **~$0.04** *(confirm)* |
| Text-to-image (HD) | image provider | 1 image | ~$0.08 *(confirm)* |
| AI avatar (image-gen based) | image provider | 1 image | ~$0.04 *(confirm)* |
| Upscale / enhance | image provider | 1 image | ~$0.01–0.05 *(confirm)* |
| HQ background removal | **on-device** | — | **$0 (free)** |

> Text costs are grounded in current Anthropic pricing. **Image/upscale costs
> are estimates and must be confirmed against the chosen provider's live pricing
> before launch** — image generation is the dominant COGS and the whole credit
> table hinges on it.

**Credit unit:** set **1 credit ≈ $0.02 retail**. Charge credits at a healthy
markup over provider cost so packs are profitable even at the smallest size:

| Operation | Credits | Retail @ $0.02 | Markup vs cost |
|---|---:|---:|---|
| AI text (wish/caption/rewrite) | 1 | $0.02 | ~10× (loss-leader/funnel) |
| Prompt-to-design | 3 | $0.06 | ~1.7× |
| AI image (standard) | 5 | $0.10 | ~2.5× |
| AI image (HD) | 9 | $0.18 | ~2.3× |
| AI avatar | 5 | $0.10 | ~2.5× |
| Upscale / enhance | 2 | $0.04 | ~1–4× |

**Pack pricing (placeholder):** 100 credits **$1.99** · 500 **$7.99** · 1500
**$19.99** (bulk discount). **Pro** ~$4.99/mo includes ~200 credits/mo +
watermark-free + premium content. Tune all numbers against `ai_calls` actuals in
the first month.

Guardrails: cap free BYO-key generosity (it costs *us* nothing, but rate-limit to
deter abuse of the proxy fallback), set a per-account daily proxy ceiling, and
alert if any user's `provider_cost_usd` outruns their spend.

---

## 8. Client integration

- **Keep the free stack.** `aiClient.ts` priority becomes: **Pyntra Cloud (if
  signed-in & entitled/credited) → host hook → in-app BYO-key → on-device WebLLM
  → offline stub.** Free users are untouched.
- **Paywall components:** a reusable `<Paywall reason="credits|pro" />` sheet and
  a small credit-balance chip in the Studio bar. Trigger on `402` from `/ai/*`.
- **Play Billing plugin** (Capacitor) for IAP; **RevenueCat SDK** if we adopt it.
- **Watermark gating** is a client check of the cached `pro_active` flag, but the
  **export watermark must also be enforceable server-side** for any cloud-render
  path so it can't be bypassed by patching the client. (Pure on-device exports
  can't be fully DRM'd — accept that; the value users pay for is convenience +
  cloud AI, not un-crackable pixels.)
- **Restore purchases** button (Play requirement) → re-verify latest purchase.

## 9. Security & anti-fraud

- **Never trust the client** for balance, entitlement, or "already paid."
  Everything re-derived from verified receipts + the server ledger.
- **Server-side receipt verification** for every purchase (Play Developer API /
  Stripe), and **RTDN/webhooks as the source of truth** for subscription state.
- **Atomic credit debits** (transaction + row lock, or per-user durable object)
  to prevent concurrent double-spend.
- **Reserve→finalize→refund** so a failed provider call never burns credits.
- **Rate-limit** the proxy per account and per IP; anomaly-alert on cost spikes.
- **Idempotency keys** on `/ai/*` and on webhook handlers (webhooks retry).
- Provider keys only in the platform secret store; never in client, repo, or logs.

## 10. Compliance & policy

- **Google Play:** digital goods → **must** use Play Billing; ship "Restore
  purchases"; complete the **Data Safety** form (we now collect account email +
  purchase history — disclose it); publish a **privacy policy** URL. Don't steer
  users to web payment from inside the app.
- **Tax:** Play/Stripe handle VAT/GST collection in most regions — confirm per
  market.
- **Refunds:** Play/Stripe user-initiated refunds arrive via RTDN/webhook →
  **claw back** the granted credits (ledger `refund` row) and downgrade
  entitlement.
- **Subscription lifecycle:** handle grace period, account hold, pause, and
  restore explicitly from RTDN — don't cut off a renewing user during a transient
  billing retry.
- **Privacy brand:** update consumer-app copy to "free forever on-device;
  optional paid cloud AI." Keep the on-device/BYO path prominent so the "your
  files never leave your device" promise stays literally true for free users.

## 11. Metrics to instrument from day one

Free→Pro conversion, credit-pack attach rate, ARPU/ARPPU, credit burn per op,
**gross margin per op** (`credits_charged×$0.02 − provider_cost_usd`), paywall
view→purchase rate, churn, and refund rate. `ai_calls` + `credit_ledger` already
carry the raw data.

## 12. Rollout phases

1. **Content gating only (no AI infra):** premium templates/clipart packs +
   watermark-free export behind Pro. Play Billing + entitlements + Stripe(web).
   Validates willingness-to-pay with the least build. *(Ships before the proxy.)*
2. **AI proxy + credits (text first):** AI writing/wishes/captions/translate on
   our key, metered — cheapest to serve, proves the metering loop end-to-end.
3. **Generative credits:** AI image, avatar, prompt-to-design, upscale — the
   real revenue, once image-provider costs are confirmed and the ledger is
   battle-tested.
4. **Tune:** reprice credits/packs from `ai_calls` actuals; add annual plan,
   regional pricing, and a Pro credit allowance sized to observed usage.

## 13. Open decisions (need product input before building)

- **RevenueCat vs. hand-rolled** Play/Stripe verification (speed & fewer bugs vs.
  a third party in the billing path).
- **Final prices:** Pro monthly/yearly, the three credit-pack sizes, the credit
  retail value, and the Pro monthly allowance.
- **Image provider** (OpenAI `gpt-image-1`/DALL·E vs. Replicate/Stability) — sets
  the dominant COGS and therefore the whole credit table.
- **HQ background removal:** keep on-device (free, private) or offer a
  server-side high-quality variant for credits.
- **How hard to enforce the export watermark** on the pure on-device path
  (accept crackability vs. push exports through a cloud render for Pro).
