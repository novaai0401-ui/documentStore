/**
 * Protect / Unlock PDF — add or remove a PDF password, 100% in the browser via
 * @cantoo/pdf-lib (protect.ts). Nothing uploaded; unlocking keeps the text layer.
 */
import { useCallback, useMemo, useState } from 'react';
import { TkxButton, TkxInput, TkxCheckbox } from 'tekivex-ui';
import { t, useLang } from '../../i18n.js';
import { protectPdf, unlockPdf, isEncryptedPdf, passwordStrength, type Permissions } from './protect.js';
import { downloadBytes } from '../smart/util.js';

type Tab = 'protect' | 'unlock';
const STRENGTH_COLORS = ['#cbd5e1', '#ef4444', '#f59e0b', '#3b82f6', '#0d9f6e'];

export function ProtectModal({ onClose }: { onClose: () => void }) {
  const lang = useLang();
  const [tab, setTab] = useState<Tab>('protect');
  const [file, setFile] = useState<File | null>(null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // All allowed by default; unchecking a box restricts that action.
  const [perms, setPerms] = useState<Required<Permissions>>({ printing: true, copying: true, modifying: true, annotating: true });
  const strength = useMemo(() => passwordStrength(pw), [pw]);
  const restricted = !perms.printing || !perms.copying || !perms.modifying || !perms.annotating;
  const togglePerm = (k: keyof Permissions) => setPerms((p) => ({ ...p, [k]: !p[k] }));

  const pick = useCallback(async (f: File | null) => {
    setFile(f); setMsg(null); setErr(null);
    if (f) {
      try { const enc = await isEncryptedPdf(new Uint8Array(await f.arrayBuffer())); setTab(enc ? 'unlock' : 'protect'); } catch { /* keep current tab */ }
    }
  }, []);

  const run = useCallback(async () => {
    if (!file) { setErr('Choose a PDF first.'); return; }
    setBusy(true); setErr(null); setMsg(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const stem = file.name.replace(/\.pdf$/i, '');
      if (tab === 'protect') {
        if (pw.length < 3) { setErr('Use a password of at least 3 characters.'); return; }
        if (pw !== pw2) { setErr('Passwords don’t match.'); return; }
        const out = await protectPdf(bytes, { userPassword: pw, permissions: restricted ? perms : undefined });
        downloadBytes(`${stem}-protected.pdf`, out, 'application/pdf');
        setMsg(restricted
          ? 'Protected — the PDF asks for this password to open, with your chosen restrictions applied.'
          : 'Protected — the downloaded PDF now asks for this password to open.');
      } else {
        const out = await unlockPdf(bytes, pw);
        downloadBytes(`${stem}-unlocked.pdf`, out, 'application/pdf');
        setMsg('Unlocked — the downloaded PDF opens without a password.');
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErr(tab === 'unlock' && /password|encrypt/i.test(m) ? 'Wrong password, or this PDF isn’t encrypted.' : m);
    } finally { setBusy(false); }
  }, [file, tab, pw, pw2, perms, restricted]);

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner cmp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>🔒 {t('m_protect_title', lang)}</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <div className="resume-styles" role="tablist">
            <button className={tab === 'protect' ? 'on' : ''} role="tab" aria-selected={tab === 'protect'} onClick={() => { setTab('protect'); setErr(null); setMsg(null); }}>Add password</button>
            <button className={tab === 'unlock' ? 'on' : ''} role="tab" aria-selected={tab === 'unlock'} onClick={() => { setTab('unlock'); setErr(null); setMsg(null); }}>Remove password</button>
          </div>
          <p className="studio-hint">{tab === 'protect' ? 'Encrypt a PDF so it can only be opened with a password.' : 'Remove the password from a PDF you can already open (you’ll need the current password).'} Everything runs in your browser — nothing is uploaded.</p>

          <TkxInput label="PDF file" type="file" accept="application/pdf,.pdf" onChange={(e) => void pick(e.target.files?.[0] ?? null)} />
          <TkxInput label={tab === 'protect' ? 'New password' : 'Current password'} type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Enter password" />
          {tab === 'protect' && pw.length > 0 && (
            <div className="pw-meter" aria-label={`Password strength: ${strength.label}`}>
              <div className="pw-meter-track">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className="pw-meter-seg" style={{ background: i < strength.score ? STRENGTH_COLORS[strength.score] : '#e2e8f0' }} />
                ))}
              </div>
              <span className="pw-meter-label" style={{ color: STRENGTH_COLORS[strength.score] }}>{strength.label}</span>
            </div>
          )}
          {tab === 'protect' && <TkxInput label="Confirm password" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Re-enter password" />}

          {tab === 'protect' && (
            <div className="pw-perms">
              <span className="pw-perms-title">Allow people who open it to:</span>
              <div className="pw-perms-grid">
                {([['printing', 'Print'], ['copying', 'Copy text'], ['modifying', 'Edit content'], ['annotating', 'Add comments']] as const).map(([k, label]) => (
                  <TkxCheckbox key={k} label={label} checked={perms[k]} onChange={() => togglePerm(k)} size="sm" />
                ))}
              </div>
              {restricted && <span className="cmp-row-note">Restricted actions are enforced for anyone opening with this password.</span>}
            </div>
          )}

          {msg && <div className="v2-smart__verify v2-smart__verify--ok" style={{ borderRadius: 8, padding: 10 }}>✓ {msg}</div>}
          {err && <span className="cmp-row-note cmp-row-note--warn">{err}</span>}
        </div>
        <div className="resume-foot">
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy || !file || !pw} onClick={() => void run()}>{busy ? 'Working…' : tab === 'protect' ? '🔒 Protect PDF' : '🔓 Unlock PDF'}</TkxButton>
          <TkxButton variant="ghost" size="sm" onClick={onClose}>{t('act_close', lang)}</TkxButton>
        </div>
      </div>
    </div>
  );
}
