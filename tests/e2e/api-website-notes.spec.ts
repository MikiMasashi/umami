import { expect, test } from '@playwright/test';
import { uuid } from '../../src/lib/crypto';
import {
  type Auth,
  addTeam,
  authHeaders,
  createWebsite,
  deleteTeam,
  deleteWebsite,
  loginViaApi,
} from './helpers';

// API-driven E2E scenarios for US-201: notes on websites.
// See docs/e2e/e2e-US-201.md for the acceptance-criteria traceability matrix and
// docs/specifications/api-specification.md for the exact request/response contract
// (status codes, error.code values) that these tests assert against.

test.describe('Website notes API tests', () => {
  let auth: Auth;

  test.beforeAll(async ({ request }) => {
    auth = await loginViaApi(request);
  });

  test('keeps notes unset when updating only name and domain', async ({ request }) => {
    const website = await createWebsite(request, auth, {
      name: 'Notes partial update test',
      domain: 'notes-partial-update-test.com',
    });

    const response = await request.post(`/api/websites/${website.id}`, {
      headers: authHeaders(auth),
      data: { name: 'Notes partial update test renamed', domain: 'notes-partial-update-renamed.com' },
    });
    const body = await response.json();

    expect(response.status()).toBe(200);
    expect(body).toHaveProperty('name', 'Notes partial update test renamed');
    expect(body.notes == null).toBe(true);

    const refetched = await (
      await request.get(`/api/websites/${website.id}`, { headers: authHeaders(auth) })
    ).json();

    expect(refetched.notes == null).toBe(true);

    await deleteWebsite(request, auth, website.id);
  });

  test('saves successfully when notes is exactly 500 characters', async ({ request }) => {
    const website = await createWebsite(request, auth, {
      name: 'Notes 500 test',
      domain: 'notes-500-test.com',
    });

    const notes = 'C'.repeat(500);
    const response = await request.post(`/api/websites/${website.id}`, {
      headers: authHeaders(auth),
      data: { notes },
    });
    const body = await response.json();

    expect(response.status()).toBe(200);
    expect(body).toHaveProperty('notes', notes);

    await deleteWebsite(request, auth, website.id);
  });

  test('rejects notes over 500 characters at the API level', async ({ request }) => {
    const website = await createWebsite(request, auth, {
      name: 'Notes 501 test',
      domain: 'notes-501-test.com',
    });

    const response = await request.post(`/api/websites/${website.id}`, {
      headers: authHeaders(auth),
      data: { notes: 'D'.repeat(501) },
    });
    const body = await response.json();

    expect(response.status()).toBe(400);
    expect(body).toHaveProperty('error.code', 'bad-request');

    const refetched = await (
      await request.get(`/api/websites/${website.id}`, { headers: authHeaders(auth) })
    ).json();

    expect(refetched.notes == null).toBe(true);

    await deleteWebsite(request, auth, website.id);
  });

  test('rejects a notes update from a user without update permission', async ({ request }) => {
    const website = await createWebsite(request, auth, {
      name: 'Notes unauthorized test',
      domain: 'notes-unauthorized-test.com',
      notes: 'Original notes.',
    });

    const username = `notes-no-perm-${uuid().slice(0, 8)}`;
    const password = 'password';

    const createdUser = await (
      await request.post('/api/users', {
        headers: authHeaders(auth),
        data: { username, password, role: 'user' },
      })
    ).json();

    const otherAuth = await loginViaApi(request, username, password);

    const response = await request.post(`/api/websites/${website.id}`, {
      headers: authHeaders(otherAuth),
      data: { notes: 'Tampered notes.' },
    });
    const body = await response.json();

    expect(response.status()).toBe(401);
    expect(body).toHaveProperty('error.code', 'unauthorized');

    const refetched = await (
      await request.get(`/api/websites/${website.id}`, { headers: authHeaders(auth) })
    ).json();

    expect(refetched.notes).toBe('Original notes.');

    await request.delete(`/api/users/${createdUser.id}`, { headers: authHeaders(auth) });
    await deleteWebsite(request, auth, website.id);
  });

  test('includes canUpdate in the website detail response for a team-view-only member', async ({
    request,
  }) => {
    const teamName = `notes-can-update-${uuid().slice(0, 8)}`;
    const [team] = await addTeam(request, auth, teamName);

    const username = `notes-team-viewer-${uuid().slice(0, 8)}`;
    const password = 'password';

    const createdUser = await (
      await request.post('/api/users', {
        headers: authHeaders(auth),
        data: { username, password, role: 'user' },
      })
    ).json();

    await request.post(`/api/teams/${team.id}/users`, {
      headers: authHeaders(auth),
      data: { userId: createdUser.id, role: 'team-view-only' },
    });

    const website = await createWebsite(request, auth, {
      name: 'Notes can update test',
      domain: 'notes-can-update-test.com',
      teamId: team.id,
    });

    const viewerAuth = await loginViaApi(request, username, password);
    const response = await request.get(`/api/websites/${website.id}`, {
      headers: authHeaders(viewerAuth),
    });
    const body = await response.json();

    expect(response.status()).toBe(200);
    expect(body).toHaveProperty('canUpdate', false);

    await deleteWebsite(request, auth, website.id);
    await deleteTeam(request, auth, team.id);
    await request.delete(`/api/users/${createdUser.id}`, { headers: authHeaders(auth) });
  });
});
