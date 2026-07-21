# @pdfcraft/sdk

License-key infrastructure for embedding pdfcraft in your own product —
**free in development, licensed in production** (the tldraw model), enforced
**fully offline** (ECDSA P-256 signature verification via WebCrypto; no
license server, no phone-home, no telemetry — consistent with
[docs/compliance.md](../../docs/compliance.md)).

## Integrator usage

```tsx
<AppV2 licenseKey="PC1.eyJsaWNlbnNlZSI6…" />
```

- **No key + dev context** (localhost/tests) → `dev`, no badge.
- **No key + production** → `unlicensed`: everything works, a small
  "Built with pdfcraft" badge is shown.
- **Valid key** → `licensed`, no badge. Keys can carry an expiry date and a
  domain allow-list (subdomains included).

## Vendor: minting keys

```bash
node scripts/generate-license.mjs keypair       # once: print key pair
# embed the PUBLIC jwk in src/license.ts; keep the PRIVATE jwk secret
PRIVATE_JWK='<json>' node scripts/generate-license.mjs sign \
  --licensee "Acme Corp" --exp 2027-06-30 --domains acme.com
```

> The repo ships with a placeholder public key — **all keys are rejected
> until you embed a real one**, which is the safe default.

See `LICENSE.md` for the commercial terms summary (pricing TBD by owner).
