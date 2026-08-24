import { expect, test } from '@playwright/test';
import { notes } from './fixtures';
import { addWebsite, deleteWebsite, loginPage } from './helpers';

test.describe('Website notes (US-201) UI tests', () => {
  test('saves notes from the edit screen and shows the reload-persisted value (FR-2)', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    const website = await addWebsite(request, auth, 'Notes edit test', 'notesedittest.com');

    await page.goto(`/websites/${website.id}/settings`);
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue('');

    await page.getByTestId('input-notes').locator('textarea').fill(notes.short);
    await page.getByTestId('button-submit').click();

    // Saving shows a completion toast/message.
    await expect(page.getByText(/saved/i)).toBeVisible();

    // Reload persists the saved value (FR-2 / US-201-2).
    await page.reload();
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue(notes.short);

    await deleteWebsite(request, auth, website.id);
  });

  test('shows an existing note pre-filled when reopening the edit screen (FR-2)', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    const website = await addWebsite(
      request,
      auth,
      'Notes prefill test',
      'notesprefilltest.com',
      notes.short,
    );

    await page.goto(`/websites/${website.id}/settings`);
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue(notes.short);

    await deleteWebsite(request, auth, website.id);
  });

  test('shows an empty notes field with no error for a legacy website without notes (FR-2 / FR-5)', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    // Website created without a `notes` value behaves like a pre-migration record (notes = null).
    const website = await addWebsite(request, auth, 'Legacy notes test', 'legacynotestest.com');

    await page.goto(`/websites/${website.id}/settings`);

    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue('');
    await expect(page.getByTestId('input-name').locator('input')).toHaveValue('Legacy notes test');
    // No validation/runtime error banner is shown for the null-notes website.
    await expect(page.getByText(/error/i)).toHaveCount(0);

    await deleteWebsite(request, auth, website.id);
  });

  test('clears notes and saves successfully without error (FR-2)', async ({ page, request }) => {
    const auth = await loginPage(page, request);
    const website = await addWebsite(
      request,
      auth,
      'Notes clear test',
      'notescleartest.com',
      notes.short,
    );

    await page.goto(`/websites/${website.id}/settings`);
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue(notes.short);

    await page.getByTestId('input-notes').locator('textarea').fill('');
    await page.getByTestId('button-submit').click();

    await expect(page.getByText(/saved/i)).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue('');

    await deleteWebsite(request, auth, website.id);
  });

  test('saves successfully when notes is exactly 500 characters (FR-3 boundary)', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    const website = await addWebsite(request, auth, 'Notes 500 test', 'notes500test.com');

    await page.goto(`/websites/${website.id}/settings`);
    await page.getByTestId('input-notes').locator('textarea').fill(notes.atLimit);
    await page.getByTestId('button-submit').click();

    await expect(page.getByText(/saved/i)).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue(notes.atLimit);

    await deleteWebsite(request, auth, website.id);
  });

  test('blocks saving for notes over 500 characters (FR-3)', async ({ page, request }) => {
    const auth = await loginPage(page, request);
    const website = await addWebsite(request, auth, 'Notes overlimit test', 'notesoverlimit.com');

    await page.goto(`/websites/${website.id}/settings`);

    const textarea = page.getByTestId('input-notes').locator('textarea');

    // The native `maxLength` attribute on the textarea blocks typing/fill() beyond 500 chars.
    // Remove it first (simulating e.g. a paste event) so `fill()` dispatches a real React
    // change event and exercises the react-hook-form `maxLength` rule that acts as the
    // client-side safety net described in FR-3.
    await textarea.evaluate((el: HTMLTextAreaElement) => el.removeAttribute('maxlength'));
    await textarea.fill(notes.overLimit);

    // The form re-validates on change, so the submit button reflects the invalid state
    // without needing to attempt a submit click (a disabled button cannot be clicked).
    await expect(page.getByTestId('button-submit')).toBeDisabled();

    // Ensure nothing was persisted.
    await page.reload();
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue('');

    await deleteWebsite(request, auth, website.id);
  });

  test('shows notes in the website list, truncated when long, and hidden when empty (FR-4)', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    const withNotes = await addWebsite(
      request,
      auth,
      'Notes list test',
      'noteslisttest.com',
      notes.short,
    );
    const withLongNotes = await addWebsite(
      request,
      auth,
      'Notes list long test',
      'noteslistlongtest.com',
      notes.longForTruncation,
    );
    const withoutNotes = await addWebsite(
      request,
      auth,
      'Notes list empty test',
      'noteslistemptytest.com',
    );

    await page.goto('/settings/websites');

    const shortRow = page.locator('table tbody tr').filter({
      has: page.locator('td', { hasText: 'Notes list test' }),
    });
    // The notes column has no `label` attribute in the rendered markup; its cell is
    // identified by an `id` ending in `-notes` (from `DataColumn id="notes"`).
    await expect(shortRow.locator('td[id$="-notes"]')).toContainText(notes.short);

    const longRow = page.locator('table tbody tr').filter({
      has: page.locator('td', { hasText: 'Notes list long test' }),
    });
    // The display truncates to 60 characters and appends an ellipsis (FR-4 / WebsitesTable.tsx).
    await expect(longRow.locator('td[id$="-notes"]')).toContainText('…');
    await expect(longRow.locator('td[id$="-notes"]')).not.toContainText(notes.longForTruncation);

    const emptyRow = page.locator('table tbody tr').filter({
      has: page.locator('td', { hasText: 'Notes list empty test' }),
    });
    await expect(emptyRow.locator('td[id$="-notes"]')).toBeEmpty();

    await deleteWebsite(request, auth, withNotes.id);
    await deleteWebsite(request, auth, withLongNotes.id);
    await deleteWebsite(request, auth, withoutNotes.id);
  });
});
