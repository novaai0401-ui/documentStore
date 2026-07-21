/**
 * Magic Resize modal — pick target sizes and get an on-brand variant of the
 * current design for each, exported as a ZIP of PNGs or one multi-page PDF. The
 * source design is never mutated. Everything happens on-device. Logic in
 * magicResize.ts; previews are live SVG (cheap, vector).
 */
import { useMemo, useState } from 'react';
import { TkxButton } from 'tekivex-ui';
import { FORMATS, designToSvg, type Design, type Format } from './model.js';
import { buildVariants, defaultSelection, isCurrentFormat, variantStem } from './magicResize.js';
import { designToPng, designsToPdf } from './exportDesign.js';
import { zipStore } from '../smart/zip.js';
import { downloadBytes } from '../smart/util.js';

const svgDataUri = (d: Design): string => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(designToSvg(d));
const GROUPS = ['Social', 'Print', 'Presentation'];

export function MagicResizeModal({ design, name, fontCss, onClose }: { design: Design; name: string; fontCss?: string; onClose: () => void }) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(defaultSelection(design)));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const variants = useMemo(() => buildVariants(design, [...picked]), [design, picked]);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const exportZip = async () => {
    setBusy(true); setErr(null);
    try {
      const entries: { name: string; data: Uint8Array }[] = [];
      let i = 0;
      for (const v of variants) {
        setProgress(`Rendering ${++i} of ${variants.length}…`);
        entries.push({ name: `${variantStem(name, v.format)}.png`, data: await designToPng(v.design, 2, fontCss) });
      }
      downloadBytes(`${(name || 'design')}-sizes.zip`, zipStore(entries), 'application/zip');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Export failed.'); }
    finally { setBusy(false); setProgress(null); }
  };

  const exportPdf = async () => {
    setBusy(true); setErr(null);
    try {
      setProgress('Building PDF…');
      downloadBytes(`${(name || 'design')}-sizes.pdf`, await designsToPdf(variants.map((v) => v.design), fontCss), 'application/pdf');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Export failed.'); }
    finally { setBusy(false); setProgress(null); }
  };

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner cmp-modal vid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>⤢ Resize to any size</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">Resize this design into every size you need at once — composition is kept and your design stays untouched. Pick the sizes, then download them all. Nothing leaves your device.</p>

          {GROUPS.map((g) => (
            <div key={g} className="mr-group">
              <div className="mr-group-label">{g}</div>
              <div className="mr-grid">
                {FORMATS.filter((f) => f.group === g).map((f) => {
                  const current = isCurrentFormat(design, f);
                  const on = picked.has(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      className={'mr-card' + (on ? ' mr-card--on' : '') + (current ? ' mr-card--current' : '')}
                      disabled={current}
                      onClick={() => !current && toggle(f.id)}
                      title={current ? 'This is the current size' : `${f.w}×${f.h}`}
                    >
                      <span className="mr-thumb" style={{ aspectRatio: `${f.w} / ${f.h}` }}>
                        <img src={svgDataUri(current ? design : preview(design, f))} alt="" />
                      </span>
                      <span className="mr-name">{f.name}</span>
                      <span className="mr-dim">{current ? 'current' : `${f.w}×${f.h}`}</span>
                      {on && !current && <span className="mr-check">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {err && <span className="cmp-row-note cmp-row-note--warn">{err}</span>}
          {progress && <div className="cmp-total">{progress}</div>}
        </div>
        <div className="resume-foot">
          <span className="mr-count">{variants.length} size{variants.length === 1 ? '' : 's'} selected</span>
          <span className="studio-spacer" />
          <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={busy || !variants.length} onClick={() => void exportZip()}>{busy ? 'Working…' : '⤓ Download all (ZIP)'}</TkxButton>
          <TkxButton variant="outline" size="sm" disabled={busy || !variants.length} onClick={() => void exportPdf()}>As one PDF</TkxButton>
          <TkxButton variant="ghost" size="sm" onClick={onClose}>Close</TkxButton>
        </div>
      </div>
    </div>
  );
}

// Memo-light helper: build the resized design for a single preview card.
function preview(d: Design, f: Format): Design {
  return buildVariants(d, [f.id])[0]?.design ?? d;
}
