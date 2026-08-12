# US-201 受入条件 検証結果（受入検証者による実機確認）

## 検証環境

- 対象: umami（プロジェクトフォルダ: `umami-sample-proposed-copilot-21`）
- baseUrl: `http://localhost:3000`
- 実施日時: 2026-08-13 01:20〜01:30 JST（Asia/Tokyo）
- 想定ブラウザ操作手段: Playwright MCP（`@playwright/mcp@0.0.79`, headless Chromium, `harness/mcp/playwright.json` で定義）
- ヘルスチェック: `GET /api/heartbeat` → `200 {"ok":true}`（アプリプロセス自体は起動している）

## 検証にあたって発生した環境上の重大な制約（両方とも記録として残す）

### 1. Playwright MCP ツールが本セッションでは利用不可だった

`harness/mcp/playwright.json` に Playwright MCP サーバーの定義は存在し、起動オプション
（`--browser chromium --headless --isolated`）も指定されていたが、本セッションに実際に
公開された関数呼び出し可能なツール一覧には `mcp__playwright__*` 系のツールが一つも
含まれていなかった。試験的に `mcp__playwright__browser_navigate` を呼び出したところ、
以下のエラーが返された。

```
Tool 'mcp__playwright__browser_navigate' does not exist. Available tools that can be called are
powershell, read_powershell, stop_powershell, list_powershell, view, create, edit, web_fetch,
fetch_copilot_cli_documentation, skill, sql, session_store_sql, read_agent, list_agents,
write_agent, grep, glob, task, github-mcp-server-*, web_search.
```

`@playwright/mcp@0.0.79` パッケージ自体は `npx` 経由で取得可能であることを確認したが、
MCP サーバーとして本セッションのツール一覧に接続された形跡（対応する `node`/`cmd` の
子プロセス起動）は見当たらなかった。この制約により、指示された「ブラウザで実際に操作
して確認する」という手段そのものが実行不能だった。

### 2. アプリのデータベース接続が未設定（`DATABASE_URL is not set.`）

ログイン以降の全ての DB アクセスを伴う API 呼び出しで HTTP 500 が発生し、レスポンス
本文に以下のサーバーエラーが含まれていた。

```
Error: DATABASE_URL is not set.
    at getClient (...\.next\dev\server\chunks\[root-of-the-server]__08g0~3p._.js:2764:15)
```

調査の結果:
- リポジトリルートに `.env` / `.env.local` は存在しない（`Test-Path` で確認）。
- `package.json` の `dev` スクリプトは `dotenv next dev --turbo` であり、`.env` が
  無い場合は `DATABASE_URL` が未設定のまま Next.js サーバーが起動する。
- `harness/project.json` の `verify.setup` には
  `docker compose -f docker-compose.dev.yml up -d --wait` が定義されているが、
  リポジトリ内に `docker-compose.dev.yml` は存在しない。
- ポート `5432` は Windows サービス `postgresql-x64-16` が LISTEN しており、
  DB エンジン自体は稼働しているが、Next.js サーバー側の環境変数には接続文字列が
  渡っていない状態だった。
- `POST /api/auth/login`（admin/umami）、`POST /api/websites/{id}`（未認証含む）の
  いずれも同一のサーバーエラーで 500 になることを確認した。

この状態では **ログインを含む一切の DB アクセスを伴う画面・API 操作が実行不能**であり、
ブラウザでの実機確認（AC-2〜AC-6、AC-7 の E2E 部分）に到達できなかった。
この問題は実装コード（`src` / `prisma`）ではなく、検証環境（ハーネスの起動設定）側の
問題であり、本検証者の権限（`docs/acceptance` 配下のみ書き込み可）では修正できないため、
`blocked` として記録し、実装側の欠陥とは区別する。

## 判定表

