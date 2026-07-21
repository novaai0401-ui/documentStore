/**
 * Mail-merge UI — turn one design into many personalized copies from a CSV, then
 * download them as a single multi-page PDF. Add {{field}} tokens to text in the
 * design, paste/upload a CSV whose headers match, and generate. 100% local.
 */
import { useMemo, useState } from 'react';
import { TkxButton } from 'tekivex-ui';
import type { Design } from './model.js';
import { parseCsv, designFields, mergeDesigns } from './mailMerge.js';
import { exportDesignsPdf } from './exportDesign.js';

export function MailMergeModal({ design, name, onClose }: { design: Design; name: string; onClose: () => void }) {
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const fields = useMemo(() => designFields(design), [design]);
  const data = useMemo(() => parseCsv(csv), [csv]);
  const missing = fields.filter((f) => !data.headers.includes(f));

  const generate = async () => {
    if (fields.length === 0) { setMsg('This design has no {{placeholders}} — add text like Dear {{name}} to a text box first, or the pages will be blank.'); return; }
    if (!data.rows.length) { setMsg('Add at least one CSV row of data.'); return; }
    setBusy(true); setMsg(null);
    try {
      await exportDesignsPdf(mergeDesigns(design, data), `${name || 'mail-merge'}-merged`);
      setMsg(`Generated ${data.rows.length} personalized page${data.rows.length === 1 ? '' : 's'}.`);
    } catch (err) { setMsg(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner resume-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>📨 Mail merge</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">
            Put <code>{'{{field}}'}</code> tokens in the design&rsquo;s text, then paste a CSV whose header row
            names those fields. Each row becomes one personalized page in a single PDF — all in your browser.
          </p>

          <div className="ai-field">
            <span className="brand-section">Placeholders in this design</span>
            {fields.length === 0
              ? <span className="resume-import-msg">None yet — add text like <code>Dear {'{{name}}'}</code> to a text box first.</span>
              : <div className="resume-styles">{fields.map((f) => <span key={f} className={'mm-chip' + (data.headers.includes(f) ? ' mm-chip--ok' : ' mm-chip--miss')}>{`{{${f}}}`}</span>)}</div>}
          </div>

          <label className="ai-field">
            CSV data (first row = headers)
            <textarea rows={7} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'name,email\nAda Lovelace,ada@example.com\nGrace Hopper,grace@example.com'} />
          </label>
          <div className="resume-section-row">
            <label className="imgstudio-link" style={{ cursor: 'pointer' }}>
              ⤒ Upload .csv
              <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setCsv(await f.text()); }} />
            </label>
            <span className="resume-import-msg">{data.rows.length > 0 ? `${data.rows.length} record${data.rows.length === 1 ? '' : 's'} · ${data.headers.length} column${data.headers.length === 1 ? '' : 's'}` : ''}</span>
          </div>
          {missing.length > 0 && data.headers.length > 0 && (
            <span className="resume-import-msg" style={{ color: '#b45309' }}>CSV is missing column{missing.length === 1 ? '' : 's'}: {missing.join(', ')} (those tokens will be blank).</span>
          )}
          {msg && <span className="resume-import-msg">{msg}</span>}
        </div>
        <div className="resume-foot">
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy || data.rows.length === 0 || fields.length === 0} title={fields.length === 0 ? 'Add {{field}} tokens to the design first' : undefined} onClick={() => void generate()}>{busy ? 'Generating…' : `Generate ${data.rows.length || ''} PDF${data.rows.length === 1 ? '' : 's'} →`}</TkxButton>
          <TkxButton variant="ghost" size="sm" onClick={onClose}>Close</TkxButton>
        </div>
      </div>
    </div>
  );
}
