# US-201 受入条件検証結果

## 検証環境

- 対象: umami（Next.js + Prisma / PostgreSQL）
- baseURL: `http://localhost:3000`
- 実施日時: 2026-08-13（JST）
- ブラウザ操作: Playwright MCP（`browser_navigate` / `browser_type` / `browser_click` / `browser_snapshot` / `browser_evaluate` / `browser_network_requests`）
- 補助確認: `curl` によるAPI直叩き（画面操作で確認できない部分の裏取りのみ）、`pnpm test`（ユニットテスト、AC-7 用）
- ログイン試行アカウント: `admin` / `umami`（DB内に存在確認済み: `docker exec ... psql ... select username from public.user` で `admin`, `playwright1` を確認）

## 重要な環境事象（すべてのブロック判定の根本原因）

検証開始時に `http://localhost:3000` 自体は 200 応答（疎通OK）だったが、**ログイン機能自体がサーバー内部エラーで機能していない**ことを実機操作で確認した。

- ブラウザで `/login` から `admin` / `umami` でログイン操作 → 赤字で
  `Failed to execute 'json' on 'Response': Unexpected end of JSON input` と表示され、ログイン失敗。
- `curl -X POST http://localhost:3000/api/auth/login -d '{"username":"admin","password":"umami"}'` は
  **3回連続で `HTTP 500`**。
- サーバーログ `.next/dev/logs/next-development.log` に以下のエラーを確認:
  ```
  PrismaClientKnownRequestError: ... findUnique() ...
  Authentication failed against the database server, the provided database credentials for `username` are not valid
  ```
- 原因調査: リポジトリ直下の `.env` を確認したところ
  `DATABASE_URL=postgresql://username:mypassword@localhost:5432/mydb` という**未設定のプレースホルダ文字列のまま**であった。
  一方 `docker-compose.yml` が期待する接続先は `postgresql://umami:umami@db:5432/umami`（Docker内部ネットワーク）であり、
  この2つは整合していない。またこのプロジェクト用の DB コンテナ `umami-db-1` は停止済み（`docker ps -a` で `Exited (0)`）。
  ポート `5432` は別の（本プロジェクトと無関係な）ローカル PostgreSQL が listen しており、`mydb` というDBも存在しない。
- この問題はメモ機能の実装（本ストーリーの対象コード）とは無関係な、**検証環境（.env / DBコンテナ）側の設定不備**であると判断した。
  受入検証の制約上、`.env` や設定・依存関係の変更は禁止されているため、修正は行わず「ブロック」として記録した。

この結果、ログインを前提とする AC-2〜AC-6、および AC-7 の E2E 部分は実機で確認する手段がなく `blocked` とした。
AC-1（永続化層の静的確認）と AC-7 のユニットテスト部分（`pnpm test` は実行可能）のみ確認できた。

## 判定表

| ID | 受入条件（要約） | verdict | 期待 | 実際 |
|----|------------------|---------|------|------|
| AC-1 | Website にメモ項目 + マイグレーション存在、既存データ非破壊 | **satisfied** | notes フィールドとマイグレーションファイルが存在し、nullable で既存行を壊さない | `schema.prisma:70` に `notes String? @db.VarChar(500)`、`prisma/migrations/21_add_website_notes/migration.sql` に `ALTER TABLE "website" ADD COLUMN "notes" VARCHAR(500);`（NOT NULL/DEFAULT無し＝既存行はNULLになり非破壊）を確認 |
| AC-2 | 設定画面でメモ入力・保存・再読込後も表示 | **blocked** | ログイン後、設定画面でメモを保存・再読込確認 | ログインが 500 エラーで失敗し設定画面に到達不可 |
| AC-3 | 更新API がメモを受け付け、他項目と共存 | **blocked** | 認証済みで POST /api/websites/[websiteId] を叩き応答確認 | ログイン不能のため有効な認証トークンを取得できず未確認 |
| AC-4 | 500文字超は保存不可(400系)、500文字ちょうどは保存可 | **blocked** | メモ欄に501/500文字を入力し挙動確認 | ログイン不能のため設定画面のメモ欄に到達不可 |
| AC-5 | 一覧でメモ確認可、未設定は null/undefined 非表示 | **blocked** | /websites 一覧のメモ列表示を確認 | ログイン不能のため一覧画面に認証済みで到達不可 |
| AC-6 | 権限のないユーザーはメモ更新不可(401/403) | **blocked** | 非admin ユーザーでの更新試行結果を確認 | admin ですらログイン不能なため非admin検証にも到達不可 |
| AC-7 | 既存ユニットテスト・E2E がデグレなく合格 | **blocked** | pnpm test と E2E 相当操作がともに成功 | `pnpm test` は 22ファイル/102件すべて成功（デグレなし）。ただし E2E 相当の実機操作（ログイン→操作）はログイン500エラーのため未確認。AC全体としては未充足部分が残るため blocked |

