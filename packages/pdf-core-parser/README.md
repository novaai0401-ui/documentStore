# @pdfcraft/parser

From-scratch PDF parser/writer. Zero third-party PDF dependencies.

## Scope

This package handles **AcroForm read + field-value write** — what you need for a form editor. It does NOT render PDFs (rendering stays on `pdf.js` for now). It does NOT handle every corner of the 1300-page PDF spec — only the subset needed for reading the catalog → AcroForm → fields tree, and producing incremental updates that change field values.

## Architecture

```
bytes
  └─ ByteReader            — cursor + ascii helpers + whitespace/comment skipping
     └─ parseObject        — null / bool / num / name / string / array / dict / ref / stream
        └─ readXref        — classic cross-reference table + trailer
           └─ resolveRef   — follow indirect references
              └─ inflate   — FlateDecode via browser-native DecompressionStream
                 └─ Form  — walk /Root → /AcroForm → /Fields
```

## Tracks

- **G1 (this commit)**: tokenizer + object parser
- G2: xref + indirect-object resolver + FlateDecode
- G3: AcroForm field extraction
- G4: incremental-update writer
- G5: wire into `@pdfcraft/engine`, drop `pdf-lib`
