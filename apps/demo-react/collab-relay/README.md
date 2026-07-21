# pdfcraft collab relay

A tiny, **zero-dependency, zero-knowledge** WebSocket relay that turns same-machine
collaboration into cross-device collaboration. Two people on different computers —
different networks, different countries — can co-edit a document by both pointing
their browser at the same relay.

> **Recommended:** you usually don't need to run this separately. The production
> server `scripts/serve.mjs` (used by `render.yaml` / `pnpm start`) serves the app
> **and** this relay on the same origin, and the client auto-connects to it — so
> deploying pdfcraft as a Web Service makes cross-device sharing work with no
> configuration. This standalone relay is for when you host the app statically and
> want the relay elsewhere (then set `VITE_COLLAB_RELAY` to its URL).

## What it does (and doesn't)

- **Does:** accept WebSocket connections, group them by an opaque `room` id, and
  rebroadcast binary frames to the other members of that room.
- **Doesn't:** decrypt, store, or inspect anything. Every data frame is already
  end-to-end encrypted in the browser (AES-GCM, key in the URL fragment which never
  reaches any server). The relay sees only ciphertext and a random room id, so it
  cannot read documents even if fully compromised.

Because it's a server relay rather than peer-to-peer, it also "just works" through
NAT and corporate firewalls — no STUN/TURN, no signaling dance.

## Run it

```sh
node server.mjs            # listens on :8787
PORT=9000 node server.mjs  # or pick a port
```

No `npm install` — it speaks RFC 6455 framing directly over Node's built-in
`http`/`net`. Put it behind a TLS terminator (Caddy, nginx, a PaaS) so browsers can
reach it over `wss://`.

## Point the app at it

Runtime (no rebuild), in the browser console of the deployed demo:

```js
localStorage['pdfcraft:relay'] = 'wss://your-relay.example.com';
```

…or at build time:

```sh
VITE_COLLAB_RELAY=wss://your-relay.example.com npm run build
```

With no relay configured the app falls back to BroadcastChannel (cross-tab on one
machine), so nothing breaks if you never deploy this.

## Health check

`GET /health` returns `200 ok` for load-balancer probes.
