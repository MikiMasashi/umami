import { expect, test } from '@playwright/test';
import { notes } from './fixtures';
import {
  type Auth,
  addTeam,
  addTeamUser,
  addUser,
  addWebsite,
  authHeaders,
  deleteTeam,
  deleteUser,
  deleteWebsite,
  loginViaApi,
} from './helpers';

test.describe('Website notes (US-201) API tests', () => {
  let auth: Auth;

  test.beforeAll(async ({ request }) => {
    auth = await loginViaApi(request);
  });

  test.describe('GET responses include notes (FR-1 / FR-5)', () => {
    test('returns notes value in the website detail response', async ({ request }) => {
      const website = await addWebsite(
        request,
        auth,
        'API notes get test',
        'apinotesget.com',
        notes.short,
      );

      const response = await request.get(`/api/websites/${website.id}`, {
        headers: authHeaders(auth),
      });
      const body = await response.json();

      expect(response.status()).toBe(200);
      expect(body).toHaveProperty('notes', notes.short);

      await deleteWebsite(request, auth, website.id);
    });

    test('returns null notes for a legacy website that never set notes (FR-5)', async ({
      request,
    }) => {
      const website = await addWebsite(request, auth, 'API notes null test', 'apinotesnull.com');

      const response = await request.get(`/api/websites/${website.id}`, {
        headers: authHeaders(auth),
      });
      const body = await response.json();

      expect(response.status()).toBe(200);
      expect(body).toHaveProperty('notes', null);

      await deleteWebsite(request, auth, website.id);
    });

    test('includes notes in the websites list response', async ({ request }) => {
      const website = await addWebsite(
        request,
        auth,
        'API notes list test',
        'apinoteslist.com',
        notes.short,
      );

      const response = await request.get('/api/websites', {
        headers: authHeaders(auth),
      });
      const body = await response.json();
      const found = body.data.find((item: any) => item.id === website.id);

      expect(response.status()).toBe(200);
      expect(found).toHaveProperty('notes', notes.short);

      await deleteWebsite(request, auth, website.id);
    });
  });

  test.describe('POST validates and persists notes (FR-2 / FR-3)', () => {
    test('saves a notes value and persists it', async ({ request }) => {
      const website = await addWebsite(request, auth, 'API notes save test', 'apinotessave.com');

      const response = await request.post(`/api/websites/${website.id}`, {
        headers: authHeaders(auth),
        data: { notes: notes.short },
      });
      const body = await response.json();

      expect(response.status()).toBe(200);
      expect(body).toHaveProperty('notes', notes.short);

      const getResponse = await request.get(`/api/websites/${website.id}`, {
        headers: authHeaders(auth),
      });
      expect(await getResponse.json()).toHaveProperty('notes', notes.short);

      await deleteWebsite(request, auth, website.id);
    });

    test('normalizes an empty string to null instead of erroring', async ({ request }) => {
      const website = await addWebsite(
        request,
        auth,
        'API notes empty test',
        'apinotesempty.com',
        notes.short,
      );

      const response = await request.post(`/api/websites/${website.id}`, {
        headers: authHeaders(auth),
        data: { notes: '' },
      });
      const body = await response.json();

      expect(response.status()).toBe(200);
      expect(body).toHaveProperty('notes', null);

      await deleteWebsite(request, auth, website.id);
    });

    test('leaves existing notes untouched when the field is omitted from the update', async ({
      request,
    }) => {
      const website = await addWebsite(
        request,
        auth,
        'API notes omit test',
        'apinotesomit.com',
        notes.short,
      );

      const response = await request.post(`/api/websites/${website.id}`, {
        headers: authHeaders(auth),
        data: { domain: 'apinotesomit-updated.com' },
      });
      const body = await response.json();

      expect(response.status()).toBe(200);
      expect(body).toHaveProperty('domain', 'apinotesomit-updated.com');
      expect(body).toHaveProperty('notes', notes.short);

      await deleteWebsite(request, auth, website.id);
    });

    test('accepts exactly 500 characters (boundary)', async ({ request }) => {
      const website = await addWebsite(request, auth, 'API notes 500 test', 'apinotes500.com');

      const response = await request.post(`/api/websites/${website.id}`, {
        headers: authHeaders(auth),
        data: { notes: notes.atLimit },
      });
      const body = await response.json();

      expect(response.status()).toBe(200);
      expect(body).toHaveProperty('notes', notes.atLimit);

      await deleteWebsite(request, auth, website.id);
    });

    test('rejects 501 characters with a validation error and does not persist it (boundary)', async ({
      request,
    }) => {
      const website = await addWebsite(request, auth, 'API notes 501 test', 'apinotes501.com');

      const response = await request.post(`/api/websites/${website.id}`, {
        headers: authHeaders(auth),
        data: { notes: notes.overLimit },
      });

      expect(response.status()).toBe(400);

      const getResponse = await request.get(`/api/websites/${website.id}`, {
        headers: authHeaders(auth),
      });
      expect(await getResponse.json()).toHaveProperty('notes', null);

      await deleteWebsite(request, auth, website.id);
    });
  });

  test.describe('Update permission is enforced for notes (FR-6)', () => {
    let teamId = '';
    let viewOnlyAuth: Auth;
    let viewOnlyUserId = '';
    let websiteId = '';

    test.beforeAll(async ({ request }) => {
      const team = await addTeam(request, auth, 'notes-permission-team');
      teamId = team[0].id;

      const user = await addUser(request, auth, 'notes-view-only-user', 'notesViewOnly1', 'user');
      viewOnlyUserId = user.id;

      await addTeamUser(request, auth, teamId, viewOnlyUserId, 'team-view-only');

      const website = await addWebsite(
        request,
        auth,
        'API notes permission test',
        'apinotespermission.com',
        notes.short,
      );
      // Move the website under the team so the team-view-only role applies (see src/permissions/website.ts).
      const transferResponse = await request.post(`/api/websites/${website.id}/transfer`, {
        headers: authHeaders(auth),
        data: { teamId },
      });
      expect(transferResponse.status()).toBe(200);
      websiteId = website.id;

      viewOnlyAuth = await loginViaApi(request, 'notes-view-only-user', 'notesViewOnly1');
    });

    test.afterAll(async ({ request }) => {
      if (websiteId) {
        await deleteWebsite(request, auth, websiteId);
      }
      if (viewOnlyUserId) {
        await deleteUser(request, auth, viewOnlyUserId);
      }
      if (teamId) {
        await deleteTeam(request, auth, teamId);
      }
    });

    test('a user without update permission cannot change notes and receives an error status', async ({
      request,
    }) => {
      const response = await request.post(`/api/websites/${websiteId}`, {
        headers: authHeaders(viewOnlyAuth),
        data: { notes: 'attempted unauthorized change' },
      });

      expect(response.status()).toBe(401);

      // The website's notes remain unchanged.
      const getResponse = await request.get(`/api/websites/${websiteId}`, {
        headers: authHeaders(auth),
      });
      expect(await getResponse.json()).toHaveProperty('notes', notes.short);
    });

    test('a user without update permission can still read the existing notes', async ({
      request,
    }) => {
      const response = await request.get(`/api/websites/${websiteId}`, {
        headers: authHeaders(viewOnlyAuth),
      });
      const body = await response.json();

      expect(response.status()).toBe(200);
      expect(body).toHaveProperty('notes', notes.short);
    });

    test('a user with update permission can still save notes normally', async ({ request }) => {
      const response = await request.post(`/api/websites/${websiteId}`, {
        headers: authHeaders(auth),
        data: { notes: 'updated by an authorized user' },
      });
      const body = await response.json();

      expect(response.status()).toBe(200);
      expect(body).toHaveProperty('notes', 'updated by an authorized user');
    });
  });
});
