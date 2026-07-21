/**
 * Password-protect & unlock PDFs, 100% in the browser. Uses @cantoo/pdf-lib (a
 * maintained pdf-lib fork with real PDF standard-security-handler encryption),
 * so protecting and unlocking both happen on-device with nothing uploaded.
 * Unlocking re-saves the decrypted document, preserving its text layer (not a
 * rasterised copy).
 */

/** What an opener of the document (with the user password) is allowed to do. */
export interface Permissions { printing?: boolean; copying?: boolean; modifying?: boolean; annotating?: boolean }

export interface ProtectOpts {
  userPassword: string;
  ownerPassword?: string;
  permissions?: Permissions;
}

/** True if any permission is explicitly denied. */
function hasRestriction(p?: Permissions): boolean {
  return !!p && (p.printing === false || p.copying === false || p.modifying === false || p.annotating === false);
}

const randomPassword = (): string => {
  const a = new Uint8Array(24);
  globalThis.crypto.getRandomValues(a);
  return Array.from(a, (n) => n.toString(36)).join('');
};

/** Encrypt a PDF with an open ("user") password, optionally restricting actions. */
export async function protectPdf(bytes: Uint8Array, opts: ProtectOpts): Promise<Uint8Array> {
  const pw = opts.userPassword.trim();
  if (!pw) throw new Error('Enter a password.');
  const { PDFDocument } = await import('@cantoo/pdf-lib');
  const pdf = await PDFDocument.load(bytes);
  // Permissions are only enforced when the owner password differs from the user
  // password, so when something is restricted we set a random owner password.
  const restrict = hasRestriction(opts.permissions);
  const owner = (opts.ownerPassword || (restrict ? randomPassword() : pw)).trim();
  pdf.encrypt({
    userPassword: pw,
    ownerPassword: owner,
    permissions: opts.permissions
      ? {
          printing: opts.permissions.printing === false ? false : 'highResolution',
          copying: opts.permissions.copying,
          modifying: opts.permissions.modifying,
          annotating: opts.permissions.annotating,
        }
      : undefined,
  } as Parameters<typeof pdf.encrypt>[0]);
  return pdf.save();
}

/** A 0–4 password-strength score with a label, for the meter. */
export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: 'Empty' };
  if (pw.length < 4) return { score: 0, label: 'Too short' };
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes >= 2) s++;
  if (classes >= 3) s++;
  const score = Math.min(4, s) as 0 | 1 | 2 | 3 | 4;
  return { score, label: ['Weak', 'Weak', 'Fair', 'Good', 'Strong'][score]! };
}

/** Remove a PDF's password (the correct password is required), returning a plain PDF. */
export async function unlockPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const { PDFDocument } = await import('@cantoo/pdf-lib');
  const pdf = await PDFDocument.load(bytes, { password });
  return pdf.save(); // re-serialised without the encryption dictionary
}

/** Whether a PDF is encrypted (password-protected). */
export async function isEncryptedPdf(bytes: Uint8Array): Promise<boolean> {
  const { PDFDocument } = await import('@cantoo/pdf-lib');
  try { await PDFDocument.load(bytes); return false; }
  catch (e) { return /encrypt/i.test(e instanceof Error ? e.message : String(e)); }
}
