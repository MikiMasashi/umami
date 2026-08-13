# US-201 受入条件検証結果

## 検証環境

- baseUrl: `http://localhost:3000`
- 実施日時: 2026-08-13 (JST) 11:39〜11:45頃
- ブラウザ: Playwright MCP (Chrome for Testing, chromium-1237)
- 検証者: acceptance-verifier（開発チーム外の第三者検証者）
- 検証方法: Playwright MCP によるブラウザ操作を中心に、画面到達不可のケースのみ PowerShell 経由での直接 HTTP リクエストで補助確認。`pnpm test` はユニットテスト（AC-7 該当部分）のみ実行。`pnpm test:e2e` 等の E2E テストランナーは実行していない。

### 環境上の重大な制約（判定に影響）

検証開始時、アプリの `/` は HTTP 200 で疎通が確認できたが、ログイン（`POST /api/auth/login`）を含む DB に依存する全ての操作が **HTTP 500** で失敗した。レスポンスボディに含まれるエラーは以下の通り:

```
"message":"DATABASE_URL is not set."
"stack":"Error: DATABASE_URL is not set.\n    at getClient ..."
```

`docker ps` で確認したところ、PostgreSQL コンテナ（ポート5433）は稼働中だが、アプリのプロセス（node.exe, PID 2460, ポート3000で待受）には `DATABASE_URL` が設定されていない模様。本検証はアプリ・設定・依存関係を変更しない制約のもと実施しているため、この環境問題を修正せず、**ログインおよびDBを要する全ての受入条件は `blocked`** として記録した。

## AC別判定表

| ID | 受入条件（要約） | 判定 | 期待 | 実際 |
|----|------------------|------|------|------|
| AC-1 | メモ項目の永続化層追加・マイグレーション存在 | **satisfied** | Website モデルにメモ用カラムがあり、対応マイグレーションが存在。既存データを壊さない | `schema.prisma` に `notes String? @db.VarChar(500)` を確認。`prisma/migrations/21_add_website_notes/migration.sql` に `ALTER TABLE "website" ADD COLUMN "notes" VARCHAR(500);` を確認。NOT NULL/DEFAULT指定なしのため既存レコードはNULLで移行可能 |
| AC-2 | 設定詳細画面でメモ入力・保存・再読み込み後も表示 | **blocked** | ログイン後、メモ入力→保存→再読み込みでメモが表示される | ログイン自体が500エラーで失敗し画面に到達できず |
| AC-3 | 更新API がメモを受け付け、他項目と共存 | **blocked** | notes と name/domain 等を同時更新してもレスポンスに正しく反映 | 未認証でのAPI直接呼び出しも500（DATABASE_URL未設定）で、正常系の挙動を確認できず |
| AC-4 | 500文字超は400系エラー、500文字ちょうどはOK | **blocked** | 501文字→400系＋UIエラー表示、500文字→保存成功 | ログイン不可のため設定画面・API双方で文字数境界の検証に到達できず |
| AC-5 | 一覧でメモ表示、未設定は空欄 | **blocked** | 一覧画面でメモ表示、未設定行は空欄（null/undefined等が出ない） | ログイン不可のため一覧画面自体を開けず |
| AC-6 | 権限のないユーザーはメモ更新不可（401/403相当） | **blocked** | 権限なしユーザー/未認証は401/403相当のエラー | 未認証でのAPI呼び出しは401/403ではなく500（DATABASE_URL未設定）。認可ロジック自体に到達しているか判別不能。ログイン不可のため権限差分の比較検証も不可 |
| AC-7 | 既存ユニットテスト・E2Eが引き続き合格（デグレなし） | **blocked** | `pnpm test` と E2Eシナリオ（実機操作）の両方が合格 | `pnpm test` は 22ファイル / 102テストすべて合格（デグレなし、notes関連テスト含む）。ただしE2E相当のシナリオはログイン500エラーによりPlaywright MCPでの実機確認に到達できず、AC全体としては未確認部分が残るため blocked |

## 再現手順（blocked / not-satisfied の詳細）

### AC-2〜AC-5共通：ログイン不可

1. `http://localhost:3000/login` を開く。
2. Username に `admin`、Password に `umami` を入力し Enter で送信。
3. 画面上に `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` が表示される。
4. ネットワークタブ相当（`browser_network_requests`）で `POST /api/auth/login` が `500` であることを確認。
5. レスポンスボディ（`browser_network_request` index対応 / PowerShellでの直接POSTでも再現）に `"message":"DATABASE_URL is not set."` を確認。

再現コマンド例（PowerShell、参考）:
```powershell
Invoke-WebRequest -Uri http://localhost:3000/api/auth/login -Method POST `
  -Body (@{username='admin';password='umami'} | ConvertTo-Json) `
  -ContentType 'application/json' -UseBasicParsing
```
→ 500、body に `DATABASE_URL is not set.`

### AC-3・AC-6：未認証での更新API直接呼び出し

```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/websites/00000000-0000-0000-0000-000000000000" `
  -Method POST -Body (@{notes='test'} | ConvertTo-Json) `
  -ContentType 'application/json' -UseBasicParsing
```
→ 500、body に `DATABASE_URL is not set.`（401/403ではない。認可判定に到達する前にDB接続でエラーになっている可能性がある）

### AC-7：ユニットテスト実行結果（参考、E2E部分は未確認）

```
$ pnpm test
 Test Files  22 passed (22)
      Tests  102 passed (102)
```
notes関連テスト（`src/tests/website-notes-route.test.ts`, `src/tests/website-create-notes-route.test.ts`, `src/component-tests/WebsiteSettingsPage.test.tsx`, `src/component-tests/WebsitesSettingsPage.test.tsx` 等）も含め全て合格。E2E（`tests/e2e/website.spec.ts`）については、開発チームのテストランナーではなく実機操作で確認する方針のためテストランナーは実行しておらず、ログイン不能により実機確認もできなかった。

## 判定に迷った点・保守的に倒した理由

- AC-7 はユニットテスト部分（`pnpm test`）は明確に合格を確認できたが、E2E部分（実機操作でのシナリオ確認）が環境要因で完全にブロックされたため、AC全体としては「一部確認できたが全部は確認できていない」状態。中間的な判定は存在しないため、未確認要素が残ることを重視し保守的に `blocked` とした（`satisfied` にはしていない）。
- AC-6 について、未認証呼び出しが 500 を返したことは事実として記録したが、これが「認可判定前のDB接続エラー」なのか「認可判定後にDB接続を試みてエラーになった」のか、ログの詳細だけでは判別できなかったため、401/403相当の挙動が実装されているかどうかは確認できなかったとして `blocked` とした（`not-satisfied` と断定はしていない）。
- 疎通確認（`/` への GET）が200だったことと、実際のDB依存機能が全滅している状態は矛盾するように見えるが、静的アセット配信とAPI/SSRのDB接続は別経路であるため両立しうる。この点はそのまま事実として記録し、推測で `satisfied` 側に倒すことはしなかった。
