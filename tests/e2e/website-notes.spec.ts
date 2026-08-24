import { expect, test } from '@playwright/test';
import { uuid } from '../../src/lib/crypto';
import { type Auth, addTeam, createWebsite, deleteTeam, deleteWebsite, loginPage } from './helpers';

// UI-driven E2E scenarios for US-201: notes on websites.
// See docs/e2e/e2e-US-201.md for the acceptance-criteria traceability matrix and
// docs/specifications/architecture-specification.md for the testability contract
// (routes, data-test names, error copy) that these tests rely on.

const NOTES_TOO_LONG_MESSAGE = 'Notes must be 500 characters or less.';

test.describe('Website notes UI tests', () => {
  test('saves notes and shows a success toast', async ({ page, request }) => {
    const auth = await loginPage(page, request);
    const website = await createWebsite(request, auth, {
      name: 'Notes save test',
      domain: 'notes-save-test.com',
    });

    await page.goto(`/settings/websites/${website.id}`);
    await page.getByTestId('input-notes').locator('textarea').fill('Created for the Q3 campaign.');
    await page.getByTestId('button-submit').click();

    await expect(page.getByText(/Saved\.?/i)).toBeVisible();

    await deleteWebsite(request, auth, website.id);
  });

  test('shows existing notes when opening the settings page', async ({ page, request }) => {
    const auth = await loginPage(page, request);
    const website = await createWebsite(request, auth, {
      name: 'Notes existing test',
      domain: 'notes-existing-test.com',
      notes: 'Staging site for the marketing team.',
    });

    await page.goto(`/settings/websites/${website.id}`);

    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue(
      'Staging site for the marketing team.',
    );

    await deleteWebsite(request, auth, website.id);
  });

  test('persists notes after a page reload', async ({ page, request }) => {
    const auth = await loginPage(page, request);
    const website = await createWebsite(request, auth, {
      name: 'Notes reload test',
      domain: 'notes-reload-test.com',
    });

    await page.goto(`/settings/websites/${website.id}`);
    await page.getByTestId('input-notes').locator('textarea').fill('Reload check note.');
    await page.getByTestId('button-submit').click();
    await expect(page.getByText(/Saved\.?/i)).toBeVisible();

    await page.reload();

    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue(
      'Reload check note.',
    );

    await deleteWebsite(request, auth, website.id);
  });

  test('saves an empty notes field as unset', async ({ page, request }) => {
    const auth = await loginPage(page, request);
    const website = await createWebsite(request, auth, {
      name: 'Notes empty test',
      domain: 'notes-empty-test.com',
      notes: 'Will be cleared.',
    });

    await page.goto(`/settings/websites/${website.id}`);
    await page.getByTestId('input-notes').locator('textarea').fill('');
    await page.getByTestId('button-submit').click();
    await expect(page.getByText(/Saved\.?/i)).toBeVisible();

    await page.goto('/settings/websites');
    await expect(page.locator('td[label="Notes"]', { hasText: 'Will be cleared.' })).toHaveCount(0);

    await deleteWebsite(request, auth, website.id);
  });

  test('opens the settings page for a website without notes without error', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    // Simulates a pre-existing website created before the notes feature (notes omitted entirely).
    const website = await createWebsite(request, auth, {
      name: 'Notes backward compat test',
      domain: 'notes-backward-compat-test.com',
    });

    await page.goto(`/settings/websites/${website.id}`);

    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue('');
    await expect(page.getByText(/error/i)).toHaveCount(0);

    await deleteWebsite(request, auth, website.id);
  });

  test('shows the notes summary in the websites list', async ({ page, request }) => {
    const auth = await loginPage(page, request);
    const website = await createWebsite(request, auth, {
      name: 'Notes list test',
      domain: 'notes-list-test.com',
      notes: 'Client demo environment.',
    });

    await page.goto('/settings/websites');

    await expect(page.locator('td[label="Notes"]', { hasText: 'Client demo environment.' })).toBeVisible();

    await deleteWebsite(request, auth, website.id);
  });

  test('truncates a long notes value in the websites list', async ({ page, request }) => {
    const auth = await loginPage(page, request);
    const longNotes = 'A'.repeat(120);
    const website = await createWebsite(request, auth, {
      name: 'Notes truncate test',
      domain: 'notes-truncate-test.com',
      notes: longNotes,
    });

    await page.goto('/settings/websites');

    const expectedSummary = `${longNotes.slice(0, 60)}…`;
    const cell = page.locator('td[label="Notes"]', { hasText: 'A' });

    await expect(cell).toContainText(expectedSummary);
    await expect(cell).not.toContainText(longNotes);

    await deleteWebsite(request, auth, website.id);
  });

  test('does not show any notes indicator for a website without notes', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    const website = await createWebsite(request, auth, {
      name: 'Notes none test',
      domain: 'notes-none-test.com',
    });

    await page.goto('/settings/websites');

    const row = page.locator('tr', { hasText: 'Notes none test' });

    await expect(row.locator('td[label="Notes"]')).toHaveText('');

    await deleteWebsite(request, auth, website.id);
  });

  test('rejects notes over 500 characters on the client and shows a validation message', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    const website = await createWebsite(request, auth, {
      name: 'Notes too long test',
      domain: 'notes-too-long-test.com',
    });

    await page.goto(`/settings/websites/${website.id}`);
    await page
      .getByTestId('input-notes')
      .locator('textarea')
      .fill('B'.repeat(501));
    await page.getByTestId('button-submit').click();

    await expect(page.getByText(NOTES_TOO_LONG_MESSAGE)).toBeVisible();

    // The website should be unchanged: re-opening the page must not show the rejected value.
    await page.reload();
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue('');

    await deleteWebsite(request, auth, website.id);
  });

  test('allows a view-only permission user to see notes but not edit them', async ({
    page,
    request,
  }) => {
    const adminAuth: Auth = await loginPage(page, request);
    const teamName = `notes-view-only-${uuid().slice(0, 8)}`;
    const [team] = await addTeam(request, adminAuth, teamName);

    const viewerUsername = `notes-viewer-${uuid().slice(0, 8)}`;
    const viewerPassword = 'password';

    const viewerUser = await (
      await request.post('/api/users', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: adminAuth.authorization,
        },
        data: { username: viewerUsername, password: viewerPassword, role: 'user' },
      })
    ).json();

    await request.post(`/api/teams/${team.id}/users`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: adminAuth.authorization,
      },
      data: { userId: viewerUser.id, role: 'team-view-only' },
    });

    const website = await createWebsite(request, adminAuth, {
      name: 'Notes view only test',
      domain: 'notes-view-only-test.com',
      notes: 'Only owners and managers may edit this.',
      teamId: team.id,
    });

    const viewerAuth = await loginPage(page, request, viewerUsername, viewerPassword);

    await page.goto(`/settings/websites/${website.id}`);

    await expect(page.getByText('Only owners and managers may edit this.')).toBeVisible();
    await expect(page.getByTestId('input-notes').locator('textarea')).toBeDisabled();
    await expect(page.getByTestId('button-submit')).toHaveCount(0);

    await deleteWebsite(request, adminAuth, website.id);
    await deleteTeam(request, adminAuth, team.id);
    await request.delete(`/api/users/${viewerUser.id}`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: adminAuth.authorization,
      },
    });
    void viewerAuth;
  });
});
