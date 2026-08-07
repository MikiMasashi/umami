import { expect, test } from '@playwright/test';
import {
  addTeam,
  addTeamUser,
  addUser,
  addWebsite,
  authHeaders,
  type Auth,
  deleteTeam,
  deleteUser,
  deleteWebsite,
  loginViaApi,
  updateWebsite,
} from './helpers';

test.describe('Website notes API tests (US-201)', () => {
  test.describe.configure({ mode: 'serial' });

  let auth: Auth;

  test.beforeAll(async ({ request }) => {
    auth = await loginViaApi(request);
  });

  test('saves notes within the 500 character limit (AC-1/AC-2)', async ({ request }) => {
    const website = await addWebsite(request, auth, 'API notes save', 'apinotessave.com');

    const response = await updateWebsite(request, auth, website.id, {
      notes: 'Owned by Marketing.',
    });
    const body = await response.json();

    expect(response.status()).toBe(200);
    expect(body).toHaveProperty('notes', 'Owned by Marketing.');

    // Re-fetch to confirm persistence independent of the update response (AC-2).
    const getResponse = await request.get(`/api/websites/${website.id}`, {
      headers: authHeaders(auth),
    });
    const getBody = await getResponse.json();

    expect(getBody).toHaveProperty('notes', 'Owned by Marketing.');

    await deleteWebsite(request, auth, website.id);
  });

  test('rejects notes over 500 characters with a 400 error (AC-3)', async ({ request }) => {
    const website = await addWebsite(request, auth, 'API notes overflow', 'apinotesoverflow.com');

    const response = await updateWebsite(request, auth, website.id, {
      notes: 'A'.repeat(501),
    });

    expect(response.status()).toBe(400);

    const getResponse = await request.get(`/api/websites/${website.id}`, {
      headers: authHeaders(auth),
    });
    const getBody = await getResponse.json();

    expect(getBody.notes).toBeFalsy();

    await deleteWebsite(request, auth, website.id);
  });

  test('accepts exactly 500 characters as a boundary case (AC-3 boundary)', async ({
    request,
  }) => {
    const website = await addWebsite(request, auth, 'API notes boundary', 'apinotesboundary.com');
    const notes500 = 'B'.repeat(500);

    const response = await updateWebsite(request, auth, website.id, { notes: notes500 });
    const body = await response.json();

    expect(response.status()).toBe(200);
    expect(body).toHaveProperty('notes', notes500);

    await deleteWebsite(request, auth, website.id);
  });

  test('accepts an empty string for notes (AC-4)', async ({ request }) => {
    const website = await addWebsite(request, auth, 'API notes empty', 'apinotesempty.com', {
      notes: 'to be cleared',
    });

    const response = await updateWebsite(request, auth, website.id, { notes: '' });
    const body = await response.json();

    expect(response.status()).toBe(200);
    expect(body).toHaveProperty('notes', '');

    await deleteWebsite(request, auth, website.id);
  });

  test('leaves existing notes untouched when omitted from an update (AC-8)', async ({
    request,
  }) => {
    const website = await addWebsite(request, auth, 'API notes untouched', 'apinotesuntouched.com', {
      notes: 'Keep me.',
    });

    const response = await updateWebsite(request, auth, website.id, {
      domain: 'apinotesuntouched-updated.com',
    });
    const body = await response.json();

    expect(response.status()).toBe(200);
    expect(body).toHaveProperty('domain', 'apinotesuntouched-updated.com');
    expect(body).toHaveProperty('notes', 'Keep me.');

    await deleteWebsite(request, auth, website.id);
  });

  test('returns notes as null without error for legacy websites (AC-8)', async ({ request }) => {
    const website = await addWebsite(request, auth, 'API notes legacy', 'apinoteslegacy.com');

    const getResponse = await request.get(`/api/websites/${website.id}`, {
      headers: authHeaders(auth),
    });
    const getBody = await getResponse.json();

    expect(getResponse.status()).toBe(200);
    expect(getBody.notes == null).toBe(true);

    const updateResponse = await updateWebsite(request, auth, website.id, {
      name: 'API notes legacy renamed',
    });
    const updateBody = await updateResponse.json();

    expect(updateResponse.status()).toBe(200);
    expect(updateBody).toHaveProperty('name', 'API notes legacy renamed');
    expect(updateBody.notes == null).toBe(true);

    await deleteWebsite(request, auth, website.id);
  });

  test.describe('permission boundary (AC-9/AC-10)', () => {
    let teamId = '';
    let viewOnlyUserId = '';
    let viewOnlyAuth: Auth;
    let websiteId = '';

    test.beforeAll(async ({ request }) => {
      const team = await addTeam(request, auth, `notes-permissions-${Date.now()}`);
      teamId = team.id;

      const user = await addUser(
        request,
        auth,
        `notes-viewer-${Date.now()}`,
        'viewOnlyPassword1',
        'user',
      );
      viewOnlyUserId = user.id;

      // Team membership with the lowest-privilege role: can view team websites,
      // but has no website:update permission (see ROLE_PERMISSIONS[team-view-only] = []).
      await addTeamUser(request, auth, teamId, viewOnlyUserId, 'team-view-only');

      const website = await addWebsite(
        request,
        auth,
        'API notes permission test',
        'apinotespermission.com',
        { teamId, notes: 'Confidential deployment note.' },
      );
      websiteId = website.id;

      viewOnlyAuth = await loginViaApi(request, user.username, 'viewOnlyPassword1');
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

    test('a user without update permission cannot change notes (AC-9)', async ({ request }) => {
      const response = await updateWebsite(request, viewOnlyAuth, websiteId, {
        notes: 'Hacked note.',
      });

      expect(response.status()).toBe(401);

      const getResponse = await request.get(`/api/websites/${websiteId}`, {
        headers: authHeaders(auth),
      });
      const getBody = await getResponse.json();

      expect(getBody.notes).toBe('Confidential deployment note.');
    });

    test('a user with view-only permission can read notes (AC-10)', async ({ request }) => {
      const response = await request.get(`/api/websites/${websiteId}`, {
        headers: authHeaders(viewOnlyAuth),
      });
      const body = await response.json();

      expect(response.status()).toBe(200);
      expect(body).toHaveProperty('notes', 'Confidential deployment note.');
    });
  });
});
