import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { uuid } from '../../src/lib/crypto';
import {
  type Auth,
  authHeaders,
  deleteTeam,
  deleteUser,
  deleteWebsite,
  loginPage,
  loginViaApi,
} from './helpers';

const PASSWORD = 'testPasswordPlaywright';
const existingNotes = 'Existing production handoff notes';

let websiteIds: string[] = [];
let teamIds: string[] = [];
let userIds: string[] = [];

test.describe('Website notes E2E', () => {
  test.afterEach(async ({ request }) => {
    const auth = await loginViaApi(request);

    for (const websiteId of websiteIds.reverse()) {
      await deleteWebsite(request, auth, websiteId);
    }

    for (const teamId of teamIds.reverse()) {
      await deleteTeam(request, auth, teamId);
    }

    for (const userId of userIds.reverse()) {
      await deleteUser(request, auth, userId);
    }

    websiteIds = [];
    teamIds = [];
    userIds = [];
  });

  test('saves notes, reloads them, and shows them in the websites list', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    const unique = uniqueSuffix();
    const websiteName = `US-201 notes ${unique}`;
    const notes = `Production site managed by marketing ${unique}`;
    const websiteId = await createWebsite(
      request,
      auth,
      websiteName,
      `notes-${unique}.example.com`,
    );

    await page.goto(`/websites/${websiteId}/settings`);
    await expect(page.getByTestId('input-name').locator('input')).toHaveValue(websiteName);
    await expect(page.getByTestId('input-notes').locator('textarea')).toBeVisible();

    await page.getByTestId('input-notes').locator('textarea').fill(notes);
    await saveWebsiteForm(page, websiteId);

    await page.reload();
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue(notes);

    await page.goto('/settings/websites');
    const row = websiteRow(page, websiteName);
    await expect(row.getByTestId('website-notes')).toContainText(notes);
  });

  test('clears notes and hides them from the websites list', async ({ page, request }) => {
    const auth = await loginPage(page, request);
    const unique = uniqueSuffix();
    const websiteName = `US-201 clear ${unique}`;
    const websiteId = await createWebsite(
      request,
      auth,
      websiteName,
      `clear-${unique}.example.com`,
      { notes: existingNotes },
    );

    await page.goto(`/websites/${websiteId}/settings`);
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue(existingNotes);

    await page.getByTestId('input-notes').locator('textarea').fill('');
    await saveWebsiteForm(page, websiteId);

    const website = await getWebsite(request, auth, websiteId);
    expect(website.notes).toBeNull();

    await page.goto('/settings/websites');
    const row = websiteRow(page, websiteName);
    await expect(row.getByTestId('website-notes')).toHaveCount(0);
    await expect(row).not.toContainText(existingNotes);
  });

  test('rejects notes longer than 500 characters and preserves existing notes', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    const unique = uniqueSuffix();
    const websiteId = await createWebsite(
      request,
      auth,
      `US-201 limit ${unique}`,
      `limit-${unique}.example.com`,
      { notes: existingNotes },
    );
    const tooLongNotes = 'x'.repeat(501);

    await page.goto(`/websites/${websiteId}/settings`);
    await page.getByTestId('input-notes').locator('textarea').fill(tooLongNotes);
    await page.getByTestId('button-submit').click();

    await expect(page.getByText('Notes must be 500 characters or fewer.')).toBeVisible();

    const rejectedResponse = await request.post(`/api/websites/${websiteId}`, {
      headers: authHeaders(auth),
      data: { notes: tooLongNotes },
    });
    expect(rejectedResponse.status()).toBe(400);

    const website = await getWebsite(request, auth, websiteId);
    expect(website.notes).toBe(existingNotes);
  });

  test('rejects notes changes from team view-only users', async ({ request }) => {
    const adminAuth = await loginViaApi(request);
    const unique = uniqueSuffix();
    const teamId = await createTeam(request, adminAuth, `US-201 team ${unique}`);
    const user = await createUser(request, adminAuth, `us201-viewonly-${unique}`, PASSWORD);
    const websiteId = await createWebsite(
      request,
      adminAuth,
      `US-201 team site ${unique}`,
      `team-site-${unique}.example.com`,
      { notes: existingNotes, teamId },
    );

    const addTeamUserResponse = await request.post(`/api/teams/${teamId}/users`, {
      headers: authHeaders(adminAuth),
      data: {
        userId: user.id,
        role: 'team-view-only',
      },
    });
    expect(addTeamUserResponse.status()).toBe(200);

    const viewOnlyAuth = await loginViaApi(request, user.username, PASSWORD);
    const readableResponse = await request.get(`/api/websites/${websiteId}`, {
      headers: authHeaders(viewOnlyAuth),
    });
    expect(readableResponse.status()).toBe(200);

    const rejectedResponse = await request.post(`/api/websites/${websiteId}`, {
      headers: authHeaders(viewOnlyAuth),
      data: { notes: 'Unauthorized change' },
    });
    expect(rejectedResponse.status()).toBe(401);

    const website = await getWebsite(request, adminAuth, websiteId);
    expect(website.notes).toBe(existingNotes);
  });
});

function uniqueSuffix() {
  return uuid().slice(0, 8);
}

function websiteRow(page: Page, websiteName: string) {
  return page.locator('table tbody tr').filter({
    has: page.locator('td', { hasText: websiteName }),
  });
}

async function saveWebsiteForm(page: Page, websiteId: string) {
  await Promise.all([
    page.waitForResponse(
      response =>
        response.url().includes(`/api/websites/${websiteId}`) &&
        response.request().method() === 'POST' &&
        response.status() === 200,
    ),
    page.getByTestId('button-submit').click(),
  ]);
}

async function createWebsite(
  request: APIRequestContext,
  auth: Auth,
  name: string,
  domain: string,
  options: { notes?: string | null; teamId?: string } = {},
) {
  const websiteId = uuid();
  const response = await request.post('/api/websites', {
    headers: authHeaders(auth),
    data: {
      id: websiteId,
      name,
      domain,
      ...(options.teamId && { teamId: options.teamId }),
    },
  });
  expect(response.status()).toBe(200);
  websiteIds.push(websiteId);

  if (Object.hasOwn(options, 'notes')) {
    const updateResponse = await request.post(`/api/websites/${websiteId}`, {
      headers: authHeaders(auth),
      data: { notes: options.notes },
    });
    expect(updateResponse.status()).toBe(200);
  }

  return websiteId;
}

async function createTeam(request: APIRequestContext, auth: Auth, name: string) {
  const response = await request.post('/api/teams', {
    headers: authHeaders(auth),
    data: { name },
  });
  const body = await response.json();

  expect(response.status()).toBe(200);
  teamIds.push(body[0].id);

  return body[0].id as string;
}

async function createUser(
  request: APIRequestContext,
  auth: Auth,
  username: string,
  password: string,
) {
  const response = await request.post('/api/users', {
    headers: authHeaders(auth),
    data: { username, password, role: 'user' },
  });
  const body = await response.json();

  expect(response.status()).toBe(200);
  userIds.push(body.id);

  return { id: body.id as string, username };
}

async function getWebsite(request: APIRequestContext, auth: Auth, websiteId: string) {
  const response = await request.get(`/api/websites/${websiteId}`, {
    headers: authHeaders(auth),
  });

  expect(response.status()).toBe(200);

  return response.json();
}