| ID | 受入条件（要約） | verdict | 期待 | 実際 |
|----|------------------|---------|------|------|
| AC-1 | メモ項目の永続化層追加＋マイグレーション | **satisfied** | notes カラム追加、NULL許容、マイグレーション存在 | `schema.prisma` に `notes String? @db.VarChar(500)`。`prisma/migrations/21_add_website_notes/migration.sql` に `ALTER TABLE "website" ADD COLUMN "notes" VARCHAR(500);` を確認 |
| AC-2 | 設定画面でメモ入力・保存・再読み込み後も表示 | **blocked** | 保存後リロードで値が保持される | ログインAPIが `DATABASE_URL is not set.` で 500。画面に到達不能 |
| AC-3 | 更新APIがメモを受付け、他項目と共存 | **blocked** | notes/name/domain が正しく保存・応答される | 未認証でも同一の 500 エラー。処理本体に到達不能 |
| AC-4 | 500文字超は400系エラー、500文字ちょうどは保存可 | **blocked** | 文字数境界での挙動確認 | ログイン不能により画面/APIともに到達不能 |
| AC-5 | 一覧でメモ表示、未設定は非表示（null等が出ない） | **blocked** | 一覧画面表示内容の確認 | ログイン不能により一覧画面に到達不能 |
| AC-6 | 権限のないユーザーはメモ更新不可（401/403） | **blocked** | 権限外ユーザーで401/403 | ログイン自体が不能。未認証リクエストも 401/403 ではなく 500（DB未接続）が先に発生し切り分け不能 |
| AC-7 | 既存ユニットテスト・E2Eの継続合格 | **blocked** | ユニット・E2E ともにデグレなし | `pnpm test` 実行 → **22 test files / 102 tests すべて合格**。E2E相当のブラウザ確認はPlaywright MCPツール未提供＋ログイン不能のため実施不能。ユニット部分のみ確認できたため全体は blocked |

## not-satisfied / blocked の再現手順と観測内容

### AC-2 / AC-3 / AC-4 / AC-5 / AC-6（共通原因: ログイン不能）

再現手順:
1. `http://localhost:3000/login` を開く（画面自体は 200 で表示される）。
2. ユーザー名 `admin` / パスワード `umami` でログイン送信、または
   `POST http://localhost:3000/api/auth/login` に `{"username":"admin","password":"umami"}` を送信。
3. HTTP 500 が返り、本文に `"message":"DATABASE_URL is not set."` を含むエラーページ
   JSON が返される。

観測した実際の文言（抜粋）:
```
{"props":{"pageProps":{"statusCode":500,"hostname":"localhost"}},"page":"/_error",
 "query":{},"buildId":"development","isFallback":false,
 "err":{"name":"Error","source":"server","message":"DATABASE_URL is not set.", ...}}
```

同様に `POST /api/websites/00000000-0000-0000-0000-000000000000`（未認証・ダミーID）
を送信した場合も同一のサーバーエラーが発生することを確認した（AC-3, AC-6 について
認可より先にDB接続エラーが発生するため、認可レイヤーの挙動を切り分けて確認できない）。

このため AC-2, AC-3, AC-4, AC-5, AC-6 はいずれも実機のブラウザ操作で到達不能であり、
`satisfied` とも `not-satisfied` とも判定できず `blocked` とした。

### AC-7（部分的にのみ確認）

再現手順:
1. リポジトリルートで `pnpm test` を実行。
2. 結果: `Test Files  22 passed (22)` / `Tests  102 passed (102)`（vitest, 所要 約37秒）。
   `src/tests/website-notes-route.test.ts`、`src/tests/website-create-notes-route.test.ts`、
   `src/component-tests/WebsiteSettingsPage.test.tsx` 等、メモ機能関連のユニット/
   コンポーネントテストも含めて全合格。
3. `tests/e2e/website.spec.ts` 等の E2E をブラウザで実機確認しようとしたが、
   Playwright MCP のツールが本セッションに公開されておらず（上記「環境上の重大な制約 1」）、
   また DATABASE_URL 未設定によりログインができない（上記「環境上の重大な制約 2」）ため、
   実施不能だった。開発チームの `npx playwright test` 実行結果を代替根拠として採用する
   ことは本検証の方針上禁止されているため、それによる代替確認も行っていない。

以上より、ユニットテスト部分は良好な結果を確認できたが、AC-7 が要求する E2E 部分を
実機で確認できなかったため、AC-7 全体としては `blocked` とした。

## 判定に迷った点・保守的に倒した理由

- AC-6 は「未認証/権限外リクエストが 401/403 相当を返すか」を問うが、実際に観測した
  のは 500（DB未接続起因）だった。500 は 401/403 の代わりにはならないため、
  `satisfied` にも `not-satisfied`（明確に仕様と異なる恒常的な挙動と断定できるか
  不明）にもせず、環境要因により判定不能な `blocked` とした。
- AC-1 のみ、ライブアプリへの到達を必要としない静的検証（`schema.prisma` と
  マイグレーションファイルの内容確認）で完結する受入条件であったため、上記の
  環境障害の影響を受けず `satisfied` と判定できた。
- AC-7 について、ユニットテスト結果は明確に良好（102/102 合格）だが、E2E 部分が
  未確認であるため、AC 全体を安易に `satisfied` とはせず `blocked` とした
  （条件文が unit と e2e の両方を要求しているため）。
