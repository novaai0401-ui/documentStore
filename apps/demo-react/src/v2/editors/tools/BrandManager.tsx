/**
 * Brand kit manager — keep your logo, colours and fonts together so every design
 * stays on-brand. Deliberately simple: the kit you're editing is auto-saved and
 * is always the active one (no separate Save / Set-active steps), and the logo is
 * a drag-and-drop zone. All local — the logo is a data URL in IndexedDB.
 */
import { useEffect, useRef, useState } from 'react';
import { TkxButton, TkxInput, TkxSelect } from 'tekivex-ui';
import {
  type BrandKit, emptyBrandKit, listBrandKits, saveBrandKit, deleteBrandKit,
  getActiveBrandId, setActiveBrandId,
} from './brandStore.js';

const FONT_OPTIONS = [
  { value: 'Inter, system-ui, sans-serif', label: 'Inter' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: "'Times New Roman', serif", label: 'Times' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'ui-monospace, Menlo, monospace', label: 'Mono' },
];

export function BrandManager({ onClose }: { onClose: () => void }) {
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [edit, setEdit] = useState<BrandKit | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const logoRef = useRef<HTMLInputElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = async () => {
    const list = await listBrandKits();
    setKits(list);
    const activeId = await getActiveBrandId();
    setEdit((cur) => cur ?? list.find((k) => k.id === activeId) ?? list[0] ?? null);
  };
  useEffect(() => { void refresh(); }, []);

  // Every change auto-saves (debounced) AND makes this the active kit, so there's
  // nothing to remember — what you see is what every new design will use.
  const update = (next: BrandKit) => {
    setEdit(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void (async () => { await saveBrandKit(next); await setActiveBrandId(next.id); await refresh(); })();
    }, 400);
  };

  const startNew = () => { const k = emptyBrandKit(`Brand ${kits.length + 1}`); update(k); };
  const switchTo = async (k: BrandKit) => { setEdit(k); await setActiveBrandId(k.id); await refresh(); };
  const remove = async (id: string) => { await deleteBrandKit(id); setEdit(null); await refresh(); };

  const readLogo = (file: File) => {
    if (!edit || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => update({ ...edit, logo: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const setColor = (i: number, c: string) => edit && update({ ...edit, colors: edit.colors.map((x, j) => (j === i ? c : x)) });
  const addColor = () => edit && update({ ...edit, colors: [...edit.colors, '#888888'] });
  const delColor = (i: number) => edit && update({ ...edit, colors: edit.colors.filter((_, j) => j !== i) });

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner brand-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>★ Brand kit</strong><button className="brand-x" onClick={onClose}>✕</button></div>
        <div className="brand-body">
          <aside className="brand-list">
            <p className="studio-hint" style={{ marginTop: 0 }}>Your logo, colours &amp; fonts in one place — every design stays on-brand automatically.</p>
            {kits.map((k) => (
              <button key={k.id} className={'brand-item' + (edit?.id === k.id ? ' brand-item--sel' : '')} onClick={() => void switchTo(k)}>
                <span className="brand-item-dot" style={{ background: k.colors[0] }} />
                <span className="brand-item-name">{k.name}</span>
                {edit?.id === k.id && <span className="brand-item-active">active</span>}
              </button>
            ))}
            <TkxButton variant="outline" size="sm" onClick={startNew}>＋ New brand kit</TkxButton>
          </aside>

          {edit && (
            <div className="brand-edit">
              <TkxInput label="Name" value={edit.name} onChange={(e) => update({ ...edit, name: e.target.value })} />

              <div className="brand-section">Logo</div>
              <div
                className={'brand-drop' + (dragOver ? ' brand-drop--over' : '')}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) readLogo(f); }}
                onClick={() => logoRef.current?.click()}
                role="button"
                tabIndex={0}
                title="Drag a logo here, or click to browse"
              >
                {edit.logo
                  ? <img className="brand-logo" src={edit.logo} alt="logo" />
                  : <span className="brand-drop-hint">⬆ Drag your logo here<br /><small>or click to browse (PNG/SVG/JPG)</small></span>}
              </div>
              {edit.logo && <button className="brand-link" onClick={() => update({ ...edit, logo: undefined })}>Remove logo</button>}
              <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) readLogo(f); }} />

              <div className="brand-section">Colours <small className="brand-section-note">click a swatch to change it</small></div>
              <div className="brand-colors">
                {edit.colors.map((c, i) => (
                  <span key={i} className="brand-color">
                    <input type="color" value={c} onChange={(e) => setColor(i, e.target.value)} />
                    {edit.colors.length > 1 && <button className="brand-color-x" onClick={() => delColor(i)} title="Remove">×</button>}
                  </span>
                ))}
                <button className="brand-color-add" onClick={addColor} title="Add colour">＋</button>
              </div>

              <div className="brand-section">Fonts</div>
              <div className="studio-prop-grid">
                <TkxSelect label="Heading" value={edit.fonts.heading} options={FONT_OPTIONS} onChange={(val) => update({ ...edit, fonts: { ...edit.fonts, heading: val as string } })} />
                <TkxSelect label="Body" value={edit.fonts.body} options={FONT_OPTIONS} onChange={(val) => update({ ...edit, fonts: { ...edit.fonts, body: val as string } })} />
              </div>

              <div className="brand-actions">
                <span className="brand-saved">✓ Saved &amp; active — used by every new design</span>
                <span className="studio-spacer" />
                <TkxButton variant="ghost" size="sm" onClick={() => void remove(edit.id)}>Delete kit</TkxButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
