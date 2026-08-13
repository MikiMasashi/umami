# US-201 受入条件検証結果

## 検証環境

- 対象: umami（Next.js + Prisma / PostgreSQL）
- baseURL: `http://localhost:3000`
- 実施日時: 2026-08-13 16:20〜16:28（JST）
- ブラウザ操作: Playwright MCP（`browser_navigate` / `browser_fill_form` / `browser_click` / `browser_snapshot` / `browser_evaluate` / `browser_network_requests`）
- 補助確認: PowerShell の `Invoke-WebRequest` / `psql` によるDB・API直叩き（画面操作で確認できない部分の裏取りのみ）、`pnpm test`（AC-7 のユニットテスト部分の合否確認。AC-7 の受入条件そのものが「pnpm test の合否」を指すため実行した。E2E（`playwright test`）は使用していない）
- ログイン試行アカウント: `admin` / `umami`（`harness/project.json` の verify.notes 記載の既定アカウント）

## 重要な環境事象（すべてのブロック判定の根本原因）

`http://localhost:3000/api/heartbeat` は `200 {"ok":true}` を返し Next.js サーバー自体は起動しているが、
**ログイン機能（`POST /api/auth/login`）がサーバー内部エラー（500）で機能していない**ことを実機操作で確認した。

- ブラウザで `/login` を開き `admin` / `umami` を入力してログイン → 赤字で
  `Failed to execute 'json' on 'Response': Unexpected end of JSON input` と表示され、ログインできない。
- `browser_evaluate` で `fetch('/api/auth/login', {method:'POST', body: JSON.stringify({username:'admin',password:'umami'})})` を実行 → `status: 500`、レスポンスボディは空。PowerShellから3回連続で実行しても同様に全て500。
- 原因調査（読み取り専用の診断のみ、実装・設定は一切変更していない）:
  - `.env` は `DATABASE_URL=postgresql://umami:umami@localhost:5432/umami` を指している。
  - `pnpm run update-db`（= `prisma migrate deploy`）を実行すると
    `Error: P1000: Authentication failed against database server, the provided database credentials for umami are not valid.` で失敗。
  - `psql -h localhost -p 5432 -U postgres -d postgres -c "\du"` / `"\l"` で確認したところ、ポート5432で待受しているのは
    本プロジェクト用ではないネイティブの PostgreSQL 16（Windowsサービス `postgresql-x64-16`）であり、
    `umami` ロールも `umami` データベースも存在しない（存在するのは `postgres` / `template0` / `template1` / `umami_e2e` のみ）。
  - `harness/project.json` の `verify.setup` は `docker compose -f docker-compose.dev.yml up -d --wait` を含むが、
    このワークツリーに `docker-compose.dev.yml` は存在せず（`docker-compose.yml` のみ）、本プロジェクト用のDBコンテナは
    起動していない（`docker ps` では無関係な別サンプルのDBコンテナのみ稼働）。
- この問題はメモ機能の実装自体の欠陥ではなく、**検証環境のDB接続設定に起因するブロッカー**と判断した。
  実装・テストコード・設定・依存関係は変更していない（`docs/acceptance` 配下のみ変更）。

この結果、ログインを前提とする AC-2〜AC-6 の実機確認、および AC-7 の E2E 部分は到達できなかった。
AC-1（永続化層の静的確認）と AC-7 のユニットテスト部分（`pnpm test` は実行可能）のみ確認できた。

## 判定表

| ID | 受入条件（要約） | verdict | 期待 | 実際 |
|----|------------------|---------|------|------|
| AC-1 | Website にメモ項目 + マイグレーション存在、既存データ非破壊 | **satisfied** | notes フィールドとマイグレーションファイルが存在し、nullable で既存行を壊さない | `prisma/schema.prisma` に `notes String? @db.VarChar(500)`、`prisma/migrations/21_add_website_notes/migration.sql` に `ALTER TABLE "website" ADD COLUMN "notes" VARCHAR(500);`（NOT NULL/DEFAULT無し＝既存行はNULLになり非破壊）を確認。DB接続不可のため `pnpm update-db` の実行結果そのものは未確認 |
| AC-2 | 設定画面でメモ入力・保存・再読込後も表示 | **blocked** | ログイン後、設定画面でメモを保存・再読込確認 | ログインが 500 エラーで失敗し設定画面に到達不可 |
| AC-3 | 更新API がメモを受け付け、他項目と共存 | **blocked** | 認証済みで POST /api/websites/[websiteId] を叩き応答確認 | ログイン不能のため有効なセッションを確立できず未確認 |
| AC-4 | 500文字超は保存不可(400系)、500文字ちょうどは保存可 | **blocked** | メモ欄に501/500文字を入力し挙動確認 | ログイン不能のため設定画面のメモ欄に到達不可 |
| AC-5 | 一覧でメモ確認可、未設定は null/undefined 非表示 | **blocked** | /websites 一覧のメモ列表示を確認 | ログイン不能のため一覧画面に認証済みで到達不可 |
| AC-6 | 権限のないユーザーはメモ更新不可(401/403) | **blocked** | 非admin ユーザーでの更新試行結果を確認 | admin ですらログイン不能なため非admin検証にも到達不可 |
| AC-7 | 既存ユニットテスト・E2E がデグレなく合格 | **blocked** | pnpm test と E2E 相当操作がともに成功 | `pnpm test` は Test Files 22 passed(22) / Tests 102 passed(102) で全件成功（notes関連テスト含む）。ただし E2E 相当の実機操作（ログイン→操作）はログイン500エラーのため未確認のため、AC全体としては blocked |

