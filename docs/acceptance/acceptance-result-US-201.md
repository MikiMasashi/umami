# US-201 受入条件 検証結果（外部受入検証）

## 検証環境

- 対象: umami（Next.js + Prisma / PostgreSQL）
- baseUrl: `http://localhost:3000`
- 実施日時: 2026-08-13 12:20〜12:25 (JST) ごろ
- ブラウザ: Playwright MCP（Chromium, headless）
- 検証者: 受入検証者（開発チーム外部の第三者）
- 事前状態: ハーネスにより Next.js dev サーバー（`next dev --turbo`, PID 17568/25748）および PostgreSQL（複数プロセス）が起動済みと通知されていた

## 重大な環境上の問題（全体に影響）

検証開始直後、アプリのほぼ全ての DB 依存機能（ログイン・ウェブサイト一覧・設定画面・API）が
**500 Internal Server Error** を返すことを確認した。

- `POST /api/auth/login` → 500、レスポンスボディに以下のサーバーエラーが含まれる:
  ```json
  {"err":{"name":"Error","source":"server","message":"DATABASE_URL is not set.",
   "stack":"Error: DATABASE_URL is not set.\n    at getClient (...chunks\\[root-of-the-server]__0hta884._.js:2774:15)..."}}
  ```
- `POST /api/auth/verify` → 500（/websites 表示時にコンソールに記録）
- `GET /api/config` → 500（/websites 表示時にコンソールに記録）
- 20秒待機後、複数回リトライしたが症状は変わらず（一過性の障害ではない）
- `DATABASE_URL` はプロセス/ユーザー/マシンいずれの環境変数スコープにも見当たらず、リポジトリ直下に `.env` 系ファイルも存在しなかった

このため、**ログインを要するすべての UI/API 操作による確認が不可能**であり、AC-2〜AC-6 および
AC-7 の E2E 部分は `blocked` と判定した。指示に従い、実装コード（`src`）や設定を修正して
この問題を解消することはしていない（計測工程のため現状を記録するのみ）。

AC-1（永続化層とマイグレーションの静的確認）と、AC-7 のユニットテスト部分（`pnpm test`、DB 接続不要）
のみアプリのランタイム状態に依存せず検証できた。

## 判定表

| ID | 受入条件（要約） | 判定 | 期待 | 実際 |
|----|------------------|------|------|------|
| AC-1 | メモ項目の永続化層追加・マイグレーション存在・既存データ非破壊 | **satisfied** | Website モデルに nullable な notes カラムがあり、対応マイグレーションが存在 | `prisma/schema.prisma:70` に `notes String? @db.VarChar(500)`。`prisma/migrations/21_add_website_notes/migration.sql` に `ALTER TABLE "website" ADD COLUMN "notes" VARCHAR(500);`（NOT NULL/DEFAULT 指定なしのため既存行は NULL のまま安全に追加される） |
| AC-2 | 設定画面でメモ入力・保存・再読込後も表示 | **blocked** | ログイン後、設定画面でメモ保存→再読込で値が残る | ログインAPIが500エラー（DATABASE_URL is not set）で認証できず、画面に到達不能 |
| AC-3 | 更新APIがメモを受付・レスポンスに反映、他項目と共存 | **blocked** | 認証済みPOSTでnotes等が保存されレスポンスに含まれる | 認証不能のためAPIを実機で叩けず。ソースは読んだが判定根拠にしていない |
| AC-4 | 500字超は400系エラー・500字ちょうどは保存可 | **blocked** | 501字→400系、500字→保存成功 | ログイン不能のため設定画面操作・API呼び出しとも実施不可 |
| AC-5 | 一覧でメモ確認・未設定は非表示（null/undefined出ない） | **blocked** | 一覧のNotes列に値、未設定は空欄 | `/websites` 表示時に `/api/auth/verify`, `/api/config` が500となり一覧テーブル自体が表示されなかった |
| AC-6 | 権限なしユーザーはメモ更新不可（401/403相当） | **blocked** | 権限なしでの更新試行が401/403相当 | ログイン自体が不能なため権限比較検証が実施できなかった |
| AC-7 | 既存ユニットテスト・E2Eが引き続き合格 | **blocked**（ユニット部分のみ確認: 合格） | `pnpm test` と E2E がすべて合格 | `pnpm test`: Test Files 22 passed / Tests 102 passed（合格）。E2E相当の実機確認はアプリのDB接続不可のため実施不能。AC-7全体としては未確定のため保守的に blocked とした |

