import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// A representative PDF served from /public.
const SAMPLE = fileURLToPath(new URL('../public/test-form.pdf', import.meta.url));

test('opens a PDF and drives the Smart Tools panel', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/PDFCraft/i);

  // Open a document via the hidden file input.
  await page.locator('input[type="file"]').setInputFiles(SAMPLE);

  // Smart Tools button enables once the document is ready.
  const smartBtn = page.getByRole('button', { name: 'Smart tools' });
  await expect(smartBtn).toBeEnabled({ timeout: 15_000 });
  await smartBtn.click();
  await expect(page.getByText('Smart Tools', { exact: false })).toBeVisible();

  // Outline is fully offline — generate one and expect a result (TOC or the
  // "no headings" note), proving the run-extraction pipeline works end-to-end.
  await page.getByRole('tab', { name: 'Outline' }).click();
  await page.getByRole('button', { name: 'Generate outline' }).click();
  await expect(
    page.locator('.v2-smart__toc, .v2-smart__empty'),
  ).toBeVisible({ timeout: 15_000 });
});

test('runs the offline PII scan', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(SAMPLE);
  await page.getByRole('button', { name: 'Smart tools' }).click({ timeout: 15_000 });
  await page.getByRole('tab', { name: 'Redact PII' }).click();
  await page.getByRole('button', { name: 'Scan document' }).click();
  // Either matches are listed or a "0 matches" head appears — both prove the
  // scanner ran without error.
  await expect(page.getByText(/match(es)? found/i)).toBeVisible({ timeout: 15_000 });
});