## not-satisfied / blocked の再現手順と証跡

### AC-2〜AC-6（共通原因: ログイン不可）

再現手順:
1. `http://localhost:3000/login` を開く。
2. Username に `admin`、Password に `umami` を入力し「Login」ボタンを押す。
3. 画面に赤字で `Failed to execute 'json' on 'Response': Unexpected end of JSON input` と表示され、ログイン画面から遷移しない。
4. `browser_network_requests` で確認すると `POST /api/auth/login` が `500 Internal Server Error`。
5. 同じリクエストを `browser_evaluate` の `fetch` で直接送っても同様に500（3回連続で再現、偶発的なものではない）。
6. シェルで `pnpm run update-db` を実行すると根本原因が再現する:
   ```
   Error: P1000: Authentication failed against database server, the provided database
   credentials for `umami` are not valid.
   ```
7. `psql -h localhost -p 5432 -U postgres -d postgres -c "\du"` / `"\l"` で、`umami` ロール・
   `umami` データベースがいずれも存在しないことを確認（存在するのは `postgres` / `template0` /
   `template1` / `umami_e2e` のみ）。`harness/project.json` の `verify.setup` が期待する
   `docker-compose.dev.yml` もこのワークツリーには存在しない。

この結果、AC-2〜AC-6 はいずれも「ログインして初めて到達できる画面・APIの挙動」を対象とするため、
実機のブラウザ操作でこれ以上の確認に進めなかった。開発チームの E2E 実行結果（`docs/e2e/results` 等）は
本検証の根拠として採用していない。

### AC-7

- `pnpm test` を実行し、以下の結果を得た（実行ログ抜粋）:
  ```
  Test Files  22 passed (22)
       Tests  102 passed (102)
  ```
  この中には notes 機能に関連するテスト（`src/tests/website-notes-route.test.ts`,
  `src/tests/website-create-notes-route.test.ts`, `src/tests/format-summarize-notes.test.ts`,
  `src/component-tests/WebsiteSettingsPage.test.tsx`, `src/component-tests/WebsitesSettingsPage.test.tsx` 等）も含め、
  すべて成功した。
- 一方、`tests/e2e/website.spec.ts` 相当のシナリオ（ログイン→ウェブサイト操作）を、
  開発チームのテストランナーではなく実機のブラウザ操作で再現しようとしたが、
  AC-2〜AC-6 と同じログイン失敗（500エラー）により実行できなかった。
  `playwright test`（開発チームのE2Eランナー）の実行結果を根拠に判定することは
  本検証の制約上禁止されているため、これも実施していない。
- ユニットテスト分は合格を確認できたが、E2E 分は実機確認に到達できなかったため、
  AC-7 全体としては保守的に `blocked` と判定した。

## 判定に迷った点・保守的に倒した理由

- **AC-1**: 受入条件は「メモ保持項目の追加」「マイグレーション存在」「既存データ非破壊」の3点。
  最後の「既存データ非破壊」は本来 `pnpm update-db` の実行で確認する想定だったが、
  上記の環境要因（DB認証エラー）で実行不能だった。ただし、①`schema.prisma` に該当フィールドが
  存在すること、②マイグレーションファイルが `ADD COLUMN`（NOT NULL/DEFAULT無し）という
  非破壊的な形で存在することは静的に確認できたため、Postgres の標準的な `ALTER TABLE ADD COLUMN`
  の挙動（既存行は自動的にNULLになり、既存データは壊れない）を根拠に `satisfied` と判定した。
  これは推測ではなく、確認済みのSQL文が持つ確定的な挙動に基づく判断である。
  `update-db` を実際に実行した結果そのものは確認できていない旨をここに明記する。
- **AC-2〜AC-6**: ログインという共通の前提が成立しないため、推測で `satisfied`/`not-satisfied` にはせず、
  すべて `blocked` とした。
- **AC-7**: ユニットテスト（`pnpm test`）は AC-7 の受入条件文言そのものが名指ししているため実行し、
  結果を証跡として採用した（`playwright test` 等のE2Eランナーは本検証の制約上使用していない）。
  E2E相当の実機確認ができなかったため、AC-7 全体としては `blocked` とした（ユニットテストのみ
  合格しても「E2Eも引き続き合格する」という条件全体を満たしたとは断定できないため）。

## 変更ファイルの確認

`git status` は `docs/acceptance/acceptance-result-US-201.json` と
`docs/acceptance/acceptance-result-US-201.md` のみを新規/変更として報告しており、
実装・テスト・設定ファイルへの変更は行っていない。
