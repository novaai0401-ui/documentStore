/**
 * PDF Form builder — click on a PDF page to drop fillable fields (text or
 * checkbox), name them, then save a PDF with real AcroForm widgets anyone can
 * fill. 100% in the browser: pages preview via pdfToImages, fields baked with
 * pdf-lib (pdfForm.ts).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { TkxButton, TkxInput, TkxSelect } from 'tekivex-ui';
import { t, useLang } from '../../i18n.js';
import { buildFormPdf, type FieldDef, type FieldType } from './pdfForm.js';
import { downloadBytes } from '../smart/util.js';

let uid = 0;
const DEFAULTS: Record<FieldType, { w: number; h: number }> = { text: { w: 0.26, h: 0.035 }, checkbox: { w: 0.03, h: 0.022 } };

export function PdfFormModal({ file, onClose, onOpenInPdf }: { file: File; onClose: () => void; onOpenInPdf?: (bytes: Uint8Array, name: string) => void }) {
  const lang = useLang();
  const [pages, setPages] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [type, setType] = useState<FieldType>('text');
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bytesRef = useRef<Uint8Array | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    const urls: string[] = [];
    (async () => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        bytesRef.current = bytes;
        const { pdfToImages } = await import('../smart/convert.js');
        const imgs = await pdfToImages(bytes, { dpi: 110, format: 'png' });
        if (!alive) return;
        // Object URLs, NOT base64: btoa(String.fromCharCode(...bytes)) spreads a
        // whole page PNG as call arguments and overflows the stack ("Maximum call
        // stack size exceeded") for any non-trivial page.
        const next = imgs.map((p) => URL.createObjectURL(new Blob([p.bytes as BlobPart], { type: 'image/png' })));
        urls.push(...next);
        setPages(next);
      } catch (e) { if (alive) setErr(e instanceof Error ? e.message : 'Could not open the PDF.'); }
    })();
    return () => { alive = false; for (const u of urls) URL.revokeObjectURL(u); };
  }, [file]);

  const place = useCallback((e: React.MouseEvent) => {
    const stage = stageRef.current; if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const d = DEFAULTS[type];
    const id = `f${uid++}`;
    setFields((cur) => [...cur, { id, page: idx, type, name: type === 'checkbox' ? `Check ${cur.length + 1}` : `Field ${cur.length + 1}`, x: Math.min(x, 1 - d.w), y: Math.min(y, 1 - d.h), w: d.w, h: d.h }]);
    setSel(id);
  }, [type, idx]);

  const pageFields = fields.filter((f) => f.page === idx);
  const selField = fields.find((f) => f.id === sel) ?? null;
  const rename = (name: string) => setFields((cur) => cur.map((f) => (f.id === sel ? { ...f, name } : f)));
  const remove = (id: string) => { setFields((cur) => cur.filter((f) => f.id !== id)); if (sel === id) setSel(null); };

  const build = useCallback(async (): Promise<Uint8Array | null> => {
    if (!bytesRef.current || !fields.length) return null;
    return buildFormPdf(bytesRef.current, fields);
  }, [fields]);

  const save = useCallback(async () => {
    setBusy(true);
    try { const out = await build(); if (out) downloadBytes(`${file.name.replace(/\.pdf$/i, '')}-form.pdf`, out, 'application/pdf'); }
    finally { setBusy(false); }
  }, [build, file.name]);

  const editInPdf = useCallback(async () => {
    setBusy(true);
    try { const out = await build(); if (out && onOpenInPdf) { onClose(); onOpenInPdf(out, `${file.name.replace(/\.pdf$/i, '')}-form`); } }
    finally { setBusy(false); }
  }, [build, onOpenInPdf, onClose, file.name]);

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner cmp-modal vid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>📝 {t('m_pdfform_title', lang)}</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">{t('pf_desc', lang)}</p>

          <div className="cmp-controls">
            <TkxSelect className="cmp-ctrl" label={t('pf_field_type', lang)} size="sm" value={type} options={[{ value: 'text', label: t('pf_text_field', lang) }, { value: 'checkbox', label: t('pf_checkbox', lang) }]} onChange={(v) => setType(v as FieldType)} />
            {pages.length > 1 && (
              <span className="cmp-ctrl" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <button className="cmp-row-dl" disabled={idx === 0} onClick={() => setIdx((i) => Math.max(0, i - 1))}>←</button>
                <span className="cmp-row-note">Page {idx + 1} / {pages.length}</span>
                <button className="cmp-row-dl" disabled={idx === pages.length - 1} onClick={() => setIdx((i) => Math.min(pages.length - 1, i + 1))}>→</button>
              </span>
            )}
            <span className="cmp-row-note">{fields.length} {t('pf_fields_placed', lang)}</span>
          </div>

          {selField && (
            <TkxInput className="ai-field" label={t('pf_field_name', lang)} value={selField.name} onChange={(e) => rename(e.target.value)} autoFocus />
          )}

          {err && <span className="cmp-row-note cmp-row-note--warn">{err}</span>}

          <div className="pf-stage-wrap">
            {pages[idx] ? (
              <div className="pf-stage" ref={stageRef} onClick={place}>
                <img className="pf-page" src={pages[idx]} alt={`Page ${idx + 1}`} draggable={false} />
                {pageFields.map((f) => (
                  <div
                    key={f.id}
                    className={'pf-field pf-field--' + f.type + (sel === f.id ? ' pf-field--sel' : '')}
                    style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}
                    onClick={(e) => { e.stopPropagation(); setSel(f.id); }}
                    title={f.name}
                  >
                    <span className="pf-field-label">{f.type === 'checkbox' ? '☐' : f.name}</span>
                    <button className="pf-field-x" onClick={(e) => { e.stopPropagation(); remove(f.id); }} aria-label="Remove field">✕</button>
                  </div>
                ))}
              </div>
            ) : <div className="cmp-row-note" style={{ padding: 24 }}>{t('pf_rendering', lang)}</div>}
          </div>
        </div>
        <div className="resume-foot">
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy || fields.length === 0} onClick={() => void save()}>{busy ? '…' : `⤓ ${t('pf_save', lang)}`}</TkxButton>
          {onOpenInPdf && <TkxButton variant="outline" size="sm" disabled={busy || fields.length === 0} onClick={() => void editInPdf()}>{t('pf_open_editor', lang)}</TkxButton>}
          <TkxButton variant="ghost" size="sm" onClick={onClose}>{t('act_close', lang)}</TkxButton>
        </div>
      </div>
    </div>
  );
}
