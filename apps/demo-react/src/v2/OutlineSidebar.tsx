/**
 * Document outline (bookmarks) sidebar. Renders the PDF's /Outlines
 * tree as a collapsible list — click any item to jump the main stack
 * to its target page. Empty fallback when the PDF has no outline.
 */
import { useEffect, useState } from 'react';
import { TkxButton } from 'tekivex-ui';
import type { PdfDocumentHandle, OutlineNode } from '@pdfcraft/engine';
import { listOutline } from '@pdfcraft/engine';

interface Props {
  doc: PdfDocumentHandle;
  onSelectPage: (page: number) => void;
}

export function OutlineSidebar({ doc, onSelectPage }: Props) {
  const [tree, setTree] = useState<OutlineNode[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTree(null);
    listOutline(doc).then((nodes) => {
      if (!cancelled) setTree(nodes);
    }).catch((e) => {
      console.warn('[outline] extract failed:', e);
      if (!cancelled) setTree([]);
    });
    return () => { cancelled = true; };
  }, [doc]);

  return (
    <aside className="v2-outline" aria-label="Document outline">
      <div className="v2-outline__header">Outline</div>
      <div className="v2-outline__body">
        {tree === null && <div className="v2-outline__hint">Loading…</div>}
        {tree?.length === 0 && (
          <div className="v2-outline__hint">No bookmarks in this PDF.</div>
        )}
        {tree && tree.length > 0 && (
          <ul className="v2-outline__list">
            {tree.map((node, i) => (
              <OutlineItem key={i} node={node} depth={0} onSelectPage={onSelectPage} />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

interface ItemProps {
  node: OutlineNode;
  depth: number;
  onSelectPage: (page: number) => void;
}

function OutlineItem({ node, depth, onSelectPage }: ItemProps) {
  const [open, setOpen] = useState(!node.collapsed);
  const hasChildren = node.children.length > 0;
  return (
    <li className="v2-outline__item">
      <div
        className="v2-outline__row"
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        {hasChildren ? (
          <TkxButton variant="ghost" size="sm"
            type="button"
            className="v2-outline__chevron"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Collapse' : 'Expand'}
          >{open ? '▾' : '▸'}</TkxButton>
        ) : (
          <span className="v2-outline__chevron v2-outline__chevron--spacer" />
        )}
        <TkxButton variant="ghost" size="sm"
          type="button"
          className="v2-outline__title"
          disabled={node.targetPage <= 0}
          onClick={() => node.targetPage > 0 && onSelectPage(node.targetPage)}
          title={node.targetPage > 0 ? `Go to page ${node.targetPage}` : 'No target'}
        >
          {node.title || '(untitled)'}
        </TkxButton>
        {node.targetPage > 0 && (
          <span className="v2-outline__page">{node.targetPage}</span>
        )}
      </div>
      {hasChildren && open && (
        <ul className="v2-outline__list">
          {node.children.map((c, i) => (
            <OutlineItem key={i} node={c} depth={depth + 1} onSelectPage={onSelectPage} />
          ))}
        </ul>
      )}
    </li>
  );
}
