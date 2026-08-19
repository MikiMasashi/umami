# US-201 E2E 実行結果: ウェブサイトメモ

## 実行概要

| 項目 | 内容 |
| --- | --- |
| 実行日時 | 2026-08-20 00:20 JST |
| 対象 | `tests\e2e\website-notes.spec.ts` |
| 実行コマンド | `$env:PLAYWRIGHT_SKIP_WEB_SERVER='1'; pnpm exec playwright test website-notes.spec.ts --reporter=list` |
| 実行環境 | Chromium / Playwright, Next.js dev server, PostgreSQL 15 (`docker-compose.yml` の `db`) |
| DB 準備 | `pnpm run update-db`, `pnpm run seed-data` |
| 最終結果 | 4 件中 4 件 Pass / 0 件 Fail |

## テスト結果

| シナリオ ID | テスト名 | 結果 | 備考 |
| --- | --- | --- | --- |
| E2E-201-01 | saves notes, reloads them, and shows them in the websites list | Pass | notes 未設定 Website を `notes: null` で用意し、保存・再読み込み後の再表示・一覧表示を確認。 |
| E2E-201-02 | clears notes and hides them from the websites list | Pass | notes を空保存後、API 上は `null`、一覧上は旧 notes 非表示。 |
| E2E-201-03 | rejects notes longer than 500 characters and preserves existing notes | Pass | 501 文字入力時に Save ボタンが disabled になり、API 直接更新は 400、既存 notes 維持を確認。 |
| E2E-201-04 | rejects notes changes from team view-only users | Pass | view-only ユーザーの notes 更新は 401 で拒否され、既存 notes は維持された。 |

## 受入条件ごとの合否

| 受入条件 | 内容 | 対応シナリオ | 判定 | 根拠 |
| --- | --- | --- | --- | --- |
| AC-201-01 | 編集画面でメモを保存できる | E2E-201-01 | Pass | notes 未設定 Website の編集画面で notes を入力し、保存成功を確認。 |
| AC-201-02 | 保存したメモは再読み込み後も残る | E2E-201-01 | Pass | 保存後に編集画面を再読み込みし、notes 入力欄の値が維持されることを確認。 |
| AC-201-03 | ウェブサイト一覧でメモを確認できる | E2E-201-01 | Pass | Settings → Websites の対象行に保存済み notes が表示されることを確認。 |
| AC-201-04 | メモ未入力のサイトでは一覧にメモを表示しない | E2E-201-02 | Pass | notes 空保存後、一覧行に `website-notes` が存在せず旧 notes も表示されない。 |
| AC-201-05 | 500 文字を超えるメモは保存できない | E2E-201-03 | Pass | 501 文字入力時に Save が disabled になり、API 直接更新も 400 で拒否され、既存 notes が維持されることを確認。 |
| AC-201-06 | 既存ウェブサイトはメモ未設定でも従来どおり動作する | E2E-201-01 | Pass | notes 未設定 Website の設定フォーム表示、保存、再読み込みを確認。 |
| AC-201-07 | 権限のないユーザーはメモを変更できない | E2E-201-04 | Pass | view-only ユーザーの更新 API が 401 になり、管理者取得で既存 notes 維持を確認。 |
| AC-201-08 | 空のメモを保存できる | E2E-201-02 | Pass | notes を空にして保存でき、API 上 `null` として保持された。 |

## 検出した欠陥

| ID | 重要度 | 内容 | 影響する受入条件 | 証跡 |
| --- | --- | --- | --- | --- |
| なし | - | 検出した欠陥はありません。 | - | `$env:PLAYWRIGHT_SKIP_WEB_SERVER='1'; pnpm exec playwright test website-notes.spec.ts --reporter=list`: 4 passed |

## 補足

ローカルDB向け `DATABASE_URL` と `APP_SECRET` を指定して Next.js dev server を起動し、`PLAYWRIGHT_SKIP_WEB_SERVER=1` で起動済みサーバーに対して再実行した。最終実行は 4 件すべて Pass。
