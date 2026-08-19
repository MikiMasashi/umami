# US-201 E2E 実行結果: ウェブサイトメモ

## 実行概要

| 項目 | 内容 |
| --- | --- |
| 実行日時 | 2026-08-19 23:49 JST |
| 対象 | `tests\e2e\website-notes.spec.ts` |
| 実行コマンド | `pnpm exec playwright test website-notes.spec.ts --reporter=list` |
| 実行環境 | Chromium / Playwright, Next.js dev server, PostgreSQL 15 (`docker-compose.yml` の `db`) |
| DB 準備 | `pnpm run update-db`, `pnpm run seed-data` |
| 最終結果 | 4 件中 2 件 Pass / 2 件 Fail |

## テスト結果

| シナリオ ID | テスト名 | 結果 | 備考 |
| --- | --- | --- | --- |
| E2E-201-01 | saves notes, reloads them, and shows them in the websites list | Fail | `/websites/{websiteId}/settings` 遷移後、`input-name` が見つからず失敗。画面は対象 Website ではなく `Select website` 状態だった。 |
| E2E-201-02 | clears notes and hides them from the websites list | Pass | notes を空保存後、API 上は `null`、一覧上は旧 notes 非表示。 |
| E2E-201-03 | rejects notes longer than 500 characters and preserves existing notes | Fail | 501 文字入力後に Save ボタンが disabled のままで、期待した上限エラーメッセージ表示と API 直接検証まで到達できなかった。 |
| E2E-201-04 | rejects notes changes from team view-only users | Pass | view-only ユーザーの notes 更新は 401 で拒否され、既存 notes は維持された。 |

## 受入条件ごとの合否

| 受入条件 | 内容 | 対応シナリオ | 判定 | 根拠 |
| --- | --- | --- | --- | --- |
| AC-201-01 | 編集画面でメモを保存できる | E2E-201-01 | Fail | 編集画面のフォーム要素が表示されず、notes 保存操作まで到達できない。 |
| AC-201-02 | 保存したメモは再読み込み後も残る | E2E-201-01 | Fail | 保存操作前に失敗したため、再読み込み後の永続化を確認できない。 |
| AC-201-03 | ウェブサイト一覧でメモを確認できる | E2E-201-01 | Fail | 保存操作前に失敗したため、一覧表示を確認できない。 |
| AC-201-04 | メモ未入力のサイトでは一覧にメモを表示しない | E2E-201-02 | Pass | notes 空保存後、一覧行に `website-notes` が存在せず旧 notes も表示されない。 |
| AC-201-05 | 500 文字を超えるメモは保存できない | E2E-201-03 | Fail | 501 文字入力時に Save が disabled のままタイムアウトし、期待エラー表示と API 400 / 既存 notes 維持の検証へ到達できない。 |
| AC-201-06 | 既存ウェブサイトはメモ未設定でも従来どおり動作する | E2E-201-01 | Fail | notes 未設定の Website 作成後、対象設定画面のフォームが表示されない。 |
| AC-201-07 | 権限のないユーザーはメモを変更できない | E2E-201-04 | Pass | view-only ユーザーの更新 API が 401 になり、管理者取得で既存 notes 維持を確認。 |
| AC-201-08 | 空のメモを保存できる | E2E-201-02 | Pass | notes を空にして保存でき、API 上 `null` として保持された。 |

## 検出した欠陥

| ID | 重要度 | 内容 | 影響する受入条件 | 証跡 |
| --- | --- | --- | --- | --- |
| DEF-201-01 | High | notes 未設定の Website を API 作成した直後に `/websites/{websiteId}/settings` を開いても対象 Website の設定フォームが表示されず、`Select website` 状態になる。新規/既存の notes 未設定 Website で設定編集フローが成立しない可能性がある。 | AC-201-01, AC-201-02, AC-201-03, AC-201-06 | `test-results\website-notes-Website-note-2d16a-s-them-in-the-websites-list-chromium\error-context.md` |
| DEF-201-02 | Medium | notes に 501 文字を入力すると Save ボタンが disabled のままになり、期待される「Notes must be 500 characters or fewer.」のエラー表示が確認できない。ユーザーが保存不可理由を認識できず、API 側拒否と既存 notes 維持のE2E検証にも到達できない。 | AC-201-05 | `test-results\website-notes-Website-note-0a379-nd-preserves-existing-notes-chromium\error-context.md` |

## 補足

初回実行では Prisma Client 未生成により `@/generated/prisma/client` が解決できず、ログイン API が 500 になった。`pnpm run build-db-client` は `DATABASE_URL` 未設定で失敗したため、既存 `docker-compose.yml` のローカルDB向け `DATABASE_URL` を一時指定して生成した。また、Prisma バイナリ取得時にローカル証明書エラーが発生したため、生成プロセス内のみ `NODE_TLS_REJECT_UNAUTHORIZED=0` を指定した。
