/**
 * Thumbnail sidebar. Renders one ~120px-wide pdf.js preview per page,
 * lazy-loaded via IntersectionObserver so a 500-page PDF doesn't burn
 * CPU on initial mount.
 *
 * Click any thumb to jump the main stack to that page. The currently-
 * visible page is highlighted (passed in via `currentPage`).
 */
import { useEffect, useRef, useState } from 'react';
import { TkxButton } from 'tekivex-ui';
import { renderPage } from '@pdfcraft/engine';
import type { PdfDocumentHandle } from '@pdfcraft/engine';

interface Props {
  doc: PdfDocumentHandle;
  currentPage: number;
  onSelectPage: (page: number) => void;
}

const THUMB_WIDTH = 120; // px

export function Thumbnails({ doc, currentPage, onSelectPage }: Props) {
  const pages = Array.from({ length: doc.pageCount }, (_, i) => i + 1);
  return (
    <aside className="v2-thumbs" aria-label="Page thumbnails">
      <div className="v2-thumbs__list">
        {pages.map((n) => (
          <ThumbSlot
            key={n}
            doc={doc}
            pageNumber={n}
            isActive={n === currentPage}
            onClick={() => onSelectPage(n)}
          />
        ))}
      </div>
    </aside>
  );
}

interface SlotProps {
  doc: PdfDocumentHandle;
  pageNumber: number;
  isActive: boolean;
  onClick: () => void;
}

function ThumbSlot({ doc, pageNumber, isActive, onClick }: SlotProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [rendered, setRendered] = useState(false);
  const [size, setSize] = useState({ w: THUMB_WIDTH, h: THUMB_WIDTH * 1.3 });
  const slotRef = useRef<HTMLButtonElement | null>(null);

  // Lazy-render: only kick off renderPage when the slot scrolls into view.
  useEffect(() => {
    const node = slotRef.current;
    if (!node || rendered) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRendered(true);
          obs.disconnect();
        }
      },
      { rootMargin: '200px' }, // pre-load a bit before the user scrolls
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [rendered]);

  useEffect(() => {
    if (!rendered || !container) return;
    let cancelled = false;
    // Render at a scale that makes the longer axis ~THUMB_WIDTH.
    // We don't know the page dimensions until we render once, so we
    // start at scale=0.2 and adjust the wrapper's max-width via CSS.
    renderPage(doc, { pageNumber, scale: 0.2 })
      .then(({ canvas, width, height }) => {
        if (cancelled) return;
        container.innerHTML = '';
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        container.appendChild(canvas);
        // Preserve aspect ratio for the wrapper height
        const ratio = height / width;
        setSize({ w: THUMB_WIDTH, h: Math.round(THUMB_WIDTH * ratio) });
      })
      .catch((e) => console.warn(`thumb render page ${pageNumber} failed:`, e));
    return () => {
      cancelled = true;
    };
  }, [doc, pageNumber, rendered, container]);

  // When the slot becomes active, scroll it into view in the sidebar.
  useEffect(() => {
    if (isActive && slotRef.current) {
      slotRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isActive]);

  return (
    <TkxButton variant="ghost" size="sm"
      ref={slotRef}
      type="button"
      className={'v2-thumb' + (isActive ? ' v2-thumb--active' : '')}
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      aria-label={`Page ${pageNumber}`}
      style={{ width: size.w + 12 }}
    >
      <div
        ref={setContainer}
        className="v2-thumb__canvas"
        style={{ width: size.w, height: size.h }}
      />
      <span className="v2-thumb__label">{pageNumber}</span>
    </TkxButton>
  );
}
