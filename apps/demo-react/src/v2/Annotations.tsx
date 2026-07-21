import { TkxButton, TkxInput } from 'tekivex-ui';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';
import type { ToolName } from './ActionToolbar.js';
import type { TextHit } from './pdfText.js';

/** AI text transforms offered inside an editable text box. */
export type AiTextAction = 'rewrite' | 'fix' | 'shorten' | 'formal';

// ─────────────────────────────────────────────────────────────────────────────
//   Discriminated union — every overlay annotation our tools can create.
//   All coordinates are CSS pixels relative to the page's top-left.
// ─────────────────────────────────────────────────────────────────────────────

interface Base {
  id: string;
  page: number;
  /** Page render dimensions in CSS pixels at creation time. Captured
   *  so the save flow can convert overlay coords back to PDF user
   *  space (PDF page dims via /MediaBox / pageCssWidth = scale). */
  pageCssWidth: number;
  pageCssHeight: number;
}

interface BoxBase extends Base {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Field type the Add-Field tool can stamp out. Mirrors the parser's
 *  NewFieldType. Kept narrow on the demo side so the picker UI maps
 *  cleanly to chips. */
export type NewFieldKind = 'text' | 'multiline' | 'checkbox' | 'dropdown' | 'date' | 'signature';

export type Annotation =
  | (BoxBase & { kind: 'text'; text: string; fontSize: number; color: string; invisible?: boolean; rotate?: number; opacity?: number })
  | (BoxBase & { kind: 'highlight'; color: string })
  | (BoxBase & { kind: 'eraser' })
  | (BoxBase & { kind: 'redact' })
  | (BoxBase & { kind: 'crop' })
  | (BoxBase & { kind: 'hyperlink'; url: string; label: string })
  | (BoxBase & { kind: 'stamp'; preset: string; color: string })
  | (BoxBase & { kind: 'sign'; dataUrl: string })
  | (BoxBase & { kind: 'image'; dataUrl: string })
  | (BoxBase & { kind: 'shape'; shape: 'rect' | 'ellipse'; stroke: string; strokeWidth: number })
  | (Base & { kind: 'draw'; points: Array<[number, number]>; stroke: string; strokeWidth: number })
  | (BoxBase & {
      kind: 'new-field';
      fieldType: NewFieldKind;
      fieldName: string;
      defaultValue?: string | boolean;
      options?: string[];
      required?: boolean;
      readOnly?: boolean;
      maxLength?: number;
    });

// ─────────────────────────────────────────────────────────────────────────────
//   Tool defaults
// ─────────────────────────────────────────────────────────────────────────────

const TOOL_DEFAULTS = {
  highlight: { color: 'rgba(255, 220, 60, 0.4)' },
  eraser: {},
  redact: { color: '#000' },
  crop: {},
  hyperlink: {},
  stamp: { color: '#b25800' },
  sign: {},
  image: {},
  shape: { stroke: '#2e5bff', strokeWidth: 2 },
  draw: { stroke: '#1f2933', strokeWidth: 2 },
} as const;

const STAMP_PRESETS = ['APPROVED', 'REJECTED', 'CONFIDENTIAL', 'DRAFT', 'PAID', 'VOID'];

/** Brush thickness (CSS px at scale 1) for the freehand eraser. */
const ERASER_WIDTH = 20;

// ─────────────────────────────────────────────────────────────────────────────
//   Layer component — owns one page worth of overlay rendering + tool input
// ─────────────────────────────────────────────────────────────────────────────

interface LayerProps {
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  annotations: Annotation[];
  activeTool: ToolName;
  onChange: (next: Annotation[]) => void;
  /** Field type selected on the Add-Field sub-toolbar. Drives what kind
   *  of /Widget annotation gets minted when activeTool === 'add-fields'. */
  newFieldKind: NewFieldKind;
  /** Opened to ask the user for stamp / hyperlink details. */
  onPromptStamp: (cb: (preset: string | null) => void) => void;
  onPromptHyperlink: (cb: (data: { url: string; label: string } | null) => void) => void;
  onPromptSign: (cb: (dataUrl: string | null) => void) => void;
  onPromptImage: (cb: (dataUrl: string | null) => void) => void;
  /** Opened after the user drags a new-field rect — asks for name + opts. */
  onPromptFieldName: (
    kind: NewFieldKind,
    cb: (data: { name: string; options?: string[] } | null) => void,
  ) => void;
  /** Edit-text tool: resolve the real text run under a click so the edit
   *  box can be pre-filled (Word-like). Returns null when no text is there. */
  resolveEditText?: (
    page: number,
    xCss: number,
    yCss: number,
    cssWidth: number,
    cssHeight: number,
  ) => Promise<TextHit | null>;
  /** Ask-AI region tool: hand the dragged rect to the parent to extract
   *  text and open the AI panel scoped to it. */
  onAiRegion?: (
    page: number,
    rect: { x: number; y: number; width: number; height: number },
    cssWidth: number,
    cssHeight: number,
  ) => void;
  /** AI transform for text inside an editable box (rewrite/fix/etc.). */
  onAiText?: (text: string, action: AiTextAction) => Promise<string>;
}

interface DragState {
  startX: number;
  startY: number;
  curX: number;
  curY: number;
  // For 'draw': accumulated points
  points?: Array<[number, number]>;
}

export function AnnotationLayer({
  pageNumber,
  pageWidth,
  pageHeight,
  annotations,
  activeTool,
  onChange,
  newFieldKind,
  onPromptStamp,
  onPromptHyperlink,
  onPromptSign,
  onPromptImage,
  onPromptFieldName,
  resolveEditText,
  onAiRegion,
  onAiText,
}: LayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const pageAnnots = annotations.filter((a) => a.page === pageNumber);

  // `isCreating` originally listed only the drag-style tools so we could
  // skip mousedown logic for click-prompt tools. But pointer-events was
  // gated on the same flag, which meant the overlay let clicks fall
  // through to the pdf.js form layer for stamp / sign / image / hyperlink
  // / add-fields until SOMETHING had already been drawn — visible as
  // "the first tool click does nothing" until you've used a drag tool.
  // Keep the drag-classifier as `isDragTool(activeTool)` for the rest of
  // the handler, but switch the layer's pointer-events to "auto for ANY
  // active tool" so click-prompt tools work on their first invocation.
  const toolActive = activeTool !== 'select';

  const cssStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: pageWidth,
    height: pageHeight,
    pointerEvents: toolActive || pageAnnots.length > 0 ? 'auto' : 'none',
    cursor: cursorFor(activeTool),
    overflow: 'hidden',
  };

