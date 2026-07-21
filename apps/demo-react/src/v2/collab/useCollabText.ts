/**
 * React binding for a collaborative text session. Given a room (capability +
 * key), it opens an encrypted CollabSession over a transport chosen by config:
 * BroadcastChannel for same-machine cross-tab editing (no server), or a WebSocket
 * relay for cross-device editing when one is configured. It forwards remote text
 * into the editor and exposes `push` for local edits plus the live peer list.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CollabSession, type Peer } from './session.js';
import type { RelayStatus } from './transport.js';
import { makeTransport } from './config.js';
import { importKey } from './crypto.js';
import { notifyEdit, notifyJoin } from './collabNotify.js';
import type { Room } from './link.js';

interface Opts {
  room: Room | null;
  name: string;
  /** Host seeds the shared doc with its current text; joiners pass '' and catch up. */
  initialText: string;
  onRemoteText: (text: string) => void;
}

export function useCollabText({ room, name, initialText, onRemoteText }: Opts): {
  peers: Peer[];
  ready: boolean;
  relayStatus: RelayStatus;
  push: (text: string) => void;
  setCursor: (pos: number) => void;
} {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [ready, setReady] = useState(false);
  const [relayStatus, setRelayStatus] = useState<RelayStatus>('connecting');
  const sessionRef = useRef<CollabSession | null>(null);
  const onRemoteRef = useRef(onRemoteText);
  onRemoteRef.current = onRemoteText;
  const seedRef = useRef(initialText);
  seedRef.current = initialText;

  const roomId = room?.roomId;
  useEffect(() => {
    if (!room) return;
    let disposed = false;
    let session: CollabSession | null = null;
    (async () => {
      try {
        const key = await importKey(room.key);
        const transport = makeTransport(room.roomId);
        session = new CollabSession(transport, key, { name, initialText: seedRef.current });
        session.onText((t) => { onRemoteRef.current(t); notifyEdit(); });
        let known: Set<string> | null = null;
        session.onPeers((p) => {
          if (known) for (const peer of p) if (!known.has(peer.id)) notifyJoin(peer.name);
          known = new Set(p.map((x) => x.id));
          setPeers([...p]);
        });
        session.onRelayStatus((status) => {
          setRelayStatus(status);
          // A device that just connected to the relay re-announces so peers
          // reply with the current document.
          if (status === 'online') void session?.announce();
        });
        await session.start();
        if (disposed) { void session.leave(); return; }
        sessionRef.current = session;
        setReady(true);
      } catch { /* bad key / unsupported — stay disconnected */ }
    })();
    return () => {
      disposed = true;
      setReady(false);
      setPeers([]);
      setRelayStatus('connecting');
      sessionRef.current = null;
      void session?.leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const push = useCallback((text: string) => { void sessionRef.current?.setText(text); }, []);
  const setCursor = useCallback((pos: number) => { void sessionRef.current?.setCursor(pos); }, []);
  return { peers, ready, relayStatus, push, setCursor };
}
