import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end check of live collaboration in the text editor. Two pages in the
 * same browser context stand in for two people: the host opens a Markdown note
 * and clicks Share (which mints a capability link and joins the room), the guest
 * opens that link, and edits made on either side appear on the other in real time.
 *
 * With no relay configured this rides the BroadcastChannel transport, which is
 * shared across pages of the same origin — so this exercises the full encrypted
 * CollabSession + CRDT path without any server. Run with:
 *   pnpm --filter demo-react exec playwright install chromium
 *   pnpm --filter demo-react test:e2e
 */

const openMarkdown = async (page: Page, body: string) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({ name: 'note.md', mimeType: 'text/markdown', buffer: Buffer.from(body) });
  await expect(page.locator('.ed-textarea')).toBeVisible({ timeout: 15_000 });
};

test('two tabs co-edit a shared note in real time', async ({ context }) => {
  const host = await context.newPage();
  await openMarkdown(host, '# Shared note\n\nfirst line');

  // Host starts a session; the URL gains the capability fragment and the Live bar appears.
  await host.getByRole('button', { name: /Share/ }).click();
  await expect(host.locator('.ed-collab-bar')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => host.url()).toContain('#room=');
  const shareUrl = host.url();

  // Guest opens the same link in a second tab and lands in the text editor.
  const guest = await context.newPage();
  await guest.goto(shareUrl);
  await expect(guest.locator('.ed-textarea')).toBeVisible({ timeout: 15_000 });

  // Guest should catch up to the host's seeded content.
  await expect(guest.locator('.ed-textarea')).toHaveValue(/first line/, { timeout: 10_000 });

  // An edit on the host propagates to the guest…
  await host.locator('.ed-textarea').fill('# Shared note\n\nedited by host');
  await expect(guest.locator('.ed-textarea')).toHaveValue(/edited by host/, { timeout: 10_000 });

  // …and an edit on the guest propagates back to the host.
  await guest.locator('.ed-textarea').fill('# Shared note\n\nreplied by guest');
  await expect(host.locator('.ed-textarea')).toHaveValue(/replied by guest/, { timeout: 10_000 });

  // Both tabs show two live participants.
  await expect(host.locator('.ed-collab-bar')).toContainText('2 editing', { timeout: 10_000 });
});
