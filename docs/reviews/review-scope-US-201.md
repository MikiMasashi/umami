# レビュー範囲提案 US-201: ウェブサイトへのメモ（notes）機能

本ドキュメントは `docs/reviews/review-scope-US-201.json` の人間可読版である。
判定基準は依頼文の「レビュー範囲判定のルール」に従う。

## skip（コードレビュー不要）と判定したもの

いずれも、前フェーズで作成・レビュー済みの E2E テスト（`tests/e2e/website-notes.spec.ts`,
`tests/e2e/api-website-notes.spec.ts`）またはコンポーネントテスト
（`src/component-tests/WebsiteSettingsPage.test.tsx`,
`src/component-tests/WebsitesSettingsPage.test.tsx`）によって、受け入れ条件に紐づく
振る舞いとして検証されている。

| path | 受け入れ条件 | 担保するテスト（一部） |
|---|---|---|
| `src/app/(main)/websites/[websiteId]/settings/WebsiteEditForm.tsx` | US-201-1-1, 1-2, 1-3, 1-4, 2-1, 4-2, 5-2 | `website-notes.spec.ts::saves notes and shows a success toast` ほか（下記JSON参照） |
| `src/app/api/websites/[websiteId]/route.ts` | US-201-1-1, 1-2, 1-3, 2-1, 2-3, 4-1, 4-3, 5-1, 5-3 | `api-website-notes.spec.ts` 全ケース、`website-notes.spec.ts` 保存・再表示系 |
| `src/app/api/websites/route.ts` | US-201-1-1, 1-2, 1-4 | `website-notes.spec.ts` の `createWebsite` ヘルパー経由の作成（notes 付き） |
| `src/components/messages.ts` | US-201-4-2 | 文言 `Notes must be 500 characters or less.` の表示アサーション |
| `public/intl/messages/en-US.json` | US-201-4-2, US-201-3-1〜3-3 | 上記文言、および列見出し `"Notes"` の表示 |
| `src/lib/format.ts`（`summarizeNotes`） | US-201-3-1, 3-2, 3-3 | `shows the notes summary...` / `truncates a long notes value...` / `does not show any notes indicator...`、`WebsitesSettingsPage.test.tsx` の対応ケース |

## review（人間のコードレビューが必要）と判定したもの

| path | 理由 |
|---|---|
| `prisma/schema.prisma` | スキーマ変更（常に review） |
| `prisma/migrations/21_add_website_notes/migration.sql` | マイグレーション・DB変更（常に review） |
| `vitest.config.ts` | テスト実行設定の変更（常に review） |
| `src/app/(main)/websites/WebsitesTable.tsx` | 列表示自体（`text-notes` 部分）はレビュー済みテストで担保されるが、`td[label="Notes"]` ロケータ契約を満たすために `useEffect` で DOM 属性（`label`）を後付けするという react-zen の通常の使い方から外れた実装を含む（`docs/implementation/implementation-notes-US-201.md` 3-3節参照）。ライブラリの挙動に対する非自明な回避策であり、人間による確認を推奨する。 |
| `src/tests/format-summarize-notes.test.ts` | このフェーズで新規作成した未レビューの単体テスト |
| `src/tests/website-notes-route.test.ts` | このフェーズで新規作成した未レビューの単体テスト |
| `src/tests/website-create-notes-route.test.ts` | このフェーズで新規作成した未レビューの単体テスト |
| `docs/implementation/implementation-notes-US-201.md` | 実装メモ（ドキュメント）。レビュー対象として一覧に含める。 |

## 補足

- 前フェーズが作成した `tests/e2e/*` および `src/component-tests/*` の変更は行っていない
  （`git status`/`git diff` で確認済み。差分ゼロ）。
- 欠陥の意図的な作り込みは行っていない。
- 既存依存のバージョン変更・新規ライブラリの追加は行っていない。
