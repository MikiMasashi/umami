import { expect, test } from '@playwright/test';
import { uuid } from '../../src/lib/crypto';
import { authHeaders, deleteUser, deleteWebsite, loginPage, loginViaApi, umamiUser } from './helpers';

const successMessage = 'メモが保存されました';

type WebsiteSeed = {
  id: string;
  name: string;
  domain: string;
  notes?: string;
};

type CreatedUser = {
  id: string;
  username: string;
  password: string;
  role: string;
};

async function createWebsiteWithOptionalNotes(
  request: Parameters<typeof loginViaApi>[0],
  auth: Awaited<ReturnType<typeof loginViaApi>>,
  seed: WebsiteSeed,
) {
  const createResponse = await request.post('/api/websites', {
    headers: authHeaders(auth),
    data: {
      id: seed.id,
      createdBy: umamiUser.id,
      name: seed.name,
      domain: seed.domain,
    },
  });

  expect(createResponse.status()).toBe(200);

  if (seed.notes !== undefined) {
    const notesResponse = await request.post('/api/websites/' + seed.id + '/notes', {
      headers: authHeaders(auth),
      data: { notes: seed.notes },
    });

    expect(notesResponse.status()).toBe(200);
  }

  return seed.id;
}

async function createReadOnlyUser(
  request: Parameters<typeof loginViaApi>[0],
  adminAuth: Awaited<ReturnType<typeof loginViaApi>>,
): Promise<CreatedUser> {
  const user = {
    username: 'notes-viewer-' + uuid(),
    password: 'password',
    role: 'view-only',
  };

  const response = await request.post('/api/users', {
    headers: authHeaders(adminAuth),
    data: user,
  });

  expect(response.status()).toBe(200);

  const body = await response.json();

  return {
    id: body.id,
    ...user,
  };
}

test.describe('US-201 website notes', () => {
  test('メモ新規入力・保存・再読み込み', async ({ page, request }) => {
    const auth = await loginPage(page, request);
    const websiteId = uuid();
    const notes = 'Playwright note ' + uuid();

    await createWebsiteWithOptionalNotes(request, auth, {
      id: websiteId,
      name: 'Notes target ' + websiteId.slice(0, 8),
      domain: websiteId.slice(0, 8) + '.example.com',
    });

    try {
      await page.goto('/websites/' + websiteId + '/settings');

      const input = page.getByTestId('notes-input');
      await input.fill(notes);
      await page.getByTestId('notes-save-button').click();

      await expect(page.getByText(successMessage)).toBeVisible();
      await expect(page.getByTestId('notes-success-message')).toContainText(successMessage);

      await page.reload();
      await expect(page.getByTestId('notes-input')).toHaveValue(notes);
    } finally {
      await deleteWebsite(request, auth, websiteId);
    }
  });

  test('一覧画面でメモ表示', async ({ page, request }) => {
    const auth = await loginPage(page, request);
    const withNotesId = uuid();
    const withoutNotesId = uuid();
    const noteText = 'List note ' + uuid();

    await createWebsiteWithOptionalNotes(request, auth, {
      id: withNotesId,
      name: 'Notes website ' + withNotesId.slice(0, 8),
      domain: withNotesId.slice(0, 8) + '.example.com',
      notes: noteText,
    });

    await createWebsiteWithOptionalNotes(request, auth, {
      id: withoutNotesId,
      name: 'Empty website ' + withoutNotesId.slice(0, 8),
      domain: withoutNotesId.slice(0, 8) + '.example.com',
    });

    try {
      await page.goto('/websites');

      await expect(page.getByTestId('website-notes-cell-' + withNotesId)).toContainText(noteText);
      await expect(page.getByTestId('website-notes-cell-' + withoutNotesId)).toBeEmpty();
    } finally {
      await deleteWebsite(request, auth, withNotesId);
      await deleteWebsite(request, auth, withoutNotesId);
    }
  });

  test('権限なしユーザーの編集不可', async ({ page, request }) => {
    const adminAuth = await loginViaApi(request);
    const websiteId = uuid();
    const readOnlyUser = await createReadOnlyUser(request, adminAuth);

    await createWebsiteWithOptionalNotes(request, adminAuth, {
      id: websiteId,
      name: 'Protected website ' + websiteId.slice(0, 8),
      domain: websiteId.slice(0, 8) + '.example.com',
      notes: 'Protected note ' + uuid(),
    });

    try {
      await page.goto('/login');
      await page.getByRole('textbox', { name: /username/i }).fill(readOnlyUser.username);
      await page.getByRole('textbox', { name: /password/i }).fill(readOnlyUser.password);
      await page.getByRole('button', { name: /login/i }).click();

      await page.goto('/websites/' + websiteId + '/settings');

      const notesInput = page.getByTestId('notes-input');
      const saveButton = page.getByTestId('notes-save-button');

      await expect(notesInput).toBeDisabled();
      await expect(saveButton).toBeDisabled();

      const readOnlyAuth = await loginViaApi(request, readOnlyUser.username, readOnlyUser.password);
      const response = await request.post('/api/websites/' + websiteId + '/notes', {
        headers: authHeaders(readOnlyAuth),
        data: { notes: 'forbidden update' },
      });

      expect(response.status()).toBe(401);
    } finally {
      await deleteWebsite(request, adminAuth, websiteId);
      await deleteUser(request, adminAuth, readOnlyUser.id);
    }
  });
});
