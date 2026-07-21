import { describe, it, expect } from 'vitest';
import { protectPdf, unlockPdf, isEncryptedPdf, passwordStrength } from './protect.js';

async function blankPdf(): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const d = await PDFDocument.create(); d.addPage([300, 300]);
  return d.save();
}

describe('PDF protect / unlock', () => {
  // 20s budget: RC4/AES key derivation is genuinely slow and this test flakes
  // past vitest's 5s default when the suite runs fully parallel.
  it('protects a PDF so it needs a password, then unlocks it', { timeout: 20000 }, async () => {
    const plain = await blankPdf();
    expect(await isEncryptedPdf(plain)).toBe(false);

    const locked = await protectPdf(plain, { userPassword: 'secret' });
    expect(await isEncryptedPdf(locked)).toBe(true);

    const unlocked = await unlockPdf(locked, 'secret');
    expect(await isEncryptedPdf(unlocked)).toBe(false);
  });

  it('rejects an empty password', async () => {
    await expect(protectPdf(await blankPdf(), { userPassword: '  ' })).rejects.toThrow();
  });

  it('unlocking with the wrong password fails', async () => {
    const locked = await protectPdf(await blankPdf(), { userPassword: 'right' });
    await expect(unlockPdf(locked, 'wrong')).rejects.toBeDefined();
  });

  it('protects with restricted permissions (still opens with the user password)', async () => {
    const locked = await protectPdf(await blankPdf(), { userPassword: 'open123', permissions: { printing: false, copying: false } });
    expect(await isEncryptedPdf(locked)).toBe(true);
    // The user password still opens it (restrictions apply, but it's not locked out).
    const unlocked = await unlockPdf(locked, 'open123');
    expect(await isEncryptedPdf(unlocked)).toBe(false);
  });
});

describe('passwordStrength', () => {
  it('scores by length and character variety', () => {
    expect(passwordStrength('').label).toBe('Empty');
    expect(passwordStrength('abc').label).toBe('Too short');
    expect(passwordStrength('password').score).toBeLessThanOrEqual(1);   // long but one class
    expect(passwordStrength('Password1').score).toBeGreaterThanOrEqual(3);
    expect(passwordStrength('Password123!').label).toBe('Strong');
  });
});
