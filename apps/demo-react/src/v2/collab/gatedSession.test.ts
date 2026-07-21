import { describe, it, expect } from 'vitest';
import { memTransportPair } from './transport.js';
import { hostGate, requestJoin } from './gatedSession.js';
import { generateEcdhPair } from './keyExchange.js';
import { createInvites, type Invite } from './invites.js';
import { generateKey, exportKey } from './crypto.js';

/**
 * End-to-end test of the live handshake over an in-memory transport pair: the
 * host listens, a joiner presents a token, and the room key is (or isn't)
 * delivered. memTransportPair links the host endpoint to the joiner endpoint so
 * the request/grant frames actually flow between two "devices".
 */
async function fixture() {
  const [hostT, joinerT] = memTransportPair();
  const hostPair = await generateEcdhPair();
  const roomKeyB64 = await exportKey(await generateKey());
  return { hostT, joinerT, hostPair, roomKeyB64 };
}

describe('gatedSession — live gated-access handshake', () => {
  it('admits an invited joiner and delivers the room key', async () => {
    const { hostT, joinerT, hostPair, roomKeyB64 } = await fixture();
    const invites = createInvites(['Alex']);
    const token = invites[0].token;
    let persisted: Invite[] = invites;

    const host = hostGate({
      roomId: 'r1', roomKeyB64, hostPair, invites,
      onInvitesChange: (i) => { persisted = i; },
      transportFactory: () => hostT,
    });

    const res = await requestJoin({ roomId: 'r1', token, deviceId: 'devA', timeoutMs: 2000, transportFactory: () => joinerT });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.roomKeyB64).toBe(roomKeyB64); // the real key crossed, intact
    expect(persisted[0].boundDevice).toBe('devA');       // and the token bound to the device
    host.close();
  });

  it('denies a forwarded token (bound to another device) and never sends the key', async () => {
    const { hostT, joinerT, hostPair, roomKeyB64 } = await fixture();
    // Token already bound to devA → a different device presenting it is the forwarded case.
    const invites = createInvites(['Alex']).map((i): Invite => ({ ...i, boundDevice: 'devA', boundAt: Date.now() }));
    const token = invites[0].token;

    const host = hostGate({ roomId: 'r2', roomKeyB64, hostPair, invites, transportFactory: () => hostT });
    const res = await requestJoin({ roomId: 'r2', token, deviceId: 'devX', timeoutMs: 2000, transportFactory: () => joinerT });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('forwarded');
    host.close();
  });

  it('denies an unknown token', async () => {
    const { hostT, joinerT, hostPair, roomKeyB64 } = await fixture();
    const host = hostGate({ roomId: 'r3', roomKeyB64, hostPair, invites: createInvites(['Alex']), transportFactory: () => hostT });
    const res = await requestJoin({ roomId: 'r3', token: 'not-a-real-token', deviceId: 'devA', timeoutMs: 2000, transportFactory: () => joinerT });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('unknown-token');
    host.close();
  });

  it('times out when no host is listening', async () => {
    const [, joinerT] = memTransportPair(); // host endpoint left unread
    const res = await requestJoin({ roomId: 'r4', token: 'x', deviceId: 'devA', timeoutMs: 150, transportFactory: () => joinerT });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('timeout');
  });
});
