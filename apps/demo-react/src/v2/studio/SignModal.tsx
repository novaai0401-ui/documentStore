/**
 * Sign & verify — create or check a verifiable signature for any file, 100%
 * locally. Signing produces a small `.sig.json` manifest (with the public key
 * embedded) that travels next to the document; verifying re-hashes the file and
 * checks the signature. Pure crypto lives in smart/sign.ts.
 */
import { useState } from 'react';
import { TkxButton, TkxInput } from 'tekivex-ui';
import { t, useLang } from '../../i18n.js';
import { generateSigningKey, signDocument, verifyDocument, manifestToJson, manifestFromJson, type VerifyResult } from '../smart/sign.js';
import { runBatch, summarize } from '../smart/batch.js';
import { zipStore } from '../smart/zip.js';
import { downloadBytes } from '../smart/util.js';

const readBytes = async (f: File) => new Uint8Array(await f.arrayBuffer());

export function SignModal({ onClose }: { onClose: () => void }) {
  const lang = useLang();
  const [tab, setTab] = useState<'sign' | 'verify'>('sign');
  const [signer, setSigner] = useState('');
  const [signFiles, setSignFiles] = useState<File[]>([]);
  const [doc, setDoc] = useState<File | null>(null);
  const [sigFile, setSigFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const doSign = async () => {
    if (signFiles.length === 0) { setMsg('Choose one or more files to sign.'); return; }
    setBusy(true); setMsg(null);
    try {
      // One signing identity signs the whole batch.
      const keys = await generateSigningKey();
      const enc = new TextEncoder();
      if (signFiles.length === 1) {
        const f = signFiles[0]!;
        const manifest = await signDocument(await readBytes(f), signer, keys);
        downloadBytes(`${f.name}.sig.json`, enc.encode(manifestToJson(manifest)), 'application/json');
        setMsg(`Signed “${f.name}”. Keep the .sig.json next to the file — anyone can verify it offline.`);
      } else {
        const results = await runBatch(
          signFiles,
          async (f) => ({ name: `${f.name}.sig.json`, data: enc.encode(manifestToJson(await signDocument(await readBytes(f), signer, keys))) }),
          (f) => f.name,
          (d, t) => setMsg(`Signing ${d} / ${t}…`),
        );
        const entries = results.flatMap((r) => (r.ok && r.output ? [r.output] : []));
        downloadBytes('signatures.zip', zipStore(entries), 'application/zip');
        setMsg(`${summarize(results).text}. Downloaded a zip of .sig.json manifests.`);
      }
    } catch (err) { setMsg(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };

  const doVerify = async () => {
    if (!doc || !sigFile) { setMsg('Choose both the document and its .sig.json.'); return; }
    setBusy(true); setMsg(null); setResult(null);
    try {
      const manifest = manifestFromJson(await sigFile.text());
      setResult(await verifyDocument(await readBytes(doc), manifest));
    } catch (err) { setMsg(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner resume-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>🔏 {t('m_sign_title', lang)}</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <div className="resume-styles" role="tablist">
            <button className={tab === 'sign' ? 'on' : ''} role="tab" aria-selected={tab === 'sign'} onClick={() => { setTab('sign'); setMsg(null); setResult(null); }}>Sign a file</button>
            <button className={tab === 'verify' ? 'on' : ''} role="tab" aria-selected={tab === 'verify'} onClick={() => { setTab('verify'); setMsg(null); setResult(null); }}>Verify a signature</button>
          </div>

          <p className="studio-hint">A verifiable signature proves a file hasn&rsquo;t changed and was signed by a specific key — created and checked entirely in your browser, no server, no upload.</p>

          {tab === 'sign' ? (
            <>
              <TkxInput label="Signer name" value={signer} onChange={(e) => setSigner(e.target.value)} placeholder="e.g. Ada Lovelace" />
              <TkxInput label="File(s) to sign — pick several to batch-sign" type="file" multiple onChange={(e) => setSignFiles([...(e.target.files ?? [])])} />
              {signFiles.length > 1 && <span className="resume-import-msg">{signFiles.length} files selected — they&rsquo;ll be signed and zipped together.</span>}
            </>
          ) : (
            <>
              <TkxInput label="Document" type="file" onChange={(e) => setDoc(e.target.files?.[0] ?? null)} />
              <TkxInput label="Signature (.sig.json)" type="file" accept=".json,application/json" onChange={(e) => setSigFile(e.target.files?.[0] ?? null)} />
            </>
          )}

          {result && (
            <div className={'v2-smart__verify ' + (result.valid ? 'v2-smart__verify--ok' : 'v2-smart__verify--fail')} style={{ borderRadius: 8, padding: 10 }}>
              {result.valid
                ? `✓ Valid — signed by ${result.signer} on ${new Date(result.signedAt).toLocaleString()}.`
                : `✕ Invalid — ${!result.digestMatch ? 'the file has changed since it was signed.' : 'the signature does not match.'}`}
            </div>
          )}
          {msg && <span className="resume-import-msg">{msg}</span>}
        </div>
        <div className="resume-foot">
          {tab === 'sign'
            ? <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy || signFiles.length === 0} onClick={() => void doSign()}>{busy ? 'Signing…' : signFiles.length > 1 ? `Sign ${signFiles.length} files →` : 'Sign & download manifest'}</TkxButton>
            : <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy || !doc || !sigFile} onClick={() => void doVerify()}>{busy ? 'Verifying…' : t('m_sign_verify', lang)}</TkxButton>}
          <TkxButton variant="ghost" size="sm" onClick={onClose}>{t('act_close', lang)}</TkxButton>
        </div>
      </div>
    </div>
  );
}
