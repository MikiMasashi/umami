import { expect, test } from '@playwright/test';
import {
  type Auth,
  authHeaders,
  createWebsite,
  deleteUser,
  deleteWebsite,
  getWebsite,
  loginViaApi,
  updateWebsite,
} from './helpers';

// US-201: API contract for the `notes` field on POST /api/websites/{id}.
// Covers AC-2.1/2.2/2.3 (length boundary), AC-1.3 (overwrite), AC-1.4/Q5 (trim -> null),
// AC-5.1/5.2/5.3 (optional/backward compat) and AC-4.1/4.2/4.3 (authorization).
test.describe('Website notes API tests (US-201)', () => {
  test.describe.configure({ mode: 'serial' });

  let auth: Auth;
  let websiteId = '';

  test.beforeAll(async ({ request }) => {
    auth = await loginViaApi(request);
    const website = await createWebsite(request, auth, {
      name: 'Notes API Website',
      domain: 'notes-api.example.com',
    });
    websiteId = website.id;
  });

  test.afterAll(async ({ request }) => {
    if (websiteId) {
      await deleteWebsite(request, auth, websiteId);
    }
  });

  // AC-5.1 / AC-5.3: notes is optional/nullable; a freshly created website has notes = null.
  test('AC-5.3 new website has notes = null when not provided', async ({ request }) => {
    const response = await getWebsite(request, auth, websiteId);
    const body = await response.json();

    expect(response.status()).toBe(200);
    expect(body).toHaveProperty('notes', null);
  });

  // AC-1.1 / AC-1.3: notes can be saved and later overwritten.
  test('AC-1.3 saves and overwrites notes', async ({ request }) => {
    const first = await updateWebsite(request, auth, websiteId, { notes: 'First note' });
    expect(first.status()).toBe(200);
    expect(await first.json()).toHaveProperty('notes', 'First note');

    const second = await updateWebsite(request, auth, websiteId, { notes: 'Second note' });
    expect(second.status()).toBe(200);
    expect(await second.json()).toHaveProperty('notes', 'Second note');
  });

  // AC-1.2: persistence — a re-fetch (GET) returns the stored value.
  test('AC-1.2 persisted notes are returned by GET', async ({ request }) => {
    await updateWebsite(request, auth, websiteId, { notes: 'Persisted note' });

    const response = await getWebsite(request, auth, websiteId);
    expect(await response.json()).toHaveProperty('notes', 'Persisted note');
  });

  // AC-2.1 / AC-2.3: exactly 500 characters is allowed (200).
  test('AC-2.1 accepts notes of exactly 500 characters', async ({ request }) => {
    const notes = 'a'.repeat(500);
    const response = await updateWebsite(request, auth, websiteId, { notes });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.notes).toHaveLength(500);
  });

  // AC-2.2 / AC-2.3: 501 characters is rejected with a 400.
  test('AC-2.2 rejects notes of 501 characters with 400', async ({ request }) => {
    const notes = 'a'.repeat(501);
    const response = await updateWebsite(request, auth, websiteId, { notes });

    expect(response.status()).toBe(400);
  });

  // AC-2.3 / Q5: trimming happens before the length check, so 500 real chars plus
  // surrounding whitespace still saves (and is stored trimmed).
  test('AC-2.3 trims before length check (500 chars + whitespace is allowed)', async ({
    request,
  }) => {
    const notes = `  ${'b'.repeat(500)}  `;
    const response = await updateWebsite(request, auth, websiteId, { notes });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.notes).toHaveLength(500);
    expect(body.notes).toBe('b'.repeat(500));
  });

  // AC-1.4 / Q5: empty string becomes null (unset), no error.
  test('AC-1.4 empty string is stored as null', async ({ request }) => {
    await updateWebsite(request, auth, websiteId, { notes: 'not empty' });

    const response = await updateWebsite(request, auth, websiteId, { notes: '' });
    expect(response.status()).toBe(200);
    expect(await response.json()).toHaveProperty('notes', null);
  });

  // Q5: whitespace-only input is treated as unset (null).
  test('Q5 whitespace-only notes is stored as null', async ({ request }) => {
    await updateWebsite(request, auth, websiteId, { notes: 'not empty' });

    const response = await updateWebsite(request, auth, websiteId, { notes: '   \n  ' });
    expect(response.status()).toBe(200);
    expect(await response.json()).toHaveProperty('notes', null);
  });

  // AC-1.4: explicit null unsets notes.
  test('AC-1.4 explicit null unsets notes', async ({ request }) => {
    await updateWebsite(request, auth, websiteId, { notes: 'temp' });

    const response = await updateWebsite(request, auth, websiteId, { notes: null });
    expect(response.status()).toBe(200);
    expect(await response.json()).toHaveProperty('notes', null);
  });

  // AC-5.2: updating name/domain without sending notes must preserve the existing notes.
  test('AC-5.2 omitting notes preserves the existing value', async ({ request }) => {
    await updateWebsite(request, auth, websiteId, { notes: 'Keep me' });

    const response = await updateWebsite(request, auth, websiteId, {
      name: 'Notes API Website Renamed',
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('name', 'Notes API Website Renamed');
    expect(body).toHaveProperty('notes', 'Keep me');
  });

  test.describe('authorization', () => {
    const other = {
      username: `notes-noaccess-${Date.now()}`,
      password: 'password',
      role: 'user',
    };
    let otherAuth: Auth;
    let otherUserId = '';

    test.beforeAll(async ({ request }) => {
      const created = await request.post('/api/users', {
        headers: authHeaders(auth),
        data: other,
      });
      expect(created.status()).toBe(200);
      otherUserId = (await created.json()).id;

      otherAuth = await loginViaApi(request, other.username, other.password);
    });

    test.afterAll(async ({ request }) => {
      if (otherUserId) {
        await deleteUser(request, auth, otherUserId);
      }
    });

    // AC-4.1 / AC-4.2: a user without update permission cannot update notes.
    test('AC-4.1 update by a user without permission is rejected (401)', async ({ request }) => {
      const response = await updateWebsite(request, otherAuth, websiteId, { notes: 'hacked' });

      expect(response.status()).toBe(401);

      // The value must be unchanged (still preserved from the previous test).
      const check = await getWebsite(request, auth, websiteId);
      expect(await check.json()).toHaveProperty('notes', 'Keep me');
    });

    // AC-4.3: a user without view permission cannot read notes either.
    test('AC-4.3 read by a user without permission is rejected (401)', async ({ request }) => {
      const response = await getWebsite(request, otherAuth, websiteId);

      expect(response.status()).toBe(401);
    });
  });
});
