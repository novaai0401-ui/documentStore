import { describe, it, expect } from 'vitest';
import { createInvites, inviteUrl, parseInviteToken, admit, revoke, hasAccessControl, inviteStatus } from './invites.js';

describe('invite access control', () => {
  it('mints one token per invitee', () => {
    const invs = createInvites(['Alex', 'Bo', 'Cy']);
    expect(invs).toHaveLength(3);
    expect(new Set(invs.map((i) => i.token)).size).toBe(3); // all distinct
    expect(invs.map((i) => i.label)).toEqual(['Alex', 'Bo', 'Cy']);
  });

  it('builds and parses per-invitee links', () => {
    const url = inviteUrl('https://x/app#room=r&key=k', 'TOK');
    expect(url).toContain('t=TOK');
    expect(parseInviteToken(url)).toBe('TOK');
    expect(parseInviteToken('https://x/app')).toBeNull();
  });

  it('admits the first device and binds the token to it', () => {
    let invs = createInvites(['B']);
    const tok = invs[0]!.token;
    const r = admit(invs, tok, 'deviceB');
    expect(r.ok).toBe(true);
    invs = r.invites;
    expect(invs[0]!.boundDevice).toBe('deviceB');
    // same device re-admits fine (reconnect)
    expect(admit(invs, tok, 'deviceB').ok).toBe(true);
  });

  it('REJECTS a forwarded link (token bound to a different device)', () => {
    let invs = createInvites(['B']);
    const tok = invs[0]!.token;
    invs = admit(invs, tok, 'deviceB').invites; // B joins
    const x = admit(invs, tok, 'deviceX');       // B forwards link to X
    expect(x.ok).toBe(false);
    expect(x.reason).toBe('forwarded');
  });

  it('rejects unknown and revoked tokens', () => {
    let invs = createInvites(['B']);
    expect(admit(invs, 'made-up', 'd').reason).toBe('unknown-token');
    expect(admit(invs, null, 'd').reason).toBe('unknown-token');
    invs = revoke(invs, invs[0]!.token);
    expect(admit(invs, invs[0]!.token, 'd').reason).toBe('revoked');
  });

  it('reports access-control state and per-invite status', () => {
    let invs = createInvites(['A', 'B']);
    expect(hasAccessControl(invs)).toBe(true);
    expect(inviteStatus(invs[0]!)).toBe('pending');
    invs = admit(invs, invs[0]!.token, 'dA').invites;
    expect(inviteStatus(invs[0]!)).toBe('joined');
    invs = revoke(invs, invs[1]!.token);
    expect(inviteStatus(invs[1]!)).toBe('revoked');
  });
});
