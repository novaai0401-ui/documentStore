/**
 * HTML sanitizer — defends the two places untrusted HTML reaches the DOM: the
 * HTML-file preview and pasted content in the Word editor (and, with
 * collaboration, anything a peer sends). At runtime it rebuilds the markup with
 * the browser's own parser, keeping only an allowlist of tags and attributes and
 * validating every URL and inline style; scripts, event handlers, and
 * javascript:/data:text URLs are dropped. In a non-DOM environment (SSR/tests)
 * it falls back to escaping everything, which is always safe.
 *
 * Built in-house on the platform's trusted DOMParser — no sanitizer dependency.
 */
export const ALLOWED_TAGS = new Set([
  'a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ins', 'mark', 'small', 'sub', 'sup',
  'p', 'br', 'hr', 'span', 'div', 'blockquote', 'pre', 'code',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'img',
]);

/** Dropped entirely, content and all. */
export const FORBIDDEN_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'input', 'noscript', 'svg', 'math']);

const GLOBAL_ATTR = new Set(['title', 'align']);
const TAG_ATTR: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan']),
};
const SAFE_STYLE_PROPS = new Set(['color', 'background-color', 'background', 'text-align', 'font-weight', 'font-style', 'text-decoration', 'font-size']);

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Return a safe URL, or null if it must be blocked. */
export function safeUrl(raw: string): string | null {
  const u = raw.trim();
  if (u === '') return null;
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(u)) return u; // inline images only
  // Anything carrying a scheme we didn't allow is blocked (javascript:,
  // vbscript:, data:text/html, …). A scheme is the part before the first ':'
  // that comes before any '/', '?' or '#'.
  const beforeSlash = u.split(/[/?#]/, 1)[0] ?? '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) && beforeSlash.includes(':')) return null;
  return u; // relative path, anchor, or query — safe
}

/** Keep only allowlisted declarations with values free of url()/expressions. */
export function sanitizeStyle(style: string): string {
  return style.split(';').map((d) => {
    const i = d.indexOf(':');
    if (i < 0) return '';
    const prop = d.slice(0, i).trim().toLowerCase();
    const val = d.slice(i + 1).trim();
    if (!SAFE_STYLE_PROPS.has(prop)) return '';
    if (/url\(|expression|javascript:|[<>]/i.test(val)) return '';
    return `${prop}: ${val}`;
  }).filter(Boolean).join('; ');
}

function applyAttrs(src: Element, dst: Element, tag: string): void {
  const allowed = TAG_ATTR[tag];
  for (const attr of Array.from(src.attributes)) {
    const name = attr.name.toLowerCase();
    if (name.startsWith('on')) continue; // event handlers — never
    const value = attr.value;
    if (name === 'style') { const s = sanitizeStyle(value); if (s) dst.setAttribute('style', s); continue; }
    if (name === 'href' || name === 'src') { const u = safeUrl(value); if (u) dst.setAttribute(name, u); continue; }
    if (GLOBAL_ATTR.has(name) || allowed?.has(name)) dst.setAttribute(name, value);
  }
  if (tag === 'a' && dst.getAttribute('href')) { dst.setAttribute('rel', 'noopener noreferrer nofollow'); }
}

function sanitizeChildren(src: Node, doc: Document): Node[] {
  const out: Node[] = [];
  src.childNodes.forEach((child) => {
    if (child.nodeType === 3) { out.push(doc.createTextNode(child.textContent ?? '')); return; } // text
    if (child.nodeType !== 1) return; // drop comments / others
    const el = child as Element;
    const tag = el.tagName.toLowerCase();
    if (FORBIDDEN_TAGS.has(tag)) return; // drop element and its content
    const kids = sanitizeChildren(el, doc);
    if (!ALLOWED_TAGS.has(tag)) { out.push(...kids); return; } // unwrap unknown tag, keep its text
    const clean = doc.createElement(tag);
    applyAttrs(el, clean, tag);
    kids.forEach((k) => clean.appendChild(k));
    out.push(clean);
  });
  return out;
}

export function sanitizeHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return escapeHtml(html); // safe everywhere there's no DOM
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const container = doc.createElement('div');
  for (const node of sanitizeChildren(doc.body, doc)) container.appendChild(node);
  return container.innerHTML;
}
