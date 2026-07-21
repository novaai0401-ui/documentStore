export interface PdfDocumentHandle {
  /** Number of pages in the document. */
  readonly pageCount: number;
  /** Original PDF bytes (immutable; edits live in a parallel pdf-lib doc). */
  readonly sourceBytes: Uint8Array;
  /** Opaque handle for engine-internal state. Do not mutate. */
  readonly _internal: unknown;
}

export interface RenderPageOptions {
  /** 1-based page index. */
  pageNumber: number;
  /** Render scale (1.0 = 72 DPI). */
  scale: number;
  /** Optional rotation in degrees: 0, 90, 180, 270. */
  rotation?: 0 | 90 | 180 | 270;
  /**
   * When true, render the page's AcroForm widgets as a separate DOM layer
   * (using pdf.js's AnnotationLayer). The returned `annotationLayerDiv` is
   * a positioned `<div>` to stack on top of the canvas. Form fields are
   * editable HTML inputs maintained by pdf.js itself.
   */
  withFormLayer?: boolean;
}

export interface RenderResult {
  /** The canvas the engine rendered into. */
  canvas: HTMLCanvasElement;
  /** Width in CSS pixels. */
  width: number;
  /** Height in CSS pixels. */
  height: number;
  /**
   * Present when `withFormLayer` was true. Stack absolutely-positioned on
   * top of the canvas to expose editable form widgets.
   */
  annotationLayerDiv?: HTMLDivElement;
}

export type FieldType =
  | 'text'
  | 'multiline'
  | 'checkbox'
  | 'radio'
  | 'dropdown'
  | 'listbox'
  | 'signature'
  | 'button';

export interface FormFieldDescriptor {
  /** Stable id (matches AcroForm field name). */
  id: string;
  /** Field type as classified from the AcroForm flags. */
  type: FieldType;
  /** Current value. `null` for unset. */
  value: string | boolean | string[] | null;
  /** Page number (1-based). */
  page: number;
  /** PDF-space rectangle: [x, y, width, height], origin bottom-left. */
  rect: [number, number, number, number];
  /** True if the PDF marks the field required. */
  required: boolean;
  /** Optional dropdown/listbox options. */
  options?: string[];
  /** True if the PDF marks the field read-only. */
  readOnly: boolean;
  /** /MaxLen — character limit for text fields. */
  maxLength?: number;
  /** True when /Ff bit 25 (Comb) + /MaxLen are both set — segmented input. */
  comb?: boolean;
  /** True when /Ff bit 14 (Password) is set — masked display. */
  password?: boolean;
  /** Human-readable label extracted from the page's rendered text near
   *  the widget rect (via pdf.js text content). Preferred over /TU and
   *  the beautified /T id when present. */
  pageLabel?: string;
}
