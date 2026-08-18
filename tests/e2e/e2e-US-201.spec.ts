import { expect, test } from '@playwright/test';
import { addWebsite, deleteWebsite, loginPage, getWebsite, updateWebsiteNote } from './helpers';
import { notes, websites } from './fixtures';

test.describe('US-201: Website Note Feature E2E Tests', () => {
  // ===== 正常系: メモ入力・保存・編集 =====

  // S-1: メモ入力・保存（正常系）
  test('S-1: enters and saves a memo', async ({ page, request }) => {
    const auth = await loginPage(page, request);

    // Setup: テスト用ウェブサイト作成
    const testMemo = 'Production environment. Managed by Alice.';
    await addWebsite(request, auth, 'Test Website 1', 'test1.com');
    const website = await getWebsite(request, auth, (await request.get('/api/websites', {
      headers: { Authorization: auth.authorization },
    }).then(r => r.json())).data[0].id);

    // Navigate to website settings
    await page.goto('/settings/websites');
    await page.getByTestId('link-button-edit').first().click();
    await expect(page.getByText(/Details/i)).toBeVisible();

    // Fill memo and save
    const websiteId = await page.getByTestId('text-field-websiteId').locator('input').inputValue();
    await page.goto(`/settings/websites/${websiteId}`);

    const noteField = page.locator('[data-test="textarea-note"], textarea[name="note"]').first();
    await noteField.fill(testMemo);
    await page.getByTestId('button-submit').click();

    // Verify: メモが保存され、確認メッセージが表示される
    await expect(noteField).toHaveValue(testMemo);

    // Cleanup
    await deleteWebsite(request, auth, websiteId);
  });

  // S-2: メモに改行・特殊文字を含める
  test('S-2: saves memo with line breaks and special characters', async ({ page, request }) => {
    const auth = await loginPage(page, request);

    const testMemo = notes.noteWithLineBreaks;
    await addWebsite(request, auth, 'Test Website 2', 'test2.com');
    await page.goto('/settings/websites');
    await page.getByTestId('link-button-edit').first().click();

    const websiteId = await page.getByTestId('text-field-websiteId').locator('input').inputValue();
    await page.goto(`/settings/websites/${websiteId}`);

    const noteField = page.locator('[data-test="textarea-note"], textarea[name="note"]').first();
    await noteField.fill(testMemo);
    await page.getByTestId('button-submit').click();

    await expect(noteField).toHaveValue(testMemo);

    // Cleanup
    await deleteWebsite(request, auth, websiteId);
  });

  // S-3: メモ編集（既存メモを更新）
  test('S-3: edits an existing memo', async ({ page, request }) => {
    const auth = await loginPage(page, request);

    const initialMemo = 'Initial memo';
    const updatedMemo = 'Updated memo with more details';
    await addWebsite(request, auth, 'Test Website 3', 'test3.com');
    await page.goto('/settings/websites');
    await page.getByTestId('link-button-edit').first().click();

    const websiteId = await page.getByTestId('text-field-websiteId').locator('input').inputValue();
    await page.goto(`/settings/websites/${websiteId}`);

    // Save initial memo
    const noteField = page.locator('[data-test="textarea-note"], textarea[name="note"]').first();
    await noteField.fill(initialMemo);
    await page.getByTestId('button-submit').click();
    await expect(noteField).toHaveValue(initialMemo);

    // Edit memo
    await noteField.fill(updatedMemo);
    await page.getByTestId('button-submit').click();

    await expect(noteField).toHaveValue(updatedMemo);

    // Cleanup
    await deleteWebsite(request, auth, websiteId);
  });

  // S-4: メモクリア（削除）
  test('S-4: clears a memo', async ({ page, request }) => {
    const auth = await loginPage(page, request);

    const initialMemo = 'Memo to be cleared';
    await addWebsite(request, auth, 'Test Website 4', 'test4.com');
    await page.goto('/settings/websites');
    await page.getByTestId('link-button-edit').first().click();

    const websiteId = await page.getByTestId('text-field-websiteId').locator('input').inputValue();
    await page.goto(`/settings/websites/${websiteId}`);

    // Save initial memo
    const noteField = page.locator('[data-test="textarea-note"], textarea[name="note"]').first();
    await noteField.fill(initialMemo);
    await page.getByTestId('button-submit').click();
    await expect(noteField).toHaveValue(initialMemo);

    // Clear memo
    await noteField.clear();
    await page.getByTestId('button-submit').click();

    // Verify: メモが削除されている
    await expect(noteField).toHaveValue('');

    // Cleanup
    await deleteWebsite(request, auth, websiteId);
  });

  // S-5: メモ永続化（ページリロード）
  test('S-5: memo persists after page reload', async ({ page, request }) => {
    const auth = await loginPage(page, request);

    const testMemo = 'Memo that should persist';
    await addWebsite(request, auth, 'Test Website 5', 'test5.com');
    await page.goto('/settings/websites');
    await page.getByTestId('link-button-edit').first().click();

    const websiteId = await page.getByTestId('text-field-websiteId').locator('input').inputValue();
    await page.goto(`/settings/websites/${websiteId}`);

    // Save memo
    const noteField = page.locator('[data-test="textarea-note"], textarea[name="note"]').first();
    await noteField.fill(testMemo);
    await page.getByTestId('button-submit').click();
    await expect(noteField).toHaveValue(testMemo);

    // Reload page
    await page.reload();
    await expect(page.getByTestId('text-field-websiteId').locator('input')).toHaveValue(websiteId);

    // Verify: メモが保持されている
    const noteFieldAfterReload = page.locator('[data-test="textarea-note"], textarea[name="note"]').first();
    await expect(noteFieldAfterReload).toHaveValue(testMemo);

    // Cleanup
    await deleteWebsite(request, auth, websiteId);
  });

  // ===== 一覧表示関連 =====

  // S-6: ウェブサイト一覧でメモ表示
  test('S-6: displays memos in website list', async ({ page, request }) => {
    const auth = await loginPage(page, request);

    const testMemo = 'Listed memo';
    await addWebsite(request, auth, 'List Test Website', 'listtest.com');
    
    // Update memo via API
    const response = await request.get('/api/websites', {
      headers: { Authorization: auth.authorization },
    });
    const websites = await response.json();
    const testWebsite = websites.data[0];
    
    await updateWebsiteNote(request, auth, testWebsite.id, testMemo);

    // Navigate to list
    await page.goto('/settings/websites');

    // Verify: メモが一覧に表示されている
    await expect(page.getByText(testMemo)).toBeVisible();

    // Cleanup
    await deleteWebsite(request, auth, testWebsite.id);
  });

  // S-7: メモ省略表示（長いメモ）
  test('S-7: truncates long memos in list', async ({ page, request }) => {
    const auth = await loginPage(page, request);

    const longMemo = notes.longNote; // 150文字
    await addWebsite(request, auth, 'Long Memo Website', 'longmemo.com');
    
    const response = await request.get('/api/websites', {
      headers: { Authorization: auth.authorization },
    });
    const websites = await response.json();
    const testWebsite = websites.data[0];
    
    await updateWebsiteNote(request, auth, testWebsite.id, longMemo);

    // Navigate to list
    await page.goto('/settings/websites');

    // Verify: メモが省略表示されている（最大100字 + "..."）
    const memoCell = page.locator('td').filter({ hasText: /^[A]{1,100}\.\.\./ }).first();
    await expect(memoCell).toBeVisible();

    // Cleanup
    await deleteWebsite(request, auth, testWebsite.id);
  });

  // S-8: 一覧↔詳細設定画面の一貫性
  test('S-8: memo in list matches memo in detail view', async ({ page, request }) => {
    const auth = await loginPage(page, request);

    const testMemo = 'Consistency test memo';
    await addWebsite(request, auth, 'Consistency Website', 'consistency.com');
    
    const response = await request.get('/api/websites', {
      headers: { Authorization: auth.authorization },
    });
    const websites = await response.json();
    const testWebsite = websites.data[0];
    
    await updateWebsiteNote(request, auth, testWebsite.id, testMemo);

    // Show list and note the memo
    await page.goto('/settings/websites');
    const listMemo = await page.locator('td').filter({ hasText: testMemo }).first().textContent();

    // Open detail view
    await page.getByTestId('link-button-edit').first().click();
    await expect(page.getByText(/Details/i)).toBeVisible();

    const websiteId = await page.getByTestId('text-field-websiteId').locator('input').inputValue();
    const detailMemo = await page.locator('[data-test="textarea-note"], textarea[name="note"]').first().inputValue();

    // Verify: 一覧と詳細が一致
    expect(detailMemo).toBe(testMemo);

    // Cleanup
    await deleteWebsite(request, auth, testWebsite.id);
  });

  // ===== 異常系: バリデーション・権限 =====

  // S-9: 文字数上限エラー（501文字以上）
  test('S-9: rejects memo exceeding 500 characters', async ({ page, request }) => {
    const auth = await loginPage(page, request);

    const invalidMemo = notes.invalidNote; // 501文字
    await addWebsite(request, auth, 'Validation Test', 'validation.com');
    await page.goto('/settings/websites');
    await page.getByTestId('link-button-edit').first().click();

    const websiteId = await page.getByTestId('text-field-websiteId').locator('input').inputValue();
    await page.goto(`/settings/websites/${websiteId}`);

    // Try to enter 501+ characters
    const noteField = page.locator('[data-test="textarea-note"], textarea[name="note"]').first();
    
    // Client-side validation should prevent this or show warning
    // Attempt to set via API to test server-side
    const response = await updateWebsiteNote(request, auth, websiteId, invalidMemo);
    
    // Verify: サーバーが400エラーを返す
    expect(response.status()).toBe(400);
    const errorData = await response.json();
    expect(errorData.message).toContain('500');

    // Cleanup
    await deleteWebsite(request, auth, websiteId);
  });

  // ===== 互換性テスト =====

  // S-12: メモなしサイト表示（互換性）
  test('S-12: displays website with no memo', async ({ page, request }) => {
    const auth = await loginPage(page, request);

    // Create website without memo
    await addWebsite(request, auth, 'No Memo Website', 'nomemo.com');
    await page.goto('/settings/websites');

    // Verify: メモなしサイトが正常に表示される
    await expect(page.getByText('No Memo Website')).toBeVisible();
    await expect(page.locator('td').filter({ hasText: '-' }).first()).toBeVisible();

    // Cleanup
    const response = await request.get('/api/websites', {
      headers: { Authorization: auth.authorization },
    });
    const websites = await response.json();
    const testWebsite = websites.data.find((w: any) => w.name === 'No Memo Website');
    await deleteWebsite(request, auth, testWebsite.id);
  });

  // S-13: 既存サイト編集（互換性）
  test('S-13: edits existing website with null memo', async ({ page, request }) => {
    const auth = await loginPage(page, request);

    // Create website without memo
    await addWebsite(request, auth, 'Existing Website', 'existing.com');
    await page.goto('/settings/websites');
    await page.getByTestId('link-button-edit').first().click();

    const websiteId = await page.getByTestId('text-field-websiteId').locator('input').inputValue();
    await page.goto(`/settings/websites/${websiteId}`);

    // Verify: メモフィールドが空として表示される
    const noteField = page.locator('[data-test="textarea-note"], textarea[name="note"]').first();
    await expect(noteField).toHaveValue('');

    // Edit other fields (e.g., name)
    const nameField = page.getByTestId('input-name').locator('input');
    const newName = 'Updated Existing Website';
    await nameField.fill(newName);
    await page.getByTestId('button-submit').click();

    // Verify: 更新が成功し、メモは空のまま
    await expect(nameField).toHaveValue(newName);
    await expect(noteField).toHaveValue('');

    // Cleanup
    await deleteWebsite(request, auth, websiteId);
  });

  // ===== エッジケース =====

  // S-9-EX: 境界値: 500文字（最大許可）
  test('S-9-EX: accepts memo with exactly 500 characters', async ({ page, request }) => {
    const auth = await loginPage(page, request);

    const maxMemo = notes.maxLengthNote; // 500文字
    const response = await updateWebsiteNote(request, auth, 'dummy-id', maxMemo);

    // First create a website
    await addWebsite(request, auth, 'Max Length Test', 'maxlen.com');
    const websitesResp = await request.get('/api/websites', {
      headers: { Authorization: auth.authorization },
    });
    const websites = await websitesResp.json();
    const testWebsite = websites.data[0];

    // Update with max length memo
    const updateResp = await updateWebsiteNote(request, auth, testWebsite.id, maxMemo);
    expect(updateResp.status()).toBe(200);

    // Cleanup
    await deleteWebsite(request, auth, testWebsite.id);
  });
});
