import { describe, it, expect } from 'vitest';
import { createInvites } from './invites.js';
import { generateEcdhPair } from './keyExchange.js';
import { makeJoinRequest, hostHandleJoin, joinerAcceptGrant } from './gatedAccess.js';

describe('invite-only access protocol (end-to-end)', () => {
  it('admits an invited person and delivers the room key', async () => {
    const host = await generateEcdhPair();
    const roomKey = 'the-room-key';
    let invites = createInvites(['Bo']);
    const tok = invites[0]!.token;

    const bo = await generateEcdhPair();
    const r = await hostHandleJoin(invites, roomKey, host, makeJoinRequest(tok, bo.publicKey, 'deviceBo'));
    invites = r.invites;
    expect(r.denied).toBeUndefined();
    expect(r.grant).toBeTruthy();
    expect(await joinerAcceptGrant(bo, r.grant!)).toBe(roomKey); // Bo gets the key
    expect(invites[0]!.boundDevice).toBe('deviceBo');            // token bound
  });

  it('DENIES a forwarded link and never issues a key grant', async () => {
    const host = await generateEcdhPair();
    const roomKey = 'the-room-key';
    let invites = createInvites(['Bo']);
    const tok = invites[0]!.token;

    // Bo joins first (binds the token to deviceBo).
    const bo = await generateEcdhPair();
    invites = (await hostHandleJoin(invites, roomKey, host, makeJoinRequest(tok, bo.publicKey, 'deviceBo'))).invites;

    // Bo forwards the link to X; X tries to join with Bo's token on a new device.
    const x = await generateEcdhPair();
    const r = await hostHandleJoin(invites, roomKey, host, makeJoinRequest(tok, x.publicKey, 'deviceX'));
    expect(r.grant).toBeUndefined();          // no key grant at all
    expect(r.denied?.reason).toBe('forwarded');
  });

  it('denies unknown/revoked tokens', async () => {
    const host = await generateEcdhPair();
    const invites = createInvites(['Bo']);
    const stranger = await generateEcdhPair();
    const r = await hostHandleJoin(invites, 'k', host, makeJoinRequest('made-up', stranger.publicKey, 'd'));
    expect(r.grant).toBeUndefined();
    expect(r.denied?.reason).toBe('unknown-token');
  });
});