  const onMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    // Ignore clicks on existing annotation chrome.
    if ((e.target as HTMLElement).closest('.v2-annot')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (activeTool === 'add-text') {
      const next: Annotation = {
        id: nextId(),
        page: pageNumber,
        pageCssWidth: pageWidth,
        pageCssHeight: pageHeight,
        kind: 'text',
        x,
        y,
        width: 200,
        height: 28,
        text: '',
        fontSize: 14,
        color: '#1f2933',
      };
      onChange([...annotations, next]);
      return;
    }

    if (activeTool === 'edit-text') {
      // Word-like edit. We look up the real text run under the cursor so the
      // editable box starts pre-filled with the actual words at the right
      // size and position. A white-out (eraser) is sized to cover exactly
      // that run; on save the original is hidden and the edited text redrawn
      // on top — all via incremental update, so the source PDF is untouched.
      const pageDims = { pageCssWidth: pageWidth, pageCssHeight: pageHeight };
      const commit = (hit: TextHit | null) => {
        const box = hit ?? { text: '', x, y, width: 240, height: 28, fontSize: 14 };
        const pad = 3;
        const eraser: Annotation = {
          id: nextId(), page: pageNumber, ...pageDims, kind: 'eraser',
          x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2,
        };
        const text: Annotation = {
          id: nextId(), page: pageNumber, ...pageDims, kind: 'text',
          x: box.x, y: box.y,
          width: Math.max(box.width, 60),
          height: Math.max(box.height, 18),
          text: box.text,
          fontSize: Math.max(8, Math.round(box.fontSize)),
          color: '#1f2933',
        };
        onChange([...annotations, eraser, text]);
      };
      if (resolveEditText) {
        resolveEditText(pageNumber, x, y, pageWidth, pageHeight).then(commit).catch(() => commit(null));
      } else {
        commit(null);
      }
      return;
    }

    if (activeTool === 'stamp') {
      onPromptStamp((preset) => {
        if (!preset) return;
        const next: Annotation = {
          id: nextId(),
          page: pageNumber,
          pageCssWidth: pageWidth,
          pageCssHeight: pageHeight,
          kind: 'stamp',
          x,
          y,
          width: preset.length * 12 + 24,
          height: 36,
          preset,
          color: TOOL_DEFAULTS.stamp.color,
        };
        onChange([...annotations, next]);
      });
      return;
    }

    if (activeTool === 'hyperlink') {
      onPromptHyperlink((data) => {
        if (!data) return;
        const next: Annotation = {
          id: nextId(),
          page: pageNumber,
          pageCssWidth: pageWidth,
          pageCssHeight: pageHeight,
          kind: 'hyperlink',
          x,
          y,
          width: Math.max(80, data.label.length * 7 + 16),
          height: 24,
          url: data.url,
          label: data.label,
        };
        onChange([...annotations, next]);
      });
      return;
    }

    if (activeTool === 'sign') {
      onPromptSign((dataUrl) => {
        if (!dataUrl) return;
        const next: Annotation = {
          id: nextId(),
          page: pageNumber,
          pageCssWidth: pageWidth,
          pageCssHeight: pageHeight,
          kind: 'sign',
          x,
          y,
          width: 180,
          height: 60,
          dataUrl,
        };
        onChange([...annotations, next]);
      });
      return;
    }

    if (activeTool === 'image') {
      onPromptImage((dataUrl) => {
        if (!dataUrl) return;
        const next: Annotation = {
          id: nextId(),
          page: pageNumber,
          pageCssWidth: pageWidth,
          pageCssHeight: pageHeight,
          kind: 'image',
          x,
          y,
          width: 160,
          height: 120,
          dataUrl,
        };
        onChange([...annotations, next]);
      });
      return;
    }

    if (isDragTool(activeTool)) {
      setDrag({
        startX: x,
        startY: y,
        curX: x,
        curY: y,
        points: activeTool === 'draw' || activeTool === 'eraser' ? [[x, y]] : undefined,
      });
      e.preventDefault();
    }
  };

  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (drag.points) {
      setDrag({ ...drag, curX: x, curY: y, points: [...drag.points, [x, y]] });
    } else {
      setDrag({ ...drag, curX: x, curY: y });
    }
  };

  const finishDrag = useCallback(() => {
    if (!drag) return;
    const minX = Math.min(drag.startX, drag.curX);
    const minY = Math.min(drag.startY, drag.curY);
    const w = Math.abs(drag.curX - drag.startX);
    const h = Math.abs(drag.curY - drag.startY);
    let next: Annotation | null = null;
    const pageDims = { pageCssWidth: pageWidth, pageCssHeight: pageHeight };
    switch (activeTool) {
      case 'highlight':
        if (w < 4 || h < 4) break;
        next = {
          id: nextId(), page: pageNumber, ...pageDims, kind: 'highlight',
          x: minX, y: minY, width: w, height: h,
          color: TOOL_DEFAULTS.highlight.color,
        };
        break;
      case 'eraser':
        // Brush eraser: paint an opaque-white freehand stroke along the swipe
        // (a real eraser), not a draggable rectangle. A plain click with no
        // drag falls back to a small square white-out so a tap still erases.
        if (drag.points && drag.points.length > 1) {
          next = {
            id: nextId(), page: pageNumber, ...pageDims, kind: 'draw',
            points: drag.points, stroke: '#ffffff', strokeWidth: ERASER_WIDTH,
          };
        } else {
          const s = ERASER_WIDTH;
          next = { id: nextId(), page: pageNumber, ...pageDims, kind: 'eraser', x: drag.startX - s / 2, y: drag.startY - s / 2, width: s, height: s };
        }
        break;
      case 'redact':
        if (w < 4 || h < 4) break;
        next = { id: nextId(), page: pageNumber, ...pageDims, kind: 'redact', x: minX, y: minY, width: w, height: h };
        break;
      case 'crop':
        if (w < 4 || h < 4) break;
        next = { id: nextId(), page: pageNumber, ...pageDims, kind: 'crop', x: minX, y: minY, width: w, height: h };
        break;
      case 'shapes':
        if (w < 4 || h < 4) break;
        next = {
          id: nextId(), page: pageNumber, ...pageDims, kind: 'shape', shape: 'rect',
          x: minX, y: minY, width: w, height: h,
          stroke: TOOL_DEFAULTS.shape.stroke, strokeWidth: TOOL_DEFAULTS.shape.strokeWidth,
        };
        break;
      case 'draw':
        if (drag.points && drag.points.length > 1) {
          next = {
            id: nextId(), page: pageNumber, ...pageDims, kind: 'draw',
            points: drag.points,
            stroke: TOOL_DEFAULTS.draw.stroke, strokeWidth: TOOL_DEFAULTS.draw.strokeWidth,
          };
        }
        break;
      case 'ai-region':
        // Don't create an annotation — hand the rect to the parent, which
        // extracts the text under it and opens the AI panel scoped to it.
        if (w >= 8 && h >= 8 && onAiRegion) {
          onAiRegion(pageNumber, { x: minX, y: minY, width: w, height: h }, pageWidth, pageHeight);
        }
        break;
      case 'add-fields':
        // Wait until the prompt resolves before committing — name +
        // options are required, the user can also cancel.
        if (w >= 8 && h >= 12) {
          const rect = { x: minX, y: minY, width: w, height: h };
          setDrag(null);
          onPromptFieldName(newFieldKind, (data) => {
            if (!data) return;
            const fieldAnnot: Annotation = {
              id: nextId(), page: pageNumber, ...pageDims, kind: 'new-field',
              ...rect,
              fieldType: newFieldKind,
              fieldName: data.name,
              options: data.options,
            };
            onChange([...annotations, fieldAnnot]);
          });
          return;
        }
        break;
    }
    setDrag(null);
    if (next) onChange([...annotations, next]);
  }, [drag, activeTool, pageNumber, annotations, onChange, newFieldKind, onPromptFieldName, onAiRegion, pageWidth, pageHeight]);

  useEffect(() => {
    if (!drag) return;
    const up = () => finishDrag();
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, [drag, finishDrag]);

  const removeAnnot = (id: string) => onChange(annotations.filter((a) => a.id !== id));
  const updateAnnot = (id: string, patch: Partial<Annotation>) =>
    onChange(annotations.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)));

  return (
    <div
      ref={layerRef}
      className="v2-annot-layer"
      // Suppress native scroll/zoom only while a drag tool is active, so freehand
      // draw / highlight / eraser / shapes work on touch without hijacking scroll.
      style={{ ...cssStyle, touchAction: isDragTool(activeTool) ? 'none' : (cssStyle as { touchAction?: string }).touchAction }}
      onPointerDown={onMouseDown}
      onPointerMove={onMouseMove}
    >
      {pageAnnots.map((a) => (
        <AnnotItem
          key={a.id}
          annotation={a}
          onUpdate={(patch) => updateAnnot(a.id, patch)}
          onRemove={() => removeAnnot(a.id)}
          onAiText={onAiText}
        />
      ))}
      {drag && <DragGhost drag={drag} tool={activeTool} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//   Per-kind rendering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Small ✨ control anchored to an editable text box. Opens a menu of AI
 * transforms (rewrite / fix grammar / shorten / make formal) that run the
 * box's current text through the AI and replace it with the result —
 * AI-assisted editing right where you're typing.
 */
function TextAiControl({
  text,
  onAiText,
  onResult,
}: {
  text: string;
  onAiText: (text: string, action: AiTextAction) => Promise<string>;
  onResult: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const actions: Array<{ id: AiTextAction; label: string }> = [
    { id: 'rewrite', label: 'Rewrite' },
    { id: 'fix', label: 'Fix grammar' },
    { id: 'shorten', label: 'Shorten' },
    { id: 'formal', label: 'Make formal' },
  ];
  const run = async (action: AiTextAction) => {
    if (!text.trim()) { setOpen(false); return; }
    setBusy(true);
    try {
      const out = await onAiText(text, action);
      if (out && out.trim()) onResult(out.trim());
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };
  return (
    <div
      className="v2-annot__ai"
      style={{ position: 'absolute', top: -10, left: -10, zIndex: 6 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <TkxButton variant="ghost" size="sm"
        type="button"
        className="v2-annot__ai-btn"
        title="AI: rewrite / fix / shorten"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
      >{busy ? '…' : '✨'}</TkxButton>
      {open && (
        <div className="v2-annot__ai-menu">
          {actions.map((act) => (
            <TkxButton variant="ghost" size="sm" key={act.id} type="button" onClick={() => run(act.id)}>{act.label}</TkxButton>
          ))}
        </div>
      )}
    </div>
  );
}

function AnnotItem({
  annotation: a,
  onUpdate,
  onRemove,
  onAiText,
}: {
  annotation: Annotation;
  onUpdate: (patch: Partial<Annotation>) => void;
  onRemove: () => void;
  onAiText?: (text: string, action: AiTextAction) => Promise<string>;
}) {
  const [hover, setHover] = useState(false);
  /** new-field annotations get an inline edit popover when this is true. */
  const [editingProps, setEditingProps] = useState(false);
  const dragRef = useRef<{ x: number; y: number; baseX: number; baseY: number } | null>(null);

  useEffect(() => {
    function onMove(e: globalThis.MouseEvent) {
      if (!dragRef.current || a.kind === 'draw') return;
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      onUpdate({ x: dragRef.current.baseX + dx, y: dragRef.current.baseY + dy } as Partial<Annotation>);
    }
    function onUp() { dragRef.current = null; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onUpdate, a.kind]);

  const startDrag = (e: MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'INPUT') return;
    if (a.kind === 'draw') return;
    e.stopPropagation();
    dragRef.current = { x: e.clientX, y: e.clientY, baseX: (a as BoxBase).x, baseY: (a as BoxBase).y };
  };

  const removeBtn = hover && (
    <TkxButton variant="ghost" size="sm"
      type="button"
      className="v2-annot__remove"
      onMouseDown={(e) => { e.stopPropagation(); onRemove(); }}
      aria-label="Remove"
    >
      ×
    </TkxButton>
  );

  if (a.kind === 'draw') {
    if (a.points.length < 2) return null;
    const xs = a.points.map((p) => p[0]);
    const ys = a.points.map((p) => p[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const maxX = Math.max(...xs), maxY = Math.max(...ys);
    const w = Math.max(2, maxX - minX);
    const h = Math.max(2, maxY - minY);
    return (
      <div
        className="v2-annot v2-annot--draw"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ position: 'absolute', left: minX - 4, top: minY - 4, width: w + 8, height: h + 8 }}
      >
        <svg width={w + 8} height={h + 8} style={{ overflow: 'visible' }}>
          <polyline
            points={a.points.map(([x, y]) => `${x - minX + 4},${y - minY + 4}`).join(' ')}
            fill="none"
            stroke={a.stroke}
            strokeWidth={a.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {removeBtn}
      </div>
    );
  }

  const box = a as BoxBase;
  const wrap: CSSProperties = {
    position: 'absolute',
    left: box.x,
    top: box.y,
    width: box.width,
    height: box.height,
    cursor: 'move',
  };

  switch (a.kind) {
    case 'text':
      return (
        <div
          className="v2-annot v2-annot--text"
          style={wrap}
          onMouseDown={startDrag}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          {removeBtn}
          {onAiText && (hover || a.text.length > 0) && (
            <TextAiControl
              text={a.text}
              onAiText={onAiText}
              onResult={(t) => onUpdate({ text: t } as Partial<Annotation>)}
            />
          )}
          <textarea
            value={a.text}
            placeholder="Type…"
            autoFocus={a.text === ''}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => onUpdate({ text: e.target.value } as Partial<Annotation>)}
            // Drop an empty text box on blur so an accidental "Add/Edit text" tap
            // doesn't leave a stray highlighted box (skip when focusing its AI button).
            onBlur={(e) => { if (a.text.trim() === '' && (e.relatedTarget as HTMLElement | null)?.tagName !== 'BUTTON') onRemove(); }}
            style={{
              width: '100%', height: '100%', border: 'none', background: 'transparent',
              resize: 'none', outline: 'none', font: `${a.fontSize}px Inter, sans-serif`,
              color: a.color, padding: 0,
            }}
          />
        </div>
      );
    case 'highlight':
      return (
        <div
          className="v2-annot v2-annot--highlight"
          style={{ ...wrap, background: a.color }}
          onMouseDown={startDrag}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          {removeBtn}
        </div>
      );
    case 'eraser':
      return (
        <div
          className="v2-annot v2-annot--eraser"
          style={{ ...wrap, background: '#fff' }}
          onMouseDown={startDrag}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          {removeBtn}
        </div>
      );
    case 'redact':
      return (
        <div
          className="v2-annot v2-annot--redact"
          style={{ ...wrap, background: '#000' }}
          onMouseDown={startDrag}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          {removeBtn}
        </div>
      );
    case 'crop':
      return (
        <div
          className="v2-annot v2-annot--crop"
          style={{
            ...wrap,
            border: '2px dashed #2e5bff',
            background: 'rgba(46, 91, 255, 0.05)',
          }}
          onMouseDown={startDrag}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          {removeBtn}
        </div>
      );
    case 'hyperlink':
      return (
        <div
          className="v2-annot v2-annot--hyperlink"
          style={{
            ...wrap,
            color: '#2e5bff',
            textDecoration: 'underline',
            background: 'rgba(46, 91, 255, 0.06)',
            padding: '0 4px',
            display: 'inline-flex',
            alignItems: 'center',
            fontSize: 14,
          }}
          onMouseDown={startDrag}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          title={a.url}
        >
          {removeBtn}
          {a.label}
        </div>
      );
    case 'stamp':
      return (
        <div
          className="v2-annot v2-annot--stamp"
          style={{
            ...wrap,
            border: `2px solid ${a.color}`,
            color: a.color,
            transform: 'rotate(-8deg)',
            transformOrigin: 'top left',
            fontWeight: 700,
            fontSize: 18,
            letterSpacing: '0.04em',
            textAlign: 'center',
            background: 'rgba(255, 255, 255, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px 12px',
          }}
          onMouseDown={startDrag}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          {removeBtn}
          {a.preset}
        </div>
      );
    case 'sign':
    case 'image':
      return (
        <div
          className="v2-annot v2-annot--image"
          style={wrap}
          onMouseDown={startDrag}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          {removeBtn}
          <img
            src={a.dataUrl}
            alt={a.kind === 'sign' ? 'signature' : 'image'}
            style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
          />
        </div>
      );
    case 'new-field':
      return (
        <div
          className="v2-annot v2-annot--new-field"
          style={{
            ...wrap,
            border: a.fieldType === 'signature' ? '2px dashed #b25800' : '2px dashed #2e5bff',
            background: a.fieldType === 'signature' ? 'rgba(178, 88, 0, 0.06)' : 'rgba(46, 91, 255, 0.05)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 8px',
            color: '#1f2933',
            fontSize: 12,
            gap: 6,
          }}
          onMouseDown={startDrag}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          title={`${a.fieldType} field — saves as fillable /Widget`}
        >
          {removeBtn}
          <span style={{
            background: a.fieldType === 'signature' ? '#b25800' : '#2e5bff',
            color: '#fff', borderRadius: 4,
            padding: '1px 6px', fontSize: 10, textTransform: 'uppercase',
            letterSpacing: 0.4, fontWeight: 600,
          }}>{a.fieldType === 'signature' ? '✍ sign' : a.fieldType}</span>
          <span style={{ fontWeight: 600, flex: 1 }}>{a.fieldName}</span>
          {hover && (
            <TkxButton variant="ghost" size="sm"
              type="button"
              className="v2-annot__edit"
              onMouseDown={(e) => { e.stopPropagation(); setEditingProps(true); }}
              aria-label="Edit field properties"
              title="Edit properties"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: 2, color: '#2e5bff', fontSize: 13,
              }}
            >✎</TkxButton>
          )}
          {editingProps && (
            <FieldPropsPopover
              annotation={a}
              onClose={() => setEditingProps(false)}
              onPatch={(patch) => onUpdate(patch as Partial<Annotation>)}
            />
          )}
        </div>
      );
    case 'shape':
      return (
        <div
          className="v2-annot v2-annot--shape"
          style={wrap}
          onMouseDown={startDrag}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          {removeBtn}
          <svg width={box.width} height={box.height} style={{ overflow: 'visible' }}>
            {a.shape === 'rect' ? (
              <rect
                x={a.strokeWidth / 2}
                y={a.strokeWidth / 2}
                width={Math.max(0, box.width - a.strokeWidth)}
                height={Math.max(0, box.height - a.strokeWidth)}
                fill="none"
                stroke={a.stroke}
                strokeWidth={a.strokeWidth}
              />
            ) : (
              <ellipse
                cx={box.width / 2}
                cy={box.height / 2}
                rx={Math.max(0, box.width / 2 - a.strokeWidth / 2)}
                ry={Math.max(0, box.height / 2 - a.strokeWidth / 2)}
                fill="none"
                stroke={a.stroke}
                strokeWidth={a.strokeWidth}
              />
            )}
          </svg>
        </div>
      );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//   Drag ghost — live preview while user is drawing the box / stroke
// ─────────────────────────────────────────────────────────────────────────────

function DragGhost({ drag, tool }: { drag: DragState; tool: ToolName }) {
  const minX = Math.min(drag.startX, drag.curX);
  const minY = Math.min(drag.startY, drag.curY);
  const w = Math.abs(drag.curX - drag.startX);
  const h = Math.abs(drag.curY - drag.startY);

  if ((tool === 'draw' || tool === 'eraser') && drag.points) {
    const isEraser = tool === 'eraser';
    return (
      <svg
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        width="100%" height="100%"
      >
        {/* The eraser paints white; show a subtle grey outline so the swipe is
            visible over a white page during the drag. */}
        {isEraser && (
          <polyline
            points={drag.points.map(([x, y]) => `${x},${y}`).join(' ')}
            fill="none" stroke="rgba(100,116,139,0.45)" strokeWidth={ERASER_WIDTH + 2}
            strokeLinecap="round" strokeLinejoin="round"
          />
        )}
        <polyline
          points={drag.points.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke={isEraser ? '#ffffff' : TOOL_DEFAULTS.draw.stroke}
          strokeWidth={isEraser ? ERASER_WIDTH : TOOL_DEFAULTS.draw.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  const style: CSSProperties = {
    position: 'absolute',
    left: minX,
    top: minY,
    width: w,
    height: h,
    pointerEvents: 'none',
  };

  if (tool === 'highlight') return <div style={{ ...style, background: TOOL_DEFAULTS.highlight.color }} />;
  if (tool === 'eraser') return <div style={{ ...style, background: '#fff', border: '1px dashed #c1c8d2' }} />;
  if (tool === 'redact') return <div style={{ ...style, background: 'rgba(0, 0, 0, 0.6)' }} />;
  if (tool === 'crop')
    return <div style={{ ...style, border: '2px dashed #2e5bff', background: 'rgba(46, 91, 255, 0.05)' }} />;
  if (tool === 'shapes')
    return (
      <div style={style}>
        <svg width={w} height={h} style={{ overflow: 'visible' }}>
          <rect x={1} y={1} width={Math.max(0, w - 2)} height={Math.max(0, h - 2)}
            fill="none" stroke="#2e5bff" strokeWidth={2} strokeDasharray="4 3" />
        </svg>
      </div>
    );
  if (tool === 'add-fields')
    return (
      <div style={{
        ...style, border: '2px dashed #2e5bff',
        background: 'rgba(46, 91, 255, 0.08)',
      }} />
    );
  if (tool === 'ai-region')
    return (
      <div style={{
        ...style, border: '2px dashed #7c3aed',
        background: 'rgba(124, 58, 237, 0.10)',
      }} />
    );
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
//   Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isDragTool(t: ToolName): boolean {
  return (
    t === 'highlight' ||
    t === 'eraser' ||
    t === 'redact' ||
    t === 'crop' ||
    t === 'shapes' ||
    t === 'draw' ||
    t === 'add-fields' ||
    t === 'ai-region'
  );
}

function cursorFor(t: ToolName): string {
  if (t === 'add-text' || t === 'edit-text' || t === 'hyperlink' || t === 'stamp' || t === 'sign' || t === 'image') return 'crosshair';
  if (isDragTool(t)) return 'crosshair';
  return 'default';
}

function nextId(): string {
  return 'a' + Math.random().toString(36).slice(2, 9);
}

// ─────────────────────────────────────────────────────────────────────────────
//   Modal prompts — shared simple modal helpers used by Hyperlink / Stamp /
//   Sign / Image. The hook returns the prompt fns + a node to render.
// ─────────────────────────────────────────────────────────────────────────────

type AnyCb = (...args: unknown[]) => void;

interface ModalState {
  kind: 'stamp' | 'hyperlink' | 'sign' | 'image' | 'field-name';
  cb: AnyCb;
  /** For 'field-name' modal: which field type the user is creating. */
  fieldKind?: NewFieldKind;
}

export function useAnnotationPrompts(): {
  prompts: {
    onPromptStamp: (cb: (preset: string | null) => void) => void;
    onPromptHyperlink: (cb: (data: { url: string; label: string } | null) => void) => void;
    onPromptSign: (cb: (dataUrl: string | null) => void) => void;
    onPromptImage: (cb: (dataUrl: string | null) => void) => void;
    onPromptFieldName: (
      kind: NewFieldKind,
      cb: (data: { name: string; options?: string[] } | null) => void,
    ) => void;
  };
  modalNode: ReactNode;
} {
  const [modal, setModal] = useState<ModalState | null>(null);

  const close = () => setModal(null);
  const cancel = () => {
    modal?.cb(null);
    close();
  };

  const prompts = {
    onPromptStamp: (cb: (preset: string | null) => void) =>
      setModal({ kind: 'stamp', cb: cb as AnyCb }),
    onPromptHyperlink: (cb: (data: { url: string; label: string } | null) => void) =>
      setModal({ kind: 'hyperlink', cb: cb as AnyCb }),
    onPromptSign: (cb: (dataUrl: string | null) => void) =>
      setModal({ kind: 'sign', cb: cb as AnyCb }),
    onPromptImage: (cb: (dataUrl: string | null) => void) =>
      setModal({ kind: 'image', cb: cb as AnyCb }),
    onPromptFieldName: (
      kind: NewFieldKind,
      cb: (data: { name: string; options?: string[] } | null) => void,
    ) => setModal({ kind: 'field-name', fieldKind: kind, cb: cb as AnyCb }),
  };

  let body: ReactNode = null;
  if (modal?.kind === 'stamp') {
    body = (
      <div className="v2-modal__inner">
        <h3>Choose a stamp</h3>
        <div className="v2-modal__grid">
          {STAMP_PRESETS.map((p) => (
            <TkxButton variant="ghost" size="sm" key={p} type="button" className="v2-modal__chip"
              onClick={() => { modal.cb(p); close(); }}>
              {p}
            </TkxButton>
          ))}
        </div>
      </div>
    );
  } else if (modal?.kind === 'hyperlink') {
    body = <HyperlinkPrompt onConfirm={(data) => { modal.cb(data); close(); }} onCancel={cancel} />;
  } else if (modal?.kind === 'sign') {
    body = <SignaturePrompt onConfirm={(dataUrl) => { modal.cb(dataUrl); close(); }} onCancel={cancel} />;
  } else if (modal?.kind === 'image') {
    body = <ImagePrompt onConfirm={(dataUrl) => { modal.cb(dataUrl); close(); }} onCancel={cancel} />;
  } else if (modal?.kind === 'field-name' && modal.fieldKind) {
    body = (
      <FieldNamePrompt
        fieldKind={modal.fieldKind}
        onConfirm={(data) => { modal.cb(data); close(); }}
        onCancel={cancel}
      />
    );
  }

  const modalNode = modal ? (
    <div className="v2-modal" role="dialog" onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      {body}
    </div>
  ) : null;

  return { prompts, modalNode };
}

function HyperlinkPrompt({
  onConfirm,
  onCancel,
}: {
  onConfirm: (data: { url: string; label: string }) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState('https://');
  const [label, setLabel] = useState('Link');
  return (
    <div className="v2-modal__inner">
      <h3>Add hyperlink</h3>
      <TkxInput label="Label" type="text" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
      <TkxInput label="URL" type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
      <div className="v2-modal__actions">
        <TkxButton variant="ghost" size="sm" type="button" className="v2-modal__btn" onClick={onCancel}>Cancel</TkxButton>
        <TkxButton variant="ghost" size="sm" type="button" className="v2-modal__btn v2-modal__btn--primary"
          onClick={() => onConfirm({ url, label })} disabled={!url || !label}>
          Add link
        </TkxButton>
      </div>
    </div>
  );
}

function SignaturePrompt({
  onConfirm,
  onCancel,
}: {
  onConfirm: (dataUrl: string) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  const onDown = (e: MouseEvent<HTMLCanvasElement>) => {
    drawingRef.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    const ctx = e.currentTarget.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };
  const onMove = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ctx = e.currentTarget.getContext('2d')!;
    ctx.strokeStyle = '#1f2933';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };
  const onUp = () => { drawingRef.current = false; };

  const clear = () => {
    const c = canvasRef.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
  };
  const confirm = () => onConfirm(canvasRef.current!.toDataURL('image/png'));

  return (
    <div className="v2-modal__inner">
      <h3>Draw your signature</h3>
      <canvas
        ref={canvasRef}
        width={420}
        height={140}
        style={{ background: '#fafbfc', border: '1px solid #e4e7eb', borderRadius: 4, cursor: 'crosshair' }}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
      />
      <div className="v2-modal__actions">
        <TkxButton variant="ghost" size="sm" type="button" className="v2-modal__btn" onClick={clear}>Clear</TkxButton>
        <TkxButton variant="ghost" size="sm" type="button" className="v2-modal__btn" onClick={onCancel}>Cancel</TkxButton>
        <TkxButton variant="ghost" size="sm" type="button" className="v2-modal__btn v2-modal__btn--primary" onClick={confirm}>
          Use signature
        </TkxButton>
      </div>
    </div>
  );
}

function ImagePrompt({
  onConfirm,
  onCancel,
}: {
  onConfirm: (dataUrl: string) => void;
  onCancel: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setPreview(String(r.result));
    r.readAsDataURL(f);
  };
  return (
    <div className="v2-modal__inner">
      <h3>Pick an image</h3>
      <input type="file" accept="image/*" onChange={onFile} />
      {preview && <img src={preview} alt="" style={{ maxWidth: 320, maxHeight: 180, marginTop: 12 }} />}
      <div className="v2-modal__actions">
        <TkxButton variant="ghost" size="sm" type="button" className="v2-modal__btn" onClick={onCancel}>Cancel</TkxButton>
        <TkxButton variant="ghost" size="sm" type="button" className="v2-modal__btn v2-modal__btn--primary"
          onClick={() => preview && onConfirm(preview)} disabled={!preview}>
          Place image
        </TkxButton>
      </div>
    </div>
  );
}

function FieldNamePrompt({
  fieldKind,
  onConfirm,
  onCancel,
}: {
  fieldKind: NewFieldKind;
  onConfirm: (data: { name: string; options?: string[] }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [opts, setOpts] = useState('Option 1\nOption 2\nOption 3');
  const needsOpts = fieldKind === 'dropdown';
  const submit = () => {
    if (!name.trim()) return;
    const options = needsOpts
      ? opts.split('\n').map((s) => s.trim()).filter(Boolean)
      : undefined;
    onConfirm({ name: name.trim(), options });
  };
  return (
    <div className="v2-modal__inner">
      <h3>New {fieldKind} field</h3>
      <label>Field name
        <input
          type="text"
          autoFocus
          value={name}
          placeholder={`my_${fieldKind}_field`}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !needsOpts) submit(); }}
        />
      </label>
      {needsOpts && (
        <label>Options (one per line)
          <textarea
            rows={5}
            value={opts}
            onChange={(e) => setOpts(e.target.value)}
            style={{ font: '13px ui-monospace, SFMono-Regular, Menlo, monospace' }}
          />
        </label>
      )}
      <div className="v2-modal__actions">
        <TkxButton variant="ghost" size="sm" type="button" className="v2-modal__btn" onClick={onCancel}>Cancel</TkxButton>
        <TkxButton variant="ghost" size="sm" type="button" className="v2-modal__btn v2-modal__btn--primary"
          onClick={submit} disabled={!name.trim()}>
          Place field
        </TkxButton>
      </div>
    </div>
  );
}

/**
 * Inline popover for editing properties of an already-placed `new-field`
 * annotation. Mounts as a fixed-position panel anchored near the field;
 * click-away or Esc dismisses. Mutations call onPatch with a partial
 * Annotation patch so the parent annotation array stays the source of truth.
 *
 * Type-specific controls:
 *   - text / multiline / date / signature: name, required, readonly, default, maxLength (text only)
 *   - checkbox: name, required, readonly, default (boolean)
 *   - dropdown: name, required, readonly, default, options[]
 */
function FieldPropsPopover({
  annotation: a,
  onPatch,
  onClose,
}: {
  annotation: Annotation & { kind: 'new-field' };
  onPatch: (patch: Partial<Annotation>) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onClick = (e: globalThis.MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    // Defer the click listener so the click that opened us doesn't immediately close.
    const t = window.setTimeout(() => window.addEventListener('mousedown', onClick), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
      window.clearTimeout(t);
    };
  }, [onClose]);

  const isText = a.fieldType === 'text' || a.fieldType === 'multiline';
  const isDropdown = a.fieldType === 'dropdown';
  const isCheckbox = a.fieldType === 'checkbox';

  return (
    <div
      ref={panelRef}
      className="v2-field-props"
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        marginTop: 6,
        background: '#fff',
        border: '1px solid #cdd5e0',
        borderRadius: 8,
        padding: 12,
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.12)',
        minWidth: 240,
        zIndex: 50,
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong style={{ textTransform: 'uppercase', fontSize: 10, color: '#52606d', letterSpacing: 0.5 }}>
          {a.fieldType} field
        </strong>
        <TkxButton variant="ghost" size="sm"
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#52606d', fontSize: 14 }}
        >×</TkxButton>
      </div>

      <label style={rowStyle}>
        <span style={labelStyle}>Name</span>
        <input
          type="text"
          value={a.fieldName}
          onChange={(e) => onPatch({ fieldName: e.target.value } as Partial<Annotation>)}
          style={inputStyle}
        />
      </label>

      {isCheckbox ? (
        <label style={rowStyle}>
          <span style={labelStyle}>Default</span>
          <input
            type="checkbox"
            checked={a.defaultValue === true}
            onChange={(e) => onPatch({ defaultValue: e.target.checked } as Partial<Annotation>)}
          />
        </label>
      ) : (
        <label style={rowStyle}>
          <span style={labelStyle}>Default value</span>
          <input
            type="text"
            value={typeof a.defaultValue === 'string' ? a.defaultValue : ''}
            onChange={(e) => onPatch({ defaultValue: e.target.value } as Partial<Annotation>)}
            style={inputStyle}
          />
        </label>
      )}

      {isText && (
        <label style={rowStyle}>
          <span style={labelStyle}>Max length</span>
          <input
            type="number"
            min={0}
            value={(a as { maxLength?: number }).maxLength ?? ''}
            onChange={(e) => {
              const n = Number(e.target.value);
              onPatch({ maxLength: n > 0 ? n : undefined } as Partial<Annotation>);
            }}
            style={{ ...inputStyle, width: 80 }}
          />
        </label>
      )}

      {isDropdown && (
        <label style={{ ...rowStyle, alignItems: 'flex-start' }}>
          <span style={labelStyle}>Options</span>
          <textarea
            rows={4}
            value={(a.options ?? []).join('\n')}
            onChange={(e) => onPatch({
              options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
            } as Partial<Annotation>)}
            style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace' }}
          />
        </label>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!(a as { required?: boolean }).required}
            onChange={(e) => onPatch({ required: e.target.checked } as Partial<Annotation>)}
          />
          Required
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!(a as { readOnly?: boolean }).readOnly}
            onChange={(e) => onPatch({ readOnly: e.target.checked } as Partial<Annotation>)}
          />
          Read-only
        </label>
      </div>
    </div>
  );
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 6,
};

const labelStyle: CSSProperties = {
  width: 90,
  color: '#52606d',
  fontSize: 11,
};

const inputStyle: CSSProperties = {
  flex: 1,
  padding: '4px 6px',
  border: '1px solid #cdd5e0',
  borderRadius: 4,
  fontSize: 12,
  fontFamily: 'inherit',
};
