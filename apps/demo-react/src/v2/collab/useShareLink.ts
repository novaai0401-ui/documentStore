/**
 * The Share-link lifecycle shared by every editor: mint a room (tagged with the
 * editor kind so joiners land in the right surface), copy the capability URL to
 * the clipboard, and rewrite the address bar so a reload rejoins. `isHost` is true
 * for the person who started the room (they seed the shared document); a peer who
 * arrives via a link is a joiner.
 */
import { useCallback, useState } from 'react';
import { createRoom, buildShareUrl, type Room, type CollabKind } from './link.js';

export function useShareLink(kind: CollabKind, collabRoom?: Room): {
  room: Room | null;
  isHost: boolean;
  copied: boolean;
  share: () => Promise<void>;
  copyLink: () => Promise<void>;
} {
  const [room, setRoom] = useState<Room | null>(collabRoom ?? null);
  const [isHost] = useState(!collabRoom);
  const [copied, setCopied] = useState(false);
  const flash = () => { setCopied(true); window.setTimeout(() => setCopied(false), 2500); };

  const share = useCallback(async () => {
    const r = await createRoom(kind);
    setRoom(r);
    const url = buildShareUrl(window.location.origin, r);
    try { await navigator.clipboard?.writeText(url); flash(); } catch { /* clipboard blocked */ }
    try { window.history.replaceState(null, '', url.slice(url.indexOf('/app'))); } catch { /* ignore */ }
  }, [kind]);

  const copyLink = useCallback(async () => {
    if (!room) return;
    try { await navigator.clipboard?.writeText(buildShareUrl(window.location.origin, room)); flash(); } catch { /* ignore */ }
  }, [room]);

  return { room, isHost, copied, share, copyLink };
}
