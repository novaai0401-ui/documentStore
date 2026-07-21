/**
 * Comments — local, async review notes on a document. Add notes, mark them
 * resolved, reopen or delete. Generic over docId so any editor can adopt it.
 * 100% local (IndexedDB); complements the live CRDT co-editing.
 */
import { useEffect, useState } from 'react';
import { TkxButton, TkxInput, TkxCheckbox } from 'tekivex-ui';
import { addComment, listComments, setResolved, deleteComment, type Comment } from './persist/comments.js';

const AUTHOR_KEY = 'pyntra.commentAuthor';
const loadAuthor = (): string => { try { return localStorage.getItem(AUTHOR_KEY) ?? ''; } catch { return ''; } };

export function CommentsModal({ docId, onClose }: { docId: string; onClose: () => void }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [author, setAuthor] = useState(loadAuthor);
  const [text, setText] = useState('');
  const [showResolved, setShowResolved] = useState(false);

  const refresh = () => { void listComments(docId).then(setComments); };
  useEffect(refresh, [docId]);

  const add = async () => {
    if (!text.trim()) return;
    try { localStorage.setItem(AUTHOR_KEY, author); } catch { /* ignore */ }
    await addComment(docId, author, text);
    setText('');
    refresh();
  };
  const toggle = async (c: Comment) => { await setResolved(docId, c.id, !c.resolved); refresh(); };
  const remove = async (c: Comment) => { await deleteComment(docId, c.id); refresh(); };

  const shown = comments.filter((c) => showResolved || !c.resolved);
  const open = comments.filter((c) => !c.resolved).length;

  return (
    <div className="v2-modal" onClick={onClose}>
      <div className="v2-modal__inner resume-modal" onClick={(e) => e.stopPropagation()}>
        <div className="brand-head"><strong>💬 Comments{open ? ` · ${open} open` : ''}</strong><button className="brand-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="resume-body">
          <div className="cm-add">
            <TkxInput label="Your name" className="cm-author" value={author} placeholder="Your name" onChange={(e) => setAuthor(e.target.value)} />
            <textarea className="cm-text" rows={2} value={text} placeholder="Add a comment…" onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void add(); }} />
            <TkxButton variant="solid" colorScheme="primary" size="sm" disabled={!text.trim()} onClick={() => void add()}>Comment</TkxButton>
          </div>

          <div className="resume-section-row">
            <span className="brand-section">{shown.length} {showResolved ? 'total' : 'open'}</span>
            <TkxCheckbox label="Show resolved" className="cm-toggle" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          </div>

          {shown.length === 0
            ? <span className="resume-import-msg">No {showResolved ? '' : 'open '}comments yet.</span>
            : (
              <ul className="cm-list">
                {shown.map((c) => (
                  <li key={c.id} className={'cm-item' + (c.resolved ? ' cm-item--resolved' : '')}>
                    <div className="cm-meta"><strong>{c.author}</strong><span>{new Date(c.createdAt).toLocaleString()}</span></div>
                    <div className="cm-body">{c.text}</div>
                    <div className="cm-actions">
                      <button onClick={() => void toggle(c)}>{c.resolved ? 'Reopen' : 'Resolve'}</button>
                      <button onClick={() => void remove(c)}>Delete</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </div>
        <div className="resume-foot">
          <TkxButton variant="ghost" size="sm" onClick={onClose}>Close</TkxButton>
        </div>
      </div>
    </div>
  );
}
