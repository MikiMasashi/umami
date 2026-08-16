import { expect, test } from '@playwright/test';
import { type Auth, createWebsite, deleteWebsite, loginPage } from './helpers';

// US-201: browser (UI) E2E for the website notes feature.
// Covers AC-1.1/1.2/1.3/1.4 (edit + persist), AC-2.1/2.2 (client length guard) and
// AC-3.1/3.2/3.3 (list display / truncation / hidden when empty).
test.describe('Website notes UI tests (US-201)', () => {
  test.describe.configure({ mode: 'serial' });

  const suffix = Date.now();
  const withNotesName = `Notes UI ${suffix}`;
  const withoutNotesName = `No Notes UI ${suffix}`;

  let auth: Auth;
  let websiteId = '';
  let emptyWebsiteId = '';

  const notesField = (page: import('@playwright/test').Page) =>
    page.getByTestId('input-notes').locator('textarea');

  test.beforeAll(async ({ request, browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    auth = await loginPage(page, request);
    await context.close();

    const a = await createWebsite(request, auth, {
      name: withNotesName,
      domain: `notes-ui-${suffix}.example.com`,
    });
    websiteId = a.id;

    const b = await createWebsite(request, auth, {
      name: withoutNotesName,
      domain: `no-notes-ui-${suffix}.example.com`,
    });
    emptyWebsiteId = b.id;
  });

  test.beforeEach(async ({ page, request }) => {
    await loginPage(page, request);
  });

  test.afterAll(async ({ request }) => {
    if (websiteId) {
      await deleteWebsite(request, auth, websiteId);
    }
    if (emptyWebsiteId) {
      await deleteWebsite(request, auth, emptyWebsiteId);
    }
  });

  // AC-1.1 / AC-1.2: enter notes, save (feedback toast), reload -> value persists.
  test('AC-1.1/1.2 saves notes and persists after reload', async ({ page }) => {
    await page.goto(`/settings/websites/${websiteId}`);

    await notesField(page).fill('Production site for the marketing team.');
    await page.getByTestId('button-submit').click();

    await expect(page.getByText(/Saved\./i)).toBeVisible();

    await page.reload();
    await expect(notesField(page)).toHaveValue('Production site for the marketing team.');
  });

  // AC-1.3: overwrite an existing note.
  test('AC-1.3 overwrites existing notes', async ({ page }) => {
    await page.goto(`/settings/websites/${websiteId}`);
    await expect(notesField(page)).toHaveValue('Production site for the marketing team.');

    await notesField(page).fill('Now used for the staging environment.');
    await page.getByTestId('button-submit').click();
    await expect(page.getByText(/Saved\./i)).toBeVisible();

    await page.reload();
    await expect(notesField(page)).toHaveValue('Now used for the staging environment.');
  });

  // AC-1.4 / Q5: clearing the note stores it as unset (empty), no error.
  test('AC-1.4 clearing notes is saved as empty without error', async ({ page }) => {
    await page.goto(`/settings/websites/${websiteId}`);
    await notesField(page).fill('');
    await page.getByTestId('button-submit').click();
    await expect(page.getByText(/Saved\./i)).toBeVisible();

    await page.reload();
    await expect(notesField(page)).toHaveValue('');
  });

  // AC-2.1: exactly 500 characters can be saved from the UI.
  test('AC-2.1 accepts exactly 500 characters', async ({ page }) => {
    const value = 'a'.repeat(500);
    await page.goto(`/settings/websites/${websiteId}`);
    await notesField(page).fill(value);
    await page.getByTestId('button-submit').click();
    await expect(page.getByText(/Saved\./i)).toBeVisible();

    await page.reload();
    await expect(notesField(page)).toHaveValue(value);
  });

  // AC-2.2: 501 characters is blocked client-side (validation error / disabled submit)
  // and must NOT be persisted.
  test('AC-2.2 blocks 501 characters and does not persist', async ({ page }) => {
    // Reset to a known valid baseline first.
    await page.goto(`/settings/websites/${websiteId}`);
    await notesField(page).fill('baseline');
    await page.getByTestId('button-submit').click();
    await expect(page.getByText(/Saved\./i)).toBeVisible();

    const invalid = 'a'.repeat(501);
    await page.reload();
    await notesField(page).fill(invalid);

    const submit = page.getByTestId('button-submit');
    // Client guard: either a validation message appears or the submit button is disabled.
    await expect(page.getByText(/500 characters or fewer/i).or(submit)).toBeVisible();
    if (await submit.isEnabled()) {
      await submit.click();
      await expect(page.getByText(/500 characters or fewer/i)).toBeVisible();
    }

    // The invalid value must not have been saved.
    await page.goto(`/settings/websites/${websiteId}`);
    await expect(notesField(page)).toHaveValue('baseline');
  });

  // AC-3.1 / AC-3.2 / Q6: list shows the note, collapsed to a single line and truncated.
  test('AC-3.1/3.2 list shows a truncated single-line note', async ({ page }) => {
    const multiline = 'Line one\nLine two with a fairly long description that should be truncated';
    await page.goto(`/settings/websites/${websiteId}`);
    await notesField(page).fill(multiline);
    await page.getByTestId('button-submit').click();
    await expect(page.getByText(/Saved\./i)).toBeVisible();

    await page.goto('/settings/websites');
    const row = page
      .locator('table tbody tr')
      .filter({ has: page.locator('td', { hasText: withNotesName }) });

    const cell = row.getByTestId('cell-notes');
    await expect(cell).toBeVisible();
    // Full text preserved in the title attribute (hover), collapsed to one line for display.
    await expect(cell).toHaveAttribute('title', multiline);
    await expect(cell).toHaveCSS('white-space', 'nowrap');
    await expect(cell).toHaveCSS('text-overflow', 'ellipsis');
  });

  // AC-3.3: a website with no note renders no notes content (no placeholder).
  test('AC-3.3 list shows nothing for a website without notes', async ({ page }) => {
    await page.goto('/settings/websites');
    const row = page
      .locator('table tbody tr')
      .filter({ has: page.locator('td', { hasText: withoutNotesName }) });

    await expect(row).toBeVisible();
    await expect(row.getByTestId('cell-notes')).toHaveCount(0);
  });
});
