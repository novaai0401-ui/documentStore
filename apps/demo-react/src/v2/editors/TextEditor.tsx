/**
 * Native editor for text, Markdown, and HTML files. A formatting toolbar inserts
 * Markdown syntax, a live preview renders GitHub-flavored Markdown (our own
 * renderer — correct entity/code handling), and an AI assistant works on the
 * content. Save back to the original format or convert to PDF / Word.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { TkxButton, TkxSelect } from 'tekivex-ui';
import { downloadText, downloadBytes } from '../smart/util.js';
import { textToPdf, markdownToPdf, htmlToPdf } from '../smart/convert.js';
import { htmlToDocx } from './officeWrite.js';
import { renderMarkdown } from './markdown.js';
import { sanitizeHtml } from './sanitize.js';
import { AiAssistant } from './AiAssistant.js';
import { useBrandThemes } from './tools/useBrandThemes.js';
import { BrandButton } from './tools/BrandButton.js';
import { ToolPalette } from './tools/ToolPalette.js';
import type { DocKind, InsertContent } from './tools/insertTools.js';
import { SaveTemplateButton } from './tools/SaveTemplateButton.js';
import { useAutosave } from '../persist/useAutosave.js';
import { VersionHistoryModal } from '../VersionHistoryModal.js';
import { CommentsModal } from '../CommentsModal.js';
import { useCollabText } from '../collab/useCollabText.js';
import { type Room } from '../collab/link.js';
import { useShareLink } from '../collab/useShareLink.js';
import { CollabBar } from '../collab/CollabBar.js';

interface Props {
  name: string;
  ext: string;
  bytes: Uint8Array;
  onOpenInPdf: (bytes: Uint8Array, name: string) => void;
  initialThemeId?: string;
  docId?: string;
  /** When set, the editor joins this live collaboration room on mount. */
  collabRoom?: Room;
}

