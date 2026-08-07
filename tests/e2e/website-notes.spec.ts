import { expect, test } from '@playwright/test';
import { addWebsite, deleteWebsite, loginPage } from './helpers';

test.describe('Website notes tests (US-201)', () => {
  test('saves a notes value and shows the success message (AC-1)', async ({ page, request }) => {
    const auth = await loginPage(page, request);
    const website = await addWebsite(request, auth, 'Notes save test', 'notessave.com');

    await page.goto(`/websites/${website.id}/settings`);
    await expect(page.getByText(/Details/i)).toBeVisible();

    await page
      .getByTestId('input-notes')
      .locator('textarea')
      .fill('Production site for Client A.');
    await page.getByTestId('button-submit').click();

    await expect(page.getByText(/^Saved\.?$/i)).toBeVisible();

    await deleteWebsite(request, auth, website.id);
  });

  test('persists notes across a page reload (AC-2)', async ({ page, request }) => {
    const auth = await loginPage(page, request);
    const website = await addWebsite(request, auth, 'Notes persist test', 'notespersist.com');

    await page.goto(`/websites/${website.id}/settings`);
    await page
      .getByTestId('input-notes')
      .locator('textarea')
      .fill('Staging environment for internal QA.');
    await page.getByTestId('button-submit').click();
    await expect(page.getByText(/^Saved\.?$/i)).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue(
      'Staging environment for internal QA.',
    );

    await deleteWebsite(request, auth, website.id);
  });

  test('blocks submit and shows a validation error when notes exceed 500 characters (AC-3)', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    const website = await addWebsite(request, auth, 'Notes overflow test', 'notesoverflow.com');

    await page.goto(`/websites/${website.id}/settings`);

    const notesField = page.getByTestId('input-notes').locator('textarea');
    await notesField.fill('A'.repeat(501));
    await page.getByTestId('button-submit').click();

    await expect(page.getByText(/Notes must be 500 characters or less\./i)).toBeVisible();
    await expect(page.getByTestId('button-submit')).toBeDisabled();

    // Confirm nothing was persisted server-side.
    const response = await request.get(`/api/websites/${website.id}`, {
      headers: { Authorization: auth.authorization },
    });
    const body = await response.json();

    expect(body.notes).toBeFalsy();

    await deleteWebsite(request, auth, website.id);
  });

  test('allows saving with an empty notes field (AC-4)', async ({ page, request }) => {
    const auth = await loginPage(page, request);
    const website = await addWebsite(request, auth, 'Notes empty test', 'notesempty.com');

    await page.goto(`/websites/${website.id}/settings`);

    const notesField = page.getByTestId('input-notes').locator('textarea');
    await notesField.fill('');
    await page.getByTestId('button-submit').click();

    await expect(page.getByText(/^Saved\.?$/i)).toBeVisible();

    await deleteWebsite(request, auth, website.id);
  });

  test('shows notes in the website list when set (AC-5)', async ({ page, request }) => {
    const auth = await loginPage(page, request);
    const website = await addWebsite(request, auth, 'Notes list test', 'noteslist.com', {
      notes: 'Requested by Sales team.',
    });

    await page.goto('/settings/websites');

    const row = page.locator('table tbody tr').filter({
      has: page.locator('td', { hasText: /Notes list test/i }),
    });

    await expect(row).toContainText('Requested by Sales team.');

    await deleteWebsite(request, auth, website.id);
  });

  test('truncates long notes in the website list without breaking layout (AC-6)', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    const longNotes =
      'This is a very long note that should not fit inside the list column width.';
    const website = await addWebsite(request, auth, 'Notes truncate test', 'notestruncate.com', {
      notes: longNotes,
    });

    await page.goto('/settings/websites');

    const row = page.locator('table tbody tr').filter({
      has: page.locator('td', { hasText: /Notes truncate test/i }),
    });
    const notesCell = row.locator('td[label="Notes"]');

    await expect(notesCell).toContainText('…');
    await expect(notesCell).not.toContainText(longNotes);

    // Layout guard: the notes cell must not force the row to wrap/expand.
    const box = await notesCell.boundingBox();
    expect(box?.height ?? 0).toBeLessThan(60);

    await deleteWebsite(request, auth, website.id);
  });

  test('shows nothing in the website list when notes are unset (AC-7)', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    const website = await addWebsite(request, auth, 'Notes blank test', 'notesblank.com');

    await page.goto('/settings/websites');

    const row = page.locator('table tbody tr').filter({
      has: page.locator('td', { hasText: /Notes blank test/i }),
    });
    const notesCell = row.locator('td[label="Notes"]');

    await expect(notesCell).toHaveText('');

    await deleteWebsite(request, auth, website.id);
  });

  test('legacy website without notes still lists, opens, and updates other fields (AC-8)', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    // No `notes` provided on creation, simulating a pre-existing website (DB value is `null`).
    const website = await addWebsite(request, auth, 'Legacy website test', 'legacytest.com');

    await page.goto('/settings/websites');
    const row = page.locator('table tbody tr').filter({
      has: page.locator('td', { hasText: /Legacy website test/i }),
    });

    await expect(row).toBeVisible();

    await row.getByTestId('link-button-edit').click();
    await expect(page.getByText(/Details/i)).toBeVisible();
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue('');

    await page.getByTestId('input-domain').locator('input').fill('legacytestupdated.com');
    await page.getByTestId('button-submit').click();

    await expect(page.getByTestId('input-domain').locator('input')).toHaveValue(
      'legacytestupdated.com',
    );

    await deleteWebsite(request, auth, website.id);
  });
});
