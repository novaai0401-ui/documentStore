/**
 * Password modal for encrypted PDFs. Mounted while the usePdfDocument
 * hook is in the `needs-password` state and dismissed when authentication
 * succeeds. Reuses the .v2-modal / .v2-modal__inner styles shared with
 * the stamp / hyperlink / sign prompts.
 */
import { useEffect, useRef, useState } from 'react';
import { TkxButton, TkxInput } from 'tekivex-ui';

interface PasswordPromptProps {
  open: boolean;
  /** True when a previous password attempt failed — adjusts the copy. */
  retry: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

export function PasswordPrompt({ open, retry, onSubmit, onCancel }: PasswordPromptProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setValue('');
      const id = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open]);

  if (!open) return null;

  return (
    <div className="v2-modal" role="dialog" aria-modal="true" aria-labelledby="pw-title">
      <div className="v2-modal__inner">
        <h3 id="pw-title">This PDF is password-protected</h3>
        <p style={{ margin: 0, color: '#52606d', fontSize: 13, lineHeight: 1.5 }}>
          {retry
            ? 'That password didn’t work. Try the user password or the owner password.'
            : 'Enter the password to open this file. It stays in your browser.'}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(value);
          }}
        >
          <TkxInput
            label="Password"
            ref={inputRef}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <div className="v2-modal__actions">
            <TkxButton variant="ghost" size="sm" type="button" className="v2-modal__btn" onClick={onCancel}>Cancel</TkxButton>
            <TkxButton variant="ghost" size="sm" type="submit" className="v2-modal__btn v2-modal__btn--primary">Unlock</TkxButton>
          </div>
        </form>
      </div>
    </div>
  );
}
