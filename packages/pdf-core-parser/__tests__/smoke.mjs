// Stand-alone smoke test: generate a small AcroForm PDF with pdf-lib,
// parse it through @pdf-core/parser, and check the fields came out right.
// Run with: node packages/pdf-core-parser/__tests__/smoke.mjs

import { PDFDocument, StandardFonts } from 'pdf-lib';
import { PdfDocument, extractFormFields, saveFieldValues } from '../dist/index.js';

async function makeFixture() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 500]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('Form 15G test', { x: 50, y: 450, size: 18, font });
  page.drawText('Name:', { x: 50, y: 400, size: 12, font });
  page.drawText('PAN:', { x: 50, y: 360, size: 12, font });
  page.drawText('Country:', { x: 50, y: 320, size: 12, font });
  page.drawText('Hobbies:', { x: 50, y: 260, size: 12, font });
  page.drawText('Accept:', { x: 50, y: 180, size: 12, font });
  const form = pdf.getForm();
  const nm = form.createTextField('name');
  nm.setText('Jane Doe');
  nm.addToPage(page, { x: 140, y: 390, width: 280, height: 22 });
  const pan = form.createTextField('pan');
  pan.setText('ABCDE1234F');
  pan.addToPage(page, { x: 140, y: 350, width: 280, height: 22 });
  const country = form.createDropdown('country');
  country.addOptions(['India', 'United Kingdom', 'United States']);
  country.select('India');
  country.addToPage(page, { x: 140, y: 310, width: 280, height: 22 });
  const hobbies = form.createOptionList('hobbies');
  hobbies.addOptions(['Reading', 'Cycling', 'Cooking']);
  hobbies.select(['Reading']);
  hobbies.addToPage(page, { x: 140, y: 240, width: 280, height: 60 });
  const accept = form.createCheckBox('accept');
  accept.check();
  accept.addToPage(page, { x: 140, y: 175, width: 16, height: 16 });
  return pdf.save();
}

const bytes = await makeFixture();
console.log('fixture size:', bytes.length, 'bytes');

const doc = await PdfDocument.load(bytes);
console.log('catalog root ref:', doc.root);

const fields = await extractFormFields(doc);
console.log('\nfields:');
for (const f of fields) {
  console.log(' -', f.id, 'type=' + f.type, 'page=' + f.page, 'value=' + JSON.stringify(f.value), 'rect=' + JSON.stringify(f.rect));
}

const expected = [
  { id: 'name', type: 'text', value: 'Jane Doe' },
  { id: 'pan', type: 'text', value: 'ABCDE1234F' },
  { id: 'country', type: 'dropdown', value: 'India' },
  { id: 'hobbies', type: 'listbox', value: ['Reading'] },
  { id: 'accept', type: 'checkbox', value: true },
];

let ok = true;
function eq(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}
for (const e of expected) {
  const f = fields.find((x) => x.id === e.id);
  if (!f) { console.error('MISSING field', e.id); ok = false; continue; }
  if (f.type !== e.type) { console.error('TYPE mismatch', e.id, f.type, 'expected', e.type); ok = false; }
  if (!eq(f.value, e.value)) { console.error('VALUE mismatch', e.id, JSON.stringify(f.value), 'expected', JSON.stringify(e.value)); ok = false; }
}
if (!ok) process.exit(1);
console.log('\nREAD OK');

// ───────────────────────── round-trip write test ─────────────────────────
console.log('\n--- writing new values via saveFieldValues ---');
const updated = await saveFieldValues(doc, fields, {
  name: 'Updated Name',
  pan: 'XYZAB9876C',
  country: 'United Kingdom',
  hobbies: ['Cycling', 'Cooking'],
  accept: false,
});
console.log('updated size:', updated.length, 'bytes');

// Re-parse the updated bytes and verify the changes stuck.
const doc2 = await PdfDocument.load(updated);
const fields2 = await extractFormFields(doc2);
console.log('\nfields after round-trip:');
for (const f of fields2) {
  console.log(' -', f.id, 'value=' + JSON.stringify(f.value));
}

const expected2 = [
  { id: 'name', value: 'Updated Name' },
  { id: 'pan', value: 'XYZAB9876C' },
  { id: 'country', value: 'United Kingdom' },
  { id: 'hobbies', value: ['Cycling', 'Cooking'] },
  { id: 'accept', value: false },
];
let ok2 = true;
for (const e of expected2) {
  const f = fields2.find((x) => x.id === e.id);
  if (!f) { console.error('MISSING field', e.id); ok2 = false; continue; }
  if (!eq(f.value, e.value)) {
    console.error('VALUE mismatch', e.id, JSON.stringify(f.value), 'expected', JSON.stringify(e.value));
    ok2 = false;
  }
}
if (!ok2) process.exit(1);
console.log('\nROUND-TRIP OK');
console.log('\nALL OK');