## not-satisfied / blocked の再現手順と証跡

### AC-2〜AC-6（共通原因: ログイン不可）

再現手順:
1. `http://localhost:3000/login` を開く。
2. Username に `admin`、Password に `umami` を入力し「Login」ボタンを押す。
3. 画面に赤字で `Failed to execute 'json' on 'Response': Unexpected end of JSON input` と表示され、ログイン画面から遷移しない。
4. ネットワークタブ相当（`browser_network_requests`）で確認すると `POST /api/auth/login` が `500 Internal Server Error`。
5. 同じリクエストを `curl` で直接送っても同様に 500（3回連続で再現、偶発的なものではない）:
   ```
   curl.exe -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"umami\"}" -w "STATUS:%{http_code}"
   => STATUS:500 （3回とも）
   ```
6. サーバーログ `.next/dev/logs/next-development.log` の該当エラー:
   ```
   PrismaClientKnownRequestError: ... Authentication failed against the database server,
   the provided database credentials for `username` are not valid
   ```
7. 根本原因の切り分け: `.env` の中身を確認すると
   `DATABASE_URL=postgresql://username:mypassword@localhost:5432/mydb`（テンプレートのプレースホルダそのまま）。
   `docker-compose.yml` の想定接続先は `umami:umami@db:5432/umami` であり不一致。
   また `docker ps -a` で本プロジェクトの DB コンテナ `umami-db-1` が `Exited (0)`（停止済み）であることを確認。
   ポート 5432 で listen している別の PostgreSQL には `mydb` という DB が存在しない
   （`psql -h localhost -p 5432 -U postgres -l` で確認、存在するのは `postgres` / `template0` / `template1` / `umami_e2e` のみ）。

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
  `pnpm test:e2e`（開発チームのE2Eランナー）の実行結果を根拠に判定することは
  本検証の制約上禁止されているため、これも実施していない。
- ユニットテスト分は合格を確認できたが、E2E 分は実機確認に到達できなかったため、
  AC-7 全体としては保守的に `blocked` と判定した。

## 判定に迷った点・保守的に倒した理由

- **AC-1**: 受入条件は「メモ保持項目の追加」「マイグレーション存在」「既存データ非破壊」の3点。
  最後の「既存データ非破壊」は本来 `pnpm update-db` の実行で確認する想定だったが、
  DB接続不良のため `pnpm exec prisma migrate status` も同じ 500 エラーで失敗し、実行による確認はできなかった。
  ただし、当該マイグレーション (`ALTER TABLE "website" ADD COLUMN "notes" VARCHAR(500);`) は
  `NOT NULL` 制約も `DEFAULT` 句も持たない単純な列追加であり、PostgreSQL の仕様上
  既存行には自動的に `NULL` が設定され、既存データが失われることはない。これは実行結果を待たずとも
  SQL文そのものから一意に確定できる静的事実であるため、`satisfied` と判定した。
- **AC-7**: ユニットテストは合格したが E2E 相当の実機確認ができなかったため、
  「1つのACを複数観点に分解しない」というルールに従い、部分的な成功をもって `satisfied` とはせず、
  全体として `blocked` とした（ユニットテスト結果は `actual` に明記し、部分的な確認内容が消えないようにした）。
- **AC-2〜AC-6**: いずれもログインが前提となる受入条件であり、ログイン自体が環境側のDB設定不備で
  完全に機能していないことを実機で確認した。推測で `satisfied`/`not-satisfied` と判定せず、
  到達できなかった事実をそのまま `blocked` として記録した。
- 本検証では `src` / `prisma` / 設定ファイルを変更しての問題切り分けは行っていない（読み取りのみ）。
  `.env` の内容や `docker-compose.yml` との不一致は原因特定のための観測結果であり、修正は行っていない。
