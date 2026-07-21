// Engine-level smoke. We can't run pdf.js's worker in Node, so the
// renderPage path is excluded from this test (verified in browser).
// What we DO test here is the form path that consumers actually exercise:
//   loadDocument → listFormFields → writeFormFields → saveDocument
//
// We bypass loadDocument's pdf.js init by manually constructing a handle
// around our parser doc + a stub pdf.js storage. Everything else in the
// engine's forms.ts runs against the real code.

import { PDFDocument } from 'pdf-lib';
import { listFormFields, writeFormFields, saveDocument } from '../dist/index.js';
import { PdfDocument, extractFormFields } from '../../pdf-core-parser/dist/index.js';

async function makeFixture() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 400]);
  const form = pdf.getForm();
  const name = form.createTextField('name');
  name.setText('Original Name');
  name.addToPage(page, { x: 100, y: 300, width: 300, height: 22 });
  const country = form.createDropdown('country');
  country.addOptions(['India', 'United States']);
  country.select('India');
  country.addToPage(page, { x: 100, y: 260, width: 300, height: 22 });
  const accept = form.createCheckBox('accept');
  accept.addToPage(page, { x: 100, y: 220, width: 16, height: 16 });
  return pdf.save();
}

const bytes = await makeFixture();
console.log('fixture size:', bytes.length, 'bytes');

const ownDoc = await PdfDocument.load(bytes.slice());
const fields = await extractFormFields(ownDoc);

// Hand-built handle that satisfies the engine's getInternalState contract.
const handle = {
  pageCount: 1,
  sourceBytes: bytes,
  _internal: {
    pdfjsDoc: {
      numPages: 1,
      annotationStorage: { getAll: () => ({}) },
      async getPage() {
        return { async getAnnotations() { return []; } };
      },
    },
    ownDoc,
    fields,
    pendingValues: {},
  },
};

// 1. listFormFields
const listed = await listFormFields(handle);
console.log('\nlistFormFields returned', listed.length, 'fields');
for (const f of listed) {
  console.log(' -', f.id, 'type=' + f.type, 'value=' + JSON.stringify(f.value));
  if ('objectNumber' in f) {
    console.error('FAIL: objectNumber leaked to engine API');
    process.exit(1);
  }
}

// 2. writeFormFields (buffers — nothing persists yet)
await writeFormFields(handle, {
  name: 'Engine-Updated Name',
  country: 'United States',
  accept: true,
});

// 3. saveDocument (flushes buffer + collectFormStorage merge)
const newBytes = await saveDocument(handle);
console.log('\nsaveDocument returned', newBytes.length, 'bytes (was', bytes.length, ')');
if (newBytes.length <= bytes.length) {
  console.error('FAIL: incremental update should have grown the file');
  process.exit(1);
}

// 4. Re-parse and verify
const doc2 = await PdfDocument.load(newBytes);
const fields2 = await extractFormFields(doc2);
console.log('\nfields after engine round-trip:');
for (const f of fields2) console.log(' -', f.id, 'value=' + JSON.stringify(f.value));

const expected = {
  name: 'Engine-Updated Name',
  country: 'United States',
  accept: true,
};
let ok = true;
for (const [id, want] of Object.entries(expected)) {
  const f = fields2.find((x) => x.id === id);
  if (!f) { console.error('MISSING', id); ok = false; continue; }
  if (f.value !== want) {
    console.error('MISMATCH', id, JSON.stringify(f.value), 'expected', JSON.stringify(want));
    ok = false;
  }
}
if (!ok) process.exit(1);
console.log('\nENGINE ROUND-TRIP OK');
