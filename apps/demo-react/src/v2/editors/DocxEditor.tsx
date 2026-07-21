/**
 * Native Word editor — our own rich-text surface with a full, extensible tool
 * palette and correct per-tool active states (the third-party editor lit every
 * tool at once). Bold/italic/underline/strike, headings, lists, quote, align,
 * colour, highlight, font size, link, clear formatting, undo/redo. Seeded from
 * our DOCX/ODT parser; saves to .docx via our HTML→OOXML writer or to PDF.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { TkxButton, TkxSelect } from 'tekivex-ui';
import { downloadBytes } from '../smart/util.js';
import { docxToPdf } from '../smart/convert.js';
import { htmlToDocx, type PageSetup } from './officeWrite.js';
import { sanitizeHtml } from './sanitize.js';
import { AiAssistant } from './AiAssistant.js';
import { useBrandThemes } from './tools/useBrandThemes.js';
import { BrandButton } from './tools/BrandButton.js';
import { ToolPalette } from './tools/ToolPalette.js';
import type { InsertContent } from './tools/insertTools.js';
import { SaveTemplateButton } from './tools/SaveTemplateButton.js';
import { useAutosave } from '../persist/useAutosave.js';
import { useCollabMap } from '../collab/useCollabMap.js';
import { useShareLink } from '../collab/useShareLink.js';
import { CollabBar } from '../collab/CollabBar.js';
import type { Room } from '../collab/link.js';

interface Props {
  name: string;
  initialHtml: string;
  onOpenInPdf: (bytes: Uint8Array, name: string) => void;
  initialThemeId?: string;
  docId?: string;
  /** When set, the editor joins this live collaboration room on mount. */
  collabRoom?: Room;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const exec = (cmd: string, val?: string) => document.execCommand(cmd, false, val);

/** Caret position as an absolute character offset into the editor's text, so it
 *  survives a full innerHTML replacement when a remote edit arrives. */
function caretOffset(root: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.endContainer)) return null;
  const pre = range.cloneRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}
function restoreCaret(root: HTMLElement, offset: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  let remaining = offset;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const len = node.textContent?.length ?? 0;
    if (remaining <= len) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      sel.removeAllRanges(); sel.addRange(range);
      return;
    }
    remaining -= len;
  }
}

interface Active { bold: boolean; italic: boolean; underline: boolean; strike: boolean; ul: boolean; ol: boolean; block: string; align: string }

/** The table cell containing the caret, if it's inside this editor. */
function currentCell(root: HTMLElement | null): HTMLTableCellElement | null {
  const node = document.getSelection()?.anchorNode ?? null;
  const el = node instanceof HTMLElement ? node : node?.parentElement ?? null;
  const cell = (el?.closest('td,th') ?? null) as HTMLTableCellElement | null;
  return cell && root?.contains(cell) ? cell : null;
}

function newCell(): HTMLTableCellElement { const td = document.createElement('td'); td.innerHTML = '<br>'; return td; }

