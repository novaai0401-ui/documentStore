/**
 * Smart signature placement.
 *
 * Scans the document for signature/date cues ("Signature", "Sign here",
 * "Date", a row of underscores, an "X____" line) and proposes fillable
 * fields positioned next to them — a signature widget by a signature cue, a
 * date field by a date cue. The user reviews the suggestions and drops them
 * onto the page as draggable new-field annotations (same path as the AI
 * field-detector), then signs/saves.
 */
import type { NewFieldKind } from '../Annotations.js';
import type { PageRuns } from './util.js';

export interface SignatureSuggestion {
  page: number;
  fieldType: NewFieldKind;
  name: string;
  /** Placement box in scale-1 space. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The cue text we matched, for the review list. */
  cue: string;
}

const SIG_CUE = /\b(sign(?:ature)?|signed|authoriz(?:ed|ation)|sign\s*here)\b/i;
const DATE_CUE = /\b(date[ds]?|dated)\b/i;
const LINE_CUE = /^[_—\-\sx]{5,}$/i; // underscores / dashes, optional leading X

export function suggestSignatureFields(pages: PageRuns[]): SignatureSuggestion[] {
  const out: SignatureSuggestion[] = [];
  let seq = 0;
  for (const page of pages) {
    for (const run of page.runs) {
      const text = run.text.trim();
      if (!text) continue;
      // Place the widget just to the right of the cue, on the same baseline.
      const right = run.x + run.width + 8;
      const room = Math.max(120, page.vpWidth - right - 24);

      if (SIG_CUE.test(text) && text.length <= 40) {
        out.push({
          page: page.page,
          fieldType: 'signature',
          name: `Signature_${++seq}`,
          x: right,
          y: run.y - 6,
          width: Math.min(220, room),
          height: Math.max(28, run.height + 12),
          cue: text,
        });
      } else if (DATE_CUE.test(text) && text.length <= 24) {
        out.push({
          page: page.page,
          fieldType: 'date',
          name: `Date_${++seq}`,
          x: right,
          y: run.y - 4,
          width: Math.min(140, room),
          height: Math.max(24, run.height + 8),
          cue: text,
        });
      } else if (LINE_CUE.test(text) && run.width > page.vpWidth * 0.15) {
        // A bare signature line — drop a signature field on top of it.
        out.push({
          page: page.page,
          fieldType: 'signature',
          name: `Signature_${++seq}`,
          x: run.x,
          y: run.y - run.height,
          width: Math.min(run.width, 260),
          height: Math.max(28, run.height + 12),
          cue: text.slice(0, 20) + '…',
        });
      }
    }
  }
  return out;
}
