/**
 * Invite-based access control for collaboration rooms. Today anyone with the link
 * can join; this adds per-person, single-use invite tokens so a forwarded link is
 * rejected. The host mints one token per invitee (A, B, C…). The first DEVICE to
 * use a token binds it; if that link is forwarded (e.g. B → X), X presents a token
 * already bound to another device and is refused admission. The host is the
 * authority — it runs admit() and only shares the session key with admitted peers.
 *
 * Pure and unit-tested; the live session wires admit() into peer handshakes.
 */
import { randomToken } from './crypto.js';
import type { Room } from './link.js';

export interface Invite {
  token: string;
  label: string;          // who it's for ("Alex", "alex@x.com")
  createdAt: number;
  boundDevice?: string;   // the first device that used it
  boundAt?: number;
  revoked?: boolean;
}

const DEVICE_KEY = 'pyntra:device-id';
/** A stable per-device id (random, persisted) used to bind invites to a device. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) { id = randomToken(16); localStorage.setItem(DEVICE_KEY, id); }
    return id;
  } catch { return 'ephemeral-' + Math.random().toString(36).slice(2); }
}

/** Mint one invite per label. */
export function createInvites(labels: string[]): Invite[] {
  return labels.map((label) => ({ token: randomToken(12), label: label.trim() || 'Guest', createdAt: Date.now() }));
}

/** A per-invitee link: the room link plus the invite token. */
export function inviteUrl(shareUrl: string, token: string): string {
  return shareUrl + (shareUrl.includes('#') ? '&' : '#') + 't=' + token;
}

/** Read the invite token from a URL fragment (or null). */
export function parseInviteToken(href: string): string | null {
  try { return new URLSearchParams(new URL(href).hash.replace(/^#/, '')).get('t'); } catch { return null; }
}

export type AdmitReason = 'ok' | 'unknown-token' | 'revoked' | 'forwarded';

/**
 * Host-side admission. Binds the token to `device` on first use; admits the same
 * device again; refuses an unknown/revoked token or a token already bound to a
 * DIFFERENT device (the forwarded-link case). Returns the (possibly updated) list.
 */
export function admit(invites: Invite[], token: string | null, device: string): { ok: boolean; reason: AdmitReason; invites: Invite[]; invite?: Invite } {
  const inv = token ? invites.find((i) => i.token === token) : undefined;
  if (!inv) return { ok: false, reason: 'unknown-token', invites };
  if (inv.revoked) return { ok: false, reason: 'revoked', invites };
  if (inv.boundDevice && inv.boundDevice !== device) return { ok: false, reason: 'forwarded', invites };
  if (inv.boundDevice === device) return { ok: true, reason: 'ok', invites, invite: inv };
  const bound: Invite = { ...inv, boundDevice: device, boundAt: Date.now() };
  return { ok: true, reason: 'ok', invites: invites.map((i) => (i.token === token ? bound : i)), invite: bound };
}

/** Revoke an invite (kicks the bound device on next admit check). */
export function revoke(invites: Invite[], token: string): Invite[] {
  return invites.map((i) => (i.token === token ? { ...i, revoked: true } : i));
}

/** Whether a room currently has access control (any non-revoked invites). */
export function hasAccessControl(invites: Invite[]): boolean {
  return invites.some((i) => !i.revoked);
}

/** Status label for the host's invite list UI. */
export function inviteStatus(i: Invite): 'pending' | 'joined' | 'revoked' {
  return i.revoked ? 'revoked' : i.boundDevice ? 'joined' : 'pending';
}

export type { Room };
