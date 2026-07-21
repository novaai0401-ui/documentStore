/**
 * Invite people to a room with per-person, single-use links. Built on Tekivex-ui
 * (TkxModal, TkxInput, TkxButton, TkxBadge). The host mints one token per person;
 * each link binds to the first device that opens it, so a forwarded copy is
 * refused by admit() (see invites.ts). Status (pending/joined/revoked) is shown.
 */
import { useState } from 'react';
import { TkxModal, TkxInput, TkxButton, TkxBadge } from 'tekivex-ui';
import { createInvites, inviteUrl, inviteStatus, revoke, type Invite } from './invites.js';

const badgeVariant = (s: 'pending' | 'joined' | 'revoked'): 'warning' | 'success' | 'danger' =>
  s === 'joined' ? 'success' : s === 'revoked' ? 'danger' : 'warning';

export function InviteModal({ shareUrl, invites, onChange, onClose }: {
  shareUrl: string;
  invites: Invite[];
  onChange: (invites: Invite[]) => void;
  onClose: () => void;
}) {
  const [names, setNames] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const add = () => {
    const labels = names.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (labels.length) { onChange([...invites, ...createInvites(labels)]); setNames(''); }
  };
  const copy = (token: string) => {
    void navigator.clipboard?.writeText(inviteUrl(shareUrl, token)).then(() => { setCopied(token); setTimeout(() => setCopied(null), 1500); });
  };

  return (
    <TkxModal isOpen onClose={onClose} title="Invite people — forwarding blocked" size="md"
      footer={<TkxButton variant="ghost" size="sm" onClick={onClose}>Done</TkxButton>}>
      <p className="studio-hint">Each person gets their <strong>own</strong> link. A link binds to the first device that opens it — if someone forwards it, the forwarded copy is refused. Revoke any link to remove that person.</p>
      <div className="inv-add">
        <TkxInput label="Names or emails (comma-separated)" value={names} placeholder="Alex, Bo, cy@example.com"
          onChange={(e) => setNames(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={add}>Create links</TkxButton>
      </div>
      <ul className="inv-list">
        {invites.map((i) => {
          const s = inviteStatus(i);
          return (
            <li key={i.token} className="inv-row">
              <span className="inv-name">{i.label}</span>
              <TkxBadge variant={badgeVariant(s)} size="sm">{s}</TkxBadge>
              {s !== 'revoked' && <TkxButton variant="outline" size="sm" onClick={() => copy(i.token)}>{copied === i.token ? 'Copied ✓' : 'Copy link'}</TkxButton>}
              {s !== 'revoked' && <TkxButton variant="ghost" size="sm" onClick={() => onChange(revoke(invites, i.token))}>Revoke</TkxButton>}
            </li>
          );
        })}
        {!invites.length && <li className="studio-hint">No invites yet — add names above to generate per-person links.</li>}
      </ul>
    </TkxModal>
  );
}