export function TextEditor({ name, ext, bytes, onOpenInPdf, initialThemeId, docId, collabRoom }: Props) {
  const [text, setText] = useState(() => new TextDecoder().decode(bytes));
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [themeId, setThemeId] = useState(initialThemeId ?? 'clean');
  const { room, isHost, copied, share, copyLink } = useShareLink('text', collabRoom);
  const { themes, resolve, reload } = useBrandThemes();
  const theme = resolve(themeId);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const isMd = ext === 'md' || ext === 'markdown';
  const isHtml = ext === 'html' || ext === 'htm';
  const hasPreview = isMd || isHtml;
  // Markdown is escaped by our renderer; raw HTML files are sanitized before
  // they reach the DOM (defends against scripts in opened/shared HTML).
  const preview = useMemo(() => (isMd ? renderMarkdown(text) : isHtml ? sanitizeHtml(text) : ''), [text, isMd, isHtml]);

  // Insert markdown around the current selection (or at the caret).
  const surround = (before: string, after = before, placeholder = 'text') => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const sel = text.slice(start, end) || placeholder;
    const next = text.slice(0, start) + before + sel + after + text.slice(end);
    setText(next);
    requestAnimationFrame(() => { ta.focus(); ta.selectionStart = start + before.length; ta.selectionEnd = start + before.length + sel.length; });
  };
  const linePrefix = (prefix: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const next = text.slice(0, lineStart) + prefix + text.slice(lineStart);
    setText(next);
    requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + prefix.length; });
  };
  const insertBlock = (block: string) => {
    const ta = taRef.current;
    const at = ta ? ta.selectionStart : text.length;
    const pad = at > 0 && text[at - 1] !== '\n' ? '\n\n' : '';
    setText(text.slice(0, at) + pad + block + text.slice(at));
  };

  // Map a registry snippet onto this surface: Markdown editors take the markdown
  // form, HTML the html form, plain text the text form — each with a fallback so
  // a tool that omits a form still inserts something sensible.
  const paletteKind: DocKind = isMd ? 'markdown' : isHtml ? 'html' : 'text';
  const stripHtml = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const insertContent = (c: InsertContent) => {
    const block = isMd ? (c.markdown ?? c.text ?? stripHtml(c.html ?? ''))
      : isHtml ? (c.html ?? c.markdown ?? c.text ?? '')
      : (c.text ?? c.markdown ?? stripHtml(c.html ?? ''));
    if (block) insertBlock(block);
  };

  useAutosave(docId, () => (docId ? { id: docId, name, ext, kind: 'text', updatedAt: Date.now(), themeId, content: { text } } : null), [text, themeId, name, ext, docId]);

  // Live collaboration: remote edits replace the text while preserving the caret.
  const applyRemote = useCallback((t: string) => {
    const ta = taRef.current;
    const sel = ta ? ta.selectionStart : null;
    setText(t);
    if (ta && sel != null) requestAnimationFrame(() => { const p = Math.min(sel, t.length); ta.selectionStart = ta.selectionEnd = p; });
  }, []);
  const { peers, ready, relayStatus, push, setCursor } = useCollabText({ room, name: 'You', initialText: isHost ? text : '', onRemoteText: applyRemote });
  const onLocalChange = (v: string) => { setText(v); if (room) push(v); };

  const pdfTheme = themeId === 'clean' ? undefined : { bg: theme.bg, fg: theme.fg, heading: theme.heading };
  const toPdf = () => (isMd ? markdownToPdf(text, pdfTheme) : isHtml ? htmlToPdf(text, pdfTheme) : textToPdf(text, pdfTheme));
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const docxHtml = () => (isMd ? renderMarkdown(text) : isHtml ? text : text.split(/\n{2,}/).map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join(''));

  return (
    <div className="ed">
      <div className="ed-bar">
        <span className="ed-kind">{isMd ? 'Markdown' : isHtml ? 'HTML' : 'Text'} · {name}.{ext}</span>
        <div className="ed-actions">
          <ToolPalette kind={paletteKind} onInsert={insertContent} getSelectionText={() => { const ta = taRef.current; return ta ? text.slice(ta.selectionStart, ta.selectionEnd) : ''; }} />
          <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={() => downloadText(`${name}.${ext}`, text, isHtml ? 'text/html' : isMd ? 'text/markdown' : 'text/plain')}>Save .{ext}</TkxButton>
          <TkxButton variant="outline" size="sm" disabled={busy} onClick={() => run(async () => downloadBytes(`${name}.pdf`, await toPdf(), 'application/pdf'))}>Download PDF</TkxButton>
          <TkxButton variant="outline" size="sm" onClick={() => downloadBytes(`${name}.docx`, htmlToDocx(docxHtml()), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')}>Download Word</TkxButton>
          <TkxButton variant="ghost" size="sm" disabled={busy} onClick={() => run(async () => onOpenInPdf(await toPdf(), name))}>Open in PDF editor</TkxButton>
          {!room && <TkxButton variant="outline" size="sm" onClick={() => void share()} title="Create a private link to edit this together in real time">🔗 Share</TkxButton>}
          {docId && <TkxButton variant="ghost" size="sm" onClick={() => setShowHistory(true)} title="Save and restore versions">🕑 History</TkxButton>}
          {docId && <TkxButton variant="ghost" size="sm" onClick={() => setShowComments(true)} title="Comments & review notes">💬 Comments</TkxButton>}
          <SaveTemplateButton defaultName={name} getSeed={() => ({ name, ext, kind: 'text', text, theme: themeId })} />
          <TkxButton variant={ai ? 'solid' : 'outline'} colorScheme="primary" size="sm" onClick={() => setAi((v) => !v)}>✦ AI</TkxButton>
        </div>
      </div>
      {room && <CollabBar room={room} peers={peers} ready={ready} relayStatus={relayStatus} copied={copied} onCopy={() => void copyLink()} />}
      {isMd && (
        <div className="ed-md-toolbar" role="toolbar" aria-label="Formatting">
          <button onClick={() => surround('**')} title="Bold"><b>B</b></button>
          <button onClick={() => surround('*')} title="Italic"><i>I</i></button>
          <button onClick={() => surround('~~')} title="Strikethrough"><s>S</s></button>
          <button onClick={() => surround('`')} title="Inline code">{'</>'}</button>
          <span className="ed-rt-sep" />
          <button onClick={() => linePrefix('# ')} title="Heading 1">H1</button>
          <button onClick={() => linePrefix('## ')} title="Heading 2">H2</button>
          <button onClick={() => linePrefix('### ')} title="Heading 3">H3</button>
          <span className="ed-rt-sep" />
          <button onClick={() => linePrefix('- ')} title="Bullet list">• List</button>
          <button onClick={() => linePrefix('1. ')} title="Numbered list">1.</button>
          <button onClick={() => linePrefix('> ')} title="Quote">❝</button>
          <span className="ed-rt-sep" />
          <button onClick={() => surround('[', '](https://)', 'link')} title="Link">🔗</button>
          <button onClick={() => insertBlock('```\ncode\n```')} title="Code block">{'{ }'}</button>
          <button onClick={() => insertBlock('| Col 1 | Col 2 |\n| --- | --- |\n| a | b |')} title="Table">▦</button>
          <span className="ed-rt-sep" />
          <span className="ed-tool-label">Theme</span>
          <TkxSelect size="sm" value={themeId} options={themes.map((t) => ({ value: t.id, label: t.name }))} onChange={(v) => setThemeId(v as string)} />
          <BrandButton onChange={reload} />
        </div>
      )}
      <div className="ed-body-row">
        <div className={'ed-split' + (hasPreview ? '' : ' ed-split--single')}>
          <textarea ref={taRef} className="ed-textarea" value={text} onChange={(e) => onLocalChange(e.target.value)} onSelect={(e) => { if (room) setCursor((e.target as HTMLTextAreaElement).selectionStart); }} spellCheck={false} />
          {hasPreview && <div className="ed-preview ed-preview--md" dangerouslySetInnerHTML={{ __html: preview }} style={{ background: theme.panel, color: theme.fg, fontFamily: theme.fontBody, ['--rt-heading' as string]: theme.heading }} />}
        </div>
        {ai && (
          <AiAssistant
            kind={isMd ? 'Markdown' : isHtml ? 'HTML' : 'text'}
            getContext={() => text}
            onInsert={(t) => setText((cur) => cur + '\n\n' + t)}
            onClose={() => setAi(false)}
            quickActions={[
              { label: 'Summarize', prompt: 'Summarize this document in a few bullet points.' },
              { label: 'Improve writing', prompt: 'Rewrite this document to be clearer and more polished, keeping the meaning.' },
              { label: 'Continue', prompt: 'Continue writing this document in the same style and topic.' },
              { label: 'Fix grammar', prompt: 'Fix the grammar and spelling and return the corrected version.' },
            ]}
          />
        )}
      </div>
      {showHistory && docId && (
        <VersionHistoryModal docId={docId} currentContent={() => ({ text })} onRestore={(c) => { if (typeof c.text === 'string') setText(c.text); }} onClose={() => setShowHistory(false)} />
      )}
      {showComments && docId && <CommentsModal docId={docId} onClose={() => setShowComments(false)} />}
    </div>
  );
}
