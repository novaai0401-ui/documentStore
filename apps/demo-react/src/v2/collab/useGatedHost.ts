/**
 * Host-side binding for invite-only rooms: while the host is in the room, listen
 * on the gate channel and hand the room key — per device — only to joiners whose
 * token passes admit(). A forwarded token is refused (no key), so a keyless invite
 * link can't be shared on. Device binds are persisted back through onInvitesChange.
 *
 * The gate is (re)started when the host's own invite set changes (a token added or
 * revoked), but NOT when a device merely binds — so a join never restarts the
 * listener it's talking to. The freshly started gate seeds from the latest invites
 * (including prior binds), so nothing is lost across a restart.
 */
import { useEffect, useRef } from 'react';
import { generateEcdhPair, type EcdhPair } from './keyExchange.js';
import { hostGate, type GateHostHandle } from './gatedSession.js';
import type { Invite } from './invites.js';
import type { Room } from './link.js';

export function useGatedHost(opts: {
  room: Room | null;
  isHost: boolean;
  invites: Invite[];
  onInvitesChange: (invites: Invite[]) => void;
}): void {
  const invitesRef = useRef(opts.invites);
  invitesRef.current = opts.invites;
  const onChangeRef = useRef(opts.onInvitesChange);
  onChangeRef.current = opts.onInvitesChange;

  const roomId = opts.room?.roomId;
  const roomKey = opts.room?.key;
  const enabled = opts.isHost && opts.invites.length > 0 && !!roomId && !!roomKey;
  // Restart only on host-controlled changes (tokens added / revoked), not on a
  // device bind — so an in-flight join doesn't tear down its own listener.
  const sig = opts.invites.map((i) => `${i.token}:${i.revoked ? 1 : 0}`).join(',');

  useEffect(() => {
    if (!enabled || !roomId || !roomKey) return;
    let handle: GateHostHandle | null = null;
    let pair: EcdhPair | null = null;
    let disposed = false;
    (async () => {
      pair = await generateEcdhPair();
      if (disposed) return;
      handle = hostGate({
        roomId,
        roomKeyB64: roomKey,
        hostPair: pair,
        invites: invitesRef.current,
        onInvitesChange: (i) => onChangeRef.current(i),
      });
    })();
    return () => { disposed = true; handle?.close(); };
  }, [enabled, roomId, roomKey, sig]);
}
