/**
 * Typed PDF object model. PDF objects are a small, closed set —
 * everything you parse out of a PDF file is one of these.
 */

export type PdfObject =
  | { kind: 'null' }
  | { kind: 'bool'; value: boolean }
  | { kind: 'num'; value: number }
  | { kind: 'name'; value: string }
  | { kind: 'string'; value: Uint8Array; literal: boolean }
  | { kind: 'array'; items: PdfObject[] }
  | { kind: 'dict'; entries: Map<string, PdfObject> }
  | { kind: 'stream'; dict: Map<string, PdfObject>; raw: Uint8Array }
  | { kind: 'ref'; objectNumber: number; generation: number };

/** A parsed indirect-object header — "12 0 obj" through "endobj". */
export interface IndirectObject {
  objectNumber: number;
  generation: number;
  object: PdfObject;
}

export const PDF_NULL: PdfObject = { kind: 'null' };