export function DocxEditor({ name, initialHtml, onOpenInPdf, initialThemeId, docId, collabRoom }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState(false);
  const [themeId, setThemeId] = useState(initialThemeId ?? 'clean');
  const [fgColor, setFgColor] = useState('#111827');
  const [hlColor, setHlColor] = useState('#fde047');
  const [fontSize, setFontSize] = useState('3');
  const [fontName, setFontName] = useState('');
  const [rev, setRev] = useState(0); // bumps on edit to drive autosave
  const { themes, resolve, reload } = useBrandThemes();
  const theme = resolve(themeId);
  const { room, isHost, copied, share, copyLink } = useShareLink('word', collabRoom);
  const [act, setAct] = useState<Active>({ bold: false, italic: false, underline: false, strike: false, ul: false, ol: false, block: '', align: 'left' });
  const [inTable, setInTable] = useState(false);
  const [page, setPage] = useState<PageSetup>({ size: 'letter', orientation: 'portrait', margin: 'normal', columns: 1 });

  useEffect(() => { if (ref.current) ref.current.innerHTML = initialHtml || '<p><br></p>'; }, [initialHtml]);

  const refresh = useCallback(() => {
    if (!ref.current || !ref.current.contains(document.getSelection()?.anchorNode ?? null)) return;
    const align = document.queryCommandState('justifyCenter') ? 'center' : document.queryCommandState('justifyRight') ? 'right' : document.queryCommandState('justifyFull') ? 'justify' : 'left';
    setAct({
      bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'), strike: document.queryCommandState('strikeThrough'),
      ul: document.queryCommandState('insertUnorderedList'), ol: document.queryCommandState('insertOrderedList'),
      block: (document.queryCommandValue('formatBlock') || '').toLowerCase(), align,
    });
    setInTable(!!currentCell(ref.current));
  }, []);
  useEffect(() => { document.addEventListener('selectionchange', refresh); return () => document.removeEventListener('selectionchange', refresh); }, [refresh]);

  const cmd = (c: string, v?: string) => { ref.current?.focus(); exec(c, v); refresh(); };

  // Insert an uploaded image at the caret (selection saved before the file dialog
  // stole focus). Stored inline as a data URL — fully local, travels in the .docx.
  const savedRange = useRef<Range | null>(null);
  const saveSelection = () => { const s = document.getSelection(); savedRange.current = s && s.rangeCount && ref.current?.contains(s.anchorNode) ? s.getRangeAt(0).cloneRange() : null; };
  const insertImage = (dataUrl: string) => {
    ref.current?.focus();
    const s = document.getSelection();
    if (savedRange.current && s) { s.removeAllRanges(); s.addRange(savedRange.current); }
    exec('insertHTML', `<img src="${dataUrl}" alt="" style="max-width:100%;height:auto;border-radius:4px" />`);
    setRev((r) => r + 1); pushHtml(); refresh();
  };
  const block = (tag: string) => cmd('formatBlock', act.block === tag.toLowerCase() ? 'P' : tag);

  // ── Table editing (operates on the cell containing the caret) ──────────────
  const tableEdit = (fn: (cell: HTMLTableCellElement) => void) => {
    const cell = currentCell(ref.current);
    if (!cell) return;
    fn(cell);
    ref.current?.focus();
    setRev((r) => r + 1); pushHtml(); refresh();
  };
  const addRow = (below: boolean) => tableEdit((cell) => {
    const tr = cell.closest('tr');
    if (!tr) return;
    const nr = document.createElement('tr');
    for (let i = 0; i < tr.children.length; i++) nr.appendChild(newCell());
    tr.parentElement?.insertBefore(nr, below ? tr.nextSibling : tr);
  });
  const addCol = (right: boolean) => tableEdit((cell) => {
    const table = cell.closest('table');
    const idx = Array.from(cell.parentElement?.children ?? []).indexOf(cell);
    if (!table || idx < 0) return;
    for (const tr of Array.from(table.rows)) {
      const at = tr.children[idx] ?? null;
      tr.insertBefore(newCell(), right ? (at?.nextSibling ?? null) : at);
    }
  });
  const delRow = () => tableEdit((cell) => { const tr = cell.closest('tr'); const t = cell.closest('table'); if (tr && t && t.rows.length > 1) tr.remove(); });
  const delCol = () => tableEdit((cell) => {
    const table = cell.closest('table');
    const idx = Array.from(cell.parentElement?.children ?? []).indexOf(cell);
    if (!table || idx < 0 || (table.rows[0]?.children.length ?? 0) <= 1) return;
    for (const tr of Array.from(table.rows)) tr.children[idx]?.remove();
  });
  const delTable = () => tableEdit((cell) => cell.closest('table')?.remove());

  const html = () => ref.current?.innerHTML ?? initialHtml;
  const docxBytes = () => htmlToDocx(html(), page);
  // A non-default theme styles the exported PDF (background, body, headings).
  const pdfTheme = themeId === 'clean' ? undefined : { bg: theme.bg, fg: theme.fg, heading: theme.heading };

  // Live collaboration: the whole document is one last-writer-wins key ('html').
  // A remote edit replaces the surface; we save/restore the caret by text offset
  // so the local typist isn't thrown to the top of the page.
  const applyRemoteHtml = useCallback((next: string) => {
    const el = ref.current;
    if (!el || el.innerHTML === next) return;
    const focused = document.activeElement === el;
    const off = focused ? caretOffset(el) : null;
    el.innerHTML = next || '<p><br></p>';
    if (focused && off != null) restoreCaret(el, off);
    setRev((r) => r + 1);
  }, []);
  const collab = useCollabMap({
    room, name: 'You', isHost,
    seed: () => ({ html: html() }),
    onRemote: (e) => { if (e.html != null) applyRemoteHtml(e.html); },
  });
  const pushHtml = () => { if (room) collab.set({ html: html() }); };

  useAutosave(docId, () => (docId ? { id: docId, name, ext: 'docx', kind: 'word', updatedAt: Date.now(), themeId, content: { html: html() } } : null), [rev, themeId, name, docId]);
  const insert = (t: string) => { if (ref.current) ref.current.innerHTML += t.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join(''); };
  // Registry snippets land as HTML at the caret (falling back to escaped text).
  const insertContent = (c: InsertContent) => {
    const h = c.html ?? (c.text ?? c.markdown ?? '').split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
    if (h) cmd('insertHTML', h);
  };
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

  const Btn = ({ on, t, title, children }: { on?: boolean; t: () => void; title: string; children: ReactNode }) => (
    <button className={on ? 'rt-on' : ''} title={title} onMouseDown={(e) => { e.preventDefault(); t(); }}>{children}</button>
  );

  return (
    <div className="ed">
      <div className="ed-bar">
        <span className="ed-kind">Word · {name}.docx</span>
        <div className="ed-actions">
          <ToolPalette kind="word" onInsert={insertContent} getSelectionText={() => document.getSelection()?.toString() ?? ''} />
          <TkxButton variant="solid" colorScheme="primary" size="sm" onClick={() => downloadBytes(`${name}.docx`, docxBytes(), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')}>Save Word</TkxButton>
          <TkxButton variant="outline" size="sm" disabled={busy} onClick={() => run(async () => downloadBytes(`${name}.pdf`, await docxToPdf(docxBytes(), undefined, pdfTheme), 'application/pdf'))}>Download PDF</TkxButton>
          <TkxButton variant="ghost" size="sm" disabled={busy} onClick={() => run(async () => onOpenInPdf(await docxToPdf(docxBytes(), undefined, pdfTheme), name))}>Open in PDF editor</TkxButton>
          {!room && <TkxButton variant="outline" size="sm" onClick={() => void share()} title="Create a private link to edit this together in real time">🔗 Share</TkxButton>}
          <SaveTemplateButton defaultName={name} getSeed={() => ({ name, ext: 'docx', kind: 'word', html: html(), theme: themeId })} />
          <TkxButton variant={ai ? 'solid' : 'outline'} colorScheme="primary" size="sm" onClick={() => setAi((v) => !v)}>✦ AI</TkxButton>
        </div>
      </div>
      {room && <CollabBar room={room} peers={collab.peers} ready={collab.ready} relayStatus={collab.relayStatus} copied={copied} onCopy={() => void copyLink()} />}
      <div className="ed-rt-toolbar" role="toolbar">
        <Btn on={act.bold} t={() => cmd('bold')} title="Bold"><b>B</b></Btn>
        <Btn on={act.italic} t={() => cmd('italic')} title="Italic"><i>I</i></Btn>
        <Btn on={act.underline} t={() => cmd('underline')} title="Underline"><u>U</u></Btn>
        <Btn on={act.strike} t={() => cmd('strikeThrough')} title="Strikethrough"><s>S</s></Btn>
        <span className="ed-rt-sep" />
        <Btn on={act.block === 'h1'} t={() => block('H1')} title="Heading 1">H1</Btn>
        <Btn on={act.block === 'h2'} t={() => block('H2')} title="Heading 2">H2</Btn>
        <Btn on={act.block === 'h3'} t={() => block('H3')} title="Heading 3">H3</Btn>
        <Btn t={() => cmd('formatBlock', 'P')} title="Body">¶</Btn>
        <span className="ed-rt-sep" />
        <Btn on={act.ul} t={() => cmd('insertUnorderedList')} title="Bullet list">•</Btn>
        <Btn on={act.ol} t={() => cmd('insertOrderedList')} title="Numbered list">1.</Btn>
        <Btn on={act.block === 'blockquote'} t={() => block('BLOCKQUOTE')} title="Quote">❝</Btn>
        <span className="ed-rt-sep" />
        <Btn on={act.align === 'left'} t={() => cmd('justifyLeft')} title="Align left">⫷</Btn>
        <Btn on={act.align === 'center'} t={() => cmd('justifyCenter')} title="Center">≣</Btn>
        <Btn on={act.align === 'right'} t={() => cmd('justifyRight')} title="Align right">⫸</Btn>
        <Btn on={act.align === 'justify'} t={() => cmd('justifyFull')} title="Justify">☰</Btn>
        <span className="ed-rt-sep" />
        <label className="rt-color" title="Text colour" style={{ ['--rt-c' as string]: fgColor }}>A<input type="color" value={fgColor} onChange={(e) => { setFgColor(e.target.value); cmd('foreColor', e.target.value); }} /></label>
        <label className="rt-color rt-hl" title="Highlight" style={{ ['--rt-c' as string]: hlColor }}>✎<input type="color" value={hlColor} onChange={(e) => { setHlColor(e.target.value); cmd('hiliteColor', e.target.value); }} /></label>
        <TkxSelect
          size="sm"
          value={fontSize}
          options={[
            { value: '1', label: 'XS' },
            { value: '2', label: 'S' },
            { value: '3', label: 'M' },
            { value: '4', label: 'L' },
            { value: '5', label: 'XL' },
            { value: '6', label: 'XXL' },
          ]}
          onChange={(v) => { setFontSize(v as string); cmd('fontSize', v as string); }}
        />
        <TkxSelect
          size="sm"
          value={fontName}
          options={[
            { value: '', label: 'Font' },
            { value: 'Inter, system-ui, sans-serif', label: 'Sans' },
            { value: 'Georgia, serif', label: 'Serif' },
            { value: "'Times New Roman', serif", label: 'Times' },
            { value: 'Arial, sans-serif', label: 'Arial' },
            { value: 'ui-monospace, Menlo, monospace', label: 'Mono' },
          ]}
          onChange={(v) => { setFontName(v as string); if (v) cmd('fontName', v as string); }}
        />
        <span className="ed-rt-sep" />
        <Btn t={() => cmd('subscript')} title="Subscript">X₂</Btn>
        <Btn t={() => cmd('superscript')} title="Superscript">X²</Btn>
        <Btn t={() => cmd('outdent')} title="Decrease indent">⇤</Btn>
        <Btn t={() => cmd('indent')} title="Increase indent">⇥</Btn>
        <span className="ed-rt-sep" />
        <Btn t={() => { const u = prompt('Link URL:', 'https://'); if (u) cmd('createLink', u); }} title="Link">🔗</Btn>
        <Btn t={() => cmd('insertHTML', '<table class="rt-table"><thead><tr><th>Header 1</th><th>Header 2</th><th>Header 3</th></tr></thead><tbody><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table><p><br></p>')} title="Insert table">▦</Btn>
        <label className="rt-imgbtn" title="Insert image" onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}>🖼
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { const rd = new FileReader(); rd.onload = () => insertImage(String(rd.result)); rd.readAsDataURL(f); } }} />
        </label>
        <Btn t={() => cmd('insertHTML', '<hr>')} title="Horizontal rule">―</Btn>
        <Btn t={() => cmd('insertHTML', '<pre style="background:#f1f5f9;padding:10px 12px;border-radius:6px;font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap">code</pre><p><br></p>')} title="Code block">{'</>'}</Btn>
        <Btn t={() => cmd('insertText', new Date().toLocaleDateString())} title="Insert date">📅</Btn>
        <Btn t={() => cmd('removeFormat')} title="Clear formatting">⌫</Btn>
        <Btn t={() => cmd('undo')} title="Undo">↶</Btn>
        <Btn t={() => cmd('redo')} title="Redo">↷</Btn>
        <span className="ed-rt-sep" />
        <span className="ed-tool-label">Theme</span>
        <TkxSelect size="sm" value={themeId} options={themes.map((t) => ({ value: t.id, label: t.name }))} onChange={(v) => setThemeId(v as string)} />
        <span className="ed-rt-sep" />
        <span className="ed-tool-label">Page</span>
        <TkxSelect size="sm" value={page.size ?? 'letter'} options={[{ value: 'letter', label: 'Letter' }, { value: 'a4', label: 'A4' }, { value: 'legal', label: 'Legal' }]} onChange={(v) => setPage((p) => ({ ...p, size: v as PageSetup['size'] }))} />
        <TkxSelect size="sm" value={page.orientation ?? 'portrait'} options={[{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]} onChange={(v) => setPage((p) => ({ ...p, orientation: v as PageSetup['orientation'] }))} />
        <TkxSelect size="sm" value={page.margin ?? 'normal'} options={[{ value: 'normal', label: 'Margins: Normal' }, { value: 'narrow', label: 'Margins: Narrow' }, { value: 'wide', label: 'Margins: Wide' }]} onChange={(v) => setPage((p) => ({ ...p, margin: v as PageSetup['margin'] }))} />
        <TkxSelect size="sm" value={String(page.columns ?? 1)} options={[{ value: '1', label: '1 column' }, { value: '2', label: '2 columns' }, { value: '3', label: '3 columns' }]} onChange={(v) => setPage((p) => ({ ...p, columns: Number(v) }))} />
          <BrandButton onChange={reload} />
      </div>
      {inTable && (
        <div className="ed-rt-toolbar ed-table-tools" role="toolbar" aria-label="Table tools">
          <span className="ed-tool-label">Table</span>
          <Btn t={() => addRow(false)} title="Insert row above">⤒ Row</Btn>
          <Btn t={() => addRow(true)} title="Insert row below">⤓ Row</Btn>
          <Btn t={() => addCol(false)} title="Insert column left">⇤ Col</Btn>
          <Btn t={() => addCol(true)} title="Insert column right">⇥ Col</Btn>
          <span className="ed-rt-sep" />
          <Btn t={delRow} title="Delete row">－ Row</Btn>
          <Btn t={delCol} title="Delete column">－ Col</Btn>
          <Btn t={delTable} title="Delete table">⌫ Table</Btn>
        </div>
      )}
      <div className="ed-body-row">
        <div className="ed-rt-page" style={{ background: theme.bg }}>
          <div
            className="ed-rt"
            ref={ref}
            contentEditable
            suppressContentEditableWarning
            spellCheck
            onInput={() => { setRev((r) => r + 1); pushHtml(); }}
            onKeyUp={refresh}
            onMouseUp={refresh}
            onPaste={(e) => {
              // Sanitize pasted rich text so scripts/handlers can't enter the doc.
              const html = e.clipboardData.getData('text/html');
              if (html) { e.preventDefault(); cmd('insertHTML', sanitizeHtml(html)); setRev((r) => r + 1); }
            }}
            style={{
              background: theme.panel, color: theme.fg, fontFamily: theme.fontBody, ['--rt-heading' as string]: theme.heading,
              // Page geometry preview: width follows size/orientation, padding follows
              // margins, and column-count follows the column choice (WYSIWYG with .docx).
              maxWidth: (page.orientation === 'landscape' ? { letter: 1056, a4: 1020, legal: 1344 } : { letter: 816, a4: 794, legal: 816 })[page.size ?? 'letter'],
              padding: { normal: '72px', narrow: '36px', wide: '90px' }[page.margin ?? 'normal'],
              columnCount: page.columns ?? 1,
              columnGap: 36,
            }}
          />
        </div>
        {ai && (
          <AiAssistant
            kind="Word document"
            getContext={() => ref.current?.innerText ?? ''}
            onInsert={insert}
            onClose={() => setAi(false)}
            quickActions={[
              { label: 'Summarize', prompt: 'Summarize this document in a few bullet points.' },
              { label: 'Improve writing', prompt: 'Rewrite this document to be clearer and more professional, keeping the meaning.' },
              { label: 'Continue', prompt: 'Continue writing this document in the same style.' },
              { label: 'Make formal', prompt: 'Rewrite this document in a more formal, business tone.' },
            ]}
          />
        )}
      </div>
    </div>
  );
}
