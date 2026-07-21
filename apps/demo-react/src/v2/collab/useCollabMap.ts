/**
 * React binding for a collaborative structured document (spreadsheet / slides /
 * rich doc) backed by the LWW-Map session. The host seeds the shared state from
 * its current document; joiners start empty and catch up from the snapshot.
 * Remote changes are pushed to the editor via `onRemote`; local edits go out
 * through `set`. Uses the same transport selector as the text editor, so it's
 * cross-tab by default and cross-device when a relay is configured.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MapSession } from './mapSession.js';
import type { Peer } from './presence.js';
import type { RelayStatus } from './transport.js';
import { makeTransport } from './config.js';
import { importKey } from './crypto.js';
import { notifyEdit, notifyJoin } from './collabNotify.js';
import type { Room } from './link.js';

interface Opts {
  room: Room | null;
  name: string;
  isHost: boolean;
  /** Host's initial key→value state, captured once at connect time. */
  seed: () => Record<string, string>;
  onRemote: (entries: Record<string, string>) => void;
}

export function useCollabMap({ room, name, isHost, seed, onRemote }: Opts): {
  peers: Peer[];
  ready: boolean;
  relayStatus: RelayStatus;
  set: (updates: Record<string, string>) => void;
} {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [ready, setReady] = useState(false);
  const [relayStatus, setRelayStatus] = useState<RelayStatus>('connecting');
  const sessionRef = useRef<MapSession | null>(null);
  const onRemoteRef = useRef(onRemote);
  onRemoteRef.current = onRemote;
  const seedRef = useRef(seed);
  seedRef.current = seed;

  const roomId = room?.roomId;
  useEffect(() => {
    if (!room) return;
    let disposed = false;
    let session: MapSession | null = null;
    (async () => {
      try {
        const key = await importKey(room.key);
        const transport = makeTransport(room.roomId);
        session = new MapSession(transport, key, { name });
        if (isHost) session.seed(seedRef.current());
        session.onChange((e) => { onRemoteRef.current(e); notifyEdit(); });
        // Notify when a *new* collaborator joins (skip the initial roster).
        let known: Set<string> | null = null;
        session.onPeers((p) => {
          if (known) for (const peer of p) if (!known.has(peer.id)) notifyJoin(peer.name);
          known = new Set(p.map((x) => x.id));
          setPeers([...p]);
        });
        session.onRelayStatus((status) => {
          setRelayStatus(status);
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

  const set = useCallback((updates: Record<string, string>) => { void sessionRef.current?.set(updates); }, []);
  return { peers, ready, relayStatus, set };
}
