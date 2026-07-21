/**
 * Family Occasion Studio — "everyone in one picture."
 * Pick an occasion → add each family member's photo (from anywhere — they just
 * WhatsApp you one picture) → kids pick costumes → the scene composes itself →
 * the family votes between variants → share the winner to WhatsApp / set as DP
 * / open in the studio to fine-tune. Photos never leave the device.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TkxButton, TkxInput } from 'tekivex-ui';
import { designToSvg, type Design } from './model.js';
import {
  FAMILY_THEMES, SCENE_VARIANTS, familyThemeById, familyScene, newMemberId,
  loadFamilyProject, saveFamilyProject, inviteMessage, type FamilyMember,
} from './familyStudio.js';
import { projectToEntries, entriesToProject, tallyVotes, voterId } from './familySync.js';
import { PhotoArtModal } from './PhotoArtModal.js';
import { designToPng } from './exportDesign.js';
import { shareToWhatsApp } from './whatsapp.js';
import { useCollabMap } from '../collab/useCollabMap.js';
import { createRoom, buildShareUrl, type Room } from '../collab/link.js';

const svgUri = (d: Design) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(designToSvg(d));

const readAsDataUri = (f: File): Promise<string> => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = () => rej(new Error('read failed'));
  r.readAsDataURL(f);
});

export function FamilyStudioModal({ onClose, onOpenStudio, room: joinRoom, isHost: joinIsHost }: {
  onClose: () => void;
  onOpenStudio: (name: string, design: Design) => void;
  /** Set when opened from a family invite link — the modal starts live in
   *  contributor mode (the relative adds their one photo, votes, reacts). */
  room?: Room | null;
  isHost?: boolean;
}) {
  const saved = useMemo(() => (joinRoom ? null : loadFamilyProject()), [joinRoom]);
  const [themeId, setThemeId] = useState(saved?.themeId ?? 'diwali');
  const [members, setMembers] = useState<FamilyMember[]>(saved?.members ?? []);
  const [localVotes, setLocalVotes] = useState<number[]>(saved?.votes ?? [0, 0, 0]);
  const [voteCounts, setVoteCounts] = useState<number[]>([0, 0, 0]);
  const [variantIdx, setVariantIdx] = useState(0);
  const [newName, setNewName] = useState('');
  const [costumeFor, setCostumeFor] = useState<string | null>(null);
  // The member whose photo the Photo Art picker is open for (a clean full
  // picker, not a cramped popover). Keep each member's ORIGINAL photo so
  // re-styling always starts from the source.
  const [styleFor, setStyleFor] = useState<string | null>(null);
  const origPhotos = useRef<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const photoForRef = useRef<string | null>(null);

  // ── Live multiplayer: each relative joins the room on their own phone ──────
  const [room, setRoom] = useState<Room | null>(joinRoom ?? null);
  const isHost = joinRoom ? !!joinIsHost : true; // opened from a link → joiner (unless host)
  const live = !!room;
  const [copied, setCopied] = useState(false);
  const membersRef = useRef(members);
  membersRef.current = members;
  const themeRef = useRef(themeId);
  themeRef.current = themeId;

  const collab = useCollabMap({
    room,
    name: 'Family',
    isHost,
    seed: () => projectToEntries({ themeId: themeRef.current, members: membersRef.current, votes: [0, 0, 0] }),
    onRemote: (entries) => {
      const p = entriesToProject(entries);
      setThemeId(p.themeId);
      setMembers(p.members);
      setVoteCounts(tallyVotes(entries, SCENE_VARIANTS.length));
    },
  });
  const push = useCallback((updates: Record<string, string>) => { if (live) collab.set(updates); }, [live, collab]);

  const theme = familyThemeById(themeId);
  const votes = live ? voteCounts : localVotes;
  const persist = (m: FamilyMember[], v = localVotes, t = themeId) => { if (!live) saveFamilyProject({ themeId: t, members: m, votes: v }); };

  const changeTheme = (t: string) => { setThemeId(t); persist(members, localVotes, t); push({ theme: t }); };

  const addMember = (memorial = false) => {
    if (!newName.trim()) return;
    const m: FamilyMember = { id: newMemberId(), name: newName.trim(), photo: '', costume: '', ...(memorial ? { memorial: true } : {}) };
    const next = [...members, m];
    setMembers(next); setNewName(''); persist(next);
    push({ ['member:' + m.id]: JSON.stringify(m), order: JSON.stringify(next.map((x) => x.id)) });
  };
  const removeMember = (id: string) => {
    const next = members.filter((m) => m.id !== id);
    setMembers(next); persist(next);
    push({ ['member:' + id]: '', order: JSON.stringify(next.map((x) => x.id)) });
  };
  const updateMember = (id: string, patch: Partial<FamilyMember>) => {
    const next = members.map((m) => (m.id === id ? { ...m, ...patch } : m));
    setMembers(next); persist(next);
    const changed = next.find((m) => m.id === id);
    if (changed) push({ ['member:' + id]: JSON.stringify(changed) });
    return next;
  };
  const setCostume = (id: string, costume: string) => { updateMember(id, { costume }); setCostumeFor(null); };
  const pickPhoto = (id: string) => { photoForRef.current = id; fileRef.current?.click(); };
  const onFile = async (f: File | undefined) => {
    if (!f || !photoForRef.current) return;
    const uri = await readAsDataUri(f);
    origPhotos.current.set(photoForRef.current, uri); // remember the source
    updateMember(photoForRef.current, { photo: uri });
  };

  // The three variants the family votes between.
  const scenes = useMemo(() => SCENE_VARIANTS.map((v) => familyScene(theme, members, v)), [theme, members]);
  const vote = (i: number) => {
    setVariantIdx(i);
    if (live) { push({ ['vote:' + voterId()]: String(i) }); }
    else { const v = localVotes.map((x, j) => (j === i ? x + 1 : x)); setLocalVotes(v); persist(members, v); }
  };

  // Host: go live — mint a family room and surface the invite link.
  const [starting, setStarting] = useState(false);
  const goLive = async () => {
    setStarting(true);
    try { setRoom(await createRoom('family')); } finally { setStarting(false); }
  };
  const inviteLink = useMemo(() => (room ? buildShareUrl(window.location.origin, room) : ''), [room]);
  const copyInvite = async () => { try { await navigator.clipboard.writeText(inviteLink); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* */ } };
  const shareInvite = () => { void shareToWhatsApp({ text: inviteMessage(theme.name), url: inviteLink }); };
  // Auto-follow the winning variant into the preview selection once votes land.
  useEffect(() => { if (live && voteCounts.some((n) => n > 0)) { const w = voteCounts.indexOf(Math.max(...voteCounts)); if (w >= 0) setVariantIdx(w); } }, [live, voteCounts]);

  const exportScene = async (square: boolean, share: boolean) => {
    setBusy(true); setFlash(null);
    try {
      const d = square ? familyScene(theme, members, SCENE_VARIANTS[variantIdx]!, 1080, 1080) : scenes[variantIdx]!;
      const png = await designToPng(d, 2);
      const file = new File([png as BlobPart], `family-${theme.id}${square ? '-dp' : ''}.png`, { type: 'image/png' });
      if (share) {
        const r = await shareToWhatsApp({ file, text: `Our "${theme.name}" family portrait 💛 — made on Pyntra` });
        setFlash(r === 'downloaded' ? '✓ Saved — attach it in WhatsApp' : '✓ Shared!');
      } else {
        const { downloadBytes } = await import('../smart/util.js');
        downloadBytes(file.name, png, 'image/png');
        setFlash(square ? '✓ DP saved (square) — set it as your WhatsApp group photo' : '✓ Portrait saved');
      }
    } catch { setFlash('Export failed — try again.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner inv-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>👨‍👩‍👧‍👦 Family Portrait Studio{live ? ' · Live' : ''}</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          {joinRoom && !isHost
            ? <p className="studio-hint">You’re joining a family portrait 💛 Add <strong>one photo of yourself</strong> below — it appears on everyone’s screen instantly. Then vote for your favourite look. Your photo is end-to-end encrypted; the server never sees it.</p>
            : <p className="studio-hint">Everyone in one picture — even from different cities. Pick an occasion, add one photo per person, let the kids pick costumes, then vote on the favourite look. Tap <strong>“Invite family (live)”</strong> and everyone adds their own photo from their own phone. Photos never leave your devices unencrypted.</p>}

          {live && (
            <div className="fam-live">
              <span className="fam-live-dot" aria-hidden />
              <span className="fam-live-count">{collab.ready ? `${collab.peers.length + 1} in the room` : 'Connecting…'}</span>
              {isHost && (
                <>
                  <button className="fam-live-copy" onClick={() => void copyInvite()}>{copied ? '✓ Link copied' : '🔗 Copy invite link'}</button>
                  <button className="fam-live-copy" onClick={shareInvite}>📲 WhatsApp the family</button>
                </>
              )}
            </div>
          )}

          {/* 1 · Occasion (host picks; joiners follow) */}
          <div className="fam-step"><span className="fam-step-label">1 · {isHost ? 'Pick the occasion' : 'Occasion'}</span>
            <div className="fam-themes">
              {FAMILY_THEMES.map((t) => (
                <button key={t.id} className={'fam-theme' + (t.id === themeId ? ' on' : '')} disabled={!isHost} onClick={() => changeTheme(t.id)}>
                  <span aria-hidden>{t.emoji}</span> {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* 2 · Family */}
          <div className="fam-step"><span className="fam-step-label">2 · {isHost ? `Add the family (${members.length})` : `The family (${members.length}) — add yourself`}</span>
            <div className="fam-add-row">
              <TkxInput label="" value={newName} placeholder={isHost ? 'Name — e.g. Aaji, Rohan, Papa' : 'Your name'} onChange={(e) => setNewName(e.target.value)} />
              <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={() => addMember(false)} disabled={!newName.trim()}>＋ Add</TkxButton>
              {isHost && <TkxButton variant="ghost" size="sm" onClick={() => addMember(true)} disabled={!newName.trim()} title="Include a late loved one — honoured with a golden halo and garland in the portrait">🤍 Remember them</TkxButton>}
              {isHost && !live && <TkxButton variant="outline" size="sm" onClick={() => void goLive()} disabled={starting} title="Everyone adds their own photo from their own phone — live">{starting ? '…' : '📲 Invite family (live)'}</TkxButton>}
            </div>
            {members.length > 0 && (
              <div className="fam-members">
                {members.map((m) => (
                  <div key={m.id} className="fam-member">
                    <button className={'fam-photo' + (m.photo ? ' has' : '')} onClick={() => pickPhoto(m.id)} title={m.photo ? 'Change photo' : 'Add their photo'}>
                      {m.photo ? <img src={m.photo} alt={m.name} /> : <span>📷</span>}
                    </button>
                    <span className="fam-name">{m.memorial ? '🤍 ' : ''}{m.name}{m.costume ? ` ${m.costume}` : ''}</span>
                    {!m.memorial && (
                      <button className="fam-costume-btn" onClick={() => setCostumeFor(costumeFor === m.id ? null : m.id)} title="Kids' job: pick their costume!">🎭</button>
                    )}
                    {m.photo && origPhotos.current.has(m.id) && (
                      <button className="fam-style-btn" onClick={() => setStyleFor(m.id)} title="Turn their photo into a sketch, cartoon, painting… (free, on your device)">✨</button>
                    )}
                    <button className="fam-del" onClick={() => removeMember(m.id)} aria-label={`Remove ${m.name}`}>🗑</button>
                    {costumeFor === m.id && (
                      <div className="fam-costumes">
                        {theme.costumes.map((c) => <button key={c} onClick={() => setCostume(m.id, c)}>{c}</button>)}
                        <button onClick={() => setCostume(m.id, '')}>✕ none</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void onFile(f); }} />
          </div>

          {/* 3 · Vote on the look */}
          {members.length > 0 && (
            <div className="fam-step"><span className="fam-step-label">3 · Vote on the look{live ? ' · everyone gets one vote' : ''}</span>
              <div className="fam-variants">
                {scenes.map((d, i) => (
                  <div key={i} className={'fam-variant' + (i === variantIdx ? ' on' : '')}>
                    <button className="fam-variant-img" onClick={() => setVariantIdx(i)}>
                      <img src={svgUri(d)} alt={SCENE_VARIANTS[i]!.label} loading="lazy" />
                    </button>
                    <div className="fam-variant-row">
                      <span>{SCENE_VARIANTS[i]!.label}</span>
                      <button className="fam-vote" onClick={() => vote(i)} title="Vote for this one">❤️ {votes[i] || 0}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {flash && <span className="cmp-row-note">{flash}</span>}
        </div>
        <div className="resume-foot">
          {isHost ? (
            <>
              <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy || !members.length} onClick={() => void exportScene(false, true)}>📲 Share on WhatsApp</TkxButton>
              <TkxButton variant="outline" size="sm" disabled={busy || !members.length} onClick={() => void exportScene(true, false)}>🖼 Save as DP (square)</TkxButton>
              <TkxButton variant="outline" size="sm" disabled={busy || !members.length} onClick={() => void exportScene(false, false)}>⬇ Save PNG</TkxButton>
              <TkxButton variant="ghost" size="sm" disabled={!members.length} onClick={() => onOpenStudio(`family-${theme.id}`, scenes[variantIdx]!)}>🎨 Fine-tune in studio</TkxButton>
            </>
          ) : (
            <span className="fam-join-note">Your photo &amp; vote are in 💛 The host will share the final portrait with everyone.</span>
          )}
          <TkxButton variant="ghost" size="sm" onClick={onClose}>Close</TkxButton>
        </div>
      </div>
      {styleFor && origPhotos.current.has(styleFor) && (
        <PhotoArtModal
          initialSrc={origPhotos.current.get(styleFor)!}
          onClose={() => setStyleFor(null)}
          onApply={(styled) => { updateMember(styleFor, { photo: styled }); setStyleFor(null); }}
        />
      )}
    </div>
  );
}
