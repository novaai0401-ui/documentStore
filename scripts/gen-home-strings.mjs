// One-off generator: merges the translation-workflow output into homeStrings.ts.
// Usage: node scripts/gen-home-strings.mjs <workflow-output.json>
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const EN = {
  h_design_new: '…or design something new',
  h_recent: 'Recent documents',
  h_my_templates: 'My templates',
  h_start_template: '…or start from a template',
  c_blank_design: 'Blank design', cd_blank_design: 'Start from an empty canvas',
  c_invitation: 'Make an invitation', cd_invitation: 'Birthday, wedding, party & more',
  c_compress: 'Compress files', cd_compress: 'Shrink images & PDFs, privately',
  c_convert: 'Convert images', cd_convert: 'HEIC→JPG, PNG, WebP, AVIF, PDF',
  c_scan: 'Scan document', cd_scan: 'Camera → clean multi-page PDF',
  c_record: 'Record screen', cd_record: 'Screen or camera → video',
  c_video: 'Video Studio', cd_video: 'Trim · GIF · audio · compress',
  c_watermark: 'Watermark', cd_watermark: 'Stamp PDFs & images, batch',
  c_collage: 'Photo collage', cd_collage: 'Grid your photos into one image',
  c_meme: 'Meme maker', cd_meme: 'Caption any image, top & bottom',
  c_form: 'PDF form builder', cd_form: 'Add fillable fields to a PDF',
  c_protect: 'Protect PDF', cd_protect: 'Add or remove a password',
  tpl_design_label: 'Design template', tpl_anim_label: 'Animated template',
  'st_social-quote': 'Quote Post', 'st_social-promo': 'Sale Promo', 'st_poster-event': 'Event Poster',
  'st_business-card': 'Business Card', 'st_webinar-story': 'Webinar Story', 'st_thank-you': 'Thank You',
  'st_discount-coupon': 'Coupon', 'st_social-promo-flash': 'Flash Sale (animated)',
  'st_social-promo-arrival': 'New Arrival', 'st_social-promo-bogo': 'BOGO Promo (animated)',
  'st_social-quote-bold': 'Quote — Bold (animated)', 'st_social-quote-serif': 'Quote — Serif',
  'st_coupon-ticket': 'Coupon — Ticket (animated)', 'st_coupon-free-ship': 'Coupon — Free Shipping',
  'st_invite-birthday': 'Birthday Invite (animated)', 'st_invite-wedding': 'Wedding Invite',
  'dt_blank-md': 'Blank Markdown', 'dtd_blank-md': 'An empty Markdown document.',
  'dt_blank-doc': 'Blank document', 'dtd_blank-doc': 'An empty Word document.',
  'dt_blank-sheet': 'Blank spreadsheet', 'dtd_blank-sheet': 'An empty grid.',
  'dt_blank-deck': 'Blank deck', 'dtd_blank-deck': 'A single empty slide.',
  dt_readme: 'Project README', dtd_readme: 'A README with the usual sections.',
  'dt_meeting-notes': 'Meeting notes', 'dtd_meeting-notes': 'Agenda, discussion, and action items.',
  'dt_business-letter': 'Business letter', 'dtd_business-letter': 'A formal letter layout.',
  dt_report: 'Project report', dtd_report: 'Headed report with summary and sections.',
  'dt_invoice-sheet': 'Invoice', 'dtd_invoice-sheet': 'An itemized invoice with totals.',
  dt_budget: 'Monthly budget', dtd_budget: 'Income vs. expenses tracker.',
  'dt_pitch-deck': 'Pitch deck', 'dtd_pitch-deck': 'A classic 10-slide startup pitch.',
  'dt_kickoff-deck': 'Project kickoff', 'dtd_kickoff-deck': 'Align a team at project start.',
  'dt_sales-deck': 'Sales deck', 'dtd_sales-deck': 'Pitch a product to a prospect.',
  'dt_webinar-deck': 'Webinar / training', 'dtd_webinar-deck': 'Teach a topic in a session.',
  'dt_qbr-deck': 'Quarterly review', 'dtd_qbr-deck': 'Report results to stakeholders.',
  'dt_marketing-deck': 'Marketing plan', 'dtd_marketing-deck': 'Lay out a campaign plan.',
  'dt_allhands-deck': 'Company all-hands', 'dtd_allhands-deck': 'Update the whole company.',
};

const ORDER = ['en', 'hi', 'bn', 'te', 'mr', 'ta', 'gu', 'ur', 'es', 'fr', 'de', 'pt', 'zh', 'ar', 'ru', 'ja', 'id'];
const KEYS = Object.keys(EN);

// Decode the few HTML entities the translators occasionally emitted, so values
// render as real characters (e.g. "&amp;" → "&") in the UI.
const decode = (s) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');

const out = JSON.parse(await readFile(resolve(process.argv[2]), 'utf8'));
const langs = out.result?.langs ?? out.langs;
const byLang = { en: EN };
for (const { code, map } of langs) byLang[code] = map;
// Optional manual overrides/fixes (e.g. a language the workflow returned partial).
try {
  const ov = JSON.parse(await readFile(resolve('scripts/home-overrides.json'), 'utf8'));
  for (const [code, map] of Object.entries(ov)) byLang[code] = { ...byLang[code], ...map };
} catch { /* no overrides */ }

// Validate completeness.
const problems = [];
for (const code of ORDER) {
  if (code === 'en') continue;
  const m = byLang[code];
  if (!m) { problems.push(`missing language: ${code}`); continue; }
  for (const k of KEYS) if (typeof m[k] !== 'string' || !m[k].trim()) problems.push(`${code} missing key ${k}`);
}
if (problems.length) { console.error('TRANSLATION GAPS:\n' + problems.join('\n')); process.exit(1); }

const lines = [];
lines.push('/**');
lines.push(' * Translations for the home/launcher grid (section headings, quick-start tool');
lines.push(' * cards, and design/document template names + descriptions). Keyed by stable ids');
lines.push(' * and looked up via i18n.tx() with an English fallback. Template keys use the');
lines.push(" * template id: 'st_<studioId>' for design templates and 'dt_<docId>' / 'dtd_<docId>'");
lines.push(' * for document template name / description.');
lines.push(' *');
lines.push(' * AUTO-GENERATED by scripts/gen-home-strings.mjs — en is the source of truth.');
lines.push(' */');
lines.push("import type { Lang } from './i18n.js';");
lines.push('');
lines.push('export const HOME_STRINGS: Record<string, Partial<Record<Lang, string>>> = {');
for (const k of KEYS) {
  const parts = ORDER.map((code) => `${code}: ${JSON.stringify(decode(byLang[code][k]))}`);
  const keyText = /^[a-zA-Z_$][\w$]*$/.test(k) ? k : `'${k}'`;
  lines.push(`  ${keyText}: { ${parts.join(', ')} },`);
}
lines.push('};');
lines.push('');

await writeFile(resolve('apps/demo-react/src/homeStrings.ts'), lines.join('\n'), 'utf8');
console.log(`Wrote homeStrings.ts: ${KEYS.length} keys × ${ORDER.length} languages.`);
