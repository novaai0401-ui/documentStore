import { useEffect, useRef, useState } from 'react';
import { usePageRenderer } from '@pdfcraft/ui-react';
import type { PdfDocumentHandle } from '@pdfcraft/engine';
import { AnnotationLayer, type Annotation, type NewFieldKind, type AiTextAction } from './Annotations.js';
import type { TextHit } from './pdfText.js';
import { SearchOverlay } from './SearchOverlay.js';
import type { SearchMatch } from './useTextSearch.js';
import type { ToolName } from './ActionToolbar.js';

interface Props {
  doc: PdfDocumentHandle;
  scale: number;
  formOverlayOpen: boolean;
  renderVersion?: number;
  annotations: Annotation[];
  onAnnotationsChange: (next: Annotation[]) => void;
  activeTool: ToolName;
  newFieldKind: NewFieldKind;
  /** Per-page rotation in degrees (multiples of 90). */
  rotation?: number;
  /** Requested scroll target — when this changes, PdfView scrolls
   *  the matching page into view. The `bump` field exists so clicking
   *  the same thumb twice still triggers a re-scroll. */
  scrollRequest?: { page: number; bump: number };
  /** Emitted whenever the visible-page heuristic resolves a new winner. */
  onCurrentPageChange?: (page: number) => void;
  /** Search matches from useTextSearch — rendered as overlay rectangles. */
  searchMatches?: SearchMatch[];
  searchCurrentIndex?: number;
  onPromptStamp: (cb: (preset: string | null) => void) => void;
  onPromptHyperlink: (cb: (data: { url: string; label: string } | null) => void) => void;
  onPromptSign: (cb: (dataUrl: string | null) => void) => void;
  onPromptImage: (cb: (dataUrl: string | null) => void) => void;
  onPromptFieldName: (
    kind: NewFieldKind,
    cb: (data: { name: string; options?: string[] } | null) => void,
  ) => void;
  resolveEditText?: (
    page: number,
    xCss: number,
    yCss: number,
    cssWidth: number,
    cssHeight: number,
  ) => Promise<TextHit | null>;
  onAiRegion?: (
    page: number,
    rect: { x: number; y: number; width: number; height: number },
    cssWidth: number,
    cssHeight: number,
  ) => void;
  onAiText?: (text: string, action: AiTextAction) => Promise<string>;
}

export function PdfView(props: Props) {
  const { doc, scrollRequest, onCurrentPageChange } = props;
  const pageNumbers = Array.from({ length: doc.pageCount }, (_, i) => i + 1);
  const stackRef = useRef<HTMLDivElement | null>(null);

  // Track which page is currently the most visible.
  useEffect(() => {
    const root = stackRef.current;
    if (!root || !onCurrentPageChange) return;
    const slots = root.querySelectorAll<HTMLElement>('[data-page-number]');
    if (slots.length === 0) return;
    const visible = new Map<number, number>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const n = Number((e.target as HTMLElement).dataset.pageNumber);
          if (!n) continue;
          if (e.isIntersecting) visible.set(n, e.intersectionRatio);
          else visible.delete(n);
        }
        if (visible.size === 0) return;
        let bestPage = -1, bestScore = -1;
        for (const [n, r] of visible) {
          if (r > bestScore) { bestScore = r; bestPage = n; }
        }
        if (bestPage > 0) onCurrentPageChange(bestPage);
      },
      { root, threshold: [0.1, 0.5, 0.9] },
    );
    slots.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, [doc.pageCount, onCurrentPageChange]);

  // Scroll the requested page into view when scrollRequest changes
  // (uses bump so repeat clicks on the same thumb still re-scroll).
  useEffect(() => {
    if (!scrollRequest) return;
    const root = stackRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(`[data-page-number="${scrollRequest.page}"]`);
    if (target) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [scrollRequest]);

  return (
    <div className="v2-pdf-view">
      <div className="v2-pdf-view__stack" ref={stackRef}>
        {pageNumbers.map((n) => (
          <PageSlot key={`${n}-${props.renderVersion ?? 0}`} {...props} pageNumber={n} />
        ))}
      </div>
    </div>
  );
}

function PageSlot({
  doc,
  pageNumber,
  scale,
  formOverlayOpen,
  annotations,
  onAnnotationsChange,
  activeTool,
  newFieldKind,
  rotation,
  searchMatches,
  searchCurrentIndex,
  onPromptStamp,
  onPromptHyperlink,
  onPromptSign,
  onPromptImage,
  onPromptFieldName,
  resolveEditText,
  onAiRegion,
  onAiText,
}: Props & { pageNumber: number }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const { width, height } = usePageRenderer({
    doc,
    pageNumber,
    scale,
    rotation,
    container,
    withFormLayer: !formOverlayOpen,
  });
  return (
    <div
      className="v2-pdf-view__page-wrap"
      style={{ position: 'relative' }}
      data-page-number={pageNumber}
    >
      <div ref={setContainer} className="v2-pdf-view__page" />
      {width > 0 && (
        <AnnotationLayer
          pageNumber={pageNumber}
          pageWidth={width}
          pageHeight={height}
          annotations={annotations}
          activeTool={activeTool}
          onChange={onAnnotationsChange}
          newFieldKind={newFieldKind}
          onPromptStamp={onPromptStamp}
          onPromptHyperlink={onPromptHyperlink}
          onPromptSign={onPromptSign}
          onPromptImage={onPromptImage}
          onPromptFieldName={onPromptFieldName}
          resolveEditText={resolveEditText}
          onAiRegion={onAiRegion}
          onAiText={onAiText}
        />
      )}
      {width > 0 && searchMatches && searchMatches.length > 0 && (
        <SearchOverlay
          pageNumber={pageNumber}
          scale={scale}
          matches={searchMatches}
          currentIndex={searchCurrentIndex ?? 0}
        />
      )}
      <div className="v2-pdf-view__page-label">Page {pageNumber}</div>
    </div>
  );
}
