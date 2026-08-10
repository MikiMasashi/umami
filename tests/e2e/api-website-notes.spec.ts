import { expect, test } from '@playwright/test';
import { notesFixtures } from './fixtures';
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

// US-201: ウェブサイトへのメモ（notes）追加 — API E2E テスト
//
// 対応する受け入れ条件（docs/e2e/e2e-US-201.md のトレーサビリティ表を参照）:
//   US-201-1 (入力・編集・保存), US-201-2 (永続化), US-201-4 (文字数上限),
//   US-201-5 (後方互換性), US-201-6 (権限制御)
test.describe('Website notes (US-201) - API', () => {
  test.describe.configure({ mode: 'serial' });

  let auth: Auth;

  test.beforeAll(async ({ request }) => {
    auth = await loginViaApi(request);
  });

  test('US-201-1: creates a website with notes and persists them', async ({ request }) => {
    const response = await request.post('/api/websites', {
      headers: authHeaders(auth),
      data: {
        name: 'API Notes Create',
        domain: 'api-notes-create.com',
        notes: notesFixtures.shortNotes,
      },
    });
    const body = await response.json();

    expect(response.status()).toBe(200);
    expect(body).toHaveProperty('notes', notesFixtures.shortNotes);

    await deleteWebsite(request, auth, body.id);
  });

  test('US-201-1 / US-201-4: normalizes an empty/whitespace notes string to null on create', async ({
    request,
  }) => {
    const response = await request.post('/api/websites', {
      headers: authHeaders(auth),
      data: {
        name: 'API Notes Empty',
        domain: 'api-notes-empty.com',
        notes: '   ',
      },
    });
    const body = await response.json();

    expect(response.status()).toBe(200);
    expect(body.notes).toBe(null);

    await deleteWebsite(request, auth, body.id);
  });

  test('US-201-4: allows notes exactly at the 500 character limit', async ({ request }) => {
    const website = await addWebsite(request, auth, 'API Notes Limit', 'api-notes-limit.com');

    const response = await request.post(`/api/websites/${website.id}`, {
      headers: authHeaders(auth),
      data: { notes: notesFixtures.validNotes },
    });
    const body = await response.json();

    expect(response.status()).toBe(200);
    expect(body.notes).toHaveLength(500);

    await deleteWebsite(request, auth, website.id);
  });

  test('US-201-4: rejects notes exceeding the 500 character limit (server-side validation)', async ({
    request,
  }) => {
    const website = await addWebsite(request, auth, 'API Notes TooLong', 'api-notes-toolong.com');

    const response = await request.post(`/api/websites/${website.id}`, {
      headers: authHeaders(auth),
      data: { notes: notesFixtures.tooLongNotes },
    });

    expect(response.status()).toBe(400);

    // Then: メモは更新されず null のまま
    const check = await request.get(`/api/websites/${website.id}`, {
      headers: authHeaders(auth),
    });
    const checkBody = await check.json();
    expect(checkBody.notes).toBe(null);

    await deleteWebsite(request, auth, website.id);
  });

  test('US-201-1: overwrites notes on update', async ({ request }) => {
    const website = await addWebsite(request, auth, 'API Notes Update', 'api-notes-update.com', {
      notes: notesFixtures.shortNotes,
    });

    const response = await request.post(`/api/websites/${website.id}`, {
      headers: authHeaders(auth),
      data: { notes: notesFixtures.updatedNotes },
    });
    const body = await response.json();

    expect(response.status()).toBe(200);
    expect(body.notes).toBe(notesFixtures.updatedNotes);

    await deleteWebsite(request, auth, website.id);
  });

  test('US-201-1: clears notes to null when an empty string is submitted', async ({ request }) => {
    const website = await addWebsite(request, auth, 'API Notes Clear', 'api-notes-clear.com', {
      notes: notesFixtures.shortNotes,
    });

    const response = await request.post(`/api/websites/${website.id}`, {
      headers: authHeaders(auth),
      data: { notes: '' },
    });
    const body = await response.json();

    expect(response.status()).toBe(200);
    expect(body.notes).toBe(null);

    await deleteWebsite(request, auth, website.id);
  });

  test('US-201-5: leaves notes untouched when the field is omitted from the update request', async ({
    request,
  }) => {
    const website = await addWebsite(request, auth, 'API Notes Omitted', 'api-notes-omit.com', {
      notes: notesFixtures.shortNotes,
    });

    // notes を含まない更新（既存クライアントとの後方互換を想定）
    const response = await request.post(`/api/websites/${website.id}`, {
      headers: authHeaders(auth),
      data: { name: 'API Notes Omitted Renamed' },
    });
    const body = await response.json();

    expect(response.status()).toBe(200);
    expect(body.name).toBe('API Notes Omitted Renamed');
    expect(body.notes).toBe(notesFixtures.shortNotes);

    await deleteWebsite(request, auth, website.id);
  });

  test('US-201-5: a legacy website with notes = null behaves without errors on read/update', async ({
    request,
  }) => {
    // notes を指定せずに作成 = メモ機能導入前の既存ウェブサイトを模す
    const website = await addWebsite(request, auth, 'API Notes Legacy', 'api-notes-legacy.com');

    const getResponse = await request.get(`/api/websites/${website.id}`, {
      headers: authHeaders(auth),
    });
    const getBody = await getResponse.json();

    expect(getResponse.status()).toBe(200);
    expect(getBody.notes).toBe(null);

    // notes 以外のフィールドの更新がエラーなく行える
    const updateResponse = await request.post(`/api/websites/${website.id}`, {
      headers: authHeaders(auth),
      data: { domain: 'api-notes-legacy-updated.com' },
    });

    expect(updateResponse.status()).toBe(200);

    await deleteWebsite(request, auth, website.id);
  });

  test('US-201-6: rejects a notes update from a user without update permission on the website', async ({
    request,
  }) => {
    const team = await addTeam(request, auth, 'API Notes Permission Team');
    const teamId = team[0].id;

    const user = await addUser(
      request,
      auth,
      'api-notes-permission-viewer',
      'apiNotesPermissionPass1',
      'user',
    );
    await addTeamUser(request, auth, teamId, user.id, 'team-view-only');

    const website = await addWebsite(
      request,
      auth,
      'API Notes Permission Site',
      'api-notes-permission.com',
      { teamId },
    );

    const viewerAuth = await loginViaApi(
      request,
      'api-notes-permission-viewer',
      'apiNotesPermissionPass1',
    );

    // When: 更新権限を持たないユーザーがメモを含む更新リクエストを送信する
    const response = await request.post(`/api/websites/${website.id}`, {
      headers: authHeaders(viewerAuth),
      data: { notes: notesFixtures.updatedNotes },
    });

    // Then: 更新は拒否され、権限エラーが返る
    expect(response.status()).toBe(401);

    // Then: 閲覧権限では GET は成功し、メモは変更されていない
    const getResponse = await request.get(`/api/websites/${website.id}`, {
      headers: authHeaders(viewerAuth),
    });
    const getBody = await getResponse.json();

    expect(getResponse.status()).toBe(200);
    expect(getBody.notes).toBe(null);

    await deleteWebsite(request, auth, website.id);
    await deleteUser(request, auth, user.id);
    await deleteTeam(request, auth, teamId);
  });

  test('US-201-6: allows a user with update permission on the website to update notes', async ({
    request,
  }) => {
    const team = await addTeam(request, auth, 'API Notes Permission Team 2');
    const teamId = team[0].id;

    const user = await addUser(
      request,
      auth,
      'api-notes-permission-editor',
      'apiNotesPermissionPass2',
      'user',
    );
    await addTeamUser(request, auth, teamId, user.id, 'team-member');

    const website = await addWebsite(
      request,
      auth,
      'API Notes Permission Site 2',
      'api-notes-permission-2.com',
      { teamId },
    );

    const editorAuth = await loginViaApi(
      request,
      'api-notes-permission-editor',
      'apiNotesPermissionPass2',
    );

    // When: 更新権限を持つユーザーがメモを更新する
    const response = await request.post(`/api/websites/${website.id}`, {
      headers: authHeaders(editorAuth),
      data: { notes: notesFixtures.updatedNotes },
    });
    const body = await response.json();

    // Then: 既存の更新権限ロジックに従い、更新が成功する
    expect(response.status()).toBe(200);
    expect(body.notes).toBe(notesFixtures.updatedNotes);

    await deleteWebsite(request, auth, website.id);
    await deleteUser(request, auth, user.id);
    await deleteTeam(request, auth, teamId);
  });
});
