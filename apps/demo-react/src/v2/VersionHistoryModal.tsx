/**
 * Version history — save named snapshots of the current document and restore any
 * past version. Generic over content via currentContent()/onRestore, so any
 * editor can wire it in. 100% local (IndexedDB).
 */
import { useEffect, useState } from 'react';
import { TkxButton } from 'tekivex-ui';
import { saveSnapshot, listSnapshots, getSnapshot, deleteSnapshot, type SnapshotMeta } from './persist/snapshots.js';
import { linearize, tips } from './persist/historyGraph.js';
import type { DocContent } from './persist/docStore.js';

export function VersionHistoryModal({
  docId,
  currentContent,
  onRestore,
  onClose,
}: {
  docId: string;
  currentContent: () => DocContent;
  onRestore: (content: DocContent) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<SnapshotMeta[]>([]);
  const [label, setLabel] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  // The version the next save branches from (last saved or restored). null = a new root.
  const [baseId, setBaseId] = useState<string | undefined>(undefined);

  const refresh = () => { void listSnapshots(docId).then((l) => {
    setList(l);
    // Default the base to the newest version so saving continues the current line.
    setBaseId((cur) => cur ?? (l.length ? [...l].sort((a, b) => b.createdAt - a.createdAt)[0]!.id : undefined));
  }); };
  useEffect(refresh, [docId]);

  const save = async () => {
    const meta = await saveSnapshot(docId, label, currentContent(), baseId);
    setBaseId(meta.id); // continue from what we just saved
    setLabel('');
    setMsg(baseId && tips(list).every((t) => t.id !== baseId) ? 'Saved as a new branch.' : 'Saved a version.');
    refresh();
  };
  const restore = async (id: string) => {
    const snap = await getSnapshot(id);
    if (snap) { onRestore(snap.content); setBaseId(id); setMsg('Restored — saving now forks a new branch from here.'); }
  };
  const remove = async (id: string) => { await deleteSnapshot(docId, id); refresh(); };

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner resume-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>🕑 Version history</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <p className="studio-hint">Save a named version before a risky change, and restore any past version later. Stored only on this device.</p>
          <div className="ws-search-bar" style={{ borderRadius: 10 }}>
            <input className="ws-search-input" value={label} placeholder="Name this version (optional)" onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} />
            <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={() => void save()}>Save version</TkxButton>
          </div>

          {list.length === 0
            ? <span className="resume-import-msg">No versions yet.</span>
            : (() => {
                const tipIds = new Set(tips(list).map((t) => t.id));
                return (
                  <ol className="combine-order vh-tree">
                    {linearize(list).map(({ node: s, depth }) => (
                      <li key={s.id} style={{ paddingLeft: depth * 16 }} className={s.id === baseId ? 'vh-current' : ''}>
                        <span className="combine-order-name">
                          {depth > 0 && <span className="vh-branch" aria-hidden>↳ </span>}
                          {s.label}
                          {tipIds.has(s.id) && <span className="vh-tip" title="Latest on this branch"> ⦿</span>}
                          {s.id === baseId && <span className="vh-here" title="Saving continues from here"> · current</span>}
                          <span className="vh-time"> · {new Date(s.createdAt).toLocaleString()}</span>
                        </span>
                        <span className="combine-order-ctl">
                          <button onClick={() => void restore(s.id)} title="Restore this version (then save to branch)" aria-label="Restore">↺</button>
                          <button onClick={() => void remove(s.id)} title="Delete" aria-label="Delete">✕</button>
                        </span>
                      </li>
                    ))}
                  </ol>
                );
              })()}
          {msg && <span className="resume-import-msg">{msg}</span>}
        </div>
        <div className="resume-foot">
          <TkxButton variant="ghost" size="sm" onClick={onClose}>Close</TkxButton>
        </div>
      </div>
    </div>
  );
}
