import { type APIRequestContext, expect, test } from '@playwright/test';
import { uuid } from '../../src/lib/crypto';
import {
  type Auth,
  addUser,
  authHeaders,
  deleteUser,
  deleteWebsite,
  loginPage,
  loginViaApi,
  umamiUser,
} from './helpers';

/**
 * Reviewed E2E tests for US-201 (website notes).
 *
 * Routing / DOM / HTTP contract
 * (see docs/specifications/architecture-specification.md §Testability contract):
 *   - Settings detail route:  /settings/websites/{websiteId}
 *   - Website list route:     /settings/websites
 *   - Notes form field:       data-test="input-notes"  (textarea inside)
 *   - Save button:            data-test="button-submit"
 *   - List notes cell:        data-test="website-notes" (present only when notes are non-empty)
 *   - Over-limit error text:  "Notes must be 500 characters or less."
 *   - Update endpoint:        POST /api/websites/{websiteId} with a `notes` field
 *       * over-limit (501 code points) -> HTTP 400
 *       * no update permission          -> HTTP 401
 *
 * These tests are collected by `playwright test --list` today but fail when run,
 * because the notes feature is not implemented yet.
 */

const OVER_LIMIT_ERROR = 'Notes must be 500 characters or less.';

async function createWebsite(
  request: APIRequestContext,
  auth: Auth,
  name: string,
  domain: string,
): Promise<string> {
  const id = uuid();
  const response = await request.post('/api/websites', {
    headers: authHeaders(auth),
    data: { id, createdBy: umamiUser.id, name, domain },
  });
  expect(response.status()).toBe(200);
  return id;
}

async function updateNotes(
  request: APIRequestContext,
  auth: Auth,
  websiteId: string,
  notes: string | null,
) {
  return request.post(`/api/websites/${websiteId}`, {
    headers: authHeaders(auth),
    data: { notes },
  });
}

function notesTextbox(page: import('@playwright/test').Page) {
  return page.getByTestId('input-notes').locator('textarea');
}

