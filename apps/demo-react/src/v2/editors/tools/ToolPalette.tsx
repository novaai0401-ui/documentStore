/**
 * Insert palette — a single dropdown that renders the content-tools directory
 * (insertTools.ts) for a given document kind, grouped, plus the user's own
 * saved snippets (customTools.ts) and an inline form to create new ones. Every
 * editor reuses this component; what shows up is driven entirely by the
 * registry, so a new tool needs no per-editor code. The host passes an
 * `onInsert` that places a chosen snippet into its own surface, and may pass
 * `getSelectionText` to prefill the new-snippet form from the current selection.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { TkxInput } from 'tekivex-ui';
import { groupedToolsForKind, type DocKind, type InsertContent, type InsertTool } from './insertTools.js';
import { customToolsForKind, addCustomSnippet, deleteCustomSnippet, customIdOf, exportSnippetsJson, importSnippetsJson, loadCustomSnippets } from './customTools.js';

interface Props {
  kind: DocKind;
  onInsert: (content: InsertContent) => void;
  label?: string;
  getSelectionText?: () => string;
}

export function ToolPalette({ kind, onInsert, label = '＋ Insert', getSelectionText }: Props) {
  const [open, setOpen] = useState(false);
  const [ver, setVer] = useState(0); // bumps to re-read custom snippets
  const [creating, setCreating] = useState(false);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [notice, setNotice] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);
  const groups = groupedToolsForKind(kind);
  // Re-read saved snippets when opened or after a `ver` bump (add/delete).
  const custom = useMemo(() => (open ? customToolsForKind(kind) : []), [open, kind, ver]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setCreating(false); setOpen(false); } };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const pick = (t: InsertTool) => { onInsert(t.content); setOpen(false); };
  const startCreate = () => {
    const sel = getSelectionText?.().trim() ?? '';
    setDraftBody(sel);
    setDraftLabel('');
    setCreating(true);
  };
  const saveDraft = () => {
    if (!draftBody.trim()) { setCreating(false); return; }
    addCustomSnippet(draftLabel, draftBody);
    setCreating(false);
    setDraftBody('');
    setDraftLabel('');
    setVer((v) => v + 1);
  };
  const removeCustom = (toolId: string) => {
    const id = customIdOf(toolId);
    if (id) { deleteCustomSnippet(id); setVer((v) => v + 1); }
  };
  const fileRef = useRef<HTMLInputElement | null>(null);
  const exportLib = () => {
    const blob = new Blob([exportSnippetsJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pyntra-snippets.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importLib = (file: File) => {
    file.text().then((txt) => {
      try { const n = importSnippetsJson(txt, 'merge'); setVer((v) => v + 1); setNotice(`Imported ${n} snippet${n === 1 ? '' : 's'}.`); }
      catch (e) { setNotice(e instanceof Error ? e.message : 'Import failed'); }
    });
  };

  if (!groups.length && kind !== 'pdf') return null;

  return (
    <div className="ed-palette" ref={ref}>
      <button type="button" className={'ed-palette-btn' + (open ? ' ed-palette-btn--open' : '')} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        {label} ▾
      </button>
      {open && (
        <div className="ed-palette-menu" role="menu">
          {groups.map((g) => (
            <div key={g.group} className="ed-palette-group">
              <div className="ed-palette-group-label">{g.label}</div>
              {g.tools.map((t) => (
                <button key={t.id} type="button" role="menuitem" className="ed-palette-item" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(t)}>
                  <span className="ed-palette-item-icon">{t.icon}</span>
                  <span className="ed-palette-item-label">{t.label}</span>
                </button>
              ))}
            </div>
          ))}

          <div className="ed-palette-group">
            <div className="ed-palette-group-label">My snippets</div>
            {custom.map((t) => (
              <div key={t.id} className="ed-palette-item ed-palette-item--custom">
                <button type="button" className="ed-palette-item-main" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(t)}>
                  <span className="ed-palette-item-icon">{t.icon}</span>
                  <span className="ed-palette-item-label">{t.label}</span>
                </button>
                <button type="button" className="ed-palette-item-del" title="Delete snippet" onMouseDown={(e) => e.preventDefault()} onClick={() => removeCustom(t.id)}>✕</button>
              </div>
            ))}
            {!custom.length && !creating && <div className="ed-palette-empty">No saved snippets yet.</div>}

            {creating ? (
              <div className="ed-palette-form" onMouseDown={(e) => e.stopPropagation()}>
                <TkxInput label="Snippet name" className="ed-palette-input" placeholder="Snippet name" value={draftLabel} onChange={(e) => setDraftLabel(e.target.value)} autoFocus />
                <textarea className="ed-palette-textarea" placeholder="Snippet content…" rows={4} value={draftBody} onChange={(e) => setDraftBody(e.target.value)} />
                <div className="ed-palette-form-actions">
                  <button type="button" className="ed-palette-save" onClick={saveDraft} disabled={!draftBody.trim()}>Save</button>
                  <button type="button" className="ed-palette-cancel" onClick={() => setCreating(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" className="ed-palette-new" onMouseDown={(e) => e.preventDefault()} onClick={startCreate}>＋ New snippet…</button>
            )}
            {notice && <div className="ed-palette-notice">{notice}</div>}
            <div className="ed-palette-libactions" onMouseDown={(e) => e.preventDefault()}>
              <button type="button" className="ed-palette-link" onClick={exportLib} disabled={!loadCustomSnippets().length} title="Download all snippets as JSON">⤓ Export</button>
              <button type="button" className="ed-palette-link" onClick={() => fileRef.current?.click()} title="Import snippets from a JSON file">⤒ Import</button>
              <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importLib(f); }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
