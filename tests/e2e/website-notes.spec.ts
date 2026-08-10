import { expect, test } from '@playwright/test';
import { notesFixtures } from './fixtures';
import {
  addTeamUser,
  addUser,
  addWebsite,
  deleteTeam,
  deleteUser,
  deleteWebsite,
  loginPage,
  loginViaApi,
  logout,
} from './helpers';

// US-201: ウェブサイトへのメモ（notes）追加 — UI E2E テスト
//
// 対応する受け入れ条件（docs/e2e/e2e-US-201.md のトレーサビリティ表を参照）:
//   US-201-1 (入力・編集・保存), US-201-2 (永続化), US-201-3 (一覧表示),
//   US-201-4 (文字数上限), US-201-5 (後方互換性), US-201-6 (権限制御)
test.describe('Website notes (US-201) - UI', () => {
  test('US-201-1 / US-201-2: enters notes on the edit screen, saves, and it persists after reload', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    const website = await addWebsite(request, auth, 'Notes UI Create', 'notes-ui-create.com');

    await page.goto(`/websites/${website.id}/settings`);
    await expect(page.getByTestId('input-notes')).toBeVisible();

    // Given: メモ欄は初期状態で空である（新規作成時は notes 未設定）
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue('');

    // When: メモ欄にテキストを入力して保存する
    await page.getByTestId('input-notes').locator('textarea').fill(notesFixtures.shortNotes);
    await page.getByTestId('button-submit').click();

    // Then: 保存成功のフィードバックが表示される（既存の保存成功トーストに準拠）
    await expect(page.getByText(/saved/i)).toBeVisible();

    // When: ブラウザをリロードする
    await page.reload();

    // Then: 保存したメモの内容がそのまま表示される（永続化されている）
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue(
      notesFixtures.shortNotes,
    );

    await deleteWebsite(request, auth, website.id);
  });

  test('US-201-1: shows the existing notes value when opening the edit screen', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    const website = await addWebsite(request, auth, 'Notes UI Existing', 'notes-ui-existing.com', {
      notes: notesFixtures.shortNotes,
    });

    // Given: メモが既に設定されているウェブサイトの編集画面を開いている
    await page.goto(`/websites/${website.id}/settings`);

    // Then: メモ欄に既存の内容が表示される
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue(
      notesFixtures.shortNotes,
    );

    await deleteWebsite(request, auth, website.id);
  });

  test('US-201-1: overwrites notes with the edited content on save', async ({ page, request }) => {
    const auth = await loginPage(page, request);
    const website = await addWebsite(request, auth, 'Notes UI Edit', 'notes-ui-edit.com', {
      notes: notesFixtures.shortNotes,
    });

    await page.goto(`/websites/${website.id}/settings`);

    // When: メモを編集して保存する
    await page.getByTestId('input-notes').locator('textarea').fill(notesFixtures.updatedNotes);
    await page.getByTestId('button-submit').click();
    await expect(page.getByText(/saved/i)).toBeVisible();

    // Then: 変更後の内容で上書き保存される
    await page.reload();
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue(
      notesFixtures.updatedNotes,
    );

    await deleteWebsite(request, auth, website.id);
  });

  test('US-201-1: saves successfully with an empty notes field (no error)', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    const website = await addWebsite(request, auth, 'Notes UI Clear', 'notes-ui-clear.com', {
      notes: notesFixtures.shortNotes,
    });

    await page.goto(`/websites/${website.id}/settings`);

    // Given/When: メモ欄を空にして保存する
    await page.getByTestId('input-notes').locator('textarea').fill('');
    await page.getByTestId('button-submit').click();

    // Then: エラーにならず保存成功のフィードバックが表示される
    await expect(page.getByText(/saved/i)).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue('');

    await deleteWebsite(request, auth, website.id);
  });

  test('US-201-4: rejects saving when notes exceed 500 characters (client-side validation)', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    const website = await addWebsite(request, auth, 'Notes UI TooLong', 'notes-ui-toolong.com');

    await page.goto(`/websites/${website.id}/settings`);

    // When: 500文字を超えるテキストを入力して保存を試みる
    await page.getByTestId('input-notes').locator('textarea').fill(notesFixtures.tooLongNotes);
    await page.getByTestId('button-submit').click();

    // Then: クライアント側バリデーションによりエラーメッセージが表示され、保存されない
    await expect(page.getByText(/500 characters or less/i)).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue('');

    await deleteWebsite(request, auth, website.id);
  });

  test('US-201-4: allows saving when notes are exactly 500 characters', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    const website = await addWebsite(request, auth, 'Notes UI ExactLimit', 'notes-ui-exact.com');

    await page.goto(`/websites/${website.id}/settings`);

    // Given/When: メモ欄にちょうど500文字のテキストを入力して保存する
    await page.getByTestId('input-notes').locator('textarea').fill(notesFixtures.validNotes);
    await page.getByTestId('button-submit').click();

    // Then: 保存に成功する
    await expect(page.getByText(/saved/i)).toBeVisible();

    await deleteWebsite(request, auth, website.id);
  });

  test('US-201-5: shows an empty notes field for a legacy website with notes = null', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    // notes を指定せずに作成 = メモ機能導入前の既存ウェブサイトを模す（notes は null）
    const website = await addWebsite(request, auth, 'Notes UI Legacy', 'notes-ui-legacy.com');

    // Given: メモ機能導入前の既存ウェブサイトを開く
    await page.goto(`/websites/${website.id}/settings`);

    // Then: エラーが発生せず、メモ欄は空欄として表示される
    await expect(page.getByTestId('input-name').locator('input')).toHaveValue('Notes UI Legacy');
    await expect(page.getByTestId('input-notes').locator('textarea')).toHaveValue('');

    await deleteWebsite(request, auth, website.id);
  });

  test('US-201-3: shows notes on the websites list, hides them when empty, and truncates long notes', async ({
    page,
    request,
  }) => {
    const auth = await loginPage(page, request);
    const withNotes = await addWebsite(request, auth, 'Notes List With', 'notes-list-with.com', {
      notes: notesFixtures.shortNotes,
    });
    const withoutNotes = await addWebsite(
      request,
      auth,
      'Notes List Without',
      'notes-list-without.com',
    );
    const withLongNotes = await addWebsite(
      request,
      auth,
      'Notes List Long',
      'notes-list-long.com',
      { notes: notesFixtures.longNotes },
    );

    await page.goto('/settings/websites');

    // Then: メモが設定されているサイトの行にメモの内容が確認できる
    const rowWithNotes = page.locator('table tbody tr').filter({
      has: page.locator('td', { hasText: 'Notes List With' }),
    });
    await expect(rowWithNotes).toContainText(notesFixtures.shortNotes);

    // Then: メモが未入力のサイトの行にはメモに関する表示が何も出ない
    const rowWithoutNotes = page.locator('table tbody tr').filter({
      has: page.locator('td', { hasText: 'Notes List Without' }),
    });
    await expect(rowWithoutNotes.locator('td[label="Notes"]')).toHaveText('');

    // Then: 長文メモは省略表示される（末尾が省略記号で切り詰められる）
    const rowWithLongNotes = page.locator('table tbody tr').filter({
      has: page.locator('td', { hasText: 'Notes List Long' }),
    });
    await expect(rowWithLongNotes.locator('td[label="Notes"]')).toContainText('…');
    await expect(rowWithLongNotes.locator('td[label="Notes"]')).not.toContainText(
      notesFixtures.longNotes,
    );

    await deleteWebsite(request, auth, withNotes.id);
    await deleteWebsite(request, auth, withoutNotes.id);
    await deleteWebsite(request, auth, withLongNotes.id);
  });

  test('US-201-6: a user without update permission cannot save notes changes via the UI', async ({
    page,
    request,
  }) => {
    const adminAuth = await loginViaApi(request);
    const team = await addTeam(request, adminAuth, 'Notes Permission Team');
    const teamId = team[0].id;

    const user = await addUser(
      request,
      adminAuth,
      'notes-permission-viewer',
      'notesPermissionPass1',
      'user',
    );
    await addTeamUser(request, adminAuth, teamId, user.id, 'team-view-only');

    const website = await addWebsite(
      request,
      adminAuth,
      'Notes Permission Site',
      'notes-perm.com',
      {
        teamId,
      },
    );

    // Given: 対象ウェブサイトの更新権限を持たないユーザー（team-view-only）でログインしている
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
    await page.goto('/login');
    await page.getByTestId('input-username').locator('input').fill('notes-permission-viewer');
    await page.getByTestId('input-password').locator('input').fill('notesPermissionPass1');
    await page.getByTestId('button-submit').click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // When: 編集画面を開く（閲覧権限がある場合）
    await page.goto(`/websites/${website.id}/settings`);

    // Then: メモは閲覧できる
    await expect(page.getByTestId('input-notes').locator('textarea')).toBeVisible();

    // When: メモを編集・保存操作を行う
    await page.getByTestId('input-notes').locator('textarea').fill(notesFixtures.updatedNotes);
    await page.getByTestId('button-submit').click();

    // Then: サーバー側で更新が拒否され、フォームにエラーが表示される（保存は成功しない）
    await expect(page.getByText(/saved/i)).toHaveCount(0);

    await logout(page);

    // Then: サーバー側の実データは書き換えられていない
    const check = await request.get(`/api/websites/${website.id}`, {
      headers: { Authorization: adminAuth.authorization },
    });
    const checkBody = await check.json();
    expect(checkBody.notes).toBe(null);

    await deleteWebsite(request, adminAuth, website.id);
    await deleteUser(request, adminAuth, user.id);
    await deleteTeam(request, adminAuth, teamId);
  });
});
