/**
 * PowerPoint fidelity patch — when a user opens their OWN .pptx, we keep the
 * original file and, on save, change ONLY the text they edited, leaving every
 * shape, image, colour, layout, master and theme exactly as it was. This is the
 * difference between "open & re-save doesn't wreck my deck" and rebuilding a
 * generic deck from scratch (pagesToPptx). Pure-ish (async only to lazy-load
 * fflate); the slide model is the same {title, body} the reader produces, so
 * paragraph k in [title, ...body] maps to the k-th non-empty <a:p> in the slide.
 */

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const encode = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const slideNo = (n: string) => Number(/slide(\d+)\.xml$/.exec(n)?.[1] ?? 0);

export interface SlideText { title: string; body: string[] }

/**
 * Replace the text of each non-empty paragraph in a slide's XML with the supplied
 * strings, in order. The first run of a paragraph takes the new text (keeping its
 * formatting); any further runs in that paragraph are emptied so text isn't
 * duplicated. Paragraphs with no replacement (more in the file than in the model)
 * are left untouched. Everything else in the XML is preserved verbatim.
 */
export function patchSlideXml(xml: string, newTexts: string[]): string {
  let k = 0;
  return xml.replace(/<a:p\b[^>]*>[\s\S]*?<\/a:p>/g, (para) => {
    const joined = [...para.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((t) => decode(t[1]!)).join('').trim();
    if (!joined) return para;                 // empty paragraph — leave as-is
    const idx = k++;
    if (idx >= newTexts.length) return para;  // no replacement available
    const nt = encode(newTexts[idx] ?? '');
    let first = true;
    return para.replace(/<a:t>[\s\S]*?<\/a:t>/g, () => (first ? ((first = false), `<a:t>${nt}</a:t>`) : '<a:t></a:t>'));
  });
}

/**
 * Re-emit the original .pptx with only the slide text changed to match `slides`.
 * Slides that exist in the original but not the model are left untouched; model
 * slides beyond the original's count are ignored here (the caller appends those
 * via the generic writer if needed). Returns new bytes; the input isn't mutated.
 */
export async function patchPptxText(original: Uint8Array, slides: SlideText[]): Promise<Uint8Array> {
  const { unzipSync, zipSync, strToU8, strFromU8 } = await import('fflate');
  const files = unzipSync(original);
  const slideFiles = Object.keys(files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNo(a) - slideNo(b));
  slideFiles.forEach((n, i) => {
    if (i >= slides.length) return;
    files[n] = strToU8(patchSlideXml(strFromU8(files[n]!), [slides[i]!.title, ...slides[i]!.body]));
  });
  return zipSync(files);
}

/** Whether the model still lines up 1:1 with the original (no slides added/removed). */
export function pptxCountsMatch(original: Uint8Array, slideCount: number): Promise<boolean> {
  return import('fflate').then(({ unzipSync }) => {
    const files = unzipSync(original);
    const n = Object.keys(files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).length;
    return n === slideCount;
  });
}
