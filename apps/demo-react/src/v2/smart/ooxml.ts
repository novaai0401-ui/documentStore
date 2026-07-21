/**
 * OOXML package validator — our own integrity checker for the .docx / .xlsx /
 * .pptx files we generate. The overwhelming cause of "the file won't open" is
 * structural, not schema: a relationship pointing at a missing part, or a part
 * with no declared content type. This catches exactly those, plus basic XML
 * well-formedness, so we can gate every generated Office file in tests.
 *
 * Pure: takes the already-unzipped parts (name → bytes). No dependencies.
 */

export interface OoxmlIssue { part: string; message: string }
export interface OoxmlReport { ok: boolean; issues: OoxmlIssue[] }

const dec = new TextDecoder();

/** Resolve an OOXML relationship Target against the part's directory. */
export function resolvePart(baseDir: string, target: string): string {
  const segs = (baseDir ? baseDir.split('/') : []).filter(Boolean);
  for (const seg of target.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') segs.pop();
    else segs.push(seg);
  }
  return segs.join('/');
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`${name}="([^"]*)"`, 'i').exec(tag);
  return m ? m[1]! : null;
}

/** A cheap-but-real XML well-formedness check: every start tag has a matching end. */
export function isWellFormedXml(xml: string): boolean {
  const stack: string[] = [];
  const re = /<([/!?]?)([a-zA-Z][\w:.-]*)([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const [, lead, name, rest, selfClose] = m;
    if (lead === '!' || lead === '?') continue; // <!-- --> / <?xml ?>
    if (lead === '/') { if (stack.pop() !== name) return false; }
    else if (!selfClose && !rest!.endsWith('/')) stack.push(name!);
  }
  return stack.length === 0;
}

export function validatePackage(files: Record<string, Uint8Array>): OoxmlReport {
  const issues: OoxmlIssue[] = [];
  const names = Object.keys(files);
  const has = (p: string) => Object.prototype.hasOwnProperty.call(files, p);
  const text = (p: string) => dec.decode(files[p]!);

  // 1) Required package parts.
  if (!has('[Content_Types].xml')) issues.push({ part: '[Content_Types].xml', message: 'missing' });
  if (!has('_rels/.rels')) issues.push({ part: '_rels/.rels', message: 'missing root relationships' });

  // 2) Content types: every non-rels part must be covered by a Default (by
  //    extension) or an Override (by exact part name).
  const defaults = new Set<string>();
  const overrides = new Set<string>();
  if (has('[Content_Types].xml')) {
    const ct = text('[Content_Types].xml');
    if (!isWellFormedXml(ct)) issues.push({ part: '[Content_Types].xml', message: 'not well-formed XML' });
    for (const m of ct.matchAll(/<Default\b[^>]*>/gi)) { const e = attr(m[0], 'Extension'); if (e) defaults.add(e.toLowerCase()); }
    for (const m of ct.matchAll(/<Override\b[^>]*>/gi)) { const p = attr(m[0], 'PartName'); if (p) overrides.add(p.replace(/^\//, '')); }
  }
  for (const name of names) {
    if (name === '[Content_Types].xml' || name.includes('/_rels/') || name.endsWith('.rels')) continue;
    const ext = (name.split('.').pop() ?? '').toLowerCase();
    if (!overrides.has(name) && !defaults.has(ext)) issues.push({ part: name, message: `no content type (extension "${ext}")` });
  }

  // 3) Every relationship Target (Internal) must resolve to an existing part,
  //    and every .xml/.rels part must be well-formed.
  for (const name of names) {
    if (name.endsWith('.xml') || name.endsWith('.rels')) {
      if (!isWellFormedXml(text(name))) issues.push({ part: name, message: 'not well-formed XML' });
    }
    if (!name.endsWith('.rels')) continue;
    // A rels at "<dir>/_rels/<file>.rels" resolves targets relative to "<dir>"
    // ("<file>" may be empty, e.g. the root package rels "_rels/.rels").
    const baseDir = name.replace(/(?:^|\/)_rels\/[^/]*\.rels$/, '');
    for (const rel of text(name).matchAll(/<Relationship\b[^>]*>/gi)) {
      if (/TargetMode="External"/i.test(rel[0])) continue;
      const target = attr(rel[0], 'Target');
      if (!target) continue;
      const resolved = resolvePart(baseDir, target);
      if (!has(resolved)) issues.push({ part: name, message: `dangling relationship → ${target} (${resolved})` });
    }
  }

  return { ok: issues.length === 0, issues };
}
