# US-201 E2Eテスト実行結果

- 実行日時: 2026-08-21
- 対象: `tests/e2e/website-notes-us201.spec.ts`
- 実行コマンド:
  - `npm run test:e2e -- website-notes-us201.spec.ts`
  - `DATABASE_URL` 設定後に `npm run build-db-client`
  - 再度 `npm run test:e2e -- website-notes-us201.spec.ts`

## 総合結果

**成功（全シナリオ完了）**

- 4件中: 4件成功 / 0件失敗
- 初回NG要因（Prisma Client未生成）を修正後、`loginViaApi` を含む全シナリオが完了

## 受入条件 合否対応表

| 受入条件 | 対応シナリオ | 判定 | 根拠 |
|---|---|---|---|
| AC-01 設定画面での保存 | E2E-US201-01 | OK | settings画面でnotes保存後、再読込後も値が保持されることを確認 |
| AC-02 文字数上限 | E2E-US201-02 | OK | 501文字入力でバリデーション表示、再読込後も直前の正常値が維持されることを確認 |
| AC-03 一覧表示（notes あり） | E2E-US201-01 | OK | notesあり行に `text-notes` が表示され、`title` 属性に全文が保持されることを確認 |
| AC-04 一覧表示（notes なし） | E2E-US201-01 | OK | notesなし行に `text-notes` が表示されないことを確認 |
| AC-05 権限制御 | E2E-US201-03 | OK | `view-only` ユーザーで更新APIが `401`、管理者取得時のnotes不変を確認 |
| AC-06 既存データ互換 | E2E-US201-04 | OK | notes=nullの既存互換（一覧/詳細/更新）を確認 |

## 初回NG指摘の修正対応結果

| ID | 事象 | 対応 | 結果 |
|---|---|---|---|
| DEF-US201-001 | `DATABASE_URL` 未設定で `prisma generate` 失敗 | `DATABASE_URL` を設定し `npm run build-db-client` を再実行 | 解消 |
| DEF-US201-002 | `@/generated/prisma/client` 未生成により `/api/auth/login` が 500 | Prisma Client生成後にE2E再実行 | 解消 |

## 再実行ログ要約

```text
Running 4 tests using 1 worker
4 passed (all scenarios completed)
```
