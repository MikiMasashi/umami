# レビュー範囲の提案 — US-201（Website Notes）

このフェーズで変更・追加した全ファイルについて、人間のコードレビューが必要か（`review`）
不要にできるか（`skip`）を申告する。

## 判定ルール（要約）
- `skip` は、**前フェーズで作成されレビュー済みのテスト**（`tests/e2e` または
  `src/component-tests` 配下）で振る舞いとして検証されている変更に限る。
- 本フェーズで新規追加した未レビューのテスト（`src/tests` 直下）だけで担保される変更は `review`。
- 設定・環境・依存・スキーマ／マイグレーション、テストが到達しない分岐（認可・エラー・例外系）、
  非機能（性能・セキュリティ）は**常に `review`**。

## レビュー済みテストの対応（参照用）
| テスト | 種別 | AC |
| --- | --- | --- |
| `tests/e2e/notes.spec.ts` AC-1..AC-9 | E2E（レビュー済み） | AC-1〜AC-9 |
| `src/component-tests/notes-website-settings.test.tsx` C-1 | Component（レビュー済み） | AC-1 |
| 〃 C-2 | 〃 | AC-2 |
| 〃 C-3 | 〃 | AC-5 |
| 〃 C-4 | 〃 | AC-6 |
| 〃 C-5 | 〃 | AC-9 |
| 〃 C-6 | 〃 | AC-8 |
| 〃 C-7 | 〃 | AC-7 |
| `src/component-tests/notes-website-list.test.tsx` C-8 | 〃 | AC-3 |
| 〃 C-9 | 〃 | AC-4 |

## 対応表
| path | decision | 受入条件 | 担保テスト | 理由 |
| --- | --- | --- | --- | --- |
| `src/app/(main)/websites/WebsitesTable.tsx` | **skip** | AC-3, AC-4 | C-8, C-9, E2E AC-3/AC-4 | 一覧の notes セル表示・非表示は純粋な表示ロジックで、レビュー済みコンポーネント／E2E テストが振る舞いを完全に検証している。 |
| `src/app/(main)/websites/[websiteId]/settings/WebsiteEditForm.tsx` | **review** | AC-1, AC-2, AC-5, AC-6, AC-7, AC-9 | C-1〜C-5, C-7, E2E 同 AC | notes の入力・保存・クリア・エラー表示・read-only はレビュー済みテストで担保されるが、`canEdit` によるクライアント側**認可**分岐（team website の userId=null 既定 true 経路等）はレビュー済みテストで網羅されないため、認可ロジックとして人間レビューが必要。 |
| `src/app/api/websites/[websiteId]/route.ts` | **review** | AC-6, AC-7, AC-9 | （振る舞いは E2E、配線は `src/tests`） | サーバ側の**認可**（401）・**バリデーション**（400）・エラー分岐を含む。配線の一部は本フェーズ新規の未レビュー unit test でのみ検証。到達しない分岐は常に review。 |
| `prisma/schema.prisma` | **review** | — | — | データモデル定義の変更。DB はテストから到達しない（config 相当）。 |
| `prisma/migrations/21_add_website_notes/migration.sql` | **review** | — | — | DDL／マイグレーション（環境・スキーマ変更）。常に review。 |
| `src/components/messages.ts` | **review** | — | — | i18n キーのマッピング追加（リソース／設定的変更）。label 文言はテストで完全には検証されない。 |
| `public/intl/messages/en-US.json` | **review** | — | — | i18n 文言追加。エラー文言は C-4／AC-6 で検証されるが label 追加分は振る舞いテストで完全には担保されないため review。 |
| `src/tests/websites-notes-route.test.ts` | **review** | — | — | 本フェーズ新規追加の**未レビュー**ユニットテスト。それ自体がレビュー対象。 |
| `docs/implementation/implementation-notes-US-201.md` | **review** | — | — | 実装メモ（ドキュメント）。人間が内容を確認する。 |
| `docs/reviews/review-scope-US-201.md` | **review** | — | — | 本ファイル（レビュー範囲提案）。人間が確認する。 |
| `docs/reviews/review-scope-US-201.json` | **review** | — | — | レビュー範囲提案の機械可読版。人間が確認する。 |

## 補足
- `skip` としたのは `WebsitesTable.tsx` のみ。表示ロジックがレビュー済みテストで完全に担保されるため。
- 主要 UI である `WebsiteEditForm.tsx` は notes 振る舞い自体はレビュー済みテストで担保されるが、
  クライアント側認可（`canEdit`）分岐を新規に導入しているため、保守的に `review` とした。
- 前フェーズのテスト（`tests/e2e` / `src/component-tests`）は一切変更していないため、
  「前フェーズテストの差分」に該当する review 項目はない。
