import { TkxButton } from 'tekivex-ui';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function HelpDrawer({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="v2-help">
      <div className="v2-help__header">
        <h2>Help &amp; Theming</h2>
        <TkxButton variant="ghost" size="sm" onClick={onClose} aria-label="Close help">
          ×
        </TkxButton>
      </div>

      <section>
        <h3>Quick start</h3>
        <p>Drop any PDF with form fields onto the page. Switch modes with the top-right control.</p>
      </section>

      <section>
        <h3>Using your own UI library</h3>
        <p>
          Mode 2 renders the form via a <code>UIAdapter</code>. Implement nine methods to use Material UI, Chakra,
          shadcn, tekivex-ui — or write a one-file adapter using your own components.
        </p>
        <pre>
          <code>{`interface UIAdapter {
  Text:        (p: FieldProps<string>)  => ReactNode;
  Multiline:   (p: FieldProps<string>)  => ReactNode;
  Number:      (p: FieldProps<string>)  => ReactNode;
  Date:        (p: FieldProps<string>)  => ReactNode;
  Check:       (p: FieldProps<boolean>) => ReactNode;
  Radio:       (p: SelectFieldProps)    => ReactNode;
  Select:      (p: SelectFieldProps)    => ReactNode;
  MultiSelect: (p: MultiSelectFieldProps)=> ReactNode;
  Button:      (p: ButtonProps)         => ReactNode;
}`}</code>
        </pre>
        <p>
          Reference implementation:{' '}
          <code>packages/pdf-ui-adapter-html/src/index.tsx</code> (~100 lines, zero deps).
        </p>
        <p>
          Tekivex preset: <code>@pdfcraft/ui-adapter-tekivex</code> — install <code>tekivex-ui</code> as a peer dep.
        </p>
      </section>

      <section>
        <h3>Pick your mode</h3>
        <ul>
          <li>
            <strong>Inline</strong> — pdfguru-style. Edit fields directly on the rendered PDF.
          </li>
          <li>
            <strong>Dynamic Form</strong> — PDF preview + auto-generated form. Use any UI library.
          </li>
        </ul>
      </section>
    </div>
  );
}
