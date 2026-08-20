import { type APIRequestContext, expect, test } from '@playwright/test';
import { uuid } from '../../src/lib/crypto';
import { type Auth, authHeaders, loginPage, loginViaApi } from './helpers';

type CreatedWebsite = {
  id: string;
  name: string;
};

test.describe('US-201 Website notes E2E', () => {
  test.describe.configure({ mode: 'serial' });

  let adminAuth: Auth;
  let restrictedUserId = '';
  const createdWebsites: CreatedWebsite[] = [];

  async function createWebsite(request: APIRequestContext, name: string, domain: string) {
    const response = await request.post('/api/websites', {
      headers: authHeaders(adminAuth),
      data: { name, domain },
    });
    const body = await response.json();

    expect(response.status()).toBe(200);
    expect(body).toHaveProperty('id');

    createdWebsites.push({ id: body.id, name });

    return body.id as string;
  }

  async function updateWebsiteNotes(
    request: APIRequestContext,
    auth: Auth,
    websiteId: string,
    notes: string | null,
  ) {
    const response = await request.post(`/api/websites/${websiteId}`, {
      headers: authHeaders(auth),
      data: { notes },
    });

    expect(response.status()).toBe(200);

    return response.json();
  }

  async function getWebsite(request: APIRequestContext, auth: Auth, websiteId: string) {
    const response = await request.get(`/api/websites/${websiteId}`, {
      headers: authHeaders(auth),
    });
    const body = await response.json();

    expect(response.status()).toBe(200);

    return body;
  }

  test.beforeAll(async ({ request }) => {
    adminAuth = await loginViaApi(request);
  });

  test.afterAll(async ({ request }) => {
    for (const website of createdWebsites) {
      const response = await request.delete(`/api/websites/${website.id}`, {
        headers: authHeaders(adminAuth),
      });

      expect(response.status()).toBe(200);
    }

    if (restrictedUserId) {
      const response = await request.delete(`/api/users/${restrictedUserId}`, {
        headers: authHeaders(adminAuth),
      });

      expect(response.status()).toBe(200);
    }
  });

  test('AC-01/03/04: saves notes and renders list rows correctly', async ({ page, request }) => {
    await loginPage(page, request);

    const suffix = uuid().slice(0, 8);
    const withNotesName = `US201-notes-${suffix}`;
    const withoutNotesName = `US201-empty-${suffix}`;

    const withNotesId = await createWebsite(request, withNotesName, `notes-${suffix}.example.com`);
    await createWebsite(request, withoutNotesName, `empty-${suffix}.example.com`);

    const savedNotes = `Operations note ${suffix}: production website for campaign routing.`;

    await page.goto(`/websites/${withNotesId}/settings`);
    await page.getByTestId('input-notes').locator('textarea').fill(savedNotes);
    await page.getByTestId('button-submit').click();
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue(savedNotes);

    await page.reload();
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue(savedNotes);

    const longNotes = `Long notes ${suffix} ${'x'.repeat(450)}`;
    await updateWebsiteNotes(request, adminAuth, withNotesId, longNotes);

    await page.goto('/settings/websites');

    const withNotesRow = page.locator('table tbody tr').filter({
      has: page.locator('td', { hasText: withNotesName }),
    });
    const notesText = withNotesRow.getByTestId('text-notes');

    await expect(notesText).toBeVisible();
    await expect(notesText).toHaveAttribute('title', longNotes);
    await expect.poll(() => notesText.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);

    const withoutNotesRow = page.locator('table tbody tr').filter({
      has: page.locator('td', { hasText: withoutNotesName }),
    });

    await expect(withoutNotesRow.getByTestId('text-notes')).toHaveCount(0);
  });

  test('AC-02: rejects notes longer than 500 characters', async ({ page, request }) => {
    await loginPage(page, request);

    const suffix = uuid().slice(0, 8);
    const websiteId = await createWebsite(request, `US201-limit-${suffix}`, `limit-${suffix}.example.com`);

    await page.goto(`/websites/${websiteId}/settings`);

    const previousNotes = `Initial notes ${suffix}`;
    await page.getByTestId('input-notes').locator('textarea').fill(previousNotes);
    await page.getByTestId('button-submit').click();
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue(previousNotes);

    const overLimitNotes = `A${'b'.repeat(500)}`;
    await page.getByTestId('input-notes').locator('textarea').fill(overLimitNotes);
    await page.getByTestId('button-submit').click();

    await expect(page.getByText(/notes must be 500 characters or fewer/i)).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue(previousNotes);
  });

  test('AC-05: blocks notes updates from users without website update permission', async ({ request }) => {
    const suffix = uuid().slice(0, 8);
    const websiteId = await createWebsite(
      request,
      `US201-perm-${suffix}`,
      `perm-${suffix}.example.com`,
    );

    const originalNotes = `Original protected notes ${suffix}`;
    await updateWebsiteNotes(request, adminAuth, websiteId, originalNotes);

    const restrictedUsername = `us201-viewonly-${suffix}`;
    const restrictedPassword = `Pwd-${suffix}-safe`;

    const createUserResponse = await request.post('/api/users', {
      headers: authHeaders(adminAuth),
      data: {
        username: restrictedUsername,
        password: restrictedPassword,
        role: 'view-only',
      },
    });
    const createdUser = await createUserResponse.json();

    expect(createUserResponse.status()).toBe(200);
    restrictedUserId = createdUser.id;

    const restrictedAuth = await loginViaApi(request, restrictedUsername, restrictedPassword);

    const unauthorizedResponse = await request.post(`/api/websites/${websiteId}`, {
      headers: authHeaders(restrictedAuth),
      data: {
        notes: `Unauthorized overwrite ${suffix}`,
      },
    });

    expect(unauthorizedResponse.status()).toBe(401);

    const website = await getWebsite(request, adminAuth, websiteId);
    expect(website).toHaveProperty('notes', originalNotes);
  });

  test('AC-06: keeps existing notes-null websites compatible in list/detail/update', async ({
    page,
    request,
  }) => {
    await loginPage(page, request);

    const suffix = uuid().slice(0, 8);
    const websiteId = await createWebsite(request, `US201-compat-${suffix}`, `compat-${suffix}.example.com`);

    const listResponse = await request.get('/api/me/websites', {
      headers: authHeaders(adminAuth),
    });
    const listBody = (await listResponse.json()) as { data: Array<{ id: string; notes: string | null }> };

    expect(listResponse.status()).toBe(200);
    const listedWebsite = listBody.data.find(item => item.id === websiteId);
    expect(listedWebsite).toBeTruthy();
    expect(listedWebsite).toHaveProperty('notes', null);

    const detail = await getWebsite(request, adminAuth, websiteId);
    expect(detail).toHaveProperty('notes', null);

    await page.goto(`/websites/${websiteId}/settings`);
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue('');

    const updatedDomain = `compat-updated-${suffix}.example.com`;
    await page.getByTestId('input-domain').locator('input').fill(updatedDomain);
    await page.getByTestId('button-submit').click();

    await page.reload();
    await expect(page.getByTestId('input-domain').locator('input')).toHaveValue(updatedDomain);
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue('');
  });
});
