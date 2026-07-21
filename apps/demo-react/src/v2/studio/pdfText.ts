/**
 * Best-effort plain-text extraction from a PDF, used to pre-fill the résumé
 * builder. Lazily loads pdf.js (kept out of the main bundle) and configures its
 * worker via Vite's ?url import. Returns '' on any failure so callers can fall
 * back to "paste your text instead".
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  try {
    const pdfjs = await import('pdfjs-dist');
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    let out = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let line = '';
      for (const item of content.items) {
        if ('str' in item) {
          line += item.str;
          if (item.hasEOL) { out += line + '\n'; line = ''; }
          else line += ' ';
        }
      }
      out += line + '\n';
    }
    return out;
  } catch {
    return '';
  }
}
