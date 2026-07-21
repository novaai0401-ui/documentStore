/**
 * Combine designs into one PDF — the "projects" primitive. Pick two or more saved
 * designs (e.g. a résumé and a cover letter), order them, and download a single
 * multi-page PDF via designsToPdf(). Everything is loaded from the local library
 * and rendered in the browser; nothing is uploaded.
 */
import { useEffect, useState } from 'react';
import { TkxButton } from 'tekivex-ui';
import { t, useLang } from '../../i18n.js';
import { listRecent, loadDoc, type DocMeta } from '../persist/docStore.js';
import { exportDesignsPdf } from './exportDesign.js';
import type { Design } from './model.js';

/** Move item at `i` by `dir` (−1 up / +1 down); returns a new array. */
export function moveItem<T>(arr: T[], i: number, dir: number): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

export function CombineModal({ onClose }: { onClose: () => void }) {
  const lang = useLang();
  const [designs, setDesigns] = useState<DocMeta[]>([]);
  const [order, setOrder] = useState<string[]>([]); // selected ids, in page order
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { void listRecent(50).then((m) => setDesigns(m.filter((d) => d.kind === 'design'))); }, []);

  const toggle = (id: string) => setOrder((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  const byId = (id: string) => designs.find((d) => d.id === id);

  const download = async () => {
    setBusy(true); setMsg(null);
    try {
      const out: Design[] = [];
      for (const id of order) {
        const rec = await loadDoc(id);
        if (rec?.content.design) out.push(rec.content.design);
      }
      if (out.length === 0) { setMsg('Could not load the selected designs.'); return; }
      await exportDesignsPdf(out, 'combined');
      setMsg(`Combined ${out.length} designs into one PDF.`);
    } catch (err) { setMsg(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner resume-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>🗎 {t('m_combine_title', lang)}</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">Pick the designs to include (e.g. a résumé and a cover letter) and set their order. They&rsquo;re combined into a single multi-page PDF, all in your browser.</p>

          {designs.length === 0 && <span className="resume-import-msg">No saved designs yet — create some from the Design Studio first.</span>}

          {order.length > 0 && (
            <div className="ai-field">
              <span className="brand-section">Page order</span>
              <ol className="combine-order">
                {order.map((id, i) => (
                  <li key={id}>
                    <span className="combine-order-name">{byId(id)?.name ?? id}</span>
                    <span className="combine-order-ctl">
                      <button onClick={() => setOrder((o) => moveItem(o, i, -1))} disabled={i === 0} aria-label="Move up">↑</button>
                      <button onClick={() => setOrder((o) => moveItem(o, i, 1))} disabled={i === order.length - 1} aria-label="Move down">↓</button>
                      <button onClick={() => toggle(id)} aria-label="Remove">✕</button>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="ai-field">
            <span className="brand-section">Your designs</span>
            <div className="combine-list">
              {designs.map((d) => (
                <label key={d.id} className={'combine-row' + (order.includes(d.id) ? ' is-on' : '')}>
                  <input type="checkbox" checked={order.includes(d.id)} onChange={() => toggle(d.id)} />
                  <span className="combine-row-name">{d.name}</span>
                </label>
              ))}
            </div>
          </div>
          {msg && <span className="resume-import-msg">{msg}</span>}
        </div>
        <div className="resume-foot">
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy || order.length < 1} onClick={() => void download()}>{busy ? 'Building…' : `${t('act_download', lang)} PDF (${order.length})`}</TkxButton>
          <TkxButton variant="ghost" size="sm" onClick={onClose}>{t('act_close', lang)}</TkxButton>
        </div>
      </div>
    </div>
  );
}