## not-satisfied / blocked の再現手順と観測内容

### AC-2〜AC-6（共通の阻害要因）

1. `http://localhost:3000/login` を開く
2. ユーザー名 `admin` / パスワード `umami` を入力し「Login」を押す
3. **観測**: 画面にエラーメッセージ「Unexpected token '<', "<!DOCTYPE "... is not valid JSON」が表示され、ログインに失敗
4. ブラウザのネットワークタブ相当（`browser_network_requests`）で確認すると:
   - `POST /api/auth/verify` → 500
   - `POST /api/auth/login` → 500
5. レスポンスボディ（`browser_network_request` で取得）に Next.js のエラーページ HTML が含まれ、
   埋め込まれた `__NEXT_DATA__` に `"message":"DATABASE_URL is not set."` というサーバー例外が記録されている
6. `http://localhost:3000/websites` に直接遷移しても、`/api/auth/verify` と `/api/config` が500を返し、
   ウェブサイト一覧テーブルは表示されずログイン画面相当の状態にとどまった
7. PowerShell から直接 `POST /api/auth/login` を叩いても同じ500エラー・同じメッセージを再現。
   20秒待機後の再試行でも症状は変わらなかった

この状態では AC-2（設定画面操作）、AC-3・AC-4（API操作、認証必須）、AC-5（一覧表示）、
AC-6（権限比較）のいずれも実機で確認する手段がなく、すべて `blocked` とした。

### AC-7（E2E部分）

- `pnpm test`（Vitest によるユニットテスト）は実行できた（DBに依存しないモック中心の構成のため）。
  結果: `Test Files 22 passed (22)` / `Tests 102 passed (102)`（全合格、デグレなし）。
  - 実行したコマンド: `pnpm test`（読み取り専用の実行、コード変更なし）
- `tests/e2e/website.spec.ts` 等の E2E は、本タスクの制約により `npx playwright test` 等の
  テストランナーを使わず実機確認する方針だが、上記の DB 接続不可によりログイン自体ができず、
  実機でのシナリオ確認が一切できなかった。よって AC-7 は「ユニットテストは合格を確認できたが、
  E2E相当の実機確認は未完了」として、保守的に全体を `blocked` と判定した。

## 判定に迷った点・保守的に倒した理由

- AC-1 はソースコード（`prisma/schema.prisma`, `prisma/migrations/`）の静的確認のみで、
  アプリのランタイム動作（実際のマイグレーション適用結果）は未確認だが、受入条件の文面が
  「永続化層に追加され、マイグレーションが存在する」という静的事実を求めているため `satisfied` とした。
- AC-3 はソースコード（`src/app/api/websites/[websiteId]/route.ts`）を一読すると notes を
  受け付けてレスポンスに含める実装が存在するように見えたが、指示により実装コードの内容を
  判定根拠にはできない（実機確認が必須）ため `blocked` とした。
- AC-7 は「ユニットテストは合格したので部分的に satisfied では」とも考えたが、AC-7 の文言は
  ユニットテストと E2E の両方が合格することを求めており、E2E 部分を確認できていない以上、
  条件全体を満たしたとは言えないため保守的に `blocked` とした。
- 参考: 過去の同一環境での検証（git履歴 `docs/acceptance/acceptance-result-US-201.json`）でも
  同じ `DATABASE_URL is not set` による全面的な `blocked` が記録されており、今回観測した障害は
  一過性のものではなく、この検証環境に共通する既知の問題である可能性が高い。