test.describe('US-201 website notes', () => {
  test('AC-1/AC-2: enter, save and persist notes on the settings detail page', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    const websiteId = await createWebsite(request, auth, 'Notes save test', 'notes-save.com');

    try {
      await page.goto(`/settings/websites/${websiteId}`);

      await notesTextbox(page).fill('Production - requested by marketing');
      await page.getByTestId('button-submit').click();

      // Persistence after reload (AC-2) confirms the save succeeded (AC-1).
      await page.reload();
      await expect(notesTextbox(page)).toHaveValue('Production - requested by marketing');
    } finally {
      await deleteWebsite(request, auth, websiteId);
    }
  });

  test('AC-3: the list shows notes for a website that has them', async ({ page, request }) => {
    const auth = await loginPage(page, request);
    const websiteId = await createWebsite(request, auth, 'Notes list test', 'notes-list.com');

    try {
      const res = await updateNotes(request, auth, websiteId, 'Staging environment');
      expect(res.status()).toBe(200);

      await page.goto('/settings/websites');
      const row = page.locator('tr', { hasText: 'Notes list test' });
      await expect(row.getByTestId('website-notes')).toContainText('Staging environment');
    } finally {
      await deleteWebsite(request, auth, websiteId);
    }
  });

  test('AC-4: the list shows no notes cell for a website without notes', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    const websiteId = await createWebsite(request, auth, 'No notes test', 'no-notes.com');

    try {
      await page.goto('/settings/websites');
      const row = page.locator('tr', { hasText: 'No notes test' });
      await expect(row).toBeVisible();
      await expect(row.getByTestId('website-notes')).toHaveCount(0);
    } finally {
      await deleteWebsite(request, auth, websiteId);
    }
  });

  test('AC-5: a notes value at the 500-character limit can be saved', async ({ page, request }) => {
    const auth = await loginPage(page, request);
    const websiteId = await createWebsite(request, auth, 'Boundary test', 'boundary.com');
    const maxNotes = 'a'.repeat(500);

    try {
      await page.goto(`/settings/websites/${websiteId}`);
      await notesTextbox(page).fill(maxNotes);
      await page.getByTestId('button-submit').click();

      await expect(page.getByText(OVER_LIMIT_ERROR)).toHaveCount(0);

      await page.reload();
      await expect(notesTextbox(page)).toHaveValue(maxNotes);
    } finally {
      await deleteWebsite(request, auth, websiteId);
    }
  });

  test('AC-6: a notes value over 500 characters is rejected (UI error and server 400)', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    const websiteId = await createWebsite(request, auth, 'Over limit test', 'over-limit.com');
    const tooLong = 'a'.repeat(501);

    try {
      // UI validation
      await page.goto(`/settings/websites/${websiteId}`);
      await notesTextbox(page).fill(tooLong);
      await page.getByTestId('button-submit').click();
      await expect(page.getByText(OVER_LIMIT_ERROR)).toBeVisible();

      // Server-side rejection even if the client validation is bypassed (NFR-2)
      const res = await updateNotes(request, auth, websiteId, tooLong);
      expect(res.status()).toBe(400);
    } finally {
      await deleteWebsite(request, auth, websiteId);
    }
  });

  test('AC-7: a user without update permission cannot change notes (server 401)', async ({
    request,
  }) => {
    const admin = await loginViaApi(request);
    const websiteId = await createWebsite(request, admin, 'Perm test', 'perm-test.com');

    const viewer = { username: `viewer_${Date.now()}`, password: 'password123' };
    await addUser(request, admin, viewer.username, viewer.password, 'view-only');

    try {
      const viewerAuth = await loginViaApi(request, viewer.username, viewer.password);
      const res = await updateNotes(request, viewerAuth, websiteId, 'hacked note');
      expect(res.status()).toBe(401);

      // Notes remain unchanged (still unset).
      const check = await request.get(`/api/websites/${websiteId}`, {
        headers: authHeaders(admin),
      });
      const body = await check.json();
      expect(body.notes ?? null).toBeNull();
    } finally {
      await deleteWebsite(request, admin, websiteId);
      const users = await request.get('/api/admin/users', { headers: authHeaders(admin) });
      if (users.ok()) {
        const list = await users.json();
        const created = (list.data ?? list).find?.(
          (u: { username: string; id: string }) => u.username === viewer.username,
        );
        if (created?.id) {
          await deleteUser(request, admin, created.id);
        }
      }
    }
  });

  test('AC-9: clearing notes returns the website to the unset state', async ({ page, request }) => {
    const auth = await loginPage(page, request);
    const websiteId = await createWebsite(request, auth, 'Clear notes test', 'clear-notes.com');

    try {
      const res = await updateNotes(request, auth, websiteId, 'Temporary note');
      expect(res.status()).toBe(200);

      await page.goto(`/settings/websites/${websiteId}`);
      await notesTextbox(page).fill('');
      await page.getByTestId('button-submit').click();

      await page.goto('/settings/websites');
      const row = page.locator('tr', { hasText: 'Clear notes test' });
      await expect(row).toBeVisible();
      await expect(row.getByTestId('website-notes')).toHaveCount(0);
    } finally {
      await deleteWebsite(request, auth, websiteId);
    }
  });

  test('AC-8: a legacy website without notes keeps working (list, detail, rename)', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    const websiteId = await createWebsite(request, auth, 'Legacy site', 'legacy-site.com');

    try {
      // List renders without error
      await page.goto('/settings/websites');
      await expect(page.locator('tr', { hasText: 'Legacy site' })).toBeVisible();

      // Detail renders without error
      await page.goto(`/settings/websites/${websiteId}`);
      await expect(page.getByTestId('input-name').locator('input')).toHaveValue('Legacy site');

      // Renaming (unrelated to notes) still works
      await page.getByTestId('input-name').locator('input').fill('Legacy renamed');
      await page.getByTestId('button-submit').click();
      await page.reload();
      await expect(page.getByTestId('input-name').locator('input')).toHaveValue('Legacy renamed');
    } finally {
      await deleteWebsite(request, auth, websiteId);
    }
  });
});
