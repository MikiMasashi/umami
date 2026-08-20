import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { uuid } from '../../src/lib/crypto';
import { type Auth, addUser, authHeaders, deleteUser, deleteWebsite, loginPage, loginViaApi } from './helpers';

const NOTES_MAX_LENGTH = 500;

function uniqueName(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createWebsite(
  request: APIRequestContext,
  auth: Auth,
  payload: { name: string; domain: string; notes?: string | null },
) {
  const response = await request.post('/api/websites', {
    headers: authHeaders(auth),
    data: {
      id: uuid(),
      name: payload.name,
      domain: payload.domain,
      ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
    },
  });

  expect(response.status()).toBe(200);
  return response.json();
}

async function goToWebsiteSettingsFromList(page: Page, websiteName: string) {
  await page.goto('/settings/websites');

  const websiteRow = page.locator('table tbody tr').filter({
    has: page.locator('td', { hasText: websiteName }),
  });

  await websiteRow.getByTestId('link-button-edit').click();
  await expect(page.getByText(/details/i)).toBeVisible();
}

test.describe('Website notes tests', () => {
  test.describe.configure({ mode: 'serial' });

  let adminAuth: Auth;
  const cleanupWebsiteIds: string[] = [];
  let readonlyUserId = '';
  const readonlyUsername = uniqueName('pw-notes-view');
  const readonlyPassword = uniqueName('pw-notes-pass');

  test.beforeAll(async ({ request }) => {
    adminAuth = await loginViaApi(request);
  });

  test.afterAll(async ({ request }) => {
    for (const websiteId of cleanupWebsiteIds) {
      await deleteWebsite(request, adminAuth, websiteId);
    }

    if (readonlyUserId) {
      await deleteUser(request, adminAuth, readonlyUserId);
    }
  });

  test('AC-201-01: persists notes after save and reload', async ({ page, request }) => {
    const website = await createWebsite(request, adminAuth, {
      name: uniqueName('notes-create'),
      domain: `${uniqueName('notes-create')}.example.com`,
      notes: null,
    });
    cleanupWebsiteIds.push(website.id);

    await loginPage(page, request);
    await goToWebsiteSettingsFromList(page, website.name);

    const notes = 'Primary production website note';

    await page.getByTestId('input-notes').locator('textarea').fill(notes);
    await page.getByTestId('button-submit').click();
    await page.reload();

    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue(notes);
  });

  test('AC-201-02: updates notes and reflects on list and settings', async ({ page, request }) => {
    const initialNotes = 'Initial operation note';
    const updatedNotes = 'Updated operation note for support handoff';

    const website = await createWebsite(request, adminAuth, {
      name: uniqueName('notes-update'),
      domain: `${uniqueName('notes-update')}.example.com`,
      notes: initialNotes,
    });
    cleanupWebsiteIds.push(website.id);

    await loginPage(page, request);
    await goToWebsiteSettingsFromList(page, website.name);

    await page.getByTestId('input-notes').locator('textarea').fill(updatedNotes);
    await page.getByTestId('button-submit').click();
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue(updatedNotes);

    await page.goto('/websites');
    const websiteRow = page.locator('table tbody tr').filter({
      has: page.locator('td', { hasText: website.name }),
    });

    await expect(websiteRow.getByTestId('website-notes-preview')).toContainText(updatedNotes);
  });

  test('AC-201-03 & AC-201-07: notes shown only when set; notes-null website remains stable', async ({
    page,
    request,
  }) => {
    const withNotes = await createWebsite(request, adminAuth, {
      name: uniqueName('notes-visible'),
      domain: `${uniqueName('notes-visible')}.example.com`,
      notes: 'Visible note in website list',
    });
    const withoutNotes = await createWebsite(request, adminAuth, {
      name: uniqueName('notes-empty'),
      domain: `${uniqueName('notes-empty')}.example.com`,
      notes: null,
    });
    cleanupWebsiteIds.push(withNotes.id, withoutNotes.id);

    await loginPage(page, request);
    await page.goto('/websites');

    const withNotesRow = page.locator('table tbody tr').filter({
      has: page.locator('td', { hasText: withNotes.name }),
    });
    const withoutNotesRow = page.locator('table tbody tr').filter({
      has: page.locator('td', { hasText: withoutNotes.name }),
    });

    await expect(withNotesRow.getByTestId('website-notes-preview')).toContainText(
      'Visible note in website list',
    );
    await expect(withoutNotesRow.getByTestId('website-notes-preview')).toHaveCount(0);
  });

  test('AC-201-04: long notes are truncated in website list', async ({ page, request }) => {
    const longNotes = `${'Long notes '.repeat(40)}tail`;

    const website = await createWebsite(request, adminAuth, {
      name: uniqueName('notes-truncate'),
      domain: `${uniqueName('notes-truncate')}.example.com`,
      notes: longNotes,
    });
    cleanupWebsiteIds.push(website.id);

    await loginPage(page, request);
    await page.goto('/websites');

    const websiteRow = page.locator('table tbody tr').filter({
      has: page.locator('td', { hasText: website.name }),
    });
    const notePreview = websiteRow.getByTestId('website-notes-preview');

    await expect(notePreview).toBeVisible();
    await expect(notePreview).not.toHaveText(longNotes);
    await expect(notePreview).toContainText('...');
  });

  test('AC-201-05: rejects notes longer than 500 chars', async ({ page, request }) => {
    const website = await createWebsite(request, adminAuth, {
      name: uniqueName('notes-limit'),
      domain: `${uniqueName('notes-limit')}.example.com`,
      notes: null,
    });
    cleanupWebsiteIds.push(website.id);

    await loginPage(page, request);
    await goToWebsiteSettingsFromList(page, website.name);

    const overLimitNotes = 'a'.repeat(NOTES_MAX_LENGTH + 1);

    await page.getByTestId('input-notes').locator('textarea').fill(overLimitNotes);
    await page.getByTestId('button-submit').click();

    await expect(page.getByTestId('text-notes-error')).toContainText(
      'Notes must be 500 characters or less.',
    );
  });

  test('AC-201-06: unauthorized user cannot update notes', async ({ request }) => {
    await addUser(request, adminAuth, readonlyUsername, readonlyPassword, 'view-only');

    const usersResponse = await request.get('/api/admin/users', {
      headers: authHeaders(adminAuth),
    });
    const usersBody = await usersResponse.json();
    readonlyUserId = usersBody.data.find((user: { username: string }) => user.username === readonlyUsername)?.id;

    const website = await createWebsite(request, adminAuth, {
      name: uniqueName('notes-authz'),
      domain: `${uniqueName('notes-authz')}.example.com`,
      notes: 'Original note',
    });
    cleanupWebsiteIds.push(website.id);

    const viewOnlyAuth = await loginViaApi(request, readonlyUsername, readonlyPassword);
    const response = await request.post(`/api/websites/${website.id}`, {
      headers: authHeaders(viewOnlyAuth),
      data: { notes: 'Attempted unauthorized update' },
    });
    const body = await response.json();

    expect(response.status()).toBe(401);
    expect(body?.error?.code).toBe('unauthorized');
  });
});
