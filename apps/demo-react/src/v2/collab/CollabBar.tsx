/**
 * The "Live" presence strip shown while an editor is in a collaboration room:
 * connection dot, peer avatars, participant count, cross-device reach, expiry,
 * and a copy-link button. Shared by every editor so collaboration looks and
 * behaves identically across text, Word, spreadsheet, and slides.
 */
import { useState } from 'react';
import { timeLeft, type Room } from './link.js';
import { isCrossDevice } from './config.js';
import type { RelayStatus } from './transport.js';
import { notifySupported, notifyEnabled, enableNotifications, disableNotifications } from './collabNotify.js';
import type { Peer } from './presence.js';

interface Props {
  room: Room;
  peers: Peer[];
  ready: boolean;
  /** Live cross-device relay status ('online' once a relay is connected). */
  relayStatus?: RelayStatus;
  copied: boolean;
  onCopy: () => void;
}

export function CollabBar({ room, peers, ready, relayStatus = 'connecting', copied, onCopy }: Props) {
  const [notify, setNotify] = useState(notifyEnabled());
  const toggleNotify = async () => {
    if (notify) { disableNotifications(); setNotify(false); }
    else { setNotify(await enableNotifications()); }
  };
  // Honest reach: claim "Across devices" only once the relay is truly connected.
  // If a relay is configured but unreachable, say "this device only" (don't sit on
  // "connecting…" forever or imply cross-device works). If none is configured,
  // it's plainly this-device.
  const reach = relayStatus === 'online'
    ? { cls: ' ed-collab-reach--on', label: '🌐 Across devices', title: 'End-to-end encrypted through a relay — anyone with the link can join from any device' }
    : !isCrossDevice()
      ? { cls: '', label: '🖥 This device', title: 'Real-time across tabs and windows on this device (no relay configured)' }
      : relayStatus === 'connecting'
        ? { cls: '', label: '🖥 This device · connecting…', title: 'Trying to reach the cross-device relay. Until it connects, editing is shared across tabs on this device only.' }
        : { cls: ' ed-collab-reach--warn', label: '🖥 This device only', title: 'Can’t reach the cross-device relay — someone on another device won’t see your changes yet (still retrying). Editing is shared across tabs on this device.' };
  return (
    <div className="ed-collab-bar" role="status">
      <span className={'ed-collab-dot' + (ready ? ' ed-collab-dot--on' : '')} />
      <strong>Live</strong>
      <span className="ed-collab-peers">
        <span className="ed-collab-avatar" style={{ background: '#334155' }} title="You">Y</span>
        {peers.map((p) => (
          <span key={p.id} className="ed-collab-avatar" style={{ background: p.color }} title={p.name}>{p.name.charAt(0).toUpperCase()}</span>
        ))}
      </span>
      <span className="ed-collab-count">{peers.length === 0 ? 'Waiting for others…' : `${peers.length + 1} editing`}</span>
      <span className="ed-collab-spacer" />
      <span className={'ed-collab-reach' + reach.cls} title={reach.title}>{reach.label}</span>
      <span className="ed-collab-exp">{timeLeft(room)}</span>
      {notifySupported() && (
        <button
          className={'ed-collab-notify' + (notify ? ' ed-collab-notify--on' : '')}
          onClick={() => void toggleNotify()}
          title={notify ? 'You’ll get a notification when a collaborator edits or joins. Click to turn off.' : 'Get notified when someone with the link edits or joins this document'}
        >{notify ? '🔔 Notifying' : '🔕 Notify me'}</button>
      )}
      <button className="ed-collab-copy" onClick={onCopy}>{copied ? '✓ Link copied' : '🔗 Copy link'}</button>
    </div>
  );
}
