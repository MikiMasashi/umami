import { type APIRequestContext, expect, test } from '@playwright/test';
import { uuid } from '../../src/lib/crypto';
import {
  type Auth,
  authHeaders,
  deleteUser,
  deleteWebsite,
  loginPage,
  loginViaApi,
} from './helpers';

const notes = {
  initial: 'Production storefront. Owner: Growth team.',
  updated: 'Updated production note for launch monitoring.',
  long: `${'A'.repeat(120)} ${'B'.repeat(120)} ${'C'.repeat(120)} ${'D'.repeat(120)}`,
  tooLong: 'N'.repeat(501),
};

async function createWebsite(request: APIRequestContext, auth: Auth, name: string, domain: string) {
  const id = uuid();
  const response = await request.post('/api/websites', {
    headers: authHeaders(auth),
    data: { id, name, domain },
  });
  const body = await response.json();

  expect(response.status()).toBe(200);
  return body.id as string;
}

test.describe('US-201 website notes', () => {
  let auth: Auth;
  let websiteId = '';
  let userId = '';

  test.beforeEach(async ({ request }) => {
    auth = await loginViaApi(request);
  });

  test.afterEach(async ({ request }) => {
    if (websiteId) {
      await deleteWebsite(request, auth, websiteId);
      websiteId = '';
    }

    if (userId) {
      await deleteUser(request, auth, userId);
      userId = '';
    }
  });

  test('saves a 500-character-or-shorter note from the edit page and shows it after reload', async ({
    page,
    request,
  }) => {
    auth = await loginPage(page, request);
    websiteId = await createWebsite(request, auth, 'US-201 editable note', 'us201-edit.example');

    await page.goto(`/websites/${websiteId}/settings`);
    await expect(page.getByTestId('input-notes')).toBeVisible();
    await page.getByTestId('input-notes').locator('textarea').fill(notes.updated);
    await page.getByTestId('button-submit').click();
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue(notes.updated);

    await page.reload();
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue(notes.updated);
  });

  test('shows note summaries only for websites that have notes on the websites list', async ({
    page,
    request,
  }) => {
    auth = await loginPage(page, request);
    websiteId = await createWebsite(request, auth, 'US-201 noted website', 'us201-list.example');
    const blankWebsiteId = await createWebsite(
      request,
      auth,
      'US-201 blank website',
      'us201-blank.example',
    );

    try {
      const noteResponse = await request.post(`/api/websites/${websiteId}`, {
        headers: authHeaders(auth),
        data: { notes: notes.long },
      });
      const body = await noteResponse.json();

      expect(noteResponse.status()).toBe(200);
      expect(body).toHaveProperty('notes', notes.long);

      await page.goto('/settings/websites');
      await expect(page.getByTestId(`website-note-summary-${websiteId}`)).toContainText(
        notes.long.slice(0, 80),
      );
      await expect(page.getByTestId(`website-note-summary-${blankWebsiteId}`)).toHaveCount(0);
      await expect(page.getByText('No notes')).toHaveCount(0);
    } finally {
      await deleteWebsite(request, auth, blankWebsiteId);
    }
  });

  test('rejects notes longer than 500 characters in the UI and API without overwriting the saved note', async ({
    page,
    request,
  }) => {
    auth = await loginPage(page, request);
    websiteId = await createWebsite(request, auth, 'US-201 note limit', 'us201-limit.example');

    await request.post(`/api/websites/${websiteId}`, {
      headers: authHeaders(auth),
      data: { notes: notes.initial },
    });

    await page.goto(`/websites/${websiteId}/settings`);
    await page.getByTestId('input-notes').locator('textarea').fill(notes.tooLong);
    await page.getByTestId('button-submit').click();
    await expect(page.getByText('Notes must be 500 characters or fewer.')).toBeVisible();

    const response = await request.post(`/api/websites/${websiteId}`, {
      headers: authHeaders(auth),
      data: { notes: notes.tooLong },
    });
    const error = await response.json();

    expect(response.status()).toBe(400);
    expect(error).toEqual({
      error: {
        message: 'Notes must be 500 characters or fewer.',
        code: 'validation-error',
        status: 400,
        field: 'notes',
      },
    });

    const current = await request.get(`/api/websites/${websiteId}`, {
      headers: authHeaders(auth),
    });
    await expect(current).toBeOK();
    await expect(await current.json()).toHaveProperty('notes', notes.initial);
  });

  test('normalizes blank notes to unset and prevents direct updates without update permission', async ({
    request,
  }) => {
    websiteId = await createWebsite(request, auth, 'US-201 guarded note', 'us201-guard.example');

    const saveResponse = await request.post(`/api/websites/${websiteId}`, {
      headers: authHeaders(auth),
      data: { notes: notes.initial },
    });
    expect(saveResponse.status()).toBe(200);
    expect(await saveResponse.json()).toHaveProperty('notes', notes.initial);

    const clearResponse = await request.post(`/api/websites/${websiteId}`, {
      headers: authHeaders(auth),
      data: { notes: '   ' },
    });
    expect(clearResponse.status()).toBe(200);
    expect(await clearResponse.json()).toHaveProperty('notes', null);

    const userResponse = await request.post('/api/users', {
      headers: authHeaders(auth),
      data: { username: 'us201-view-only', password: 'password', role: 'view-only' },
    });
    const user = await userResponse.json();
    userId = user.id;
    const viewOnlyAuth = await loginViaApi(request, 'us201-view-only', 'password');

    const deniedResponse = await request.post(`/api/websites/${websiteId}`, {
      headers: authHeaders(viewOnlyAuth),
      data: { notes: 'Unauthorized overwrite attempt.' },
    });
    const denied = await deniedResponse.json();

    expect(deniedResponse.status()).toBe(401);
    expect(denied).toEqual({
      error: { message: 'Unauthorized', code: 'unauthorized', status: 401 },
    });
  });
});
